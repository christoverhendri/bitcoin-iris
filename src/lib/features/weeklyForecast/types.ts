export type ForecastDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

/**
 * One signal's actual contribution to the score.
 *
 * These used to be computed in `live.ts` and then thrown away, leaving the
 * breakdown panel to reconstruct plausible-looking "drivers" out of the label
 * and the confidence — numbers that looked like evidence but were derived from
 * the conclusion. Carrying them on the type is what makes the panel honest.
 */
export interface ForecastDriver {
  name: string;
  /** The normalised signal, in [-1, 1]. */
  signal: number;
  /** `weight * signal / denominator` — its share of the final score. */
  contribution: number;
  /** The raw reading, formatted for display. */
  reading: string;
}

export interface WeeklyForecastData {
  label: ForecastDirection;
  confidence: number;
  range: { min: number; max: number };
  /** Signed weighted contributions that produced `label`. */
  drivers: ForecastDriver[];
  /** The composite, in [-1, 1]. `label` is a bucketing of this. */
  score: number;
}

export interface WeeklyForecastArgs {
  symbol?: string;
}
