# Integration into bitcoin-iris

## Upstream provenance

- Source: https://github.com/Programmer7177/IRIS-Terminal
- Revision: `b54e060b8f918c2a07673bf663cc0a69643cc99e` (main)
- Imported on: 2026-09-06
- Destination: `terminal/` on `terminal-testing`

Source files and the dependency lockfile are vendored directly, without a nested
Git repository or submodule. Upstream history remains in the source repository.
The root package runs the terminal from its own directory.

## Data and model boundary

This integrates the application into the research repository. It does not yet
serve the Python XGBoost baselines or read the checked-in CSV datasets.
The terminal fetches public market data directly. Its monthly forecast uses
bootstrap Monte Carlo over daily returns, not the research XGBoost quantile model.
Unavailable features use labelled mock values.

Connecting research models requires an inference/export contract with model
identity, training cutoff, forecast origin, horizon, and quantiles. The monthly
UI also expects a median daily path, which cannot be inferred from a single
30-day Q10/Q50/Q90 prediction. These outputs must not be silently equated.

Supabase is optional for startup. Migrations support whale events and source
status; setup and launch do not run migrations or ingestion jobs.
Some upstream architecture/manifest documents describe earlier stages; the
adapters in `src/lib/features/` are the current source of truth. The feed counter
includes configured direct adapters, so it does not prove successful responses.

## Verification

From the root: `npm run setup`, `npm test`, `npm run lint`, `npm run build`.
Launch with `npm start` after building and check `/api/health` and terminal pages.
External providers may time out or rate-limit; panels should remain renderable
with MOCK badges. `npm run verify:registry` performs separate network checks.
Secrets belong in `terminal/.env.local` only.

## Import validation and fixes

The test suite passes (100 tests, including cache, command, and streaming regressions).
Production compilation passes and lint has no errors, with eight upstream
unused-variable warnings. Next.js still warns about the legacy middleware filename.

Local browser checks cover overview, weekly/monthly forecast navigation and
monthly chart rendering; `/api/health` returns HTTP 200 without credentials.
This is a smoke test, not validation of every provider or forecast accuracy.

Two upstream UI issues were corrected during import: globe auto-rotation now
uses a functional state update instead of mutating a ref during render, and
overview sentiment percentages no longer apply a second multiplication by 100.

## Loading overhead

Navigation links disable automatic prefetch so opening one section does not
speculatively load every visible destination. Clicking an unvisited section can
therefore take longer than using a prefetched result; fewer background requests
are the intended tradeoff.

Esplora transaction results are cached after normalization for five minutes,
with concurrent requests for the same address sharing one download. The prior
implementation read this cache but never populated it. Raw transaction bodies
bypass Next's 2MB-limited cache. The process cache holds at most 64 addresses and
resets on server restart; it is not shared between serverless instances. Failed
requests are not retained. First access and expiry still require upstream work.

Coinbase candle URLs are rounded to the minute to match their 60-second cache
window. HTTP timeouts remain active through body consumption. These changes
reduce redundant work; they do not guarantee an external provider's latency.

Local production smoke check on 2026-09-06: `/overview` returned HTTP 200 in
0.65s; the first `/chain/flows` request after restart took 2.90s and the next
took 0.10s, both HTTP 200. These are full HTML response timings from PowerShell,
not browser rendering measurements or a controlled before/after benchmark.

Global Sentiment now starts with the static 2D map. The 3D globe loads on demand
and starts with rotation paused. Optional rotation updates at roughly 15fps and
stops while the tab is hidden or reduced motion is requested. Category filters
update the URL and filter existing events locally instead of rerunning the page's
six data fetches. Crypto and broader-news feeds start in parallel.

Browser smoke checks verified the initial 2D view, SECURITY filtering, lazy 3D
loading, rotation toggle, and return to ALL/2D. CPU/frame-time savings have not
been measured in a controlled profile.

## Independent panel loading and commands

