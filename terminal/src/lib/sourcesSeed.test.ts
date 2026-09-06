import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SOURCES } from './sources';

/**
 * `sources.ts` and `supabase/migrations/0002_data_source_status.sql` are two
 * copies of one list. Nothing at runtime compares them, so without this test
 * they drift silently: a source added in TypeScript renders with an empty MOCK
 * tooltip in any deployment whose table was seeded from the older migration.
 *
 * The seed is generated from `SOURCES`, so this is really a check that nobody
 * hand-edited one side.
 */

const SQL = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '0002_data_source_status.sql'),
  'utf8',
);

/** Pull the `('key', 'name', 'category', bool, bool, note)` tuples out of the insert. */
function parseSeed() {
  const rows: { key: string; displayName: string; category: string }[] = [];
  const re = /^\s*\('([^']+)', '((?:[^']|'')*)', '([^']+)', (true|false), (true|false), /gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(SQL)) !== null) {
    rows.push({ key: m[1], displayName: m[2].replace(/''/g, "'"), category: m[3] });
  }
  return rows;
}

describe('data_source_status seed', () => {
  const seeded = parseSeed();

  it('parses (guards against the migration being reformatted past this regex)', () => {
    expect(seeded.length).toBeGreaterThan(0);
  });

  it('covers exactly the keys in SOURCES', () => {
    expect(seeded.map((r) => r.key).sort()).toEqual(SOURCES.map((s) => s.key).sort());
  });

  it('carries the same display name and category for every key', () => {
    const byKey = new Map(seeded.map((r) => [r.key, r]));
    for (const s of SOURCES) {
      const row = byKey.get(s.key);
      expect(row, `no seed row for ${s.key}`).toBeDefined();
      expect(row!.displayName).toBe(s.displayName);
      expect(row!.category).toBe(s.category);
    }
  });

  it('preserves the unlock note, which is what a MOCK tooltip shows', () => {
    for (const s of SOURCES) {
      if (!s.unlockNote) continue;
      // Postgres escapes a quote by doubling it.
      expect(SQL).toContain(s.unlockNote.replace(/'/g, "''"));
    }
  });

  it('does not overwrite runtime columns on re-run', () => {
    // Re-applying the migration must refresh the catalogue without erasing what
    // the ingestion jobs reported.
    const onConflict = SQL.slice(SQL.indexOf('on conflict'));
    for (const col of ['mode', 'last_success_at', 'last_error', 'consecutive_failures']) {
      expect(onConflict).not.toContain(`${col} =`);
    }
  });
});
