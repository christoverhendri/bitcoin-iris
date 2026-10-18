import 'server-only';
import { getCryptoNews } from '@/lib/sources/rss';
import { getWatcherGuruNews } from '@/lib/sources/watcherGuru';
import { analyzeHeadlines } from './client';

const LIMIT = 40;

/**
 * The same 40 latest headline inputs feed both panels: crypto RSS feeds plus
 * Watcher.Guru posts from the news pipeline snapshot, merged newest first.
 * Dates/source stay intact.
 */
export async function getAnalyzedCryptoNews() {
  const [rss, watcher] = await Promise.all([getCryptoNews(LIMIT), getWatcherGuruNews()]);
  const seen = new Set<string>();
  const items = [...rss, ...watcher]
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .filter((it) => {
      const k = it.title.toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, LIMIT);
  const assessments = await analyzeHeadlines(items.map((it) => it.title));
  return items.map((item, i) => ({ ...item, assessment: assessments[i] }));
}
