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
  const forecastDetail =
    wf.method === 'classifier' && wf.classifier
      ? `Model P(UP, 7D), uncalibrated: ${(wf.classifier.pUp * 100).toFixed(1)}%`
      : `${wf.confidence.toFixed(0)}% heuristic strength · not a probability`;
  const forecastRange =
    wf.method === 'classifier'
      ? `1σ realized-volatility band (7D): $${wf.range.min.toFixed(0)} - $${wf.range.max.toFixed(0)}`
      : `Heuristic 7D range: $${wf.range.min.toFixed(0)} - $${wf.range.max.toFixed(0)}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: 'var(--line)' }}>
      <PanelStrip>
        {/* Card 1: Market Regime from Weekly Forecast */}
        <div style={{ background: 'var(--panel)', display: 'flex', flexDirection: 'column' }}>
          <KpiCard
            label="MARKET REGIME"
            value={wf.label}
            tone={getDirectionTone(wf.label)}
            detail={forecastDetail}
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
            detail={`Bull index: ${conf.scores.bullish.toFixed(1)} / Bear index: ${conf.scores.bearish.toFixed(1)} · not probabilities`}
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
            detail={forecastRange}
            pct={wf.confidence}
            right={<MockBadge env={weeklyForecast} />}
          />
          <SourceFootnote env={weeklyForecast} />
        </div>
      </PanelStrip>
    </div>
  );
}
