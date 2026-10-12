# IRIS Data Specification: Bitcoin On-chain Metrics and Transaction Intelligence (v2 proposal)

**Decision recorded:** 2026-10-12. **Status:** specification only; the v2 expansion
is **not implemented, enabled or scheduled** by this document.
**Scope:** free-source, noncommercial research; BTC mainnet; **two complementary
tracks**: (A) daily provider-computed network aggregates and (B) independent
**block/transaction/UTXO-level analytics**. Both are candidates for
time-causal features. This is a design specification, not an implemented Bitcoin
node, universal wallet attribution, forecasting model or an already indexed chain.

## 1. Historical raw data is NOT the v2 blocker

Four different data products must never be confused:

| Data product | Historical strategy | v2 priority | Practical constraint |
|---|---|---|---|
| Daily aggregated network metrics | Coin Metrics Community asset-metrics API or vetted free historical CSV; Blockchain.com charts where permitted | **Track A: production-quality research source** | Free metric entitlement, vintage, sampling and units must be checked |
| Confirmed block and transaction contents | Bounded [Blockstream Esplora](https://github.com/Blockstream/esplora/blob/master/API.md) REST reads for a pilot; own Bitcoin Core node for repeatable, bulk analysis | **Track B: required bounded proof of concept** | Public explorer is not a free unlimited bulk crawl; self-hosting consumes storage, bandwidth and compute |
| UTXO-linked transaction analytics over historical blocks | Replay available blocks and consume prior outpoints, ideally using an **unpruned Bitcoin Core node** and its block/undo data | **Track B: staged research implementation** | Input prevout availability, chain reorgs, UTXO state and full-history indexing increase resources |
| Unconfirmed/mempool transaction events | Locally observed Bitcoin Core mempool notifications (e.g. ZMQ `rawtx` / `sequence`) | **Optional live extension** | Node-relative observations cannot retroactively reconstruct historic global mempool arrivals |

**Policy:** Atlas Community's documented **30-day raw search lookback** is
only a limit on that provider's query service; it does **not** limit confirmed
Bitcoin transactions publicly recorded in older blocks. We can process them
using an unpruned Bitcoin Core node or bounded public proofs without a paid
market-data subscription. Do not claim the paid-free API limit disappears:
full-chain indexing has substantial **local** disk/network/compute costs.
A free daily CSV also cannot replace transaction data. Derived SOPR, age
distributions or wallet/holder measures require separately validated algorithms
and previous outputs; address/transaction-level links do not prove identity.

## 1A. Transaction intelligence pipeline: deriving our own evidence

This is the user-intended direction for **Track B**, not an implemented
feature. See [On-chain transaction analytics issue #11](https://github.com/christoverhendri/bitcoin-iris/issues/11).

```text
Confirmed block (height, hash, parent hash)
  -> transaction (txid, weight, version, locktime)
  -> inputs (spent txid:vout) + outputs (vout, satoshis, script)
  -> prevout/UTXO resolution + chain/reorg tracking
  -> validated block and transaction statistics
  -> immutable block/day feature Parquet + availability/provenance
  -> time-safe research features (not automatically fed into Quant IRIS)
```

**Starter analytics directly measurable from valid confirmed blocks:**
transaction count and virtual size, BTC fees and fee-rate percentiles,
number/value of new and spent outputs, approximate distribution of transferred
output value, script-type frequencies, and UTXO set count changes. Bitcoin
Core's `getblockstats` can provide an independent per-block check for many of
these measurements. **Total output value is not equivalent to economic value
transferred**, because it often includes wallet change and self-transfers.

**Prevout/UTXO-linked candidates:** spent output age, coin days destroyed,
age and value cohorts, consolidation behavior, realized-value/cost-basis
features and SOPR-like ratios. These require resolving each input to the
previous output with its creation height/time and satoshis. Historical BTC
price alignment is additionally required for realized-value signals.
No claim of identical methodology to third-party commercial metrics until
definitions and validation agree.

**Do not confuse:**
- On-chain block inclusion vs the moment a transaction first appeared.
  Block time and first local mempool observation are different, and public
  historical blocks cannot recover global historic mempool arrival times.
- **Transaction inputs/outputs vs people or wallets.** Change, CoinJoin and
  batching mean a single Bitcoin transaction may not represent one economic
  transfer. Exchanges hold many unknown addresses; registry-based labels are
  explicitly incomplete and heuristic.
- A miner's **coinbase transaction** (block subsidy plus fees) vs Coinbase
  Exchange the BTC/USD venue. Coinbase inputs are special and not normal prevouts.
- `block_time`, `block_connected_at`, `source_observed_at`,
  `processed_at` and `feature_ready_at`. Never backdate our local observation
  or misrepresent a revised block as known in an older backtest.

**Operational safety:** use integer satoshis, explicit block hash and
parent-link verification, idempotent `txid:vout` state changes and reversible
reorg handling. If prevouts are unavailable, leave input-value/age/fee metrics
`UNKNOWN` rather than inferring them. Public Esplora allows bounded sample
retrieval but should not be treated as an unlimited full-chain source.
An unpruned Bitcoin Core node can expose historical blocks; a pruned node may
no longer have the necessary old block or undo data. Historical confirmed
transaction backfills are possible at an infrastructure cost, while realtime
mempool coverage must start at the moment our node observes events.

**Phases:** (1) audited small block-range reader and `getblockstats` parity;
(2) bounded prevout-linked UTXO state and block/day feature export;
(3) incremental indexing, reorg repair, optional ZMQ notifications; (4)
historical scale-up only after measuring actual disk/RAM/CPU/network budgets.

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
- **No confirmed full-block or general-purpose transaction/UTXO analytics
  pipeline** is implemented under `market_data/`. The terminal has limited
  current explorer reads for a curated exchange-address set, not a complete
  chain index. The transaction parser/UTXO state described above is proposed.

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
| Public mempool/explorer endpoints | Bounded block and transaction **pilot**, recent mempool/address context | Public Esplora supports `/block/:hash/txs` (25 transactions/page), `/tx/:txid` and raw blocks, but provider reachability/terms may vary; not a bulk-chain archive |
| Own unpruned Bitcoin Core node | Independently validate blocks, transaction inputs/outputs, previous outputs and per-block statistics | `getblockhash` + `getblock` verbosity 2/3 where undo data exists; `getblockstats` fee, vsize and UTXO deltas. Running a node has local disk/bandwidth costs even with no paid API key |
| Bitcoin Core ZMQ | Optional live first-seen mempool/block event observations | `rawtx`, `rawblock`, `sequence` report events at our node, not historical universal first-seen times |

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

**Separate Track B transaction schema (proposed):** preserve
`chain_id`, `block_height`, `block_hash`, `prev_block_hash`,
`block_time`, `txid`, `wtxid`, `vin_index`, `prev_txid`,
`prev_vout`, `vout_index`, `value_sat`, `script_type`,
`source`, `source_sha256`, `observed_at`, `confirmation_state`
and `is_coinbase` where applicable. UTXO rows require created/spent heights
and the raw integer amount. Unknown prevouts remain null and untrusted. Keep
aggregated daily metric revisions separate from event-level raw/derived tables.
Use immutable Parquet only for validated read-models, not as a substitute for
a reversible UTXO/reorg state machine.

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
- [ ] Deliver a separate bounded, real **transaction/block analysis pilot**
  using public Esplora or a locally operated Bitcoin Core node, and verify
  measured block features against `getblockstats`.
- [ ] Resolve prevouts before reporting input amounts, fees or coin age;
  construct UTXO state with reorg-safe, reversible updates, integer satoshis,
  and explicit Unknown states for missing input evidence.
- [ ] Classify outputs, fees and address clusters as *observations* vs
  *heuristic economic inferences*, with source and confidence metadata.
- [ ] Emit deterministic, hash-bound block/day feature exports and tests for
  duplicate UTXOs, intra-block spends, block detach/reorgs and unavailable
  prior outputs; include observed-versus-confirmed timestamp checks.
- [ ] No paid fallback, default full-chain archival crawl, or automatic model
  promotion. Expanded scans require explicit resource budget/approval.

**Research priority:** daily source-verified aggregates and a **bounded
transaction-level validation pilot** can advance in parallel. Complete
historic UTXO reconstruction, SOPR-like calculations and mempool event history
are later scaling stages, not fundamentally ruled out by the Atlas API limit.

## 6. References and related specifications

- [Coin Metrics Community Data docs](https://github.com/coinmetrics/product-docs/blob/master/docs/packages/coin-metrics-community-data.md)
- [Coin Metrics archive and license](https://github.com/coinmetrics/data)
- [Public BTC CSV](https://github.com/coinmetrics/data/blob/master/csv/btc.csv)
- [Coin Metrics Atlas historical limits](https://docs.coinmetrics.io/network-data/atlas-overview)
- [Community asset-metrics API](https://docs.coinmetrics.io/api/v4/)
- [Blockchain.com Charts documentation](https://www.blockchain.com/explorer/api/charts_api)
- [Bitcoin Core getblock RPC (full transaction and prevout response)](https://bitcoincore.org/en/doc/23.0.0/rpc/blockchain/getblock/)
- [Bitcoin Core getblockstats RPC](https://bitcoincore.org/en/doc/26.0.0/rpc/blockchain/getblockstats/)
- [Bitcoin Core ZMQ notifications](https://github.com/bitcoin/bitcoin/blob/master/doc/zmq.md)
- [Blockstream Esplora API](https://github.com/Blockstream/esplora/blob/master/API.md)
- [Transaction/UTXO Analytics Issue #11](https://github.com/christoverhendri/bitcoin-iris/issues/11)
- [Current collector and store](../market_data/coinmetrics.py) / [observations](../market_data/observation_store.py)
- [Free source policy](free_data_sources.md) / [data quality](data_quality.md) /
  [forecasting system specification](market_system_specification.md)
