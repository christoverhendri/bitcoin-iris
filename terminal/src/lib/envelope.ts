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
  | 'internal_quant'
  | 'internal_forecast'
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
}

export const live = <T>(data: T, sourceKey: SourceKey, asOf: string | null): Envelope<T> => ({
  data,
  isMock: false,
  missingSource: null,
  reason: null,
  asOf,
  sourceKey,
  unlockNote: null,
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
});

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
