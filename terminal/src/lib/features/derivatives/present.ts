import { fmtCompact, fmtCount, fmtPct, fmtUsd } from '@/lib/format';
import type { Tone } from '@/lib/theme/tokens';
import type { DerivativesData } from './types';

/**
 * Funding is a *cost*, not a direction. Longs pay shorts when it is positive,
 * so a persistently positive rate means the crowd is levered long and paying to
 * stay there — the setup for a long squeeze. That is why positive funding is
 * toned `--down` here and negative funding `--up`: the tone tracks the risk the
 * number implies, not the sign of the number.
 *
 * Thresholds are per 8h period: 0.01% is the venues' neutral baseline.
 */
export function fundingTone(rate: number): Tone {
  if (rate > 0.0002) return 'down';
  if (rate < -0.0001) return 'up';
  if (rate > 0.0001) return 'amber';
  return 'txt';
}

export const FUNDING_NOTE =
  'Funding is the periodic payment between perp longs and shorts that keeps the ' +
  'contract tracking spot. Positive = longs pay shorts, i.e. the crowd is levered ' +
  'long and paying to stay there, which is the fuel for a long squeeze. Persistently ' +
  'negative is the mirror image. The rate is the data; calling it bullish or bearish ' +
  'is an internal opinion.';

export const DVOL_NOTE =
  'DVOL is Deribit’s BTC implied-volatility index — what the option market is ' +
  'charging for the next 30 days of movement. It is forward-looking and distinct from ' +
  'the realised volatility on the Quantitative page, which is measured backwards from ' +
  'candles. DVOL above realised means options are pricing more movement than has ' +
  'actually happened.';

export const MAXPAIN_NOTE =
  'Max pain is the settlement price at which option holders collectively receive the ' +
  'least. It describes where open interest is concentrated, not where price is headed.';

export function toDerivativesLabels(d: DerivativesData) {
  const gapPct = d.spot > 0 && d.maxPainStrike > 0
    ? ((d.maxPainStrike - d.spot) / d.spot) * 100
    : 0;

  return {
    /** Funding is tiny; show it in percent with four decimals, not two. */
    fundingRate: fmtPct(d.fundingRate * 100, true, 4),
    fundingAnnualized: fmtPct(d.fundingAnnualizedPct, true, 2),
    fundingBySource: d.fundingBySource.map((f) => ({
      source: f.source,
      value: fmtPct(f.rate * 100, true, 4),
      tone: fundingTone(f.rate),
    })),
    openInterestBtc: `${fmtCount(d.openInterestBtc)} BTC`,
    openInterestUsd: fmtCompact(d.openInterestBtc * d.spot),
    oiChange24h: fmtPct(d.oiChange24hPct, true, 2),
    basis: fmtPct(d.basisPct, true, 3),
    dvol: d.dvol > 0 ? d.dvol.toFixed(2) : '—',
    dvolChange7d: fmtPct(d.dvolChange7dPct, true, 2),
    putCallRatio: d.putCallRatio > 0 ? d.putCallRatio.toFixed(3) : '—',
    totalOptionOi: `${fmtCount(d.totalOptionOi)} BTC`,
    maxPainStrike: d.maxPainStrike > 0 ? fmtUsd(d.maxPainStrike) : '—',
    spot: d.spot > 0 ? fmtUsd(d.spot) : '—',
    maxPainGapPct: fmtPct(gapPct, true, 2),
    maxPainGapRaw: gapPct,
  };
}
