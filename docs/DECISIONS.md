# DECISIONS

Every number this terminal shows is either **data** (fetched from a source, reproducible)
or **opinion** (a composite, a weight, a threshold we chose). This file exists so the
opinions are auditable instead of buried in code. If you disagree with a weight, this is
the page to argue with.

---

## 1. Where data comes from, and what is real

The terminal has no database and no ingestion worker. Every `live.ts` fetches an upstream
API directly through `src/lib/sources/*`, cached by Next's `revalidate`. When a fetch fails
or returns nothing, `defineFeature` falls back to the deterministic mock layer and the panel
renders a `MOCK` badge. There is exactly one way for synthetic data to reach a pixel, and it
is always labelled.

### Keyless sources (no signup, verified working)

| Source | Used for |
|---|---|
| Coinbase Exchange | spot price, 24h stats, OHLCV candles, **~10y daily history via pagination** (§12) |
| Kraken | OHLCV fallback, long daily history (~720 candles ≈ 2y) |
| CoinGecko | market cap, BTC dominance, 7d/30d returns, 365d closes |
| alternative.me | Fear & Greed index |
| Crypto RSS (CoinTelegraph, Decrypt, NewsBTC, CoinDesk) | news wire, event geocoding |
| blockchain.info | hash rate, tx count, unique addresses, miner revenue |
| **Blockstream Esplora** | exchange address balances + transactions (flow intelligence) |
| **Bybit / OKX / Binance** | perp funding rate, open interest |
| **Deribit** | DVOL implied volatility, options open interest |
| **bitbo.io** | US spot ETF daily net flows per issuer (scraped — see §9) |
| **Binance futures-data** | retail / top-trader long-short ratios, taker buy-sell volume |
| **Yahoo Finance** (`v8/finance/chart`) | DXY, S&P 500, VIX, US 10Y, gold — 1y daily |

### Key-gated sources (dormant until configured)

| Source | Env var | Unlocks |
|---|---|---|
| FRED | `FRED_API_KEY` | Macro section for US / EU / JP / GB |
| CoinGecko demo | `COINGECKO_API_KEY` | higher rate limit (keyless tier works) |
| Arkham | `ARKHAM_API_KEY` | real historical exchange netflow, entity-labelled whale transfers |

---

## 2. On-chain flow intelligence — the honest limits

This is the area most likely to be over-trusted, so the constraints are stated first.

### The registry is a subset, not the market

`src/lib/onchain/exchangeRegistry.ts` holds **15 hand-verified exchange addresses** across
8 exchanges, totalling ~1.17M BTC at verification (2026-09-03). Exchanges collectively hold
roughly 2-3M BTC across thousands of addresses. **We see a fraction.**

Every panel built on the registry must render `TRACKED_SUBSET_NOTE`. Never present these
figures as "total BTC on exchanges". Re-verify with `npm run verify:registry`.

### There is no history

Without a database, reserve and hot/cold figures are a **snapshot at request time**, not a
trend. Panels carry a `SNAPSHOT · NO HISTORY` note. "Netflow" sums only the transactions
currently visible in the Esplora window — it is not a 24h or 7d aggregate in the sense
CryptoQuant or Glassnode mean it.

Standing up persistence (or an Arkham key) is what turns these into real time series.

### Esplora returns ~25 transactions per address

Large transfers we catch are the **most recent** ones only. A whale move that has scrolled
past the window is invisible. This is a coverage limit, not a bug.

### Hot / cold labels are curated, not clustered

Real address clustering (Glassnode, CryptoQuant, Arkham) is proprietary. Our `kind` field is
a human label attached to each registry entry. **A wrong label produces a wrong signal**,
which is why the registry is small and every entry was checked against live chain data
before inclusion.

Two registry entries have near-zero balances but very high transaction counts
(Binance `1NDyJt…` ~1.2M txs, Kraken `bc1qxhmd…` ~32k txs). They are kept deliberately: they
are routing addresses, useful for **flow detection** but meaningless for **reserve size**.

### Transfer classification

`src/lib/onchain/classifyFlow.ts`. Direction is resolved by looking every input and output
address up in the registry.

| Pattern | Kind | Bias | Reasoning |
|---|---|---|---|
| untracked → exchange | `EXCHANGE_INFLOW` | bearish | deposits precede selling |
| exchange → untracked | `EXCHANGE_OUTFLOW` | bullish | withdrawal to self-custody |
| cold → hot, same exchange | `HOT_LOADING` | bearish | exchange preparing liquidity |
| hot → cold, same exchange | `COLD_STORING` | bullish | moving to long-term storage |
| exchange A → exchange B | `INTER_EXCHANGE` | neutral | rotation, no net supply change |

**These bias assignments are opinion.** An inflow can be a market maker rebalancing rather
than a seller; `HOT_LOADING` can be routine operational topping-up. The signal is
directional and probabilistic, never a certainty. Minimum size threshold: **50 BTC**.

---

## 3. Derivatives — data vs interpretation

The raw numbers (funding rate, open interest, basis, DVOL, put/call ratio, max pain) are
data, fetched as published. **How we colour them is opinion:**

| Reading | Our interpretation | Why it can be wrong |
|---|---|---|
| Persistently positive funding | crowded longs, squeeze risk → bearish tone | can persist for months in a genuine bull trend |
| Negative funding | shorts paying, potential squeeze up → bullish tone | can signal real distribution |
| Rising OI with flat price | leverage building, volatility ahead | direction unknown; this is a risk flag, not a signal |
| Rising DVOL | market pricing bigger moves | says nothing about direction |
| Put/call > 1 | defensive positioning | can be hedging, not bearish conviction |

**Max pain** is computed as the strike minimising total option-holder payout:
`pain(S) = Σ_calls oi·max(0, S−K) + Σ_puts oi·max(0, K−S)`, evaluated over strikes with
non-zero open interest. It is a widely watched number with weak predictive evidence. Treat
it as context, not a target.

Funding annualisation assumes 8-hour periods: `rate × 3 × 365 × 100`.

---

## 4. Composite scores — entirely our opinion

### Confluence

`src/lib/features/confluence/live.ts` produces a 0-100 score from weighted layers. The
weights are **arbitrary internal choices**, not fitted or backtested. They are declared in a
single `WEIGHTS` constant so they can be changed in one place and argued about here.

Layers and their current weights:

| Layer | Weight | State |
|---|---|---|
| `TECHNICAL` | 0.34 | live — RSI / MACD / EMA gap / Bollinger position from real candles |
| `SENTIMENT` | 0.20 | live — Fear & Greed blended 50/50 with headline tone |
| `NEWS` | 0.20 | live — RSS lexicon tally |
| `MACRO` | 0.20 | **live since Yahoo was wired** — see §11 for the mapping |
| `ONCHAIN` | 0.06 | **still hardcoded `50`** |

`MACRO` went `0.10 → 0.20` when it stopped being a constant. `ONCHAIN` went `0.12 → 0.06`
for the opposite reason: it cannot move, and a layer that cannot move should not be allowed
to dilute the ones that can. It keeps a non-zero weight only so that wiring it later is a
weight change rather than a structural one.

A layer with no wired source contributes a neutral `50` rather than being silently dropped —
that keeps the composite honest about what it does not know. `src/lib/features/confluence/confluence.test.ts`
pins both the weights and the macro mapping, so changing a market view requires a deliberate
edit with a failing test attached.

`bearish` is defined as `100 − overall`. That is a presentation choice, not an independent
measurement.

### Weekly forecast

