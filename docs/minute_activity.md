# IRIS minute-level trading activity (research-only)

**Source:** Coinbase Exchange public `BTC-USD` candles, 60-second granularity.
**Operating mode:** bounded, opt-in historical collection; no API key, paid data,
service installation, or automatic forecast promotion.

Coinbase may omit 1-minute candle buckets with no trades, **and** explicitly
warns historical OHLCV may be incomplete. Therefore, an absent candle is not
proof of zero trades. This pipeline intentionally never pretends otherwise.

## The classification contract

| Status | When | Raw volume | Raw OHLC |
|---|---|---|---|
| `TRADED` | Returned 1m candle with positive volume | Provider value | Provider values |
| `ZERO_VOLUME_CANDLE` | Returned 1m candle with volume 0 | 0 from provider | Provider values |
| `INFERRED_NO_TRADE` | Absent minute in fully **successfully fetched** 1m window, when the independent 1h Coinbase candle has consistent total volume, high, low, opening and closing price | **Inferred** 0 | **NULL** |
| `UNKNOWN` | All other absent minutes, including incomplete fetch coverage, unavailable reference, OHLC/volume disagreement or no positive-volume evidence | NULL | NULL |

`INFERRED_NO_TRADE` is an inference supported by two distinct requests to the
*same exchange*, **not** a verified individual-trade ledger. Historical revised
candles may change the result. We **do not** expose the label `VERIFIED_NO_TRADE`
without independent, complete tick/trade records.

A Coinbase-specific no-trade label never implies that all BTC exchanges were
inactive. `PRE_LISTING` is never inferred from missing candles. HTTP errors
remain `minute_errors` and produce no successful checkpoint or zero-volume row.

## Setup

```bash
python -m pip install -r requirements.txt -r requirements-warehouse.txt
```

## Small, inexpensive 2015 experiment

The CLI only fetches **completed** UTC minutes. Each request covers at most
240 minutes by default (API limit 300). Historical ranges must be explicitly
provided; the default request budget is 12 pages.

```bash
# First fetch the independent 1-hour reference from Coinbase.
python -m market_data.hourly_prices backfill \
  --start 2015-07-21T00:00:00Z --end 2015-07-21T04:00:00Z \
  --database artifacts/market/coinbase_hourly.sqlite --page-hours 4 --max-pages 2

# Then fetch the separate 1-minute sample and persist its page checkpoints.
python -m market_data.minute_activity backfill \
  --start 2015-07-21T00:00:00Z --end 2015-07-21T04:00:00Z \
  --database artifacts/market/coinbase_minute.sqlite --max-pages 2

python -m market_data.minute_activity status \
  --database artifacts/market/coinbase_minute.sqlite

python -m market_data.minute_activity reconcile \
  --minute-database artifacts/market/coinbase_minute.sqlite \
  --hourly-database artifacts/market/coinbase_hourly.sqlite \
  --start 2015-07-21T00:00:00Z --end 2015-07-21T04:00:00Z \
  --output artifacts/quality/minute_activity_2015.json \
  --csv-output artifacts/quality/minute_activity_2015.csv
```

The JSON quality report includes four status counts and per-hour evidence:
`hour_fetch_covered`, minute page response SHA-256s, independent 1-hour
candle SHA-256/observation time, and OHLCV reconciliation reason. If a missing
minute remains unresolved, `quality_gate=fail` (but the **report is retained**).

The as-of cutoff for any research re-evaluation can be provided with
`--as-of 2026-10-12T09:00:00Z`. A 2015 candle downloaded in 2026 is *not*
visible to a hypothetical model origin in 2015.

```bash
python -m market_data.minute_activity export \
  --minute-database artifacts/market/coinbase_minute.sqlite \
  --hourly-database artifacts/market/coinbase_hourly.sqlite \
  --start 2015-07-21T00:00:00Z --end 2015-07-22T00:00:00Z \
  --output artifacts/warehouse/coinbase_minute_activity_20150721

python -m market_data.minute_activity verify \
  --artifact artifacts/warehouse/coinbase_minute_activity_20150721
```

This export creates immutable `minute_activity.parquet`, `manifest.json`, and
`report.json`. Unknown rows retain nullable prices and volume. `INFERRED_NO_TRADE`
has a zero *inferred* volume and no raw OHLC. Verify enforces Parquet SHA, unique
minute slots, record structure and report/manifest agreement. A failed coverage
gate does not prevent exporting a diagnostic dataset.

**Safe limits:** one exported report per <=744 UTC hours; use date partitions
for long history instead of creating six million in-memory rows. A full 2015–2026
1-minute history would require around twenty thousand API requests, so the
pipeline does **not** silently start that backfill.

## Operational behavior and revisions

- `minute_candles`: immutable distinct payloads per minute.
- `minute_seen`: append-only observations with the actual local collection time.
- `minute_windows`: successful window fetches, UTC bounds, raw HTTP response
  SHA-256 and observed/missing bucket counts.
- `minute_errors`: failed request attempts, never interpreted as no-trade.
- `store_identity`: prevents mixing BTC/USDT or different candle intervals.
- Readers select latest **eligible** observation at the requested as-of time.
  New trades/revisions on a retry can invalidate an earlier inferred no-trade.
- Re-run with identical page length and bounds to resume; use `--retry-gaps`
  explicitly to revisit sparse old windows. The most recent 48 hours are rechecked
  by default when requested within that cutoff.
- Only one writer is allowed per SQLite store, guarded by an OS lock.

## Quality acceptance & restrictions

A one-minute Coinbase candle is validated for UTC minute boundaries, finite
positive OHLC, nonnegative volume, and consistent price envelopes. The
reconciler checks that **every minute of the hour was inside successfully
fetched windows** and that the independent hourly **volume (absolute tolerance
1e-8 BTC, relative tolerance 1e-6)** plus OHLC envelope/first-last trade prices
match within bounded numeric tolerances. If not, missing slots are `UNKNOWN`.

**Never forward-fill raw minute OHLC or silently splice exchanges.** A possible
chart-only carried price must use a separately labeled derived feature, not
replace provider candle values.

Do not confuse a structural pass with verified historical first availability,
exchange-wide zero volume, or a calibrated prediction. Models remain
`research_only` until independent validation.

## CI and live experiment

- Offline unit tests: `python -m unittest discover -s tests -p 'test_minute_activity.py'`.
- Python CI runs real DuckDB/Parquet round-trip tests using `requirements-warehouse.txt`.
- The optional `Coinbase minute activity live verification` GitHub workflow makes
  actual minute/hour requests against a narrow 2015 sample. Its live network
  checks are deliberately **non-gating**: provider downtime should not block
  deterministic repository CI.
- Sources: [Coinbase Exchange product candles API](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles),
  [activity-aware implementation issue](https://github.com/christoverhendri/bitcoin-iris/issues/6).
