import {
  Panel,
  PanelHeader,
  DataTable,
  DivergingBar,
  MockBadge,
  SourceFootnote,
} from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { PositioningData } from '@/lib/features/positioning';
import { premiumTone, PREMIUM_NOTE } from '@/lib/features/positioning';
import { fmtPct, fmtUsd } from '@/lib/format';
import { toneVar } from '@/lib/theme/tokens';

/**
 * Coinbase premium and the cross-venue spread.
 *
 * The scale is FIXED at ±0.20%, not fitted to the data. Premium readings are
 * usually a few basis points, and an auto-fitted axis would render a 0.007%
 * reading as a bar slammed to one end — making a nothing-happening day look
 * like a dislocation. A fixed scale keeps "this is small" legible.
 */

const FULL_SCALE_PCT = 0.2;
const W = 400;
const H = 34;

export function PremiumPanel({ positioning }: { positioning: Envelope<PositioningData> }) {
  const d = positioning.data;
  const clamped = Math.max(-FULL_SCALE_PCT, Math.min(FULL_SCALE_PCT, d.coinbasePremiumPct));
  const mid = W / 2;
  const x = mid + (clamped / FULL_SCALE_PCT) * (mid - 6);
  const maxSpread = Math.max(...d.venues.map((v) => Math.abs(v.spreadPct)), 0.01);

  return (
    <Panel style={{ flex: 1, minWidth: 0 }}>
      <PanelHeader
        title="COINBASE PREMIUM"
        note="US spot demand proxy · fixed ±0.20% scale"
        right={<MockBadge env={positioning} />}
      />

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 24,
            fontWeight: 700,
            lineHeight: 1,
            color: toneVar(d.available.premium ? premiumTone(d.coinbasePremiumPct) : 'dim'),
          }}
        >
          {d.available.premium ? fmtPct(d.coinbasePremiumPct, true, 4) : '—'}
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: 34, display: 'block', background: 'var(--sunk)' }}
          shapeRendering="crispEdges"
        >
          {/* ticks at -0.1 / 0 / +0.1 */}
          {[-0.1, 0, 0.1].map((t) => {
            const tx = mid + (t / FULL_SCALE_PCT) * (mid - 6);
            return (
              <line
                key={t}
                x1={tx}
                x2={tx}
                y1={6}
                y2={H - 6}
                stroke={t === 0 ? 'var(--line2)' : 'var(--line)'}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {d.available.premium ? (
            <rect
              x={x - 1}
              y={2}
              width={2}
              height={H - 4}
              fill={d.coinbasePremiumPct >= 0 ? 'var(--up)' : 'var(--down)'}
            />
          ) : null}
        </svg>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--mono)',
            fontSize: 8,
            letterSpacing: '.1em',
            color: 'var(--dim)',
          }}
        >
          <span>-0.20% OFFSHORE BID</span>
          <span>0</span>
          <span>+0.20% US BID</span>
        </div>
      </div>

      <DataTable>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>VENUE</th>
            <th style={{ textAlign: 'right' }}>PRICE</th>
            <th style={{ textAlign: 'right' }}>SPREAD</th>
            <th style={{ textAlign: 'left', width: '30%' }}>&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {d.venues.map((v) => (
            <tr key={v.venue}>
              <td style={{ whiteSpace: 'nowrap' }}>{v.venue}</td>
              <td style={{ textAlign: 'right' }}>{fmtUsd(v.price)}</td>
              <td style={{ textAlign: 'right', color: toneVar(premiumTone(v.spreadPct)) }}>
                {fmtPct(v.spreadPct, true, 4)}
              </td>
              <td>
                <DivergingBar value={v.spreadPct} max={maxSpread} />
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>

      <p
        style={{
          margin: 0,
          padding: '10px 12px 0',
          fontFamily: 'var(--mono)',
          fontSize: 8.5,
          lineHeight: 1.55,
          color: 'var(--dim)',
        }}
      >
        {PREMIUM_NOTE}
      </p>

      <SourceFootnote env={positioning} />
    </Panel>
  );
}
