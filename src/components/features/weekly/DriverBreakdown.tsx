import { Panel, PanelHeader, DivergingBar, KeyValueRow, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { WeeklyForecastData } from '@/lib/features/weeklyForecast';
import { fmtUsd, fmtPct } from '@/lib/format';
import { type Tone } from '@/lib/theme/tokens';

export interface DriverBreakdownProps {
  forecast: Envelope<WeeklyForecastData>;
}

/**
 * The signals that actually produced the forecast.
 *
 * This panel used to reconstruct its "drivers" from the label and the
 * confidence — direction bias, conviction, upside room — which meant it was
 * displaying the conclusion four times over and calling it evidence. The real
 * contributions were computed in `weeklyForecast/live.ts` and discarded. They
 * now travel on the type, so the bars below sum to the score.
 */
export function DriverBreakdown({ forecast }: DriverBreakdownProps) {
  const f = forecast.data;
  const mid = (f.range.min + f.range.max) / 2;
  const bandWidthPct = mid > 0 ? ((f.range.max - f.range.min) / mid) * 100 : 0;

  // Scale every bar against the largest contribution so the relative pull of
  // each signal is legible, rather than against a fixed 1.0 that would leave
  // them all as slivers.
  const maxContribution = Math.max(
    ...f.drivers.map((d) => Math.abs(d.contribution)),
    0.05,
  );

  const toneOf = (v: number): Tone => (v > 0.001 ? 'up' : v < -0.001 ? 'down' : 'txt');

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        title="DRIVER BREAKDOWN"
        note="signed contribution to the score · sums to the composite"
        right={<MockBadge env={forecast} />}
      />
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {f.drivers.map((d) => {
          const tone = toneOf(d.contribution);
          return (
            <div key={d.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div
                style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}
              >
                <span
                  className="iris-micro"
                  style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.12em', color: 'var(--mut)' }}
                >
                  {d.name.toUpperCase()}
                  <span style={{ color: 'var(--dim)', marginLeft: 6 }}>{d.reading}</span>
                </span>
                <span
                  style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: `var(--${tone})` }}
                >
                  {d.contribution >= 0 ? '+' : ''}
                  {d.contribution.toFixed(3)}
                </span>
              </div>
              <DivergingBar value={d.contribution} max={maxContribution} tone={tone} />
            </div>
          );
        })}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            borderTop: '1px solid var(--line)',
            paddingTop: 8,
          }}
        >
          <span
            className="iris-micro"
            style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.12em', color: 'var(--mut)' }}
          >
            COMPOSITE SCORE
          </span>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 12,
              fontWeight: 700,
              color: `var(--${toneOf(f.score)})`,
            }}
          >
            {f.score >= 0 ? '+' : ''}
            {f.score.toFixed(3)}
          </span>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--line)' }}>
        <div
          className="iris-micro"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 9,
            letterSpacing: '.12em',
            color: 'var(--mut)',
            padding: '8px 12px 2px',
          }}
        >
          FORWARD RETURN RANGE
        </div>
        <KeyValueRow label="RANGE LOW" value={fmtUsd(f.range.min)} tone="down" />
        <KeyValueRow label="MIDPOINT" value={fmtUsd(mid)} tone="txt" />
        <KeyValueRow label="RANGE HIGH" value={fmtUsd(f.range.max)} tone="up" />
        <KeyValueRow label="BAND WIDTH" value={fmtPct(bandWidthPct, false)} tone="txt" />
      </div>
      <SourceFootnote env={forecast} />
    </Panel>
  );
}
