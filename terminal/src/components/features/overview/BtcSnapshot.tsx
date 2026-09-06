import { Panel, PanelHeader, KeyValueRow, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { BtcSnapshot } from '@/lib/features/snapshot';
import { toSnapshotRows } from '@/lib/features/snapshot/present';

export interface BtcSnapshotProps {
  snapshot: Envelope<BtcSnapshot>;
}

export function BtcSnapshotPanel({ snapshot }: BtcSnapshotProps) {
  const rows = toSnapshotRows(snapshot.data);

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        title="BTC SNAPSHOT"
        right={<MockBadge env={snapshot} />}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {rows.map((row, i) => (
          <KeyValueRow
            key={i}
            label={row.label}
            value={row.value}
            tone={row.tone}
          />
        ))}
      </div>
      <SourceFootnote env={snapshot} />
    </Panel>
  );
}
