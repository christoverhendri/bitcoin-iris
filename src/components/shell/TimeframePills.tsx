'use client';

import { useQueryState } from 'nuqs';
import { usePathname } from 'next/navigation';
import {
  DEFAULT_HORIZON,
  DEFAULT_TIMEFRAME,
  FORECAST_HORIZONS,
  TIMEFRAMES,
  sectionFromPath,
} from '@/lib/nav';

/**
 * The pill row above the page body. It carries one of two different things
 * depending on where you are, and the distinction matters:
 *
 *   TIMEFRAME (`?tf=`)  how far BACK to pull candles — price and market pages
 *   HORIZON   (`?h=`)   how far FORWARD to simulate — the distribution pages
 *
 * They share a look because they are the same gesture, but they are not the same
 * quantity, so they live on separate query keys and separate constants. A page
 * could carry both without either clobbering the other.
 *
 * Either way the value lives in the URL rather than component state, so it is
 * shareable and — the actual point — readable by the server components that
 * fetch. The original HTML's pills were decorative and changed nothing.
 */

/** Only the pages that genuinely re-fetch on `?h=` get horizon pills. */
const HORIZON_SUBS = new Set(['distribution', 'calibration']);

export function TimeframePills() {
  const pathname = usePathname();
  const section = sectionFromPath(pathname);
  const sub = pathname.split('/').filter(Boolean)[1];

  // Both hooks run unconditionally — which row renders is decided below.
  const [tf, setTf] = useQueryState('tf', {
    defaultValue: DEFAULT_TIMEFRAME,
    clearOnDefault: true,
    shallow: false,
  });
  const [horizon, setHorizon] = useQueryState('h', {
    defaultValue: DEFAULT_HORIZON,
    clearOnDefault: true,
    shallow: false,
  });

  const showHorizon = section?.key === 'forecast' && HORIZON_SUBS.has(sub ?? '');
  const showTimeframe = section && ['overview', 'market'].includes(section.key);

  if (!showHorizon && !showTimeframe) return null;

  const options: readonly string[] = showHorizon ? FORECAST_HORIZONS : TIMEFRAMES;
  const current = showHorizon ? horizon : tf;
  const set = showHorizon ? setHorizon : setTf;

  return (
    <div
      role="group"
      aria-label={showHorizon ? 'Forecast horizon' : 'Timeframe'}
      style={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}
    >
      {showHorizon ? (
        <span
          className="iris-micro"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 8,
            letterSpacing: '.16em',
            color: 'var(--dim)',
            marginRight: 4,
          }}
        >
          HORIZON
        </span>
      ) : null}

      {options.map((t) => {
        const active = t === current;
        return (
          <button
            key={t}
            type="button"
            className="pill-btn iris-micro"
            aria-pressed={active}
            onClick={() => set(t)}
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 9,
              letterSpacing: '.12em',
              padding: '5px 8px',
              border: '1px solid var(--line2)',
              background: active ? '#1b2430' : 'transparent',
              color: active ? 'var(--txt)' : 'var(--mut)',
            }}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}
