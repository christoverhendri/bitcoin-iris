# IRIS Data Specification: Bitcoin On-chain Metrics (v2 proposal)

**Decision recorded:** 2026-10-12. **Status:** specification only; the v2 expansion
is **not implemented, enabled or scheduled** by this document.
**Scope:** free-source, noncommercial research; BTC mainnet; UTC daily aggregates
first. This is a data-ingestion contract, not a prediction model or claim of
complete access to every blockchain metric.

## 1. Historical raw data is NOT the v2 blocker

Three different data products must never be confused:

| Data product | Historical strategy | v2 requirement | Access constraint |
|---|---|---|---|
| Daily aggregated network metrics | Free Coin Metrics Community asset-metrics API and/or vetted historical CSV; Blockchain.com historical charts where supported | **Required** once source entitlement/coverage is verified | Free metric set may change; chart sampling/units must be checked |
| Recent raw transactions, addresses and UTXO queries | Coin Metrics Atlas Community or permitted public explorer endpoints | **Optional research** | Atlas Community's documented **30-day search window** does not give eleven years of raw access |
| Fully reconstructed historical UTXO/transaction-level datasets | Independently indexed Bitcoin node or a separately licensed/authorized archive | **Deferred** | Hardware, storage, indexing, computation and possibly paid data can be substantial |

**Policy:** Do not allow an Atlas 30-day *raw* lookback to block acquisition of
available historical *aggregate* daily metrics. Conversely, do not claim a full
raw transaction history can be recovered from the Community metrics CSV.
SOPR, historical UTXO age distributions, exact holder attribution and any
other metrics requiring raw history stay pending until a reproducible free
calculation or authorized historical source is verified.

## 2. Actual repository state vs candidate metric inventory

Already implemented in `market_data/coinmetrics.py`:
- Default Community request: `AdrActCnt` and `TxCnt` (UTC daily).
- An explicit `--metrics` option accepts **1–12 distinct metrics per request**;
  it does not confer entitlement to restricted metrics.
- Up to **100 pages** per run, `page_size=1000`, conservative 0.7-second
  inter-page pacing, bounded retries, no paid API-key fallback.
- Immutable CSV + SHA-256 manifest; local append-only SQLite revisions
  and state labels `observed`, `missing_metric`, `missing_day`;
  optional ZSTD Parquet for DuckDB analytics.
- No always-on on-chain ingestion daemon and no confirmed persistent source
  data in a checked-in repository artifact.

Candidates for free-metric discovery, **not approved entitlements or verified
coverage in the current IRIS installation**: `HashRate`, `BlkCnt`,
`FeeTotNtv`, `SplyCur`, `CapMVRVCur`, `FlowInExNtv`,
`FlowOutExNtv`, `SplyExNtv`, plus appropriately defined difficulty,
fees and network activity chart series. Fund/exchange-address estimates are
**source-specific tracked subsets**, not total-market measurements.

The checked-in legacy `bitcoin iris/dataset/kategori/onchain.csv` is
**documented** as 19 metrics sourced from Blockchain.com and Coin Metrics,
including forward-filled gaps. It is **research-only** until the individual
metrics, original provider definitions, missing observations and collection
vintages are re-audited; its presence does not mean v2 ingests 19 metrics.

## 3. Free source roles and verified external constraints

| Provider | Role | Limit/reliability contract |
|---|---|---|
| Coin Metrics Community **asset metrics** | Primary free historical daily network observations and daily incremental checks | Community HTTP API documents **10 requests / 6 seconds per IP**. Verify BTC + requested metric entitlement. Some metric codes are not Community-accessible |
| `coinmetrics/data` `csv/btc.csv` | Bootstrap candidate only when schema and date coverage pass | README advertises daily updates, but the latest BTC CSV commit **observed on 2026-10-12 was dated 2026-05-24**. Treat freshness as unverified until checked at download time; don't assume it contains October observations |
| Blockchain.com Charts API | Alternative daily chart metrics and independent comparisons | Verify chart unit, UTC alignment, `sampled` behavior, chronological bounds, payload cap, missingness and availability |
| Coin Metrics **Atlas Community** | Optional recent raw/on-chain lookups | Historical raw search window is **last 30 days**, according to current Atlas documentation; NOT a 30-day cap on Community daily aggregate histories |
| Public mempool/explorer endpoints | Optional recent mempool, address and block context | Provider reachability can vary; do not infer complete historical market/holder coverage from current data |

**Access design:**
1. Discover supported `btc` metrics and actual earliest/latest **non-null**
   dates before constructing a historical ingest plan. Report unsupported
   or paid-only responses as unavailable; do not substitute fabricated zero.
