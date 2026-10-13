# Local market archive and replay


The terminal uses **Node 22.13+** and its built-in `node:sqlite` reader. It does
not run a Python collector during a web request or download history implicitly.
The collectors remain responsible for writing the canonical databases.

## Provider and interval accuracy

OHLCV envelopes identify the provider actually used: `coinbase` or `kraken`.
Fallback only uses another provider supporting the same requested interval.
Kraken rejects unsupported `6h` instead of converting it to daily bars.
Weekly/4h requests cannot fall back to native daily Coinbase candles.
If a provider cannot serve the requested interval, the existing feature layer
returns an explicitly labelled mock rather than mislabelling real candles.
Coinbase fallbacks for long daily windows can return fewer candles than requested.

## Files and configuration

By default the API reads these repository files:

- `artifacts/market/coinbase_hourly.sqlite` for `1h`.
- `artifacts/market/coinbase_minute.sqlite` for `1m`.

Set `IRIS_MARKET_ARCHIVE_DIR` in `terminal/.env.local` to a trusted server-side
directory containing those same names. Client requests cannot choose filesystem
paths. Database reads validate the Coinbase Exchange BTC/USD identity, native
granularity and candle invariants, and do not create or update databases.
Parquet remains an immutable research export; the web reader uses canonical SQLite.

## Endpoint

```text
GET /api/market/history?interval=1m&limit=100
GET /api/market/history?interval=1h&start=2015-07-21T00:00:00Z&end=2015-07-21T04:00:00Z&limit=2
GET /api/market/history?interval=1h&limit=2&cursor=<URL-encoded nextCursor>
```

`interval` accepts `1m` or `1h` (default `1h`). `limit` defaults to 500 and
accepts 1–1000. Start/end need explicit timezones and native bucket alignment;
end is exclusive and cannot include an unfinished bucket. Omitted bounds use
the stored candle range, capped at the latest completed bucket.

Responses contain an `Envelope<ArchiveCandle[]>`, `nextCursor`, source/range
metadata, and coverage of the scanned part of the range. Rows are oldest-first
and contain `observedAt` and `revisionHash` in addition to OHLCV. Follow
`nextCursor` with the same interval; cursors freeze the range and observation
cutoff and cannot be reused for a different interval or explicit range.
Each query reads at most limit+1 result rows and uses indexed timestamp bounds.
Sparse scans are additionally capped at 10,000 native time buckets per request.
A sparse page can contain no candles and still return `nextCursor`; continue
pagination to traverse that missing span rather than treating it as fabricated data.

Hourly revision selection matches the collector's reconciliation reference:
latest first-observed revision at or before the cutoff. Minute selection uses
the latest append-only observation at or before that cutoff, including source
reversions. The hourly database does not retain every re-observation timestamp;
the endpoint does not claim to reconstruct its full historical observation ledger.

`coverage.missingCandles` includes absent native buckets in the scanned range.
The API also returns compressed `gaps` with millisecond `start`, exclusive `end`,
and `status`. Gaps default to `UNKNOWN`. For minutes, `INFERRED_NO_TRADE` requires
full successful fetch coverage and independent hourly OHLCV reconciliation,
using the same tolerances and rules as `market_data/minute_activity.py`.
Both stores and fetch coverage respect the frozen observation cutoff. Missing
or incompatible reconciliation evidence keeps the state unknown. This involves
bounded full-hour evidence reads in addition to the page query.
Neither state receives fabricated OHLC. Inferred zero volume is explicitly
labelled; it is not proof from a trade ledger.
Archive responses retain `historicalBacktestSafe: false`:
downloaded historical candles are retrospective, not proof of vendor availability
at a past model origin.

Invalid parameters/cursors return HTTP 400. Missing, incompatible, or corrupt
stores return HTTP 503 and an unavailable envelope with no mock candles.
Responses are never HTTP-cached. Queries run in read-only transactions.

## Browser

In Market → Price, select **Local archive**, then **Load local archive**. This
loads the first page and enters paused replay. **Load next page** appends history
without moving the replay cursor. The browser keeps at most 5,000 loaded candles.
**Use current window** restores the original provider window and levels.
The global header ticker remains current; the archive chart uses Coinbase-only
data and recalculates levels from revealed candles. Missing buckets remain absent.
Replay steps include missing spans, including leading/trailing gaps and empty
pages. At a gap the current OHLC and levels are unavailable. The chart uses
timestamp spacing, shades revealed gaps, and retains the elapsed-time difference.
At 1× each native interval takes one second; a multi-interval gap holds for its
full scaled duration. **Next** can skip the gap manually. Future candles and gap
annotations remain hidden until their replay step is revealed.

The integration was live-checked with a bounded July 21, 2015 00:00–04:00 UTC
sample: four hourly candles and 232 minute candles (eight absent minutes).
This is a small local validation sample, not a complete historical backfill.
