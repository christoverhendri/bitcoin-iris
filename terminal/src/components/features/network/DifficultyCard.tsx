import { Panel, PanelHeader, ProgressBar, KeyValueRow, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { ChainNetworkData } from '@/lib/features/chainNetwork';
import {
  fmtDifficultyChange,
  blockPaceWord,
  TARGET_BLOCKS_24H,
} from '@/lib/features/chainNetwork';
import { fmtDayMonth } from '@/lib/format';
import type { Tone } from '@/lib/theme/tokens';

/**
 * The difficulty retarget.
 *
 * `changePct` is an **estimate**, not a schedule — it is extrapolated from the
 * block pace so far this epoch and firms up as the epoch fills. That is why
 * `progressPct` sits directly above it: it is the confidence indicator for the
 * number underneath, and showing the estimate without it would overstate what is
 * known.
 *
 * The change is rendered without a bull/bear colour on purpose. Rising
 * difficulty means more hashrate competing — a security positive and a miner
 * margin negative at once. Colouring it would assert a directional claim the
 * number does not support.
 */
export function DifficultyCard({ network }: { network: Envelope<ChainNetworkData> }) {
  const d = network.data.difficulty;
  const blocks24h = network.data.blocks24h;

  const paceWord = blockPaceWord(blocks24h);
  const paceTone: Tone = paceWord === 'ON PACE' ? 'txt' : paceWord === '—' ? 'dim' : 'amber';

  const hours = Math.round(d.remainingMs / 3_600_000);
  const remainingLabel = hours >= 48 ? `${Math.round(hours / 24)}d` : `${hours}h`;

  return (
    <Panel style={{ flex: 1, minWidth: 0 }}>
      <PanelHeader
        title="DIFFICULTY"
        note="next retarget · estimate"
        right={<MockBadge env={network} />}
      />

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontWeight: 700,
              fontSize: 22,
              lineHeight: 1,
              color: 'var(--txt)',
            }}
          >
            {fmtDifficultyChange(d.changePct)}
          </span>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 9,
              letterSpacing: '.1em',
              color: 'var(--mut)',
            }}
          >
            ESTIMATED
          </span>
        </div>

        <div>
          <ProgressBar pct={d.progressPct} tone="blue" />
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 8,
              color: 'var(--dim)',
              marginTop: 4,
              letterSpacing: '.06em',
            }}
          >
            {d.progressPct.toFixed(1)}% THROUGH EPOCH · CONFIDENCE RISES WITH THIS BAR
          </div>
        </div>
      </div>

      <div>
        <KeyValueRow
          label="BLOCKS REMAINING"
          value={d.remainingBlocks.toLocaleString('en-US')}
          sub={`~${remainingLabel}`}
        />
        <KeyValueRow label="RETARGET AT" value={`#${d.nextRetargetHeight.toLocaleString('en-US')}`} sub={fmtDayMonth(d.estimatedRetargetAt)} />
        <KeyValueRow
          label="AVG BLOCK TIME"
          value={`${Math.round(d.blockTimeAvgSec / 6) / 10} min`}
          // 600s is the protocol target; the deviation is what the retarget is
          // about to correct.
          tone={Math.abs(d.blockTimeAvgSec - 600) > 60 ? 'amber' : 'txt'}
          sub="target 10.0 min"
        />
        <KeyValueRow
          label="BLOCKS 24H"
          value={blocks24h == null ? '—' : String(blocks24h)}
          tone={paceTone}
          sub={blocks24h == null ? 'blockchair unavailable' : `${paceWord} · target ${TARGET_BLOCKS_24H}`}
        />
        <KeyValueRow
          label="PREVIOUS RETARGET"
          value={fmtDifficultyChange(d.previousChangePct)}
          tone="mut"
          sub={d.previousChangePct == null ? 'no keyless source' : 'actual'}
        />
      </div>

      <SourceFootnote env={network} />
    </Panel>
  );
}
