import { Panel, PanelHeader, MockBadge, PlaceholderBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { WeeklyForecastData } from '@/lib/features/weeklyForecast';
import { toWeeklyForecastLabels, getWeeklyForecastColor } from '@/lib/features/weeklyForecast';
import { toneVar, type Tone } from '@/lib/theme/tokens';

export interface DirectionCardProps {
  forecast: Envelope<WeeklyForecastData>;
}

function directionTone(label: string): Tone {
  if (label === 'BULLISH' || label === 'BULL') return 'up';
  if (label === 'BEARISH' || label === 'BEAR') return 'down';
  return 'mut';
}

export function DirectionCard({ forecast }: DirectionCardProps) {
  const f = forecast.data;
  const labels = toWeeklyForecastLabels(f);
  const tone = directionTone(f.label);

  const isClassifier = f.method === 'classifier';
  const clf = f.classifier;

  // p_up percentage (0-100)
  const pUpPct = clf ? clf.pUp * 100 : Math.max(0, Math.min(100, f.confidence));
  const tBearPct = clf ? clf.tBear * 100 : 23;
  const tBullPct = clf ? clf.tBull * 100 : 70;

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelHeader
        title="WEEKLY REGIME FORECAST"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {clf?.stale ? (
              <span
                className="iris-micro"
                title="Data model klasifikasi lebih tua dari 9 hari (jadwal mingguan terlewat)."
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 8.5,
                  letterSpacing: '.14em',
                  color: 'var(--down)',
                  border: '1px solid var(--down)',
                  padding: '2px 6px',
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                }}
              >
                STALE
              </span>
            ) : null}
            <MockBadge env={forecast} />
          </div>
        }
      />
      <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <div
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 800,
              fontSize: 34,
              lineHeight: 1,
              letterSpacing: '.02em',
              color: getWeeklyForecastColor(labels.label),
            }}
          >
            {labels.label}
          </div>
          {isClassifier && clf ? (
            <div
              className="iris-micro"
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9,
                letterSpacing: '.1em',
                color: 'var(--mut)',
                textAlign: 'right',
              }}
            >
              DATA AS OF: <span style={{ color: 'var(--txt)', fontWeight: 700 }}>{clf.dataAsOf}</span>
            </div>
          ) : null}
        </div>

        {/* Confidence or P(UP, 7D) Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span
              className="iris-micro"
              style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.14em', color: 'var(--mut)' }}
            >
              {isClassifier
                ? 'SKOR MODEL P(NAIK 7 HARI) — BELUM DIKALIBRASI'
                : 'MODEL CONFIDENCE'}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--txt)' }}
              >
                {labels.pUpPct}
              </span>
              {f.method === 'rule' ? <PlaceholderBadge /> : null}
            </span>
          </div>

          {/* Interactive track with t_bear & t_bull markers */}
          <div
            style={{
              position: 'relative',
              height: 10,
              background: 'var(--sunk)',
              border: '1px solid var(--line2)',
              marginTop: 2,
            }}
          >
            {/* NO SIGNAL zone highlight (two-threshold rule only) */}
            {isClassifier && !labels.isBinary ? (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${tBearPct}%`,
                  width: `${tBullPct - tBearPct}%`,
                  background: 'var(--line)',
                  opacity: 0.5,
                }}
                title="NO SIGNAL zone (t_bear to t_bull)"
              />
            ) : null}

            {/* Fill bar */}
            <div
              style={{
                height: '100%',
                width: `${Math.max(0, Math.min(100, pUpPct))}%`,
                background: toneVar(tone),
                transition: 'width 0.3s ease',
              }}
            />

            {/* Threshold markers */}
            {isClassifier && labels.isBinary ? (
              <div
                style={{
                  position: 'absolute',
                  top: -2,
                  bottom: -2,
                  left: `${tBullPct}%`,
                  width: 2,
                  background: 'var(--txt)',
                }}
                title={`threshold: ${labels.thresholdPct}`}
              />
            ) : isClassifier ? (
              <>
                <div
                  style={{
                    position: 'absolute',
                    top: -2,
                    bottom: -2,
                    left: `${tBearPct}%`,
                    width: 2,
                    background: 'var(--down)',
                  }}
                  title={`t_bear: ${tBearPct.toFixed(0)}%`}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: -2,
                    bottom: -2,
                    left: `${tBullPct}%`,
                    width: 2,
                    background: 'var(--up)',
                  }}
                  title={`t_bull: ${tBullPct.toFixed(0)}%`}
                />
              </>
            ) : null}
          </div>

          {/* Legend for threshold markers */}
          {isClassifier && labels.isBinary ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--mono)',
                fontSize: 8.5,
                color: 'var(--mut)',
                marginTop: 2,
              }}
            >
              <span style={{ color: 'var(--down)' }}>BEAR &lt; {labels.thresholdPct}</span>
              <span style={{ color: 'var(--dim)' }}>ONE THRESHOLD · FROM THE NOTEBOOK</span>
              <span style={{ color: 'var(--up)' }}>BULL ≥ {labels.thresholdPct}</span>
            </div>
          ) : isClassifier ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--mono)',
                fontSize: 8.5,
                color: 'var(--mut)',
                marginTop: 2,
              }}
            >
              <span style={{ color: 'var(--down)' }}>BEAR &lt; {labels.tBearPct}</span>
              <span style={{ color: 'var(--dim)' }}>NO SIGNAL ZONE</span>
              <span style={{ color: 'var(--up)' }}>BULL &gt; {labels.tBullPct}</span>
            </div>
          ) : null}
        </div>

        {/* Confidence = this signal's out-of-sample track record, not the raw score */}
        {isClassifier && labels.confidencePct ? (
          <div style={{ background: 'var(--sunk)', border: '1px solid var(--line)', padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span
                className="iris-micro"
                style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.14em', color: 'var(--mut)' }}
              >
                PELUANG SINYAL INI BENAR (TRACK RECORD)
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color: 'var(--txt)' }}>
                {labels.confidencePct}
              </span>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, lineHeight: 1.55, color: 'var(--mut)', marginTop: 4 }}>
              Setiap kali model memberi sinyal {clf?.signal} di data uji, sinyal itu benar{' '}
              {labels.confidencePct} kali ({labels.confidenceN} hari uji, {labels.confidenceWindow}). Tanpa
              model, arah yang sama terjadi {labels.baseRatePct} kali —{' '}
              {clf?.track && clf.track.precision > clf.track.baseRate
                ? 'jadi sinyal ini lebih sering benar daripada tebakan dasar.'
                : 'jadi sinyal ini tidak lebih baik dari tebakan dasar.'}{' '}
              Skor P(naik) di atas bukan peluang: angka itu hanya dibandingkan dengan
              ambang untuk menentukan BULL/BEAR.
            </div>
          </div>
        ) : null}

        {/* Range shown once, in FORWARD RETURN RANGE below (curation 2026-10-18). */}

        {/* Provenance note for classifier mode */}
        {isClassifier && clf ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              borderTop: '1px solid var(--line)',
              paddingTop: 8,
              fontFamily: 'var(--mono)',
              fontSize: 8.5,
              color: 'var(--mut)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>MODEL TRAIN END: <span style={{ color: 'var(--txt)' }}>{clf.modelTrainEnd}</span></span>
              <span>{labels.f1Summary}</span>
            </div>
            <div style={{ color: 'var(--dim)', marginTop: 2 }}>
              Horizon 7 hari. Label pelatihan membuang hari dengan pergerakan kecil (noise). Ambang BULL/BEAR adalah pilihan peneliti, dipilih di Validation.
            </div>
          </div>
        ) : null}
      </div>
      <SourceFootnote env={forecast} />
    </Panel>
  );
}
