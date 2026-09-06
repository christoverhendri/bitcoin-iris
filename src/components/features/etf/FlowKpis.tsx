import { PanelStrip, StatTile, MockBadge } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { EtfFlowsData } from '@/lib/features/etfFlows';
import { toEtfLabels, flowTone, streakTone } from '@/lib/features/etfFlows';

/**
 * The four numbers worth reading before the chart.
 *
 * "Net" is deliberately labelled with its session count rather than a
 * timeframe: the window is whatever the publisher printed, and calling it
 * "10-day net" would invent a period we did not choose.
 */
export function FlowKpis({ etf }: { etf: Envelope<EtfFlowsData> }) {
  const d = etf.data;
  const l = toEtfLabels(d);

  return (
    <PanelStrip min={170}>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', top: 5, right: 5, zIndex: 1 }}>
          <MockBadge env={etf} />
        </span>
        <StatTile
          label="LATEST SESSION"
          value={l.latest}
          tone={flowTone(d.latestUsdM)}
          detail={l.latestDate}
        />
      </div>
      <StatTile
        label={`NET · ${l.windowSessions}`}
        value={l.windowNet}
        tone={flowTone(d.windowNetUsdM)}
        detail={`avg ${l.avgDaily}/session`}
      />
      <StatTile
        label="STREAK"
        value={l.streak}
        tone={streakTone(d)}
        detail={`${l.greenDays} sessions positive`}
      />
      <StatTile
        label="LARGEST DAY"
        value={l.biggestDay}
        tone={flowTone(d.biggestDay.totalUsdM)}
        detail={l.biggestDate}
      />
      <StatTile
        label="IBIT SHARE"
        value={l.ibitShare}
        tone="blue"
        detail="of window gross flow"
      />
    </PanelStrip>
  );
}