Replaced the initial rule with a trained 7-day BTC direction classifier (Average Ensemble:
MacroCrossAsset + Universal XGBoost models), while retaining the heuristic rule as an automatic fallback.

1. **Thresholds are opinions, not facts**: `t_bear = 0.23` and `t_bull = 0.70` were chosen by the
   researcher on expanding development OOF (validation) to balance class F1 and signal coverage.
   A probability between `t_bear` and `t_bull` yields `NO SIGNAL` (represented internally as `NEUTRAL`).
2. **Tiered fallback**:
   - Tier 1: Latest row in Supabase `clf_signals` → classifier mode (`method: 'classifier'`). The
     `RULE-BASED PLACEHOLDER` badge is removed, displaying model probability P(UP, 7D), domain contributions,
     and model provenance.
   - Tier 2: If `clf_signals` is empty or Supabase is unconfigured → the original weighted rule over
     real Coinbase/Kraken candles and Fear & Greed runs unchanged, with the `RULE-BASED PLACEHOLDER` badge.
   - Tier 3: Complete upstream failure → `defineFeature` renders the deterministic seeded mock with a `MOCK` badge.
3. **No new source key / no `data_source_status` writes**: We deliberately use the existing `internal_forecast`
   source key and the worker does not write status to `data_source_status`. Because `defineFeature` forces any
   feature to MOCK if its source status is `failed/degraded`, a worker failure writing `failed` would kill
   Tier 2's candle-based rule fallback.
4. **Volatility band without drift**: Forward return range uses realized volatility (`σ × √(7/365)`)
   **without a drift term**, because the classification model predicts direction probability, not price magnitude.
5. **Staleness threshold**: A signal row is marked `STALE` in the UI if `created_at` is older than 9 days
   (indicating one scheduled weekly run was missed).

The `RULE-BASED PLACEHOLDER` badge renders only when `method === 'rule'`.

### Monthly forecast — REMOVED (reinstated 2026-10-19 as Timothy's stored weekly run, see §16)

`/forecast/monthly`, `src/lib/features/monthlyForecast/`, `src/components/features/monthly/`
and `src/lib/quant/montecarlo.ts` were deleted once `/forecast/distribution` shipped. Recorded
here rather than dropped silently, because *why* it went matters more than that it went.

What it was: an i.i.d. bootstrap over 365 days of CoinGecko closes, 2000 paths, a fixed 30-day
horizon, publishing P10/P50/P90.

It was not merely superseded — **it contradicted its replacement**. `bootstrapPaths` resampled
raw log returns and therefore inherited whatever drift its window happened to contain. Measured
on the day of removal, that window carried a mean log return of **−0.0881%/day**, putting the
page's P50 at **−2.6% below spot** for the 30-day question. `/forecast/distribution?h=1M`
answers the identical question and puts P50 **on spot**, because drift is removed.

The direction of that error was an accident of the window, which is the whole argument: ten
years of history gives **+0.134%/day** and would have tilted the same page upward instead. Same
method, opposite conclusion, decided by nothing but the lookback. Two pages disagreeing on one
question, with the disagreement carrying no information, is worse than one page.

Everything else favoured the replacement too: 3,900 daily closes against 366, filtered
historical simulation against i.i.d., a P5–P95 ladder against three points, six horizons
against one.

`montecarlo.ts` went with it because `bootstrapPaths` had no other caller. **The i.i.d. baseline
survives** — `/forecast/calibration` still scores it against FHS on the same out-of-sample
origins, via `simulate({ method: 'iid' })` in `src/lib/quant/fhs.ts`. The control is still run;
it just no longer has a page presenting its output as a forecast. See §12.

Old bookmarks are redirected to `/forecast/distribution?h=1M` from `next.config.ts`.

### The WEEKLY tab is now DIRECTION

`/forecast/weekly` kept its route and its rule, and changed only what the tab reads.

It was not removed, because it is the only panel that takes a **directional** view, and the
distribution page refuses to take one by construction — drift removal is exactly what flattens
its median onto spot. The two answer different questions.

But sitting beside a page whose shortest horizon is labelled `1W`, a tab called `WEEKLY` read
as a competing answer to the same question rather than a different kind of answer. The slug
stays `weekly` so bookmarks and `iris_sub` cookies keep working.

### News and social sentiment

A keyword lexicon (`src/lib/sources/lexicon.ts`), not an NLP model. It scores headline words
and nothing else — no negation handling, no sarcasm, no context. Adequate for a directional
tilt, wrong on individual headlines with some regularity. Panels label it as heuristic.

### Event impact score — removed 2026-10-16

Was `impact = category base + recency bonus (0-20) + multi-source cluster bonus (0-15)`,
tiered HIGH/MEDIUM/LOW, with category bases (security/monetary 70, regulation/ETF/geopolitics
60, legal/adoption 50, market 40) chosen by hand. The same treatment applied to whale and
exchange-flow transfers (a ramp over USD/BTC size with hand-picked floor and saturation).

Removed because none of those numbers had anything behind them, and a "HIGH IMPACT" tag
reads as a measured claim about the market. News and events are now ordered by publish
time; transfers show their BTC/USD amount, which is a fact. The standing macro-calendar
markers (FOMC, CPI, ...) went with it: they were stamped with today's date every day
whether or not anything happened. `supabase/migrations/0004_drop_whale_impact.sql` drops the
database column.

### Blended sentiment score — removed 2026-10-16

Was `0.6 × headline tally + 0.4 × (Fear & Greed − 50)/50`. Both weights were arbitrary.
The headline percentages (a plain count) and Fear & Greed (an external index) are each
still shown on their own.

---

## 5. Alert thresholds

`src/lib/features/alerts/`. Pure functions over already-fetched envelopes — no extra network
calls. Thresholds are starting points, not optimised values:

| Rule | Threshold | Severity |
|---|---|---|
| `HOT_LOADING` transfer | ≥ 500 BTC | HIGH bearish |
| `COLD_STORING` transfer | ≥ 500 BTC | MEDIUM bullish |
| Net exchange inflow | above configured size | HIGH bearish |
| Funding rate | > 0.05% per 8h | MEDIUM bearish |
| Funding rate | < −0.02% per 8h | MEDIUM bullish |
| Open interest | +15% / 24h with flat price | MEDIUM neutral (risk) |
| DVOL | +20% / 7d | MEDIUM neutral (risk) |
| RSI | > 75 or < 25 | LOW |
| Fear & Greed | ≥ 80 or ≤ 20 | LOW contrarian |

> **NOT BUILT.** `src/lib/features/alerts/` does not exist. The table above is a
> design note that has been read as a description of shipped code; it is neither.
> Left in place because the thresholds are still the intended starting values,
> and `whale_events` now supplies the history that rules like "net exchange
> inflow over an hour" always needed.

Alerts would be computed per render and **not persisted** — no history of past alerts,
no notification delivery.

---

## 6. Other standing decisions

- **Timeframe mapping** (`TIMEFRAME_SPEC` in `src/lib/nav.ts`): every pill gets its **own
  candle interval** — `1D`→15m, `7D`→1h, `1M`→4h, `3M`→6h, `1Y`→1d, `ALL`→1w. This is
  deliberate: a spot indicator (last RSI / MACD / EMA point) depends only on the interval,
  so two pills sharing an interval would render identical technicals regardless of window.
  `4h`/`1w` and windows over ~290 candles are served by Kraken; the rest by Coinbase
  (`ohlcv/live.ts` + `indicators/live.ts` route by interval). Pills are hidden on sections
  where they would do nothing (Quant, Forecast, Chain).
