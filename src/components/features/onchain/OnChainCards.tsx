import Link from 'next/link';
import type { ReactNode } from 'react';
import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { EtfFlowsData } from '@/lib/features/etfFlows/types';
import type { PositioningData } from '@/lib/features/positioning/types';
import type { ChainFlowsData, FlowTransfer } from '@/lib/features/chainFlows/types';
import { fmtDayShort } from '@/lib/dates';
import { fmtAgo, fmtCompact } from '@/lib/format';

/** `+$412.0M`, `−$1.21B` from US$ millions. */
export const usdM = (m: number) => {
  const a = Math.abs(m);
  return `${m >= 0 ? '+' : '−'}$${a >= 1000 ? `${(a / 1000).toFixed(2)}B` : `${a.toFixed(1)}M`}`;
};
const btc = (n: number) => `${fmtCompact(n, '')} BTC`;
const POS = '#ffb27a';
const NEG = 'var(--down)';

function Stat({ k, v, color, hint }: { k: string; v: string; color?: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 13, color: 'var(--dim)' }}>{k}</span>
      <span className="t-title" style={{ fontSize: 26, color }}>
        {v}
      </span>
      {hint ? <span style={{ fontSize: 12.5, color: 'var(--dim)' }}>{hint}</span> : null}
    </div>
  );
}

function Tile({ k, v, hint, on }: { k: string; v: ReactNode; hint?: ReactNode; on?: boolean }) {
  return (
    <div
      className="iris-inset"
      style={{
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        background: on ? 'color-mix(in srgb, var(--accent) 14%, var(--sunk))' : undefined,
        transition: 'transform 300ms var(--ease)',
      }}
    >
      <span style={{ fontSize: 13, color: on ? '#e9c4a6' : 'var(--dim)' }}>{k}</span>
      <span className="t-title" style={{ fontSize: 24 }}>
        {v}
      </span>
      {hint ? <span style={{ fontSize: 13, color: 'var(--mut)' }}>{hint}</span> : null}
    </div>
  );
}

