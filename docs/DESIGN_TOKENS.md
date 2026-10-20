# Design tokens — the visual contract

"Ember" (2026-10-20): one colour family. A warm black ground, solid warm surfaces, cream ink and a
single orange accent. Direction is carried by lightness, not hue: up is light orange, down is sand.
Declared twice on purpose: as CSS custom properties in `src/app/globals.css`, and as constants in
`src/lib/theme/tokens.ts` because canvas charts cannot read CSS variables.
`src/lib/theme/tokens.test.ts` asserts the two agree.

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#0b0806` | app background, with a slow orange glow from the top |
| `--panel` | `#130e0a` | card surface |
| `--sunk` | `#1a130e` | tile inside a card (one tone step up, never a border) |
| `--line` | `#241a13` | bar tracks, quiet dividers |
| `--line2` | `#2e2219` | stronger track |
| `--txt` | `#f6eee7` | primary text (cream) |
| `--mut` | `#b9a89a` | secondary text |
| `--dim` | `#9a887a` | captions and labels (≥4.5:1 on `--panel`) |
| `--up` | `#ffb27a` | up / positive (light orange) |
| `--down` | `#c9b8aa` | down / negative (sand) |
| `--blue` | `#e9c4a6` | category tone (peach) |
| `--amber` | `#ffa05c` | category tone, MOCK badge |
| `--purple` | `#b8663a` | category tone (rust) |

CSS-only extras: `--accent #ff6b1f` (the one accent: active pill, bars, the price line, focus ring),
`--accent-ink #1a0e06` (text on the accent), `--raise #1f1712` / `--raise-2 #261b13` (hover and active
fills), radii `--r-lg 26px`, `--r-md 18px`, `--r-sm 12px`, and `--ease` (a springy settle).

## Material and motion

- `.iris-card` — solid warm card; its edge catches the accent at two corners (a masked gradient border).
- `.iris-panel` — every `Panel`: lifts 3px on hover and a band of light sweeps across it (`still` opts out).
- `.ember-halo` — the slow conic light behind hero cards. `.ember-glow` — the breathing light over each page.
- `.shine` — light crossing large text (the price). `.rise` — staggered entrance. `.ember-grow` — bars grow in.
- All of it is transform/opacity and collapses under `prefers-reduced-motion`.

## Type

One typeface: **Inter Tight** (`--font-ember`), for prose, labels and numbers alike. `--mono` is kept as a
variable name only, so older components that still say `var(--mono)` render in Inter Tight. Numbers use
tabular figures (`font-variant-numeric: tabular-nums` on `body`).

| Class | Use | Tracking |
|---|---|---|
| `.t-display` | big figures and page titles (44–104px) | -0.045em |
| `.t-title` | panel titles, mid figures | -0.015em |
| `.t-label` | quiet field labels (13px, `--dim`) | 0 |
| `.t-caption` | footnotes and notes (12px, `--dim`) | 0 |

Tracking is size-specific (apple-design): large type tightens, small type stays at zero. Panel
labels are sentence case; `src/lib/softCase.ts` converts the ALL-CAPS labels in the data layer for
display and keeps abbreviations (BTC, ETF, RSI, MACD…).

## Layout

- **Shell:** no side rail. The top bar holds the IRIS mark, one pill row for the six sections, the live
  price, the UTC clock and the LIVE dot. Under it, `PageHeading` sets the section title large with a
  one-line lede and the sub-tab switcher. The footer carries feed health, the active model and the
  disclaimer.
- **Grid:** `.ember-page` (max 1440px, 32px gutters), `.ember-split` (wide main column + 380px side
  column, stacking below), `.ember-row3` (three cards that wrap). 20px between cards.
- **Responsive:** everything is flex-wrap; the pill navigation wraps under the mark on narrow screens.

## Migration layer

Pages that have not been rebuilt yet still carry the old micro-type (8–11px, wide tracking). Two
rules at the end of `globals.css` ("Migration layer") force those to 12px with normal tracking so they
stay legible in the new typeface. Delete them as components move to the `.t-*` classes.

## The globe

`src/components/features/events/EmberGlobe.tsx`, a 2D canvas (no WebGL). A Fibonacci lattice of
points on the sphere is split into land and sea against a raster of the bundled Natural Earth
country polygons, so the continents are real and nothing is downloaded. Events at one place share a
marker whose size is the number of stories there; its colour is the net tone of their headlines
(orange mostly positive, cream mostly negative, rust mixed). It turns on its own, follows a drag 1:1
and keeps the release velocity, zooms with the wheel, a pinch or the buttons, and turns to whatever
event is picked on the globe or in the news rail. Reduced motion stops the spin and the pulses.
