import { Panel, PanelHeader, ProgressBar, MockBadge, PlaceholderBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { WeeklyForecastData } from '@/lib/features/weeklyForecast';
import { toWeeklyForecastLabels, getWeeklyForecastColor } from '@/lib/features/weeklyForecast';
import { type Tone } from '@/lib/theme/tokens';

export interface DirectionCardProps {
  forecast: Envelope<WeeklyForecastData>;
}

function directionTone(label: string): Tone {
  if (label === 'BULLISH') return 'up';
  if (label === 'BEARISH') return 'down';
  return 'txt';
}

export function DirectionCard({ forecast }: DirectionCardProps) {
  const f = forecast.data;
  const labels = toWeeklyForecastLabels(f);
  const tone = directionTone(f.label);
  // mock + present.ts both treat confidence as a 0-100 magnitude
  const confidencePct = Math.max(0, Math.min(100, f.confidence));

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader title="WEEKLY REGIME FORECAST" right={<MockBadge env={forecast} />} />
      <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 800,
            fontSize: 34,
            lineHeight: 1,
            letterSpacing: '.02em',
            color: getWeeklyForecastColor(f.label),
          }}
        >
          {labels.label}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span
              className="iris-micro"
              style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.14em', color: 'var(--mut)' }}
            >
              MODEL CONFIDENCE
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--txt)' }}
              >
                {labels.confidence}
              </span>
              <PlaceholderBadge />
            </span>
          </div>
          <ProgressBar pct={confidencePct} tone={tone} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--line)' }}>
          <div style={{ background: 'var(--sunk)', padding: '9px 12px' }}>
            <div
              className="iris-micro"
              style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.12em', color: 'var(--mut)' }}
            >
              RANGE LOW
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--down)', marginTop: 3 }}>
              {labels.minRange}
            </div>
          </div>
          <div style={{ background: 'var(--sunk)', padding: '9px 12px' }}>
            <div
              className="iris-micro"
              style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.12em', color: 'var(--mut)' }}
            >
              RANGE HIGH
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--up)', marginTop: 3 }}>
              {labels.maxRange}
            </div>
          </div>
        </div>
      </div>
      <SourceFootnote env={forecast} />
    </Panel>
  );
}
