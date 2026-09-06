/**
 * Navigation registry, ported from the SECTIONS constant in
 * `IRIS BTC Terminal v4.local.html`.
 *
 * Icon paths are the original 24x24 stroke-only SVG `d` attributes, rendered at
 * 13x13 in the rail. Sub-tab slugs are expanded from the original's terse keys
 * (`tech`, `vol`, `season`) into readable URL segments, because each sub-page is
 * now a real route rather than a state value.
 */

export type SectionKey =
  | 'overview'
  | 'market'
  | 'quant'
  | 'forecast'
  | 'chain'
  | 'sentiment'
  | 'macro'
  | 'research';

export type NavGroup = 'Dashboard' | 'Market' | 'Evidence' | 'Model';

export interface SubTab {
  /** URL segment. `null` means the sub lives at the section root (Overview). */
  slug: string | null;
  label: string;
}

export interface Section {
  key: SectionKey;
  label: string;
  title: string;
  blurb: string;
  group: NavGroup;
  icon: string;
  subs: SubTab[];
  /** Sections scoped by country render the country tab row. */
  scope?: 'country';
}

export const SECTIONS: Section[] = [
  {
    key: 'overview',
    label: 'Overview',
    title: 'OVERVIEW',
    blurb: 'Signal · evidence · forecast',
    group: 'Dashboard',
    icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    subs: [{ slug: null, label: 'SUMMARY' }],
  },
  {
    key: 'market',
    label: 'Market',
    title: 'MARKET',
    blurb: 'BTC/USD price action',
    group: 'Market',
    icon: 'M3 17l5-6 4 3 5-8 4 5',
    subs: [
      { slug: 'price', label: 'PRICE' },
      { slug: 'technicals', label: 'TECHNICALS' },
    ],
  },
  {
    key: 'quant',
    label: 'Quantitative',
    title: 'QUANTITATIVE',
    blurb: 'Volatility · seasonality',
    group: 'Market',
    icon: 'M4 20V8M10 20V4M16 20v-9M22 20v-5',
    subs: [
      { slug: 'volatility', label: 'VOLATILITY' },
      { slug: 'seasonality', label: 'SEASONALITY' },
    ],
  },
  {
    key: 'chain',
    label: 'On-Chain',
    title: 'ON-CHAIN',
    blurb: 'Supply · flows · holders',
    group: 'Evidence',
    icon: 'M7 7h10v10H7zM3 12h4M17 12h4M12 3v4M12 17v4',
    subs: [
      { slug: 'supply', label: 'SUPPLY' },
      { slug: 'network', label: 'NETWORK' },
      { slug: 'flows', label: 'FLOWS' },
      { slug: 'derivatives', label: 'DERIVATIVES' },
    ],
  },
  {
    key: 'sentiment',
    label: 'Global Sentiment',
    title: 'GLOBAL SENTIMENT',
    blurb: 'Social · fear & greed · world events',
    group: 'Evidence',
    icon: 'M21 12a9 9 0 1 1-3.2-6.9M8 10h.01M15 10h.01M9 15c1.5 1.2 4.5 1.2 6 0',
    subs: [{ slug: null, label: 'GLOBAL SENTIMENT' }],
  },
  {
    key: 'macro',
    label: 'Macro',
    title: 'MACRO',
    blurb: 'Country data · regime',
    group: 'Evidence',
    icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3.6 3 14.4 0 18',
    scope: 'country',
    subs: [
      { slug: 'data', label: 'ECONOMIC DATA' },
      { slug: 'regime', label: 'MACRO REGIME' },
    ],
  },
  {
    key: 'forecast',
    label: 'Forecast',
    title: 'FORECAST',
    blurb: 'Model output · confidence',
    group: 'Model',
    icon: 'M3 12h4l3-8 4 16 3-8h4',
    subs: [
      { slug: 'weekly', label: 'WEEKLY' },
      { slug: 'monthly', label: 'MONTHLY' },
    ],
  },
  {
    key: 'research',
    label: 'Research',
    title: 'RESEARCH',
    blurb: 'Confluence · correlation · findings',
    group: 'Model',
    icon: 'M4 5h12M4 10h16M4 15h10M4 20h14',
    subs: [{ slug: 'confluence', label: 'CONFLUENCE' }],
  },
];

/** Rail order. The original grouped Dashboard / Market / Evidence / Model. */
export const NAV_GROUPS: NavGroup[] = ['Dashboard', 'Market', 'Evidence', 'Model'];

export const SECTION_BY_KEY = new Map(SECTIONS.map((s) => [s.key, s]));

export const sectionsInGroup = (g: NavGroup) => SECTIONS.filter((s) => s.group === g);

/** `/market/price` -> the Market section. `/overview` -> the Overview section. */
export function sectionFromPath(pathname: string): Section | undefined {
  const key = pathname.split('/').filter(Boolean)[0] as SectionKey | undefined;
  return key ? SECTION_BY_KEY.get(key) : undefined;
}

/** Href for a section root, used by the rail. Middleware resolves the sub. */
export const sectionHref = (s: Section) => `/${s.key}`;

/** Href for a specific sub-tab. */
export const subHref = (s: Section, sub: SubTab) =>
  sub.slug ? `/${s.key}/${sub.slug}` : `/${s.key}`;

/** Fallback when no sub is remembered for a section. */
export const defaultSubHref = (s: Section) => subHref(s, s.subs[0]);

export const COUNTRIES = [
  { code: 'US', label: 'United States', display: 'UNITED STATES' },
  { code: 'CN', label: 'China', display: 'CHINA' },
  { code: 'EU', label: 'Euro Zone', display: 'EURO ZONE' },
  { code: 'JP', label: 'Japan', display: 'JAPAN' },
  { code: 'GB', label: 'United Kingdom', display: 'UNITED KINGDOM' },
  { code: 'ID', label: 'Indonesia', display: 'INDONESIA' },
] as const;

export type CountryCode = (typeof COUNTRIES)[number]['code'];
export const COUNTRY_CODES = COUNTRIES.map((c) => c.code) as readonly CountryCode[];
export const DEFAULT_COUNTRY: CountryCode = 'US';

export const TIMEFRAMES = ['1D', '7D', '1M', '3M', '1Y', 'ALL'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];
export const DEFAULT_TIMEFRAME: Timeframe = '1Y';

/**
 * Each timeframe maps to a distinct candle interval + how many candles to pull.
 * The interval matters as much as the count: a spot indicator (last RSI / MACD /
 * EMA point) depends only on the interval, so two pills that share an interval
 * show identical technicals no matter their window. Every pill therefore gets
 * its own interval. `4h`/`1w` and anything over ~290 candles are served by
 * Kraken (`ohlcv/live.ts` + `indicators/live.ts` route by interval).
 */
export const TIMEFRAME_SPEC: Record<Timeframe, { interval: string; limit: number }> = {
  '1D': { interval: '15m', limit: 96 },
  '7D': { interval: '1h', limit: 168 },
  '1M': { interval: '4h', limit: 180 },
  '3M': { interval: '6h', limit: 300 },
  '1Y': { interval: '1d', limit: 365 },
  ALL: { interval: '1w', limit: 260 },
};

/** Validate a raw `?tf=` value, falling back to the default. */
export function resolveTimeframe(raw: string | undefined | null): Timeframe {
  return (TIMEFRAMES as readonly string[]).includes(raw ?? '')
    ? (raw as Timeframe)
    : DEFAULT_TIMEFRAME;
}

/** Cookie holding the per-section sub-tab memory, read by middleware. */
export const SUB_COOKIE = 'iris_sub';
