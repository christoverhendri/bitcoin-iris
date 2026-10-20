import { Panel, MockBadge, PlaceholderBadge, StaleBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { WeeklyForecastData } from '@/lib/features/weeklyForecast';
import { forecastTargetDate, toWeeklyForecastLabels } from '@/lib/features/weeklyForecast';
import { fmtDay } from '@/lib/dates';
import { softCase } from '@/lib/softCase';

export interface DirectionCardProps {
  forecast: Envelope<WeeklyForecastData>;
}

const fmtK = (n: number) => `$${(n / 1000).toFixed(1)}k`;

/**
 * The weekly call as the Forecast page's hero: the label set large, the model
 * score against its threshold, the signal's track record against the base
 * rate, and the likely range. All of it is the worker's classifier output
 * (`clf_signals`), or the candle rule when no signal has been published.
 */
export function DirectionCard({ forecast }: DirectionCardProps) {
  const f = forecast.data;
  const labels = toWeeklyForecastLabels(f);
  const clf = f.classifier;
  const isClassifier = f.method === 'classifier' && !!clf;
  const bull = f.label === 'BULLISH';
  const bear = f.label === 'BEARISH';

  const pUpPct = clf ? clf.pUp * 100 : Math.max(0, Math.min(100, f.confidence));
  const tBearPct = clf ? clf.tBear * 100 : 0;
  const tBullPct = clf ? clf.tBull * 100 : 0;
  const target = clf ? forecastTargetDate(clf.dataAsOf) : '';
  const beatsBase = !!clf?.track && clf.track.precision > clf.track.baseRate;

  return (
    <Panel>
      <div className="ember-halo" aria-hidden="true" style={{ top: -280, right: -200 }} />
      <div style={{ position: 'relative', zIndex: 4, padding: 32, display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 500, color: 'var(--mut)' }}>
            {isClassifier && target ? `7 hari ke depan · sampai close ${fmtDay(target)}` : '7 hari ke depan'}
          </h2>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {clf ? <span style={{ fontSize: 13, color: 'var(--dim)' }}>Data per {fmtDay(clf.dataAsOf)}</span> : null}
            {clf?.stale ? <StaleBadge ageSec={null} title="Sinyal model lebih tua dari 9 hari (jadwal mingguan terlewat)." /> : null}
            {f.method === 'rule' ? <PlaceholderBadge /> : null}
            <MockBadge env={forecast} />
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
          <span
            className={`t-display${bull ? ' t-accent' : ''}`}
            style={{ fontSize: 'clamp(64px, 8vw, 104px)', lineHeight: 0.85, color: bull ? 'var(--accent)' : bear ? 'var(--down)' : 'var(--txt)' }}
          >
            {softCase(labels.label)}
          </span>
          <div style={{ display: 'flex', gap: 36 }}>
            {labels.confidencePct ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} title="Presisi sinyal ini di data uji (track record), bukan skor mentah model.">
                <span style={{ fontSize: 13, color: 'var(--dim)' }}>Sinyal ini benar</span>
                <span className="t-title" style={{ fontSize: 32 }}>
                  {labels.confidencePct}
                </span>
              </div>
            ) : null}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} title="Skor model, belum dikalibrasi: hanya dibandingkan dengan ambang.">
              <span style={{ fontSize: 13, color: 'var(--dim)' }}>{isClassifier ? 'Skor P(naik)' : 'Kekuatan aturan'}</span>
              <span className="t-title" style={{ fontSize: 32 }}>
                {labels.pUpPct}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ position: 'relative', height: 14, borderRadius: 999, background: 'var(--line)' }}>
            {isClassifier && !labels.isBinary ? (
              <div
                title="Zona tanpa sinyal (t_bear sampai t_bull)"
                style={{ position: 'absolute', top: 0, bottom: 0, left: `${tBearPct}%`, width: `${tBullPct - tBearPct}%`, background: '#3a2b20' }}
              />
            ) : null}
            <div
              className="ember-grow"
              style={{
                height: '100%',
                width: `${Math.max(2, Math.min(100, pUpPct))}%`,
                borderRadius: 999,
                background: bull ? 'var(--accent)' : '#8a5e40',
                boxShadow: bull ? '0 0 20px color-mix(in srgb, var(--accent) 50%, transparent)' : undefined,
              }}
            />
            {isClassifier ? (
              labels.isBinary ? (
                <span style={{ position: 'absolute', top: -5, bottom: -5, left: `${tBullPct}%`, width: 3, marginLeft: -1.5, borderRadius: 2, background: 'var(--txt)' }} title={`Ambang ${labels.thresholdPct}`} />
              ) : (
                <>
                  <span style={{ position: 'absolute', top: -5, bottom: -5, left: `${tBearPct}%`, width: 3, marginLeft: -1.5, borderRadius: 2, background: 'var(--down)' }} title={`t_bear ${labels.tBearPct}`} />
                  <span style={{ position: 'absolute', top: -5, bottom: -5, left: `${tBullPct}%`, width: 3, marginLeft: -1.5, borderRadius: 2, background: 'var(--txt)' }} title={`t_bull ${labels.tBullPct}`} />
                </>
              )
            ) : null}
          </div>
          {isClassifier ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span style={{ color: 'var(--down)' }}>Bear di bawah {labels.isBinary ? labels.thresholdPct : labels.tBearPct}</span>
              <span style={{ color: 'var(--dim)' }}>{labels.isBinary ? 'Satu ambang, dari notebook' : 'Zona tanpa sinyal'}</span>
              <span style={{ color: '#ffb27a', fontWeight: 600 }}>Bull dari {labels.isBinary ? labels.thresholdPct : labels.tBullPct}</span>
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <div className="iris-inset" style={{ flex: '1 1 180px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, color: 'var(--dim)' }}>Kisaran wajar</span>
            <span style={{ fontSize: 20, fontWeight: 600 }}>
              {fmtK(f.range.min)} – {fmtK(f.range.max)}
            </span>
          </div>
          {clf?.track ? (
            <div className="iris-inset" style={{ flex: '1 1 180px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--dim)' }}>Tebakan dasar</span>
              <span style={{ fontSize: 20, fontWeight: 600 }}>
                {labels.baseRatePct} <span style={{ fontSize: 14, color: beatsBase ? '#ffb27a' : 'var(--down)' }}>{beatsBase ? 'dikalahkan' : 'tidak dikalahkan'}</span>
              </span>
            </div>
          ) : null}
          {clf ? (
            <div className="iris-inset" style={{ flex: '1 1 180px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--dim)' }}>Model dilatih sampai</span>
              <span style={{ fontSize: 20, fontWeight: 600 }}>{fmtDay(clf.modelTrainEnd)}</span>
            </div>
          ) : null}
        </div>

        {isClassifier && labels.confidencePct ? (
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: '#e9ddd2' }} title={labels.f1Summary}>
            Setiap kali model memberi sinyal {clf?.signal} di data uji, sinyal itu benar {labels.confidencePct} kali ({labels.confidenceN} sinyal di data uji,{' '}
            {labels.confidenceWindow}). Tanpa model, arah yang sama terjadi {labels.baseRatePct} kali, jadi sinyal ini{' '}
            {beatsBase ? 'lebih sering benar daripada tebakan dasar' : 'tidak lebih baik dari tebakan dasar'}. Skor P(naik) bukan peluang: angka itu hanya dibandingkan
            dengan ambang.
          </p>
        ) : null}
      </div>
      <SourceFootnote env={forecast} />
    </Panel>
  );
}
