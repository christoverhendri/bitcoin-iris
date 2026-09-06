'use client';

import { useQueryState } from 'nuqs';
import { usePathname } from 'next/navigation';
import { COUNTRIES, DEFAULT_COUNTRY, sectionFromPath } from '@/lib/nav';

/** Country row, rendered only for sections declaring `scope: 'country'` (Macro). */
export function CountryScopeTabs() {
  const pathname = usePathname();
  const section = sectionFromPath(pathname);
  const [country, setCountry] = useQueryState('country', {
    defaultValue: DEFAULT_COUNTRY,
    clearOnDefault: true,
    shallow: false,
  });

  if (section?.scope !== 'country') return null;

  return (
    <div
      role="tablist"
      aria-label="Country"
      style={{
        display: 'flex',
        gap: 2,
        flexWrap: 'wrap',
        borderBottom: '1px solid var(--line)',
        background: 'var(--sunk)',
        padding: '0 16px',
        flexShrink: 0,
      }}
    >
      {COUNTRIES.map((c) => {
        const active = c.code === country;
        return (
          <button
            key={c.code}
            type="button"
            role="tab"
            aria-selected={active}
            title={c.label}
            className="tab-btn iris-micro"
            onClick={() => setCountry(c.code)}
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 9.5,
              letterSpacing: '.14em',
              padding: '8px 12px',
              color: active ? 'var(--txt)' : 'var(--mut)',
              borderBottom: `2px solid ${active ? 'var(--blue)' : 'transparent'}`,
            }}
          >
            {c.code}
          </button>
        );
      })}
    </div>
  );
}
