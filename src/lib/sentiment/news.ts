import 'server-only';
import { getCryptoNews } from '@/lib/sources/rss';
import { analyzeHeadlines } from './client';

/** The same 40 latest headline inputs feed both panels. RSS dates/source stay intact. */
export async function getAnalyzedCryptoNews() {
  const items = (await getCryptoNews(40)).slice(0, 40);
  const assessments = await analyzeHeadlines(items.map((it) => it.title));
  return items.map((item, i) => ({ ...item, assessment: assessments[i] }));
}
