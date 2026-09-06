import {
  DivergingBar,
  KeyValueRow,
  MockBadge,
  Panel,
  PanelHeader,
  SourceFootnote,
} from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import {
  FUNDING_NOTE,
  fundingTone,
  toDerivativesLabels,
  type DerivativesData,
} from '@/lib/features/derivatives';
import { toneVar } from '@/lib/theme/tokens';

/** ±0.05% per period fills the bar — well past anything a calm market prints. */
const BAR_MAX = 0.05;

export function FundingPanel({ derivatives }: { derivatives: Envelope<DerivativesData> }) {
  const d = derivatives.data;
  const L = toDerivativesLabels(d);
  const tone = fundingTone(d.fundingRate);

  return (
    <Panel>
      <PanelHeader
        title="FUNDING RATE"
        note="PERP · 8H PERIOD"
        right={<MockBadge env={derivatives} />}
      />

      <div style={{ padding: '14px 12px', borderBottom: '1px solid var(--line)' }}>
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontWeight: 700,
            fontSize: 26,
            lineHeight: 1.1,
            color: toneVar(tone),
          }}
        >
          {L.fundingRate}
        </div>
        <div
          className="iris-micro"
          style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--mut)', marginTop: 4 }}
        >
          {L.fundingAnnualized} ANNUALISED
        </div>
        <div style={{ marginTop: 10 }}>
          <DivergingBar value={d.fundingRate * 100} max={BAR_MAX} tone={tone} height={6} />
        </div>
        <div
          className="iris-micro"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--mono)',
            fontSize: 8.5,
            color: 'var(--dim)',
            marginTop: 4,
          }}
        >
          <span>-0.05%</span>
          <span>0</span>
          <span>+0.05%</span>
        </div>
      </div>

      {L.fundingBySource.length ? (
        L.fundingBySource.map((f) => (
          <KeyValueRow key={f.source} label={f.source} value={f.value} tone={f.tone} />
        ))
      ) : (
        <KeyValueRow label="VENUES" value="NO VENUE ANSWERED" tone="dim" />
      )}
      <KeyValueRow label="PERP BASIS VS SPOT" value={L.basis} tone={d.basisPct >= 0 ? 'up' : 'down'} />

      <div
        className="iris-micro"
        style={{
          padding: '9px 12px',
          fontFamily: 'var(--mono)',
          fontSize: 9,
          lineHeight: 1.55,
          color: 'var(--dim)',
        }}
      >
        {FUNDING_NOTE}
      </div>

      <SourceFootnote env={derivatives} />
    </Panel>
  );
}
