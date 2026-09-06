import { Panel, PanelHeader, DataTable, ProgressBar, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { ChainNetworkData } from '@/lib/features/chainNetwork';
import { toPoolRow } from '@/lib/features/chainNetwork';

/**
 * Who found the blocks this week.
 *
 * Attribution comes from coinbase-tag heuristics, not from proof — a pool that
 * changes or omits its tag is misattributed or lands in "Unknown". That bucket
 * is kept and shown: unattributed hashrate is a real measurement, and hiding it
 * would make the remaining shares add to 100% of something smaller than the
 * network while looking like they add to the network.
 *
 * The top two shares are worth watching for their own reason — concentration
 * above ~50% between a small number of pools is the recurring centralisation
 * question, and the panel should let a reader see it without arithmetic.
 */
export function PoolTable({ network }: { network: Envelope<ChainNetworkData> }) {
  const pools = network.data.pools;
  const rows = pools.map(toPoolRow);
  const totalBlocks = pools.reduce((s, p) => s + p.blockCount, 0);
  const top2 = rows.slice(0, 2).reduce((s, r) => s + r.sharePct, 0);

  return (
    <Panel style={{ flex: 1, minWidth: 0 }}>
      <PanelHeader
        title="MINING POOLS"
        note={`last 7 days · ${totalBlocks} blocks · top 2 = ${top2.toFixed(0)}%`}
        right={<MockBadge env={network} />}
      />

      <DataTable>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>POOL</th>
            <th style={{ textAlign: 'right' }}>BLOCKS</th>
            <th style={{ textAlign: 'right' }}>SHARE</th>
            <th style={{ textAlign: 'left', width: '30%' }}>&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td style={{ whiteSpace: 'nowrap' }}>
                {r.link ? (
                  <a
                    href={r.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--txt)', textDecoration: 'none' }}
                  >
                    {r.name}
                  </a>
                ) : (
                  r.name
                )}
              </td>
              <td style={{ textAlign: 'right' }}>{r.blocks}</td>
              <td style={{ textAlign: 'right' }}>{r.share}</td>
              <td>
                <ProgressBar
                  pct={r.sharePct}
                  // Not a bull/bear reading — one neutral tone, so the bar is a
                  // magnitude and nothing more.
                  tone="blue"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>

      <SourceFootnote env={network} />
    </Panel>
  );
}
