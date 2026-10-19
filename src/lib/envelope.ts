/**
 * Every panel receives its data as an `Envelope<T>`, never as a bare value.
 *
 * This is what makes "mock is not hardcoded" structural rather than a habit: a
 * component cannot render data without also being handed the flag saying whether
 * that data is real, and `MockBadge` reads that flag. There is exactly one way
 * for synthetic data to reach a pixel, and it is always labelled.
 */

export type SourceKey =
  | 'coinbase'
  | 'yfinance'
  | 'coingecko'
  | 'alternative_me'
  | 'derivatives'
  | 'positioning'
  | 'etf_flows'
  | 'fred'
  | 'cryptopanic'
  | 'rss'
  | 'twitterapi_io'
  | 'nitter'
  | 'santiment'
  | 'arkham'
  | 'whale_alert'
  | 'onchain_provider'
  | 'mempool_space'
  | 'coinmetrics'
  | 'internal_monthly'
  | 'internal_quant'
  | 'internal_forecast'
  | 'internal_distribution'
  | 'internal_macro_regime'
  | 'internal_confluence';

export type MockReason =
  /** The table is empty for this key — no job has written it yet. */
  | 'no_rows'
  /** `data_source_status.is_enabled = false`. */
  | 'source_disabled'
  /** The upstream job is failing or degraded. */
  | 'source_failed'
  /** Rows exist but the worker wrote them in MOCK_MODE (`is_synthetic`). */
  | 'synthetic_rows'
  /** The query threw. Never propagated to the UI — a dead DB must not 500 a page. */
  | 'query_error';

export interface Envelope<T> {
  data: T;
  isMock: boolean;
  missingSource: SourceKey | null;
  reason: MockReason | null;
  /** Newest `fetched_at` backing this payload. `null` when mocked. */
  asOf: string | null;
  sourceKey: SourceKey;
  /** Copied from `data_source_status.unlock_note`; shown in the MOCK tooltip. */
  unlockNote: string | null;
  /**
   * Real data that is older than the feature allows (`maxAgeSec`), or whose
   * timestamp is unknown. Distinct from `isMock`: the numbers are genuine, just
   * not current. This is what an upstream outage looks like behind Next's fetch
   * cache, which keeps serving the last good response when revalidation fails.
   */
  isStale: boolean;
  /** Seconds between `asOf` and render. `null` when mocked or unknown. */
  ageSec: number | null;
}

export const live = <T>(data: T, sourceKey: SourceKey, asOf: string | null): Envelope<T> => ({
  data,
  isMock: false,
  missingSource: null,
  reason: null,
  asOf,
  sourceKey,
  unlockNote: null,
  isStale: false,
  ageSec: null,
});

export const mocked = <T>(
  data: T,
  sourceKey: SourceKey,
  reason: MockReason,
  unlockNote: string | null = null,
): Envelope<T> => ({
  data,
  isMock: true,
  missingSource: sourceKey,
  reason,
  asOf: null,
  sourceKey,
  unlockNote,
  isStale: false,
  ageSec: null,
});

/** Age of a timestamp in whole seconds, or `null` when it does not parse. */
export function ageSeconds(asOf: string | null, now: number): number | null {
  if (!asOf) return null;
  const t = Date.parse(asOf);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((now - t) / 1000));
}

/** Stale when older than the limit (the limit itself is still fresh), or of unknown age. */
export function isStaleAge(ageSec: number | null, maxAgeSec: number | undefined): boolean {
  if (ageSec === null) return true;
  if (maxAgeSec === undefined) return false;
  return ageSec > maxAgeSec;
}

/** `32h`, `3d`, `12m` — the compact age shown on the STALE badge. */
export function fmtAgeShort(ageSec: number | null): string {
  if (ageSec === null) return '?';
  if (ageSec < 3600) return `${Math.max(1, Math.round(ageSec / 60))}m`;
  if (ageSec < 2 * 86_400) return `${Math.round(ageSec / 3600)}h`;
  return `${Math.round(ageSec / 86_400)}d`;
}

/** Tooltip for the STALE badge. */
export function explainStale<T>(env: Envelope<T>): string {
  if (!env.isStale) return '';
  const age = env.ageSec === null ? 'of unknown age' : `${fmtAgeShort(env.ageSec)} old`;
  return (
    `Real data, but ${age} — older than this panel allows. The source is probably ` +
    'unreachable and the last good response is being served from cache.'
  );
}

const REASON_TEXT: Record<MockReason, string> = {
  no_rows: 'No data in the database yet — the ingestion job has not run.',
  source_disabled: 'This data source is disabled in configuration.',
  source_failed: 'The upstream source is failing; showing placeholder values.',
  synthetic_rows: 'The worker wrote these rows in MOCK_MODE.',
  query_error: 'The database query failed; showing placeholder values.',
};

/** Human-readable explanation for the MOCK badge tooltip. */
export function explainMock<T>(env: Envelope<T>): string {
  if (!env.isMock) return '';
  const base = env.reason ? REASON_TEXT[env.reason] : 'Placeholder data.';
  return env.unlockNote ? `${base}\n\nTo unlock: ${env.unlockNote}` : base;
}
