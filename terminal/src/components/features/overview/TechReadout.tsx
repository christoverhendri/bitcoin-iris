import { Panel, PanelHeader, KeyValueRow, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { IndicatorData } from '@/lib/features/indicators';
import { toIndicatorLabels } from '@/lib/features/indicators/present';
import { signTone, type Tone } from '@/lib/theme/tokens';

export interface TechReadoutProps {
  indicators: Envelope<IndicatorData>;
  timeframe?: string;
}

function rsiTone(v: number): Tone {
  if (v > 70) return 'up';
  if (v < 30) return 'down';
  return 'txt';
}

export function TechReadout({ indicators, timeframe }: TechReadoutProps) {
  const ind = indicators.data;
  const labels = toIndicatorLabels(ind);

  const bbRange = ind.bollingerUpper - ind.bollingerLower;
  const bbPct = bbRange > 0 ? (ind.bollingerMiddle - ind.bollingerLower) / bbRange : 0.5;
  const atrPct = ((ind.bollingerUpper - ind.bollingerLower) / ind.bollingerMiddle) * 100;
  const emaGapPct = ((ind.ema5 - ind.ema21) / ind.ema21) * 100;

  const rows: { label: string; value: string; tone: Tone }[] = [
    {
      label: 'RSI (14)',
      value: `${labels.rsi}  ${ind.rsi > 70 ? 'OB' : ind.rsi < 30 ? 'OS' : ''}`.trim(),
      tone: rsiTone(ind.rsi),
    },
    { label: 'MACD', value: labels.macd, tone: signTone(ind.macd) },
    { label: 'MACD SIGNAL', value: labels.macdSignal, tone: 'txt' },
    { label: 'EMA5 / EMA21 GAP', value: `${emaGapPct.toFixed(2)}%`, tone: signTone(emaGapPct) },
    {
      label: 'BOLLINGER %B',
      value: (bbPct * 100).toFixed(1),
      tone: bbPct > 0.8 ? 'up' : bbPct < 0.2 ? 'down' : 'txt',
    },
    { label: 'ATR (VOL %)', value: atrPct.toFixed(2), tone: atrPct > 5 ? 'up' : 'txt' },
    { label: 'EMA21', value: labels.ema21, tone: 'txt' },
  ];

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <PanelHeader
        title="TECHNICALS"
        note={timeframe ? `${timeframe} basis` : undefined}
        right={<MockBadge env={indicators} />}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {rows.map((r) => (
          <KeyValueRow key={r.label} label={r.label} value={r.value} tone={r.tone} />
        ))}
      </div>
      <SourceFootnote env={indicators} />
    </Panel>
  );
}