- **Seasonality history is ~2 years**, limited by Kraken's keyless window. The panel says so.
- **Indonesia and China macro stay mock.** No honest free source exists. Filling those tabs
  with plausible-looking numbers would be worse than an empty badge.
- **`chainFlows` netflow history** cannot be reproduced keyless. The DIY path gives a
  snapshot; real history needs Arkham or a database.
- **Spot ETF flows are implemented, by scraping bitbo.io** (§9). CoinGlass still requires a
  key and Farside still answers 403 to anything automated; bitbo publishes the same issuer
  data as server-rendered HTML with no key. **Cross-venue liquidations remain unimplemented** —
  no keyless source publishes them.
- **Mock determinism**: all mocks seed from the UTC date (`src/lib/rng.ts`), so SSR and
  client hydration agree and values are stable within a day. Never use `Math.random()` or
  `Date.now()` in a mock path.

---

## 7. Whale wire

**Source.** Whale Alert's REST API, not the `@whale_alert` X account. The account
is a rendering of this API; reading the API is faster, structured, and does not
depend on a platform that blocks readers. The X path was evaluated and rejected
on evidence — see the Nitter probe results in `DATA_MANIFEST.md`.

**Why it needs a table.** The free tier returns roughly the last ten minutes and
offers no historical access. Fetching on render would produce a feed that is
empty most of the time. `whale_events` is therefore the first table the web app
actually reads, written every five minutes by `/api/ingest/whale`, with 30-day
retention pruned at the end of each run.

**Why the web app holds a service role key.** See `ARCHITECTURE.md`, "The
ingestion exception".

**Why this panel polls and nothing else does.** Every other panel is a server
component refreshed by the route's 30s ISR window. An event wire is different: a
reader watching it expects a new line to appear while they are looking, not on
their next navigation. `WhaleWire` therefore holds a 60s interval against
`/api/whale`. It skips ticks while the tab is hidden, and a failed poll holds the
previous payload rather than blanking the panel — stale data with an honest age
in the footnote beats an empty wire.

**Impact scoring.** `usdImpact` in `src/lib/onchain/classifyFlow.ts`, a log ramp
from 20 at $500K to 100 at $500M. Linear would score everything under $50M as
noise across a range spanning three orders of magnitude. Chosen by hand, like
every other threshold in this document.

**Coverage limits.** The free tier never reports a transfer under $500,000, so
the wire is not a complete picture of whale activity and the panel must not be
read as one. Stablecoin `mint` / `burn` events are dropped rather than forced
into the inflow/outflow vocabulary, which would misrepresent them.

---

## 8. Network conditions and the honesty pass

**mempool.space, keyless.** Fees, mempool backlog, the difficulty retarget,
three months of hashrate, and pool distribution — none of which the terminal
covered before, all of it free and without a key. `/chain/network`.

Panels built on it must say **"as seen by mempool.space"**. The mempool is not a
global object: another node with different relay policy or uptime holds a
different backlog. The figure is one node's view and claiming otherwise would be
a bigger error than the number itself.

Pool attribution is a coinbase-tag heuristic. Blocks matching no known tag land
in "Unknown", and that bucket is kept — hiding it would leave the remaining
shares adding to 100% of something smaller than the network while appearing to
add to the network.

`difficultyChange` is an **estimate** extrapolated from the epoch's block pace so
far. `progressPct` is its confidence and is rendered directly above it. The
change carries no bull/bear colour: rising difficulty is a security positive and
a miner-margin negative at once, and colouring it would assert a direction the
number does not support.

**Fee histogram bucketing.** The upstream histogram's boundaries move with
demand, so a raw plot means something different on every load. It is folded into
seven fixed sat/vB bands in `sources/mempool.ts` — comparable over time, which is
the only reason to look at it.

**`newAddresses` removed.** `chainSupply` shipped a "NEW ADDRESSES" figure
computed as 6% of active addresses. The comment said APPROX; the tile said
nothing. No keyless source publishes a first-seen-address series, so it was
deleted rather than badged — the same reasoning that keeps Indonesian macro
blank. Its slot now holds Blockchair's 24h transferred volume, which is measured.
That field is `number | null`, and a Blockchair outage renders `—`, never `0`.

**Feed counting.** `computeLiveSources` treats `data_source_status` as a set of
corrections to the static wired list, not as a replacement for it. The previous
either/or would have dropped the rail footer from 11/17 to near zero the moment
the catalogue was seeded, with nothing actually broken. A row at `mode =
'unknown'` is not an opinion and changes nothing. `feedHealth.test.ts` covers it.

**SYNC is labelled.** Direct-fetch sources report no success timestamp, so the
footer substitutes the current time — defensible, since those responses are at
most one revalidate window old, but it used to be an unmarked `new Date()`. It
now carries an asterisk and a tooltip saying which of the two readings is on
screen.

**Ingestion reports itself.** `/api/ingest/whale` writes `whale_alert`'s row via
`supabase/sourceStatusWriter.ts`: `live` on success, `degraded` on a miss,
`failed` after three consecutive ones — so a single dropped request does not make
the footer flicker. A run that fetched zero transfers is a success; whales are
not obliged to move every five minutes.
---

## 9. Spot ETF flows

`src/lib/sources/etfFlows.ts` → `src/lib/features/etfFlows/` → `/chain/etf`.

### What the numbers are, and are not

They are **a third party's transcription** of issuer creation/redemption disclosures,
scraped from bitbo.io. They have not been reconciled against any issuer's own filing. Units
are US$ millions, signed, one decimal — bitbo's own precision, not ours.

The window is **whatever bitbo published**, typically eight to ten sessions. It is **not
cumulative since launch**. `windowNetUsdM` must never be labelled "total ETF flows"; the
panel prints the session count beside it for exactly this reason.

ETF creations settle **T+1**, so the newest row lags spot by a session. A flow print can help
explain yesterday's candle. It can never explain today's.

### Why scraping, and how it is contained

CoinGlass requires a key; Farside answers 403 to automated requests. bitbo serves the same
table as server-rendered HTML with no key and no JS hydration. The cost is a dependency on
someone else's markup — so the parser is built to fail loudly rather than degrade quietly.
Six gates, every one of which throws:

| # | Gate | Catches |
|---|---|---|
| 1 | a `<table>` exists | page replaced or client-rendered |
| 2 | header row starts with `Date` | table swapped for a different one |
| 3 | at least 5 fund columns before `Totals` | layout collapsed |
| 4 | strict `MMM DD, YYYY` pattern, real calendar date | format change; **never `Date.parse`** |
| 5 | **per-fund cells sum to the printed total, tolerance 1.0** | **column shift** |
| 6 | at least 3 dated rows; every value under 20,000 (US$m) | truncation, units change |

Gate 5 is the one that matters. A shifted column produces numbers that are finite, plausible
and attributed to the wrong issuer — no other check sees it. `Date.parse` is banned in gate 4
for the same reason: its behaviour on non-ISO strings is implementation-defined, so it would
happily return a confident wrong date.

A row that fails is dropped whole, never patched cell by cell — a partial row *is* the
column-shift case. Any gate failure means `defineFeature` renders the seeded mock with a
`MOCK` badge. There is no best-effort path.

`src/lib/sources/etfFlows.test.ts` runs the parser against a saved snapshot of the real table
(`__fixtures__/bitbo-etf-flows.html`) and asserts each gate throws.

### Opinion in this feature

`grossSharePct` ranks issuers by **absolute** flow, not net, so a fund that took in 200 and
paid out 200 reads as a major participant rather than an absent one. That is a choice about
what "leading" means.

