import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { MonthlyForecastPath } from '@/lib/features/monthlyForecast';
import { toMonthlyForecastLabels } from '@/lib/features/monthlyForecast';
import { fmtPct } from '@/lib/format';

export interface ForecastConeProps {
  forecast: Envelope<MonthlyForecastPath>;
}

const H = 150;
const PAD = 12;

export function ForecastCone({ forecast }: ForecastConeProps) {
  const f = forecast.data;
  const labels = toMonthlyForecastLabels(f);
  const path = f.pathPct ?? [];
  const n = path.length;
  const usable = n >= 2 && f.p50 !== 0;

  let body: React.ReactNode;

  if (!usable) {
    body = (
      <div
        className="iris-micro"
        style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mut)', padding: '24px 12px' }}
      >
        INSUFFICIENT SIMULATION PATH DATA
      </div>
    );
  } else {
    const base = path[0];
    const rel = path.map((v) => v - base);
    const endShift = rel[n - 1];
    const mid = rel.map((v, i) => v - endShift * (i / (n - 1)));
    const p10rel = (f.p10 / f.p50 - 1) * 100;
    const p90rel = (f.p90 / f.p50 - 1) * 100;
    const lower = mid.map((v, i) => v + p10rel * Math.sqrt(i / (n - 1)));
    const upper = mid.map((v, i) => v + p90rel * Math.sqrt(i / (n - 1)));

    const all = [...lower, ...mid, ...upper, 0];
    let yMin = Math.min(...all);
    let yMax = Math.max(...all);
    if (yMax === yMin) {
      yMax += 1;
      yMin -= 1;
    }

    const x = (i: number) => PAD + (i / (n - 1)) * (100 - 2 * PAD);
    const y = (v: number) => PAD + (1 - (v - yMin) / (yMax - yMin)) * (H - 2 * PAD);

    const poly = (arr: number[]) => arr.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
    const polyRev = (arr: number[]) =>
      arr
        .map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`)
        .reverse()
        .join(' ');

    const upperBand = `${poly(mid)} ${polyRev(upper)}`;
    const lowerBand = `${poly(mid)} ${polyRev(lower)}`;

    body = (
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 180 }}>
          {[0, 0.25, 0.5, 0.75, 1].map((p) => (
            <line
              key={p}
              x1={PAD}
              x2={100 - PAD}
              y1={PAD + p * (H - 2 * PAD)}
              y2={PAD + p * (H - 2 * PAD)}
              stroke="var(--line2)"
              strokeWidth={0.5}
              opacity={0.3}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <polygon points={upperBand} fill="var(--up)" opacity={0.1} />
          <polygon points={lowerBand} fill="var(--down)" opacity={0.1} />

          {0 >= yMin && 0 <= yMax && (
            <line
              x1={PAD}
              x2={100 - PAD}
              y1={y(0)}
              y2={y(0)}
              stroke="var(--dim)"
              strokeWidth={1}
              strokeDasharray="2 2"
              vectorEffect="non-scaling-stroke"
            />
          )}

          <polyline points={poly(upper)} fill="none" stroke="var(--up)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <polyline points={poly(lower)} fill="none" stroke="var(--down)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <polyline points={poly(mid)} fill="none" stroke="var(--blue)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </svg>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: 'var(--line)' }}>
          {[
            { k: 'P90', v: labels.p90, rel: p90rel, tone: 'up' },
            { k: 'P50', v: labels.p50, rel: 0, tone: 'blue' },
            { k: 'P10', v: labels.p10, rel: p10rel, tone: 'down' },
          ].map((c) => (
            <div key={c.k} style={{ background: 'var(--sunk)', padding: '8px 10px' }}>
              <div
                className="iris-micro"
                style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.14em', color: `var(--${c.tone})` }}
              >
                {c.k}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--txt)', marginTop: 3 }}>
                {c.v}
              </div>
              <div className="iris-micro" style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--dim)', marginTop: 1 }}>
                {fmtPct(c.rel)} vs P50
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        title="MONTE CARLO FORECAST CONE"
        note={n >= 2 ? `${n - 1}d horizon` : undefined}
        right={<MockBadge env={forecast} />}
      />
      {body}
      <SourceFootnote env={forecast} />
    </Panel>
  );
}
