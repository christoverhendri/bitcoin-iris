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
                ? 'P(UP, 7D) — KELUARAN MODEL, BELUM DIKALIBRASI'
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
                CONFIDENCE · TRACK RECORD
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color: 'var(--txt)' }}>
                {labels.confidencePct}
              </span>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, lineHeight: 1.55, color: 'var(--mut)', marginTop: 4 }}>
              Past {clf?.signal} calls were right {labels.confidencePct} of the time ({labels.confidenceN}{' '}
              test days, {labels.confidenceWindow}). Without the model, that direction happened{' '}
              {labels.baseRatePct} of the time. Only days followed by a meaningful 7-day move are
              counted, and their 7-day windows overlap, so there are fewer independent weeks than days.
            </div>
          </div>
        ) : null}

        {/* Range Section (Volatility Band) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--line)' }}>
          <div style={{ background: 'var(--sunk)', padding: '9px 12px' }}>
            <div
              className="iris-micro"
              style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.12em', color: 'var(--mut)' }}
            >
              RANGE LOW
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--down)', marginTop: 3 }}>
              {labels.minRange}
            </div>
          </div>
          <div style={{ background: 'var(--sunk)', padding: '9px 12px' }}>
            <div
              className="iris-micro"
              style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.12em', color: 'var(--mut)' }}
            >
              RANGE HIGH
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--up)', marginTop: 3 }}>
              {labels.maxRange}
            </div>
          </div>
        </div>

        {/* Volatility note */}
        <div
          className="iris-micro"
          style={{ fontFamily: 'var(--mono)', fontSize: 8.5, color: 'var(--dim)', lineHeight: 1.3 }}
        >
          VOLATILITY BAND — realized vol 30d, 7d horizon. Bukan prediksi arah/besaran.
        </div>

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
