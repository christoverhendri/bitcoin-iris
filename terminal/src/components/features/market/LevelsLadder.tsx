import { Panel, PanelHeader, KeyValueRow, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { SupportResistanceLevels } from '@/lib/features/levels';
import { toLevelsLabels } from '@/lib/features/levels/present';
import { fmtPct, fmtUsd } from '@/lib/format';
import type { Tone } from '@/lib/theme/tokens';

export interface LevelsLadderProps {
  levels: Envelope<SupportResistanceLevels>;
  /** Latest traded price — used to compute distance-from-price. */
  price: number;
}

export function LevelsLadder({ levels, price }: LevelsLadderProps) {
  const l = levels.data;
  const labels = toLevelsLabels(l);

  const ladder: { key: keyof SupportResistanceLevels; label: string; tone: Tone }[] = [
    { key: 'r2', label: 'R2', tone: 'down' },
    { key: 'r1', label: 'R1', tone: 'down' },
    { key: 'vwap', label: 'VWAP', tone: 'blue' },
    { key: 's1', label: 'S1', tone: 'up' },
    { key: 's2', label: 'S2', tone: 'up' },
  ];

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        title="SUPPORT / RESISTANCE"
        note={price > 0 ? `SPOT ${fmtUsd(price)}` : undefined}
        right={<MockBadge env={levels} />}
      />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {ladder.map((row) => {
          const v = l[row.key];
          const distPct = price > 0 ? ((v - price) / price) * 100 : 0;
          return (
            <KeyValueRow
              key={row.key}
              label={row.label}
              value={labels[row.key]}
              tone={row.tone}
              sub={price > 0 ? `${fmtPct(distPct)} vs spot` : undefined}
            />
          );
        })}
      </div>
      <SourceFootnote env={levels} />
    </Panel>
  );
}
