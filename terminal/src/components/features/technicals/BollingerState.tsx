import { Panel, PanelHeader, KeyValueRow, ProgressBar, Tag, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { IndicatorData } from '@/lib/features/indicators';
import { toIndicatorLabels } from '@/lib/features/indicators/present';
import { fmtPct } from '@/lib/format';
import type { Tone } from '@/lib/theme/tokens';

export interface BollingerStateProps {
  indicators: Envelope<IndicatorData>;
}

export function BollingerState({ indicators }: BollingerStateProps) {
  const d = indicators.data;
  const labels = toIndicatorLabels(d);

  const range = d.bollingerUpper - d.bollingerLower;
  // No spot price on this route — band middle stands in as the price reference.
  const pctB = range > 0 ? (d.bollingerMiddle - d.bollingerLower) / range : 0.5;
  const bandwidthPct = d.bollingerMiddle > 0 ? (range / d.bollingerMiddle) * 100 : 0;

  let state = 'MID RANGE';
  let tone: Tone = 'txt';
  if (pctB > 0.8) {
    state = 'UPPER BAND';
    tone = 'up';
  } else if (pctB < 0.2) {
    state = 'LOWER BAND';
    tone = 'down';
  }

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        title="BOLLINGER BANDS"
        right={
          <>
            <Tag label={state} tone={tone} />
            <MockBadge env={indicators} />
          </>
        }
      />
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div>
          <div
            className="iris-micro"
            style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.14em', color: 'var(--mut)', marginBottom: 6 }}
          >
            %B POSITION {fmtPct(pctB * 100, false)}
          </div>
          <ProgressBar pct={pctB * 100} tone={tone === 'txt' ? 'blue' : tone} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <KeyValueRow label="UPPER" value={labels.bollingerUpper} tone="down" />
        <KeyValueRow label="MIDDLE" value={labels.bollingerMiddle} tone="txt" />
        <KeyValueRow label="LOWER" value={labels.bollingerLower} tone="up" />
        <KeyValueRow label="BANDWIDTH" value={fmtPct(bandwidthPct, false)} tone="amber" />
      </div>
      <SourceFootnote env={indicators} />
    </Panel>
  );
}
