import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { clean, loadBaseline } from '../baseline.mjs';

const baseline = loadBaseline();

test('clean mirrors the Python baseline cleaning rules', () => {
  assert.equal(clean('  BREAKING: BTC rises https://example.test @user  '), 'BTC rises');
  assert.equal(clean('JUST ANNOUNCED: Café naik'), 'Café naik');
});

test('predict is deterministic and matches frozen sklearn probabilities', () => {
  const result = baseline.predict('Bitcoin is GREAT!');
  assert.equal(result.sentiment, 'neutral');
  assert.equal(result.model_id, 'tfidf-logreg-d0d85bc862b5');
  assert.deepEqual(result.probabilities, {
    negative: 0.0067845791834744845,
    neutral: 0.9816534880175616,
    positive: 0.011561932798963793,
  });
  assert.equal(result.needs_review, true);
});

test('needs_review includes parser uncertainty and multiple assets', () => {
  assert.equal(baseline.predict('Bitcoin rises as Ethereum falls').needs_review, true);
  assert.equal(baseline.predict('Bitcoin can protect savings from inflation.').needs_review, true);
  assert.equal(baseline.predict('plain neutral text').needs_review, true);
});

const reviewFixtures = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'review-parity.json'), 'utf8'));
test('synthetic review parity fixtures retain core.classify review semantics', () => {
  for (const fixture of reviewFixtures) assert.equal(baseline.predict(fixture.text).needs_review, fixture.needs_review, fixture.text);
});

test('empty input after cleaning is rejected', () => {
  assert.throws(() => baseline.predict('https://example.test @user'), /must not be empty/);
});

test('unknown tokens never read inherited JavaScript object properties', () => {
  const result = baseline.predict('constructor __proto__ toString');
  assert.equal(Object.values(result.probabilities).every(Number.isFinite), true);
});
