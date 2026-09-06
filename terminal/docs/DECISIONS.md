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
| Coinbase Exchange | spot price, 24h stats, OHLCV candles |
| Kraken | OHLCV fallback, long daily history (~720 candles ≈ 2y) |
| CoinGecko | market cap, BTC dominance, 7d/30d returns, 365d closes |
| alternative.me | Fear & Greed index |
| Crypto RSS (CoinTelegraph, Decrypt, NewsBTC, CoinDesk) | news wire, event geocoding |
| blockchain.info | hash rate, tx count, unique addresses, miner revenue |
| **Blockstream Esplora** | exchange address balances + transactions (flow intelligence) |
| **Bybit / OKX / Binance** | perp funding rate, open interest |
| **Deribit** | DVOL implied volatility, options open interest |

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

Layers: `TECHNICAL`, `SENTIMENT`, `NEWS`, `ONCHAIN`, `DERIVATIVES`, `MACRO`. A layer with no
wired source contributes a neutral `50` rather than being silently dropped — that keeps the
composite honest about what it does not know.

`bearish` is defined as `100 − overall`. That is a presentation choice, not an independent
measurement.

### Weekly forecast

Rule-based, not a trained model. A weighted vote over normalised RSI, MACD histogram,
EMA(21) vs EMA(50) gap, and Fear & Greed. Label thresholds ±0.15;
`confidence = min(95, 50 + |score| × 60)`. The forecast range uses realised volatility scaled
to one week (`σ × √(7/365)`) plus a drift term proportional to the score.

The UI renders a `RULE-BASED PLACEHOLDER` badge next to it. That badge must stay until an
actual trained model replaces the rule.

### Monthly forecast

Bootstrap Monte Carlo: resample historical daily log returns with replacement, 2000 paths,
30-day horizon, percentiles from the terminal distribution. Seeded from the UTC date so SSR
and hydration agree and the figure is stable within a day.

Assumes returns are i.i.d. — they are not. Real BTC returns cluster volatility and have fat
tails, so the tails here are **understated**.

### News and social sentiment

A keyword lexicon (`src/lib/sources/lexicon.ts`), not an NLP model. It scores headline words
and nothing else — no negation handling, no sarcasm, no context. Adequate for a directional
tilt, wrong on individual headlines with some regularity. Panels label it as heuristic.

### Event impact score

`impact = category base + recency bonus (0-20) + multi-source cluster bonus (0-15)`, clamped
0-100, tiered `HIGH > 65 ≥ MEDIUM > 40 ≥ LOW`. Category bases: security/monetary 70,
regulation/ETF/geopolitics 60, legal/adoption 50, market 40. All chosen by hand.

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
- **Spot ETF flows and cross-venue liquidations** are not implemented — CoinGlass requires a
  key and Farside blocks automated access.
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