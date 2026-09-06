import type { ReactNode } from 'react';
import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { VolatilityData } from '@/lib/features/volatility';
import { fmtPct } from '@/lib/format';
import { volAtTenor } from './volModel';

export interface TermStructureGridProps {
  volatility: Envelope<VolatilityData>;
}

const STARTS = [0, 30, 60, 90, 180];
const START_LABELS = ['SPOT', '+1M', '+2M', '+3M', '+6M'];
const TENORS = [7, 30, 60, 90, 180];
const TENOR_LABELS = ['1W', '1M', '2M', '3M', '6M'];

export function TermStructureGrid({ volatility }: TermStructureGridProps) {
  const v = volatility.data;

  const cells = STARTS.map((s) => TENORS.map((t) => volAtTenor(v, s + t)));
  const flat = cells.flat();
  const hi = Math.max(...flat);
  const lo = Math.min(...flat);
  const span = hi - lo || 1;

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        title="VOL TERM STRUCTURE"
        note="MODELLED FROM 30D/90D"
        right={<MockBadge env={volatility} />}
      />
      <div style={{ padding: '12px', overflowX: 'auto', minWidth: 0 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `56px repeat(${TENORS.length}, minmax(56px, 1fr))`,
            gap: '1px',
            background: 'var(--line)',
            border: '1px solid var(--line)',
            minWidth: 360,
          }}
        >
          <Head>FWD \ TENOR</Head>
          {TENOR_LABELS.map((l) => (
            <Head key={l}>{l}</Head>
          ))}
          {cells.map((row, r) => (
            <FragmentRow key={r}>
              <Head>{START_LABELS[r]}</Head>
              {row.map((val, c) => {
                const alpha = 0.08 + 0.85 * ((val - lo) / span);
                return (
                  <div
                    key={c}
                    style={{
                      position: 'relative',
                      background: 'var(--panel)',
                      padding: '8px 6px',
                      textAlign: 'center',
                      minWidth: 0,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{ position: 'absolute', inset: 0, background: 'var(--amber)', opacity: alpha }}
                    />
                    <span
                      style={{
                        position: 'relative',
                        fontFamily: 'var(--mono)',
                        fontSize: 10,
                        fontWeight: 700,
                        color: 'var(--txt)',
                      }}
                    >
                      {fmtPct(val, false, 1)}
                    </span>
                  </div>
                );
              })}
            </FragmentRow>
          ))}
        </div>
      </div>
      <SourceFootnote env={volatility} />
    </Panel>
  );
}

function Head({ children }: { children: ReactNode }) {
  return (
    <div
      className="iris-micro"
      style={{
        background: 'var(--sunk)',
        padding: '8px 6px',
        textAlign: 'center',
        fontFamily: 'var(--mono)',
        fontSize: 8.5,
        letterSpacing: '.1em',
        color: 'var(--mut)',
      }}
    >
      {children}
    </div>
  );
}

function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
