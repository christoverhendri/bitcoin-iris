import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import fixture from '@/lib/sources/fixtures/semantic-news.json';
import { readSemanticNews } from '@/lib/sources/semanticNews';
import { SemanticDetails } from './SemanticDetails';

it('displays negated evidence and ranking evaluation without a bullish label', () => {
  const record = fixture.records[0];
  const semantic = readSemanticNews(record.raw_text, record.semantic_parse, record.weighting);
  const html = renderToStaticMarkup(<SemanticDetails semantic={semantic} />);
  expect(html).toContain('review required');
  expect(html).toContain('Ranking weight: 0.5000');
  expect(html).toContain('negated');
  expect(html).toContain('has not approved');
  expect(html).toContain('2026-09-07 00:00 UTC');
  expect(html).not.toContain('BULLISH');
});
