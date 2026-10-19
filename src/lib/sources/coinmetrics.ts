/**
 * BTC daily close since 2010 — the long history the halving-cycle and
 * power-law pages need (Yahoo starts in late 2014; the 2011 and 2013 cycles
 * would be missing).
 *
 * Primary: Coin Metrics Community API (`PriceUSD`, keyless, ~6,000 rows,
 * ~500 KB — under Next's 2 MB data-cache limit). A row stamped day D is the
 * end-of-day reference rate for D; it appears the morning after.
 * Fallback: blockchain.com `market-price` chart (also keyless; lags a few days,
 * so the STALE badge may show). The caller is told which one answered.
 *
 * Same series and preparation as research/BTC_Halving_Cycle_PowerLaw.ipynb.
 * Docs: https://docs.coinmetrics.io/api/v4 · https://www.blockchain.com/explorer/api/charts_api
 */
import { fetchJson } from './http';

const CM = 'https://community-api.coinmetrics.io/v4/timeseries/asset-metrics';
const BC = 'https://api.blockchain.info/charts/market-price?timespan=all&format=json&sampled=false';
const REVALIDATE = 86_400;
/** A full history has ~6,000 days; anything far short is a broken response. */
const MIN_ROWS = 3000;

export type PriceSource = 'Coin Metrics' | 'blockchain.com';

export interface DailyRow {
  date: string;
  price: number;
}

interface CmPage {
  data?: { time?: string; PriceUSD?: string }[];
  next_page_url?: string;
}

export async function getCoinMetricsDaily(): Promise<DailyRow[]> {
  const rows: DailyRow[] = [];
  let url: string | undefined =
    // No start_time: the API starts at the first day it has (2010-07-18).
    `${CM}?assets=btc&metrics=PriceUSD&frequency=1d&page_size=10000`;
  for (let page = 0; url && page < 5; page += 1) {
    const j: CmPage = await fetchJson<CmPage>(url, { revalidate: REVALIDATE, timeoutMs: 20_000 });
    if (!Array.isArray(j?.data)) throw new Error('coinmetrics: missing data array');
    for (const d of j.data) {
      const price = Number(d.PriceUSD);
      if (typeof d.time === 'string' && d.PriceUSD) rows.push({ date: d.time.slice(0, 10), price });
    }
    url = j.next_page_url;
  }
  if (rows.length < MIN_ROWS) throw new Error(`coinmetrics: only ${rows.length} rows`);
  return rows;
}

export async function getBlockchainComDaily(): Promise<DailyRow[]> {
  const j = await fetchJson<{ values?: { x: number; y: number }[] }>(BC, { revalidate: REVALIDATE, timeoutMs: 20_000 });
  const vals = j?.values;
  if (!Array.isArray(vals) || vals.length < MIN_ROWS) throw new Error('blockchain.com market-price: short series');
  return vals.map((v) => ({ date: new Date(v.x * 1000).toISOString().slice(0, 10), price: Number(v.y) }));
}

/** Coin Metrics, else blockchain.com. Throws only when both fail. */
export async function getBtcDailyCloses(): Promise<{ rows: DailyRow[]; source: PriceSource }> {
  try {
    return { rows: await getCoinMetricsDaily(), source: 'Coin Metrics' };
  } catch (err) {
    console.warn('[coinmetrics] falling back to blockchain.com:', err instanceof Error ? err.message : err);
    return { rows: await getBlockchainComDaily(), source: 'blockchain.com' };
  }
}