---

## 10. Positioning and premium

`src/lib/sources/positioning.ts` → `src/lib/features/positioning/` → `/chain/positioning`.

### Data

Three Binance `futures/data` endpoints and one price ratio:

| Series | Cohort |
|---|---|
| `globalLongShortAccountRatio` | every account, one vote each — retail |
| `topLongShortPositionRatio` | largest accounts by margin, weighted by position — the large book |
| `takerlongshortRatio` | volume that crossed the spread — aggression |
| Coinbase BTC-USD over Binance BTCUSDT | Coinbase Premium |

### Opinion, clearly marked

**`divergence = topTraderRatio − retailRatio` is our own construction**, not a published
index. The bias buckets are hand-chosen and fitted to nothing:

| Condition | Bias |
|---|---|
| `divergence >= +0.5` | bullish |
| `divergence <= -0.5` | bearish |
| `retailRatio >= 1.20` and no strong divergence | bearish (crowded long) |
| `retailRatio <= 0.85` and no strong divergence | bullish (crowded short) |
| otherwise | neutral |

"Crowded retail longs are contrarian bearish" is a **market aphorism, not a law**. It fails in
sustained trends — which is precisely when following it costs the most. The panel renders the
bias together with the sentence that produced it, never as a bare verdict.

### Limits

**Binance is one venue's book, not the market's.** Its retail mix is not everyone's, it
geo-blocks some jurisdictions, and the "top trader" cohort is defined by Binance's own margin
ranking, which cannot be inspected from outside.

The **Coinbase Premium** compares a USD pair against a USDT pair, so part of any reading is
really stablecoin drift rather than a premium. Typical values are a few basis points — well
inside the spread. The panel therefore uses a **fixed ±0.20% scale** rather than an
auto-fitted one, so a 0.007% reading looks as small as it is. Read the trend, not the tick.

Each series is fetched independently; a dead endpoint sets its own `available` flag and
renders an em dash in that panel rather than blanking the page.

---

## 11. Global markets and the macro layer

`src/lib/sources/yahoo.ts` → `src/lib/features/macroMarkets/` → `/macro/markets`, and the
`MACRO` layer of the confluence score.

### Source caveats

Yahoo's `v8/finance/chart` endpoint is **public but undocumented and unsupported**; it can
change without notice and needs a browser User-Agent. The sibling `v10/finance/quoteSummary`
now answers 401 without a session crumb and is deliberately not used — anything unavailable
from the chart endpoint is simply not fetched.

`indicators.quote[0].close` contains `null` for holidays and halts. Those entries are dropped
**together with their timestamps**; zero-filling would poison every return computed from the
series. A symbol that fails is listed in `data.missing` and rendered as such, never hidden by
silently shortening the table.

### The correlation, and the trap it avoids

Equities trade about 252 sessions a year; BTC trades 365. Zipping two close arrays by index
pairs a Tuesday with a Saturday somewhere in the first month, and every number after that is
wrong while remaining perfectly plausible. `src/lib/quant/correlation.ts` therefore matches
the two series **by UTC calendar day** before computing anything.

Below **30 overlapping sessions** the correlation reports `null`, rendered as an em dash. A
correlation computed from eleven points is not a 30-day correlation and will not be displayed
as one. `pearson` also returns `null` — not `0` — when either side is flat, because zero reads
as "measured, and unrelated" when the truth is "not measurable".

`z1y` places the current level inside that instrument's **own** trailing year. It is a rank
within that year, not a valuation, and carries no view on what happens next.

### The macro mapping (opinion)

`macroScore()` in `src/lib/features/confluence/live.ts`. Each sub-signal maps to the range
−1..+1, the available ones are averaged, and the mean is mapped to 0-100:

| Input | Mapping | Reasoning |
|---|---|---|
| DXY | `-clamp(z / 2, -1, 1)` | a strong dollar is a headwind; ±2 sigma pins the signal |
| VIX | level, interpolated across `15 -> +1`, `20 -> +0.5`, `25 -> 0`, `35 -> -0.5`, `45 -> -1` | **level, not z-score** — the distribution is heavily right-skewed, so a z-score understates exactly the spikes that matter |
| S&P 500 | `clamp(chg30d / 10, -1, 1)` | risk appetite; a ±10% month pins the signal |

A missing sub-signal is **skipped, not defaulted to zero**, so one dead symbol does not drag
the layer toward neutral. With all three missing the layer returns `50`, the same honest
neutral it had before Yahoo was wired. The whole block sits in a `try`/`catch`: a Yahoo
outage degrades confluence to its previous behaviour and can never take the page down.

### FRED stays

Yahoo is **purely additive**. CPI, policy rates and GDP are national statistical releases;
the chart endpoint serves market prices and has none of them. `^TNX` gives the US 10-year
yield, which overlaps nothing in the FRED series list. `/macro/data` and `/macro/regime`
remain FRED-gated and country-scoped; `/macro/markets` is global and ignores the country tabs
rather than implying a scoping that does not exist.

---

## 12. Price distribution and forecast calibration

`src/lib/quant/{garch,fhs}.ts` → `src/lib/features/{priceDistribution,forecastCalibration}/`
→ `/forecast/distribution` and `/forecast/calibration`.

### The data ceiling, and how it was lifted

Coinbase caps a *response* at 300 candles, not a product's history. Passing an
explicit `start`/`end` pair moves that window anywhere, so `getDailyHistory`
walks it backwards in batches of four. Verified result: **3,900 daily closes,
2016-01-03 through today, 10.68 years, zero gaps.** The 2016 close was $431.91.

That matters because the alternatives are much shorter, and the code used to
believe they were the ceiling:

| Source | Daily limit |
|---|---|
| **Coinbase, paginated** | **~3,900 (to 2016)** |
| Kraken | 721 (~2 years) |
| CoinGecko, keyless | 365 — `error_code 10012` above that |
| Coinbase, single request | 300 |

Requests go out four at a time with an 80 ms pause. Fully sequential measured
8.5 s cold, which is too slow to render behind; all thirteen at once risks a 429
mid-assembly, which would produce a series with a hole in it rather than an
error. Batched: **3.3 s cold**, and Next caches the pages for a day.

Kraken and a single Coinbase page remain fallbacks. When they are used the
history is shorter and the long horizons rest on fewer samples — which the
`WINDOWS` column reports rather than hides.

### Drift is removed. This is the most consequential choice on the page.

Ten years of BTC carries an enormous upward drift. Measured on the real series:
**+0.1339% per day**, which compounds to roughly **+63% over a year**. A
bootstrap that inherits it produces a cone whose median rises steeply — and that
rise would encode nothing except which decade the sample came from.

So the sample mean is subtracted from the returns before anything else runs.
The consequence, verified on live data:

| Horizon | Median vs spot |
|---|---|
| 7d | −0.12% |
| 30d | +0.22% |
| 90d | −0.65% |
| 180d | −0.63% |
| 365d | −1.65% |

The median sits on spot at every horizon. **What the page shows is a
distribution of risk, not a forecast of direction.** It answers "how far could
price travel", never "which way will it go". Every panel says so, and
`fhs.test.ts` asserts it — a series carrying +0.2%/day must still produce a
median terminal multiplier between 0.9 and 1.1 over 365 days. If drift ever
leaks back in, that test fails.

The mean terminal multiplier is still above 1, and correctly so: prices are
lognormal, so a distribution centred on zero in log space is right-skewed in
price. That is Jensen's inequality, not drift.

### Method: Filtered Historical Simulation

