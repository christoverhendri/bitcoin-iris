# IRIS local research warehouse: SQLite + Parquet + DuckDB

**Status:** optional analytics read-model for noncommercial research. It does **not** change the current Next.js terminal, auto-run a collector, modify historical CSVs, or promote forecasting models.

## Division of responsibilities

| System | Authority | Why |
|---|---|---|
| `artifacts/market/observations.sqlite` | Canonical on-chain observed revisions and missingness | Idempotent ingestion, durable metadata, transactions and as-of reads |
| `artifacts/news/data.sqlite` | Canonical raw news / parser job state | Checkpoints, replay, quarantine, audit |
| `artifacts/market/<coinbase-run>/prices.csv` + `provenance.json` | Canonical *downloaded* Coinbase OHLCV artifact | Vendor-specific daily bars, timestamp validation, SHA-256 provenance |
| `artifacts/warehouse/<run>/...parquet` | Immutable derived analytical snapshot | Compressed columnar scans, reproducible model input |
| In-memory DuckDB | Queries/Parquet conversion, **not** another persisted canonical database | No extra server, service or synchronization process |

All new files stay under `artifacts/` and are gitignored. **Do not replace SQLite with DuckDB or keep a duplicate mutable table in DuckDB.** Never copy a SQLite WAL file without checkpoint-safe backup.

## Setup (optional)

Python 3.11+:

```bash
python -m pip install -r requirements.txt -r requirements-warehouse.txt
```

The default ingestion CLI and the terminal need **neither DuckDB nor Parquet**. The optional warehouse package installs just the `duckdb` Python wheel; no PyArrow, server, login or paid API is required.

## From free data to Parquet

Use the existing no-key Coin Metrics collector and canonical ingestion first:

```bash
python -m market_data.coinmetrics --start 2026-09-01 --end 2026-10-11 --output artifacts/market/onchain_20261011
python -m market_data.observation_store --database artifacts/market/observations.sqlite import --artifact artifacts/market/onchain_20261011
python -m market_data.warehouse onchain --database artifacts/market/observations.sqlite --output artifacts/warehouse/onchain_20261011
python -m market_data.warehouse verify --artifact artifacts/warehouse/onchain_20261011
python -m market_data.warehouse as-of --artifact artifacts/warehouse/onchain_20261011 --metric TxCnt --origin 2026-10-11T14:00:00Z
```

`--end` is exclusive and historical downloads **are not** retroactively point-in-time valid. The on-chain Parquet includes all known revisions, states and `observed_at` timestamps, not one overwritten value per measurement day. Queries select only completed measurement days, latest known eligible revisions and the requested maximum age. Unknown or missing data stays unavailable instead of being filled with zero.

Convert a **previously validated** free Coinbase price artifact:

```bash
python -m news_pipeline.market_prices --start 2020-01-01 --as-of 2026-10-11T00:00:00Z --output artifacts/market/coinbase_20261011
python -m market_data.warehouse prices --artifact artifacts/market/coinbase_20261011 --output artifacts/warehouse/coinbase_20261011
python -m market_data.warehouse verify --artifact artifacts/warehouse/coinbase_20261011
```

A Coinbase Parquet build verifies the source CSV against its SHA-256 manifest, daily UTC date continuity, unique chronological observations, OHLC consistency, finite values, and volume nonnegativity. No extra cross-venue blend or guessed candle is inserted. Every new warehouse output directory must be unique; existing outputs are refused instead of overwritten. The original CSV is never deleted.

## Forecast and diagnostic integration

The existing `news_pipeline.system_diagnostics` / `news_pipeline.forecast_model` entry points accept **either their existing CSV input or the verified warehouse price Parquet path** through `--prices`:

```bash
python -m news_pipeline.system_diagnostics --prices artifacts/warehouse/coinbase_20261011/prices.parquet --as-of 2026-10-11T00:00:00Z --output artifacts/warehouse/diagnostics_20261011.json
python -m news_pipeline.forecast_model train --prices artifacts/warehouse/coinbase_20261011/prices.parquet --as-of 2026-10-11T00:00:00Z --output artifacts/system/model_20261011
```

The warehouse writes a `provenance.json` beside price Parquet, with `instrument=BTC/USD`, Coinbase `venue` and the hash of the **Parquet itself**. The model's existing `source_venue` check therefore rejects a mismatched file/hash/venue. The model's existing chronological evaluation, feature definitions, artifact status and forecast promotion gates are unchanged.

The price timestamp contract remains **an assumption**, not authenticated historical vendor availability: day D's close is treated as usable at D+1 00:00 UTC; actual Coinbase latency has not been established. The `historical_backtest_safe: false` flag must remain false for retrospectively downloaded historical data. Do not use recently collected on-chain history as if it had been observed years ago.

## Data and integrity contract

- Format: ZSTD-compressed Parquet, **one immutable output file per materialization**. Versioned `manifest.json` records kind, row count, source and SHA-256. Prices also write the sibling model-compatible `provenance.json`.
- Schema `onchain`: `source, metric, day, observed_at, value, state, snapshot_sha256`. `value` remains text to preserve source precision and explicit null semantics; cast a validated metric to a numeric type in downstream analysis when required.
- Schema `prices`: `date, Low, High, Open, Close, Volume`, typed for the existing forecast model.
- SQLite is read in a single read transaction. A failed Parquet conversion removes its temporary build directory. No persistent DuckDB cache is needed.
- `verify` checks the hash, schema, row count and price-model provenance before trusting an output. An on-chain Parquet as-of query verifies the manifest first.
- This is a **local single-owner** research workflow: export during or after collection, but publish into a distinct path. Do not mutate Parquet in-place, do not hand a historical store multiple independent writers, and retain/source-control the necessary manifests *outside* gitignored run artifacts as appropriate for a reproducible experiment.
- **Resource envelope:** at most two million records per export, streamed from SQLite in batches. For substantially larger timeseries, add bounded time partitions and compacted immutable batches rather than spawning thousands of tiny Parquet files.

## Integration and regression checks

```bash
python -m unittest discover -s tests -p 'test_*.py'
npm test
npm run lint
npm run build
```

GitHub Actions installs `requirements-warehouse.txt` in the Python test job; the repository's normal Next.js build does **not** require the warehouse dependency. The warehouse tests cover SQLite round-trip/as-of parity, revisions and missingness, manifest tampering, immutable publication, Coinbase gaps/duplicate rejection, and loading Parquet in the unchanged forecast pipeline.

The warehouse is a research **read model**, not a production multi-writer data service. If IRIS becomes a horizontally scaled service with independent writers, migrate operational state to a shared transactional system separately instead of treating the Parquet folder as a writable database.

References: [DuckDB Parquet](https://duckdb.org/docs/current/data/parquet/overview), [DuckDB Python](https://duckdb.org/docs/current/clients/python/overview), [SQLite WAL](https://sqlite.org/wal.html).
