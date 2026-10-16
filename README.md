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

## Checks

```bash
npm run build   # all routes compile
npm test        # design token parity (globals.css vs tokens.ts)
npm run lint
```

## Layout

| Path | What |
|---|---|
| `src/app/(terminal)/` | one route per page; 7 sections, 18 sub-pages |
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
