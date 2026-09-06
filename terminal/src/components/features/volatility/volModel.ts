import type { VolatilityData } from '@/lib/features/volatility';

/**
 * The volatility feature exposes only two scalars — realised vol at the 30d and
 * 90d windows. The term curve and the term-structure surface below are a
 * deterministic linear-in-tenor model anchored on those two real points
 * (slope taken between 30d and 90d, flat-clamped so it never goes negative).
 * No time series is invented; everything is a function of the two anchors.
 */
export function volAtTenor(v: VolatilityData, days: number): number {
  const slope = (v.vol90d - v.vol30d) / 60;
  return Math.max(0.5, v.vol30d + slope * (days - 30));
}
