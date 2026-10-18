import { PanelStrip, StatTile, MockBadge } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { PositioningData } from '@/lib/features/positioning';
import { toPositioningLabels, ratioTone } from '@/lib/features/positioning';

/**
 * The latest reading of each cohort. DIVERGENCE, BIAS · OPINION and COINBASE
 * PREMIUM were removed in the 2026-10-18 curation.
 */
export function PositioningKpis({ positioning }: { positioning: Envelope<PositioningData> }) {
  const d = positioning.data;
  const l = toPositioningLabels(d);

  return (
    <PanelStrip min={180}>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', top: 5, right: 5, zIndex: 1 }}>
          <MockBadge env={positioning} />
        </span>
        <StatTile
          label="RETAIL L/S"
          value={l.retailRatio}
          tone={d.available.retail ? ratioTone(d.retailRatio) : 'dim'}
          detail={`${l.retailLongPct} long · all accounts`}
        />
      </div>
      <StatTile
        label="TOP TRADER L/S"
        value={l.topTraderRatio}
        tone={d.available.topTrader ? ratioTone(d.topTraderRatio) : 'dim'}
        detail={`${l.topTraderLongPct} long · by position`}
      />
    </PanelStrip>
  );
}
