import { redirect } from 'next/navigation';
import { SECTION_BY_KEY, defaultSubHref } from '@/lib/nav';

/**
 * Middleware normally rewrites this path to the remembered sub-tab. This is
 * the fallback for requests that bypass it (direct fetch, prefetch edge cases).
 */
export default function Page() {
  redirect(defaultSubHref(SECTION_BY_KEY.get('macro')!));
}
