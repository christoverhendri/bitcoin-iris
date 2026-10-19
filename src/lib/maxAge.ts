/**
 * How old each feature's data may be before its envelope is marked STALE.
 *
 * One table, so the limits can be read and argued with in one place. Each value
 * is the source's normal update cadence plus slack — beyond it, the likeliest
 * explanation is an unreachable upstream whose last response Next is still
 * serving from its fetch cache.
 *
 * The first block follows IRIS_onchain_macro_simplification_spec.md §3; the rest
 * are set the same way and are noted as such.
 *
 * Deliberately absent: whale events (a quiet market has no new transfer, which is
 * not an outage — their `asOf` is the newest transfer, not the ingest time) and
 * FRED macro (monthly/quarterly prints; `macroCountry/live.ts` checks each series
 * against its own release cadence and refuses stale ones outright).
 */

const MIN = 60;
const HOUR = 3600;
const DAY = 86_400;

export const MAX_AGE_SEC = {
  // --- from the spec
  /** Spot price / 24h stats: ticks every few seconds. */
  spot: 10 * MIN,
  /** Funding, open interest, basis: venues publish continuously. */
  derivatives: 1 * HOUR,
  /** DVOL: hourly index. */
  dvol: 3 * HOUR,
  /** ETF flows settle T+1; a weekend plus a holiday is ~4 days. */
  etfFlows: 4 * DAY,
  /** Yahoo daily closes; weekends and holidays. */
  macroMarkets: 4 * DAY,

  // --- set on the same principle (cadence + slack), not in the spec
  /** Binance long/short and taker series are hourly: one missed hour plus slack. */
  positioning: 3 * HOUR,
  /** Blocks every ~10 minutes; two hours without one is rare. */
  network: 2 * HOUR,
  /** alternative.me publishes once a day. */
  fearGreed: 2 * DAY,
  /** Eight crypto RSS feeds plus Watcher.Guru posts: a full day with no headline means the feeds are down. */
  news: 1 * DAY,
  /** Daily-candle features (volatility, seasonality, distribution, confluence). */
  dailyCandles: 2 * DAY,
  /** Macro calendar: its `asOf` is the latest release that happened; CPI/NFP are monthly, so 40 days = the schedule stopped updating. */
  macroCalendar: 40 * DAY,
  /** Coin Metrics daily close (halving cycle, power-law): newest day older than 3 days = stale. */
  dailyClose: 3 * DAY,
  /** Walk-forward calibration runs on daily history. */
  calibration: 3 * DAY,
  /** Monthly Monte Carlo runs weekly (Monday): a week plus two days of slack. */
  monthlyForecast: 9 * DAY,
  /** Weekly signal: matches the 9-day STALE marker in weeklyForecast/transform.ts. */
  weeklyForecast: 9 * DAY,
  /** Santiment's free plan withholds 30 days by design; 3 more = the job stopped. */
  socialSentiment: 33 * DAY,
} as const;

const INTERVAL_SEC: Record<string, number> = {
  '1m': MIN,
  '5m': 5 * MIN,
  '15m': 15 * MIN,
  '1h': HOUR,
  '4h': 4 * HOUR,
  '6h': 6 * HOUR,
  '1d': DAY,
  '1w': 7 * DAY,
};

/**
 * Candle series: the newest candle is the one in progress, so its open time is at
 * most one interval old. Two intervals plus ten minutes means it stopped updating.
 */
export function candleMaxAgeSec(interval: string): number {
  return 2 * (INTERVAL_SEC[interval] ?? DAY) + 10 * MIN;
}
