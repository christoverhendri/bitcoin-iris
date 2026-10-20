import Link from 'next/link';
import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { PowerLawData } from '@/lib/features/powerLawCorridor';
import { CORRIDOR_METHOD_NOTE, ZONE_COLOR, usd } from '@/lib/features/halvingCycle/present';
import { ZONE_EDGES } from '@/lib/quant/config';
import { ZONES } from '@/lib/quant/powerLaw';
import { fmtDay } from '@/lib/dates';
import { MethodTag } from '../cycle/ui';

const EDGES = [0, ...ZONE_EDGES, 100];
const k = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${(v / 1000).toFixed(1)}k`);

/** The 0–100 walk-forward percentile on the five zones, with today's marker. */
function ZoneGauge({ pct }: { pct: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ position: 'relative', display: 'flex', gap: 3, height: 14 }}>
        {ZONES.map((z, i) => (
          <span
            key={z}
            title={`${z}: persentil ${EDGES[i]}–${EDGES[i + 1]}`}
            style={{ width: `${EDGES[i + 1] - EDGES[i]}%`, borderRadius: 999, background: ZONE_COLOR[z], opacity: 0.85 }}
          />
        ))}
        <span
          style={{
            position: 'absolute',
            left: `${Math.max(0, Math.min(100, pct))}%`,
            top: -5,
            width: 4,
            height: 24,
            marginLeft: -2,
            borderRadius: 2,
            background: '#f6eee7',
            boxShadow: '0 0 0 3px var(--panel)',
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--dim)' }}>
        <span>Sangat murah</span>
        <span>Wajar</span>
        <span>Sangat mahal</span>
      </div>
    </div>
  );
}

/** Weekly price on a log scale, as a small glowing line. */
function MiniLog({ series, height }: { series: PowerLawData['series']; height: number }) {
  const W = 500;
  const H = 160;
  const pts = series.filter((p) => p.price > 0);
  const l0 = Math.log10(Math.min(...pts.map((p) => p.price)));
  const l1 = Math.log10(Math.max(...pts.map((p) => p.price)));
  const d = pts
    .map((p, i) => `${i ? 'L' : 'M'}${((i / Math.max(1, pts.length - 1)) * W).toFixed(1)} ${(H - 6 - ((Math.log10(p.price) - l0) / (l1 - l0 || 1)) * (H - 12)).toFixed(1)}`)
    .join(' ');
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Harga Bitcoin, skala log">
      <path
        d={d}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={{ filter: 'drop-shadow(0 0 6px color-mix(in srgb, var(--accent) 60%, transparent))' }}
      />
    </svg>
  );
}

function BandTiles({ bands }: { bands: number[] }) {
  const tiles = [
    { k: 'Murah (P5)', v: bands[0] },
    { k: 'Tengah (P50)', v: bands[2], on: true },
    { k: 'Mahal (P95)', v: bands[4] },
  ];
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {tiles.map((t) => (
        <div
          key={t.k}
          className="iris-inset"
          style={{
            flex: 1,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            background: t.on ? 'color-mix(in srgb, var(--accent) 14%, var(--sunk))' : undefined,
          }}
        >
          <span style={{ fontSize: 13, color: t.on ? '#e9c4a6' : 'var(--dim)' }}>{t.k}</span>
          <span style={{ fontSize: 19, fontWeight: 600 }}>{k(t.v)}</span>
        </div>
      ))}
    </div>
  );
}

/** Quant overview card: where the price sits in the corridor today. */
export function PowerLawPreview({ pl }: { pl: Envelope<PowerLawData> }) {
  const d = pl.data;
  return (
    <Panel style={{ height: '100%' }}>
      <PanelHeader title="Power-law corridor" note="skala log, sejak 2010" right={<MockBadge env={pl} />} />
      <div style={{ position: 'relative', zIndex: 4, padding: '4px 26px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span className="t-display" style={{ fontSize: 52, color: ZONE_COLOR[d.today.zone] }}>
            {Math.round(d.today.pct)}
          </span>
          <span style={{ fontSize: 15, color: 'var(--mut)' }}>persentil · {d.today.zone.toLowerCase()} dibanding sejarah</span>
        </div>
        <ZoneGauge pct={d.today.pct} />
        <MiniLog series={d.series} height={140} />
        <BandTiles bands={d.today.bands} />
        <Link href="/quant/corridor" style={{ fontSize: 14, fontWeight: 600 }}>
          Buka koridor power-law →
        </Link>
      </div>
      <SourceFootnote env={pl} />
    </Panel>
  );
}

/** Power-law tab hero: price against the fair-value line, the zone, the gauge and the bands. */
export function PowerLawHero({ pl }: { pl: Envelope<PowerLawData> }) {
  const d = pl.data;
  const ratio = d.priceNow / d.today.bands[2];
  return (
    <Panel style={{ height: '100%' }}>
      <div className="ember-halo" aria-hidden="true" style={{ top: -320, right: -160 }} />
      <div style={{ position: 'relative', zIndex: 4, padding: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 500, color: 'var(--mut)' }}>Harga dibanding garis tengah · {fmtDay(d.lastDate)}</h2>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <MethodTag note={CORRIDOR_METHOD_NOTE} />
            <MockBadge env={pl} />
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 16 }}>
          <span className="t-display t-accent" style={{ fontSize: 'clamp(64px, 8vw, 96px)', color: 'var(--accent)' }}>
            {ratio.toFixed(2)}×
          </span>
          <span style={{ fontSize: 18, color: '#e9ddd2' }}>
            {ratio >= 1 ? `${((ratio - 1) * 100).toFixed(0)}% di atas` : `${((1 - ratio) * 100).toFixed(0)}% di bawah`} garis tengah
          </span>
        </div>
        <div style={{ display: 'flex', gap: 36, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, color: 'var(--dim)' }}>Persentil</span>
            <span className="t-title" style={{ fontSize: 28, color: ZONE_COLOR[d.today.zone] }}>
              {Math.round(d.today.pct)} · {d.today.zone}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, color: 'var(--dim)' }}>Harga</span>
            <span className="t-title" style={{ fontSize: 28 }}>
              {usd(d.priceNow)}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, color: 'var(--dim)' }}>Eksponen b</span>
            <span className="t-title" style={{ fontSize: 28 }}>
              {d.fit.b.toFixed(2)}
            </span>
          </div>
        </div>
        <ZoneGauge pct={d.today.pct} />
        <BandTiles bands={d.today.bands} />
      </div>
      <SourceFootnote env={pl} />
    </Panel>
  );
}

/** Today's bands as a ladder with the close slotted in, each on one log bar. */
export function PowerLawLadder({ pl }: { pl: Envelope<PowerLawData> }) {
  const d = pl.data;
  const names = ['P5', 'P25', 'P50 tengah', 'P75', 'P95'];
  const rows = [...d.today.bands.map((v, i) => ({ k: names[i], v, now: false })), { k: `Close ${fmtDay(d.lastDate)}`, v: d.priceNow, now: true }].sort(
    (a, b) => b.v - a.v,
  );
  const l0 = Math.log10(Math.min(...rows.map((r) => r.v)) * 0.9);
  const l1 = Math.log10(Math.max(...rows.map((r) => r.v)) * 1.05);
  const pos = (v: number) => `${(((Math.log10(v) - l0) / (l1 - l0)) * 100).toFixed(1)}%`;
  return (
    <Panel style={{ height: '100%' }}>
      <PanelHeader title="Tangga harga hari ini" note="pita dari fit terbaru" right={<MockBadge env={pl} />} />
      <div style={{ position: 'relative', zIndex: 4, padding: '4px 14px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map((r) => (
          <div
            key={r.k}
            className="ember-row"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(110px, 1fr) minmax(0, 1.4fr) 90px',
              alignItems: 'center',
              gap: 12,
              padding: '11px 12px',
              background: r.now ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : undefined,
            }}
          >
            <span style={{ fontSize: 15, fontWeight: r.now ? 700 : 400, color: r.now ? '#ffb27a' : '#e9ddd2' }}>{r.k}</span>
            <div style={{ position: 'relative', height: 8, borderRadius: 999, background: 'var(--sunk)' }}>
              <span
                className="ember-grow"
                style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pos(r.v), borderRadius: 999, background: r.now ? 'var(--accent)' : '#5a4130' }}
              />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, textAlign: 'right' }}>{k(r.v)}</span>
          </div>
        ))}
        <span style={{ fontSize: 13, color: 'var(--dim)', padding: '8px 12px 0' }}>P5: hanya 5% hari lebih murah dari garis ini; P95: hanya 5% lebih mahal.</span>
      </div>
      <SourceFootnote env={pl} />
    </Panel>
  );
}
