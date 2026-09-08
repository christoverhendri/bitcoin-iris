"""System-derived BTC research forecasts with purged evaluation and offline inference."""
import argparse
import hashlib
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import ExtraTreesRegressor, GradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from .system_diagnostics import DEFAULT_PRICES, load_close, diagnose

FEATURES = ['return_1d', 'return_7d', 'return_30d', 'vol_7d', 'vol_30d']
QUANTILES = np.array([.1, .5, .9])
VERSION = 'system-market-v1'


def source_venue(prices, explicit=None):
    """Bind labels to source identity; never silently mix vendor series at inference."""
    manifest = prices.parent / 'provenance.json'
    if manifest.exists():
        provenance = json.loads(manifest.read_text(encoding='utf-8'))
        if provenance.get('instrument') != 'BTC/USD' or provenance.get('data_sha256') != hashlib.sha256(prices.read_bytes()).hexdigest():
            raise ValueError('Price source manifest instrument/hash mismatch')
        venue = provenance.get('venue')
        if not isinstance(venue, str) or not venue.strip() or (explicit and explicit != venue):
            raise ValueError('Price source venue mismatch')
        return venue
    if explicit and explicit.strip():
        return explicit.strip()
    if prices.resolve() == DEFAULT_PRICES.resolve():
        return 'historical-yfinance-BTC-USD'
    raise ValueError('Custom prices require --venue or a verified sibling provenance.json')


def frame_from_close(close, horizon):
    if horizon not in (7, 30):
        raise ValueError('Supported horizons are 7 and 30 days')
    r = np.log(close).diff()
    frame = pd.DataFrame({'close': close})
    for lag in (1, 7, 30):
        frame[f'return_{lag}d'] = np.log(close / close.shift(lag))
    for window in (7, 30):
        frame[f'vol_{window}d'] = np.sqrt(r.pow(2).rolling(window).mean())
    frame['target_return'] = np.log(close.shift(-horizon) / close)
    frame['target_volatility'] = np.sqrt(sum(r.shift(-i).pow(2) for i in range(1, horizon + 1)) / horizon)
    frame['origin'] = frame.index + pd.Timedelta(days=1)
    frame['target_end'] = frame['origin'] + pd.Timedelta(days=horizon)
    return frame.dropna(subset=FEATURES)


