import { PanelStrip, StatTile, MockBadge } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { PositioningData } from '@/lib/features/positioning';
import {
  toPositioningLabels,
  ratioTone,
  biasTone,
  divergenceTone,
  premiumTone,
} from '@/lib/features/positioning';

/**
 * The reading in five tiles. `BIAS` is the only one that is an opinion rather
 * than a measurement, and its detail line says what produced it — a bare label
 * would be an oracle, which is the thing this terminal refuses to be.
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
      <StatTile
        label="DIVERGENCE"
        value={l.divergence}
        tone={divergenceTone(d.divergence)}
        detail="top trader − retail"
      />
      <StatTile
        label="COINBASE PREMIUM"
        value={l.premium}
        tone={d.available.premium ? premiumTone(d.coinbasePremiumPct) : 'dim'}
        detail="vs Binance BTCUSDT"
      />
      <StatTile
        label="BIAS · OPINION"
        value={l.bias}
        tone={biasTone(d.bias)}
        detail={d.biasReason}
      />
    </PanelStrip>
  );
}
