import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { MacroCalendarData, MacroEventKind } from '@/lib/features/macroCalendar';
import { fmtDay } from '@/lib/dates';

const WHAT: Record<MacroEventKind, { name: string; plain: string; color: string }> = {
  FOMC: { name: 'Keputusan suku bunga The Fed (FOMC)', plain: 'naik / tahan / turun suku bunga', color: 'var(--amber)' },
  CPI: { name: 'Inflasi AS (CPI)', plain: 'kenaikan harga konsumen bulan lalu', color: 'var(--blue)' },
  NFP: { name: 'Data tenaga kerja AS (NFP)', plain: 'jumlah lapangan kerja baru dan pengangguran', color: 'var(--purple)' },
};

const daysUntil = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** The next scheduled US macro events, straight from FRED and the Fed's calendar. */
export function MacroCalendar({ cal }: { cal: Envelope<MacroCalendarData> }) {
  const d = cal.data;
  return (
    <Panel>
      <PanelHeader title="JADWAL MAKRO AS" note="dari FRED & federalreserve.gov" right={<MockBadge env={cal} />} />
      <p style={{ margin: 0, padding: '4px 26px 0', fontSize: 15, lineHeight: 1.55, color: '#e9ddd2' }}>
        Jadwal rilis yang sering menggerakkan harga BTC. Tanggal diambil otomatis dari penerbitnya (FRED untuk CPI dan NFP, situs
        The Fed untuk FOMC); tidak ada tanggal yang diketik manual.
      </p>
      <div style={{ padding: '8px 12px 10px' }}>
        {d.upcoming.map((e) => {
          const n = daysUntil(d.today, e.date);
          return (
            <div
              key={`${e.kind}-${e.date}`}
              style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--line)' }}
            >
              <span style={{ fontSize: 12, color: WHAT[e.kind].color, width: 40 }}>{e.kind}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                {WHAT[e.kind].name}
                {e.sep ? <span style={{ color: 'var(--dim)' }}> · + proyeksi ekonomi</span> : null}
                <span style={{ display: 'block', fontSize: 12, color: 'var(--dim)' }}>{WHAT[e.kind].plain}</span>
              </span>
              <span style={{ fontSize: 12, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {fmtDay(e.date)}
                <span style={{ display: 'block', fontSize: 12, color: n <= 7 ? 'var(--amber)' : 'var(--dim)' }}>
                  {n === 0 ? 'HARI INI' : `${n} hari lagi`}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      {d.missing.length ? (
        <div style={{ padding: '0 12px 8px', fontSize: 12, color: 'var(--amber)' }}>
          Tidak tersedia saat ini: {d.missing.join(', ')} (sumbernya gagal dibaca) — jadwalnya tidak ditampilkan, bukan ditebak.
        </div>
      ) : null}
      <SourceFootnote env={cal} />
    </Panel>
  );
}
