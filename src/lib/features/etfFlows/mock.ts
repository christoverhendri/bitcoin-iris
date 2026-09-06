import { dateSeed, mulberry32, utcDay } from '@/lib/rng';
import type { EtfFlowsArgs, EtfFlowsData, EtfFlowSession, EtfFundRow } from './types';

/** The real table's leading funds, so the mock looks like the thing it stands in for. */
const FUNDS = ['IBIT', 'FBTC', 'GBTC', 'BITB', 'ARKB', 'HODL', 'BRRR'];

/** Rough share of activity each fund carries. IBIT dominates in reality. */
const WEIGHT: Record<string, number> = {
  IBIT: 0.45,
  FBTC: 0.16,
  GBTC: 0.14,
  BITB: 0.08,
  ARKB: 0.09,
  HODL: 0.04,
  BRRR: 0.04,
};

const DAY_MS = 86_400_000;

export function mockEtfFlows({ limit = 10 }: EtfFlowsArgs): EtfFlowsData {
  const rand = mulberry32(dateSeed('etfFlows'));
  // Seeded off the UTC day, never `Date.now()`, so SSR and hydration agree.
  const anchor = Date.parse(`${utcDay()}T00:00:00.000Z`);

  const sessions: EtfFlowSession[] = [];
  for (let i = 0; i < limit; i += 1) {
    const ts = anchor - i * DAY_MS;
    // Centre slightly positive: the window this stands in for is usually
    // accumulating, and a mock that reads permanently bearish would misinform
    // as much as a wrong number.
    const total = (rand() - 0.42) * 620;

    const byFund: Record<string, number> = {};
    let assigned = 0;
    FUNDS.forEach((t, idx) => {
      if (idx === FUNDS.length - 1) {
        byFund[t] = Math.round((total - assigned) * 10) / 10;
        return;
      }
      const share = (WEIGHT[t] ?? 0.05) * (0.6 + rand() * 0.8);
      const v = Math.round(total * share * 10) / 10;
      byFund[t] = v;
      assigned += v;
    });

    sessions.push({
      date: new Date(ts).toISOString().slice(0, 10),
      ts,
      totalUsdM: Math.round(total * 10) / 10,
      byFund,
    });
  }

  const latest = sessions[0];
  const sign = Math.sign(latest.totalUsdM);
  let streakDays = 0;
  if (sign !== 0) {
    for (const s of sessions) {
      if (Math.sign(s.totalUsdM) !== sign) break;
      streakDays += 1;
    }
  }

  const biggest = sessions.reduce((best, s) =>
    Math.abs(s.totalUsdM) > Math.abs(best.totalUsdM) ? s : best,
  );

  const grossTotal = sessions.reduce(
    (s, d) => s + FUNDS.reduce((f, t) => f + Math.abs(d.byFund[t] ?? 0), 0),
    0,
  );

  const leaderboard: EtfFundRow[] = FUNDS.map((ticker) => {
    const netUsdM = sessions.reduce((s, d) => s + (d.byFund[ticker] ?? 0), 0);
    const gross = sessions.reduce((s, d) => s + Math.abs(d.byFund[ticker] ?? 0), 0);
    return {
      ticker,
      netUsdM: Math.round(netUsdM * 10) / 10,
      latestUsdM: latest.byFund[ticker] ?? 0,
      grossSharePct: grossTotal > 0 ? (gross / grossTotal) * 100 : 0,
    };
  }).sort((a, b) => b.netUsdM - a.netUsdM);

  return {
    funds: FUNDS,
    sessions,
    latestUsdM: latest.totalUsdM,
    latestDate: latest.date,
    windowNetUsdM: Math.round(sessions.reduce((s, d) => s + d.totalUsdM, 0) * 10) / 10,
    streakDays,
    streakDirection: sign > 0 ? 'inflow' : sign < 0 ? 'outflow' : 'flat',
    biggestDay: { date: biggest.date, totalUsdM: biggest.totalUsdM },
    leaderboard,
    greenDays: sessions.filter((s) => s.totalUsdM > 0).length,
  };
}
