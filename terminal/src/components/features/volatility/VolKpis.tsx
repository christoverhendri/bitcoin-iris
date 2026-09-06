import { Panel, PanelHeader, PanelStrip, KpiCard, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { VolatilityData } from '@/lib/features/volatility';
import { toVolatilityLabels } from '@/lib/features/volatility/present';
import { fmtPct } from '@/lib/format';
import { signTone } from '@/lib/theme/tokens';

export interface VolKpisProps {
  volatility: Envelope<VolatilityData>;
}

export function VolKpis({ volatility }: VolKpisProps) {
  const v = volatility.data;
  const labels = toVolatilityLabels(v);
  const spread = v.vol30d - v.vol90d;

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        title="REALIZED VOLATILITY"
        note="ANNUALISED"
        right={<MockBadge env={volatility} />}
      />
      <PanelStrip min={200}>
        <KpiCard label="REALIZED VOL 30D" value={labels.vol30d} tone="amber" pct={v.vol30d} detail="30-day window" />
        <KpiCard label="REALIZED VOL 90D" value={labels.vol90d} tone="amber" pct={v.vol90d} detail="90-day window" />
        <KpiCard
          label="30D − 90D SPREAD"
          value={fmtPct(spread)}
          tone={signTone(spread)}
          detail={spread >= 0 ? 'short-term elevated' : 'short-term compressed'}
        />
      </PanelStrip>
      <SourceFootnote env={volatility} />
    </Panel>
  );
}
