import { Panel, PanelHeader, Tag, MockBadge, SourceFootnote } from '@/components/primitives';
import { ChartHover } from '@/components/charts/ChartHover';
import { fmtDay } from '@/lib/dates';
import type { Envelope } from '@/lib/envelope';
import type { PriceDistributionData } from '@/lib/features/priceDistribution';
import { fmtUsd } from '@/lib/format';

/**
 * The simulated price distribution, anchored to actual recent price.
 *
 * The bands are drawn from the simulation's own per-step quantiles, not from a
 * curve fitted through the terminal percentiles — which is what the old cone
 * did, and why its shape carried no information beyond "wider later".
 *
 * Three nested ribbons rather than a spaghetti of paths: at a few thousand
 * paths individual lines carry no readable information and only muddy the
 * ribbon. Opacity increases inward, so the eye lands on the likely region first.
 */

const W = 900;
const H = 300;
const PAD_T = 14;
const PAD_B = 26;
const PAD_R = 62;
/** Share of the width given to actual history. The rest is the cone. */
const HISTORY_SHARE = 0.34;

export function FanChart({ dist }: { dist: Envelope<PriceDistributionData> }) {
  const d = dist.data;
  const steps = d.bands.length - 1;
  const hist = d.history;

  if (steps < 1 || hist.length < 2) {
    return (
      <Panel>
        <PanelHeader title="PRICE DISTRIBUTION" right={<MockBadge env={dist} />} />
        <div
          style={{
            padding: 20,
            textAlign: 'center',
            fontFamily: 'var(--mono)',
            fontSize: 9,
            color: 'var(--dim)',
          }}
        >
          Insufficient simulation data
        </div>
        <SourceFootnote env={dist} />
      </Panel>
    );
  }

  const splitX = (W - PAD_R) * HISTORY_SHARE;

  const histX = (i: number) => (hist.length === 1 ? 0 : (i / (hist.length - 1)) * splitX);
  const coneX = (step: number) => splitX + (step / steps) * (W - PAD_R - splitX);

  // One price scale for both halves — the whole point is to see the cone open
  // out of the actual series, which a second axis would break.
  const prices = [
    ...hist.map((p) => p.close),
    ...d.bands.map((r) => r[0] * d.spot),
    ...d.bands.map((r) => r[6] * d.spot),
  ];
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const span = hi - lo || 1;
  const y = (price: number) => H - PAD_B - ((price - lo) / span) * (H - PAD_T - PAD_B);

  /** Ribbon between two quantile columns: forward along upper, back along lower. */
  const ribbon = (upperIdx: number, lowerIdx: number) => {
    const up = d.bands
      .map((r, s) => `${s === 0 ? 'M' : 'L'}${coneX(s).toFixed(1)},${y(r[upperIdx] * d.spot).toFixed(1)}`)
      .join(' ');
    const down = d.bands
      .map((r, s) => ({ s, price: r[lowerIdx] * d.spot }))
      .reverse()
      .map((p) => `L${coneX(p.s).toFixed(1)},${y(p.price).toFixed(1)}`)
      .join(' ');
    return `${up} ${down} Z`;
  };

  const medianPath = d.bands
    .map((r, s) => `${s === 0 ? 'M' : 'L'}${coneX(s).toFixed(1)},${y(r[3] * d.spot).toFixed(1)}`)
    .join(' ');

  const historyPath = hist
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${histX(i).toFixed(1)},${y(p.close).toFixed(1)}`)
    .join(' ');

  const axisTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => lo + t * span);

  // Hover: actual closes on the left, the simulated range per day on the right.
  const lastTs = hist[hist.length - 1].ts;
  const hoverPoints = [
    ...hist.map((p, i) => ({ x: histX(i), y: y(p.close), lines: [fmtDay(p.ts), `Harga ${fmtUsd(p.close)}`] })),
    ...d.bands.slice(1).map((r, k) => {
      const s = k + 1;
      return {
        x: coneX(s),
        y: y(r[3] * d.spot),
        lines: [
          `${fmtDay(lastTs + s * 86_400_000)} · simulasi`,
          `Tengah ${fmtUsd(r[3] * d.spot)}`,
          `Rendah–Tinggi ${fmtUsd(r[2] * d.spot)} – ${fmtUsd(r[4] * d.spot)}`,
          `Sangat rendah–sangat tinggi ${fmtUsd(r[0] * d.spot)} – ${fmtUsd(r[6] * d.spot)}`,
        ],
      };
    }),
  ];

  return (
    <Panel>
      <PanelHeader
        title="PRICE DISTRIBUTION"
        note={`${d.horizonLabel} ahead · ${d.method.toUpperCase()} · drift removed`}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Tag label="GELAP = 50%" tone="blue" />
            <Tag label="TERANG = 90%" tone="mut" />
            <MockBadge env={dist} />
          </div>
        }
      />

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ChartHover
          viewW={W}
          viewH={H}
          points={hoverPoints}
          height={300}
          svgStyle={{ background: 'var(--sunk)' }}
          ariaLabel="Harga BTC aktual dan kisaran simulasi"
        >
          {axisTicks.map((p, i) => (
            <g key={i}>
              <line
                x1={0}
                x2={W - PAD_R}
                y1={y(p)}
                y2={y(p)}
                stroke="var(--line)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={W - PAD_R + 6}
                y={y(p) + 3}
                fontFamily="var(--mono)"
                fontSize={8}
                fill="var(--dim)"
              >
                {fmtUsd(p)}
              </text>
            </g>
          ))}

          {/* widest band first so the inner ones sit on top */}
          <path d={ribbon(6, 0)} fill="var(--blue)" fillOpacity={0.1} stroke="none" />
          <path d={ribbon(5, 1)} fill="var(--blue)" fillOpacity={0.14} stroke="none" />
          <path d={ribbon(4, 2)} fill="var(--blue)" fillOpacity={0.2} stroke="none" />

          <path
            d={medianPath}
            fill="none"
            stroke="var(--blue)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={historyPath}
            fill="none"
            stroke="var(--txt)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />

          {/* today */}
          <line
            x1={splitX}
            x2={splitX}
            y1={PAD_T}
            y2={H - PAD_B}
            stroke="var(--line2)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={splitX + 4}
            y={PAD_T + 8}
            fontFamily="var(--mono)"
            fontSize={8}
            fill="var(--dim)"
            letterSpacing="0.12em"
          >
            NOW
          </text>
          <text
            x={4}
            y={H - 8}
            fontFamily="var(--mono)"
            fontSize={8}
            fill="var(--dim)"
            letterSpacing="0.12em"
          >
            {fmtDay(hist[0].ts)} → HARI INI
          </text>
          <text
            x={splitX + 4}
            y={H - 8}
            fontFamily="var(--mono)"
            fontSize={8}
            fill="var(--dim)"
            letterSpacing="0.12em"
          >
            SIMULATED {d.horizonLabel.toUpperCase()}
          </text>
        </ChartHover>

        {/* No per-horizon price tiles: the same five numbers are the highlighted row of the range table below. */}
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--mono)',
            fontSize: 8.5,
            lineHeight: 1.55,
            color: 'var(--dim)',
          }}
        >
          Separuh simulasi berakhir antara Rendah dan Tinggi; 9 dari 10 antara Sangat rendah dan
          Sangat tinggi. Ini sebaran kemungkinan, bukan ramalan arah: kecenderungan naik dari sejarah
          BTC sengaja dihapus, jadi titik tengahnya tetap di sekitar harga sekarang.
        </p>
      </div>

      <SourceFootnote env={dist} />
    </Panel>
  );
}
