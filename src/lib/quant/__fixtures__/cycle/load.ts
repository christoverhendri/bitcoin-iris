/**
 * Parity fixtures from research/BTC_Halving_Cycle_PowerLaw.ipynb, run on Coin
 * Metrics closes frozen at 2026-10-18 (block height 972,106, reference day
 * 2026-10-18). Regenerate with research/nb_fixtures.py.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prepareDaily, type DailySeries } from '../../daily';

const read = (name: string) => readFileSync(join(__dirname, name), 'utf8');

export function fixtureSeries(): DailySeries {
  const rows = read('btc_price_daily.csv')
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((l) => {
      const [date, close] = l.split(',');
      return { date, price: Number(close) };
    });
  return prepareDaily(rows);
}

export function fixtureDaily(): { date: string; pct: number; zone: string }[] {
  return read('power_law_daily.csv')
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((l) => {
      const [date, pct, zone] = l.split(',');
      return { date, pct: Number(pct), zone };
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const summary: any = JSON.parse(read('cycle_powerlaw_summary.json'));
