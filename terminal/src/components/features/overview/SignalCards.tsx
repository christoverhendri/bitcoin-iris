import { PanelStrip, KpiCard, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { WeeklyForecastData } from '@/lib/features/weeklyForecast';
import type { FearGreedData } from '@/lib/features/fearGreed';
import type { ConfluenceData } from '@/lib/features/confluence';
import { type Tone } from '@/lib/theme/tokens';

export interface SignalCardsProps {
  weeklyForecast: Envelope<WeeklyForecastData>;
  fearGreed: Envelope<FearGreedData>;
  confluence: Envelope<ConfluenceData>;
}

function getDirectionTone(direction: string): Tone {
  if (direction === 'BULLISH') return 'up';
  if (direction === 'BEARISH') return 'down';
  return 'txt';
}

export function SignalCards({
  weeklyForecast,
  confluence,
}: SignalCardsProps) {
  const wf = weeklyForecast.data;
  const conf = confluence.data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: 'var(--line)' }}>
      <PanelStrip>
        {/* Card 1: Market Regime from Weekly Forecast */}
        <div style={{ background: 'var(--panel)', display: 'flex', flexDirection: 'column' }}>
          <KpiCard
            label="MARKET REGIME"
            value={wf.label}
            tone={getDirectionTone(wf.label)}
            detail={`${wf.confidence.toFixed(0)}% confidence`}
            pct={wf.confidence}
            right={<MockBadge env={weeklyForecast} />}
          />
          <SourceFootnote env={weeklyForecast} />
        </div>

        {/* Card 2: Confluence Score */}
        <div style={{ background: 'var(--panel)', display: 'flex', flexDirection: 'column' }}>
          <KpiCard
            label="CONFLUENCE"
            value={`${conf.scores.overall.toFixed(1)}/100`}
            tone={conf.scores.overall >= 60 ? 'up' : conf.scores.overall >= 40 ? 'txt' : 'down'}
            detail={`Bull: ${conf.scores.bullish.toFixed(1)} / Bear: ${conf.scores.bearish.toFixed(1)}`}
            pct={conf.scores.overall}
            right={<MockBadge env={confluence} />}
          />
          <SourceFootnote env={confluence} />
        </div>

        {/* Card 3: Weekly Forecast Direction */}
        <div style={{ background: 'var(--panel)', display: 'flex', flexDirection: 'column' }}>
          <KpiCard
            label="WEEKLY OUTLOOK"
            value={`${wf.label === 'BULLISH' ? '↑' : wf.label === 'BEARISH' ? '↓' : '→'} ${wf.label}`}
            tone={getDirectionTone(wf.label)}
            detail={`Range: $${wf.range.min.toFixed(0)} - $${wf.range.max.toFixed(0)}`}
            pct={wf.confidence}
            right={<MockBadge env={weeklyForecast} />}
          />
          <SourceFootnote env={weeklyForecast} />
        </div>
      </PanelStrip>
    </div>
  );
}