The terminal shell renders before feed health and ticker requests finish.
Overview streams signals, fear and greed, price, intelligence, snapshot, and
technicals through separate Suspense boundaries. Global Sentiment streams its
summary, map/news, and whale wire separately; on-chain map markers resolve in
a nested boundary so transaction fetches do not delay the map or headlines.
Mock on-chain markers are excluded and show an unavailable badge. The summary's
World Events count covers headline/macro events; the map event count also includes
resolved on-chain markers. Other routes receive a route-level loading fallback.
These boundaries improve progressive rendering, not provider response speed.

Open Commands with Ctrl/Cmd+K, or `/` outside text inputs. Search section names
or use timeframe commands on Overview and Market. Arrow keys select, Enter
opens, and Escape closes and restores focus. Timeframe commands preserve other
query parameters. Commands only navigate predefined local routes.

Production browser checks verified partially loaded Overview panels, completed
on-chain markers, command search, empty results, timeframe URL/chart updates,
section navigation, arrow selection, and Escape focus restoration. A streaming
regression test proves a ready panel renders while another remains pending.
Production build and all 100 tests pass; lint retains eight upstream warnings.

## News delivery, request limits, and archive

Overview and Global Sentiment receive news snapshots over `/api/news/stream`
using EventSource. There is one shared refresh loop per server process while
subscribers exist. RSS GETs are limited to at most once every five minutes per
publisher during normal operation. Concurrent requests join the same promise.
Failed fetches back off exponentially from five minutes to one hour; a longer
Retry-After is honored. ETag and Last-Modified validators are sent when available;
304 preserves the feed contents and counts as a successful check. No anti-ban
guarantee is implied: the publisher controls access policy.

Connections send heartbeats every 15 seconds and reconnect after four minutes.
Hidden tabs disconnect; visible tabs reconnect to a current snapshot. This is
server-to-browser push over RSS acquisition, not publisher-origin streaming.
Sentiment summaries and geographic event markers remain page-load snapshots.
Debug controls remain development-only.

Article history and per-source checkpoints are saved atomically under
`terminal/.data/news` when launched with the root npm scripts. The directory is
ignored by Git. Set IRIS_NEWS_ARCHIVE_DIR to an absolute persistent directory to
change its location. The store retains up to 2,000 articles per publisher over
30 days, preserving stories which disappear from subsequent RSS snapshots.
Canonical URL deduplication drops tracking parameters. Invalid/future timestamps
are excluded from archived history. Publication time, last successful check, and
next allowed request time are separate fields.

This implementation targets one local Node server with a writable persistent
volume. It does not coordinate multiple processes or serverless instances;
production horizontal scaling requires a shared database and distributed request
coordination. A serverless ephemeral filesystem does not provide durable history.
While the terminal is closed no ingestion runs. Startup merges whatever is still
available in each feed; articles published and removed during downtime cannot be
recovered without an external historical source. Only headline metadata, links,
and short RSS descriptions are stored, not full article bodies.

`/api/news` returns up to 400 articles and a nextCursor. Subsequent requests pass
the cursor to retrieve older history. Timestamp ties use article identity so
pagination does not skip simultaneous publications. The UI exposes archived pages
when there are more than 400 available headlines; normal Load earlier news expands
already downloaded rows. SSE remains bounded to the newest page. News source
failures retain archived real stories and never generate sample news.

Whale Wire production responses strip all synthetic rows, including synthetic
Supabase batches. When unavailable, the panel and summary show UNAVAILABLE rather
than generated transactions or zero-valued flow claims. Development retains the
explicitly badged mock behavior. This does not configure Whale Alert credentials
or create real transaction ingestion.

Validation: 100 tests, production build, and lint without errors (eight existing
warnings). Tests cover rate-limit metadata, 304, shared requests, archive retention,
file-store reopening, timestamp-tie pagination, SSE subscription cleanup, and
production synthetic-data exclusion. A real server restart restored 101 articles;
archive hashes were unchanged after the restart read, proving cooldown reuse.
See NEWS_SOURCE_AUDIT.md for the source freshness investigation.
