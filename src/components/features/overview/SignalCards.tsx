import { PanelStrip, KpiCard, MockBadge, SourceFootnote, LiveOnly } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { WeeklyForecastData } from '@/lib/features/weeklyForecast';
import {
  forecastTargetDate,
  toWeeklyForecastLabels,
  VOL_BAND_HIT_RATE,
} from '@/lib/features/weeklyForecast';
import type { ConfluenceData } from '@/lib/features/confluence';
import type { SocialSentimentData } from '@/lib/features/socialSentiment';
import { SocialSentimentCard } from '@/components/features/socialSentiment/SocialSentimentPanel';
import { type Tone } from '@/lib/theme/tokens';

export interface SignalCardsProps {
  weeklyForecast: Envelope<WeeklyForecastData>;
  confluence: Envelope<ConfluenceData>;
  social: Envelope<SocialSentimentData>;
}

function getDirectionTone(direction: string): Tone {
  if (direction === 'BULLISH') return 'up';
  if (direction === 'BEARISH') return 'down';
  return 'txt';
}

const fmt0 = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/**
 * Overview headline strip.
 *
 * Card 1 used to be two cards — MARKET REGIME and WEEKLY OUTLOOK — that read the
 * same model output and showed the same label. It is one card now: the model's
 * call, the close it is a call about, and the volatility range with how often
 * that range has held (`VOL_BAND_HIT_RATE`, backtested).
 *
 * "Confidence" is the signal's out-of-sample track record — how often past calls
 * of the same signal were right on the notebook's test set — never the raw
 * P(UP), which is uncalibrated (a BULL call can carry P(UP) = 20%).
 */
export function SignalCards({ weeklyForecast, confluence, social }: SignalCardsProps) {
  const wf = weeklyForecast.data;
  const wl = toWeeklyForecastLabels(wf);
  const conf = confluence.data;
  const isModel = wf.method === 'classifier' && wf.classifier;
  const arrow = wf.label === 'BULLISH' ? '↑' : wf.label === 'BEARISH' ? '↓' : '→';
  const target = isModel ? forecastTargetDate(wf.classifier!.dataAsOf) : '';

  const forecastDetail = !isModel
    ? `${wf.confidence.toFixed(0)}% heuristic strength · not a probability`
    : wl.confidencePct
      ? `Confidence ${wl.confidencePct} · past ${wf.classifier!.signal} calls right (n=${wl.confidenceN}, base ${wl.baseRatePct})`
      : `Model P(UP) ${wl.pUpPct} · no track record yet`;
  const scoreLine = isModel
    ? [`Score P(UP) ${wl.pUpPct}`, wl.isBinary ? `vs threshold ${wl.thresholdPct}` : '', `· close of ${target}`]
        .filter(Boolean)
        .join(' ')
    : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: 'var(--line)' }}>
      <PanelStrip>
        <LiveOnly env={weeklyForecast} title="WEEKLY FORECAST">
        <div style={{ background: 'var(--panel)', display: 'flex', flexDirection: 'column' }}>
          <KpiCard
            label="WEEKLY FORECAST"
            value={`${arrow} ${wl.label}`}
            tone={getDirectionTone(wf.label)}
            detail={forecastDetail}
            right={<MockBadge env={weeklyForecast} />}
          />
          <div
            className="iris-micro"
            style={{ padding: '0 14px 10px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mut)' }}
          >
            {scoreLine ? <div style={{ marginBottom: 4 }}>{scoreLine}</div> : null}
            {isModel ? 'Likely range' : 'Heuristic range'}: {fmt0(wf.range.min)} – {fmt0(wf.range.max)}
            {isModel ? (
              <div style={{ fontSize: 9, color: 'var(--dim)', marginTop: 2 }}>
                ±1σ of 30-day volatility · held ~{VOL_BAND_HIT_RATE.pct}% of weeks since{' '}
                {VOL_BAND_HIT_RATE.since} ({VOL_BAND_HIT_RATE.minYearPct}–{VOL_BAND_HIT_RATE.maxYearPct}% by year)
              </div>
            ) : null}
          </div>
          <SourceFootnote env={weeklyForecast} />
        </div>

        </LiveOnly>

        <LiveOnly env={confluence} title="CONFLUENCE">
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
        </LiveOnly>

        <LiveOnly env={social} title="SOCIAL SENTIMENT">
          <SocialSentimentCard social={social} />
        </LiveOnly>
      </PanelStrip>
    </div>
  );
}
