import {
  Panel,
  PanelHeader,
  DivergingBar,
  MockBadge,
  SourceFootnote,
} from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { MacroMarketsData } from '@/lib/features/macroMarkets';
import { fmtCorr, corrTone, CORR_NOTE } from '@/lib/features/macroMarkets';
import { toneVar } from '@/lib/theme/tokens';

/**
 * What BTC has been trading with this month, strongest relationship first.
 *
 * Sorted by absolute correlation because a strong inverse relationship is as
 * informative as a strong positive one — ranking by signed value would bury
 * "BTC is moving against the dollar" underneath three weak positives.
 */
export function CorrelationBars({ macro }: { macro: Envelope<MacroMarketsData> }) {
  const rows = [...macro.data.series].sort(
    (a, b) => Math.abs(b.corr30d ?? 0) - Math.abs(a.corr30d ?? 0),
  );

  return (
    <Panel style={{ flex: 1, minWidth: 0 }}>
      <PanelHeader
        title="30D CORRELATION vs BTC"
        note="daily returns · date-matched"
        right={<MockBadge env={macro} />}
      />

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((s) => (
          <div key={s.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--mono)',
                fontSize: 9,
              }}
            >
              <span style={{ color: 'var(--txt)' }}>{s.label}</span>
              <span style={{ color: toneVar(corrTone(s.corr30d)), fontWeight: 700 }}>
                {fmtCorr(s.corr30d)}
                {s.corr30d === null ? (
                  <span style={{ color: 'var(--dim)', fontWeight: 400 }}>
                    {' '}
                    ({s.corrSessions} sessions)
                  </span>
                ) : null}
              </span>
            </div>
            <DivergingBar value={s.corr30d ?? 0} max={1} />
          </div>
        ))}

        <p
          style={{
            margin: 0,
            fontFamily: 'var(--mono)',
            fontSize: 8.5,
            lineHeight: 1.55,
            color: 'var(--dim)',
          }}
        >
          {CORR_NOTE}
        </p>
      </div>

      <SourceFootnote env={macro} />
    </Panel>
  );
}
