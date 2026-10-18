# IRIS BTC Intelligence Terminal

A BTC signal / evidence / forecast terminal. Next.js frontend on Supabase
Postgres, fed by a separate Python ingestion worker.

## Run it

```bash
npm install
cp .env.example .env.local     # optional — see below
npm run dev                    # http://localhost:3000
```

**Supabase is optional to run the app.** With no credentials configured the data
access layer finds no rows and renders every panel from the mock layer, badged
`MOCK`, with the sidebar honestly reporting `FEEDS 0/14`. Nothing crashes and no
panel silently lies.

## Local sentiment model

Financial DistilRoBERTa + frozen IRIS parser V3 is connected to the news labels
and sentiment panel, with TF-IDF preserved as an explicit baseline comparison.
The active model service lives in `services/sentiment-node/` and uses Node.js +
ONNX FP32, with a bounded queue, per-text single flight and versioned result
caching. Setup, serving and bundled checks use Node.js/npm. The previous
`services/sentiment/` directory is retained locally as a historical reference and
excluded from this Node.js branch.

```powershell
npm ci
npm run dev:sentiment
```

Restore `services/sentiment-node/models/onnx-fp32/model.onnx` from the Node-only offline
bundle first if starting from a source-only checkout; large weights are ignored
by Git. See [Node setup, concurrency, cache and validation](docs/SENTIMENT_NODE.md).
The [previous Python integration](docs/SENTIMENT_MODEL.md) is retained for reference.

Run `npm run sentiment:check` for Node unit tests, synthetic parity and concurrent
HTTP tests. For production locally, use `npm run build` then `npm run start:sentiment`.

## Checks

```bash
npm run build   # all routes compile
npm test        # design token parity (globals.css vs tokens.ts)
npm run lint
```

## Layout

| Path | What |
|---|---|
| `src/app/(terminal)/` | one route per page; 8 sections, 14 sub-pages |
| `src/components/shell/` | rail, topbar, tab strips, status footer |
| `src/components/primitives/` | Panel, PanelGrid, KpiCard, MockBadge, … |
| `src/components/charts/` | hand-rolled SVG charts; `lightweight-charts` for price only |
| `src/lib/features/` | the data access layer — `types` / `live` / `mock` / `present` per feature |
| `src/lib/envelope.ts` | `Envelope<T>`: data plus whether it is real |
| `src/lib/defineFeature.ts` | the live/mock resolver every panel goes through |
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
