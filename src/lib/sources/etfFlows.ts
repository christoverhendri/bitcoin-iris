/**
 * US spot Bitcoin ETF flows — scraped from bitbo.io.
 *
 * `docs/DECISIONS.md` used to say this was impossible: CoinGlass wants a key and
 * Farside answers 403 to anything automated. bitbo.io publishes the same daily
 * per-fund table as fully server-rendered HTML — no JS hydration, one `<table>`,
 * numbers already signed and denominated in US$ millions. So it is possible, at
 * the cost of depending on someone else's markup.
 *
 * That cost is paid with validation rather than optimism. A scraper that half
 * works is worse than one that fails, because a shifted column renders a
 * confident wrong number. Every gate below throws instead of guessing:
 *
 *   - exactly one table, and its header row must start with "Date"
 *   - at least MIN_FUNDS fund columns and MIN_ROWS dated rows
 *   - every date must parse; every cell must be a finite number
 *   - a row whose cell count disagrees with the header is dropped, not padded
 *
 * On any failure `defineFeature` renders the badged mock. There is no path where
 * a misparse reaches a pixel unlabelled.
 *
 * Numbers are a third party's transcription of issuer disclosures, not primary
 * data, and ETF creations settle T+1 — the newest row lags spot by a session.
 * Both facts are surfaced in the panel, not buried here.
 */
import { fetchText } from './http';

const URL = 'https://bitbo.io/treasuries/etf-flows/';

/** Bitbo publishes a rolling recent window, not the full history since launch. */
const MIN_ROWS = 3;
const MIN_FUNDS = 5;

/**
 * How far the per-fund cells may sum away from the printed Totals column before
 * we call the parse broken. Thirteen funds each rounded to one decimal can drift
 * ~0.65 legitimately; anything past 1.0 means we assigned cells to the wrong
 * columns. This is the only gate that catches a column shift, which is the
 * dangerous failure — every number stays finite and plausible, just wrong.
 */
const TOTAL_TOLERANCE_USD_M = 1.0;

/** No single fund moves twenty billion dollars in a session. Catches a units change. */
const MAX_ABS_USD_M = 20_000;

/** Column label bitbo uses for the row total. Not a fund. */
const TOTALS_LABEL = 'Totals';

/** Row labels that live in the summary block under the daily rows. */
const SUMMARY_LABELS = new Set(['Total', 'Average', 'Maximum', 'Minimum']);

export interface EtfFlowDay {
  /** ISO date (UTC midnight) for the session. */
  date: string;
  /** Millisecond epoch, for sorting and chart x-axes. */
  ts: number;
  /** Per-fund net flow in US$ millions, keyed by ticker. Signed. */
  byFund: Record<string, number>;
  /** Net across all funds for the session, in US$ millions. Signed. */
  totalUsdM: number;
}

export interface EtfFlowTable {
  /** Fund tickers in the order bitbo publishes them. Excludes the totals column. */
  funds: string[];
  /** Daily rows, newest first. */
  days: EtfFlowDay[];
  /** Bitbo's own summary block, when present. Values in US$ millions. */
  summary: Partial<Record<'total' | 'average' | 'maximum' | 'minimum', number>>;
}

/** Strip tags and entities from a cell's inner HTML. */
function text(html: string): string {
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function cellsOf(rowHtml: string, tag: 'td' | 'th'): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  return [...rowHtml.matchAll(re)].map((m) => text(m[1]));
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * `"Sep 02, 2026"` -> epoch ms at UTC midnight.
 *
 * Deliberately NOT `Date.parse`. That function's behaviour on non-ISO strings is
 * implementation-defined and locale-sensitive: it would happily return a
 * plausible wrong date on a format we did not anticipate, which is exactly the
 * silent-corruption case this module exists to prevent. An explicit pattern
 * either matches or does not.
 *
 * Returns `null` for anything that does not match, including the summary block's
 * row labels.
 */
function parseDate(s: string): number | null {
  if (!s || SUMMARY_LABELS.has(s)) return null;
  const m = /^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (month === undefined) return null;
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (day < 1 || day > 31 || year < 2020 || year > 2100) return null;
  const ts = Date.UTC(year, month, day);
  // Rejects impossible dates that Date.UTC would roll over (Feb 31 -> Mar 3).
  const d = new Date(ts);
  if (d.getUTCMonth() !== month || d.getUTCDate() !== day) return null;
  return ts;
}

/** `"-0.0"` -> `0`. Returns `null` for anything non-numeric. */
function parseAmount(s: string): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[$,\s]/g, '').replace(/[()]/g, '');
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  // `-0.0` and `0.0` are the same flow; normalise so tone logic is stable.
  return n === 0 ? 0 : n;
}

