/**
 * Live US spot Bitcoin ETF flows.
 *
 * The fetch and the fragile part — parsing someone else's table — live in
 * `sources/etfFlows.ts`, which throws on any structural surprise. Everything
 * here is arithmetic over already-validated numbers, so this file has no
 * failure modes of its own beyond an empty window.
 */
import { getEtfFlows } from '@/lib/sources/etfFlows';
import type { EtfFlowsArgs, EtfFlowsData, EtfFlowSession, EtfFundRow } from './types';

export async function fetchEtfFlows({ limit = 10 }: EtfFlowsArgs) {
  const table = await getEtfFlows();

  const sessions: EtfFlowSession[] = table.days.slice(0, limit).map((d) => ({
    date: d.date,
    ts: d.ts,
    totalUsdM: d.totalUsdM,
    byFund: d.byFund,
  }));

  if (sessions.length === 0) return null;

  const latest = sessions[0];
  const windowNetUsdM = sessions.reduce((s, d) => s + d.totalUsdM, 0);

  // A streak is consecutive sessions on the same side of zero, counted back
  // from the newest. A flat session ends it rather than extending it.
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

  // Gross, not net: share of the window's *activity*, so a fund that took in
  // 200 and paid out 200 still reads as a major participant rather than absent.
  const grossTotal = sessions.reduce(
    (s, d) => s + table.funds.reduce((f, t) => f + Math.abs(d.byFund[t] ?? 0), 0),
    0,
  );

  const leaderboard: EtfFundRow[] = table.funds
    .map((ticker) => {
      const netUsdM = sessions.reduce((s, d) => s + (d.byFund[ticker] ?? 0), 0);
      const gross = sessions.reduce((s, d) => s + Math.abs(d.byFund[ticker] ?? 0), 0);
      return {
        ticker,
        netUsdM,
        latestUsdM: latest.byFund[ticker] ?? 0,
        grossSharePct: grossTotal > 0 ? (gross / grossTotal) * 100 : 0,
      };
    })
    .sort((a, b) => b.netUsdM - a.netUsdM);

  const data: EtfFlowsData = {
    funds: table.funds,
    sessions,
    latestUsdM: latest.totalUsdM,
    latestDate: latest.date,
    windowNetUsdM,
    streakDays,
    streakDirection: sign > 0 ? 'inflow' : sign < 0 ? 'outflow' : 'flat',
    biggestDay: { date: biggest.date, totalUsdM: biggest.totalUsdM },
    leaderboard,
    greenDays: sessions.filter((s) => s.totalUsdM > 0).length,
  };

  return {
    data,
    // The newest row's session date, not "now" — these settle T+1 and claiming
    // freshness the data does not have would be the whole problem with scraping.
    asOf: new Date(latest.ts).toISOString(),
    synthetic: false,
  };
}
