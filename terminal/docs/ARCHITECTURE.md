# Architecture

Three processes, deliberately separated.

```
Python worker  ──service_role──▶  Supabase Postgres  ──anon read──▶  Next.js
(APScheduler)                     RLS: public read                   (Vercel)
pandas / numpy                    service writes only                App Router, SSR
   │
   └─ not built. The one table that exists today (`whale_events`) is written
      by a Next.js route handler instead — see "The ingestion exception".
```

## Why not Streamlit + SQLite

The visual reference (`../IRIS BTC Terminal v4.local.html`) is a dense terminal
layout with a custom navigation rail, a 1px-gutter panel grid and micro
typography. Streamlit imposes its own layout and cannot produce it. SQLite is
also unusable here: the dashboard is serverless (ephemeral filesystem) and the
writer is a separate process.

The planning spec already required "scheduler separate from dashboard" and
"easy to migrate to Postgres when it scales". This starts at Postgres.

## Why the worker stays Python

Monte Carlo, the indicator pipeline and the news classifier are all pandas /
numpy / scikit-learn work, and the feature engineering must be *the same code*
in training and in serving. Rewriting that in TypeScript to fit the frontend
would guarantee drift between the two paths.

## Process boundaries

| Process | Reads | Writes | Runs |
|---|---|---|---|
| `worker/` | upstream APIs | every data table, `data_source_status` | **not built yet** |
| Next.js | every data table (anon) | `whale_events` only, via `/api/ingest/whale` | Vercel |

### The ingestion exception

`src/app/api/ingest/whale/route.ts` holds the service role key. That contradicts
the diagram above, and it is deliberate.

Whale Alert's free tier returns only the last ~10 minutes and no history, so the
whale wire needs a writer running every five minutes. Standing up a Python
worker, its host and its deploy pipeline to run one `upsert` would be a large
amount of moving parts for one table. A route handler is the same trust boundary
the worker would have been: server-only code (`src/lib/supabase/admin.ts` is
marked `server-only`, so an import from a client component fails the build), one
caller, gated on a `CRON_SECRET` bearer token, and named without a
`NEXT_PUBLIC_` prefix so Next cannot inline it into a browser bundle.

The scheduler is external (cron-job.org / UptimeRobot / a VPS crontab) because
Vercel Cron on the Hobby plan fires once a day, which is useless against a
ten-minute lookback.

When the Python worker does arrive, it takes this table over and the route is
deleted — nothing else has to change, because the read path already goes through
`whaleEvents/live.ts` and knows nothing about who wrote the rows.

The worker is 12-factor: configuration is environment variables only, so moving
it to a container is "set the same variables and run `python -m iris_worker.scheduler`".

## The mock contract

Every panel receives an `Envelope<T>`, never a bare value. `defineFeature`
resolves a feature to live data when it exists and placeholder data when it does
not, and records which happened. Components import neither `live.ts` nor
`mock.ts` — a `no-restricted-imports` rule in `eslint.config.mjs`, scoped to
`src/components/**` and `src/app/**`, fails the build if one does — so there is
exactly one way for synthetic data to reach a pixel, and it always arrives
wearing a MOCK badge.

See `DATA_MANIFEST.md` for the per-feature variable → source → unlock table.
