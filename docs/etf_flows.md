# Bitcoin IRIS ETF Data Foundation (free-source, research-only)

**Scope:** US spot Bitcoin ETF net flows **per fund per reported US session**, not spot-exchange BTC deposits, ETF trading volume, or BTC market price. Units are **US$ millions**. This collector does not use paid provider APIs or external credentials.

## Provider and rights boundaries

[Farside Investors' public *Bitcoin ETF Flow – All Data* table](https://farside.co.uk/bitcoin-etf-flow-all-data/) is the first source. Its table begins with the January 2024 US spot Bitcoin ETF listings and publishes rows in US$m, including per-fund values and a provider total. It is a *secondary compilation*. Historical flow figures may change with corrections; neither a publication timestamp nor an official historical vintage is supplied per table cell.

**Free to view does not establish permission to automatically scrape or redistribute the resulting dataset.** Check the current site's robots/terms and secure the necessary provider permission before unattended collection or publication. IRIS has a **single bounded, explicitly requested HTTP fetch** and a **manual saved-page import** fallback; no browser impersonation, CAPTCHA handling, proxy rotation, geo-bypass, or paid API. HTTP 403/redirects stop collection. **Bulk historical data is not committed to Git and should not be publicly redistributed without permission.** Source citations/attribution must be retained in any permitted research output.

On source changes, reject ambiguous/misaligned tables and inspect the markup; do not loosen parsing rules just to keep a dashboard green.

## 1. Setup and opt-in ingestion

From the repository root:

```bash
python -m pip install -r requirements.txt -r requirements-warehouse.txt

# Only if terms/access allow: ONE public historical-page HTTP request.
python -m market_data.etf_flows fetch \
  --database artifacts/market/etf_flows.sqlite \
  --output artifacts/probes/etf_fetch_20261012.json

# If automated access is blocked, manually save the public page HTML to disk.
# This imports its exact bytes; it does NOT claim historic publication timestamps.
python -m market_data.etf_flows import \
  --input /path/to/bitcoin-etf-flow-all-data.html \
  --database artifacts/market/etf_flows.sqlite \
  --output artifacts/probes/etf_manual_import.json

python -m market_data.etf_flows status --database artifacts/market/etf_flows.sqlite
```

The import validates the complete HTML **before** writing SQLite. It detects the unique Bitcoin ETF table, fund ticker headers, session dates, printed totals, sign/parenthesis syntax, USDm bounds, table widths, duplicate dates, and reported-fund sum/total agreement with explicit rounding tolerance. A malformed page fails without checkpointing a fake success. Each snapshot stores a source-response SHA-256, actual IRIS `observed_at`, byte count, and coverage bounds. Repeating the identical bytes at another observation time records an additional observation; revisions are never overwritten.

Canonical tables:

- `etf_snapshots`: HTTP/manual provenance, first/last session date and actually observed timestamp.
- `etf_revisions`: distinct immutable `(source, session, payload_sha256)` with first/last seen timestamps.
- `etf_observations`: append-only mapping from *actual* snapshot observation time to a revision, enabling as-of queries. A revision first seen in October 2026 is not used at an earlier 2024 prediction origin.

## 2. Zero is not missing

The provider sometimes prints a dash (`-`) for a fund before its launch, for unreported flows, or on a non-reporting session. IRIS preserves **NULL**, not a guessed $0.

| Input | Canonical interpretation |
|---|---|
| `0.0` per-fund cell | Explicit provider-reported zero net flow |
| `(95.1)` | Provider-reported **−95.1 US$m** outflow |
| `-` / blank per-fund cell | `NULL` / `not_reported`, never zero |
| All fund cells missing, printed total 0.0 | `NO_FUND_DATA`, **not** proof of zero flow / exchange holiday |
| Funds reported, printed total missing | `TOTAL_UNREPORTED`, provider total stays null |
| Fund sum disagrees with reported total | Fail closed; no fake daily measurement |
| No row for a calendar day | Unknown/not available; never create a synthesized zero-flow session |

Absent rows are not automatically weekends or holidays. Source session date is **not** the date the number was published or observed by IRIS. `historical_backtest_safe=false` remains mandatory.

## 3. Quality, immutable Parquet, verification

```bash
python -m market_data.etf_flows quality \
  --database artifacts/market/etf_flows.sqlite \
  --output artifacts/quality/etf_flows_20261012.json

# Same normalized envelope as IRIS's other data-quality reports.
python -m market_data.quality etf \
  --database artifacts/market/etf_flows.sqlite \
  --output artifacts/quality/etf_flows_unified_20261012.json

python -m market_data.etf_flows export \
  --database artifacts/market/etf_flows.sqlite \
  --output artifacts/warehouse/etf_flows_20261012

python -m market_data.etf_flows verify \
  --artifact artifacts/warehouse/etf_flows_20261012
```

Exports are **new-only** directories, with two ZSTD Parquet files:

- `daily_totals.parquet`: `session`, nullable `total_usd_m`, `reporting_state`, actual source `observed_at`, `source_sha256`.
- `fund_flows.parquet`: `session`, `ticker`, nullable `flow_usd_m`, `value_state` (`reported`/`not_reported`), actual `observed_at`, `source_sha256`.
- `manifest.json`: hashes for each Parquet file, row counts, source, schema, units, observation cutoff and explicit `research_only`/`historical_backtest_safe=false` markers.

`verify` checks the exact Parquet bytes (SHA-256), typed column order, row count, duplicate fund/session slots, and null/status invariants. The quality report separately enumerates `REPORTED`, `NO_FUND_DATA` and `TOTAL_UNREPORTED` sessions and per-fund missingness. A structural `pass` is **not proof** of complete historical reporting, release-vintage integrity, nor a validated forecast model.

## 4. Operating limitations and future work

- The collector is **opt-in**. There is no background job or durable live scheduler installed.
- The browser-accessible source may deny GitHub-runner HTTP traffic, or change its HTML. Neither a blocked runner nor a parser failure authorizes bypassing source restrictions. Use permitted manual import if necessary.
- Bitbo's free public recent-window ETF table is a possible **separate cross-source comparison**; its paid API is **not required or used** by this collector. A same-day USDm discrepancy may be due to revision/time-of-day; preserve per-provider identities.
- Not yet integrated into the terminal ETF view or Quant IRIS models. Do not assume trading-session-day values were published by the session's close. For models, prospective observations can only be used after IRIS `observed_at`, or reconstruct authoritative release vintages first.
- ETF data starts in **2024**, not 2015. Never backfill ETFs with artificial zeros into earlier Bitcoin price history.
- The next cross-provider reconciliation and availability catalog work belongs in [ETF issue #9](https://github.com/christoverhendri/bitcoin-iris/issues/9) and the unified data inventory [#8](https://github.com/christoverhendri/bitcoin-iris/issues/8).

Run deterministic tests with `python -m unittest discover -s tests -p test_etf_flows.py -v`. The repo's standard CI installs DuckDB and verifies the full CSV/SQLite/Parquet independent integration test without requesting live vendor pages.
