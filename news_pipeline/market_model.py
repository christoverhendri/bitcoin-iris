"""Frozen news representations + automatic market targets; no manual labels or RL."""
import argparse
import hashlib
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from .parser import VERSION, parse_news
from .storage import MAX_RECORD_BYTES, date
from .weighting import weight_post

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_NEWS = ROOT / 'bitcoin iris/dataset/kategori/textual_news/watcher_guru_articles.jsonl'
DEFAULT_PRICES = ROOT / 'bitcoin iris/dataset/btc/btc_daily_features.csv'
ENCODER = 'sentence-transformers/all-MiniLM-L6-v2'


def fingerprint(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def load_news(path, time_basis='publication'):
    rows, audit = [], {'input': 0, 'missing_time': 0, 'invalid': 0, 'duplicates': 0}
    with Path(path).open('rb') as handle:
        for raw in iter(lambda: handle.readline(MAX_RECORD_BYTES + 1), b''):
            if len(raw) > MAX_RECORD_BYTES:
                raise ValueError('Oversized JSONL line; use data import/quarantine first')
            audit['input'] += 1
            r = json.loads(raw)
            when = date(r.get('published_at' if time_basis == 'publication' else 'feature_ready_at'))
            if when is None:
                audit['missing_time'] += 1
                continue
            try:
                p = parse_news(r['raw_text'])
            except (ValueError, TypeError, KeyError):
                audit['invalid'] += 1
                continue
            if not r['raw_text'].strip():
                audit['invalid'] += 1
                continue
            day = pd.Timestamp(when).normalize()
            published = date(r.get('published_at'))
            w = weight_post(p, published.isoformat() if published else None,
                            (day + pd.Timedelta(days=1)).to_pydatetime())['post_weight']
            rows.append({'text': r['raw_text'], 'when': when, 'day': day,
                         'source_id': str(r.get('source_id', '')), 'weight': w,
                         'events': len(p['events']), 'review': int(p['needs_review']),
                         'btc': int(p['btc_relevance'] == 'explicit_mention')})
    unique, seen_text, seen_id = [], set(), set()
    for row in sorted(rows, key=lambda r: r['when']):
        key = ' '.join(row['text'].casefold().split())
        if key in seen_text or row['source_id'] in seen_id:
            audit['duplicates'] += 1
            continue
        seen_text.add(key)
        seen_id.add(row['source_id'])
        unique.append(row)
    if not unique:
        raise ValueError('No dated news available')
    audit['retained'] = len(unique)
    return unique, audit


def embed(rows, cache, revision=None):
    """An immutable Hub revision and ordered text hashes invalidate stale caches."""
    from huggingface_hub import HfApi
    import truststore
    truststore.inject_into_ssl()
    cache = Path(cache)
    manifest_path = cache.with_suffix('.json')
    text_hash = hashlib.sha256(json.dumps([r['text'] for r in rows], ensure_ascii=False).encode()).hexdigest()
    if cache.exists() and manifest_path.exists():
        meta = json.loads(manifest_path.read_text())
        if meta['model'] == ENCODER and meta['text_hash'] == text_hash and (revision is None or revision == meta['revision']):
            vectors = np.load(cache, allow_pickle=False)
            if vectors.shape == (len(rows), 384) and np.isfinite(vectors).all():
                return vectors, meta
    revision = revision or HfApi().model_info(ENCODER).sha
    from sentence_transformers import SentenceTransformer
    import torch
    torch.set_num_threads(4)
    model = SentenceTransformer(ENCODER, revision=revision, device='cpu', trust_remote_code=False)
    # Encode long posts as token-bounded chunks instead of silently truncating recaps.
    chunks, owners = [], []
    for i, row in enumerate(rows):
        tokens = model.tokenizer.encode(row['text'], add_special_tokens=False, verbose=False)
        for offset in range(0, len(tokens), 220):
            chunks.append(model.tokenizer.decode(tokens[offset:offset + 220], skip_special_tokens=True))
            owners.append(i)
    vectors = np.zeros((len(rows), 384), dtype=np.float32)
    for start in range(0, len(chunks), 256):
        batch = model.encode(chunks[start:start + 256], batch_size=32, normalize_embeddings=True,
                             show_progress_bar=False, convert_to_numpy=True)
        np.add.at(vectors, np.asarray(owners[start:start + 256]), batch)
    vectors /= np.maximum(np.linalg.norm(vectors, axis=1, keepdims=True), 1e-12)
    meta = {'model': ENCODER, 'revision': revision, 'text_hash': text_hash, 'dimensions': 384,
            'chunks': len(chunks), 'chunk_tokens': 220, 'pooling': 'normalized_mean_of_chunks', 'device': 'cpu'}
    cache.parent.mkdir(parents=True, exist_ok=True)
    np.save(cache, vectors, allow_pickle=False)
    manifest_path.write_text(json.dumps(meta, indent=2), encoding='utf-8')
    return vectors, meta


def market_frame(path, horizon):
    if not 1 <= horizon <= 90:
        raise ValueError('horizon must be 1..90 days')
    raw = pd.read_csv(path)
    raw['date'] = pd.to_datetime(raw['date'], utc=True, errors='raise')
    if raw['date'].duplicated().any():
        raise ValueError('Duplicate price dates')
    raw = raw.sort_values('date').set_index('date')
    close = pd.to_numeric(raw['Close' if 'Close' in raw else 'btc_close'], errors='raise')
    if not np.isfinite(close).all() or (close <= 0).any():
        raise ValueError('Prices must be finite and positive')
    if not raw.index.equals(pd.date_range(raw.index.min(), raw.index.max(), freq='D')):
        raise ValueError('Daily price series must have no gaps or intraday timestamps')
    # A date-D close is only available at D+1 UTC. Discard any unfinished bar.
    close = close[close.index + pd.Timedelta(days=1) <= pd.Timestamp.now(tz='UTC')]
    ret = np.log(close / close.shift(1))
    frame = pd.DataFrame(index=close.index)
    for lag in [1, 7, 30]:
        frame[f'return_{lag}d'] = np.log(close / close.shift(lag))
    for window in [7, 30]:
        frame[f'vol_{window}d'] = np.sqrt(ret.pow(2).rolling(window).mean())
    frame['target_return'] = np.log(close.shift(-horizon) / close)
    # Root mean squared future daily log return (unannualized), not sample std.
    frame['target_volatility'] = np.sqrt(sum(ret.shift(-i).pow(2) for i in range(1, horizon + 1)) / horizon)
    frame['origin'] = frame.index + pd.Timedelta(days=1)
    frame['target_end'] = frame['origin'] + pd.Timedelta(days=horizon)
    return frame.dropna(subset=['return_30d', 'vol_30d'])


def representation(rows, vectors, days, train_days, clusters=8):
    """All learned representations use articles strictly before the fit cutoff."""
    cutoff = train_days[-1] + pd.Timedelta(days=1)
    eligible = np.array([r['when'] < cutoff.to_pydatetime() for r in rows])
    if eligible.sum() < clusters:
        raise ValueError('Too few training articles for clustering')
    km = KMeans(n_clusters=clusters, random_state=42, n_init=10).fit(vectors[eligible])
    pca = PCA(n_components=min(8, int(eligible.sum()), vectors.shape[1]), random_state=42).fit(vectors[eligible])
    reduced = pca.transform(vectors)
    labels = km.predict(vectors)
    n = len(days)
    counts = np.zeros((n, 5))
    semantic = np.zeros((n, reduced.shape[1] + clusters))
    weighted = np.zeros_like(semantic)
    lookup = {day: i for i, day in enumerate(days)}
    denominators = np.zeros(n)
    for j, row in enumerate(rows):
        if row['day'] not in lookup:
            continue
        i = lookup[row['day']]
        counts[i] += [1, row['events'], row['review'], row['btc'], row['weight']]
        v = np.r_[reduced[j], np.eye(clusters)[labels[j]]]
        semantic[i] += v
        weighted[i] += row['weight'] * v
        denominators[i] += row['weight']
    semantic /= np.maximum(counts[:, :1], 1)
    weighted /= np.maximum(denominators[:, None], 1e-12)
    summary = []
    indices = np.flatnonzero(eligible)
    for k in range(clusters):
        members = indices[labels[indices] == k]
        nearest = sorted(members, key=lambda j: np.linalg.norm(vectors[j] - km.cluster_centers_[k]))[:3]
        summary.append({'cluster': k, 'training_count': len(members),
                        'examples': [{'source_id': rows[j]['source_id'], 'text': rows[j]['text']} for j in nearest]})
    return counts, semantic, weighted, {'kmeans': km, 'pca': pca, 'cutoff': cutoff.isoformat()}, summary


def split_fold(frame, test_start, test_end, horizon, validation_days=90):
    validation_start = test_start - validation_days - horizon
    train = np.flatnonzero((np.arange(len(frame)) < validation_start) &
                          (frame['target_end'] < frame['origin'].iloc[validation_start]))
    valid = np.flatnonzero((np.arange(len(frame)) >= validation_start) &
                          (np.arange(len(frame)) < test_start) &
                          (frame['target_end'] < frame['origin'].iloc[test_start]))
    test = np.arange(test_start, test_end)
    if min(len(train), len(valid), len(test)) < 20:
        raise ValueError('Not enough observations for purged train/validation/test')
    return train, valid, test


def run(args):
    rows, audit = load_news(args.news, args.time_basis)
    print(json.dumps({'news_audit': audit}), flush=True)
    vectors, encoder = embed(rows, args.cache, args.revision)
    frame = market_frame(args.prices, args.horizon)
    frame = frame.loc[(frame.index >= rows[0]['day']) & (frame.index <= rows[-1]['day'])]
    labeled = frame.dropna(subset=['target_return', 'target_volatility'])
    if len(labeled) < 500:
        raise ValueError('Need at least 500 daily observations after news/price overlap')
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=False)
    market_cols = ['return_1d', 'return_7d', 'return_30d', 'vol_7d', 'vol_30d']
    y = labeled[['target_return', 'target_volatility']].to_numpy()
    market = labeled[market_cols].to_numpy()
    boundaries = np.linspace(int(len(labeled) * .7), len(labeled), 4, dtype=int)
    metrics, predictions, splits = [], [], []
    selected_alphas = {}
    for fold, (start, end) in enumerate(zip(boundaries[:-1], boundaries[1:]), 1):
        train, valid, test = split_fold(labeled, start, end, args.horizon)
        counts, semantic, weighted, rep, clusters = representation(rows, vectors, labeled.index, labeled.index[train], args.clusters)
        variants = {'market_only': market, 'market_counts': np.c_[market, counts[:, 0]],
                    'news_semantic': np.c_[market, counts[:, :4], semantic],
                    'news_weighted': np.c_[market, counts, weighted]}
        splits.append({'fold': fold, 'train_last_target_end': labeled['target_end'].iloc[train[-1]].isoformat(),
                       'validation_first_origin': labeled['origin'].iloc[valid[0]].isoformat(),
                       'validation_last_target_end': labeled['target_end'].iloc[valid[-1]].isoformat(),
                       'test_first_origin': labeled['origin'].iloc[test[0]].isoformat(),
                       'test_last_origin': labeled['origin'].iloc[test[-1]].isoformat(),
                       'counts': [len(train), len(valid), len(test)], 'representation_cutoff': rep['cutoff']})
        for name, x in variants.items():
            for target, target_name in enumerate(['return', 'volatility']):
                best = None
                for alpha in [.1, 1., 10., 100.]:
                    model = make_pipeline(StandardScaler(), Ridge(alpha=alpha))
                    model.fit(x[train], y[train, target])
                    pred = model.predict(x[valid])
                    if target == 1:
                        pred = np.maximum(pred, 0)
                    score = mean_absolute_error(y[valid, target], pred)
                    if best is None or score < best[0]:
                        best = score, model, alpha
                selected_alphas[(name, target_name)] = best[2]
                pred = best[1].predict(x[test])
                if target == 1:
                    pred = np.maximum(pred, 0)
                metrics.append({'fold': fold, 'variant': name, 'target': target_name, 'alpha': best[2],
                                'validation_mae': best[0], 'test_mae': mean_absolute_error(y[test, target], pred),
                                'test_rmse': float(np.sqrt(mean_squared_error(y[test, target], pred)))})
                predictions.extend({'fold': fold, 'variant': name, 'target': target_name,
                                    'origin': labeled['origin'].iloc[i].isoformat(), 'actual': float(y[i, target]),
                                    'prediction': float(p)} for i, p in zip(test, pred))
        for target, target_name in enumerate(['return', 'volatility']):
            pred = np.zeros(len(test)) if target == 0 else market[test, -1]
            metrics.append({'fold': fold, 'variant': 'naive', 'target': target_name,
                            'test_mae': mean_absolute_error(y[test, target], pred),
                            'test_rmse': float(np.sqrt(mean_squared_error(y[test, target], pred)))})
        (output / f'clusters_fold_{fold}.json').write_text(json.dumps(clusters, indent=2), encoding='utf-8')
        print(json.dumps({'fold_completed': fold}), flush=True)
    # Final fitted models use all matured labels, with last validation-selected alphas.
    counts, semantic, weighted, rep, clusters = representation(rows, vectors, frame.index, labeled.index, args.clusters)
    market_all = frame[market_cols].to_numpy()
    variants = {'market_only': market_all, 'market_counts': np.c_[market_all, counts[:, 0]],
                'news_semantic': np.c_[market_all, counts[:, :4], semantic],
                'news_weighted': np.c_[market_all, counts, weighted]}
    final_models, latest = {}, []
    fit = frame.index.get_indexer(labeled.index)
    for name, x in variants.items():
        for target, target_name in enumerate(['return', 'volatility']):
            model = make_pipeline(StandardScaler(), Ridge(alpha=selected_alphas[(name, target_name)]))
            model.fit(x[fit], y[:, target])
            final_models[f'{name}/{target_name}'] = model
            pred = float(model.predict(x[-1:])[0])
            latest.append({'variant': name, 'target': target_name, 'prediction': max(pred, 0) if target == 1 else pred,
                           'origin': frame['origin'].iloc[-1].isoformat(),
                           'target_end': frame['target_end'].iloc[-1].isoformat(),
                           'is_out_of_sample': bool(frame.index[-1] > labeled.index[-1])})
    joblib.dump({'models': final_models, 'representation': rep, 'encoder': encoder,
                 'horizon_days': args.horizon, 'parser_version': VERSION,
                 'market_columns': market_cols, 'training_end': labeled.index[-1].isoformat()}, output / 'models.joblib')
    pd.DataFrame(metrics).to_csv(output / 'metrics.csv', index=False)
    pd.DataFrame(predictions).to_csv(output / 'predictions.csv', index=False)
    (output / 'latest_predictions.json').write_text(json.dumps(latest, indent=2), encoding='utf-8')
    report = {'news_audit': audit, 'encoder': encoder, 'horizon_days': args.horizon,
              'time_basis': args.time_basis, 'daily_observations': len(labeled), 'splits': splits,
              'first_price_feature_day': frame.index[0].isoformat(),
              'last_price_feature_day': frame.index[-1].isoformat(),
              'last_news_time': rows[-1]['when'].isoformat(),
              'clusters': args.clusters, 'pca_dimensions': 8, 'ridge_alphas': [.1, 1, 10, 100],
              'selection_metric': 'validation MAE per variant and target',
              'summary': pd.DataFrame(metrics).groupby(['variant', 'target'])['test_mae'].mean().reset_index().to_dict('records'),
              'news_sha256': fingerprint(args.news), 'prices_sha256': fingerprint(args.prices),
              'limitations': ['Retrospective feature study, not causal attribution or RL.',
                             'Date-D price bars assumed to close at D+1 00:00 UTC.',
                             'No observed posts is not proof of zero news; source coverage unknown.',
                             'Historical text versions and pretrained encoder cutoff may be unavailable at original time.',
                             'Daily test horizons overlap; metrics are not independent-trade returns.']}
    (output / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(pd.DataFrame(metrics).groupby(['variant', 'target'])['test_mae'].mean().to_string())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--news', type=Path, default=DEFAULT_NEWS)
    parser.add_argument('--prices', type=Path, default=DEFAULT_PRICES)
    parser.add_argument('--time-basis', choices=['publication', 'ready'], default='publication')
    parser.add_argument('--cache', type=Path, default=ROOT / 'artifacts/news/embeddings.npy')
    parser.add_argument('--revision')
    parser.add_argument('--horizon', type=int, default=7)
    parser.add_argument('--clusters', type=int, default=8)
    parser.add_argument('--output', type=Path, default=ROOT / 'artifacts/news/market_model')
    args = parser.parse_args()
    if not 2 <= args.clusters <= 32:
        parser.error('clusters must be 2..32')
    run(args)


if __name__ == '__main__':
    main()