The retired monthly forecast's i.i.d. bootstrap understated the tails, and §4
always said so. FHS is the fix, and it is the standard construction for exactly
this problem:

1. Fit GARCH(1,1) and take the conditional sigma for every day.
2. Divide each return by its sigma. The resulting standardised residuals are
   close to i.i.d. — which is what makes resampling them defensible when
   resampling raw returns is not.
3. Resample those residuals, and re-inflate each path through **its own**
   variance recursion, so a large simulated shock makes the next simulated day
   more volatile.

This keeps volatility clustering *and* the empirical shape of the tails, while
assuming no distribution whatsoever.

Three engines are implemented behind one interface — `fhs`, `stationary`
(Politis–Romano geometric blocks, preserving autocorrelation) and `iid` (the old
behaviour). The calibration page scores them against each other, so the default
is falsifiable rather than asserted.

**FHS is conditional, and that cuts both ways.** It starts from *today's*
volatility, so on a calm day its cone is narrower than the unconditional i.i.d.
mixture and on a violent day much wider. It is not uniformly "fatter"; it is
responsive, which is the property worth having. The test suite asserts the
responsiveness, not the width.

### Volatility model

GARCH(1,1) by Gaussian maximum likelihood, with **variance targeting**:
`omega` is pinned to `sigma_LR^2 * (1 - alpha - beta)` rather than searched, so
the fitted process reverts to the sample's own long-run variance by construction.
The remaining two parameters are found by a coarse grid plus two refinement
passes — a few thousand cheap recursions that return the same answer every run,
which server-rendered output requires and an iterative solver with a tolerance
would not guarantee.

Stationarity is enforced (`alpha + beta < 0.999`). A fit that lands on a boundary
is reported `converged: false` and **EWMA (RiskMetrics, lambda 0.94) is used
instead** — shown on the panel as `EWMA FALLBACK`, never silently.

The forecast volatility path mean-reverts:
`E[sigma^2_{t+h}] = sigma_LR^2 + persistence^(h-1) * (sigma^2_{t+1} - sigma_LR^2)`.
This is the reason GARCH is here at all. The textbook `sqrt(t)` shortcut assumes
volatility never changes, so a forecast made on a calm day would stay
implausibly calm for a year. Measured on live data: conditional vol 49.3%
annualised against a long-run 67.4%, and the path closes that gap rather than
scaling the 49.3% outward.

### Sample size is published, not buried

`nonOverlappingWindows = floor(sampleDays / horizonDays)`, rendered as the
`WINDOWS` column. A one-year band drawn from a decade rests on about **ten**
independent observations. The short horizons are well sampled; the long ones are
indicative, and the table says which is which instead of presenting all six rows
with equal authority.

### One simulation, six horizons

The page runs **one** 365-day simulation. Shorter horizons are read off its
intermediate band rows, and the path-level cross-section is captured at whichever
horizon is selected. Six independent runs would cost six times as much and — the
real problem — the 1M row and the 1Y row would come from different random draws,
so the table could contradict itself and the chart above it.

### Calibration: the part that makes the cone worth believing

A smooth cone looks like knowledge. `/forecast/calibration` is the check.

For roughly 110 historical origins the model predicts forward without seeing the
answer, and the outcome is compared against the bands it claimed.

**Genuinely out-of-sample.** GARCH parameters and the residual pool are fitted
once on the earliest 40% of history; every scored origin sits after that prefix.
Refitting at each origin is the textbook ideal but takes far too long to render
behind, and fitting on a prefix leaks nothing — no origin's own future touches
the model that predicts it. Each origin does start from the conditional sigma
that was genuinely observable on its day, obtained by running the variance
recursion forward once across the whole series.

Three metrics:

- **Coverage** — did the 50/80/90% bands contain the outcome that often?
  `NARROW` when empirical falls more than 7 points short (overconfident, the
  failure that matters), `WIDE` when it exceeds by more than 7. Seven points of
  slack because with ~110 origins the sampling error on a coverage estimate is
  already several points, and a tighter rule would flag noise.
- **PIT** — the predictive CDF evaluated at each outcome. Flat means calibrated;
  a U means bands too narrow; a hump means too wide.
- **Pinball loss** — sharpness, so a model cannot win by being uselessly wide.

Measured on the real series at a 30-day horizon, 116 out-of-sample origins:

| Band | Claimed | Actual | Verdict |
|---|---|---|---|
| P25–P75 | 50% | 48.3% | GOOD |
| P10–P90 | 80% | 76.7% | GOOD |
| P5–P95 | 90% | 93.1% | GOOD |

PIT uniformity 86/100, shape FLAT.

The engine comparison is **not** a clean win, and the page shows that: at 30 days
i.i.d. scored a marginally better pinball loss (0.0428 against 0.0432) while FHS
landed closer to its advertised 80% coverage (76.7 against 87.1). FHS remains the
default because coverage accuracy is the property the cone is claiming, but the
numbers are on screen and can be argued with.

### What this model does not know

It has never heard of a halving, an ETF approval, a exchange failure, or a
regulatory announcement. It assumes the next N days resemble the *shape* of the
last decade's returns — a decade that contained two halvings and two full cycles,
which is a strength for sample size and a weakness for stationarity.

It cannot forecast direction, and by construction does not try.

---

## 13. Kurasi dashboard, real-time, dan anti data basi (18 Okt 2026)

Kurasi ini dilakukan pemilik proyek panel demi panel. (Spec penyederhanaan otomatis sebelumnya
ditolak dan disimpan di branch `simplification-spec`.) Panel yang dihapus di bawah **tidak
ditambahkan lagi tanpa persetujuan pemilik**; rasio long/short, distribusi cold/hot, dan
transfer real-time **wajib dipertahankan**.

### Dihapus (dan ke mana link lamanya)

Semua redirect memakai **307 (sementara)** — 308 permanen disimpan browser selamanya dan sempat
membuat halaman yang dikembalikan tetap terlempar.

| Yang dihapus | Redirect |
|---|---|
| Tab Market (Price, Technicals) | `/market/*` → `/overview` |
| Quant → Volatility | → `/quant/seasonality` |
| On-Chain: Supply, Network, Derivatives | Supply → `/chain/wallets`, Network → `/chain/etf`, Derivatives → `/chain/long-short` |
| Positioning: DIVERGENCE, BIAS · OPINION, COINBASE PREMIUM | `/chain/positioning` → `/chain/long-short` |
| Flows: kartu DEPOSIT, FLOW SUMMARY, netflow gauge ganda | `/chain/flows` → `/chain/wallets` |
| ETF: STREAK, IBIT SHARE, BY ISSUER, kolom NET matrix | — |
| Sentiment: bar chart social 30 hari, sel WHALE FLOW 24H | — |
| Macro: negara selain US, COMPOSITE IMPULSE, kolom CORR & Z 1Y, strip z-score, semua angka sigma | — |
| Forecast: tab Calibration, OUTCOME DENSITY, PROBABILITY ABOVE, MODEL STATE, kolom WINDOWS | `/forecast/calibration` → `/forecast/distribution` |

Sub-tab On-Chain memakai slug baru (`etf`, `long-short`, `wallets`) supaya tidak bertabrakan
dengan redirect 308 lama yang sudah tersimpan di browser.

### Aturan tampilan

- **Tidak ada informasi ditulis dua kali** di satu halaman (cold/hot satu bar saja, net per sesi
  hanya di grafik, kisaran mingguan sekali, dst.).
- **Tanpa sigma / persentil di layar.** z-score ditulis dengan kata (`src/lib/zWords.ts`, batas
  ±1/±2 simpangan baku); persentil distribusi jadi SANGAT RENDAH … SANGAT TINGGI.
