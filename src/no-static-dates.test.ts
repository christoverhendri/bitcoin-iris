import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard for "no static content" (IRIS_koreksi_auto_compute.md §4): runtime code
 * must not carry date literals. Anything time-dependent is computed from data
 * at render. Comments are ignored; mocks, tests and fixtures are not scanned.
 *
 * Allowed, each with its reason:
 */
const ALLOW: Record<string, { literal: string; why: string }[]> = {
  'src/lib/quant/config.ts': [
    { literal: '2009-01-03', why: 'genesis block — protocol fact' },
    { literal: '2012-11-28', why: 'halving fallback (tested against block timestamps)' },
    { literal: '2016-07-09', why: 'halving fallback (tested against block timestamps)' },
    { literal: '2020-05-11', why: 'halving fallback (tested against block timestamps)' },
    { literal: '2024-04-20', why: 'halving fallback (tested against block timestamps)' },
    { literal: '2012-01-01', why: 'method parameter: walk-forward start (needs ~1.5 years of warm-up)' },
  ],
  'src/lib/onchain/exchangeRegistry.ts': [{ literal: '2026-09-03', why: 'registry verification metadata, not displayed data' }],
  'src/lib/sources.ts': [{ literal: '2026-09-03', why: 'dated statement in an unlock note (when Nitter died), not data' }],
};

const ROOT = process.cwd();
const DIRS = ['src/lib', 'src/components', 'src/app'];
const SKIP = (p: string) => /\.test\.tsx?$|[\\/]mock\.ts$|__fixtures__|[\\/]fixtures[\\/]/.test(p);
const DATE = /\b(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g;
const CTOR = /\b(?:Date\.UTC|new Date)\(\s*(19|20)\d{2}\s*,/g;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(p) && !SKIP(p) ? [p] : [];
  });
}

/** Drop block and line comments (a `//` after `:` is a URL, not a comment). */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('no static dates in runtime code', () => {
  it('finds no date literal outside the allowlist', () => {
    const hits: string[] = [];
    for (const dir of DIRS) {
      for (const file of files(join(ROOT, dir))) {
        const rel = relative(ROOT, file).split(sep).join('/');
        const code = stripComments(readFileSync(file, 'utf8'));
        const allowed = new Set((ALLOW[rel] ?? []).map((a) => a.literal));
        for (const m of code.matchAll(DATE)) if (!allowed.has(m[0])) hits.push(`${rel}: ${m[0]}`);
        for (const m of code.matchAll(CTOR)) hits.push(`${rel}: ${m[0]}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('every allowlisted literal is still there (no stale exceptions)', () => {
    for (const [rel, list] of Object.entries(ALLOW)) {
      const code = stripComments(readFileSync(join(ROOT, rel), 'utf8'));
      for (const a of list) expect(code.includes(a.literal), `${rel}: ${a.literal}`).toBe(true);
    }
  });
});
