import { expect, it } from 'vitest';
import { newsPage } from './paging';
import type { NewsArticle } from './types';
it('pages through identical timestamps without skipping stories', () => {
  const items = ['c', 'a', 'b'].map((title) => ({ title, source: 'Test', publishedAt: 100, url: `https://example.com/${title}` } as NewsArticle));
  const first = newsPage(items, null, 2);
  const second = newsPage(items, first.nextCursor, 2);
  expect([...first.data, ...second.data].map((a) => a.title)).toEqual(['a', 'b', 'c']);
  expect(second.nextCursor).toBeNull();
  expect(() => newsPage(items, 'bad')).toThrow();
});
