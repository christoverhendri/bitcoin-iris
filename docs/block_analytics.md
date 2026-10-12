# Bitcoin block-to-features pilot

Implementation: `market_data.chain`, linked to [issue #11](https://github.com/christoverhendri/bitcoin-iris/issues/11).
This is bounded, read-only mainnet research. It does not start a full-chain crawl,
run a wallet, broadcast transactions, replace the price/news/ETF collectors, or
promote a model. No paid API key or new mandatory Python dependency is required.

## What is implemented

- Raw Bitcoin block decoding with exact integer satoshis, legacy/SegWit transaction
  IDs, wtxids, block header hash, PoW target sanity, transaction Merkle root, BIP141
  witness commitment and block-weight checks. Scripts are categorized, not executed.
- An allowlisted public Blockstream source for small pilots; one raw-block request
  replaces per-25-transaction pagination. Separately fetched previous transactions
  are checked against their txids. Their creation heights/times remain explicitly
  **provider-asserted metadata**, not independently reconstructed block proofs.
- A loopback-only, cookie-authenticated Bitcoin Core adapter with a read-only RPC
  allowlist. It uses raw `getblock` data, verbosity-3 undo/prevout data where available,
  and exact comparisons to `getblockstats`. RPC credentials are never logged/exported.
- Per-block atomic commits, resumable prefix checkpoints, source/network identity,
  retained compressed raw blocks, per-response checksums, observation/processing times,
  and append-only analysis/event records in SQLite.
- A tracked-range output/spend projection with intra-block spending and double-spend
  checks. Reorgs detach the affected suffix and undo its outputs/spends atomically.
  Earlier outputs become unspent again; orphan raw blocks and analysis evidence remain.
- Block/transaction features and immutable ZSTD Parquet for optional DuckDB analysis.
  Snapshot verification can compare stored height/hash pairs with the canonical DB,
  explicitly rejecting artifacts invalidated by a locally detected reorg.

**This is not a Bitcoin consensus implementation.** It does not verify signatures,
script execution, the entire difficulty schedule, or the source's complete chainwork.
For full consensus validation, use your own Bitcoin Core node. Public-source data
still depends on that provider's mainnet mapping and confirmation metadata.

## Measurement semantics

`fees_total_sat` is NULL when any input amount is unresolved. `fees_known_sat` is
only the supported subtotal; `missing_prevouts` and `prevout_coverage` disclose its
coverage. Coinbase transactions have no ordinary input fee and are handled separately.

`non_coinbase_output_sat` includes change, self-transfers and batching. It is **not**
a measure of economic BTC transfers or exchange inflows. No entity names or heuristic
buy/sell direction are inferred. `script_counts` recognizes common P2PK/P2PKH/P2SH,
P2WPKH/P2WSH, Taproot and nulldata patterns; other scripts remain `unknown`.

`output_minus_input_count` matches the theoretical `getblockstats.utxo_increase`
definition, including unspendable outputs. `spendable_output_delta` excludes outputs
starting with OP_RETURN, scripts exceeding 10,000 bytes, and genesis outputs.
`tracked_unspent_outputs` is only the subset created within the scanned range, **not**
Bitcoin's global UTXO count or monetary supply. BIP30 historical duplicate-txid
**overwrites are rejected**, not silently reinterpreted: a full-chain index needs an
explicit implementation of those consensus exceptions before it can claim completeness.

Age-in-blocks and value-weighted age-in-seconds are reported only for inputs with
creation evidence. Miner block timestamps can be nonmonotonic; negative timestamp
ages are excluded from the known-age subtotal, not changed to zero. Core prevouts
usually provide heights but not creation timestamps, so those time ages stay unknown.
`median_time_past` is calculated only when the preceding ten blocks are in the retained
range. Missing MTP is NULL, never an invented estimate.

`observed_at` and `feature_ready_at` are actual local collection/processing times,
not historical block times. Confirmed blocks cannot reconstruct past global mempool
arrival times. Reorg/analysis history is retained but a historical as-of canonical
chain query is not yet provided. Existing Parquet snapshots are immutable; rerun
`verify-export --database ...` to test against the local canonical chain after updates.
An offline snapshot check alone cannot establish that a provider has not since reorged.

## Resource envelope

| Resource | Default | Hard bound |
|---|---:|---:|
| Newly added blocks per invocation | 8 | 64 |
| HTTP/RPC attempts, including retries | 100 | 1,000 |
| Total response bytes | 64 MiB | 512 MiB |
| Source deadline | 600 s | 1,800 s |
| Public request pacing | >=1 s | No parallel fan-out |
| External previous transactions | 20 | 100 |
| Minimum confirmations | 6 | Explicit integer >=1 |
| Automatic rollback depth | 12 | 100 |
| Canonical SQLite + WAL guard | 512 MiB | Explicit new partition needed |
| Parquet export | <=4,096 blocks | <=250,000 rows per table |

Raw blocks are at most 4,000,000 bytes; decode counts and vectors are bounded. This is
not a measured peak-RAM guarantee. Python decoded objects and DuckDB add overhead.
Disk space is checked before commits. Crossing request, disk or response budgets
stops the run without checkpointing a partial block. Already committed blocks remain.
No attempt is made to bypass HTTP 403/429, CAPTCHAs, provider restrictions or paywalls.
Provider terms still apply; a keyless endpoint is not unlimited public infrastructure.

## Run a small public pilot

From the repository root:

```bash
python -m pip install -r requirements.txt
python -m market_data.chain scan --source esplora \
  --start-height 169 --end-height 172 --max-blocks 3 \
  --max-requests 40 --max-prevout-txs 8 \
  --database artifacts/market/block_pilot.sqlite \
  --report artifacts/quality/block_pilot_scan.json
python -m market_data.chain status --database artifacts/market/block_pilot.sqlite
python -m market_data.chain verify --database artifacts/market/block_pilot.sqlite \
  --report artifacts/quality/block_pilot_verify.json
```

The end height is exclusive. This range is a deliberately tiny historical sample,
not a claim about 2015-present coverage. Reuse the **same start, source and database**
to resume or extend the prefix. Choose new report paths on later runs. A different
start/source or changed external anchor is rejected. Deep reorgs require operator
review/new partition instead of deleting arbitrary history.

## Use your own Bitcoin Core node

```bash
python -m market_data.chain scan --source core \
  --cookie "$HOME/.bitcoin/.cookie" --rpc-url http://127.0.0.1:8332 \
  --start-height 800000 --end-height 800002 --max-blocks 2 \
  --database artifacts/market/core_block_pilot.sqlite \
  --report artifacts/quality/core_block_pilot_scan.json
```

The node must already be running on Bitcoin mainnet and have the requested block and
undo data. No node is installed or synced by this command. Old/pruned data or unsupported
verbosity-3 responses fail visibly. An unpruned node has real disk, bandwidth and
power costs. Keep RPC on literal loopback (`127.0.0.1` or `::1`); wallet RPCs and remote
credential-bearing endpoints are deliberately refused.

## Warehouse integration

```bash
python -m pip install -r requirements-warehouse.txt
python -m market_data.chain export --database artifacts/market/block_pilot.sqlite \
  --output artifacts/warehouse/block_pilot_v1
python -m market_data.chain verify-export \
  --artifact artifacts/warehouse/block_pilot_v1 \
  --database artifacts/market/block_pilot.sqlite
```

Outputs: `blocks.parquet`, `transactions.parquet`, `manifest.json`. The manifest links
exact canonical block hashes, schema, per-file hashes/counts, source identity and
quality status. Hash checks detect corruption; they are not signatures from a provider.
The separate block schema is not accepted as daily price input by `forecast_model`.
A `partial` fee-coverage result does not make valid raw block bytes unusable, but it
must not be advertised as complete fees or complete coin-age coverage. `model_ready`
is always false. Daily aggregation, SOPR, entity clustering, whole-chain UTXO indexing,
ZMQ/mempool ingestion and automated scheduling remain separate tasks in issue #11.

## Tests and live evidence

```bash
python -m unittest discover -s tests -p 'test_block_analytics.py' -v
```

The existing Python CI discovers these tests and installs optional DuckDB. Offline
tests cover real genesis hash/merkle/weight, SegWit commitments, exact amounts,
truncation, invalid fees, maturity, double spends, interrupted collection, reorgs,
source budgets, RPC restrictions, Parquet integrity and reorg invalidation.
The separate live workflow samples an early range and one modern block; its logs and
reports are the evidence of actual access. Offline fake-HTTP tests are not live proof.
A public Esplora run cannot claim real Bitcoin Core parity; that remains `not_checked`
unless an actual local node was queried. Tests of the Core adapter are mocked unless
an explicit node-backed run is documented.

References: [Esplora API](https://github.com/Blockstream/esplora/blob/master/API.md),
[Core getblock](https://bitcoincore.org/en/doc/30.0.0/rpc/blockchain/getblock/),
[Core getblockstats](https://bitcoincore.org/en/doc/30.0.0/rpc/blockchain/getblockstats/),
[BIP141](https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki).
