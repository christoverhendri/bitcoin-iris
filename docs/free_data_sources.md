# Bitcoin IRIS: free-source data policy and first implementation

**Scope:** noncommercial research ingestion. Zero paid API plans. All vendor terms, limits, source timestamps, and missingness must remain visible.

## Recommended source roles

| Class | Primary free source | Backup/check | Caveat |
|---|---|---|---|
| BTC/USD historical OHLCV | Coinbase Exchange public candles, currently used by `news_pipeline/market_prices.py` | Kraken public OHLC, recent cross-check only | Coinbase needs <=300-candle pages; Kraken OHLC only exposes a short rolling window (up to 720 observations) |
| BTC network/on-chain | Coin Metrics Community API (new `market_data/coinmetrics.py`) | Blockchain.com Charts API; Blockchair as terminal currently uses | Coin Metrics Community: CC BY-NC 4.0, noncommercial and attribution; some metrics require payment and must be rejected rather than silently upgraded |
| Fee and mempool health | Blockchair / blockchain.com already wired in terminal; mempool.space if service reachable | Keep original provider observations | A single fee recommendation cannot justify invented confirmation-tier measurements |
| Sentiment index | Alternative.me `/fng/`, already present | None | Attribution, no evidence of causal BTC returns |
| Macro | FRED/ALFRED | Original release calendar | Free key required; use vintages/release timestamps, do not backfill future revisions |
| Headlines and events | Existing RSS, Watcher.Guru preview | Other legally permitted RSS feeds | Publishing dates are not ingestion dates; coverage can be incomplete |
| US spot BTC ETF daily net flows | Farside all-data public HTML (optional, manual HTML import available) | Bitbo public recent-window table for future separate comparisons | Free-to-view is not guaranteed scraping/redistribution permission; reported session != vendor release time; printed '-' is missing, not zero |

Avoid claiming free-commercial-use from a free API endpoint. Review license/redistribution terms before enabling a public paid deployment.

**On-chain v2 decision:** the short Atlas Community *raw* query window is **not a blocker**
for historical **daily aggregated network metrics**, nor does it prevent
an independent Bitcoin Core-based **confirmed transaction/UTXO analytics**
track. Bootstrap source-reported aggregates from qualified free historical
archives or the Community asset-metrics API, then perform bounded
incremental updates. Develop block-to-transactions analysis as a separately
bounded pilot with reorg handling and prevout evidence; a full-node index has
hardware/network costs but needn't use a paid market-data API. Do not promise that every legacy metric is free or that a
historical archive is current. The [on-chain data specification](onchain_data_specification.md)
records provenance, access limits, metric acceptance rules, and optional raw-query
work separately. The Coin Metrics public `btc.csv` archive's newest commit observed
during our 2026-10-12 audit was **2026-05-24**, despite its README advertising daily
updates: require an explicit freshness test before ingestion uses it as a current source.

## Optional free-source ETF daily flow collector

