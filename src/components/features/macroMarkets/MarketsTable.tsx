import {
  Panel,
  PanelHeader,
  DataTable,
  MockBadge,
  SourceFootnote,
} from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { MacroMarketsData } from '@/lib/features/macroMarkets';
import { toMacroMarketRows, corrTone, zTone, YAHOO_NOTE } from '@/lib/features/macroMarkets';
import { MiniSpark } from './MiniSpark';
import { signTone, toneVar } from '@/lib/theme/tokens';

/**
 * What the rest of the world is doing, and how closely BTC has been following.
 *
 * Symbols that failed upstream are listed under the table rather than dropped —
 * a missing row is information, and silently shortening the list would hide it.
 */
export function MarketsTable({ macro }: { macro: Envelope<MacroMarketsData> }) {
  const d = macro.data;
  const rows = toMacroMarketRows(d);

  return (
    <Panel>
      <PanelHeader
        title="GLOBAL MARKETS"
        note={`daily · correlation vs BTC over ${d.btcSessions} sessions`}
        right={<MockBadge env={macro} />}
      />

      <DataTable>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>MARKET</th>
            <th style={{ textAlign: 'right' }}>LEVEL</th>
            <th style={{ textAlign: 'right' }}>1D</th>
            <th style={{ textAlign: 'right' }}>5D</th>
            <th style={{ textAlign: 'right' }}>30D</th>
            <th style={{ textAlign: 'right' }}>CORR</th>
            <th style={{ textAlign: 'right' }}>Z 1Y</th>
            <th style={{ textAlign: 'left' }}>1Y</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td style={{ whiteSpace: 'nowrap' }}>
                {r.label}
                <span style={{ color: 'var(--dim)', marginLeft: 6, fontSize: 8.5 }}>
                  {r.symbol}
                </span>
              </td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.level}</td>
              <td style={{ textAlign: 'right', color: toneVar(signTone(r.raw.change1dPct)) }}>
                {r.change1d}
              </td>
              <td style={{ textAlign: 'right', color: toneVar(signTone(r.raw.change5dPct)) }}>
                {r.change5d}
              </td>
              <td style={{ textAlign: 'right', color: toneVar(signTone(r.raw.change30dPct)) }}>
                {r.change30d}
              </td>
              <td style={{ textAlign: 'right', color: toneVar(corrTone(r.corrRaw)) }}>
                {r.corr}
              </td>
              <td style={{ textAlign: 'right', color: toneVar(zTone(r.zRaw)) }}>{r.z}</td>
              <td>
                <MiniSpark
                  points={r.points}
                  stroke={r.raw.change30dPct >= 0 ? 'var(--up)' : 'var(--down)'}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>

      <div style={{ padding: '10px 12px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {d.missing.length > 0 ? (
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--mono)',
              fontSize: 8.5,
              letterSpacing: '.1em',
              color: 'var(--amber)',
            }}
          >
            UNAVAILABLE UPSTREAM: {d.missing.join(' · ')}
          </p>
        ) : null}
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--mono)',
            fontSize: 8.5,
            lineHeight: 1.55,
            color: 'var(--dim)',
          }}
        >
          {YAHOO_NOTE}
        </p>
      </div>

      <SourceFootnote env={macro} />
    </Panel>
  );
}
