# Bitcoin IRIS hourly BTC/USD backfill (free Coinbase Exchange API)

**Scope:** noncommercial research; **1-hour UTC**, venue-specific `BTC/USD`, no trading, no paid market data, no custom credentials. The historical backfill is **retrospective**. It does not certify that an old candle's value was known to the vendor exactly at its hour boundary.

## API verification

Official endpoint: [`GET /products/BTC-USD/candles`](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles).

- Public GET accepts granularity `3600` for 1h; request count max **300 candles**, so collector uses **240-hour pages**.
- Coinbase says returned data may include buckets preceding requested `start`; only rows within **`[start, end)`** are imported.
- Source may omit an interval with no trades; gaps are **reported and not filled**.
- Open, unfinished UTC hours are not fetched. The end cutoff is exclusive and cannot exceed the current completed-hour boundary.
- Responses are validated for content type, bounded response size, candle shape, UTC alignment, finite positive OHLC, high/low envelope, and nonnegative volume. Rejected pages are **not checkpointed**.
- Rate errors (429) and 5xx receive bounded retries with `Retry-After`; HTTP redirects and alternate hosts are not followed. Requests are paced at **0.4 s** between pages by default.
- The earliest BTC/USD candle remains an **empirical discovery**, not a contracted Coinbase retention guarantee. Use `probe` on historical windows and inspect actual results before claiming an earliest date. 2015-07-20 is a discovery target, not verified start.

The direct network of the assistant's execution container did not resolve `api.exchange.coinbase.com`; this is a **network restriction, not proof of Coinbase outage**. Run the separate live GitHub Actions verification workflow, or use the following local commands. No unit fixture is a substitute for a live check.

## 1. Live probe (does not save candles)

```bash
python -m market_data.hourly_prices probe \
  --start 2026-10-01T00:00:00Z --end 2026-10-02T00:00:00Z \
  --output artifacts/probes/coinbase_recent.json

python -m market_data.hourly_prices probe \
  --start 2015-07-21T00:00:00Z --end 2015-07-22T00:00:00Z \
  --output artifacts/probes/coinbase_early.json
```

The results report the **real** number of returned hours, missing slots, first/last UTC hour, and response SHA-256. A 200 with an empty list is **not evidence** of complete history. The range is deliberately historical; its availability is checked at run time.

## 2. Resumable full historical collection

```bash
python -m pip install -r requirements.txt
python -m market_data.hourly_prices backfill \
  --start 2015-07-20T00:00:00Z --max-pages 1000 \
  --database artifacts/market/coinbase_hourly.sqlite \
  --output artifacts/probes/backfill_run_1.json

python -m market_data.hourly_prices status \
  --database artifacts/market/coinbase_hourly.sqlite
```

The open current hour is excluded automatically. For repeat incremental runs, rerun `backfill` with the **same start, page length and database**: successfully fetched windows are skipped, while windows containing the last 48 hours are rechecked for source corrections. `--max-pages 12` is the CLI default for bounded runs; `1000` supports a complete 11-year hourly scan if Coinbase provides the data. The run report distinguishes **all_windows_visited** from actual gap-free coverage and returns a `next_start` cursor when a request budget is exhausted. `--retry-gaps` selectively rechecks previously sparse historical windows; missing hours are not silently invented.

SQLite tables:
- `hourly_candles`: unique `(ts,payload_sha256)` value versions; `observed_at` when this version was first seen and `last_seen_at` of its latest re-observation.
- `hourly_windows`: completed page checkpoints with response checksum, fetch time, observed and missing counts.
- `store_identity`: Coinbase venue/instrument/granularity guard. OS lock ensures only one collector writes each database.

Use a persistent disk and one writer. GitHub Actions artifacts are temporary export samples, **not** a substitute for your durable local copy.

## 3. Verified Parquet and optional daily OHLCV

```bash
python -m pip install -r requirements-warehouse.txt
python -m market_data.hourly_prices export \
  --database artifacts/market/coinbase_hourly.sqlite \
  --start 2020-01-01T00:00:00Z --end 2026-10-11T00:00:00Z \
  --output artifacts/warehouse/coinbase_hourly_2020_20261011

python -m market_data.hourly_prices verify \
  --artifact artifacts/warehouse/coinbase_hourly_2020_20261011

python -m market_data.quality hourly \
  --artifact artifacts/warehouse/coinbase_hourly_2020_20261011 \
  --output artifacts/quality/coinbase_hourly_2020_20261011.json
```

The warehouse exports a **new, immutable** `hourly.parquet` with UTC epoch seconds, OHLCV, first-observed timestamp, source content hash, and a SHA-256-bound manifest. It selects the **most recently observed source revision** per hour. `verify` checks schema, hash, bounds, invariants, duplication, and completeness. A quality failure is explicit; `--end` cannot include uncompleted hours.

Optional conversion to the existing daily research pipeline requires **all 24 hours in each UTC day**:

```bash
python -m market_data.hourly_prices daily \
  --artifact artifacts/warehouse/coinbase_hourly_2020_20261011 \
  --start 2020-01-01T00:00:00Z --end 2026-10-11T00:00:00Z \
  --output artifacts/market/derived_daily_2020_20261011

python -m market_data.warehouse prices \
  --artifact artifacts/market/derived_daily_2020_20261011 \
  --output artifacts/warehouse/derived_daily_2020_20261011

python -m market_data.quality prices \
  --artifact artifacts/warehouse/derived_daily_2020_20261011 \
  --output artifacts/quality/derived_daily_2020_20261011.json
```

If any hour is missing, daily derivation **raises** instead of interpolating. Derived `prices.csv` has a `derived_from` and `source_hourly_sha256` in the provenance. It is **not** the same product as Coinbase's native daily feed. Compare independently before substituting it for forecasting data; do not splice other venues or BTC/USDT prices.

## Optional activity-aware 1-minute sampling

For research on trading inactivity, the [minute activity collector](minute_activity.md)
uses the independent Coinbase 1-hour candle as a conservative reconciliation
reference. It stores minute candles separately and classifies absent minutes as
`UNKNOWN` by default. No 1-minute data is inserted into the existing hourly
store or used to fill missing 1-hour price candles.

## 4. Integration and boundaries

- Existing `news_pipeline.market_prices` remains daily-only and unchanged. Existing `market_data.warehouse prices`, `market_data.quality prices`, and `news_pipeline.forecast_model` continue accepting verified daily artifacts. Hourly is a **separate typed kind** (`prices_hourly`) and cannot be passed directly to daily forecasting.
- On-chain SQLite, news pipelines, terminal runtime, forecast promotion criteria, and `main` branch are unchanged.
- GitHub Actions Python CI runs offline fake-HTTP regression tests and actual DuckDB/Parquet round-trip tests. **Live Coinbase reachability is tested separately**, not made a required PR merge gate: provider downtime or runner IP geo-block must not invalidate deterministic code tests.
- Large warehouse exports must use new directory names; Parquet rows are capped at 250,000 per immutable snapshot. For substantially larger datasets, partition by period.
- A Coinbase API response isn't guaranteed free for redistribution as a public bulk dataset; review provider terms before sharing full historic artifacts outside this research project.
