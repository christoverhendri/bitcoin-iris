"""Reproducible, descriptive daily-market diagnostics; never a deployment gate pass."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd


DEFAULT_PRICES = Path(__file__).resolve().parents[1] / 'bitcoin iris/dataset/btc/btc_daily_features.csv'


def load_close(path, as_of):
    raw = pd.read_csv(path)
    dates = pd.to_datetime(raw['date'], utc=True, errors='raise')
    if dates.isna().any() or dates.duplicated().any() or not dates.eq(dates.dt.normalize()).all():
        raise ValueError('Expected unique, nonmissing midnight UTC daily dates')
    close = pd.Series(pd.to_numeric(raw['Close'], errors='raise').to_numpy(), index=dates).sort_index()
    if not np.isfinite(close).all() or (close <= 0).any():
        raise ValueError('Close must be finite and positive')
    if close.empty or not close.index.equals(pd.date_range(close.index.min(), close.index.max(), freq='D')):
        raise ValueError('Daily bars must be contiguous; do not fill price gaps')
    cutoff = pd.Timestamp(as_of)
    if cutoff.tzinfo is None:
        raise ValueError('as_of must include a timezone')
    close = close[close.index + pd.Timedelta(days=1) <= cutoff]
    if len(close) < 366:
        raise ValueError('At least 366 completed daily closes are required')
    return close


def acf(values, lag):
    """Biased sample autocorrelation with a common full-sample mean."""
    x = np.asarray(values, dtype=float)
    x = x - x.mean()
    denominator = float(x @ x)
    return float(x[lag:] @ x[:-lag] / denominator) if denominator > 0 else None


def summarize(returns):
    r = np.asarray(returns, dtype=float)
    centered = r - r.mean()
    variance = float(np.mean(centered ** 2))
    sd = float(np.sqrt(variance))
    return {
        'n_returns': len(r),
        'mean_daily_log_return': float(r.mean()),
        'daily_std_population': sd,
        'daily_rms': float(np.sqrt(np.mean(r ** 2))),
        'excess_kurtosis_moment': float(np.mean(centered ** 4) / variance ** 2 - 3) if variance > 0 else None,
        'fraction_beyond_3_sample_std': float(np.mean(np.abs(centered) > 3 * sd)) if sd > 0 else None,
        'quantiles': dict(zip(['p01', 'p05', 'p50', 'p95', 'p99'], map(float, np.quantile(r, [.01, .05, .5, .95, .99])))),
        'acf': {name: {str(lag): acf(x, lag) for lag in (1, 7, 30)}
                for name, x in [('return', r), ('absolute_return', np.abs(r)), ('squared_return', r ** 2)]},
    }


def diagnose(path, as_of):
    close = load_close(path, as_of)
    returns = np.log(close).diff().dropna()
    windows = []
    # Fixed non-overlapping chronological windows expose sensitivity to sample period.
    for offset in range(0, len(returns), 365):
        window = returns.iloc[offset:offset + 365]
        if len(window) >= 180:
            windows.append({'start': window.index[0].isoformat(), 'end': window.index[-1].isoformat(), **summarize(window)})
    return {
        'schema_version': 1,
        'status': 'descriptive_only_not_system_or_predictive_validation',
        'source': str(Path(path).resolve()),
        'sha256': hashlib.sha256(Path(path).read_bytes()).hexdigest(),
        'as_of': pd.Timestamp(as_of).isoformat(),
        'bar_assumption': 'Date-D Close available at D+1 00:00 UTC; source latency not verified',
        'first_bar': close.index[0].isoformat(), 'last_bar': close.index[-1].isoformat(),
        'n_closes': len(close),
        'age_days_since_last_completed_bar': float((pd.Timestamp(as_of) - (close.index[-1] + pd.Timedelta(days=1))) / pd.Timedelta(days=1)),
        'full_sample': summarize(returns), 'chronological_windows': windows,
        'limitations': [
            'Descriptive sample moments and autocorrelations, not significance tests or proof of stationarity.',
            'Daily closes cannot identify intraday jumps, order flow, liquidity, or causal mechanisms.',
            'No predictive evaluation, feature selection, or automated model promotion occurs.',
            'Dataset publication/revision provenance is not established by a file hash.',
            'Using these results for design consumes this history as exploratory data; reserve new holdout data.',
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prices', type=Path, default=DEFAULT_PRICES)
    parser.add_argument('--as-of', required=True, help='Timezone-aware cutoff, e.g. 2026-09-08T00:00:00Z')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    report = diagnose(args.prices, args.as_of)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x', encoding='utf-8') as handle:
        json.dump(report, handle, indent=2, allow_nan=False)
        handle.write('\n')
    print(f"{report['n_closes']} closes; last bar {report['last_bar']}; descriptive report: {args.output}")


if __name__ == '__main__':
    main()