- **Kalimat sederhana di tiap tab.**
- **Setiap grafik punya tanggal dan nilai saat hover** (`src/components/charts/ChartHover.tsx`,
  tanggal diformat manual dalam UTC di `src/lib/dates.ts` agar server dan browser sama).
- **Korelasi:** grafik korelasi 30 hari bergulir per pasar (small multiples, skala −1..+1 sama),
  dengan area "noise" `|r| < 1.96/√30`. Satu grafik dengan lima garis ditolak karena saling tumpuk.
- **Seasonality** memakai bar bulanan Yahoo sejak Okt 2014; "peluang naik" = tahun naik ÷ total
  tahun, bulan berjalan tidak dihitung.
- **Regime NORMAL**: kalau pertumbuhan dan inflasi sama-sama dalam ±1 simpangan baku, label
  kuadran tidak dipakai (sebelumnya "DEFLATION" tampil di samping tulisan "sekitar biasanya").

### Real-time dan anti data basi

Ditemukan 18 Okt: harga BTC tertahan di 82,186.92 (cache ±2 hari) dan Flow Radar menampilkan
transaksi PENDING dari 3 hari sebelumnya, semuanya berlabel LIVE. Penyebab: DNS Indosat
memblokir Coinbase, Kraken, Binance, Bybit, OKX, Blockstream dan mempool.space; Next.js terus
menyajikan respons cache terakhir saat revalidasi gagal, sehingga tidak ada fallback yang jalan.

1. **Penjaga cache basi** (`src/lib/sources/http.ts`): umur respons dari header `date`; lebih tua
   dari `max(4 × revalidate, 5 menit)` → diambil ulang tanpa cache; gagal → error, sehingga
   sumber cadangan (Coinbase → Kraken → Yahoo) atau penyembunyian panel berjalan.
2. **Umur dari data** (`asOf` dari payload, `maxAgeSec` per fitur di `src/lib/maxAge.ts`) dan
   badge **STALE · umur**; tidak ada lagi "0s ago" dari waktu render.
3. **Panel dummy disembunyikan** (`LiveOnly`): placeholder tidak pernah tampil; harga topbar kosong
   kalau sumbernya mock; transfer mock tidak masuk peta event.
4. **Auto-refresh** 30 detik (`AutoRefresh`, `router.refresh()`), berhenti saat tab tersembunyi.
5. Jaringan uji dibuka dengan DNS publik (1.1.1.1 / 1.0.0.1, 2606:4700:4700::1111 / ::1001).

Bug lain yang diperbaiki saat itu: tanggal harian CoinGecko bergeser satu hari (korelasi BTC ±0),
batas kesegaran FRED kuartalan 200 → 270 hari, kolom 1D Macro Markets (dulu ±1 tahun), satuan
taker flow ("$" → BTC), dan teks mining pool / subset yang salah.

## 14. Halving cycle & power-law corridor (19 Okt 2026)

> Bagian tampilan di bawah (skenario harga, peluang bottom, uji mundur, uji zona, episode) **dicabut
> di §15** — tetap di notebook. Definisi top 60%, distribusi t, dan power-law walk-forward tetap.

Dua sub-tab baru di Quantitative, dari notebook riset `research/BTC_Halving_Cycle_PowerLaw.ipynb`
(prompt: `IRIS_quant_cycle_powerlaw_prompt.md`). Semua dihitung ulang di TypeScript
(`src/lib/quant/cycle.ts`, `powerLaw.ts`, `studentT.ts`) dari harga harian Coin Metrics
(cadangan: blockchain.com); output notebook hanya dipakai sebagai fixture uji parity
(`src/lib/quant/__fixtures__/cycle/`, dibuat ulang dengan `research/nb_fixtures.py` pada data
beku 18 Okt 2026, tinggi blok 972.106).

| Keputusan | Alasan |
|---|---|
| **Top siklus = puncak yang diikuti turun ≥60%** sebelum ada puncak baru (bukan "close tertinggi antar halving") | Harga menembus top 2021 pada Maret 2024, sebelum halving; definisi antar-halving akan salah memilih Maret 2024. Top siklus berjalan dianggap terkonfirmasi setelah turun ≥40%; bottom-nya hanya "terendah sejauh ini" dan tidak masuk statistik. |
| **Interval = distribusi t**, df = n−1, skala = sd·√(1+1/n) | Siklus lengkap baru 3. Dengan n = 3 pengali 95% adalah 4,30, bukan 1,96 — interval lebar itulah jawaban jujurnya (sama dengan posterior predictive Bayes, prior non-informatif). Tanpa ML: 3 titik selalu bisa di-fit sempurna tanpa arti. |
| **Uji mundur** (tebak tiap siklus hanya dari siklus sebelumnya) tampil di halaman | Satu-satunya cek apakah proyeksi tanggal layak dipercaya. Rata-rata meleset: cara A 35 hari, B 102, C 4, bottom 30. |
| **Skenario harga, bukan satu target** | Kelipatan dan drawdown hanya 3–4 titik; interval t-nya tidak bermakna (mis. kelipatan 80%: −11 s/d 26×). |
| **Power-law walk-forward**: fit ulang tiap awal bulan hanya dengan data sebelumnya; persentil = bagian residual masa lalu ≤ residual hari ini | Rainbow chart biasa di-fit pada seluruh data dan digeser setelah kejadian (hindsight). Eksponen b sendiri bergeser (2014: 6,54 → kini 5,64). Pita di grafik memakai fit terbaru dan diberi catatan; semua uji memakai persentil walk-forward. |
| Pita quantile-regression seluruh data (notebook §2.1) **tidak dipakai** | Notebook sendiri menyebutnya hindsight, hanya untuk gambar. |
| Rata-rata meleset dibulatkan **half-to-even** | Sama dengan `pandas.round(0)` (4,5 → 4), supaya angka di layar sama dengan notebook. |
| Halving berikutnya dari tinggi blok **hari ini** × 9,6 / 9,85 / 10,0 menit | Tinggi blok = kondisi sekarang. Tanpa tinggi blok (mempool.space dan blockchain.info gagal) tanggal halving dan top cara B tidak ditampilkan — tidak ditebak. |

Yang menyimpang dari prompt, mengikuti aturan yang lebih baru (§13): panel tanpa data asli
**disembunyikan** (`LiveOnly`), bukan ditampilkan sebagai MOCK; blurb `Seasonality · cycle ·
power-law` (Volatility sudah dihapus); revalidate halaman 30 detik seperti tab lain (nilai layout
yang berlaku), sedangkan seri Coin Metrics sendiri di-cache 1 hari; seri chart di-downsample
mingguan seluruhnya (±770 titik) supaya data hover tetap kecil.

## 15. Website tanpa konten statis (19 Okt 2026)

Koreksi `IRIS_koreksi_auto_compute.md` (menimpa prompt §14 bila bertentangan). Website di-deploy dan
harus berjalan sendiri: tidak ada angka, tanggal, atau tabel yang perlu diperbarui manual.

