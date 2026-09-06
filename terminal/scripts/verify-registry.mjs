/**
 * Re-verifies every address in the exchange registry against Blockstream Esplora.
 *
 * The registry is the foundation of the flow intelligence — a stale or wrong
 * entry produces a wrong signal in every panel downstream. Run this whenever the
 * registry changes, and periodically to catch addresses that have gone dark.
 *
 *   npm run verify:registry
 *
 * Exits non-zero if any address fails to resolve, so it can gate CI.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REGISTRY = join(HERE, '..', 'src', 'lib', 'onchain', 'exchangeRegistry.ts');
const API = 'https://blockstream.info/api';

/** Pull the literal entries out of the TS source without a TS toolchain. */
function parseRegistry() {
  const src = readFileSync(REGISTRY, 'utf8');
  const entries = [];
  const re =
    /address:\s*'([^']+)',\s*exchange:\s*'([^']+)',\s*kind:\s*'([^']+)',\s*label:\s*'([^']+)',\s*balanceAtVerifyBtc:\s*([\d.]+)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    entries.push({
      address: m[1],
      exchange: m[2],
      kind: m[3],
      label: m[4],
      balanceAtVerifyBtc: Number(m[5]),
    });
  }
  return entries;
}

async function fetchAddress(address) {
  const res = await fetch(`${API}/address/${address}`, {
    headers: { 'user-agent': 'iris-terminal/registry-check' },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const c = j.chain_stats;
  return {
    balanceBtc: (c.funded_txo_sum - c.spent_txo_sum) / 1e8,
    txCount: c.tx_count,
  };
}

const fmt = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const entries = parseRegistry();
if (entries.length === 0) {
  console.error('No registry entries parsed — did the file format change?');
  process.exit(1);
}

console.log(`Verifying ${entries.length} addresses against Blockstream Esplora\n`);
console.log(
  `${'exchange'.padEnd(11)}${'kind'.padEnd(8)}${'balance BTC'.padStart(15)}${'txs'.padStart(10)}   drift`,
);
console.log('-'.repeat(78));

let failed = 0;
const totals = { hot: 0, cold: 0, deposit: 0 };

for (const e of entries) {
  try {
    const live = await fetchAddress(e.address);
    totals[e.kind] += live.balanceBtc;
    const drift =
      e.balanceAtVerifyBtc > 0
        ? `${(((live.balanceBtc - e.balanceAtVerifyBtc) / e.balanceAtVerifyBtc) * 100).toFixed(1)}%`
        : '—';
    console.log(
      `${e.exchange.padEnd(11)}${e.kind.padEnd(8)}${fmt(live.balanceBtc).padStart(15)}${String(
        live.txCount,
      ).padStart(10)}   ${drift}`,
    );
  } catch (err) {
    failed += 1;
    console.log(
      `${e.exchange.padEnd(11)}${e.kind.padEnd(8)}${'FAILED'.padStart(15)}${'-'.padStart(10)}   ${err.message}`,
    );
  }
  await new Promise((r) => setTimeout(r, 250));
}

const total = totals.hot + totals.cold + totals.deposit;
console.log('-'.repeat(78));
console.log(`cold    ${fmt(totals.cold).padStart(15)} BTC  (${((totals.cold / total) * 100).toFixed(1)}%)`);
console.log(`hot     ${fmt(totals.hot).padStart(15)} BTC  (${((totals.hot / total) * 100).toFixed(1)}%)`);
console.log(`deposit ${fmt(totals.deposit).padStart(15)} BTC`);
console.log(`TOTAL   ${fmt(total).padStart(15)} BTC tracked across ${entries.length} addresses`);
console.log('\nReminder: this is a tracked subset, not total exchange holdings.');

if (failed > 0) {
  console.error(`\n${failed} address(es) failed to resolve.`);
  process.exit(1);
}
