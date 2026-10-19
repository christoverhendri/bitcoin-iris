/**
 * Power-law corridor page data, computed from the shared close series on every
 * revalidate; a new month's data refits the line by itself.
 */
import { isoDay, lastDay } from '@/lib/quant/daily';
import { bandsAt, walkForward, zoneOf } from '@/lib/quant/powerLaw';
import { loadCloses, weeklyIndices } from '../halvingCycle/inputs';
import type { PowerLawArgs, PowerLawData } from './types';

export async function fetchPowerLaw(_args: PowerLawArgs) {
  void _args;
  const closes = await loadCloses();
  if (!closes) return null;
  const { series: s, source, asOf } = closes;
  const wf = walkForward(s);
  if (wf.pct.length === 0) return null;
  const fit = wf.fits[wf.fits.length - 1];
  const today = lastDay(s);
  const pctToday = wf.pct[wf.pct.length - 1];
  const firstYear = Number(wf.fits[0].refit.slice(0, 4));

  const data: PowerLawData = {
    priceSource: source,
    lastDate: isoDay(today),
    priceNow: s.prices[s.prices.length - 1],
    today: { pct: pctToday, zone: zoneOf(pctToday), bands: bandsAt(fit, today) },
    fit,
    // January every four years from the first refit, plus the newest fit.
    bHistory: wf.fits
      .filter((f, i) => (f.refit.endsWith('-01-01') && (Number(f.refit.slice(0, 4)) - firstYear) % 4 === 2) || i === wf.fits.length - 1)
      .map((f) => ({ refit: f.refit, b: f.b })),
    series: weeklyIndices(s, isoDay(s.start + wf.offset)).map((i) => ({
      date: isoDay(s.start + i),
      price: s.prices[i],
      pct: wf.pct[i - wf.offset],
    })),
  };
  return { data, asOf, synthetic: false };
}