| Aturan | Penerapan |
|---|---|
| Semua angka dihitung saat render | Halving Cycle, Power-Law, Seasonality dihitung dari close Coin Metrics + data blok tiap revalidate. "Hari ini" = data terakhir (harga) atau jam server UTC (hitung mundur, penanda jendela). |
| Yang boleh ditulis di kode | Fakta protokol (genesis, 210.000 blok, 10 menit) dan parameter metode — semua di `src/lib/quant/config.ts`, ditampilkan di tooltip METODOLOGI. Satu pengecualian teruji: tanggal 4 halving historis sebagai cadangan, dicek terhadap timestamp blok (`halvings.test.ts`). |
| Tanggal halving dari blockchain | Timestamp blok di tiap kelipatan 210.000 (mempool.space → blockchain.info → cadangan). Halving masa depan tidak pernah ditulis; halving ke-5 masuk sendiri saat blok 1.050.000 lahir. |
| Estimasi halving | Tengah = rata-rata waktu blok epoch sekarang; rentang = min/max dari itu, rata-rata epoch halving terakhir, dan 10 menit. |
| **Bottom terkonfirmasi = naik ≥ +100% tanpa low lebih rendah** | Supaya bottom bisa diakui tanpa menunggu ATH baru (biasanya ±2 tahun kemudian). Untuk siklus 2013/2017/2021 hasilnya sama dengan notebook; low baru memindahkan bottom dan me-reset konfirmasi. Status siklus (`MENUNGGU TOP` / `TOP SEMENTARA` / `BOTTOM TERKONFIRMASI` / `SIKLUS SELESAI`) menentukan apa yang diproyeksikan; proyeksi berantai memakai Monte Carlo deterministik (seed tetap, 20.000 sampel). Diuji dengan simulasi waktu T1–T6 (`cycle.test.ts`). |
| **Hasil riset tidak tampil** | Peluang bottom per bulan, skenario harga, thesis populer, tabel uji mundur, kelipatan/drawdown, uji per zona, episode sentuh pita, persentil di top/bottom, dan pita di tanggal proyeksi dihapus dari website (kodenya juga). Alasannya: semuanya ekstrapolasi dari 3–4 titik atau uji historis yang pantasnya dibaca di notebook, bukan angka yang bergerak tiap hari. Uji mundur tetap dihitung, hanya rata-rata melesetnya yang tampil di keterangan. |
| Seasonality | Dari Coin Metrics (sejak 2010), close-to-close bulanan, bulan berjalan bertanda BERJALAN dan di luar ringkasan; pergantian bulan otomatis. |
| Confluence ONCHAIN = 50 | Dihapus, bobot sisanya dinormalisasi ulang (perbandingan lama). Pengganti (mis. persentil power-law) diputuskan tim. |
| Kalender makro | Marker statis "FOMC / CPI" sudah dihapus 16 Okt. Diganti panel **JADWAL MAKRO AS** di `/macro/data`: FOMC dari kalender federalreserve.gov (parser gagal-keras + fixture HTML), CPI & NFP dari FRED `release/dates`. Ditaruh di halaman Macro, bukan di peta event, karena peta hanya berisi berita yang sudah terjadi; jadwal masa depan di sana akan tercampur urutan "terbaru". |
| Penjaga otomatis | `src/no-static-dates.test.ts` gagal kalau ada literal tanggal di kode runtime di luar allowlist beralasan; ESLint `no-restricted-imports` melarang `__fixtures__` di kode non-test. |
| Refresh tanpa pengunjung | `POST /api/revalidate` (Bearer `CRON_SECRET`, tertutup kalau secret kosong) memanggil `revalidatePath` untuk halaman Quant; panggil dari cron harian 00:30 UTC. |

## 16. Prakiraan 30 hari — model Timothy (19 Okt 2026)

Diambil dari `motmots/iris-monthly-forecast` (fork IRIS-Terminal milik Timothy; hanya commit
setelah snapshot impor yang dipakai). Alasan metodologinya ditulis lengkap oleh Timothy dan dikutip
di sini secara ringkas — repo itu sumber aslinya.

| Bagian | Isi |
|---|---|
| Model | FHS (Filtered Historical Simulation) atas residual GARCH(1,1), **drift dibuang**, 10.000 jalur, 30 hari. Gejolak awal tiap jalur = DVOL Deribit × faktor VRP walk-forward (realised/implied pada jendela 30 hari yang sudah selesai); kalau DVOL gagal → GARCH. |
| Kenapa bukan ML | XGBoost quantile (harga, teknikal, FRED, on-chain) tidak mengalahkan kuantil historis konstan pada pinball loss, dan medianya menebak arah 30 hari lebih jarang dari "selalu naik". Volatilitas bisa diprediksi, arah tidak. (`worker/research/benchmark_xgb_vs_baselines.py`) |
| Kenapa DVOL | Satu-satunya kandidat yang lolos uji pra-registrasi (pilih di validasi 2021–22, uji sekali di 2023–26): pinball −1,2…−1,5% di 7/14/30 hari, arah konsisten tapi **tidak signifikan 5%** (DM p 0,21 / 0,26 / 0,09). Rekalibrasi conformal dan 8 perbaikan berbasis harga dicoba dan ditolak. |
| Bebas kebocoran | `test_backtest_has_no_lookahead` menulis ulang masa depan dan menuntut skor asal-asal sebelumnya identik. |
| Jadwal | Senin 00:20 UTC: GitHub Actions (`.github/workflows/monthly-forecast.yml`, dari Timothy) **dan** job `monthly` di scheduler lokal. Baris dikunci tanggal as-of, jadi dua jalur tidak menggandakan data. |
| Simpan | Supabase `monthly_forecast_runs` (migrasi `0008`, = `0003` milik Timothy, dinomori ulang karena `0003` di sini sudah `clf_signals`). Tanpa Supabase: `--dry-run` menulis `worker/out/monthly_forecast_<as-of>.json` dan memberi skor ulang file sebelumnya (tambahan di sini: `score_previous_files`); web membacanya lewat `MONTHLY_LOCAL_DIR`. |
| Track record | Tiap run memberi skor 12 run sebelumnya terhadap close sungguhan — tidak bisa disetel setelah kejadian. |

Penyesuaian ke aturan dashboard ini (bukan perubahan model):
- Kode Python Timothy disalin **tanpa diubah** ke subpaket `worker/iris_worker/monthly/` (impornya
  relatif), kecuali `forecast.py` (= `monthly.py`-nya) yang ditambah skor ulang file lokal. Perintah
  tetap `python -m iris_worker.monthly`.
- Halaman di slug baru **`/forecast/30d`**: redirect lama `/forecast/monthly → distribution` dulu
  permanen (308) dan tersimpan di browser; `/forecast/monthly` sekarang 307 ke `/forecast/30d`.
- Tampilan mengikuti kurasi Forecast (18 Okt) dan koreksi auto-compute (§15): bahasa Indonesia
  sederhana, nama persentil SANGAT RENDAH…SANGAT TINGGI, hover tanggal + nilai, panel disembunyikan
  kalau belum ada run. **Tidak ditampilkan:** panel model state (GARCH α/β), tabel peluang di atas
  harga, tabel perbandingan engine/per tahun/PIT — tetap di output worker dan repo Timothy. Yang
  tampil dari uji: cakupan kisaran 80% per horizon dan galat median vs "harga tetap", satu baris.
- `asOf` = akhir hari close terakhir (bukan jam run); STALE setelah 9 hari (satu Senin terlewat).

## 17. Forward validation (19 Okt 2026)

Menilai prakiraan yang **sudah terbit** terhadap kejadian sesudahnya, dengan aturan yang dikunci
sebelum minggu pertama dinilai. Kode: `worker/iris_worker/forward_validation.py`,
`worker/iris_worker/monthly/forward.py`, `src/lib/forward/stats.ts`.

