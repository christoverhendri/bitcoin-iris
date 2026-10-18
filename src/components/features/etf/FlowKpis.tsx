import { PanelStrip, StatTile, MockBadge } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { EtfFlowsData } from '@/lib/features/etfFlows';
import { toEtfLabels, flowTone } from '@/lib/features/etfFlows';

/**
 * The three numbers worth reading before the chart (STREAK and IBIT SHARE were
 * removed in the 2026-10-18 curation).
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
        label="LARGEST DAY"
        value={l.biggestDay}
        tone={flowTone(d.biggestDay.totalUsdM)}
        detail={l.biggestDate}
      />
    </PanelStrip>
  );
}
