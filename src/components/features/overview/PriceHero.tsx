import { Suspense } from 'react';
import { MockBadge, Panel, SourceFootnote } from '@/components/primitives';
import { TimeframePills } from '@/components/shell';
import { ChartHover } from '@/components/charts/ChartHover';
import type { Envelope } from '@/lib/envelope';
import type { OhlcvCandle } from '@/lib/features/ohlcv';
import type { BtcSnapshot } from '@/lib/features/snapshot';
import { fmtDateTime, fmtDay, fmtDayShort } from '@/lib/dates';
import { fmtCompact, fmtPct, fmtUsd } from '@/lib/format';

const W = 1000;
const H = 280;
const CHART_H = 290;

/** `$81.4k` for the price axis. */
const axisUsd = (v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`);

/**
 * The Overview hero: the price set large with light crossing it, the 24h move,
 * the snapshot figures in a row, and the candles drawn as one glowing line over
 * a soft area. The timeframe pills sit in the card because they drive it.
 *
 * Everything is the live snapshot and OHLCV envelopes; nothing here is derived
 * from a constant.
 */
export function PriceHero({
  snapshot,
  ohlcv,
  timeframe,
}: {
  snapshot: Envelope<BtcSnapshot>;
  ohlcv: Envelope<OhlcvCandle[]>;
  timeframe: string;
}) {
  const s = snapshot.data;
  const candles = ohlcv.isMock ? [] : ohlcv.data;
  const n = candles.length;
  const [whole, cents] = fmtUsd(s.last).split('.');
  const up = s.change24hPct >= 0;

  // Chart geometry. Closes only: a line reads cleaner than candles at this size,
  // and the hover still reports open, high and low for every candle.
  const closes = candles.map((c) => c.close);
  const lo = n ? Math.min(...candles.map((c) => c.low)) : 0;
  const hi = n ? Math.max(...candles.map((c) => c.high)) : 1;
  const pad = (hi - lo) * 0.08 || 1;
  const yMin = lo - pad;
  const yMax = hi + pad;
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2);
  const y = (v: number) => H - ((v - yMin) / (yMax - yMin)) * H;
  const line = closes.map((c, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(c).toFixed(1)}`).join(' ');
  const area = n ? `${line} L${W} ${H} L0 ${H} Z` : '';
  const last = n ? closes[n - 1] : null;
  const lastTopPx = last == null ? 0 : (y(last) / H) * CHART_H;

  const toMs = (ts: number) => (ts < 1e12 ? ts * 1000 : ts);
  const intraday = n > 1 && toMs(candles[1].ts) - toMs(candles[0].ts) < 86_400_000;
  const when = (ts: number) => (intraday ? fmtDateTime(toMs(ts)) : fmtDay(toMs(ts)));
  const tick = (ts: number) => (intraday ? fmtDateTime(toMs(ts)).replace(' UTC', '') : fmtDayShort(toMs(ts)));
  const ticks = n > 1 ? [0, 0.25, 0.5, 0.75, 1].map((f) => candles[Math.round(f * (n - 1))]) : [];
  const levels = [0.25, 0.5, 0.75].map((f) => yMax - f * (yMax - yMin));

  const hoverPoints = candles.map((c, i) => ({
    x: x(i),
    y: y(c.close),
    lines: [when(c.ts), `Close $${fmtUsd(c.close)}`, `High $${fmtUsd(c.high)} · Low $${fmtUsd(c.low)}`, `Open $${fmtUsd(c.open)}`],
  }));

  const stats: [string, string, boolean?][] = [
    ['24h high', `$${fmtUsd(s.high24h).split('.')[0]}`],
    ['24h low', `$${fmtUsd(s.low24h).split('.')[0]}`],
    ['7 days', fmtPct(s.return7dPct), s.return7dPct >= 0],
    ['30 days', fmtPct(s.return30dPct), s.return30dPct >= 0],
    ['Volume 24h', fmtCompact(s.volume24hUsd)],
    ['Market cap', fmtCompact(s.marketCapUsd)],
    ['Dominance', fmtPct(s.dominancePct, false, 1)],
  ];

  return (
    <Panel style={{ height: '100%' }}>
      <div className="ember-halo" aria-hidden="true" style={{ top: -260, right: -180 }} />
      <div style={{ position: 'relative', zIndex: 4, padding: '30px 30px 8px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 15, fontWeight: 500, color: 'var(--mut)' }}>
              Bitcoin <span style={{ color: 'var(--dim)' }}>·</span> BTC / USD
            </h1>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
              <span className="t-display shine" style={{ fontSize: 'clamp(56px, 7vw, 92px)', color: 'var(--txt)' }}>
                ${whole}
              </span>
              <span style={{ fontSize: 'clamp(28px, 3vw, 40px)', fontWeight: 500, letterSpacing: '-0.03em', color: 'var(--dim)' }}>
                .{cents}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              <span
                className="chip"
                style={{
                  padding: '6px 12px',
                  fontSize: 15,
                  background: up ? 'var(--accent-soft)' : 'var(--raise)',
                  color: up ? '#ffb27a' : 'var(--down)',
                }}
              >
                <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden="true" style={{ transform: up ? undefined : 'rotate(180deg)' }}>
                  <path d="M5 1 L9 8 L1 8 Z" fill="currentColor" />
                </svg>
                {fmtPct(Math.abs(s.change24hPct), false)}
              </span>
              <span style={{ fontSize: 15, color: 'var(--mut)' }}>
                {s.change24hAbs >= 0 ? '+' : '−'}${fmtUsd(Math.abs(s.change24hAbs))} in 24 hours
              </span>
              <MockBadge env={snapshot} />
            </div>
          </div>
          <Suspense fallback={null}>
            <TimeframePills />
          </Suspense>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 34px' }}>
          {stats.map(([k, v, pos]) => (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--dim)' }}>{k}</span>
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  color: pos === undefined ? 'var(--txt)' : pos ? '#ffb27a' : 'var(--down)',
                }}
              >
                {v}
              </span>
            </div>
          ))}
        </div>

        {n > 1 ? (
          <div style={{ position: 'relative', margin: '0 -8px' }}>
            <ChartHover
              viewW={W}
              viewH={H}
              points={hoverPoints}
              height={CHART_H}
              ariaLabel={`Bitcoin price, ${n} candles from ${when(candles[0].ts)} to ${when(candles[n - 1].ts)}`}
            >
              <defs>
                <linearGradient id="ember-price-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.38} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              {levels.map((v) => (
                <line
                  key={v}
                  x1={0}
                  x2={W}
                  y1={y(v)}
                  y2={y(v)}
                  stroke="#2a2019"
                  strokeDasharray="3 6"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <path d={area} fill="url(#ember-price-area)" />
              <path
                d={line}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                style={{ filter: 'drop-shadow(0 0 8px color-mix(in srgb, var(--accent) 70%, transparent))' }}
              />
            </ChartHover>
            {levels.map((v) => (
              <span
                key={v}
                style={{ position: 'absolute', left: 12, top: (y(v) / H) * CHART_H - 16, fontSize: 12, color: 'var(--dim)', pointerEvents: 'none' }}
              >
                {axisUsd(v)}
              </span>
            ))}
            {last != null ? (
              <>
                <span
                  className="iris-pulse"
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    right: 2,
                    top: lastTopPx - 6,
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: '#ffd2ae',
                    border: '3px solid var(--accent)',
                    pointerEvents: 'none',
                  }}
                />
                <span
                  style={{
                    position: 'absolute',
                    right: 24,
                    top: Math.max(0, lastTopPx - 32),
                    padding: '5px 10px',
                    borderRadius: 10,
                    background: '#f6eee7',
                    color: '#1a110b',
                    fontSize: 13,
                    fontWeight: 700,
                    pointerEvents: 'none',
                  }}
                >
                  ${fmtUsd(last).split('.')[0]}
                </span>
              </>
            ) : null}
          </div>
        ) : (
          <div className="iris-inset" style={{ padding: '18px 20px', color: 'var(--mut)' }}>
            Price history is not available from the candle sources right now.
          </div>
        )}
        {ticks.length ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--dim)', marginTop: -10 }}>
            {ticks.map((c, i) => (
              <span key={i}>{i === ticks.length - 1 ? `${tick(c.ts)} · ${timeframe}` : tick(c.ts)}</span>
            ))}
          </div>
        ) : null}
      </div>
      {ohlcv.isMock ? <SourceFootnote env={snapshot} /> : <SourceFootnote env={ohlcv} />}
    </Panel>
  );
}
