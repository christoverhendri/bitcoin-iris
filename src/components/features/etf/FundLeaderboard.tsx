import {
  Panel,
  PanelHeader,
  DataTable,
  DivergingBar,
  MockBadge,
  SourceFootnote,
} from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { EtfFlowsData } from '@/lib/features/etfFlows';
import { fmtUsdM, flowTone, ETF_SOURCE_NOTE } from '@/lib/features/etfFlows';
import { fmtPct } from '@/lib/format';
import { toneVar } from '@/lib/theme/tokens';

/**
 * Which issuers actually moved the aggregate.
 *
 * `SHARE` is computed on absolute flow, not net, so a fund that took in $200M
 * and paid out $200M still reads as a major participant. Net share would rank
 * it alongside a fund that did nothing at all, which is the opposite of true.
 */
export function FundLeaderboard({ etf }: { etf: Envelope<EtfFlowsData> }) {
  const d = etf.data;
  const peak = Math.max(...d.leaderboard.map((f) => Math.abs(f.netUsdM)), 1);

  return (
    <Panel style={{ flex: 1, minWidth: 0 }}>
      <PanelHeader
        title="BY ISSUER"
        note={`net across ${d.sessions.length} sessions · US$m`}
        right={<MockBadge env={etf} />}
      />

      <DataTable>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>FUND</th>
            <th style={{ textAlign: 'right' }}>NET</th>
            <th style={{ textAlign: 'right' }}>LATEST</th>
            <th style={{ textAlign: 'right' }}>SHARE</th>
            <th style={{ textAlign: 'left', width: '28%' }}>&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {d.leaderboard.map((f) => (
            <tr key={f.ticker}>
              <td style={{ whiteSpace: 'nowrap' }}>{f.ticker}</td>
              <td style={{ textAlign: 'right', color: toneVar(flowTone(f.netUsdM)) }}>
                {fmtUsdM(f.netUsdM)}
              </td>
              <td style={{ textAlign: 'right', color: toneVar(flowTone(f.latestUsdM)) }}>
                {fmtUsdM(f.latestUsdM)}
              </td>
              <td style={{ textAlign: 'right', color: 'var(--mut)' }}>
                {fmtPct(f.grossSharePct, false, 1)}
              </td>
              <td>
                <DivergingBar value={f.netUsdM} max={peak} />
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
        {ETF_SOURCE_NOTE}
      </p>

      <SourceFootnote env={etf} />
    </Panel>
  );
}
