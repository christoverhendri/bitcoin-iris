/**
 * Number and time formatting. Every panel routes through these so the live and
 * mock paths render byte-identically.
 *
 * All formatters are locale-fixed to 'en-US'. Using the runtime default locale
 * would make the server and the browser disagree and produce hydration errors.
 */

const usd = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `112,420.35` — with `signed`, `+112,420.35` / `-2,704.11`. */
export function fmtUsd(n: number | null | undefined, signed = false): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const body = usd.format(Math.abs(n));
  if (!signed) return usd.format(n);
  return `${n >= 0 ? '+' : '-'}${body}`;
}

/** `+2.41%` / `-0.31%`. Pass `signed: false` for plain magnitudes like dominance. */
export function fmtPct(n: number | null | undefined, signed = true, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const body = Math.abs(n).toFixed(digits);
  if (!signed) return `${n.toFixed(digits)}%`;
  return `${n >= 0 ? '+' : '-'}${body}%`;
}

/** `$42.8B`, `$1.2T`, `$965M`. */
export function fmtCompact(n: number | null | undefined, prefix = '$'): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const units: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [scale, suffix] of units) {
    if (abs >= scale) return `${sign}${prefix}${(abs / scale).toFixed(2)}${suffix}`;
  }
  return `${sign}${prefix}${abs.toFixed(2)}`;
}

/** `19.77M BTC` style — compact without a currency prefix. */
export const fmtCount = (n: number | null | undefined) => fmtCompact(n, '');

/** Signed z-score: `+3.35`, `-0.62`, `0.00`. */
export function fmtZ(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n === 0) return '0.00';
  return `${n > 0 ? '+' : '-'}${Math.abs(n).toFixed(2)}`;
}

/**
 * `2m ago`, `18s ago`, `3h ago`, `4d ago`.
 *
 * Takes an explicit `now` so callers on the server can pass a stable value and
 * avoid a server/client mismatch. Defaults to `Date.now()` for client callers.
 */
export function fmtAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '—';
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '—';
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** `AUG 21` — the calendar format used by the release table. */
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function fmtDayMonth(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')}`;
}

export { MONTHS };
