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
import { getLatestAndZScore } from '@/lib/sources/fred';
import type { MacroMetric, MacroCountryArgs } from './types';

interface SeriesMap {
  cpi: string;
  rate: string;
  growth: string;
  /** Inflation series; when equal to `cpi` the panel reads it as "derive from CPI". */
  inflation: string;
}

const FRED_SERIES: Record<string, SeriesMap> = {
  US: {
    cpi: 'CPIAUCSL',
    rate: 'FEDFUNDS',
    growth: 'A191RL1Q225SBEA', // real GDP, QoQ annualised %
    inflation: 'CPILFESL', // core CPI
  },
  EU: {
    cpi: 'CP0000EZ19M086NEST',
    rate: 'ECBDFR',
    growth: 'CLVMNACSCAB1GQEA19',
    inflation: 'CP0000EZ19M086NEST',
  },
  JP: {
    cpi: 'JPNCPIALLMINMEI',
    rate: 'INTDSRJPM193N',
    growth: 'JPNRGDPEXP',
    inflation: 'JPNCPIALLMINMEI',
  },
  GB: {
    cpi: 'GBRCPIALLMINMEI',
    rate: 'BOERUKM',
    growth: 'NGDPRSAXDCGBQ',
    inflation: 'GBRCPIALLMINMEI',
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
      getLatestAndZScore(s.cpi),
      getLatestAndZScore(s.rate),
      getLatestAndZScore(s.growth),
      getLatestAndZScore(s.inflation),
    ]);

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
