import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseEtfFlowsHtml } from './etfFlows';

/**
 * The bitbo parser is the one place in the codebase that depends on a third
 * party's markup rather than a documented API. These tests pin the shape it
 * expects and, more importantly, prove that every way the markup can drift ends
 * in a throw — which `defineFeature` turns into a badged mock — rather than in a
 * confidently wrong number on screen.
 */

const FIXTURE = readFileSync(
  join(__dirname, '__fixtures__', 'bitbo-etf-flows.html'),
  'utf8',
);

describe('parseEtfFlowsHtml — real snapshot', () => {
  const table = parseEtfFlowsHtml(FIXTURE);

  it('reads the fund columns and excludes the totals column', () => {
    expect(table.funds).toContain('IBIT');
    expect(table.funds).toContain('FBTC');
    expect(table.funds).toContain('GBTC');
    expect(table.funds).not.toContain('Totals');
    expect(table.funds).not.toContain('Date');
    expect(table.funds.length).toBeGreaterThanOrEqual(5);
  });

  it('parses dated rows newest first', () => {
    expect(table.days.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < table.days.length; i += 1) {
      expect(table.days[i - 1].ts).toBeGreaterThan(table.days[i].ts);
    }
    expect(table.days[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('gives every day a finite number for every fund', () => {
    for (const day of table.days) {
      expect(Object.keys(day.byFund).sort()).toEqual([...table.funds].sort());
      for (const v of Object.values(day.byFund)) expect(Number.isFinite(v)).toBe(true);
      expect(Number.isFinite(day.totalUsdM)).toBe(true);
    }
  });

  it('keeps the published total, and it reconciles with the fund cells', () => {
    // Per-fund cells are rounded to 0.1 so a small drift is expected; the
    // parser enforces 1.0. The published figure is the one bitbo stands behind.
    for (const day of table.days) {
      const summed = Object.values(day.byFund).reduce((s, v) => s + v, 0);
      expect(Math.abs(summed - day.totalUsdM)).toBeLessThanOrEqual(1.0);
    }
  });

  it('is idempotent — no regex lastIndex leakage between runs', () => {
    expect(parseEtfFlowsHtml(FIXTURE)).toEqual(parseEtfFlowsHtml(FIXTURE));
  });

  it('normalises negative zero', () => {
    for (const day of table.days) {
      for (const v of Object.values(day.byFund)) expect(Object.is(v, -0)).toBe(false);
    }
  });
});

describe('parseEtfFlowsHtml — degradation', () => {
  it('throws when the document has no table', () => {
    expect(() => parseEtfFlowsHtml('<html><body><p>nope</p></body></html>')).toThrow(
      /no <table>/,
    );
  });

  it('throws when the header does not start with Date', () => {
    const shifted = FIXTURE.replace(/<th>\s*Date\s*<\/th>/i, '<th>Day</th>');
    // Only meaningful if the replace actually hit something; otherwise fall back
    // to a hand-built table that is definitely wrong.
    const html =
      shifted === FIXTURE
        ? '<table><tr><th>Day</th><th>IBIT</th><th>Totals</th></tr></table>'
        : shifted;
    expect(() => parseEtfFlowsHtml(html)).toThrow();
  });

  it('throws when the Totals column disappears', () => {
    const html =
      '<table><tr><th>Date</th><th>IBIT</th><th>FBTC</th><th>GBTC</th>' +
      '<th>BITB</th><th>ARKB</th></tr>' +
      '<tr><td>Sep 02, 2026</td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td></tr>' +
      '</table>';
    expect(() => parseEtfFlowsHtml(html)).toThrow(/Totals/);
  });

  it('throws when there are too few fund columns', () => {
    const html =
      '<table><tr><th>Date</th><th>IBIT</th><th>Totals</th></tr>' +
      '<tr><td>Sep 02, 2026</td><td>1</td><td>1</td></tr></table>';
    expect(() => parseEtfFlowsHtml(html)).toThrow(/fund columns/);
  });

  it('throws when no dated row survives validation', () => {
    const head =
      '<tr><th>Date</th><th>IBIT</th><th>FBTC</th><th>GBTC</th>' +
      '<th>BITB</th><th>ARKB</th><th>Totals</th></tr>';
    const bad =
      '<tr><td>not a date</td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>15</td></tr>';
    expect(() => parseEtfFlowsHtml(`<table>${head}${bad}${bad}${bad}</table>`)).toThrow(
      /dated rows/,
    );
  });

  it('throws when the fund cells do not reconcile with the printed total', () => {
    // The dangerous case: every number is finite and plausible, but the columns
    // are shifted so they describe the wrong funds. Only the total catches it.
    const head =
      '<tr><th>Date</th><th>IBIT</th><th>FBTC</th><th>GBTC</th>' +
      '<th>BITB</th><th>ARKB</th><th>Totals</th></tr>';
    const skewed =
      '<tr><td>Sep 02, 2026</td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>99</td></tr>';
    expect(() => parseEtfFlowsHtml(`<table>${head}${skewed}</table>`)).toThrow(
      /column alignment is wrong/,
    );
  });

  it('rejects an impossible date rather than rolling it over', () => {
    const head =
      '<tr><th>Date</th><th>IBIT</th><th>FBTC</th><th>GBTC</th>' +
      '<th>BITB</th><th>ARKB</th><th>Totals</th></tr>';
    const feb31 =
      '<tr><td>Feb 31, 2026</td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>15</td></tr>';
    // Date.parse would happily turn this into Mar 3. The row must be skipped,
    // which leaves too few rows and throws.
    expect(() => parseEtfFlowsHtml(`<table>${head}${feb31}</table>`)).toThrow(/dated rows/);
  });

  it('drops a fund value with an impossible magnitude', () => {
    const head =
      '<tr><th>Date</th><th>IBIT</th><th>FBTC</th><th>GBTC</th>' +
      '<th>BITB</th><th>ARKB</th><th>Totals</th></tr>';
    const huge =
      '<tr><td>Sep 02, 2026</td><td>999999</td><td>2</td><td>3</td><td>4</td><td>5</td><td>15</td></tr>';
    expect(() => parseEtfFlowsHtml(`<table>${head}${huge}</table>`)).toThrow(/dated rows/);
  });

  it('drops a row whose width disagrees with the header instead of padding it', () => {
    const head =
      '<tr><th>Date</th><th>IBIT</th><th>FBTC</th><th>GBTC</th>' +
      '<th>BITB</th><th>ARKB</th><th>Totals</th></tr>';
    const good = (d: string) =>
      `<tr><td>${d}</td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>15</td></tr>`;
    // One cell short — a column was removed upstream.
    const short =
      '<tr><td>Sep 05, 2026</td><td>1</td><td>2</td><td>3</td><td>4</td><td>15</td></tr>';
    const table = parseEtfFlowsHtml(
      `<table>${head}${short}${good('Sep 04, 2026')}${good('Sep 03, 2026')}${good('Sep 02, 2026')}</table>`,
    );
    expect(table.days).toHaveLength(3);
    expect(table.days.map((d) => d.date)).not.toContain('2026-09-05');
  });
});
