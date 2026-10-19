import { describe, expect, it } from 'vitest';
import {
  SECTIONS,
  TIMEFRAMES,
  TIMEFRAME_SPEC,
  defaultSubHref,
  resolveTimeframe,
  subHref,
} from './nav';

/**
 * The nav array is edited by hand and nothing validated it, which is how a
 * removed tab could leave `defaultSubHref` indexing an empty list or two tabs
 * sharing a slug. These pin the invariants the rest of the shell assumes.
 */

describe('SECTIONS', () => {
  it('gives every section at least one sub, which defaultSubHref requires', () => {
    // `defaultSubHref` does `s.subs[0]` unguarded — an empty list throws at
    // render time, on the rail, on every page.
    for (const s of SECTIONS) {
      expect(s.subs.length, `${s.key} has no subs`).toBeGreaterThan(0);
      expect(() => defaultSubHref(s)).not.toThrow();
    }
  });

  it('keeps slugs unique within a section', () => {
    for (const s of SECTIONS) {
      const slugs = s.subs.map((sub) => sub.slug);
      expect(new Set(slugs).size, `${s.key} has duplicate slugs`).toBe(slugs.length);
    }
  });

  it('builds a section-root href when a sub has a null slug', () => {
    for (const s of SECTIONS) {
      for (const sub of s.subs) {
        const href = subHref(s, sub);
        expect(href.startsWith(`/${s.key}`)).toBe(true);
        if (sub.slug === null) expect(href).toBe(`/${s.key}`);
      }
    }
  });

  it('gives every sub a non-empty label', () => {
    for (const s of SECTIONS) {
      for (const sub of s.subs) expect(sub.label.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('forecast section', () => {
  const forecast = SECTIONS.find((s) => s.key === 'forecast')!;

  it('lands a first-time visitor on the weekly forecast', () => {
    expect(defaultSubHref(forecast)).toBe('/forecast/weekly');
  });

  it('offers weekly and the 30-day forecast (new slug: the old one was a cached 308); distribution and calibration are gone', () => {
    const slugs = forecast.subs.map((s) => s.slug);
    expect(slugs).toEqual(['weekly', '30d']);
  });

  it('keeps the weekly slug behind the WEEKLY FORECAST label', () => {
    // The route stays `/forecast/weekly` so old bookmarks and `iris_sub` cookies survive.
    const weekly = forecast.subs.find((s) => s.label === 'WEEKLY FORECAST');
    expect(weekly?.slug).toBe('weekly');
  });
});

describe('curated sections (2026-10-18)', () => {
  it('drops the Market section and Volatility', () => {
    expect(SECTIONS.map((s) => s.key)).not.toContain('market');
    const quant = SECTIONS.find((s) => s.key === 'quant')!;
    // HALVING CYCLE and POWER-LAW added 2026-10-19.
    expect(quant.subs.map((s) => s.slug)).toEqual(['seasonality', 'cycle', 'corridor']);
  });

  it('splits On-Chain into ETF, long/short and wallets', () => {
    const chain = SECTIONS.find((s) => s.key === 'chain')!;
    expect(chain.subs.map((s) => s.slug)).toEqual(['etf', 'long-short', 'wallets']);
  });
});

describe('timeframe', () => {
  it('resolves a valid timeframe and falls back otherwise', () => {
    expect(resolveTimeframe('1M')).toBe('1M');
    expect(resolveTimeframe('nonsense')).toBe('1Y');
    expect(resolveTimeframe(null)).toBe('1Y');
  });


  it('specs every timeframe', () => {
    for (const t of TIMEFRAMES) expect(TIMEFRAME_SPEC[t]).toBeDefined();
  });

});
