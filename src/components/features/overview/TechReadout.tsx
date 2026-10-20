import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { IndicatorData } from '@/lib/features/indicators';
import { toIndicatorLabels } from '@/lib/features/indicators/present';

export interface TechReadoutProps {
  indicators: Envelope<IndicatorData>;
  timeframe?: string;
  /**
   * Close of the latest candle on the same timeframe. Bollinger %B needs it:
   * it is where the close sits inside the bands, and computing it from the
   * middle band (as this panel used to) always gave 50.
   */
  lastClose?: number | null;
}

interface Row {
  label: string;
  value: string;
  note: string;
  /** 0..100 fill of the little bar, or null for no bar. */
  bar: number | null;
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));

export function TechReadout({ indicators, timeframe, lastClose }: TechReadoutProps) {
  const ind = indicators.data;
  const labels = toIndicatorLabels(ind);

  const bandRange = ind.bollingerUpper - ind.bollingerLower;
  const pctB = lastClose != null && bandRange > 0 ? ((lastClose - ind.bollingerLower) / bandRange) * 100 : null;
  const bandWidthPct = (bandRange / ind.bollingerMiddle) * 100;
  const emaGapPct = ((ind.ema5 - ind.ema21) / ind.ema21) * 100;
  const hist = ind.macd - ind.macdSignal;

  const rows: Row[] = [
    {
      label: 'RSI (14)',
      value: labels.rsi,
      note: ind.rsi > 70 ? 'Overbought' : ind.rsi < 30 ? 'Oversold' : ind.rsi >= 50 ? 'Neutral, buyers ahead' : 'Neutral, sellers ahead',
      bar: clamp(ind.rsi),
    },
    {
      label: 'MACD',
      value: labels.macd,
      note: hist >= 0 ? `Above signal by ${Math.abs(hist).toFixed(0)}` : `Below signal by ${Math.abs(hist).toFixed(0)}`,
      bar: clamp(50 + (hist / (Math.abs(ind.macdSignal) || Math.abs(hist) || 1)) * 25),
    },
    {
      label: 'EMA 5 / 21 gap',
      value: `${emaGapPct >= 0 ? '+' : ''}${emaGapPct.toFixed(2)}%`,
      note: emaGapPct >= 0 ? 'Short trend above long' : 'Short trend below long',
      bar: clamp(50 + emaGapPct * 10),
    },
    {
      label: 'Bollinger %B',
      value: pctB == null ? '—' : pctB.toFixed(0),
      note:
        pctB == null
          ? 'Needs the latest close'
          : pctB > 100
            ? 'Above the upper band'
            : pctB < 0
              ? 'Below the lower band'
              : pctB >= 80
                ? 'Near the upper band'
                : pctB <= 20
                  ? 'Near the lower band'
                  : 'Inside the bands',
      bar: pctB == null ? null : clamp(pctB),
    },
    {
      label: 'Band width',
      value: `${bandWidthPct.toFixed(2)}%`,
      note: bandWidthPct > 10 ? 'Wide, volatile' : bandWidthPct < 4 ? 'Tight, a squeeze' : 'Normal volatility',
      bar: clamp(bandWidthPct * 7),
    },
  ];

  return (
    <Panel style={{ height: '100%' }}>
      <PanelHeader title="Technical readout" note={timeframe ? `${timeframe} candles` : undefined} right={<MockBadge env={indicators} />} />
      <div style={{ position: 'relative', zIndex: 4, padding: '0 14px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map((r) => (
          <div key={r.label} className="ember-row" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontSize: 15, color: '#e9ddd2' }}>{r.label}</span>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{r.value}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, height: 4, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
                {r.bar == null ? null : (
                  <div className="ember-grow" style={{ width: `${r.bar}%`, height: '100%', borderRadius: 999, background: 'var(--accent)' }} />
                )}
              </div>
              <span style={{ fontSize: 13, color: 'var(--dim)', minWidth: 150, textAlign: 'right' }}>{r.note}</span>
            </div>
          </div>
        ))}
      </div>
      <SourceFootnote env={indicators} />
    </Panel>
  );
}
