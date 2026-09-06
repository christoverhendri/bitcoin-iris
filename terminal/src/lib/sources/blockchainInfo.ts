/**
 * blockchain.info / api.blockchain.info — keyless Bitcoin on-chain metrics.
 *
 * No key, no approval, no geo-block. The numbers are network-wide daily
 * aggregates, so every call here uses a long revalidate window (10-60 min);
 * refetching faster just burns rate limit for the same value.
 *
 * All functions throw on a non-2xx, a timeout, or a response that does not parse
 * to a finite number — `defineFeature` catches that and falls back to the badged
 * mock layer.
 *
 * Docs: https://www.blockchain.com/explorer/api/q  and  /charts/api
 */
import { fetchJson, fetchText } from './http';

const Q = 'https://blockchain.info/q';
const CHARTS = 'https://api.blockchain.info/charts';

/** Current network hash rate in GH/s (plain-text endpoint). */
export async function getHashRateGHs(): Promise<number> {
  const txt = await fetchText(`${Q}/hashrate`, { revalidate: 600 });
  const n = Number(txt.trim());
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`blockchain.info /q/hashrate: bad number ${JSON.stringify(txt.slice(0, 40))}`);
  }
  return n;
}

/** Total mined BTC supply. `/q/totalbc` returns satoshis; divided to BTC here. */
export async function getSupplyBtc(): Promise<number> {
  const txt = await fetchText(`${Q}/totalbc`, { revalidate: 3600 });
  const sats = Number(txt.trim());
  if (!Number.isFinite(sats) || sats <= 0) {
    throw new Error(`blockchain.info /q/totalbc: bad number ${JSON.stringify(txt.slice(0, 40))}`);
  }
  return sats / 1e8;
}

interface ChartResponse {
  status: string;
  name: string;
  values: { x: number; y: number }[];
}

/**
 * Latest value of a daily chart plus the value ~7 entries back (a week ago), so
 * callers can show a week-over-week delta.
 *
 * `latest` / `prev7` are the raw `y` values; `ts` is the newest point's time in
 * milliseconds. Throws if the series is empty or the latest point is not finite.
 */
export async function getChartLatest(
  chart: 'n-transactions' | 'n-unique-addresses',
): Promise<{ latest: number; prev7: number; ts: number }> {
  const j = await fetchJson<ChartResponse>(
    `${CHARTS}/${chart}?timespan=30days&format=json`,
    { revalidate: 3600 },
  );
  const vals = j?.values;
  if (!Array.isArray(vals) || vals.length === 0) {
    throw new Error(`blockchain.info /charts/${chart}: empty series`);
  }
  const last = vals[vals.length - 1];
  const latest = Number(last?.y);
  if (!Number.isFinite(latest)) {
    throw new Error(`blockchain.info /charts/${chart}: non-finite latest value`);
  }
  const prevIdx = Math.max(0, vals.length - 8);
  const prev7 = Number(vals[prevIdx]?.y);
  return {
    latest,
    prev7: Number.isFinite(prev7) ? prev7 : latest,
    ts: Number(last?.x) * 1000,
  };
}
