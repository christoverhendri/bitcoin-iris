# IRIS BTC Intelligence Terminal

A BTC signal / evidence / forecast terminal. Next.js frontend on Supabase
Postgres, fed by a separate Python ingestion worker.

## Run it

```bash
npm install
cp .env.example .env.local     # optional — see below
npm run dev                    # http://localhost:3000
```

**Supabase is optional to run the app.** Panels that read the database (whale
wire; the weekly signal unless `CLF_LOCAL_SIGNAL_FILE` points at the worker's
output) have no data without it — and a panel without real data is **hidden**,
replaced by a one-line "data belum tersedia" note. Placeholder numbers never
reach the screen. Panels that fetch their upstream directly show live data.

Every page re-renders from the server every 30 s while its tab is visible.
Cached upstream responses older than four revalidate windows are refetched, and
if the upstream is down the panel falls back to another source or hides; real
data past its panel's age limit (`src/lib/maxAge.ts`) carries a red
`STALE · age` badge. See `docs/DECISIONS.md` §13 (including the ISP DNS block
that made this necessary).

## Local sentiment model

Financial DistilRoBERTa + frozen IRIS parser V3 is connected to the news labels
and sentiment panel, with TF-IDF preserved as an explicit baseline comparison.
The active model service lives in `services/sentiment-node/` and uses Node.js +
ONNX FP32, with a bounded queue, per-text single flight and versioned result
caching. Setup, serving and bundled checks use Node.js/npm. The previous
`services/sentiment/` directory is retained locally as a historical reference and
excluded from this Node.js branch.

```powershell
git lfs install --local
git lfs pull
npm ci
npm run dev:sentiment
```

`services/sentiment-node/models/onnx-fp32/model.onnx` is versioned with Git LFS.
Run `git lfs pull` after cloning if model files were not downloaded automatically.
The worker verifies the full weight file before loading it. See
[Node setup, concurrency, cache and validation](docs/SENTIMENT_NODE.md).
The [previous Python integration](docs/SENTIMENT_MODEL.md) is retained for reference.

Run `npm run sentiment:check` for Node unit tests, synthetic parity and concurrent
HTTP tests. For production locally, use `npm run build` then `npm run start:sentiment`.

## Checks

```bash
npm run build   # all routes compile
npm test        # vitest: formulas, stale-cache guard, nav, redirects, token parity
npm run lint
```

## Layout

| Path | What |
|---|---|
| `src/app/(terminal)/` | one route per page; 6 sections, 11 pages after the 2026-10-18 curation (removed routes redirect, 307, in `next.config.ts`) |
| `src/components/shell/` | rail, topbar, tab strips, status footer |
| `src/components/primitives/` | Panel, PanelGrid, KpiCard, MockBadge, … |
| `src/components/charts/` | hand-rolled SVG charts; `lightweight-charts` for price only |
| `src/lib/features/` | the data access layer — `types` / `live` / `mock` / `present` per feature |
| `src/lib/envelope.ts` | `Envelope<T>`: data plus whether it is real |
| `src/lib/defineFeature.ts` | the live/mock resolver every panel goes through; marks stale data |
| `src/components/primitives/LiveOnly.tsx` | hides a panel whose data is not real |
| `src/components/charts/ChartHover.tsx` | date + value hover layer shared by every chart |
| `docs/` | architecture, design tokens, data manifest |

## The rule that matters

Placeholder data is never written into a component. It lives in
`src/lib/features/<feature>/mock.ts`, returns the same type as `live.ts`, and
reaches the UI only through `defineFeature`, which flags it. Components import
neither file directly.

```bash
# the literal test: no fixture values in the component tree
grep -rn "112,420" src/components/
```
