'use client';

import { useQueryState } from 'nuqs';
import { EVENT_CATEGORIES } from '@/lib/geo/classify';
import type { EventCategory } from '@/lib/features/geopoliticalEvents';
import { CATEGORY_COLOR } from '@/lib/features/geopoliticalEvents/present';
import { softCase } from '@/lib/softCase';

/**
 * Category layer filter. State lives in `?cats=` (comma-joined list, or `ALL`)
 * so the server component re-reads it and re-filters. Toggling a chip while
 * `ALL` is active narrows to just that chip; clearing the last chip returns to
 * `ALL`.
 */
export function EventLayerToggle() {
  const [cats, setCats] = useQueryState('cats', {
    defaultValue: 'ALL',
    clearOnDefault: true,
    shallow: false,
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
    <button key={label} type="button" onClick={onClick} aria-pressed={on} className="chip">
      {color ? (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: color,
            display: 'inline-block',
            opacity: on ? 1 : 0.45,
          }}
        />
      ) : null}
      {softCase(label)}
    </button>
  );

  return (
    <div
      role="group"
      aria-label="Event layers"
      style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
    >
      {chip('ALL', active === null, null, () => setCats('ALL'))}
      {EVENT_CATEGORIES.map((c) =>
        chip(c.replace('_', ' '), active !== null && active.has(c), CATEGORY_COLOR[c], () => toggle(c)),
      )}
    </div>
  );
}
