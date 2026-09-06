import { type Envelope, type SourceKey, live, mocked } from '@/lib/envelope';
import { getSourceStatus } from '@/lib/sourceStatus';
import { unlockNoteFor } from '@/lib/sources';

export interface FeatureSpec<A, T> {
  /** Stable identifier used in logs. */
  key: string;
  source: SourceKey;
  /**
   * Reads the real data. Returns `null` when the query found nothing usable —
   * that is a normal state before the ingestion job has run, not an error.
   */
  live: (args: A) => Promise<{ data: T; asOf: string; synthetic: boolean } | null>;
  /**
   * Produces placeholder data of the *same type*. Must be pure and deterministic
   * for a given `args` (use `@/lib/rng`, never `Math.random` or `Date.now`),
   * or SSR and hydration will disagree.
   */
  mock: (args: A) => T;
}

/**
 * Builds a getter that resolves a feature to real data when it exists and to
 * placeholder data when it does not — always wrapped in an `Envelope` that says
 * which happened.
 *
 * Every panel in the terminal reads its data through one of these. That is the
 * whole mechanism behind "mock is never hardcoded": mock and live share a single
 * type declared in `types.ts`, components import neither implementation
 * directly, and the `isMock` flag they receive is what renders the badge.
 */
export function defineFeature<A, T>(spec: FeatureSpec<A, T>) {
  return async function get(args: A): Promise<Envelope<T>> {
    const status = await getSourceStatus(spec.source);

    // `data_source_status` is the authority once it has a row; the static
    // catalogue in `sources.ts` covers the case that is actually common today —
    // an unconfigured checkout, where a MOCK badge with no unlock note tells the
    // reader nothing about how to fix it.
    const unlockNote = status?.unlock_note ?? unlockNoteFor(spec.source);

    if (status && (!status.is_enabled || status.mode === 'failed' || status.mode === 'degraded' || status.mode === 'mock')) {
      return mocked(
        spec.mock(args),
        spec.source,
        !status.is_enabled ? 'source_disabled' : 'source_failed',
        unlockNote,
      );
    }

    try {
      const row = await spec.live(args);
      if (!row) return mocked(spec.mock(args), spec.source, 'no_rows', unlockNote);
      // Rows the worker wrote in MOCK_MODE are real rows carrying fake numbers.
      // They still get badged — there is only one way for synthetic data to
      // reach a pixel, and it is always labelled.
      if (row.synthetic) {
        return mocked(row.data, spec.source, 'synthetic_rows', unlockNote);
      }
      return live(row.data, spec.source, row.asOf);
    } catch (err) {
      console.error(`[feature:${spec.key}]`, err);
      return mocked(spec.mock(args), spec.source, 'query_error', unlockNote);
    }
  };
}
