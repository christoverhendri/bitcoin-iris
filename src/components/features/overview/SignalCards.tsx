import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { WeeklyForecastData } from '@/lib/features/weeklyForecast';
import {
  forecastTargetDate,
  toWeeklyForecastLabels,
  VOL_BAND_HIT_RATE,
} from '@/lib/features/weeklyForecast';
import type { ConfluenceData } from '@/lib/features/confluence';
import type { ConfluenceLayer } from '@/lib/features/confluence/types';
import { fmtDay } from '@/lib/dates';
import { softCase } from '@/lib/softCase';

const fmtK = (n: number) => `$${(n / 1000).toFixed(1)}k`;

/**
 * The model's call for the next 7 days, stated first and large.
 *
 * "Confidence" is the signal's out-of-sample track record: how often past calls
 * of the same signal were right on the notebook's test set. It is never the raw
 * P(UP), which is uncalibrated (a BULL call can carry P(UP) = 20%).
 *
 * The bar under it is the likely range with today's price marked on it, when
 * the caller passes the live price.
 */
export function WeeklyForecastCard({
  weeklyForecast,
  price,
}: {
  weeklyForecast: Envelope<WeeklyForecastData>;
  /** Live last price, to place on the range bar. */
  price?: number | null;
}) {
  const wf = weeklyForecast.data;
  const wl = toWeeklyForecastLabels(wf);
  const isModel = wf.method === 'classifier' && wf.classifier;
  const target = isModel ? forecastTargetDate(wf.classifier!.dataAsOf) : '';
  const bull = wf.label === 'BULLISH';
  const bear = wf.label === 'BEARISH';

  const confidence = isModel
    ? wl.confidencePct
      ? { value: wl.confidencePct, label: 'right in past calls', note: `Past ${wf.classifier!.signal} calls right · n=${wl.confidenceN} · base rate ${wl.baseRatePct}` }
      : { value: wl.pUpPct, label: 'model P(up)', note: 'Model P(UP) · no track record yet' }
    : { value: `${wf.confidence.toFixed(0)}%`, label: 'rule strength', note: 'Heuristic strength · not a probability' };

  // The bar spans the range with a margin on both sides, so the band and the
  // price marker both have room; the domain comes from the data, not a constant.
  const span = wf.range.max - wf.range.min || 1;
  const lo = Math.min(wf.range.min - span * 0.6, price ?? Infinity);
  const hi = Math.max(wf.range.max + span * 0.6, price ?? -Infinity);
  const pct = (v: number) => `${(((v - lo) / (hi - lo)) * 100).toFixed(1)}%`;
  const bandW = `${((span / (hi - lo)) * 100).toFixed(1)}%`;

  const sentence = isModel
    ? `The model calls the week to ${target ? fmtDay(target) : 'the next close'} ${bull ? 'up' : bear ? 'down' : 'flat'}, with the price most likely between ${fmtK(wf.range.min)} and ${fmtK(wf.range.max)}.`
    : `No model signal is published yet, so this is the candle rule: ${softCase(wl.label).toLowerCase()} with a range of ${fmtK(wf.range.min)} to ${fmtK(wf.range.max)}.`;

  return (
    <Panel>
      <PanelHeader
        title="This week's call"
        note={isModel ? 'IRIS weekly model' : 'Candle rule'}
        right={<MockBadge env={weeklyForecast} />}
      />
      <div style={{ position: 'relative', zIndex: 4, padding: '8px 26px 22px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <span
            className={`t-display${bull ? ' t-accent' : ''}`}
            style={{ fontSize: 60, color: bull ? 'var(--accent)' : bear ? 'var(--down)' : 'var(--txt)' }}
          >
            {softCase(wl.label)}
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }} title={confidence.note}>
            <span className="t-title" style={{ fontSize: 30 }}>
              {confidence.value}
            </span>
            <span style={{ fontSize: 13, color: 'var(--dim)' }}>{confidence.label}</span>
          </span>
        </div>

        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          title={
            isModel
              ? `±1σ of 30-day volatility · held ~${VOL_BAND_HIT_RATE.pct}% of weeks since ${VOL_BAND_HIT_RATE.since} (${VOL_BAND_HIT_RATE.minYearPct}–${VOL_BAND_HIT_RATE.maxYearPct}% by year)`
              : 'Heuristic range'
          }
        >
          <div style={{ position: 'relative', height: 10, borderRadius: 999, background: 'var(--line)' }}>
            <div
              className="ember-grow"
              style={{
                position: 'absolute',
                left: pct(wf.range.min),
                width: bandW,
                top: 0,
                bottom: 0,
                borderRadius: 999,
                background: 'color-mix(in srgb, var(--accent) 55%, var(--line))',
                boxShadow: '0 0 18px color-mix(in srgb, var(--accent) 40%, transparent)',
              }}
            />
            {price != null ? (
              <div
                aria-label={`Price now $${Math.round(price).toLocaleString('en-US')}`}
                style={{ position: 'absolute', left: pct(price), top: -5, width: 4, height: 20, marginLeft: -2, borderRadius: 2, background: 'var(--txt)' }}
              />
            ) : null}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--dim)' }}>
            <span>{fmtK(lo)}</span>
            <span style={{ color: 'var(--txt)', fontWeight: 600 }}>
              {fmtK(wf.range.min)} – {fmtK(wf.range.max)}
            </span>
            <span>{fmtK(hi)}</span>
          </div>
        </div>

        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: '#e9ddd2' }}>{sentence}</p>
      </div>
      <SourceFootnote env={weeklyForecast} />
    </Panel>
  );
}

