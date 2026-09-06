import { NextResponse, type NextRequest } from 'next/server';
import { SECTION_BY_KEY, SUB_COOKIE, type SectionKey } from '@/lib/nav';

/**
 * Reproduces the original terminal's per-section sub-tab memory.
 *
 * The rail links to bare section paths (`/market`). This rewrites those to the
 * sub-tab the visitor last used in that section, falling back to the section's
 * first tab. Doing it here rather than with a client redirect means no flash and
 * no double render, and the sub-tab pages stay individually deep-linkable.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const segments = pathname.split('/').filter(Boolean);

  // Only bare section paths are rewritten; anything deeper is already resolved.
  if (segments.length !== 1) return NextResponse.next();

  const section = SECTION_BY_KEY.get(segments[0] as SectionKey);
  if (!section) return NextResponse.next();

  // Overview's only tab lives at the section root — nothing to rewrite.
  const firstSlug = section.subs[0]?.slug;
  if (!firstSlug) return NextResponse.next();

  const remembered = readRemembered(req)[section.key];
  const slug = section.subs.some((s) => s.slug === remembered) ? remembered! : firstSlug;

  const url = req.nextUrl.clone();
  url.pathname = `/${section.key}/${slug}`;
  url.search = search;
  return NextResponse.rewrite(url);
}

function readRemembered(req: NextRequest): Partial<Record<SectionKey, string>> {
  const raw = req.cookies.get(SUB_COOKIE)?.value;
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Partial<Record<SectionKey, string>>;
    }
  } catch {
    // A corrupt cookie just means no memory, not an error page.
  }
  return {};
}

export const config = {
  matcher: ['/market', '/quant', '/forecast', '/chain', '/macro', '/research'],
};
