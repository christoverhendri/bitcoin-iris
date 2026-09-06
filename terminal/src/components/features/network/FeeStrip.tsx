import { PanelStrip, StatTile, MockBadge } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { ChainNetworkData } from '@/lib/features/chainNetwork';
import { fmtFeeRate, isMempoolClear } from '@/lib/features/chainNetwork';
import { fmtUsd } from '@/lib/format';
import type { Tone } from '@/lib/theme/tokens';

/**
 * What it costs to transact right now, in the four confirmation targets
 * mempool.space publishes.
 *
 * When the mempool is empty all four collapse onto the relay minimum. That is
 * not a bug and it is the most useful state to be able to read at a glance, so
 * the strip says so explicitly rather than showing four identical numbers with
 * no explanation.
 */
export function FeeStrip({ network }: { network: Envelope<ChainNetworkData> }) {
  const d = network.data;
  const clear = isMempoolClear(d);

  const tiles: { label: string; value: number; tone: Tone; detail: string }[] = [
    { label: 'FASTEST', value: d.fees.fastest, tone: 'down', detail: 'next block' },
    { label: '30 MIN', value: d.fees.halfHour, tone: 'amber', detail: '~3 blocks' },
    { label: '1 HOUR', value: d.fees.hour, tone: 'txt', detail: '~6 blocks' },
    { label: 'ECONOMY', value: d.fees.economy, tone: 'up', detail: 'no deadline' },
  ];

  return (
    <PanelStrip min={170}>
      {tiles.map((t, i) => (
        <div key={t.label} style={{ position: 'relative' }}>
          {i === 0 ? (
            <span style={{ position: 'absolute', top: 5, right: 5, zIndex: 1 }}>
              <MockBadge env={network} />
            </span>
          ) : null}
          <StatTile
            label={t.label}
            value={fmtFeeRate(t.value)}
            // Every tier costs the same when nothing is queued; colouring them
            // differently would imply a choice that does not exist.
            tone={clear ? 'up' : t.tone}
            detail={t.detail}
          />
        </div>
      ))}
      <StatTile
        label="AVG FEE PAID"
        value={d.avgFeeUsd24h == null ? '—' : fmtUsd(d.avgFeeUsd24h)}
        tone="mut"
        detail={d.avgFeeUsd24h == null ? 'blockchair unavailable' : 'USD · 24h mean'}
      />
    </PanelStrip>
  );
}
