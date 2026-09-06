import type { NewsArticle } from './types';
export const articleKey = (article: NewsArticle) => `${article.source}:${article.url || article.title}`;
export function compareNews(a: NewsArticle, b: NewsArticle) {
  return b.publishedAt - a.publishedAt || articleKey(a).localeCompare(articleKey(b));
}
export function newsPage(articles: NewsArticle[], cursor: string | null, limit = 400) {
  const sorted = [...articles].sort(compareNews);
  let after: [number, string] | null = null;
  if (cursor) {
    const decoded = JSON.parse(cursor);
    if (!Array.isArray(decoded) || decoded.length !== 2 || !Number.isFinite(decoded[0]) || typeof decoded[1] !== 'string') throw new Error('Invalid news cursor');
    after = [decoded[0], decoded[1]];
  }
  const eligible = after ? sorted.filter((article) => article.publishedAt < after![0] ||
    (article.publishedAt === after![0] && articleKey(article).localeCompare(after![1]) > 0)) : sorted;
  const data = eligible.slice(0, limit);
  const last = data.at(-1);
  return { data, nextCursor: eligible.length > limit && last ? JSON.stringify([last.publishedAt, articleKey(last)]) : null };
}

