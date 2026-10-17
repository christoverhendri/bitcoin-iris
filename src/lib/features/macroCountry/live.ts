/**
 * Live macro metrics per country — pulled straight from FRED.
 *
 * Each country maps to four FRED series (headline CPI, policy rate, real GDP
 * growth, core/annual inflation). For every requested country with a mapping we
 * fetch all four in parallel via `fred.getLatestAndZScore`, which also hands
 * back a trailing-window z-score.
 *
 * Coverage is honest, not padded:
 *   - US is the only fully-domestic mapping.
 *   - EU / JP / GB use the closest international series FRED publishes.
 *   - CN / ID have no reliable free series — they are skipped, and if one of
 *     them is the ONLY country asked for, this returns `null` (→ mock).
 *
 * FRED needs `FRED_API_KEY`. With no key `fred.*` throws on the first call,
 * `defineFeature` catches it, and the panel shows MOCK with the unlock note.
 */
import { getLatestAndZScore, type FredUnits } from '@/lib/sources/fred';
import type { MacroMetric, MacroCountryArgs } from './types';

interface SeriesRef {
  id: string;
  units: FredUnits;
  /** Oldest acceptable latest observation, by publication frequency. */
  maxAgeDays: number;
}

const MONTHLY = 120;
const QUARTERLY = 200;
const DAILY = 30;

/**
 * `cpi` stays a level (the panel labels it CPI INDEX). `inflation` and `growth`
 * must be rates: a price index or a real-GDP level is turned into a rate with
 * FRED's `pc1` (% change from a year ago). Before 2026-10-17 inflation was the raw
 * index (US core CPI ~339, rendered "338.90%") and EU/JP/GB growth was a GDP
 * level — so their z-scores measured a trend, not a regime.
 */
interface SeriesMap {
  cpi: SeriesRef;
  rate: SeriesRef;
  growth: SeriesRef;
  inflation: SeriesRef;
}

const lvl = (id: string, maxAgeDays = MONTHLY): SeriesRef => ({ id, units: 'lin', maxAgeDays });
const yoy = (id: string, maxAgeDays = MONTHLY): SeriesRef => ({ id, units: 'pc1', maxAgeDays });

/**
 * FRED keeps discontinued series online with their last value, and a stale value
 * renders exactly like a current one. Measured 2026-10-17: Japan's CPI
 * (JPNCPIALLMINMEI) ended 2021-06, its discount rate 2017-04; the UK's CPI ended
 * 2025-03 and BOERUKM 2017-01 — all were on screen as "current". A country with
 * any series older than its frequency allows is refused (-> badged mock), the
 * same way CN and ID are, instead of being shown.
 */
export function staleSeries(
  results: { ref: SeriesRef; asOf: string }[],
  now: number,
): string[] {
  return results
    .filter(({ ref, asOf }) => now - Date.parse(`${asOf}T00:00:00Z`) > ref.maxAgeDays * 86_400_000)
    .map(({ ref, asOf }) => `${ref.id} (last ${asOf})`);
}

const FRED_SERIES: Record<string, SeriesMap> = {
  US: {
    cpi: lvl('CPIAUCSL'),
    rate: lvl('FEDFUNDS'),
    growth: lvl('A191RL1Q225SBEA', QUARTERLY), // already a rate: real GDP, QoQ annualised %
    inflation: yoy('CPILFESL'), // core CPI, % y/y
  },
  EU: {
    cpi: lvl('CP0000EZ19M086NEST'),
    rate: lvl('ECBDFR', DAILY),
    growth: yoy('CLVMNACSCAB1GQEA19', QUARTERLY), // real GDP, % y/y
    inflation: yoy('CP0000EZ19M086NEST'), // HICP, % y/y
  },
  JP: {
    // No current monthly CPI for Japan on FRED (OECD MEI ended 2021-06), so the
    // freshness check refuses JP until one is wired.
    cpi: lvl('JPNCPIALLMINMEI'),
    rate: lvl('IRSTCI01JPM156N'), // overnight call rate = BoJ operating target
    growth: yoy('JPNRGDPEXP', QUARTERLY),
    inflation: yoy('JPNCPIALLMINMEI'),
  },
  GB: {
    // No current monthly UK CPI on FRED (OECD MEI ended 2025-03) — refused until wired.
    cpi: lvl('GBRCPIALLMINMEI'),
    rate: lvl('IRSTCI01GBM156N'), // overnight interbank rate, tracks Bank Rate
    growth: yoy('NGDPRSAXDCGBQ', QUARTERLY),
    inflation: yoy('GBRCPIALLMINMEI'),
  },
  // CN, ID: no reliable free FRED series — intentionally absent.
};

const DEFAULT_COUNTRIES = ['US', 'CN', 'EU', 'JP', 'GB', 'ID'];

export async function fetchMacroCountry({ countries = DEFAULT_COUNTRIES }: MacroCountryArgs) {
  const mapped = countries.filter((c) => FRED_SERIES[c]);

  // Nothing we can serve. If the caller asked for exactly one unmapped country
  // (the pages request one at a time), that is a "no data" — hand back null so
  // the resolver mocks it. If they asked for several, we would have kept the
  // mapped ones; landing here means none were mapped.
  if (mapped.length === 0) return null;

  const rows: MacroMetric[] = [];
  const asOfDates: string[] = [];

  for (const country of mapped) {
    const s = FRED_SERIES[country];
    const [cpi, rate, growth, inflation] = await Promise.all([
      getLatestAndZScore(s.cpi.id, 24, s.cpi.units),
      getLatestAndZScore(s.rate.id, 24, s.rate.units),
      getLatestAndZScore(s.growth.id, 24, s.growth.units),
      getLatestAndZScore(s.inflation.id, 24, s.inflation.units),
    ]);

    const stale = staleSeries(
      [
        { ref: s.cpi, asOf: cpi.asOf },
        { ref: s.rate, asOf: rate.asOf },
        { ref: s.growth, asOf: growth.asOf },
        { ref: s.inflation, asOf: inflation.asOf },
      ],
      Date.now(),
    );
    if (stale.length > 0) {
      throw new Error(`macro ${country}: stale FRED series ${stale.join(', ')}`);
    }

    // Every input passed the freshness check above, so the newest observation
    // date is an honest age for the panel.
    asOfDates.push(cpi.asOf, rate.asOf, growth.asOf, inflation.asOf);

    rows.push({
      country,
      cpi: cpi.latest,
      rate: rate.latest,
      growth: growth.latest,
      inflation: inflation.latest,
      zScores: {
        cpi: cpi.z,
        rate: rate.z,
        growth: growth.z,
        inflation: inflation.z,
      },
    });
  }

  if (rows.length === 0) return null;

  const asOf = asOfDates.sort().at(-1) ?? new Date().toISOString();

  return { data: rows, asOf, synthetic: false };
}
