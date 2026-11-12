'use client';

import { Panel, PanelHeader } from '@/components/primitives';
import { useFlowWire } from '@/lib/live/flowWire';
import { FLOW_KIND_COLOR, FLOW_KIND_LABEL } from '@/lib/onchain/classifyFlow';
import { TRACKED_SUBSET_NOTE } from '@/lib/onchain/exchangeRegistry';

const STATUS: Record<'connecting' | 'live' | 'down', [string, string]> = {
  connecting: ['Menyambung…', 'var(--dim)'],
  live: ['Live', 'var(--accent)'],
  down: ['Terputus, mencoba lagi', 'var(--down)'],
};

/**
 * Real-time transfers touching the tracked exchange wallets, from the
 * blockchain.info socket. Unconfirmed transactions appear within seconds.
 */
export function LiveFlowWire() {
  const { status, flows } = useFlowWire();
  const [label, color] = STATUS[status];
  return (
    <Panel still>
      <PanelHeader
        title="Transfer langsung"
        note={TRACKED_SUBSET_NOTE}
        right={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color }}>
            <span className="iris-pulse" style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
            {label}
          </span>
        }
      />
      <div style={{ position: 'relative', zIndex: 4, padding: '0 26px 22px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {flows.length === 0 ? (
          <p style={{ margin: 0, fontSize: 14, color: 'var(--mut)' }}>
            Menunggu transaksi ≥10 BTC dari alamat yang dilacak. Sepi berarti tidak ada dompet terlacak yang bergerak, bukan pasar yang sepi.
          </p>
        ) : (
          flows.map(({ flow, seenAt }) => (
            <div key={flow.txid} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 14px', fontSize: 14 }}>
              <span style={{ color: 'var(--dim)', fontVariantNumeric: 'tabular-nums' }}>
                {new Date(seenAt).toLocaleTimeString('en-GB', { timeZone: 'UTC' })} UTC
              </span>
              <span style={{ color: FLOW_KIND_COLOR[flow.kind], fontWeight: 600 }}>{FLOW_KIND_LABEL[flow.kind]}</span>
              <span style={{ color: 'var(--txt)', fontVariantNumeric: 'tabular-nums' }}>
                {flow.amountBtc.toLocaleString('en-US', { maximumFractionDigits: 2 })} BTC
              </span>
              <span style={{ color: 'var(--mut)' }}>
                {flow.fromLabel} → {flow.toLabel}
              </span>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
