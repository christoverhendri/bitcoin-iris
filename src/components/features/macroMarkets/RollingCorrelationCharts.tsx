'use client';

import { useState } from 'react';
import { Panel, PanelHeader, MockBadge } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { MacroMarketsData, MarketSeries } from '@/lib/features/macroMarkets';

/**
 * 30-day rolling correlation of each market's daily returns with BTC's, over the
 * last year — one small chart per market on the same −1..+1 scale (small
 * multiples: five tangled lines on one chart would need five colours and a
 * legend to read). Curation 2026-10-18 replaced the single-number bars with
 * this so the history is visible.
 *
 * The shaded band is |r| < 1.96/√30 ≈ 0.36: with 30 returns, values inside it
 * are not distinguishable from "no relationship" (large-sample 95% band).
 */

const WINDOW = 30;
const NOISE = 1.96 / Math.sqrt(WINDOW);

const W = 320;
const H = 120;
const PAD_L = 26;
const PAD_R = 6;
const PAD_T = 8;
const PAD_B = 16;

const y = (r: number) => PAD_T + ((1 - r) / 2) * (H - PAD_T - PAD_B);

const fmtR = (r: number) => `${r >= 0 ? '+' : ''}${r.toFixed(2)}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
/** Formatted by hand in UTC so server and browser render the same text. */
const fmtDate = (ts: number) => {
  const d = new Date(ts);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
};

/** The current reading in plain words, on the noise band only — no invented "strong" cut. */
export function corrWords(r: number | null): string {
  if (r === null) return 'belum cukup data';
  if (r >= NOISE) return 'bergerak searah dengan BTC';
  if (r <= -NOISE) return 'bergerak berlawanan dengan BTC';
  return 'tidak ada hubungan yang jelas';
}

function SmallChart({ s }: { s: MarketSeries }) {
  const pts = s.rollingCorr30d;
  const [hover, setHover] = useState<number | null>(null);

  if (pts.length < 2) {
    return (
      <div style={{ padding: 12, fontSize: 11, color: 'var(--dim)' }}>
        {s.label}: belum cukup data untuk korelasi 30 hari.
      </div>
    );
  }

  const t0 = pts[0].ts;
  const t1 = pts[pts.length - 1].ts;
  const x = (ts: number) => PAD_L + ((ts - t0) / (t1 - t0 || 1)) * (W - PAD_L - PAD_R);
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.ts).toFixed(1)},${y(p.r).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const h = hover === null ? null : pts[hover];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const ts = t0 + ((px - PAD_L) / (W - PAD_L - PAD_R)) * (t1 - t0);
    let best = 0;
    for (let i = 1; i < pts.length; i += 1) {
      if (Math.abs(pts[i].ts - ts) < Math.abs(pts[best].ts - ts)) best = i;
    }
    setHover(best);
  };

  return (
    <div style={{ background: 'var(--panel)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span className="iris-micro" style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.12em', color: 'var(--txt)' }}>
          {s.label}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--txt)' }}>
          {h ? fmtR(h.r) : fmtR(last.r)}
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--mut)', minHeight: 16 }}>
        {h ? `${fmtDate(h.ts)} · ${corrWords(h.r)}` : `Sekarang: ${corrWords(last.r)}`}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'none' }}
        role="img"
        aria-label={`${s.label}: korelasi 30 hari dengan BTC, sekarang ${fmtR(last.r)}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {/* noise band */}
        <rect x={PAD_L} y={y(NOISE)} width={W - PAD_L - PAD_R} height={y(-NOISE) - y(NOISE)} fill="var(--line)" opacity={0.6} />
        {/* gridlines at +1, 0, −1 */}
        {[1, 0, -1].map((g) => (
          <g key={g}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y(g)}
              y2={y(g)}
              stroke={g === 0 ? 'var(--line2)' : 'var(--line)'}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <text x={PAD_L - 4} y={y(g) + 3} textAnchor="end" fontSize={8} fontFamily="var(--mono)" fill="var(--dim)">
              {g > 0 ? '+1' : g < 0 ? '−1' : '0'}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--blue)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {h ? (
          <g>
            <line x1={x(h.ts)} x2={x(h.ts)} y1={PAD_T} y2={H - PAD_B} stroke="var(--mut)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <circle cx={x(h.ts)} cy={y(h.r)} r={4} fill="var(--blue)" stroke="var(--panel)" strokeWidth={2} />
          </g>
        ) : (
          <circle cx={x(last.ts)} cy={y(last.r)} r={4} fill="var(--blue)" stroke="var(--panel)" strokeWidth={2} />
        )}
        <text x={PAD_L} y={H - 3} fontSize={8} fontFamily="var(--mono)" fill="var(--dim)">
          {fmtDate(t0)}
        </text>
        <text x={W - PAD_R} y={H - 3} textAnchor="end" fontSize={8} fontFamily="var(--mono)" fill="var(--dim)">
          {fmtDate(t1)}
        </text>
      </svg>
    </div>
  );
}

export function RollingCorrelationCharts({ macro }: { macro: Envelope<MacroMarketsData> }) {
  return (
    <Panel>
      <PanelHeader title="KORELASI 30 HARI DENGAN BTC" note="riwayat setahun · return harian, dicocokkan per tanggal" right={<MockBadge env={macro} />} />
      <p style={{ margin: 0, padding: '10px 12px', fontSize: 11.5, lineHeight: 1.55, color: 'var(--mut)', borderBottom: '1px solid var(--line)' }}>
        Garis menunjukkan seberapa searah tiap pasar bergerak dengan BTC dalam 30 hari terakhir pada
        setiap tanggal. +1 = selalu bergerak searah, −1 = selalu berlawanan, 0 = tidak berhubungan.
        Area abu-abu = terlalu lemah untuk disebut hubungan (dengan 30 hari data, nilai di dalamnya
        bisa terjadi karena kebetulan). Arahkan kursor ke grafik untuk melihat tanggal dan nilainya.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 1,
          background: 'var(--line)',
        }}
      >
        {macro.data.series.map((s) => (
          <SmallChart key={s.key} s={s} />
        ))}
      </div>
    </Panel>
  );
}
