# Watcher.Guru canonical integration

The supported path is SQLite raw inbox -> current parser -> terminal projection -> NEWS/SSE.
See the [current integration contract](../../docs/integration.md) for timestamps, health,
retention and source coverage. Semantic polarity is an assertion, not market sentiment;
NEWS shows REVIEW or NO DIRECTION and a separate ranking weight.

From the repository root:

```powershell
# Collect, process and publish continuously.
.venv/Scripts/python.exe -m news_pipeline data run --watch --interval 60
# Publish an existing canonical database without fetching.
.venv/Scripts/python.exe -m news_pipeline.terminal_snapshot --database artifacts/news/data.sqlite
# One canonical collection/processing/publication cycle.
.venv/Scripts/python.exe -m news_pipeline.terminal_snapshot --live
```

For historical JSONL, run `data import --input <path>`, then `data process`, then publish.
The old direct `--input` snapshot path has been removed. Legacy snapshots without
`origin: durable_store` are unavailable until rebuilt through the canonical store.
Do not regenerate fixture timestamps as a substitute for source fetch health.

The default output is `terminal/.data/watcher-guru.json`. Match a custom `--output` (or
`data run --snapshot-output`) with the terminal's absolute `IRIS_WATCHER_SNAPSHOT`.
No terminal restart is required when only the projection data changes.

Regression coverage includes failed fetch preserving success time, canonical edit ownership,
raw evidence offsets, parser contract version, duplicate weighting and failed-source display.
Run `python -m unittest discover -s tests` and `npm test` using the configured environments.
