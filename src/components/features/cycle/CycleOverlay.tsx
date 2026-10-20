import type { HalvingCycleData } from '@/lib/features/halvingCycle';
import { toDay } from '@/lib/quant/daily';

const COLORS = ['#3a2b20', '#5a4130', '#8a5e40', '#b8663a'];

/**
 * Every halving cycle laid over the others: x is days since that cycle's
 * halving, y is the price as a multiple of the halving-day price (log scale).
 * Tops and bottoms found by the cycle analysis are marked on each line; the
 * running cycle is the bright one, ending at today.
 */
export function CycleOverlay({ data, height = 260 }: { data: HalvingCycleData; height?: number }) {
  const W = 1000;
  const H = 300;
  const a = data.analysis;
  const cycles = a.cycles;
  const span = Math.max(
    1460,
    ...cycles.slice(0, -1).map((c, i) => toDay(cycles[i + 1].halving) - toDay(c.halving)),
  );

  const lines = cycles.map((c, i) => {
    const h0 = toDay(c.halving);
    const h1 = i + 1 < cycles.length ? toDay(cycles[i + 1].halving) : Infinity;
    const pts = data.history.filter((p) => {
      const d = toDay(p.date);
      return d >= h0 && d <= Math.min(h1, h0 + span);
    });
    const base = pts[0]?.price ?? 1;
    return {
      c,
      current: i === cycles.length - 1,
      base,
      h0,
      pts: pts.map((p) => ({ x: toDay(p.date) - h0, m: p.price / base })),
    };
  });

  const ms = lines.flatMap((l) => l.pts.map((p) => p.m)).filter((m) => m > 0);
  const lo = Math.log10(Math.min(1, ...ms) * 0.9);
  const hi = Math.log10(Math.max(1, ...ms) * 1.1);
  const X = (d: number) => (d / span) * W;
  const Y = (m: number) => H - ((Math.log10(m) - lo) / (hi - lo || 1)) * H;
  const path = (pts: { x: number; m: number }[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y(p.m).toFixed(1)}`).join(' ');
  const mark = (l: (typeof lines)[number], iso: string | undefined) => {
    if (!iso) return null;
    const x = toDay(iso) - l.h0;
    const p = l.pts.reduce<{ x: number; m: number } | null>((best, q) => (!best || Math.abs(q.x - x) < Math.abs(best.x - x) ? q : best), null);
    return p;
  };
  const older = lines.filter((l) => !l.current);
  const ticks = [0, 365, 730, 1095, 1460].filter((t) => t <= span);

  return (
    <div style={{ position: 'relative' }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Harga tiap siklus sebagai kelipatan harga hari halving, ${cycles.length} siklus`}
      >
        <path d={`M0 ${Y(1).toFixed(1)} L${W} ${Y(1).toFixed(1)}`} stroke="#3a2b20" strokeDasharray="3 6" vectorEffect="non-scaling-stroke" />
        {older.map((l, i) => (
          <path
            key={l.c.index}
            d={path(l.pts)}
            fill="none"
            stroke={COLORS[Math.max(0, COLORS.length - older.length + i)]}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {lines
          .filter((l) => l.current)
          .map((l) => (
            <path
              key={l.c.index}
              d={path(l.pts)}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={3}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ filter: 'drop-shadow(0 0 8px color-mix(in srgb, var(--accent) 70%, transparent))' }}
            />
          ))}
      </svg>
      {lines.flatMap((l) =>
        [
          { p: mark(l, l.c.top?.date), kind: 'top' as const },
          { p: mark(l, l.c.bottomConfirmed ? l.c.bottom?.date : undefined), kind: 'bottom' as const },
        ]
          .filter((m) => m.p)
          .map((m) => (
            <span
              key={`${l.c.index}-${m.kind}`}
              title={`Siklus ${l.c.index}: ${m.kind === 'top' ? 'top' : 'bottom'} hari ke-${m.p!.x}, ×${m.p!.m.toFixed(1)}`}
              style={{
                position: 'absolute',
                left: `${(X(m.p!.x) / W) * 100}%`,
                top: (Y(m.p!.m) / H) * height,
                width: 9,
                height: 9,
                margin: -4.5,
                borderRadius: '50%',
                background: m.kind === 'top' ? (l.current ? '#ffd2ae' : '#e9c4a6') : 'transparent',
                boxShadow: m.kind === 'bottom' ? `inset 0 0 0 2px ${l.current ? '#ffd2ae' : '#c9b8aa'}` : undefined,
              }}
            />
          )),
      )}
      {lines
        .filter((l) => l.current && l.pts.length)
        .map((l) => {
          const p = l.pts[l.pts.length - 1];
          return (
            <span
              key="now"
              className="iris-pulse"
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: `${(X(p.x) / W) * 100}%`,
                top: (Y(p.m) / H) * height,
                width: 12,
                height: 12,
                margin: -6,
                borderRadius: '50%',
                background: '#ffd2ae',
                border: '3px solid var(--accent)',
              }}
            />
          );
        })}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--dim)', marginTop: 6 }}>
        {ticks.map((t) => (
          <span key={t}>{t === 0 ? 'Halving' : `Hari ${t.toLocaleString('en-US')}`}</span>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 13, color: 'var(--mut)', marginTop: 10 }}>
        {[...lines].reverse().map((l) => (
          <span key={l.c.index} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 18,
                height: 3,
                borderRadius: 2,
                background: l.current ? 'var(--accent)' : COLORS[Math.max(0, COLORS.length - older.length + older.indexOf(l))],
              }}
            />
            Siklus {l.c.index} ({l.c.halving.slice(0, 4)})
          </span>
        ))}
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#e9c4a6' }} />
          top
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', boxShadow: 'inset 0 0 0 2px #c9b8aa' }} />
          bottom
        </span>
      </div>
    </div>
  );
}
