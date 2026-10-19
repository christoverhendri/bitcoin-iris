/**
 * Forward validation of the weekly signal: every published signal with the
 * outcome the worker scored once its 7 days closed (`realized`), from Supabase
 * `clf_signals` or, without Supabase, the worker's append-only history file
 * next to `CLF_LOCAL_SIGNAL_FILE` (`clf_signals_history.jsonl`).
 *
 * `asOf` = end of the newest published signal's day; a stopped schedule shows
 * as STALE after `MAX_AGE_SEC.weeklyForecast`.
 */
import { getSupabase, asRow } from '@/lib/supabase/server';
import { weeklyForward, type WeeklySignalRow } from '@/lib/forward/stats';
import type { WeeklyForwardArgs } from './types';

async function readLocalHistory(): Promise<WeeklySignalRow[] | null> {
  const file = process.env.CLF_LOCAL_SIGNAL_FILE;
  if (!file) return null;
  try {
    const { readFile } = await import('node:fs/promises');
    const { dirname, resolve } = await import('node:path');
    const path = resolve(/* turbopackIgnore: true */ process.cwd(), dirname(file), 'clf_signals_history.jsonl');
    const text = await readFile(/* turbopackIgnore: true */ path, 'utf8');
    return text
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as WeeklySignalRow)
      .filter((r) => typeof r.as_of === 'string' && typeof r.p_up === 'number');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[weeklyForward:local]', err);
    return null;
  }
}

async function readSupabase(): Promise<WeeklySignalRow[] | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data, error } = await db
    .from('clf_signals')
    .select('as_of, signal, p_up, model_created_utc, realized')
    .order('as_of', { ascending: true })
    .limit(1000);
  if (error) throw new Error(`clf_signals: ${error.message} (migration 0009 applied?)`);
  return (data ?? []).map((r) => asRow<WeeklySignalRow>(r));
}

export async function fetchWeeklyForward(_args: WeeklyForwardArgs) {
  void _args;
  const rows = getSupabase() ? await readSupabase() : await readLocalHistory();
  if (!rows) return null;
  const data = weeklyForward(rows);
  if (!data.start) return null;
  const newest = data.rows[0].as_of;
  return {
    data,
    asOf: new Date(Date.parse(`${newest}T00:00:00Z`) + 86_400_000).toISOString(),
    synthetic: false,
  };
}
