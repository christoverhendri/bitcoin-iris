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
  MAXPAIN_NOTE,
  toDerivativesLabels,
  type DerivativesData,
} from '@/lib/features/derivatives';
import { signTone, toneVar } from '@/lib/theme/tokens';

/** The bar is centred on parity, so it plots `ratio - 1`; ±0.6 fills it. */
const BAR_MAX = 0.6;

export function OptionsPanel({ derivatives }: { derivatives: Envelope<DerivativesData> }) {
  const d = derivatives.data;
  const L = toDerivativesLabels(d);
  const skew = d.putCallRatio > 0 ? d.putCallRatio - 1 : 0;
  // More puts than calls open = hedging/downside demand; tone it `down`.
  const tone = skew > 0.05 ? 'down' : skew < -0.05 ? 'up' : 'txt';

  return (
    <Panel>
      <PanelHeader
        title="PUT/CALL · MAX PAIN"
        note="DERIBIT OPTION BOOK"
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
          {L.putCallRatio}
        </div>
        <div
          className="iris-micro"
          style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--mut)', marginTop: 4 }}
        >
          PUT/CALL OPEN-INTEREST RATIO · 1.000 = PARITY
        </div>
        <div style={{ marginTop: 10 }}>
          <DivergingBar value={skew} max={BAR_MAX} tone={tone} height={6} />
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
          <span>0.40 CALL-HEAVY</span>
          <span>1.00</span>
          <span>1.60 PUT-HEAVY</span>
        </div>
      </div>

      <KeyValueRow label="TOTAL OPTION OI" value={L.totalOptionOi} />
      <KeyValueRow label="MAX PAIN STRIKE" value={L.maxPainStrike} tone="amber" />
      <KeyValueRow label="SPOT" value={L.spot} />
      <KeyValueRow
        label="MAX PAIN VS SPOT"
        value={L.maxPainGapPct}
        tone={signTone(L.maxPainGapRaw)}
        sub={L.maxPainGapRaw >= 0 ? 'MAX PAIN ABOVE SPOT' : 'MAX PAIN BELOW SPOT'}
      />

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
        {MAXPAIN_NOTE}
      </div>

      <SourceFootnote env={derivatives} />
    </Panel>
  );
}
