/**
 * alternative.me Crypto Fear & Greed Index. Keyless, updates once daily.
 *
 * Docs: https://alternative.me/crypto/fear-and-greed-index/
 */
import { fetchJson } from './http';

export interface FngPoint {
  value: number;
  classification: string;
  timestamp: number;
}

interface FngResponse {
  data: { value: string; value_classification: string; timestamp: string }[];
}

/** Newest-first Fear & Greed history. `limit` points, default 30. */
export async function getFearGreed(limit = 30): Promise<FngPoint[]> {
  const j = await fetchJson<FngResponse>(`https://api.alternative.me/fng/?limit=${limit}`, {
    revalidate: 3600,
  });
  return j.data.map((d) => ({
    value: Number(d.value),
    classification: d.value_classification,
    timestamp: Number(d.timestamp) * 1000,
  }));
}
