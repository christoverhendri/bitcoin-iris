import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { applySentimentScope, parseNews } from './parser.mjs';

const parity = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'tests/python-parity.json'), 'utf8'));
const edgeParity = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'tests/python-edge-parity.json'), 'utf8'));
test('matches V1 and V3 scope decisions for challenge and regression fixtures', () => {
    for (const row of parity) {
      const parsed = parseNews(row.text);
      const scoped = applySentimentScope({
        raw_text: row.text,
        sentiment: 'neutral',
        label_basis: 'synthetic',
        review_reasons: [],
        needs_review: false,
        semantic_parse: parsed,
      });
      assert.deepEqual(JSON.parse(JSON.stringify(parsed)), row.parse, row.id);
      assert.deepEqual(JSON.parse(JSON.stringify(scoped)), row.v3, row.id);
    }
  });

test('matches frozen Python on Unicode, URL, negation, event, and decimal edges', () => {
  for (const row of edgeParity) {
    const parsed = parseNews(row.text);
    const scoped = applySentimentScope({ raw_text: row.text, sentiment: 'neutral', label_basis: 'synthetic', review_reasons: [], needs_review: false, semantic_parse: parsed });
    assert.deepEqual(JSON.parse(JSON.stringify(parsed)), row.parse, row.id);
    assert.deepEqual(JSON.parse(JSON.stringify(scoped)), row.v3, row.id);
  }
});

test('preserves Unicode codepoint offsets while masking URLs', () => {
    const text = '🚀 Bitcoin rises 10.5% today https://example.test/x.ª';
    const parsed = parseNews(text);
    assert.equal(parsed.offset_basis, 'raw_text_unicode_codepoints');
    assert.deepEqual(parsed.entities[0], { text: 'Bitcoin', start: 2, end: 9, canonical: 'bitcoin', kind: 'asset', basis: 'alias_dictionary' });
    assert.deepEqual(parsed.quantities[0], { text: '10.5%', value: '10.5', start: 16, end: 21, unit: '%', currency_symbol: null, basis: 'explicit_text', event_role: null });
    assert.equal(parsed.ignored_spans[0].text, 'https://example.test/x.ª');
    assert.equal(parsed.events[0].trigger.text, 'rises');
});
