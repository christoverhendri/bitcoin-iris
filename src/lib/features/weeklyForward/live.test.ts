import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getSupabase: () => null, asRow: <T,>(v: unknown) => v as T }));

const { fetchWeeklyForward } = await import('./live');

afterEach(() => vi.unstubAllEnvs());

describe('fetchWeeklyForward (local history)', () => {
  it('reads clf_signals_history.jsonl next to CLF_LOCAL_SIGNAL_FILE', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'clf-'));
    const rows = [
      { as_of: '2026-10-16', signal: 'BULL', p_up: 0.12 }, // Friday: development run
      { as_of: '2026-10-18', signal: 'BULL', p_up: 0.13 },
    ];
    writeFileSync(join(dir, 'clf_signals_history.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    vi.stubEnv('CLF_LOCAL_SIGNAL_FILE', join(dir, 'clf_signal_latest.json'));
    const res = await fetchWeeklyForward({});
    expect(res!.data.start).toBe('2026-10-18');
    expect(res!.data.published).toBe(1);
    expect(res!.data.pending).toBe(1);
    expect(res!.asOf).toBe('2026-10-19T00:00:00.000Z');
  });

  it('no history file → nothing to show (panel hidden)', async () => {
    vi.stubEnv('CLF_LOCAL_SIGNAL_FILE', join(tmpdir(), 'nope', 'clf_signal_latest.json'));
    expect(await fetchWeeklyForward({})).toBeNull();
  });
});