const LAYER_LABEL: Record<ConfluenceLayer, string> = {
  TECHNICAL: 'Technical',
  SENTIMENT: 'Sentiment',
  NEWS: 'News',
  MACRO: 'Macro',
};
const LAYER_ORDER: ConfluenceLayer[] = ['TECHNICAL', 'SENTIMENT', 'NEWS', 'MACRO'];

/** A 0 to 100 score from four evidence layers, with each layer as its own bar. */
export function ConfluenceCard({ confluence }: { confluence: Envelope<ConfluenceData> }) {
  const conf = confluence.data;
  const overall = conf.scores.overall;
  const word = overall >= 60 ? 'Leaning long' : overall >= 40 ? 'Mixed' : 'Leaning short';
  return (
    <Panel style={{ height: '100%' }}>
      <PanelHeader title="Confluence" right={<MockBadge env={confluence} />} />
      <div
        style={{ position: 'relative', zIndex: 4, padding: '4px 22px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}
        title={`Bull index ${conf.scores.bullish.toFixed(1)} · Bear index ${conf.scores.bearish.toFixed(1)} · not probabilities`}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span className="t-display" style={{ fontSize: 40 }}>
            {overall.toFixed(0)}
          </span>
          <span style={{ fontSize: 16, color: 'var(--dim)' }}>/ 100</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 64 }} aria-hidden="true">
          {LAYER_ORDER.map((k) => {
            const v = Math.max(0, Math.min(100, conf.layers[k]));
            return (
              <span
                key={k}
                title={`${LAYER_LABEL[k]} ${v.toFixed(0)}`}
                style={{
                  flex: 1,
                  height: `${Math.max(6, v)}%`,
                  borderRadius: 5,
                  background: v >= 50 ? 'var(--accent)' : '#4a3426',
                }}
              />
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--dim)' }}>
          {LAYER_ORDER.map((k) => (
            <span key={k} style={{ flex: 1, textAlign: 'center' }}>
              {LAYER_LABEL[k]}
            </span>
          ))}
        </div>
        <span style={{ fontSize: 14, color: '#e9ddd2' }}>{word}</span>
      </div>
      <SourceFootnote env={confluence} />
    </Panel>
  );
}
