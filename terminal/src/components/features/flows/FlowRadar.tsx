import { Panel, PanelHeader, DataTable, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { ChainFlowsData } from '@/lib/features/chainFlows';
import { toFlowTransferRow } from '@/lib/features/chainFlows';
import { TRACKED_SUBSET_NOTE } from '@/lib/onchain/exchangeRegistry';

export interface FlowRadarProps {
  flows: Envelope<ChainFlowsData>;
}

/**
 * Chip in the `Tag` idiom, but driven by a raw token string.
 *
 * `Tag` takes a semantic `Tone`; flow kinds and impact tiers already publish
 * their own `var(--…)` colours from the classifier and the events module, and
 * re-deriving a Tone from those would put the same mapping in two places.
 */
function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="iris-micro"
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 8.5,
        letterSpacing: '.14em',
        color,
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
        padding: '3px 8px',
        whiteSpace: 'nowrap',
        lineHeight: 1,
        display: 'inline-block',
      }}
    >
      {label}
    </span>
  );
}

const th: React.CSSProperties = { color: 'var(--mut)' };
const mono: React.CSSProperties = { fontFamily: 'var(--mono)', whiteSpace: 'nowrap' };

/**
 * The wire: every classified movement over 50 BTC touching a tracked wallet,
 * newest first.
 *
 * Read the KIND column as direction of pressure. INFLOW and HOT LOADING put
 * coins where they can be sold; OUTFLOW and COLD STORING take them away.
 */
export function FlowRadar({ flows }: FlowRadarProps) {
  const rows = flows.data.transfers.map((t) => toFlowTransferRow(t));

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        title="FLOW RADAR"
        note={`${TRACKED_SUBSET_NOTE} · SNAPSHOT · NO HISTORY · ≥50 BTC`}
        right={<MockBadge env={flows} />}
      />

      {rows.length === 0 ? (
        <div
          className="iris-micro"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'var(--dim)',
            padding: '18px 12px',
            letterSpacing: '.1em',
          }}
        >
          NO TRANSFERS ABOVE 50 BTC IN THE OBSERVED WINDOW
        </div>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th style={th}>TIME</th>
              <th style={th}>AMOUNT</th>
              <th style={th}>KIND</th>
              <th style={th}>BIAS</th>
              <th style={th}>EXCHANGE</th>
              <th style={th}>ROUTE</th>
              <th style={th}>IMPACT</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.txid}>
                <td style={{ ...mono, color: 'var(--mut)' }}>{r.ago}</td>
                <td style={{ ...mono, fontWeight: 700, color: 'var(--txt)' }}>{r.amount}</td>
                <td>
                  <Chip label={r.kindLabel} color={r.kindColor} />
                </td>
                <td>
                  <Chip label={r.biasWord} color={r.biasColor} />
                </td>
                <td style={{ ...mono, color: 'var(--mut)' }}>{r.exchange}</td>
                <td
                  style={{
                    fontFamily: 'var(--mono)',
                    color: 'var(--dim)',
                    fontSize: 10,
                    maxWidth: 260,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.route}
                </td>
                <td>
                  <Chip label={`${r.tier} ${r.impact}`} color={r.tierColor} />
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <SourceFootnote env={flows} />
    </Panel>
  );
}