def partitions(frame, test_start, horizon, validation_days=180):
    """Disjoint training, tuning, calibration and test; purge by label endpoints."""
    origin = frame['origin'].iloc[test_start]
    calibration_origin = origin - pd.Timedelta(days=validation_days // 2 + horizon)
    tuning_origin = calibration_origin - pd.Timedelta(days=validation_days // 2 + horizon)
    train = frame.index[frame['target_end'] < tuning_origin]
    tune = frame.index[(frame['origin'] >= tuning_origin) & (frame['target_end'] < calibration_origin)]
    calibrate = frame.index[(frame['origin'] >= calibration_origin) & (frame['target_end'] < origin)]
    if len(train) < 250 or min(len(tune), len(calibrate)) < 30:
        raise ValueError('Insufficient history for purged train/tune/calibration windows')
    return train, tune, calibrate


def estimator(family, strength, quantile=None):
    if family == 'ridge':
        return make_pipeline(StandardScaler(), Ridge(alpha=strength))
    if family == 'extra_trees':
        return ExtraTreesRegressor(n_estimators=80, max_depth=5,
                                   min_samples_leaf=strength, random_state=42, n_jobs=1)
    return GradientBoostingRegressor(loss='quantile', alpha=quantile,
                                    n_estimators=60, max_depth=2,
                                    min_samples_leaf=strength, random_state=42)


def pinball(y, q):
    error = np.asarray(y)[:, None] - q
    return np.maximum(QUANTILES * error, (QUANTILES - 1) * error).mean(axis=1)


def predict(model, x):
    if model['family'] == 'quantile_boosting':
        q = np.column_stack([m.predict(x) for m in model['models']])
    else:
        q = np.repeat(model['models'][0].predict(x)[:, None], 3, axis=1)
    # Rearrangement avoids crossing for all evaluation and inference paths.
    return np.sort(q + model['offsets'], axis=1)


def fit_candidate(frame, train, tune, calibrate, family):
    strengths = (1., 100.) if family == 'ridge' else (10, 30)
    best = None
    for strength in strengths:
        models = [estimator(family, strength, q) for q in QUANTILES] if family == 'quantile_boosting' else [estimator(family, strength)]
        for model in models:
            model.fit(frame.loc[train, FEATURES], frame.loc[train, 'target_return'])
        candidate = {'family': family, 'strength': strength, 'models': models, 'offsets': np.zeros(3)}
        q = predict(candidate, frame.loc[tune, FEATURES])
        # Point estimators use MAE for tuning; direct quantiles use pinball.
        score = float(pinball(frame.loc[tune, 'target_return'], q).mean()) if family == 'quantile_boosting' else float(np.abs(frame.loc[tune, 'target_return'] - q[:, 1]).mean())
        if best is None or score < best[0]:
            best = score, candidate
    model = best[1]
    q = predict(model, frame.loc[calibrate, FEATURES])
    residual = frame.loc[calibrate, 'target_return'].to_numpy()[:, None] - q
    model['offsets'] = np.array([np.quantile(residual[:, i], quantile) for i, quantile in enumerate(QUANTILES)])
    model['calibration_score'] = float(pinball(frame.loc[calibrate, 'target_return'], predict(model, frame.loc[calibrate, FEATURES])).mean())
    model['tuning_score'] = best[0]
    return model


def bootstrap_quantiles(close, dates, horizon, block=1, paths=1000):
    returns = np.log(close).diff().dropna()
    output = []
    for date in dates:
        history = returns.loc[:date].iloc[-365:].to_numpy()
        rng = np.random.default_rng(int(date.timestamp()) + block)
        starts = rng.integers(0, len(history), size=(paths, int(np.ceil(horizon / block))))
        indices = (starts[:, :, None] + np.arange(block)) % len(history)
        simulated = history[indices.reshape(paths, -1)[:, :horizon]].sum(axis=1)
        output.append(np.quantile(simulated, QUANTILES))
    return np.asarray(output)


def metrics(y, q):
    return {'mae': float(np.abs(y - q[:, 1]).mean()),
            'pinball': float(pinball(y, q).mean()),
            'coverage_80': float(((y >= q[:, 0]) & (y <= q[:, 2])).mean()),
            'mean_width': float((q[:, 2] - q[:, 0]).mean())}


def block_interval(values, block, seed=42):
    """Descriptive circular block-bootstrap mean interval; not automatic promotion."""
    values = np.asarray(values)
    rng = np.random.default_rng(seed)
    starts = rng.integers(0, len(values), size=(500, int(np.ceil(len(values) / block))))
    indices = (starts[:, :, None] + np.arange(block)) % len(values)
    means = values[indices.reshape(500, -1)[:, :len(values)]].mean(axis=1)
    return list(map(float, np.quantile(means, [.025, .975])))


def artifact(bundle, frame, prices, as_of):
    row = frame.iloc[-1]
    if row['origin'] <= pd.Timestamp(bundle['training_cutoff']):
        raise ValueError('Inference origin must follow training and calibration information')
    q = predict(bundle['model'], frame.iloc[-1:][FEATURES])[0]
    price_q = float(row['close']) * np.exp(q)
    if not np.isfinite(price_q).all() or (price_q <= 0).any():
        raise ValueError('Invalid predicted price quantiles')
    return {'schema_version': 1, 'instrument': 'BTC/USD', 'venue': bundle['venue'],
            'model_version': VERSION, 'model_family': bundle['model']['family'],
            'origin': row['origin'].isoformat(), 'target_end': row['target_end'].isoformat(),
            'horizon_days': bundle['horizon_days'], 'feature_cutoff': row['origin'].isoformat(),
            'training_cutoff': bundle['training_cutoff'], 'generated_at': pd.Timestamp(as_of).isoformat(),
            'data_sha256': hashlib.sha256(Path(prices).read_bytes()).hexdigest(),
            'training_data_sha256': bundle['data_sha256'], 'reference_price': float(row['close']),
            'return_quantiles': dict(zip(['p10', 'p50', 'p90'], map(float, q))),
            'price_quantiles': dict(zip(['p10', 'p50', 'p90'], map(float, price_q))),
            'calibration': {'status': 'research_only', 'method': 'held_out_residual_quantiles',
                            'reason': 'Exploratory history and assumed vendor availability; no production promotion'},
            'path_available': False}


def write_json(path, value):
    with Path(path).open('x', encoding='utf-8') as handle:
        json.dump(value, handle, indent=2, allow_nan=False)
        handle.write('\n')


def train(args):
    venue = source_venue(args.prices, args.venue)
    close = load_close(args.prices, args.as_of)
    frame = frame_from_close(close, args.horizon)
    labeled = frame.dropna(subset=['target_return', 'target_volatility'])
    if len(labeled) < 1100:
        raise ValueError('At least 1100 matured feature rows required')
    output = args.output
    output.mkdir(parents=True, exist_ok=False)
    boundaries = np.linspace(int(len(labeled) * .7), len(labeled), 4, dtype=int)
    scores, predictions, splits, uncertainty = [], [], [], []
    for fold, (start, end) in enumerate(zip(boundaries[:-1], boundaries[1:]), 1):
        train_idx, tune, calibration = partitions(labeled, start, args.horizon)
        test = labeled.iloc[start:end]
        y = test['target_return'].to_numpy()
        models = {name: fit_candidate(labeled, train_idx, tune, calibration, name)
                  for name in ('ridge', 'extra_trees', 'quantile_boosting')}
        forecast = {name: predict(model, test[FEATURES]) for name, model in models.items()}
        forecast['empirical'] = np.tile(np.quantile(labeled.loc[train_idx, 'target_return'], QUANTILES), (len(test), 1))
        forecast['iid_bootstrap'] = bootstrap_quantiles(close, test.index, args.horizon)
        forecast['block_bootstrap'] = bootstrap_quantiles(close, test.index, args.horizon, block=7)
        forecast['zero_return'] = np.zeros((len(test), 3))
        # Selection is based on tuning only, never the outer test or calibration score.
        # Use one comparable MAE score to choose the point-family reference model.
        chosen = min(('ridge', 'extra_trees'), key=lambda name: models[name]['tuning_score'])
        splits.append({'fold': fold, 'train_last_target_end': labeled.loc[train_idx, 'target_end'].max().isoformat(),
                       'tune_first_origin': labeled.loc[tune, 'origin'].min().isoformat(),
                       'tune_last_target_end': labeled.loc[tune, 'target_end'].max().isoformat(),
                       'calibration_first_origin': labeled.loc[calibration, 'origin'].min().isoformat(),
                       'calibration_last_target_end': labeled.loc[calibration, 'target_end'].max().isoformat(),
                       'test_first_origin': test['origin'].iloc[0].isoformat(), 'test_last_origin': test['origin'].iloc[-1].isoformat(),
                       'selected_point_family': chosen})
        scale_boundary = float(labeled.loc[train_idx, 'vol_30d'].median())
        for name, q in forecast.items():
            for regime, mask in [('all', np.ones(len(test), dtype=bool)), ('low_scale', test['vol_30d'].to_numpy() <= scale_boundary), ('high_scale', test['vol_30d'].to_numpy() > scale_boundary)]:
                if mask.any():
                    scores.append({'fold': fold, 'model': name, 'regime': regime, 'n': int(mask.sum()), **metrics(y[mask], q[mask])})
            predictions.extend({'fold': fold, 'model': name, 'origin': origin.isoformat(), 'actual': float(actual),
                                'p10': float(values[0]), 'p50': float(values[1]), 'p90': float(values[2])}
                               for origin, actual, values in zip(test['origin'], y, q))
            if name in models:
                delta = pinball(y, q) - pinball(y, forecast['iid_bootstrap'])
                uncertainty.append({'fold': fold, 'model': name, 'comparison': 'pinball minus iid_bootstrap',
                                    'mean': float(delta.mean()),
                                    'block_intervals_95': {str(b): block_interval(delta, b) for b in (args.horizon, args.horizon * 2)}})
        # Separate scale-target baseline and a training-only Ridge comparison.
        vol_model = make_pipeline(StandardScaler(), Ridge(alpha=100.))
        vol_model.fit(labeled.loc[train_idx, FEATURES], labeled.loc[train_idx, 'target_volatility'])
        for name, p in [('volatility_persistence', test['vol_30d'].to_numpy()),
                        ('volatility_ridge', np.maximum(0, vol_model.predict(test[FEATURES])))]:
            scores.append({'fold': fold, 'model': name, 'regime': 'all', 'n': len(test),
                           'mae': float(np.abs(test['target_volatility'].to_numpy() - p).mean())})
        print(f'Completed fold {fold}', flush=True)
    # Fresh fit with untouched recent calibration labels, not a test-selected winner.
    train_idx, tune, calibration = partitions(frame, len(frame) - 1, args.horizon)
    candidates = {name: fit_candidate(frame, train_idx, tune, calibration, name) for name in ('ridge', 'extra_trees')}
    selected = min(candidates, key=lambda name: candidates[name]['tuning_score'])
    bundle = {'schema_version': 1, 'model_version': VERSION, 'model': candidates[selected],
              'features': FEATURES, 'horizon_days': args.horizon, 'venue': venue,
              'training_cutoff': frame.loc[calibration, 'target_end'].max().isoformat(),
              'data_sha256': hashlib.sha256(args.prices.read_bytes()).hexdigest()}
    joblib.dump(bundle, output / 'model.joblib')
    pd.DataFrame(scores).to_csv(output / 'metrics.csv', index=False)
    pd.DataFrame(predictions).to_csv(output / 'predictions.csv', index=False)
    write_json(output / 'latest_forecast.json', artifact(bundle, frame, args.prices, args.as_of))
    write_json(output / 'report.json', {'model_version': VERSION, 'status': 'research_only',
               'horizon_days': args.horizon, 'features': FEATURES, 'selected_final_family': selected,
               'selection': 'point family by past tuning MAE; quantile boosting evaluated separately',
               'splits': splits, 'uncertainty': uncertainty,
               'diagnostics': diagnose(args.prices, args.as_of),
               'limitations': ['No point-in-time vendor provenance or unseen confirmatory holdout.',
                               'Residual calibration uses overlapping labels; nominal coverage is not guaranteed.',
                               'Block-bootstrap intervals are exploratory; no automatic promotion.',
                               'No transaction costs, trading simulation or forecast path.']})
    print(f'Research artifacts written to {output}', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['train', 'predict'])
    parser.add_argument('--prices', type=Path, default=DEFAULT_PRICES)
    parser.add_argument('--as-of', required=True)
    parser.add_argument('--horizon', type=int, choices=[7, 30], default=30)
    parser.add_argument('--venue', help='Source identity for custom CSV without provenance.json')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--model', type=Path, help='Trusted local joblib only (predict)')
    args = parser.parse_args()
    if args.command == 'train':
        train(args)
    else:
        if args.model is None:
            parser.error('--model is required for predict')
        bundle = joblib.load(args.model)
        if bundle.get('model_version') != VERSION or bundle.get('features') != FEATURES:
            raise ValueError('Unsupported model contract')
        if source_venue(args.prices, args.venue) != bundle['venue']:
            raise ValueError('Inference price venue differs from the fitted model; retrain on this source')
        frame = frame_from_close(load_close(args.prices, args.as_of), bundle['horizon_days'])
        write_json(args.output, artifact(bundle, frame, args.prices, args.as_of))


if __name__ == '__main__':
    main()
