# Current integration contract

This document defines the supported data paths. Dated upstream/import status reports live in
[the archive](../terminal/docs/archive/2026-09-08/); their test counts and observed provider
responses describe those runs only.

## Watcher.Guru canonical boundary

`Telegram preview -> durable SQLite raw inbox -> versioned parser -> terminal JSON projection -> NEWS/SSE`.

The canonical store is `artifacts/news/data.sqlite`, configurable with `--database`.
`data run` collects, processes and publishes `terminal/.data/watcher-guru.json` each cycle.
`--snapshot-output` selects another projection location. The terminal's `IRIS_WATCHER_SNAPSHOT`
must point to that same absolute path when overriding the default.

Only canonical projections carrying `origin: durable_store` are accepted by the runtime adapter.
The standalone publisher reads SQLite. Its `--live` option invokes the same durable collector
and processor; there is no separate direct Telegram-to-terminal ingestion path. Historical
JSONL must enter with `data import`, then `data process`, then `terminal_snapshot --database`.
Existing direct-path snapshots must be rebuilt; the terminal reports them unavailable.

The projection contains the latest processed version only when it is also the latest raw
version. An unprocessed edit cannot silently display a superseded assessment. Raw original
text, observation/readiness timestamps and content hashes remain traceable to SQLite. Projection
writes use unique temporary files and a per-database writer lock. One database owns each output.
The view retains at most 30 days, 2,000 records and 40 MiB; the canonical store has its own budget.

`generated_at` is export time; `attempted_at` is a source attempt; `fetched_at` is the last
successfully validated source page observation. Failed fetches preserve `fetched_at` and
publish failed health. Re-exporting old data does not make it fresh. Missing success timestamps
mean unknown freshness. NEWS includes Watcher health alongside RSS health.

Failed response bodies are reused for the same cursor and identical HTML. Source failures
persist exponential retry backoff (60 seconds up to one hour), honoring Retry-After up to seven days. A process
restart does not reset it. Initial collection covers the latest public page; later collection
catches up to the prior anchor. This does not promise full historical coverage.

## Other terminal paths

RSS uses direct bounded requests, conditional GET, retry backoff and local 30-day archives.
RSS headline sentiment/impact are heuristics. Watcher semantic assertion polarity is not market
direction; its ranking weight is not a probability. Aggregated sentiment and map consumers
retain their separate adapters.

Monthly forecasting defaults to the legacy bootstrap path when no artifact path is configured.
With `IRIS_FORECAST_PATH`, only a validated artifact passes the guarded adapter; missing, stale,
invalid or research-only artifacts produce unavailable output. `as_of` is the information cutoff,
`generated_at` is actual export time, and `origin` is the forecast origin. See
[forecast operations](forecast_pipeline.md).

Supabase is optional. Source wiring and catalogue entries describe capabilities, not successful
responses. Health counts only observed successful source reports, never fabricates a sync time
from the wall clock, and reports unavailable when there is no usable observation. Direct
adapters without reporting remain unknown. The health endpoint is a data readiness signal,
not just proof that the HTTP server runs. Apply all migrations in order for existing installs.

Local SQLite and JSON archives require a persistent filesystem and one owning worker/server.
No background service is installed by setup. Terminal startup does not start Python collection.

## Merge gates

The CI workflow defines four checks: Python tests, terminal tests, lint, and production build.
All must pass on the proposed merge revision. Repository branch protection must require those
checks; a workflow file alone does not enforce a merge gate. Do not bypass a failed or missing
required check. Local verification does not prove upstream availability or uninterrupted service.

## Known independent limitations

The news API currently caps the combined archive at 8,000 rows before paging, and live page
replacement can lose a boundary article after history is loaded. Those audit findings remain
separate from the canonical ingestion and freshness changes in this revision.
