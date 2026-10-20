'use client';

import { useQueryState } from 'nuqs';
import { usePathname } from 'next/navigation';
import { DEFAULT_TIMEFRAME, TIMEFRAMES, sectionFromPath } from '@/lib/nav';

/**
 * The timeframe pill row above the page body (`?tf=`: how far BACK to pull
 * candles), on the pages whose charts re-fetch by it — today only Overview.
 *
 * The value lives in the URL rather than component state, so it is shareable
 * and — the actual point — readable by the server components that fetch.
 *
 * The forward-horizon pills (`?h=`) went with the Distribution tab on
 * 2026-10-19; the 30-day forecast has a fixed horizon.
 */
export function TimeframePills() {
  const pathname = usePathname();
  const section = sectionFromPath(pathname);
  const [tf, setTf] = useQueryState('tf', {
    defaultValue: DEFAULT_TIMEFRAME,
    clearOnDefault: true,
    shallow: false,
  });

  if (!section || section.key !== 'overview') return null;

  return (
    <div role="group" aria-label="Timeframe" className="seg">
      {TIMEFRAMES.map((t) => (
        <button
          key={t}
          type="button"
          className="seg-btn"
          aria-pressed={t === tf}
          onClick={() => setTf(t)}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
