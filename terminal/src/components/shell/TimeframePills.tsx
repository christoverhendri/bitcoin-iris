'use client';

import { useQueryState } from 'nuqs';
import { usePathname } from 'next/navigation';
import { DEFAULT_TIMEFRAME, TIMEFRAMES, sectionFromPath } from '@/lib/nav';

/**
 * Timeframe selector. Lives in the URL (`?tf=1Y`) rather than component state so
 * it is shareable and, more importantly, readable by the server components that
 * fetch the series — the original's pills were decorative and changed nothing.
 */
export function TimeframePills() {
  const pathname = usePathname();
  const section = sectionFromPath(pathname);
  const [tf, setTf] = useQueryState('tf', {
    defaultValue: DEFAULT_TIMEFRAME,
    clearOnDefault: true,
    shallow: false,
  });

  // Only price-series pages have a meaningful timeframe.
  // Only pages that actually re-fetch on `?tf=` show the pills.
  const relevant = section && ['overview', 'market'].includes(section.key);
  if (!relevant) return null;

  return (
    <div
      role="group"
      aria-label="Timeframe"
      style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}
    >
      {TIMEFRAMES.map((t) => {
        const active = t === tf;
        return (
          <button
            key={t}
            type="button"
            className="pill-btn iris-micro"
            aria-pressed={active}
            onClick={() => setTf(t)}
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 9,
              letterSpacing: '.12em',
              padding: '5px 8px',
              border: '1px solid var(--line2)',
              background: active ? '#183a60' : 'transparent',
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
