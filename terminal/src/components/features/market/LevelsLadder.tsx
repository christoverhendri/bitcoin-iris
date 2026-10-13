import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { SupportResistanceLevels } from '@/lib/features/levels';
import { toLevelsLabels } from '@/lib/features/levels/present';
import { fmtPct, fmtUsd } from '@/lib/format';
import type { Tone } from '@/lib/theme/tokens';

export interface LevelsLadderProps {
  levels: Envelope<SupportResistanceLevels>;
  /** Latest chart candle close — used to compute distance from that reference. */
  price: number;
  replay?: boolean;
  reference?: {start:number;end:number;interval:string}|null;
}

export function LevelsLadder({ levels, price, replay = false, reference }: LevelsLadderProps) {
  const l = levels.data;
  const labels = toLevelsLabels(l);

  const ladder: { key: keyof SupportResistanceLevels; label: string; tone: Tone }[] = [
    { key: 'r2', label: 'R2', tone: 'down' },
    { key: 'r1', label: 'R1', tone: 'down' },
    { key: 'vwap', label: 'VWAP', tone: 'blue' },
    { key: 's1', label: 'S1', tone: 'up' },
    { key: 's2', label: 'S2', tone: 'up' },
  ];

  return (
    <Panel className="market-levels-panel">
      <PanelHeader
        title="SUPPORT / RESISTANCE"
        right={<MockBadge env={levels} />}
      />
      <div className="market-levels-reference"><span className="market-caption">REFERENCE · {replay ? 'REPLAY CLOSE' : 'LATEST CHART CLOSE'}</span><strong>{fmtUsd(price > 0 ? price : null)}</strong><span>Level distances use this candle close.</span></div>
      <div className="market-levels-columns"><span>LEVEL / USD</span><span>FROM CLOSE</span></div>
      <div className="market-levels-list">
        {ladder.map((row) => {
          const v = l[row.key];
          const valid = !levels.unavailable && Number.isFinite(v) && v > 0;
          const distPct = valid && price > 0 ? ((v - price) / price) * 100 : null;
          return (
            <div className="market-level-row" key={row.key}>
              <div><span className="market-level-name" style={{ color: `var(--${row.tone})` }}>{row.label}</span><strong>{valid ? labels[row.key] : '—'}</strong>{valid&&price>0&&(row.key==='s1'||row.key==='s2')&&price<v&&<small className="market-broken-level">BROKEN SUPPORT · close below level</small>}{valid&&price>0&&(row.key==='r1'||row.key==='r2')&&price>v&&<small className="market-broken-level">BROKEN RESISTANCE · close above level</small>}</div>
              <span className="market-level-distance" style={{ color: distPct === null ? 'var(--mut)' : distPct >= 0 ? 'var(--up)' : 'var(--down)' }}>{fmtPct(distPct)}</span>
            </div>
          );
        })}
      </div>
      <div className="market-levels-note">Method: classic floor-trader pivot · prior completed {reference?.interval??'native'} candle H/L/C.<br />Reference: {reference?`${new Date(reference.start).toISOString()} → ${new Date(reference.end).toISOString()}`:'unavailable'}<br />VWAP: trailing ≤100 eligible candles.<br />Broken labels describe the latest close relative to the level, not an independently confirmed breakout.</div>
      <SourceFootnote env={levels} />
    </Panel>
  );
}