/** A long/short split as two bars that meet, with the shares under them. */
function SplitBar({ left, leftLabel, rightLabel }: { left: number; leftLabel: string; rightLabel: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', height: 14, gap: 3 }}>
        <div
          className="ember-grow"
          style={{ width: `${(left * 100).toFixed(1)}%`, borderRadius: 999, background: 'var(--accent)', boxShadow: '0 0 18px color-mix(in srgb, var(--accent) 45%, transparent)' }}
        />
        <div style={{ flex: 1, borderRadius: 999, background: '#3a2b20' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
        <span style={{ color: POS, fontWeight: 600 }}>{leftLabel}</span>
        <span style={{ color: 'var(--mut)' }}>{rightLabel}</span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- ETF */

/** ETF tab hero: the latest session set large, the streak, the window, and one bar per session. */
export function EtfHero({ etf }: { etf: Envelope<EtfFlowsData> }) {
  const d = etf.data;
  const sessions = [...d.sessions].reverse();
  const max = Math.max(1, ...sessions.map((s) => Math.abs(s.totalUsdM)));
  const streak =
    d.streakDirection === 'flat'
      ? 'Sesi terakhir datar'
      : `${d.streakDays} sesi ${d.streakDirection === 'inflow' ? 'uang masuk' : 'uang keluar'} berturut-turut`;
  return (
    <Panel style={{ height: '100%' }}>
      <div className="ember-halo" aria-hidden="true" style={{ top: -300, left: -220 }} />
      <div style={{ position: 'relative', zIndex: 4, padding: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 500, color: 'var(--mut)' }}>Arus bersih ETF spot, sesi {fmtDayShort(d.latestDate)}</h2>
              <MockBadge env={etf} />
            </span>
            <span
              className={`t-display${d.latestUsdM >= 0 ? ' t-accent' : ''}`}
              style={{ fontSize: 'clamp(56px, 7vw, 80px)', color: d.latestUsdM >= 0 ? 'var(--accent)' : NEG }}
            >
              {usdM(d.latestUsdM)}
            </span>
            <span style={{ fontSize: 15, color: '#e9ddd2' }}>{streak}</span>
          </div>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            <Stat k={`${d.sessions.length} sesi`} v={usdM(d.windowNetUsdM)} color={d.windowNetUsdM >= 0 ? POS : NEG} />
            <Stat k="Hari terbesar" v={usdM(d.biggestDay.totalUsdM)} hint={fmtDayShort(d.biggestDay.date)} />
            <Stat k="Sesi masuk" v={`${d.greenDays}/${d.sessions.length}`} />
          </div>
        </div>
        <div role="img" aria-label={`Arus bersih ${sessions.length} sesi`} style={{ display: 'flex', gap: 8, height: 220 }}>
          {sessions.map((s, i) => {
            const h = `${Math.max(2, (Math.abs(s.totalUsdM) / max) * 100)}%`;
            const last = i === sessions.length - 1;
            return (
              <div key={s.date} title={`${fmtDayShort(s.date)}: ${usdM(s.totalUsdM)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ height: '55%', display: 'flex', alignItems: 'flex-end' }}>
                  {s.totalUsdM >= 0 ? (
                    <div
                      style={{
                        width: '100%',
                        height: h,
                        borderRadius: '6px 6px 2px 2px',
                        background: last ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 62%, var(--panel))',
                      }}
                    />
                  ) : null}
                </div>
                <div style={{ height: 2, background: '#3a2b20' }} />
                <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start' }}>
                  {s.totalUsdM < 0 ? (
                    <div style={{ width: '100%', height: `${Math.min(100, (Math.abs(s.totalUsdM) / max) * 122)}%`, borderRadius: '2px 2px 6px 6px', background: '#6b4a35' }} />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--dim)', marginTop: -14 }}>
          {sessions.map((s) => (
            <span key={s.date} style={{ flex: 1, textAlign: 'center' }}>
              {fmtDayShort(s.date)}
            </span>
          ))}
        </div>
      </div>
      <SourceFootnote env={etf} />
    </Panel>
  );
}

/** Per-fund table: latest session, window net and share of the gross flow as a bar. */
export function EtfFunds({ etf }: { etf: Envelope<EtfFlowsData> }) {
  const d = etf.data;
  const cols = 'minmax(70px, 0.8fr) minmax(90px, 1fr) minmax(90px, 1fr) minmax(140px, 1.6fr)';
  return (
    <Panel style={{ height: '100%' }}>
      <PanelHeader title="Per fund" note={`${d.sessions.length} sesi`} right={<MockBadge env={etf} />} />
      <div style={{ position: 'relative', zIndex: 4, padding: '0 14px 12px', overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '0 12px 8px', fontSize: 13, color: 'var(--dim)', minWidth: 460 }}>
          <span>Fund</span>
          <span style={{ textAlign: 'right' }}>Sesi terakhir</span>
          <span style={{ textAlign: 'right' }}>{d.sessions.length} sesi</span>
          <span>Porsi arus</span>
        </div>
        {d.leaderboard.map((f) => (
          <div key={f.ticker} className="ember-row" style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, alignItems: 'center', padding: 12, fontSize: 15, minWidth: 460 }}>
            <b>{f.ticker}</b>
            <span style={{ textAlign: 'right', fontWeight: 600, color: f.latestUsdM > 0 ? POS : f.latestUsdM < 0 ? NEG : 'var(--mut)' }}>{usdM(f.latestUsdM)}</span>
            <span style={{ textAlign: 'right', color: '#e9ddd2' }}>{usdM(f.netUsdM)}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
                <span className="ember-grow" style={{ display: 'block', width: `${f.grossSharePct}%`, height: '100%', borderRadius: 999, background: f.netUsdM >= 0 ? 'var(--accent)' : '#8a5e40' }} />
              </span>
              <span style={{ fontSize: 13, color: 'var(--dim)', minWidth: 40, textAlign: 'right' }}>{f.grossSharePct.toFixed(0)}%</span>
            </span>
          </div>
        ))}
      </div>
      <SourceFootnote env={etf} />
    </Panel>
  );
}

/* ----------------------------------------------------------- Positioning */

/** Compact long/short card for the ETF tab's side column. */
export function LongShortMini({ positioning }: { positioning: Envelope<PositioningData> }) {
  const p = positioning.data;
  const last = p.retail[p.retail.length - 1];
  return (
    <Panel style={{ height: '100%' }}>
      <PanelHeader title="Long / short" note="Binance futures" right={<MockBadge env={positioning} />} />
      <div style={{ position: 'relative', zIndex: 4, padding: '4px 26px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span className="t-display" style={{ fontSize: 52 }}>
            {p.retailRatio.toFixed(2)}
          </span>
          <span style={{ fontSize: 15, color: 'var(--mut)' }}>long per short (retail)</span>
        </div>
        {last ? <SplitBar left={last.longShare} leftLabel={`Long ${(last.longShare * 100).toFixed(0)}%`} rightLabel={`Short ${((1 - last.longShare) * 100).toFixed(0)}%`} /> : null}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <Tile k="Top trader" v={p.topTraderRatio.toFixed(2)} />
          <Tile k="Taker beli/jual" v={p.takerBuySellRatio.toFixed(2)} />
        </div>
        <Link href="/chain/long-short" style={{ fontSize: 14, fontWeight: 600 }}>
          Buka long / short →
        </Link>
      </div>
      <SourceFootnote env={positioning} />
    </Panel>
  );
}

const BIAS_WORD = { bullish: 'Condong naik', bearish: 'Condong turun', neutral: 'Netral' } as const;

/** Long/short tab hero: the crowd's ratio set large, its split, and six readings as tiles. */
export function PositioningHero({ positioning }: { positioning: Envelope<PositioningData> }) {
  const p = positioning.data;
  const last = p.retail[p.retail.length - 1];
  const first = p.retail[0];
  return (
    <Panel>
      <div className="ember-halo" aria-hidden="true" style={{ top: -300, left: -220 }} />
      <div style={{ position: 'relative', zIndex: 4, padding: 32, display: 'flex', flexWrap: 'wrap', gap: 32 }}>
        <div style={{ flex: '1 1 340px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 500, color: 'var(--mut)' }}>Rasio long / short, semua akun Binance</h2>
            <MockBadge env={positioning} />
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
            <span className="t-display t-accent" style={{ fontSize: 'clamp(64px, 8vw, 96px)', color: 'var(--accent)' }}>
              {p.retailRatio.toFixed(2)}
            </span>
            {first ? (
              <span style={{ fontSize: 17, color: '#e9ddd2' }}>
                {last && last.ratio >= first.ratio ? 'naik' : 'turun'} dari {first.ratio.toFixed(2)} dalam {p.retail.length} jam
              </span>
            ) : null}
          </div>
          {last ? <SplitBar left={last.longShare} leftLabel={`Long ${(last.longShare * 100).toFixed(1)}%`} rightLabel={`Short ${((1 - last.longShare) * 100).toFixed(1)}%`} /> : null}
        </div>
        <div style={{ flex: '999 1 520px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <Tile k="Top trader L/S" v={p.available.topTrader ? p.topTraderRatio.toFixed(2) : '—'} hint="ditimbang ukuran posisi" />
          <Tile k="Taker beli / jual" v={p.available.taker ? p.takerBuySellRatio.toFixed(2) : '—'} hint={p.takerBuySellRatio >= 1 ? 'pembeli lebih agresif' : 'penjual lebih agresif'} />
          <Tile
            k="Selisih top vs retail"
            v={`${p.divergence >= 0 ? '+' : '−'}${Math.abs(p.divergence).toFixed(2)}`}
            hint={p.divergence >= 0 ? 'akun besar lebih long' : 'akun besar lebih short'}
          />
          <Tile k="Bacaan (opini)" v={BIAS_WORD[p.bias]} hint={p.biasReason} on={p.bias === 'bullish'} />
          <Tile
            k="Premium Coinbase"
            v={p.available.premium ? `${p.coinbasePremiumPct >= 0 ? '+' : '−'}${Math.abs(p.coinbasePremiumPct).toFixed(3)}%` : '—'}
            hint={p.coinbasePremiumPct >= 0 ? 'pembeli AS membayar lebih' : 'pembeli AS menawar lebih rendah'}
          />
          <Tile k="Spread terlebar" v={`${p.maxSpreadPct.toFixed(3)}%`} hint={`${p.venues.length} bursa dibandingkan`} />
        </div>
      </div>
      <SourceFootnote env={positioning} />
    </Panel>
  );
}

/** Spot price at each venue against Binance, as a diverging bar per venue. */
export function VenueSpreads({ positioning }: { positioning: Envelope<PositioningData> }) {
  const p = positioning.data;
  const max = Math.max(0.01, ...p.venues.map((v) => Math.abs(v.spreadPct)));
  return (
    <Panel style={{ height: '100%' }}>
      <PanelHeader title="Per bursa" note="selisih harga vs Binance" right={<MockBadge env={positioning} />} />
      <div style={{ position: 'relative', zIndex: 4, padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {p.venues.map((v) => {
          const w = `${((Math.abs(v.spreadPct) / max) * 50).toFixed(1)}%`;
          return (
            <div key={v.venue} className="ember-row" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '11px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                <span>{v.venue}</span>
                <span>
                  <b>${v.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}</b>{' '}
                  <span style={{ fontSize: 13, color: v.spreadPct >= 0 ? POS : NEG }}>
                    {v.spreadPct >= 0 ? '+' : '−'}
                    {Math.abs(v.spreadPct).toFixed(3)}%
                  </span>
                </span>
              </div>
              <div style={{ position: 'relative', height: 6, borderRadius: 999, background: 'var(--line)' }}>
                <span style={{ position: 'absolute', left: '50%', top: -3, bottom: -3, width: 2, background: '#3a2b20' }} />
                <span
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    borderRadius: 999,
                    background: v.spreadPct >= 0 ? 'var(--accent)' : '#8a5e40',
                    ...(v.spreadPct >= 0 ? { left: '50%', width: w } : { right: '50%', width: w }),
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <SourceFootnote env={positioning} />
    </Panel>
  );
}

/* ----------------------------------------------------------- Exchange flows */

/** Compact reserve card for the ETF tab's side column. */
export function ReserveMini({ flows }: { flows: Envelope<ChainFlowsData> }) {
  const f = flows.data;
  const leaving = f.netflowBtc < 0;
  return (
    <Panel style={{ height: '100%' }}>
      <PanelHeader title="Cadangan bursa" note={`${f.addressCount} alamat dilacak`} right={<MockBadge env={flows} />} />
      <div style={{ position: 'relative', zIndex: 4, padding: '4px 26px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span className="t-display" style={{ fontSize: 40 }}>
            {btc(f.trackedReserveBtc)}
          </span>
          <span style={{ fontSize: 15, fontWeight: 600, color: leaving ? POS : NEG }}>
            {leaving ? '−' : '+'}
            {btc(Math.abs(f.netflowBtc))}
          </span>
        </div>
        <span style={{ fontSize: 14, color: '#e9ddd2' }}>
          {leaving ? 'Lebih banyak BTC keluar dari bursa: biasanya untuk disimpan.' : 'Lebih banyak BTC masuk ke bursa: biasanya disiapkan untuk dijual.'}
        </span>
        <Link href="/chain/wallets" style={{ fontSize: 14, fontWeight: 600 }}>
          Buka dompet & transfer →
        </Link>
      </div>
      <SourceFootnote env={flows} />
    </Panel>
  );
}

const KIND_WORD: Record<FlowTransfer['kind'], string> = {
  EXCHANGE_INFLOW: 'Masuk bursa',
  EXCHANGE_OUTFLOW: 'Keluar bursa',
  HOT_LOADING: 'Isi hot wallet',
  COLD_STORING: 'Ke cold storage',
  INTER_EXCHANGE: 'Antar bursa',
  WALLET_TRANSFER: 'Antar dompet',
};
const ARROW = { in: 'M12 5v14M5 12l7 7 7-7', out: 'M12 19V5M5 12l7-7 7 7', move: 'M5 12h14M13 6l6 6-6 6' };

/** The largest recent transfers touching the tracked addresses, two columns of rows. */
export function LargeTransfers({ flows, limit = 8 }: { flows: Envelope<ChainFlowsData>; limit?: number }) {
  const rows = [...flows.data.transfers].sort((a, b) => b.amountBtc - a.amountBtc).slice(0, limit);
  return (
    <Panel>
      <PanelHeader title="Transfer besar" note="alamat bursa yang dilacak" right={<MockBadge env={flows} />} />
      <div style={{ position: 'relative', zIndex: 4, padding: '0 26px 14px', display: 'flex', flexWrap: 'wrap', gap: '4px 32px' }}>
        {rows.length === 0 ? <span style={{ fontSize: 14, color: 'var(--mut)', padding: '8px 0' }}>Belum ada transfer besar di jendela ini.</span> : null}
        {rows.map((t) => {
          const dir = t.kind === 'EXCHANGE_INFLOW' ? 'in' : t.kind === 'EXCHANGE_OUTFLOW' || t.kind === 'COLD_STORING' ? 'out' : 'move';
          const tone =
            t.bias === 'bullish'
              ? { bg: 'var(--accent-soft)', fg: POS }
              : t.bias === 'bearish'
                ? { bg: '#2a211b', fg: '#e8d5c4' }
                : { bg: 'var(--raise)', fg: '#c9b8aa' };
          return (
            <div key={t.txid} className="ember-row" style={{ flex: '1 1 420px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 16, padding: '13px 12px', margin: '0 -12px' }}>
              <span style={{ flex: '0 0 auto', width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: tone.bg }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={tone.fg} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={ARROW[dir]} />
                </svg>
              </span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 15 }}>
                  {t.fromLabel} → {t.toLabel}
                </span>
                <span style={{ fontSize: 13, color: 'var(--dim)' }}>
                  {KIND_WORD[t.kind]} · {t.exchange} · {t.blockTime ? fmtAgo(new Date(t.blockTime * 1000).toISOString()) : 'belum dikonfirmasi'}
                </span>
              </span>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{t.amountBtc.toLocaleString('en-US', { maximumFractionDigits: 2 })} BTC</span>
            </div>
          );
        })}
      </div>
      <SourceFootnote env={flows} />
    </Panel>
  );
}

/** Wallets tab hero: the tracked reserve set large and its cold / hot split. */
export function ReserveHero({ flows }: { flows: Envelope<ChainFlowsData> }) {
  const f = flows.data;
  const coldShare = f.trackedReserveBtc > 0 ? f.coldBtc / f.trackedReserveBtc : 0;
  return (
    <Panel style={{ height: '100%' }}>
      <div className="ember-halo" aria-hidden="true" style={{ top: -300, right: -220 }} />
      <div style={{ position: 'relative', zIndex: 4, padding: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 500, color: 'var(--mut)' }}>
            BTC di {f.addressCount} alamat dari {f.exchangeCount} bursa yang dilacak
          </h2>
          <MockBadge env={flows} />
        </span>
        <span className="t-display" style={{ fontSize: 'clamp(56px, 7vw, 84px)' }}>
          {btc(f.trackedReserveBtc)}
        </span>
        <SplitBar left={coldShare} leftLabel={`Cold ${btc(f.coldBtc)} · ${(coldShare * 100).toFixed(1)}%`} rightLabel={`Hot ${btc(f.hotBtc)}`} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <Tile k="Cold storage" v={btc(f.coldBtc)} hint="simpanan jangka panjang" />
          <Tile k="Hot wallet" v={btc(f.hotBtc)} hint="siap dipakai" />
          <Tile k="Alamat deposit" v={btc(f.depositBtc)} hint="baru masuk" />
        </div>
        <span style={{ fontSize: 13, color: 'var(--dim)' }}>Sampel alamat yang dilacak, bukan seluruh dompet bursa.</span>
      </div>
      <SourceFootnote env={flows} />
    </Panel>
  );
}

/** Net flow over the observed window: the net set large, inflow and outflow as two bars. */
export function NetflowCard({ flows }: { flows: Envelope<ChainFlowsData> }) {
  const f = flows.data;
  const max = Math.max(1, f.inflow, f.outflow);
  const leaving = f.netflowBtc < 0;
  return (
    <Panel style={{ height: '100%' }}>
      <PanelHeader title="Arus bersih" note="dari transfer terbaru yang terlihat" right={<MockBadge env={flows} />} />
      <div style={{ position: 'relative', zIndex: 4, padding: '4px 26px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className={`t-display${leaving ? ' t-accent' : ''}`} style={{ fontSize: 60, color: leaving ? 'var(--accent)' : NEG }}>
            {leaving ? '−' : '+'}
            {fmtCompact(Math.abs(f.netflowBtc), '')}
          </span>
          <span style={{ fontSize: 15, color: '#e9ddd2' }}>BTC {leaving ? 'keluar dari' : 'masuk ke'} bursa</span>
        </div>
        {(
          [
            ['Masuk', f.inflow, '#6b4a35'],
            ['Keluar', f.outflow, 'var(--accent)'],
          ] as const
        ).map(([k, v, c]) => (
          <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span style={{ color: 'var(--mut)' }}>{k}</span>
              <b>{btc(v)}</b>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
              <div className="ember-grow" style={{ width: `${(v / max) * 100}%`, height: '100%', borderRadius: 999, background: c }} />
            </div>
          </div>
        ))}
        <div style={{ padding: '14px 16px', borderRadius: 16, background: leaving ? 'color-mix(in srgb, var(--accent) 12%, var(--sunk))' : 'var(--sunk)', fontSize: 15, lineHeight: 1.5 }}>
          {leaving ? 'BTC yang keluar dari bursa biasanya dipindah ke penyimpanan.' : 'BTC yang masuk ke bursa biasanya disiapkan untuk dijual.'}
        </div>
      </div>
      <SourceFootnote env={flows} />
    </Panel>
  );
}

/** Net BTC per exchange from the observed transfers, leaving to the left, arriving to the right. */
export function ExchangeRadar({ flows }: { flows: Envelope<ChainFlowsData> }) {
  const by = new Map<string, { inn: number; out: number }>();
  for (const t of flows.data.transfers) {
    const r = by.get(t.exchange) ?? { inn: 0, out: 0 };
    if (t.kind === 'EXCHANGE_INFLOW') r.inn += t.amountBtc;
    else if (t.kind === 'EXCHANGE_OUTFLOW') r.out += t.amountBtc;
    by.set(t.exchange, r);
  }
  const rows = [...by.entries()]
    .map(([k, r]) => ({ k, net: r.inn - r.out, ...r }))
    .filter((r) => r.inn || r.out)
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.net)));
  const cols = 'minmax(100px, 1fr) minmax(0, 2fr) 110px';
  return (
    <Panel style={{ height: '100%' }}>
      <PanelHeader title="Flow radar per bursa" note="BTC bersih dari transfer terlihat" right={<MockBadge env={flows} />} />
      <div style={{ position: 'relative', zIndex: 4, padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.length === 0 ? <span style={{ fontSize: 14, color: 'var(--mut)', padding: '8px 12px' }}>Belum ada arus masuk/keluar bursa di jendela ini.</span> : null}
        {rows.map((r) => {
          const w = `${((Math.abs(r.net) / max) * 100).toFixed(1)}%`;
          return (
            <div key={r.k} className="ember-row" title={`masuk ${btc(r.inn)} · keluar ${btc(r.out)}`} style={{ display: 'grid', gridTemplateColumns: cols, gap: 14, alignItems: 'center', padding: 12 }}>
              <span style={{ fontSize: 15 }}>{r.k}</span>
              <div style={{ display: 'flex', alignItems: 'center', height: 12 }}>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                  {r.net < 0 ? <div style={{ width: w, height: 12, borderRadius: '6px 2px 2px 6px', background: 'var(--accent)' }} /> : null}
                </div>
                <div style={{ width: 2, height: 22, background: '#3a2b20' }} />
                <div style={{ flex: 1, display: 'flex' }}>
                  {r.net > 0 ? <div style={{ width: w, height: 12, borderRadius: '2px 6px 6px 2px', background: '#6b4a35' }} /> : null}
                </div>
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, textAlign: 'right' }}>
                {r.net >= 0 ? '+' : '−'}
                {fmtCompact(Math.abs(r.net), '')}
              </span>
            </div>
          );
        })}
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 14, padding: '6px 12px 0', fontSize: 12.5, color: 'var(--dim)' }}>
          <span />
          <span style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>← keluar</span>
            <span>masuk →</span>
          </span>
          <span />
        </div>
      </div>
      <SourceFootnote env={flows} />
    </Panel>
  );
}
