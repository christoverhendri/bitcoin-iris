import { Panel, PanelGrid, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { PowerLawData } from '@/lib/features/powerLawCorridor';
import { BAND_LABEL, CORRIDOR_METHOD_NOTE, ZONE_COLOR, usd, zoneRange } from '@/lib/features/halvingCycle/present';
import { ZONE_EDGES } from '@/lib/quant/config';
import { ZONES } from '@/lib/quant/powerLaw';
import { fmtDay } from '@/lib/dates';
import { Explain, MethodTag } from '../cycle/ui';

const EDGES = [0, ...ZONE_EDGES, 100];

/**
 * Where today's price sits in the corridor: a 0–100 gauge with the five zones,
 * and a price ladder of today's bands with the current price slotted in.
 */
export function CorridorNow({ pl }: { pl: Envelope<PowerLawData> }) {
  const d = pl.data;
  const pct = d.today.pct;
  const ladder = [
    ...d.today.bands.map((p, i) => ({ label: BAND_LABEL[i], price: p, now: false })),
    { label: 'CLOSE', price: d.priceNow, now: true },
  ].sort((a, b) => b.price - a.price);

  return (
    <Panel>
      <PanelHeader title="POSISI HARGA DI KORIDOR JANGKA PANJANG" note={`data ${fmtDay(d.lastDate)}`} right={<><MethodTag note={CORRIDOR_METHOD_NOTE} /><MockBadge env={pl} /></>} />
      <Explain>
        Harga Bitcoin jangka panjang naik mengikuti garis lurus di grafik log-log (<b>power law</b>). Angka 0–100 di bawah
        menjawab: <i>dibanding garis itu, seberapa mahal harga hari ini bila dibandingkan dengan semua hari sebelumnya?</i> 0 =
        paling murah yang pernah ada, 100 = paling mahal. Garisnya di-fit ulang tiap bulan hanya dengan data masa lalu (tanpa
        hindsight).
      </Explain>
      <PanelGrid columns="repeat(auto-fit, minmax(300px, 1fr))" style={{ margin: 12 }}>
        <div style={{ background: 'var(--panel)', padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 34, fontWeight: 700, color: ZONE_COLOR[d.today.zone] }}>{Math.round(pct)}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, letterSpacing: '.1em', color: ZONE_COLOR[d.today.zone] }}>
              {d.today.zone.toUpperCase()}
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--mut)', margin: '4px 0 14px' }}>
            Lebih murah dari {Math.round(100 - pct)}% hari dalam sejarahnya (relatif ke garis jangka panjang).
          </div>
          <div style={{ position: 'relative', height: 14, display: 'flex' }}>
            {ZONES.map((z, i) => (
              <div
                key={z}
                title={`${z}: persentil ${zoneRange(i)}`}
                style={{ width: `${EDGES[i + 1] - EDGES[i]}%`, background: ZONE_COLOR[z], opacity: z === d.today.zone ? 0.9 : 0.35 }}
              />
            ))}
            <div style={{ position: 'absolute', left: `${pct}%`, top: -5, bottom: -5, width: 3, marginLeft: -1.5, background: 'var(--txt)' }} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontFamily: 'var(--mono)', fontSize: 8.5, color: 'var(--mut)', marginTop: 8 }}>
            {ZONES.map((z, i) => (
              <span key={z} style={{ whiteSpace: 'nowrap' }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, marginRight: 4, background: ZONE_COLOR[z] }} />
                {z.toUpperCase()} {zoneRange(i)}
              </span>
            ))}
          </div>
          <div style={{ marginTop: 14, fontSize: 10.5, color: 'var(--dim)', lineHeight: 1.5 }}>
            Kemiringan garis (eksponen b) ikut bergeser saat data bertambah:{' '}
            {d.bHistory.map((h, i) => (
              <span key={h.refit}>
                {i ? ' → ' : ''}
                {i === d.bHistory.length - 1 ? 'sekarang' : h.refit.slice(0, 4)} <b style={{ color: 'var(--mut)' }}>{h.b.toFixed(2)}</b>
              </span>
            ))}
            . Itu sebabnya persentil dihitung walk-forward.
          </div>
        </div>
        <div style={{ background: 'var(--panel)', padding: 12 }}>
          <div className="iris-micro" style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.14em', color: 'var(--txt)', marginBottom: 6 }}>
            TANGGA HARGA HARI INI
          </div>
          {ladder.map((r) => (
            <div
              key={r.label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '6px 8px',
                borderBottom: '1px solid var(--line)',
                fontFamily: 'var(--mono)',
                fontSize: 11,
                background: r.now ? 'var(--sunk)' : undefined,
                color: r.now ? 'var(--txt)' : 'var(--mut)',
                fontWeight: r.now ? 700 : 400,
              }}
            >
              <span>{r.now ? `▶ CLOSE ${fmtDay(d.lastDate).toUpperCase()}` : `PITA ${r.label}`}</span>
              <span>{usd(r.price)}</span>
            </div>
          ))}
          <div style={{ marginTop: 8, fontSize: 10.5, color: 'var(--dim)', lineHeight: 1.5 }}>
            Pita P5 = hanya 5% hari dalam sejarah lebih murah dari garis ini; P95 = hanya 5% lebih mahal.
          </div>
        </div>
      </PanelGrid>
      <SourceFootnote env={pl} />
    </Panel>
  );
}
