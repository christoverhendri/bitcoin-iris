import { PanelStrip, StatTile, MockBadge } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { MacroMarketsData } from '@/lib/features/macroMarkets';
import { fmtZ1y, fmtLevel, zTone } from '@/lib/features/macroMarkets';

/**
 * Where each market sits inside its own trailing year. Beyond ±2σ the detail
 * line says so explicitly — a number in standard deviations means nothing to a
 * reader who has not been told what counts as far.
 */
export function ZScoreStrip({ macro }: { macro: Envelope<MacroMarketsData> }) {
  const d = macro.data;

  return (
    <PanelStrip min={150}>
      {d.series.map((s, i) => (
        <div key={s.key} style={{ position: 'relative' }}>
          {i === 0 ? (
            <span style={{ position: 'absolute', top: 5, right: 5, zIndex: 1 }}>
              <MockBadge env={macro} />
            </span>
          ) : null}
          <StatTile
            label={s.label}
            value={fmtLevel(s)}
            tone={zTone(s.z1y)}
            detail={
              s.z1y === null
                ? 'no 1y history'
                : Math.abs(s.z1y) >= 2
                  ? `${fmtZ1y(s.z1y)} · extreme for the year`
                  : `${fmtZ1y(s.z1y)} vs its own year`
            }
          />
        </div>
      ))}
    </PanelStrip>
  );
}
