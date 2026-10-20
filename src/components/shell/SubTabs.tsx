'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { SUB_COOKIE, sectionFromPath, subHref } from '@/lib/nav';
import { softCase } from '@/lib/softCase';

/**
 * Sub-tab strip. Each tab is a real route, so tabs are deep-linkable and the
 * server can render the page directly.
 *
 * The effect mirrors the current sub into a cookie, which `middleware.ts` reads
 * to reproduce the original's per-section memory: leave Market on TECHNICALS,
 * come back later, land on TECHNICALS again.
 */
export function SubTabs() {
  const pathname = usePathname();
  const section = sectionFromPath(pathname);
  const segments = pathname.split('/').filter(Boolean);
  const currentSlug = segments[1] ?? null;

  useEffect(() => {
    if (!section) return;
    let map: Record<string, string> = {};
    try {
      const raw = document.cookie
        .split('; ')
        .find((c) => c.startsWith(`${SUB_COOKIE}=`))
        ?.slice(SUB_COOKIE.length + 1);
      if (raw) map = JSON.parse(decodeURIComponent(raw));
    } catch {
      // A corrupt cookie is not worth an error; start a fresh map.
      map = {};
    }
    if (currentSlug) map[section.key] = currentSlug;
    else delete map[section.key];
    document.cookie = `${SUB_COOKIE}=${encodeURIComponent(JSON.stringify(map))}; path=/; max-age=31536000; samesite=lax`;
  }, [section, currentSlug]);

  // A section with a single view (Overview, Global Sentiment) has nothing to switch between.
  if (!section || section.subs.length <= 1) return null;

  return (
    <div role="tablist" aria-label={`${section.title} views`} className="seg">
      {section.subs.map((sub) => {
        const active = (sub.slug ?? null) === currentSlug;
        return (
          <Link
            key={sub.label}
            href={subHref(section, sub)}
            role="tab"
            aria-selected={active}
            className="seg-btn"
          >
            {softCase(sub.label)}
          </Link>
        );
      })}
    </div>
  );
}
