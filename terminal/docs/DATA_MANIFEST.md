# Data Manifest

Per-feature map of **variable name → database column → real source → what is
needed to unlock it**.

`Status` legend:
- **LIVE** — real data in the database
- **MOCK** — rendered from `src/lib/features/<feature>/mock.ts`, badged in the UI
- **EMPTY** — table exists, no writer yet, intentionally

The source of truth for `Status` is the `data_source_status` table, not this
file. This file explains *why*.

> Phase 0 status: the schema does not exist yet, so **everything is MOCK**.
> Sections are filled in per feature as Phase 2 builds each data access module.

## Blocked features — decisions required

| Feature | Why blocked | Options | Cost | Recommendation |
|---|---|---|---|---|
| Entity holdings (Arkham) | The official API at `docs.intel.arkm.com` requires access approval. Scraping the site is prohibited by its terms and would break on every frontend change — we will not do it. | (a) apply for API access, (b) drop the panel, (c) substitute public ETF flow data | unknown | Apply; ship the panel MOCK meanwhile |
| Hot vs cold wallet split | Not raw on-chain data. It is the output of proprietary address clustering (Glassnode, CryptoQuant) and is paywalled. | (a) pay for a provider, (b) ship the aggregate exchange-netflow proxy | ~$29–800/mo | Ship the proxy, labelled `PROXY`; keep `btc_wallet_flow` empty and ready |
| Live tweets | **Nitter is gone, not merely unreliable.** Probed 2026-09-03: `nitter.net` 410, `nitter.poast.org` NXDOMAIN, `nitter.privacyredirect.com` 404, `lightbrd.com` 403, `nitter.space` 403, `nitter.tiekoetter.com` 429; `xcancel.com` answers 200 but serves a "RSS reader not yet whitelisted" notice instead of tweets. RSSHub's `/twitter/user/*` route is 404. That leaves paid providers only. | `TWEET_SOURCE=twitterapi_io \| mock`, or drop the feature | ~$0.15 / 1k tweets | **Dropped.** The whale/on-chain accounts people actually wanted are renderings of APIs we can read directly — see `whale_alert` below. Tweets stay `mock`. |
| Whale movement | ~~blocked~~ **shipped** — Whale Alert free tier, multi-chain, $500K floor | `WHALE_ALERT_API_KEY` + `/api/ingest/whale` on a 5-minute cron | free | Live. History lives in `whale_events` because the free tier only looks back ~10 minutes. |
| News source | CryptoPanic vs plain RSS vs X API | CryptoPanic developer plan is free with a key | free | CryptoPanic with an RSS fallback |
| Macro: Indonesia | FRED coverage for ID is effectively absent for most of the eight indicators | BPS API, Trading Economics, or a manual CSV | — | Mark ID as MOCK. Do not fill the tab with plausible-looking numbers. |
| On-chain metrics (MVRV, SOPR, NUPL) | No free provider covers the valuation ratios — they are outputs of proprietary cost-basis clustering | paid on-chain data subscription | varies | Still blocked. Note that **hash rate is no longer in this row**: mempool.space serves it keyless, with three months of history. |
| Network conditions (fees, mempool, difficulty, pools) | ~~blocked~~ **shipped** — mempool.space, keyless | none | free | Live on `/chain/network`. Blockchair supplies `volume_24h` / `blocks_24h` as a keyless supplement. |
| New addresses (first-seen) | No keyless source publishes the series | (a) invent a ratio, (b) pay a provider, (c) drop it | — | **Dropped.** It was shipping as 6% of active addresses, a made-up constant rendered as a measurement. Replaced with 24h transferred volume, which is measured. |

## Keys to register

| Source | Registration | Free? | Env var |
|---|---|---|---|
| Coinbase Exchange (candles) | no | yes | — |
| yfinance (daily history) | no | yes | — |
| alternative.me (Fear & Greed) | no | yes | — |
| CoinGecko (market cap, dominance) | yes, 2 min | demo tier | `COINGECKO_API_KEY` |
| FRED (macro) | yes, instant | yes | `FRED_API_KEY` |
| CryptoPanic (news) | yes | dev tier free | `CRYPTOPANIC_TOKEN` |
| TwitterAPI.io (tweets) | yes | no, ~$0.00015/read | `TWITTERAPI_IO_KEY` (unused — feature dropped) |
| Whale Alert (whale wire) | yes, instant | free tier, $500K floor, ~10 min lookback | `WHALE_ALERT_API_KEY` |
| Arkham Intel | yes, approval required | unknown | `ARKHAM_KEY` |
| mempool.space (fees, mempool, difficulty, hashrate, pools) | no | yes | — |
| Blockchair (24h volume, blocks, CDD) | no | yes, ~1440 req/day | — |
