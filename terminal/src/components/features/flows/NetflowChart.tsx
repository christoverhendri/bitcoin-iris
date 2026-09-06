import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { ChainFlowsData } from '@/lib/features/chainFlows';
import { toChainFlowsLabels, getChainFlowsColor } from '@/lib/features/chainFlows';
import { fmtCompact } from '@/lib/format';
import { TRACKED_SUBSET_NOTE } from '@/lib/onchain/exchangeRegistry';

export interface NetflowChartProps {
  flows: Envelope<ChainFlowsData>;
}

const CX = 135;
const HALF = 62;

export function NetflowChart({ flows }: NetflowChartProps) {
  const f = flows.data;
  const labels = toChainFlowsLabels(f);
  const net = f.outflow - f.inflow;
  const netBtc = `${fmtCompact(net, '')} BTC`;
  const max = Math.max(f.inflow, f.outflow, Math.abs(net), 1);

  const rows = [
    { label: 'INFLOW', value: -f.inflow, color: 'var(--down)', display: labels.inflow },
    { label: 'OUTFLOW', value: f.outflow, color: 'var(--up)', display: labels.outflow },
    { label: 'NET', value: net, color: getChainFlowsColor(net), display: netBtc },
  ];

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        title="EXCHANGE NETFLOW"
        note={`${TRACKED_SUBSET_NOTE} · SNAPSHOT · NO HISTORY`}
        right={<MockBadge env={flows} />}
      />
      <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div
            className="iris-micro"
            style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.14em', color: 'var(--mut)' }}
          >
            NET POSITION
          </div>
          <div
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 800,
              fontSize: 24,
              color: getChainFlowsColor(net),
              marginTop: 4,
            }}
          >
            {netBtc}
          </div>
          <div className="iris-micro" style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--dim)', marginTop: 2 }}>
            {net >= 0 ? 'net leaving exchanges' : 'net entering exchanges'}
          </div>
        </div>

        <svg viewBox="0 0 270 108" style={{ width: '100%', height: 120 }}>
          <line
            x1={CX}
            x2={CX}
            y1={8}
            y2={100}
            stroke="var(--line2)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          {rows.map((r, i) => {
            const y = 22 + i * 30;
            const w = (r.value / max) * HALF;
            const x = r.value >= 0 ? CX : CX + w;
            return (
              <g key={r.label}>
                <text x={4} y={y + 3} fontFamily="var(--mono)" fontSize={9} fill="var(--mut)">
                  {r.label}
                </text>
                <rect x={x} y={y - 6} width={Math.abs(w)} height={12} fill={r.color} />
                <text x={266} y={y + 3} fontFamily="var(--mono)" fontSize={9} fill={r.color} textAnchor="end">
                  {r.display}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <SourceFootnote env={flows} />
    </Panel>
  );
}
