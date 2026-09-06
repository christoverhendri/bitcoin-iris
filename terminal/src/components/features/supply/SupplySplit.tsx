import { Panel, PanelHeader, DataTable, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { ChainSupplyMetrics } from '@/lib/features/chainSupply';
import { toChainSupplyLabels } from '@/lib/features/chainSupply';

export interface SupplySplitProps {
  supply: Envelope<ChainSupplyMetrics>;
}

export function SupplySplit({ supply }: SupplySplitProps) {
  const m = supply.data;
  const labels = toChainSupplyLabels(m);
  const total = m.coldPct + m.hotPct || 1;
  const coldW = (m.coldPct / total) * 100;
  const hotW = (m.hotPct / total) * 100;

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        title="COLD / HOT SUPPLY SPLIT"
        note="address clustering — paid provider"
        right={<MockBadge env={supply} />}
      />
      <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            fontFamily: 'var(--mono)',
            fontSize: 10,
          }}
        >
          <span style={{ color: 'var(--blue)', fontWeight: 700 }}>COLD {labels.coldPct}</span>
          <span style={{ color: 'var(--amber)', fontWeight: 700 }}>HOT {labels.hotPct}</span>
        </div>
        <div
          style={{
            display: 'flex',
            height: 14,
            background: 'var(--sunk)',
            border: '1px solid var(--line2)',
          }}
        >
          <div style={{ width: `${coldW}%`, background: 'var(--blue)' }} />
          <div style={{ width: 1, background: 'var(--sunk)' }} />
          <div style={{ width: `${hotW}%`, background: 'var(--amber)' }} />
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--line)' }}>
        <DataTable>
          <thead>
            <tr>
              <th style={{ color: 'var(--mut)' }}>METRIC</th>
              <th style={{ color: 'var(--mut)' }}>VALUE</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['ACTIVE ADDRESSES', labels.activeAddresses],
              ['VOLUME 24H', labels.volume24hBtc],
              ['TX COUNT', labels.txCount],
              ['HASH RATE', labels.hashRate],
              ['COLD SUPPLY', labels.coldPct],
              ['HOT SUPPLY', labels.hotPct],
            ].map(([k, v]) => (
              <tr key={k}>
                <td style={{ fontFamily: 'var(--mono)', color: 'var(--mut)' }}>{k}</td>
                <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--txt)' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
      <SourceFootnote env={supply} />
    </Panel>
  );
}