| Aturan | Isi |
|---|---|
| Tidak ada prediksi ulang | Prakiraan yang terbit tidak pernah diubah, ditimpa, atau dihapus karena meleset; hanya kolom hasil (`realized`) yang ditambahkan. Meleset jauh = data, bukan alasan mengganti. Pergantian model tercatat sebagai versi baru (`model_created_utc`), prakiraan versi lama tetap dinilai. |
| Seri weekly | Hanya sinyal **tutup minggu** (as-of hari Minggu); run pengembangan di hari lain tetap di riwayat tapi tidak dihitung. Seri mulai dari sinyal tutup minggu pertama (otomatis: 18 Okt 2026). Jendela 7 hari tidak tumpang tindih. |
| Nilai weekly | Aturan label **sama dengan training** (`make_label`): NAIK/TURUN berarti kalau return log 7 hari melewati ±0,5 × gejolak mingguan; gerak kecil (NOISE) tidak dihitung — sama dengan rekam jejak di data uji. Pembanding: "selalu BULL" pada minggu yang sama. Interval Wilson 90%. Data: close yang sama dengan input model (`btc_master_2.csv`). |
| Seri monthly | Run terbit tiap minggu (30 hari, tumpang tindih). Untuk jangka h dipilih run yang berjarak ≥ h hari dari run terpilih sebelumnya (greedy, dari yang tertua): D+7 semua run, D+14 tiap run kedua, D+28 tiap run keempat. Minggu yang terlewat menggeser seri, tidak membuat jendela tumpang tindih. |
| Nilai monthly | Harga sungguhan di D+h masuk kisaran 80% (P10–P90) dan 90% (P5–P95), posisi dalam kisaran, selisih terhadap tengah. "Wajar kalau model benar" = rentang tengah 90% binomial(n, 0,8). Dinilai oleh run berikutnya (`realized.at_h`) dari close sumber yang sama dengan model (Coinbase). |
| Kapan boleh disimpulkan | Weekly ≥ 26 minggu berlabel, monthly ≥ 12 jendela per jangka. Sebelum itu panel menulis BELUM. |
| Jadwal | Weekly dinilai setelah `clf_weekly` (scheduler lokal dan langkah `forward validation` di `model-worker.yml`); monthly di dalam job `monthly`. Supabase: kolom `clf_signals.realized` (migrasi 0009); lokal: `out/clf_signals_history.jsonl` dan file `monthly_forecast_*.json`. |

Tabel "prakiraan minggu-minggu sebelumnya" milik Timothy (bagian hari di dalam kisaran, dari run
yang tumpang tindih) diganti seri tidak tumpang tindih ini di halaman; datanya tetap tersimpan di
`realized`.

## 18. Tab Distribution dihapus (19 Okt 2026)

Distribution menjalankan FHS + GARCH di TypeScript setiap halaman dibuka (4.000 jalur, 1W–1Y). Sejak
§16 tab Monthly menjalankan mesin yang sama di worker Timothy dengan gejolak awal dari DVOL, run yang
disimpan, uji mundur bebas kebocoran, dan forward validation (§17). Dua jawaban untuk pertanyaan yang
sama — dan di jangka 1M angkanya berbeda karena gejolak awalnya beda (GARCH ±40%/thn vs DVOL × VRP
±31%/thn) — membingungkan, dan versi on-request tidak bisa dinilai belakangan karena berubah tiap dibuka.

Dihapus bersama kodenya: `/forecast/distribution`, `src/lib/features/priceDistribution/`,
`src/components/features/distribution/`, `WeeklyMiniCard`, tombol HORIZON (`?h=`, konstanta
`FORECAST_HORIZONS`), `src/lib/features/forecastCalibration/` (sudah tanpa halaman sejak tab
Calibration dihapus 18 Okt), serta `src/lib/quant/fhs.ts` dan `garch.ts` yang hanya dipakai keduanya —
implementasi FHS/GARCH kini hanya versi Python di `worker/iris_worker/monthly/`. Sumber
`internal_distribution` dihapus dari katalog (migrasi 0010). URL lama diarahkan (307) ke `/forecast/30d`.
Jangka di atas 30 hari (3M–1Y) tidak lagi ditampilkan.


## 19. Desain ulang tampilan (20 Okt 2026)

Permintaan pemilik: tampilan terlalu padat, terlalu teknikal (font mono), tata letak membingungkan
bagi retail. **Tidak ada fitur yang dihapus**; yang berubah hanya tata letak dan visualisasi.
Referensi: dashboard "big data" dengan globe di tengah dan dashboard trading dengan kartu kaca
(Quantix). Tema tetap gelap, rapi dan elegan. Putaran kedua: palet **hitam-oranye** (referensi landing page crypto bergaya oranye), globe diganti bergaya referensi (atmosfer oranye, garis lengkung bercahaya, label tempat), dan teks penjelasan dipangkas.

| Keputusan | Alasan |
|---|---|
| Satu font, **Inter**, untuk semua teks dan angka (`--mono` dipetakan ke Inter) | Font mono membuat dashboard terasa seperti terminal. Angka tetap sejajar lewat tabular figures. |
| Label ALL-CAPS ditampilkan sebagai kalimat biasa lewat `softCase` (data di lapisan data tidak berubah) | Tes dan URL bergantung pada label aslinya. Singkatan (BTC, ETF, RSI…) dijaga. |
| Kartu kaca bersudut 20px, jarak 20px antar kartu; grid 1px lama dibuang | Garis halus di mana-mana membuat halaman terasa padat. |
| Overview dibaca dari atas: **jawaban** (forecast, confluence, fear & greed, sentimen sosial) di sekitar globe berita dunia, lalu **bukti** (harga, snapshot, technicals), lalu **berita** | Retail perlu satu tempat untuk mulai. Semua panel lama tetap ada. |
| Globe 3D (three.js) dengan tekstur yang digambar dari data peta bawaan | Tanpa unduhan aset. Marker = berita nyata yang sudah ada; tidak ada garis hubung karangan antar titik. Jatuh ke globe SVG lama kalau WebGL tidak ada. |
| Aturan "tanpa glass/gradien/glow" dari skill `design-taste-frontend` **tidak dipakai** | Skill itu untuk website marketing; referensi pemilik memakai kaca dan cahaya. Yang diambil: tanpa mono, tanpa label huruf besar kecil, hierarki lewat ukuran dan nada, ruang lega. Dari `apple-design`: material kaca, tracking menurut ukuran, gerak yang bisa diinterupsi, reduced motion. |

Baru Overview, shell (sidebar, topbar), dan Global Sentiment yang dirakit ulang. Halaman lain sudah
memakai font, warna, dan kartu baru lewat primitif `Panel`, tetapi tata letak dalamnya belum disusun
ulang (lihat "Migration layer" di `DESIGN_TOKENS.md`).

Putaran kedua (20 Okt 2026, malam):

| Keputusan | Alasan |
|---|---|
| Teks penjelasan dihapus dari layar Overview dan Global Sentiment; catatan kecil panel (`note`) di semua halaman kini hanya muncul sebagai tooltip, sumber data jadi satu baris redup | Permintaan pemilik: minimalis. Rincian (track record, band volatilitas, bobot confluence) pindah ke tooltip, tidak hilang. |
| Garis lengkung di globe menghubungkan berita terbaru **berurutan menurut waktu terbit** | Hiasan seperti referensi, bukan data aliran antar negara. Dicatat di kode dan di `DESIGN_TOKENS.md` supaya tidak dibaca sebagai klaim. |
| Sekitar 19 paragraf penjelasan di halaman Forecast, Macro, On-Chain, Quant belum dipangkas | Dikerjakan bersama perapian tata letak halaman itu. |
