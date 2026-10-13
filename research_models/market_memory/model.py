"""Chronological, label-purged, common-origin comparisons of B0..B3.

All outputs are exploratory. Residual calibration is empirical, not a theorem
about conditional coverage under temporal dependence. Model selection never uses
outer test scores. No model is automatically promoted or selected as a winner.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
import math

import numpy as np
from threadpoolctl import threadpool_limits

from .data import DAY, iso
from .features import Examples, VARIANTS

QUANTILES = (.05, .5, .95)
METHODS = ('HISTORICAL', 'PERSISTENCE', 'EWMA', 'HAR', *VARIANTS)
TARGETS = ('log_mean_daily_rv', 'horizon_log_return', 'log1p_100_adverse_excursion')


@dataclass(frozen=True)
class Protocol:
    folds: int = 3
    min_train: int = 180
    tune_size: int = 60
    calibration_size: int = 90
    test_fraction: float = .25
    alphas: tuple[float, ...] = (.01, .1, 1., 10.)
    seed: int = 42
    bootstrap_reps: int = 200

    def validate(self):
        if not (2 <= self.folds <= 5 and 60 <= self.min_train <= 3000
                and 30 <= self.tune_size <= 365 and 30 <= self.calibration_size <= 365
                and .1 <= self.test_fraction <= .5 and 0 <= self.bootstrap_reps <= 2000
                and 0 <= self.seed <= 2**32 - 1 and 1 <= len(self.alphas) <= 6
                and all(math.isfinite(a) and a > 0 for a in self.alphas)):
            raise ValueError('Protocol exceeds safe research limits or minimum sample sizes')


def ridge_fit(x, y, alpha: float) -> dict:
    """Mean squared loss + alpha*||coef||^2; intercept is not penalized.

    Thin SVD avoids explicit (X'X)^-1, including rank-deficient path features.
    All centering/scaling parameters are learned from the fit partition only.
    """
    x, y = np.asarray(x, float), np.asarray(y, float)
    if (x.ndim != 2 or y.shape != (len(x), 3) or len(x) < 2 or x.shape[1] > 64
            or not np.all(np.isfinite(x)) or not np.all(np.isfinite(y))
            or not math.isfinite(alpha) or alpha <= 0):
        raise ValueError('Invalid ridge input')
    mean, scale, intercept = x.mean(axis=0), x.std(axis=0), y.mean(axis=0)
    scale = np.where(scale > 1e-12, scale, 1.)
    u, s, vt = np.linalg.svd((x - mean)/scale, full_matrices=False)
    coef = vt.T @ ((s / (s*s + len(x)*alpha))[:, None] * (u.T @ (y - intercept)))
    return {'mean': mean.tolist(), 'scale': scale.tolist(), 'coef': coef.tolist(),
            'intercept': intercept.tolist(), 'alpha': alpha,
            'rank': int(np.sum(s > max(x.shape)*np.finfo(float).eps*(s[0] if len(s) else 0)))}


def ridge_predict(model: dict, x) -> np.ndarray:
    x = np.asarray(x, float)
    mean, scale = np.asarray(model['mean']), np.asarray(model['scale'])
    coef, intercept = np.asarray(model['coef']), np.asarray(model['intercept'])
    if (x.ndim != 2 or mean.shape != (x.shape[1],) or scale.shape != mean.shape
            or coef.shape != (x.shape[1], 3) or intercept.shape != (3,)
            or np.any(scale <= 0)
            or not all(np.all(np.isfinite(a)) for a in (x, mean, scale, coef, intercept))):
        raise ValueError('Invalid model dimensions or numeric content')
    result = (x-mean)/scale @ coef + intercept
    if not np.all(np.isfinite(result)):
        raise ValueError('Nonfinite model prediction')
    return result


def partitions(ds: Examples, before: int, protocol: Protocol) -> tuple:
    """Endpoint-time purge, not a fixed number of rows (data may contain gaps)."""
    mature = np.flatnonzero(ds.target_ends < before)
    if len(mature) < protocol.calibration_size:
        raise ValueError('Insufficient matured calibration labels')
    cal = mature[-protocol.calibration_size:]
    before_cal = np.flatnonzero(ds.target_ends < ds.origins[cal[0]])
    if len(before_cal) < protocol.tune_size:
        raise ValueError('Insufficient past tuning labels')
    tune = before_cal[-protocol.tune_size:]
    train = np.flatnonzero(ds.target_ends < ds.origins[tune[0]])
    if len(train) < protocol.min_train:
        raise ValueError('Insufficient purged training history')
    return train, tune, before_cal, cal


def _matrix(ds, method):
    return ds.x['B0'][:, 3:6] if method == 'HAR' else ds.x[method]


def fit_method(ds: Examples, method: str, train, tune, fit, cal, protocol: Protocol) -> dict:
    baseline = method in ('HISTORICAL', 'PERSISTENCE', 'EWMA')
    if baseline:
        model = {'constant': np.median(ds.y[fit], axis=0).tolist()}
        if method != 'HISTORICAL':
            model['constant'][1] = 0.0
        features = []
        tuning = []
    else:
        x = _matrix(ds, method)
        tuning = []
        for a in protocol.alphas:
            m = ridge_fit(x[train], ds.y[train], a)
            # Primary preregistered selection criterion; auxiliary heads exploratory.
            loss = np.mean(np.abs(ds.y[tune, 0] - ridge_predict(m, x[tune])[:, 0]))
            tuning.append({'alpha': a, 'log_rv_mae': float(loss)})
        alpha = min(tuning, key=lambda row: (row['log_rv_mae'], row['alpha']))['alpha']
        model = ridge_fit(x[fit], ds.y[fit], alpha)
        features = list(VARIANTS['B0'][3:6] if method == 'HAR' else VARIANTS[method])
    bundle = {'method': method, 'regression': model, 'features': features,
              'tuning': tuning, 'fit_count': len(fit), 'calibration_count': len(cal),
              'fit_last_label_end': iso(ds.target_ends[fit].max()),
              'calibration_last_label_end': iso(ds.target_ends[cal].max())}
    raw = raw_predictions(bundle, ds, cal)
    residuals = ds.y[cal] - raw
    offsets = np.quantile(residuals, QUANTILES, axis=0, method='linear').T
    maximum = float(residuals[:, 0].max())
    # Duan-style empirical smearing for mean variance, not exp(mean log variance).
    smear = maximum + float(np.log(np.mean(np.exp(residuals[:, 0] - maximum))))
    bundle.update(residual_offsets=offsets.tolist(), log_variance_smearing=smear,
                  calibration='empirical residual offsets; not conditional-coverage certification')
    return bundle


def raw_predictions(bundle, ds, indices):
    method = bundle['method']
    if method in ('HISTORICAL', 'PERSISTENCE', 'EWMA'):
        raw = np.tile(bundle['regression']['constant'], (len(indices), 1)).astype(float)
        if method == 'PERSISTENCE':
            raw[:, 0] = np.log(ds.latest_rv[indices])
        if method == 'EWMA':
            raw[:, 0] = np.log(ds.ewma_rv[indices])
        return raw
    return ridge_predict(bundle['regression'], _matrix(ds, method)[indices])


def calibrated(bundle, raw):
    offsets = np.array(bundle['residual_offsets'], dtype=float)
    if offsets.shape != (3, 3) or not np.all(np.isfinite(offsets)) or np.any(np.diff(offsets, axis=1) < 0):
        raise ValueError('Invalid empirical calibration offsets')
    quantiles = raw[:, :, None] + offsets[None, :, :]
    log_mean = raw[:, 0] + bundle['log_variance_smearing']
    # Fail rather than silently clipping a numerically explosive model.
    if (not np.all(np.isfinite(quantiles)) or not np.all(np.isfinite(log_mean))
            or np.max(np.abs(quantiles[:, (0, 2), :])) > 600
            or np.max(np.abs(log_mean)) > 600):
        raise ValueError('Unstable exponential prediction; no clipping or promotion')
    return quantiles, log_mean


def score(y, quantiles, log_mean):
    err = y[:, :, None] - quantiles
    pinball = np.maximum(np.array(QUANTILES)*err, (np.array(QUANTILES)-1)*err)
    ratio_log = y[:, 0] - log_mean
    if np.max(np.abs(ratio_log)) > 600:
        raise ValueError('Unstable QLIKE ratio')
    excursion = np.expm1(y[:, 2])/100
    predicted_excursion = np.maximum(0., np.expm1(quantiles[:, 2, 1])/100)
    return {'n': len(y), 'log_rv_mae': float(np.abs(err[:, 0, 1]).mean()),
            'log_rv_pinball': float(pinball[:, 0, :].mean()),
            'qlike_mean_variance': float(np.mean(np.expm1(ratio_log)-ratio_log)),
            'rv_90pct_coverage': float(np.mean((y[:, 0] >= quantiles[:, 0, 0]) &
                                            (y[:, 0] <= quantiles[:, 0, 2]))),
            'mean_log_interval_width': float(np.mean(quantiles[:, 0, 2]-quantiles[:, 0, 0])),
            'return_mae': float(np.abs(err[:, 1, 1]).mean()),
            'return_pinball': float(pinball[:, 1, :].mean()),
            'adverse_excursion_mae': float(np.abs(excursion-predicted_excursion).mean())}


def _bootstrap(differences, origins, folds, *, block, reps, seed):
    """Resample each uninterrupted origin segment; never jump across source gaps."""
    if reps == 0:
        return None
    rng = np.random.default_rng(seed)
    grouped = []
    for fold in np.unique(folds):
        ids = np.flatnonzero(folds == fold)
        breaks = np.flatnonzero(np.diff(origins[ids]) != DAY) + 1
        grouped.append([differences[part] for part in np.split(ids, breaks) if len(part)])
    draws = np.empty(reps)
    for rep in range(reps):
        means = []
        for segments in grouped:
            total, n = 0., 0
            for segment in segments:
                size = len(segment)
                b = min(block, size)
                starts = rng.integers(0, size, size=math.ceil(size / b))
                idx = ((starts[:, None] + np.arange(b)) % size).ravel()[:size]
                total += float(segment[idx].sum())
                n += size
            means.append(total/n)
        draws[rep] = np.mean(means)
    return [float(x) for x in np.quantile(draws, [.025, .975])]


@threadpool_limits.wrap(limits=1, user_api='blas')
def evaluate(ds: Examples, protocol: Protocol) -> tuple[dict, list, dict]:
    protocol.validate()
    n = len(ds.origins)
    if n > 11_000 or n < protocol.min_train + protocol.tune_size + protocol.calibration_size + 30:
        raise ValueError('Not enough eligible observations or research budget exceeded')
    first = int(n * (1-protocol.test_fraction))
    test_blocks = np.array_split(np.arange(first, n), protocol.folds)
    if any(len(x) < 10 for x in test_blocks):
        raise ValueError('Outer test blocks too small')
    outputs, fold_metrics, split_log = [], [], []
    for fold, test in enumerate(test_blocks):
        train, tune, fit, cal = partitions(ds, int(ds.origins[test[0]]), protocol)
        split_log.append({'fold': fold, 'train_n': len(train), 'tune_n': len(tune),
                          'refit_n': len(fit), 'calibration_n': len(cal), 'test_n': len(test),
                          'train_last_label_end': iso(ds.target_ends[train].max()),
                          'tune_first_origin': iso(ds.origins[tune[0]]),
                          'refit_last_label_end': iso(ds.target_ends[fit].max()),
                          'calibration_first_origin': iso(ds.origins[cal[0]]),
                          'calibration_last_label_end': iso(ds.target_ends[cal].max()),
                          'test_first_origin': iso(ds.origins[test[0]]),
                          'test_last_origin': iso(ds.origins[test[-1]])})
        for method in METHODS:
            model = fit_method(ds, method, train, tune, fit, cal, protocol)
            quantiles, log_mean = calibrated(model, raw_predictions(model, ds, test))
            metrics = score(ds.y[test], quantiles, log_mean)
            fold_metrics.append(dict(metrics, fold=fold, method=method,
                                     alpha=model['regression'].get('alpha')))
            for k, i in enumerate(test):
                outputs.append({'horizon_days': ds.horizon, 'fold': fold, 'method': method,
                                'origin': iso(ds.origins[i]), 'target_end': iso(ds.target_ends[i]),
                                'actual_log_rv': float(ds.y[i, 0]),
                                'pred_log_rv_q05': float(quantiles[k, 0, 0]),
                                'pred_log_rv_q50': float(quantiles[k, 0, 1]),
                                'pred_log_rv_q95': float(quantiles[k, 0, 2]),
                                'pred_mean_daily_rv': float(np.exp(log_mean[k])),
                                'actual_log_return': float(ds.y[i, 1]),
                                'pred_return_q05': float(quantiles[k, 1, 0]),
                                'pred_return_q50': float(quantiles[k, 1, 1]),
                                'pred_return_q95': float(quantiles[k, 1, 2]),
                                'actual_adverse_excursion': float(np.expm1(ds.y[i, 2])/100),
                                'pred_adverse_q50': float(max(0, np.expm1(quantiles[k, 2, 1])/100))})
    summary = []
    for method in METHODS:
        rows = [r for r in fold_metrics if r['method'] == method]
        metrics = {k: float(np.mean([row[k] for row in rows]))
                   for k in rows[0] if k not in ('method', 'fold', 'alpha', 'n')}
        summary.append(dict(metrics, method=method, horizon_days=ds.horizon,
                            test_origins=sum(r['n'] for r in rows),
                            feature_count=3 if method == 'HAR' else len(VARIANTS.get(method, ()))))
    comparisons = []
    for baseline, challenger in [('B1', 'B2'), ('B2', 'B3'), ('B2_SHUFFLED', 'B2'), ('EWMA', 'HAR')]:
        left = [r for r in outputs if r['method'] == baseline]
        right = [r for r in outputs if r['method'] == challenger]
        delta = np.array([abs(a['actual_log_rv']-a['pred_log_rv_q50']) -
                          abs(b['actual_log_rv']-b['pred_log_rv_q50']) for a, b in zip(left, right)])
        from .data import utc_seconds
        origins = np.array([utc_seconds(a['origin']) for a in left])
        folds = np.array([a['fold'] for a in left])
        estimate = float(np.mean([delta[folds == f].mean() for f in np.unique(folds)]))
        for block in (ds.horizon, 2*ds.horizon):
            ci = _bootstrap(delta, origins, folds, block=block, reps=protocol.bootstrap_reps, seed=protocol.seed)
            comparisons.append({'baseline': baseline, 'challenger': challenger,
                                'mean_log_mae_gain': estimate, 'block_days': block,
                                'exploratory_ci95': ci, 'multiple_testing_adjusted': False})
    # All variants retained. Final refit is not selected using outer test scores.
    from .data import utc_seconds
    before = utc_seconds(ds.latest['origin'])
    parts = partitions(ds, before, protocol)
    final_models = {method: fit_method(ds, method, *parts, protocol) for method in METHODS}
    report = {'horizon_days': ds.horizon, 'coverage': ds.coverage, 'splits': split_log,
              'summary': summary, 'fold_metrics': fold_metrics,
              'paired_comparisons': comparisons, 'aggregation': 'equal-weight outer-fold means',
              'protocol': asdict(protocol), 'targets': TARGETS,
              'latest_feature_origin': ds.latest['origin']}
    return report, outputs, final_models
