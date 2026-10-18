import Link from 'next/link';
import { Panel, MockBadge, PlaceholderBadge } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import {
  forecastTargetDate,
  toWeeklyForecastLabels,
  type WeeklyForecastData,
} from '@/lib/features/weeklyForecast';
import { fmtDay } from '@/lib/dates';

/**
 * The weekly model's call in one line, for the top of the Distribution tab
 * (curation 2026-10-18), so the Forecast section shows the weekly forecast and
 * its probability without a click. Details live on the WEEKLY FORECAST tab.
 */
export function WeeklyMiniCard({ forecast }: { forecast: Envelope<WeeklyForecastData> }) {
  const f = forecast.data;
  const L = toWeeklyForecastLabels(f);
  const c = f.classifier;
  const color = L.isNoSignal ? 'var(--mut)' : f.label === 'BULLISH' ? 'var(--up)' : f.label === 'BEARISH' ? 'var(--down)' : 'var(--txt)';

  return (
    <Panel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '10px 12px' }}>
        <span className="iris-micro" style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.14em', color: 'var(--mut)' }}>
          PRAKIRAAN MINGGUAN
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color }}>{L.label}</span>
        {c ? (
          <>
            <span style={{ fontSize: 11.5, color: 'var(--txt)' }}>
              untuk close <b>{fmtDay(forecastTargetDate(c.dataAsOf))}</b>
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--txt)' }}>
              Peluang sinyal ini benar: <b>{L.confidencePct || '—'}</b>
              {c.track ? <span style={{ color: 'var(--mut)' }}> (tanpa model {L.baseRatePct})</span> : null}
            </span>
          </>
        ) : (
          <span style={{ fontSize: 11.5, color: 'var(--mut)' }}>Model belum tersambung — aturan teknikal sederhana.</span>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {f.method === 'rule' ? <PlaceholderBadge /> : null}
          <MockBadge env={forecast} />
          <Link href="/forecast/weekly" style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--blue)' }}>
            DETAIL →
          </Link>
        </span>
      </div>
    </Panel>
  );
}
