import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { ChainFlowsData } from '@/lib/features/chainFlows';
import { TRACKED_SUBSET_NOTE } from '@/lib/onchain/exchangeRegistry';
import { fmtCompact, fmtPct } from '@/lib/format';

export interface ExchangeReservePanelProps {
  flows: Envelope<ChainFlowsData>;
}

const micro: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--mut)',
};

/**
 * The reserve snapshot: how much BTC the tracked registry holds right now, and
 * how much of it sits on the trading surface.
 *
 * One bar carries cold vs hot (amounts and shares); the separate tiles, the
 * DEPOSIT card and the netflow gauge were removed in the 2026-10-18 curation —
 * deposit addresses are counted inside HOT, netflow lives in EXCHANGE NETFLOW.
 *
 * The hot share is the number that matters. Cold coins are inert; hot coins are
 * one API call away from the order book, so a rising hot share is rising
 * sell-side capacity regardless of what the netflow gauge says this minute.
 *
 * Every figure here is a live measurement of fifteen addresses — a sample, not
 * the market. The header says so, permanently and unconditionally.
 */
export function ExchangeReservePanel({ flows }: ExchangeReservePanelProps) {
  const f = flows.data;
  const total = f.trackedReserveBtc;
  const liquidBtc = f.hotBtc + f.depositBtc;
  const hotPct = total > 0 ? (liquidBtc / total) * 100 : 0;
  const coldPct = total > 0 ? (f.coldBtc / total) * 100 : 0;


  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        title="EXCHANGE RESERVE"
        note={`${TRACKED_SUBSET_NOTE} · SNAPSHOT · NO HISTORY`}
        right={<MockBadge env={flows} />}
      />

      <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={micro}>
            TRACKED RESERVE
          </div>
          <div
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 800,
              fontSize: 28,
              color: 'var(--txt)',
              marginTop: 4,
              lineHeight: 1.05,
            }}
          >
            {fmtCompact(total, '')} BTC
          </div>
        </div>

        {/* Cold vs liquid, as one 1px-framed stacked hairline bar. */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              marginBottom: 5,
            }}
          >
            <span style={{ ...micro, color: 'var(--blue)' }}>
              COLD {fmtCompact(f.coldBtc, '')} BTC · {fmtPct(coldPct, false, 1)}
            </span>
            <span style={{ ...micro, color: 'var(--amber)' }}>
              HOT {fmtCompact(liquidBtc, '')} BTC · {fmtPct(hotPct, false, 1)}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              height: 10,
              background: 'var(--sunk)',
              border: '1px solid var(--line2)',
            }}
          >
            <div style={{ width: `${coldPct}%`, background: 'var(--blue)' }} />
            <div style={{ width: `${hotPct}%`, background: 'var(--amber)' }} />
          </div>
        </div>
      </div>

      <SourceFootnote env={flows} />
    </Panel>
  );
}
