# Coinbase execution ledger and volume-at-price

The public [Coinbase Exchange product trades endpoint](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-trades) supplies BTC-USD execution ID, time, price, size and maker side. Collection uses the response's `CB-AFTER` header to request older pages, following [Coinbase cursor pagination](https://docs.cdp.coinbase.com/exchange/rest-api/pagination). No trading credentials or account orders are used.

## Collect locally

From the repository root:

```powershell
npm run ingest:trades -- --pages 5
npm run ingest:trades -- --resume --pages 20
npm run ingest:trades -- --pages 100 --until 2026-10-13T00:00:00Z
```

The first command captures recent prints. Repeating it deduplicates overlapping trade IDs and catches newer prints. `--resume` continues older pagination from the persisted oldest checkpoint. A head catch-up after a long interruption may need a larger page budget and an `--until` target to bridge the interruption; resuming the oldest checkpoint alone does not fill a middle gap. Collection is finite, rate-paced and bounded to 1–1000 pages of up to 1000 prints each. A target date not reached before the page budget remains explicitly unreached. No claim is made that the endpoint can backfill to 2015. No background service or scheduler is installed.

Default storage is `artifacts/market/coinbase_trades.sqlite`, separate from hourly/minute candle databases and ignored by Git. Use `--ledger ABSOLUTE_PATH` or `IRIS_TRADE_LEDGER_PATH` to select another ledger. Configure the same absolute `IRIS_TRADE_LEDGER_PATH` in `terminal/.env.local` for the dashboard. The CLI reads its process environment, not Next's env file automatically. Node >=22.13 is already required by this repository; no dependency is added.

## Storage and integrity

Execution times preserve exchange microseconds. USD prices and BTC sizes use fixed eight-decimal integer strings. Profiles accumulate BTC units with BigInt, and notional uses the exact product of price/size units. Display meters use numeric approximations; reported totals and per-bin quantities retain exact decimal strings. Decimal scientific notation or precision beyond eight places is rejected rather than silently rounded.

Trade IDs are immutable primary keys for this BTC-USD ledger. Repeat prints retain their first observation time. Conflicting content rejects the entire page transaction, including new trades in that page. SHA-256 verifies canonical execution fields on profile reads. Page audits retain fetch time, request/response cursor, row count, ID bounds and response content hash. Successful rows, page audit and older checkpoint commit together. A newest-page refresh cannot replace a deeper historical checkpoint. Observation time is a conservative upper bound of the local receiving millisecond, not an externally signed historical availability certificate.

Malformed/unordered pages, non-advancing cursors, incompatible schema/product, invalid values or mismatched content hashes fail closed. Requests are paced at <=4/s between successful pages and retry bounded transient failures/429 responses. Existing candle archives are not migrated or overwritten.

## Profile UI and cutoff

Market > Price > Advanced Market Studies > Executed-trade volume profile supports Snapshot window, Last 15 minutes, Last hour and Last 24 hours. **Load trade profile** reads the persisted ledger only. A changed window, market cutoff, strict flag or venue hides a previous profile until it is reloaded. A mocked or non-Coinbase chart cannot silently borrow Coinbase executions. The profile follows the snapshot/replay cutoff, not viewport-only chart zoom. Actual completed executions can extend beyond the last completed OHLCV candle while staying before the same snapshot cutoff.

`GET /api/market/trades/profile` requires UTC `start`, `end` (exclusive), `cutoff`, optional `bins` (2–50) and `strict`. It accepts microsecond boundaries, checks end<=cutoff<=now and limits a query to 366 days / 200,000 trades. Choose a narrower window if the query is too large. Reads use a read-only SQLite snapshot. Response quantities are actual executions only; there is no candle fallback.

Reconstruction reads the selected execution-time range at the current observation watermark. Strict mode also requires first-observed time <= historical cutoff. Historical data not yet gathered stays EMPTY, including a 2015 replay when only recent executions exist.

Coverage is EMPTY, PARTIAL or CONTIGUOUS_ID_EVIDENCE. ID holes are arithmetic evidence, not a guaranteed count of missing executions. Continuity evidence additionally requires known adjacent trade IDs outside both time boundaries. Even contiguous IDs are not an independent completeness certificate. Requested and globally captured bounds are shown separately; a partial ledger never represents all volume in a wider requested period. Source labels remain development-only; quality and dates remain visible in production.