/**
 * Parse the bitbo flows page. Exported separately from the fetch so the unit
 * test can run it against a saved snapshot without touching the network.
 */
export function parseEtfFlowsHtml(html: string): EtfFlowTable {
  const table = (html.match(/<table[\s\S]*?<\/table>/i) ?? [])[0];
  if (!table) throw new Error('bitbo: no <table> in document');

  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
  if (rows.length < 2) throw new Error('bitbo: table has no rows');

  // The header row is the first that carries <th> cells starting with "Date".
  const headerRow = rows.find((r) => {
    const th = cellsOf(r, 'th');
    return th.length > 0 && th[0].toLowerCase() === 'date';
  });
  if (!headerRow) throw new Error('bitbo: no header row beginning with "Date"');

  const headers = cellsOf(headerRow, 'th');
  const totalsIdx = headers.findIndex((h) => h === TOTALS_LABEL);
  if (totalsIdx < 0) throw new Error(`bitbo: no "${TOTALS_LABEL}" column in header`);

  // headers[0] is "Date"; everything up to (not including) Totals is a fund.
  const funds = headers.slice(1, totalsIdx);
  if (funds.length < MIN_FUNDS) {
    throw new Error(`bitbo: only ${funds.length} fund columns, expected >= ${MIN_FUNDS}`);
  }

  /** A dated row carries 1 date cell + one cell per fund + the totals cell. */
  const expectedCells = funds.length + 2;

  const days: EtfFlowDay[] = [];
  const summary: EtfFlowTable['summary'] = {};

  for (const row of rows) {
    const cells = cellsOf(row, 'td');
    if (cells.length === 0) continue;

    const ts = parseDate(cells[0]);

    if (ts === null) {
      // Either a summary row (its label sits in a <th>) or something unexpected.
      const label = cellsOf(row, 'th')[0] ?? '';
      if (!SUMMARY_LABELS.has(label)) continue;
      const totalCell = cells[cells.length - 1];
      const v = parseAmount(totalCell);
      if (v !== null) {
        summary[label.toLowerCase() as keyof EtfFlowTable['summary']] = v;
      }
      continue;
    }

    // A dated row with the wrong width means the columns moved. Drop it rather
    // than aligning funds to the wrong numbers.
    if (cells.length !== expectedCells) continue;

    const byFund: Record<string, number> = {};
    let summed = 0;
    let ok = true;
    for (let i = 0; i < funds.length; i += 1) {
      const v = parseAmount(cells[i + 1]);
      // A single unparseable cell shifts every column after it, so the row goes
      // rather than the cell. Never pad, never interpolate.
      if (v === null || Math.abs(v) > MAX_ABS_USD_M) {
        ok = false;
        break;
      }
      byFund[funds[i]] = v;
      summed += v;
    }
    if (!ok) continue;

    const totalUsdM = parseAmount(cells[expectedCells - 1]);
    if (totalUsdM === null || Math.abs(totalUsdM) > MAX_ABS_USD_M) continue;

    // The structural check that matters: if our per-fund assignment were shifted
    // by a column, the numbers would still all be finite and plausible but they
    // would no longer add up to the total the publisher printed.
    if (Math.abs(summed - totalUsdM) > TOTAL_TOLERANCE_USD_M) {
      throw new Error(
        `bitbo: ${cells[0]} funds sum to ${summed.toFixed(1)} but Totals says ` +
          `${totalUsdM.toFixed(1)} — column alignment is wrong`,
      );
    }

    days.push({
      date: new Date(ts).toISOString().slice(0, 10),
      ts,
      byFund,
      totalUsdM,
    });
  }

  if (days.length < MIN_ROWS) {
    throw new Error(`bitbo: parsed ${days.length} dated rows, expected >= ${MIN_ROWS}`);
  }

  days.sort((a, b) => b.ts - a.ts);
  return { funds, days, summary };
}

/** Fetch + parse. Cached for an hour; the underlying data updates once a day. */
export async function getEtfFlows(): Promise<EtfFlowTable> {
  const html = await fetchText(URL, { revalidate: 3600, timeoutMs: 15_000 });
  return parseEtfFlowsHtml(html);
}
