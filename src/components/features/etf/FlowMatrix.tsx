import {
  Panel,
  PanelHeader,
  DataTable,
  MockBadge,
  SourceFootnote,
} from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { EtfFlowsData } from '@/lib/features/etfFlows';
import { ETF_SETTLEMENT_NOTE } from '@/lib/features/etfFlows';

/**
 * Session × issuer, tinted by size.
 *
 * This panel exists because the net figure hides composition: a day where IBIT
 * took in $300M while GBTC bled $300M prints as zero, and reads as "nothing
 * happened" when in fact a great deal happened. The matrix is the only view
 * here that shows rotation between issuers rather than the sum of it.
 *
 * The tint is a four-step ramp rather than a continuous gradient — at 8.5px
 * type a smooth scale is indistinguishable band to band, so discrete steps
 * carry more information than a gradient would.
 */

/** Four steps of alpha. Index 0 is "present but small". */
const STEPS = [0.12, 0.3, 0.5, 0.72];

function tint(value: number, peak: number): string {
  if (value === 0 || peak <= 0) return 'transparent';
  const mag = Math.abs(value) / peak;
  const step = STEPS[Math.min(STEPS.length - 1, Math.floor(mag * STEPS.length))];
  const base = value > 0 ? 'var(--up)' : 'var(--down)';
  return `color-mix(in srgb, ${base} ${Math.round(step * 100)}%, transparent)`;
}

export function FlowMatrix({ etf }: { etf: Envelope<EtfFlowsData> }) {
  const d = etf.data;

  // Scale on the largest single fund-day, so one issuer's outlier does not
  // wash every other cell to invisible.
  const peak = Math.max(
    ...d.sessions.flatMap((s) => d.funds.map((f) => Math.abs(s.byFund[f] ?? 0))),
    1,
  );

  return (
    <Panel>
      <PanelHeader
        title="FLOW MATRIX"
        note="session × issuer · US$m · tint by size"
        right={<MockBadge env={etf} />}
      />

      <DataTable>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>DATE</th>
            {d.funds.map((f) => (
              <th key={f} style={{ textAlign: 'right' }}>
                {f}
              </th>
            ))}
            <th style={{ textAlign: 'right' }}>NET</th>
          </tr>
        </thead>
        <tbody>
          {d.sessions.map((s) => (
            <tr key={s.date}>
              <td style={{ whiteSpace: 'nowrap', color: 'var(--mut)' }}>{s.date}</td>
              {d.funds.map((f) => {
                const v = s.byFund[f] ?? 0;
                return (
                  <td
                    key={f}
                    style={{
                      textAlign: 'right',
                      background: tint(v, peak),
                      color: v === 0 ? 'var(--dim)' : 'var(--txt)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {v === 0 ? '·' : v.toFixed(1)}
                  </td>
                );
              })}
              <td
                style={{
                  textAlign: 'right',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  color:
                    s.totalUsdM > 0
                      ? 'var(--up)'
                      : s.totalUsdM < 0
                        ? 'var(--down)'
                        : 'var(--mut)',
                }}
              >
                {s.totalUsdM.toFixed(1)}
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
        {ETF_SETTLEMENT_NOTE}
      </p>

      <SourceFootnote env={etf} />
    </Panel>
  );
}
