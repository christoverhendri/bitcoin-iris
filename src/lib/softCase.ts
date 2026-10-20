/**
 * Display-only: turns an ALL-CAPS panel label into sentence case without
 * breaking the abbreviations inside it ("BTC SNAPSHOT" -> "BTC snapshot").
 *
 * The labels in the data layer stay as they are (tests and URLs depend on them);
 * only what reaches the screen is softened. A label that already contains
 * lowercase letters is returned untouched.
 */
const KEEP = new Set([
  'BTC', 'ETH', 'ETF', 'ETFS', 'RSI', 'MACD', 'EMA', 'EMA5', 'EMA21', 'SMA', 'ATR', 'US', 'USD', 'USDT',
  'FOMC', 'CPI', 'NFP', 'GDP', 'PCE', 'PPI', 'DXY', 'VIX', 'FRED', 'OB', 'OS', 'OI', 'DVOL', 'FHS',
  'GARCH', 'VRP', 'RSS', 'API', 'ATH', 'UTC', 'WIB', 'L/S', 'P50', 'P10', 'P90', 'P5', 'P95', 'P25', 'P75',
  'IBIT', 'FBTC', 'GBTC', 'AI', 'AS', 'ID', 'EU', 'JP', 'GB', 'MCAP', 'IRIS', 'SEC', 'ECB', 'CFTC', 'M2',
  'ETH/USD', 'BTC/USD', 'T+1', 'XGBOOST',
]);

export function softCase(label: string): string {
  if (!label || /[a-z]/.test(label)) return label;
  let first = true;
  return label
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part) || part === '') return part;
      const core = part.replace(/^[("]+|[)".,:;]+$/g, '');
      const keep = KEEP.has(core) || /\d/.test(core) || !/[A-Z]/.test(core);
      let out = keep ? part : part.toLowerCase();
      if (first && !keep) out = out.charAt(0).toUpperCase() + out.slice(1);
      if (/[A-Za-z]/.test(part)) first = false;
      return out;
    })
    .join('');
}