`market_data.etf_flows` supports strict parsing of public Farside
US spot Bitcoin ETF flow tables (per-fund USD millions and reported totals),
opt-in single-page access or manually saved HTML, append-only SQLite
revisions and explicit local observation time. It is **research only**,
has no source-verified 2024 historical publication vintages, and cannot
be used as a leak-free feature for 2024 backtests merely because the
source page can be downloaded now. Publicly visible does not mean
free bulk data redistribution or guaranteed permission to scrape.
Source `-` stays null; all-unreported rows do not imply zero flows.
See [ETF data guide](etf_flows.md) and [issue #9](https://github.com/christoverhendri/bitcoin-iris/issues/9).
No paid Bitbo API is used or implied.

## New offline-testable Coin Metrics collector

Install the repository's normal Python dependencies (`pip install -r requirements.txt`), then run from the repository root:

```sh
python -m market_data.coinmetrics --start 2026-09-01 --end 2026-10-11 --metrics AdrActCnt,TxCnt --output artifacts/market/coinmetrics_20261011
python -m unittest discover -s tests -p 'test_free_market_data.py' -v
```

**Note:** this is a prepared module, and no live call was made as part of its offline tests. Check chosen metric availability on the free Community API when operating it. The default two metrics are starting candidates, not guaranteed entitlements. `--end` is **exclusive** and must be at or before the current UTC day; today's unfinished measurement is excluded. Pagination is capped, slow-paced, and restricted to the one HTTPS Community endpoint. Responses are checked for malformed data, duplicate contradictions, out-of-range metrics, unexpected assets, oversized bodies, 403 paid-tier errors, nonfinite values, and redirect attempts.

Outputs in a **new** directory:

- `onchain_daily.csv`: one row per day × metric, `date,metric,value,state,observed_at`. A null stays empty. `state` distinguishes `observed`, `missing_metric`, and `missing_day`.
- `provenance.json`: source, UTC extraction time, metric list, day interval, content SHA256, provider-page SHA256s, missing-day inventory, terms notice, and `historical_backtest_safe: false`.

The timestamp `date` names the *measurement period*, not when the value became usable. `observed_at` is when this system first acquired the snapshot. A dataset of older values downloaded today remains a **retrospective snapshot** and must not be inserted into a historical point-in-time feature set. This module does **not** connect to, alter, or auto-promote the forecasting model.

## Point-in-time as-of guard (new)

`market_data/point_in_time.py` supplies `value_at_origin(rows, metric, forecast_origin, max_age_days=2)` for research joins. It rejects all measurements fetched after the origin, requires the full UTC measurement day to have completed, selects the latest eligible revision, and represents stale/missing values as null rather than zero. **Do not use it to retroactively certify vintage timestamps that the source never provided.**

Example: `value_at_origin(rows, 'TxCnt', '2026-10-11T14:00:00Z')`. The function operates on individual observation rows (including `onchain_daily.csv` rows read using `csv.DictReader`). Test with `python -m unittest discover -s tests -p 'test_point_in_time.py' -v`.

## Durable local observation store (implemented)

The collector exports immutable CSV + SHA-256 manifest files. Ingest them into a
local **append-only SQLite** store; never import retrospective history as
"known" at its original measurement date. The importer verifies CSV hash,
row count, date interval, data types, explicit missingness, and snapshot identity.
An identical snapshot import is idempotent; different values at the same
(source, metric, day, observed_at) raise an error instead of overwriting.

```sh
# First run the collector shown above (requires public internet).
python -m market_data.observation_store --database artifacts/market/observations.sqlite import --artifact artifacts/market/coinmetrics_20261011
python -m market_data.observation_store --database artifacts/market/observations.sqlite status
python -m market_data.observation_store --database artifacts/market/observations.sqlite as-of --metric TxCnt --origin 2026-10-11T14:00:00Z
python -m unittest discover -s tests -p 'test_observation_store.py' -v
```

The store keeps revisions and missing-state rows; its as-of queries select only
completed, already-seen observations. A downloaded historical snapshot receives
the **download time**, so old backtests cannot use it as if it had existed then.
The manifest hash protects against accidental CSV edits, **not intentional
forgery**, and the store does not claim historical vintages or vendor release
hours. A local administrator with database access can still edit records.
Do not set `historical_backtest_safe=true` to bypass this restriction.

## Optional Parquet + DuckDB analytical snapshots (implemented)

Canonical SQLite remains authoritative for revisions, `observed_at`, ingestion and checkpoint state. The optional warehouse reads SQLite in a snapshot transaction and exports ZSTD Parquet with all versions and missingness, while Coinbase price Parquet is built only from the hash-verified OHLCV CSV artifact. Existing Python diagnostic and forecast entry points can read the Parquet price path without altering their statistical methods. No model promotion, expensive inference, paid provider, or always-on server was added. See [research warehouse guide](warehouse.md); install `requirements-warehouse.txt` separately.

## Data-quality and storage benchmark (implemented)

`market_data.quality` now emits fail-closed operational checks of Coinbase
OHLCV snapshots, on-chain revisions/missingness, legacy research-only history,
and overlap-only Coinbase/reference cross-venue differences. `market_data.benchmark`
tests numerical equivalence of SQLite vs DuckDB/Parquet as-of lookups before
reporting warm read times. Verified Parquet input into the existing forecast model
requires a passing SHA-256-bound quality report, but **no historical vendor
availability or model promotion is inferred**. See [Data Quality Gate guide](data_quality.md).

## Data correctness gates for next phase

1. **Quarantine existing `bitcoin iris/dataset/master/*.csv` for retrospective research only** until rebuilt with verified availability. The legacy README explicitly documents `bfill()` and estimated macro release lags. `.ffill()` can only carry forward values already known at the forecasting origin; never `bfill()` for deployable history. Treat undefined periods as missing and report coverage. Fixed guessed publication lags do not replace an authoritative release/vintage calendar.
2. Extend the new append-only Community observation store to Coinbase and vetted macro sources. Store verified release timestamps and source-provided historical vintages when available. Re-fetching today cannot retroactively establish an old first-seen time.
3. Validate Coinbase vs Kraken **only on overlapping, completed UTC bars**. Both venues are genuine but not identical market prices; report spread and disagreement without blending them into fake single-venue candles. Kraken REST OHLC cannot backfill unlimited 2015-present history.
4. Implement historical data quality reports: per-source freshness, duplicates, UTC day gaps, timestamp anomalies, non-finite values, mismatched units, chain reorgs/revisions, percentage of carried values, and data availability flags.
5. Include provider errors/429 retry/backoff, fixed free-tier fetch budgets, and legal attribution in scheduled ingestion. Do not fall back to mock, zero, or a paid API without disclosure.
6. Only after the point-in-time store is ready, compare market-only against added on-chain, macro, and news features under purged chronological validation; no automatic model promotion.

## Official documentation

- Coin Metrics: https://docs.coinmetrics.io/api/v4/ and https://github.com/coinmetrics/data (Community CC BY-NC 4.0)
- Coinbase: https://docs.cdp.coinbase.com/exchange/reference/exchangerestapi_getproductcandles
- Kraken: https://docs.kraken.com/api/docs/rest-api/get-ohlc-data
- Alternative.me: https://alternative.me/crypto/fear-and-greed-index/
- FRED/ALFRED: https://fred.stlouisfed.org/docs/api/fred/realtime_period.html

## News version-selection correctness

The existing `news_pipeline data export` and `daily` commands now select known
post versions based on `observed_at` (operational ready mode), rather than raw
SQLite insertion id or the order a delayed parser happened to finish. Retrospective
`publication` mode selects by publication time and remains explicitly marked
non-point-in-time. Feature readiness must still be earlier than `--as-of`.
Regression tests cover out-of-order imports, delayed parsing, cutoff rules, and
retrospective versions. Neither mode turns a downloaded historical archive into
genuine knowledge-as-of-past-date data.
