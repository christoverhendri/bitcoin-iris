import {
  Panel,
  PanelHeader,
  StatTile,
  DivergingBar,
  MockBadge,
  SourceFootnote,
} from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { ChainFlowsData } from '@/lib/features/chainFlows';
import { TRACKED_SUBSET_NOTE } from '@/lib/onchain/exchangeRegistry';
import { fmtCompact, fmtPct } from '@/lib/format';

export interface ExchangeReservePanelProps {
  flows: Envelope<ChainFlowsData>;
}

const micro: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 9,
  letterSpacing: '.14em',
  color: 'var(--mut)',
};

/**
 * The reserve snapshot: how much BTC the tracked registry holds right now, and
 * how much of it sits on the trading surface.
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

  const net = f.netflowBtc;
  const netMax = Math.max(Math.abs(net), f.inflow, f.outflow, 1);

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        title="EXCHANGE RESERVE"
        note={`${TRACKED_SUBSET_NOTE} · SNAPSHOT · NO HISTORY`}
        right={<MockBadge env={flows} />}
      />

      <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div className="iris-micro" style={micro}>
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
          <div
            className="iris-micro"
            style={{ ...micro, fontSize: 9, color: 'var(--dim)', letterSpacing: '.1em', marginTop: 3 }}
          >
            {f.addressCount} ADDRESSES RESOLVED · {f.exchangeCount} EXCHANGES · NOT TOTAL EXCHANGE
            SUPPLY
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
            <span className="iris-micro" style={{ ...micro, color: 'var(--blue)' }}>
              COLD {fmtPct(coldPct, false, 1)}
            </span>
            <span className="iris-micro" style={{ ...micro, color: 'var(--amber)' }}>
              HOT + DEPOSIT {fmtPct(hotPct, false, 1)}
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

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 1, background: 'var(--line)' }}>
          <div style={{ flex: '1 1 150px', minWidth: 0 }}>
            <StatTile label="COLD STORAGE" value={`${fmtCompact(f.coldBtc, '')} BTC`} tone="blue" detail="parked, illiquid" />
          </div>
          <div style={{ flex: '1 1 150px', minWidth: 0 }}>
            <StatTile label="HOT WALLETS" value={`${fmtCompact(f.hotBtc, '')} BTC`} tone="amber" detail="trading surface" />
          </div>
          <div style={{ flex: '1 1 150px', minWidth: 0 }}>
            <StatTile label="DEPOSIT" value={`${fmtCompact(f.depositBtc, '')} BTC`} tone="mut" detail="customer inbound" />
          </div>
        </div>

        {/* Netflow gauge. Positive = deposits exceed withdrawals = sell pressure. */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
            <span className="iris-micro" style={micro}>
              NETFLOW (IN − OUT)
            </span>
            <span
              className="iris-micro"
              style={{ ...micro, fontWeight: 700, color: net > 0 ? 'var(--down)' : net < 0 ? 'var(--up)' : 'var(--mut)' }}
            >
              {fmtCompact(net, '')} BTC · {net > 0 ? 'BEARISH' : net < 0 ? 'BULLISH' : 'FLAT'}
            </span>
          </div>
          {/* Negated so withdrawals (bullish) render green to the right. */}
          <DivergingBar value={-net} max={netMax} height={8} />
          <div
            className="iris-micro"
            style={{ ...micro, fontSize: 9, color: 'var(--dim)', letterSpacing: '.1em', marginTop: 5 }}
          >
            {net > 0
              ? 'coins moving onto exchanges — supply approaching the book'
              : net < 0
                ? 'coins leaving exchanges — supply withdrawn from the book'
                : 'no net movement in the observed window'}
          </div>
        </div>
      </div>

      <SourceFootnote env={flows} />
    </Panel>
  );
}
