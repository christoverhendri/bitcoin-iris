import { Panel, PanelHeader, Tag, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { ChainNetworkData } from '@/lib/features/chainNetwork';
import {
  bucketShares,
  congestionTier,
  fmtBacklog,
  fmtVsize,
  CONGESTION_COLOR,
} from '@/lib/features/chainNetwork';
import { fmtCompact } from '@/lib/format';
import type { Tone } from '@/lib/theme/tokens';

/**
 * The pending backlog, and what it is willing to pay.
 *
 * The stacked bar is the useful half: a mempool holding four blocks of weight
 * that is all bidding under 4 sat/vB clears the moment a block is found, while
 * the same four blocks bidding 40+ means a genuine fee market. Depth alone
 * cannot tell those apart.
 */

const TIER_TONE: Record<string, Tone> = {
  CLEAR: 'up',
  NORMAL: 'txt',
  BUSY: 'amber',
  CONGESTED: 'down',
};

/** Cheap bands green through expensive bands red — same ramp as the fee tiles. */
const BAND_COLOR = [
  'var(--up)',
  'var(--up)',
  'var(--txt)',
  'var(--amber)',
  'var(--amber)',
  'var(--down)',
  'var(--down)',
];

export function MempoolGauge({ network }: { network: Envelope<ChainNetworkData> }) {
  const d = network.data;
  const tier = congestionTier(d.mempool.blocksToClear);
  // Colour is attached before any filtering. Reading BAND_COLOR by the index of
  // a filtered array would recolour the legend to disagree with the bar.
  const shares = bucketShares(d.mempool.buckets).map((s, i) => ({ ...s, color: BAND_COLOR[i] }));
  const empty = shares.every((s) => s.vsize === 0);

  return (
    <Panel style={{ flex: 1, minWidth: 0 }}>
      <PanelHeader
        title="MEMPOOL"
        note="blockchair aggregate · backlog banded at the suggested rate"
        right={<MockBadge env={network} />}
      />

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontWeight: 700,
              fontSize: 22,
              lineHeight: 1,
              color: CONGESTION_COLOR[tier],
            }}
          >
            {fmtBacklog(d.mempool.blocksToClear)}
          </span>
          <Tag label={tier} tone={TIER_TONE[tier] ?? 'mut'} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {(
            [
              ['PENDING TX', fmtCompact(d.mempool.txCount, '')],
              ['TOTAL WEIGHT', fmtVsize(d.mempool.vsize)],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--mut)' }}>
                {label}
              </div>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontWeight: 700,
                  fontSize: 12,
                  color: 'var(--txt)',
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>

        <div>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 8,
              letterSpacing: '.14em',
              color: 'var(--mut)',
              marginBottom: 5,
            }}
          >
            PENDING WEIGHT BY FEE RATE (sat/vB)
          </div>

          {empty ? (
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9,
                color: 'var(--dim)',
                padding: '8px 0',
              }}
            >
              Nothing queued
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  height: 10,
                  border: '1px solid var(--line2)',
                  background: 'var(--sunk)',
                }}
              >
                {shares.map((s) => (
                  <span
                    key={s.label}
                    title={`${s.label} sat/vB · ${fmtVsize(s.vsize)} · ${s.pct.toFixed(1)}%`}
                    style={{ width: `${s.pct}%`, background: s.color }}
                  />
                ))}
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginTop: 6,
                  fontFamily: 'var(--mono)',
                  fontSize: 8,
                  color: 'var(--dim)',
                }}
              >
                {shares
                  .filter((s) => s.pct >= 1)
                  .map((s) => (
                    <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span
                        style={{ width: 6, height: 6, background: s.color, display: 'inline-block' }}
                      />
                      {s.label} · {s.pct.toFixed(0)}%
                    </span>
                  ))}
              </div>
            </>
          )}
        </div>
      </div>

      <SourceFootnote env={network} />
    </Panel>
  );
}
