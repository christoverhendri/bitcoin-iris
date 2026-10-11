# IRIS M1: Trusted Data / Data Quality Gate

This is a **noncommercial research** quality gate. All market providers remain free. No database server, proprietary dependency, API key or paid service is installed. The terminal's default data sources and existing SQLite ingestion remain unchanged.

A valid file is **not** proof that historical source values were released at that time. All quality reports deliberately set `historical_backtest_safe: false`. The legacy master datasets still have estimated release lags and backward-fill history and remain **retrospective-only**.

## Setup

```sh
python -m pip install -r requirements.txt -r requirements-warehouse.txt
```

`duckdb` is optional unless inspecting Parquet or running the benchmark. SQLite/CSV-only quality reporting works with the Python standard library and the existing baseline dependencies.

## 1. Validate verified Coinbase daily OHLCV

Given a Coinbase `prices.csv` plus its matching `provenance.json` from `news_pipeline.market_prices`:

```sh
python -m market_data.quality prices \
  --artifact artifacts/system/coinbase_20261011 \
  --as-of 2026-10-12T00:00:00Z \
  --max-age-days 3 \
  --output artifacts/quality/coinbase_20261012.json
```

For a Parquet warehouse created with `market_data.warehouse prices`, use `--artifact artifacts/warehouse/prices_...` instead. The same gate checks the verified Parquet hash and schema before inspecting rows.

Checks: Coinbase venue/instrument identity, content SHA-256, fetched-at availability, requested UTC range, unique dates, complete daily series, strictly positive finite OHLC, nonnegative volume, and high/low envelope validity. Source creation time, measurement dates and forecast origin remain distinct. By default **100% of expected completed UTC days** must exist. If a vendor snapshot has a real gap, the command returns a nonzero exit code and writes an explicit failing report. `--max-age-days` is optional; use it for live-readiness decisions, not archived research datasets.

**Existing model integration:** Parquet price model training/inference now requires `--quality-report` bound to the exact Parquet bytes; a mismatching or failing report aborts before any training or model deserialization. Verified CSV can also opt into this flag. The report's `pass` only means data-quality checks passed; the forecast artifact remains `research_only`, and no source is automatically promoted to `validated`.

```sh
python -m news_pipeline.forecast_model train \
  --prices artifacts/warehouse/prices_20261012/prices.parquet \
  --quality-report artifacts/quality/coinbase_20261012.json \
  --as-of 2026-10-12T00:00:00Z \
  --output artifacts/system/forecast_research_20261012
```

For analysis with an older historical origin, distinguish **retrospective experiments** from claims about real-time availability. A snapshot collected today cannot be used to certify a genuine earlier information set. A source-vintage/release-time audit is still required for point-in-time evaluation.

## 2. Audit canonical on-chain revisions

```sh
python -m market_data.quality onchain \
  --database artifacts/market/observations.sqlite \
  --as-of 2026-10-12T00:00:00Z \
  --min-coverage 0.95 \
  --max-age-days 3 \
  --output artifacts/quality/onchain_20261012.json
```

Validates actual source/missingness state and timestamp values, snapshot/checkpoint links, preserves distinct versions and counts revisions, reports per-metric explicit/implicit gaps, coverage and freshness. It does **not** replace missing data with zero. Only rows acquired at/before the requested origin are included; the report is descriptive for retrospective downloads, not an authorization to backtest at arbitrary dates.

## 3. Historical legacy inventory (not a passing production gate)

```sh
python -m market_data.quality legacy \
  --csv 'bitcoin iris/dataset/btc/btc_daily_features.csv' \
  --output artifacts/quality/legacy_btc_inventory.json
```

This check inventories date gaps, duplicates, invalid closes and file SHA-256 for the checked-in legacy file, but reports `quality_gate: research_only` even when the series is structurally clean. CI publishes this inventory for inspection without using it as model-promotion evidence.

## 4. Cross-venue comparison (Coinbase vs a separate free reference)

Provide a CSV with `date,Close` for **completed daily UTC candles** sourced independently from Kraken or another vetted market venue. Fetching is intentionally separate from this scanner: the comparison does not silently trust a user-provided CSV as a Kraken-verified artifact.

```sh
python -m market_data.quality cross-check \
  --primary artifacts/system/coinbase_20261011 \
  --reference artifacts/market/kraken_recent_daily.csv \
  --min-overlap 30 --max-difference-bps 100 --max-breach-pct 5 \
  --output artifacts/quality/coinbase_kraken_20261012.json
```

Uses **only overlapping UTC dates**, never combines market prices into a fabricated common candle. The difference is absolute log basis points, `10000 * abs(log(P_coinbase/P_reference))`. High basis points can reflect genuine venue spreads, a quote-currency difference, stale prices, or bad data; the metric is a **comparison**, not proof of fraud or a universally valid threshold. A limited Kraken OHLC window cannot establish 10 years of cross-source completeness.

## 5. Reproducible storage benchmark (no invented speed gains)

Create an immutable on-chain Parquet warehouse from the **same** SQLite database:

```sh
python -m market_data.warehouse onchain \
  --database artifacts/market/observations.sqlite \
  --output artifacts/warehouse/onchain_20261012

python -m market_data.benchmark \
  --database artifacts/market/observations.sqlite \
  --artifact artifacts/warehouse/onchain_20261012 \
  --metric TxCnt --origin 2026-10-12T00:00:00Z \
  --repeats 15 --output artifacts/quality/benchmark_20261012.json
```

Before timing, the tool verifies the Parquet hash/schema/row count and checks that results match SQLite at the same cutoff; differing data aborts benchmark. Reports median/p95/min/max times for warm-cache point lookup and numeric aggregation, plus disk bytes. Do not interpret it as a network throughput, writes/concurrency, RAM, or general application-performance benchmark. DuckDB column scans and indexed SQLite lookups are different operations. **No winner is predetermined.** For stable comparisons run multiple cold/warm trials on the target machine using actual IRIS data.

## Contracts and limitations

- The report is new-file-only, JSON schema `iris-data-quality/v1`. Failed validation writes a report with `quality_gate: fail` and exits with status 1; it never modifies raw data. Use a new output path for each attempt.
- Price quality reports are tied to the source CSV/Parquet bytes via SHA-256; these are local integrity checks, not signatures of historical market publication.
- Existing forecasts remain research-only. `quality_gate: pass` must **never** be substituted for validation of predictive performance, real-time readiness, historical data-vintages, or a trading recommendation.
- On-chain coverage uses the span between each metric's first and last eligible observed UTC dates. Data outside that span, provider downtime before initial collection and unrecoverable history require separate source inventories. Distinguish `missing_day`, `missing_metric`, and implicit gaps.
- The `legacy` inventory includes historic feature CSV records but cannot reconstruct missing provenance or macro revision history. Rebuild these datasets from verified original sources before a strict economic backtest.
- CI installs the optional open-source DuckDB extra to exercise the actual Parquet/SQLite integration. No DuckDB dependency is added to runtime startup.

## Acceptance tests

```sh
python -m unittest discover -s tests -p 'test_data_quality.py' -v
python -m unittest discover -s tests -p 'test_benchmark.py' -v
python -m unittest discover -s tests -p 'test_warehouse.py' -v
python -m unittest discover -s tests -p 'test_*.py'
```

The GitHub Actions Python job additionally creates a research-only inventory of the checked-in legacy daily BTC dataset. The report is downloadable from the workflow's artifacts. No live provider request is made in CI.
