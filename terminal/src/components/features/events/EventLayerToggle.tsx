'use client';

import { useQueryState } from 'nuqs';
import { EVENT_CATEGORIES } from '@/lib/geo/classify';
import type { EventCategory } from '@/lib/features/geopoliticalEvents';
import { CATEGORY_COLOR } from '@/lib/features/geopoliticalEvents/present';

/**
 * Category layer filter. State lives in `?cats=` (comma-joined list, or `ALL`)
 * and filters the already-loaded events locally. Toggling a chip while
 * `ALL` is active narrows to just that chip; clearing the last chip returns to
 * `ALL`.
 */
export function EventLayerToggle() {
  const [cats, setCats] = useQueryState('cats', {
    defaultValue: 'ALL',
    clearOnDefault: true,
    shallow: true,
  });

  const active: Set<EventCategory> | null =
    !cats || cats === 'ALL' ? null : new Set(cats.split(',').filter(Boolean) as EventCategory[]);

  function toggle(cat: EventCategory) {
    const next = new Set(active ?? []);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    if (next.size === 0 || next.size === EVENT_CATEGORIES.length) {
      setCats('ALL');
      return;
    }
    setCats(EVENT_CATEGORIES.filter((c) => next.has(c)).join(','));
  }

  const chip = (label: string, on: boolean, color: string | null, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="pill-btn iris-micro"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        fontFamily: 'var(--mono)',
        fontSize: 9,
        letterSpacing: '.12em',
        padding: '5px 8px',
        border: '1px solid var(--line2)',
        background: on ? '#1b2430' : 'transparent',
        color: on ? 'var(--txt)' : 'var(--mut)',
      }}
    >
      {color ? (
        <span
          style={{
            width: 7,
            height: 7,
            background: color,
            display: 'inline-block',
            opacity: on ? 1 : 0.45,
          }}
        />
      ) : null}
      {label}
    </button>
  );

  return (
    <div
      role="group"
      aria-label="Event layers"
      style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}
    >
      {chip('ALL', active === null, null, () => setCats('ALL'))}
      {EVENT_CATEGORIES.map((c) =>
        chip(c.replace('_', ' '), active !== null && active.has(c), CATEGORY_COLOR[c], () => toggle(c)),
      )}
    </div>
  );
}
