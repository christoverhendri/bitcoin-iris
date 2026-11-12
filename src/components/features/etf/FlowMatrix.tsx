import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { EtfFlowsData } from '@/lib/features/etfFlows';
import { ETF_SETTLEMENT_NOTE } from '@/lib/features/etfFlows';
import { fmtDayShort } from '@/lib/dates';

/**
 * Session × issuer as a grid of tiles, one row per fund.
 *
 * This panel exists because the net figure hides composition: a day where IBIT
 * took in $300M while GBTC bled $300M prints as zero. The tiles show rotation
 * between issuers rather than the sum of it.
 *
 * The tint is a four-step ramp on the square root of size rather than a
 * continuous gradient, so the band a tile sits in can be told apart at a glance.
 */

/** Four steps of strength. Index 0 is "present but small". */
const STEPS = [18, 38, 62, 92];
const POS = '#ffb27a';

function tint(value: number, peak: number): string {
  if (value === 0 || peak <= 0) return 'var(--sunk)';
  // Square root so a single outlier session does not wash every other tile to the bottom step.
  const step = STEPS[Math.min(STEPS.length - 1, Math.floor(Math.sqrt(Math.abs(value) / peak) * STEPS.length))];
  return value > 0 ? `color-mix(in srgb, var(--accent) ${step}%, var(--sunk))` : `color-mix(in srgb, #8a5e40 ${step}%, var(--sunk))`;
}

const short = (m: number) => {
  const a = Math.abs(m);
  return `${m >= 0 ? '+' : '−'}${a >= 100 ? a.toFixed(0) : a.toFixed(1)}`;
};
const usdM = (m: number) => {
  const a = Math.abs(m);
  return `${m >= 0 ? '+' : '−'}$${a >= 1000 ? `${(a / 1000).toFixed(2)}B` : `${a.toFixed(a < 10 ? 1 : 0)}M`}`;
};

export function FlowMatrix({ etf }: { etf: Envelope<EtfFlowsData> }) {
  const d = etf.data;
  const sessions = [...d.sessions].reverse();
  // Scale on the largest single fund-day, so one outlier does not wash every other tile out.
  const peak = Math.max(...sessions.flatMap((s) => d.funds.map((f) => Math.abs(s.byFund[f] ?? 0))), 1);
  const netPeak = Math.max(1, ...sessions.map((s) => Math.abs(s.totalUsdM)));
  const net = new Map(d.leaderboard.map((f) => [f.ticker, f.netUsdM]));
  const funds = [...d.funds].sort((a, b) => (net.get(b) ?? 0) - (net.get(a) ?? 0));
  const cols = `64px repeat(${sessions.length}, minmax(34px, 1fr)) 84px`;

  return (
    <Panel style={{ height: '100%' }}>
      <PanelHeader title="Flow matrix" note="per fund per sesi · US$ juta" right={<MockBadge env={etf} />} />
      <div style={{ position: 'relative', zIndex: 4, padding: '4px 26px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 64 + 84 + sessions.length * 40, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 6, fontSize: 12, color: 'var(--dim)' }}>
              <span>Fund</span>
              {sessions.map((s, i) => (
                <span
                  key={s.date}
                  data-tip={s.provisional ? 'Sementara: angka sesi ini bisa direvisi sumbernya' : undefined}
                  style={{ textAlign: 'center', color: i === sessions.length - 1 ? 'var(--txt)' : undefined }}
                >
                  {fmtDayShort(s.date)}
                  {s.provisional ? '*' : ''}
                </span>
              ))}
              <span style={{ textAlign: 'right' }}>Total</span>
            </div>
            {funds.map((f) => {
              const total = net.get(f) ?? 0;
              return (
                <div key={f} className="ember-row" style={{ display: 'grid', gridTemplateColumns: cols, gap: 6, alignItems: 'center', padding: '2px 0' }}>
                  <b style={{ fontSize: 14 }}>{f}</b>
                  {sessions.map((s) => {
                    const v = s.byFund[f] ?? 0;
                    const strong = Math.sqrt(Math.abs(v) / peak) >= 0.75;
                    return (
                      <span
                        key={s.date}
                        data-tip={`${f} · ${fmtDayShort(s.date)}\n${v === 0 ? 'Tidak ada arus' : usdM(v)}`}
                        style={{
                          height: 34,
                          borderRadius: 8,
                          background: tint(v, peak),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11.5,
                          fontWeight: strong ? 600 : 400,
                          color: v === 0 ? 'var(--dim)' : strong && v > 0 ? '#1a110b' : '#e9ddd2',
                        }}
                      >
                        {v === 0 ? '·' : short(v)}
                      </span>
                    );
                  })}
                  <span style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, color: total > 0 ? POS : total < 0 ? 'var(--down)' : 'var(--dim)' }}>{Math.abs(total) < 0.5 ? '—' : usdM(total)}</span>
                </div>
              );
            })}
            <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 6, alignItems: 'center', paddingTop: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--dim)' }}>Bersih</span>
              {sessions.map((s) => {
                const h = `${Math.max(4, (Math.abs(s.totalUsdM) / netPeak) * 100)}%`;
                const up = s.totalUsdM >= 0;
                return (
                  <span
                    key={s.date}
                    data-tip={`${fmtDayShort(s.date)} · bersih\n${usdM(s.totalUsdM)}\n${d.funds.filter((f) => (s.byFund[f] ?? 0) !== 0).length} fund bergerak`}
                    style={{ height: 110, display: 'flex', flexDirection: 'column', borderRadius: 8, background: 'var(--sunk)', padding: '6px 4px' }}
                  >
                    <span style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}>
                      {up ? <span style={{ width: '100%', height: h, borderRadius: '4px 4px 1px 1px', background: 'var(--accent)', boxShadow: '0 0 12px color-mix(in srgb, var(--accent) 40%, transparent)' }} /> : null}
                    </span>
                    <span style={{ height: 2, background: '#3a2b20' }} />
                    <span style={{ flex: 1, display: 'flex', alignItems: 'flex-start' }}>
                      {!up ? <span style={{ width: '100%', height: h, borderRadius: '1px 1px 4px 4px', background: '#8a5e40' }} /> : null}
                    </span>
                  </span>
                );
              })}
              <span style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, color: d.windowNetUsdM >= 0 ? POS : 'var(--down)' }}>{usdM(d.windowNetUsdM)}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 12.5, color: 'var(--dim)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Keluar</span>
            {[...STEPS].reverse().map((s) => (
              <span key={`o${s}`} style={{ width: 16, height: 10, borderRadius: 3, background: `color-mix(in srgb, #8a5e40 ${s}%, var(--sunk))` }} />
            ))}
            {STEPS.map((s) => (
              <span key={`i${s}`} style={{ width: 16, height: 10, borderRadius: 3, background: `color-mix(in srgb, var(--accent) ${s}%, var(--sunk))` }} />
            ))}
            <span>Masuk</span>
          </span>
          <span data-tip={ETF_SETTLEMENT_NOTE}>Settle T+1: baris terbaru tertinggal satu sesi</span>
        </div>
      </div>
      <SourceFootnote env={etf} />
    </Panel>
  );
}
