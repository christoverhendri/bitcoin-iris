# Minute-derived market snapshots

The original `artifacts/market/coinbase_hourly.sqlite` remains unchanged. Build a
separate immutable snapshot from the canonical minute archive:

```powershell
uv run --no-project --python .venv/Scripts/python.exe python -m market_data.derived_hourly `
  --output artifacts/market/coinbase_hourly_from_minutes.sqlite `
  --start 2015-01-01T00:00:00Z --end 2026-10-13T12:00:00Z
```

An existing output is refused. Future builds must use a new output path; retain
the prior snapshot when publishing a new default. Do not run the hourly REST
collector against the derived file.

Only 60 unique valid observed minute candles produce a `COMPLETE` hourly bar.
`PARTIAL` and `NO_DATA` hours retain counts, lineage and partial aggregates in
`hourly_quality`, but have no eligible row in `hourly_candles`. Missing minutes
never acquire fabricated prices or volumes. Inferred no-trade minutes do not
count as observed candles under this conservative policy.

Each snapshot records the frozen minute observation cutoff, completed computation
availability, a dataset version, per-hour minute lineage, and the original
hourly comparison hash/mismatch. Both input databases are read-only. The result
is retrospective; historical availability is not reconstructed.

When the derived file is present, `getMarketSnapshot` uses it for Overview,
Market Price and Technicals. Larger bars require every complete parent hour;
sub-hour bars use the same frozen minute vintage and require every minute.
Indicators, pivots and VWAP use this same completed-bar snapshot; indicators and
VWAP do not bridge a gap. If the installed derived snapshot cannot be read, it
fails unavailable instead of silently substituting original hourly data.

Market Price exposes an hourly archive basis selector: derived or original
Coinbase. Archive cursors freeze observation time and derived dataset version.
Changing basis or publishing a different derived version invalidates pagination.
Replay rebuilds its chart, indicators and pivots from the selected snapshot and
never incorporates future observations in strict mode.

The immutable derived chart is frozen at its stored cutoff. Live executions,
header ticker and order book are separate; their candles are not spliced into
the minute-derived history. A fresh archive and snapshot build are required to
advance the analytical chart. Existing Market Memory experiments still use the
original hourly archive unless explicitly rerun on a derived snapshot.
