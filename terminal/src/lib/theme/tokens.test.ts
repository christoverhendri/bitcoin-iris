import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOKENS } from './tokens';

/**
 * The canvas-rendered price chart is configured from tokens.ts while every other
 * surface is styled from globals.css. If the two drift, the chart silently stops
 * matching the panel it sits in. This test is the guard.
 */

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

/** Collect `--name: value;` declarations from a slice of CSS into a map. */
function declarations(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const statement of block.split(';')) {
    // A statement can carry the selector that opened the block ("@theme {") on
    // its first line, so only the last line is the declaration itself.
    const lines = statement.split('\n');
    const line = lines[lines.length - 1].trim();
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const name = line.slice(0, colon).trim();
    if (!name.startsWith('--')) continue;
    out.set(name, line.slice(colon + 1).trim());
  }
  return out;
}

function slice(start: string, end: string): string {
  const a = css.indexOf(start);
  const b = css.indexOf(end, a + 1);
  expect(a, `${start} not found in globals.css`).toBeGreaterThan(-1);
  expect(b, `${end} not found after ${start}`).toBeGreaterThan(a);
  return css.slice(a, b);
}

describe('design token parity', () => {
  const root = declarations(slice(':root {', 'html,'));
  const theme = declarations(slice('@theme {', ':root {'));

  it.each(Object.entries(TOKENS))(':root --%s matches tokens.ts', (name, hex) => {
    expect(root.get(`--${name}`)).toBe(hex);
  });

  it.each(Object.entries(TOKENS))('@theme --color-%s matches tokens.ts', (name, hex) => {
    expect(theme.get(`--color-${name}`)).toBe(hex);
  });
});
