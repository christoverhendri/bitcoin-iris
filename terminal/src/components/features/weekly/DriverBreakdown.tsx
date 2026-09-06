import { Panel, PanelHeader, DivergingBar, KeyValueRow, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { WeeklyForecastData } from '@/lib/features/weeklyForecast';
import { fmtUsd, fmtPct } from '@/lib/format';
import { type Tone } from '@/lib/theme/tokens';

export interface DriverBreakdownProps {
  forecast: Envelope<WeeklyForecastData>;
}

interface Driver {
  label: string;
  value: number;
  max: number;
  readout: string;
  tone: Tone;
}

export function DriverBreakdown({ forecast }: DriverBreakdownProps) {
  const f = forecast.data;
  const mid = (f.range.min + f.range.max) / 2;
  const bandWidthPct = mid > 0 ? ((f.range.max - f.range.min) / mid) * 100 : 0;
  const dirBias = f.label === 'BULLISH' ? 1 : f.label === 'BEARISH' ? -1 : 0;
  const conviction = (f.confidence - 50) / 50;

  const drivers: Driver[] = [
    {
      label: 'DIRECTION BIAS',
      value: dirBias,
      max: 1,
      readout: f.label,
      tone: dirBias > 0 ? 'up' : dirBias < 0 ? 'down' : 'txt',
    },
    {
      label: 'CONVICTION',
      value: conviction,
      max: 1,
      readout: fmtPct(conviction * 100, true, 0),
      tone: 'blue',
    },
    {
      label: 'UPSIDE ROOM',
      value: bandWidthPct / 2,
      max: bandWidthPct || 1,
      readout: fmtPct(bandWidthPct / 2, true),
      tone: 'up',
    },
    {
      label: 'DOWNSIDE ROOM',
      value: -bandWidthPct / 2,
      max: bandWidthPct || 1,
      readout: fmtPct(-bandWidthPct / 2, true),
      tone: 'down',
    },
  ];

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        title="DRIVER BREAKDOWN"
        note="derived from rule-based output"
        right={<MockBadge env={forecast} />}
      />
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {drivers.map((d) => (
          <div key={d.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div
              style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}
            >
              <span
                className="iris-micro"
                style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.12em', color: 'var(--mut)' }}
              >
                {d.label}
              </span>
              <span
                style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: `var(--${d.tone})` }}
              >
                {d.readout}
              </span>
            </div>
            <DivergingBar value={d.value} max={d.max} tone={d.tone} />
          </div>
        ))}
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
