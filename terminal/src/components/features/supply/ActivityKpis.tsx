import { Panel, PanelHeader, StatTile, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { ChainSupplyMetrics } from '@/lib/features/chainSupply';
import { toChainSupplyLabels } from '@/lib/features/chainSupply';

export interface ActivityKpisProps {
  supply: Envelope<ChainSupplyMetrics>;
}

export function ActivityKpis({ supply }: ActivityKpisProps) {
  const labels = toChainSupplyLabels(supply.data);

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader title="ON-CHAIN ACTIVITY" right={<MockBadge env={supply} />} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 1,
          background: 'var(--line)',
        }}
      >
        <StatTile label="ACTIVE ADDRESSES" value={labels.activeAddresses} detail="24h" />
        <StatTile
          label="VOLUME 24H"
          value={labels.volume24hBtc}
          tone={supply.data.volume24hBtc == null ? 'dim' : 'blue'}
          detail={supply.data.volume24hBtc == null ? 'blockchair unavailable' : 'transferred'}
        />
        <StatTile label="TX COUNT" value={labels.txCount} detail="24h" />
        <StatTile label="HASH RATE" value={labels.hashRate} tone="amber" detail="network" />
      </div>
      <SourceFootnote env={supply} />
    </Panel>
  );
}