2. If a historical CSV is used, validate the actual file's SHA-256, commit/source
   revision, schema, UTC days, content date bounds and age. Use a pinned immutable
   artifact as the backfill snapshot; do **not** rely on a moving GitHub raw URL.
3. Use the API for missing periods and incremental updates, with a per-source
   request budget, backoff on HTTP 429/5xx, support for `Retry-After`, and
   checkpointed progress. Do not continuously fetch the full history.
4. Keep independent provider measurements separated by `source` and metric
   definition until comparable units, timestamps and statistical coverage
   have been established. A fallback provider is **not** the same timeseries.

## 4. Canonical data contract (target for v2)

Each source-specific metric version must carry:

| Field | Rule |
|---|---|
| `source`, `network`, `metric`, `unit`, `frequency` | Explicit; never treat a different vendor's metric code as identical without a mapping review |
| `period_start`, `period_end` | UTC measurement interval; distinguish measurement date from actual availability |
| `value` | Numeric or **NULL**, never NaN, guessed default, or an invalid zero |
| `state` | `observed`, `missing_metric`, `missing_day`, or separate `source_unavailable`/entitlement failure in ingestion health |
| `observed_at` | Actual time IRIS first acquired a source version; never overwritten by a historical date |
| `source_published_at` | Only when independently established by trustworthy provider metadata; otherwise NULL |
| `feature_ready_at` | Computed from verified availability and local processing completion; never before information was actually available |
| `source_sha256`, `snapshot_id`, `revision` | Bind stored values to an actual source response/CSV; retain later corrections separately |
| `access_class`, `license`, `coverage` | Community/free/unsupported, legal attribution, exact metric-date availability |

The existing on-chain store is the starting point; its smaller
`date,metric,value,state,observed_at` schema should **not** be mislabeled as
already supporting every target field.

**As-of discipline:** Retrospectively downloading a value from 2015 today
doesn't establish that this exact revision was available in 2015. Revisions,
`bfill`, guessed release times and future feature-selection statistics
must never be silently admitted to point-in-time-confirmed backtests.
Retrospective research remains possible when explicitly labeled.

## 5. Ingestion, quality and cost acceptance criteria

- [ ] Query the real Community catalog and/or official CSV headers to validate
  candidate metric availability; record any rejected metric as `UNAVAILABLE_FREE`.
- [ ] Produce a per-metric coverage and freshness report. A missing day is not
  equal to a true zero; treat provider outages separately.
- [ ] Choose a historical bootstrap only after verifying its latest data date,
  source commit, row count, numeric invariants, units and file SHA-256.
- [ ] Use bounded API batching (current collector accepts <=12 metrics),
  resumable checkpoints, and a configurable daily request budget well below
  source limits; handle failed batches without discarding canonical history.
- [ ] Preserve corrections, missingness and first-observed timestamps, with
  quality-gated immutable Parquet views and as-of tests.
- [ ] Integrate observed coverage with the [unified availability index,
  issue #8](https://github.com/christoverhendri/bitcoin-iris/issues/8).
- [ ] Demonstrate actual live accessibility and historical coverage for each
  admitted metric independently before claiming 19-metric support.
- [ ] Keep public-data licensing explicit: Coin Metrics Community archive is
  **CC BY-NC 4.0**, requiring attribution and restricting commercial reuse.
  Free-to-view data does not automatically grant automated scraping or
  redistribution rights.
- [ ] No paid fallback, raw-chain archival crawl, or automatic model promotion.

**Research priority:** validated daily network activity, fees, hashrate and
supply first; MVRV / tracked exchange flow candidates only after free entitlement
and unit/source checks. Advanced SOPR and UTXO-derived metrics can wait.

## 6. References and related specifications

- [Coin Metrics Community Data docs](https://github.com/coinmetrics/product-docs/blob/master/docs/packages/coin-metrics-community-data.md)
- [Coin Metrics archive and license](https://github.com/coinmetrics/data)
- [Public BTC CSV](https://github.com/coinmetrics/data/blob/master/csv/btc.csv)
- [Coin Metrics Atlas historical limits](https://docs.coinmetrics.io/network-data/atlas-overview)
- [Community asset-metrics API](https://docs.coinmetrics.io/api/v4/)
- [Blockchain.com Charts documentation](https://www.blockchain.com/explorer/api/charts_api)
- [Current collector and store](../market_data/coinmetrics.py) / [observations](../market_data/observation_store.py)
- [Free source policy](free_data_sources.md) / [data quality](data_quality.md) /
  [forecasting system specification](market_system_specification.md)
