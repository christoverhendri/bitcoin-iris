import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { Scheduler, QueueFullError, QueueTimeoutError } from '../scheduler.mjs';

const make = (options = {}) => new Scheduler({ infer: async (texts) => texts.map((text) => ({ text })),
  fingerprint: 'model+tokenizer+parser+baseline', ...options });

test('overlapping concurrent requests deduplicate per text while retaining caller order', async () => {
  let running = 0, peak = 0;
  const seen = [];
  const scheduler = make({ batchSize: 2, infer: async (texts) => {
    peak = Math.max(peak, ++running); seen.push(...texts);
    await delay(5); running--;
    return texts.map((text) => ({ text, nested: { label: 'positive' } }));
  } });
  const results = await Promise.all(Array.from({ length: 32 }, (_, index) =>
    scheduler.predictMany(index % 2 ? ['b', 'c', 'a'] : ['a', 'b', 'a'])));
  assert.deepEqual(seen.sort(), ['a', 'b', 'c']);
  assert.equal(peak, 1);
  assert.deepEqual(results[0].map((row) => row.text), ['a', 'b', 'a']);
  assert.deepEqual(results[1].map((row) => row.text), ['b', 'c', 'a']);
  results[0][0].nested.label = 'negative';
  assert.equal((await scheduler.predictMany(['a']))[0].nested.label, 'positive');
  assert.equal(scheduler.stats().completed, 3);
  assert.equal(scheduler.stats().pending, 0);
  scheduler.close();
});

test('limits active batches when concurrency is increased', async () => {
  let running = 0, peak = 0;
  const scheduler = make({ concurrency: 2, batchSize: 1, infer: async (texts) => {
    peak = Math.max(peak, ++running); await delay(5); running--; return texts;
  } });
  await scheduler.predictMany(['a', 'b', 'c', 'd', 'e']);
  assert.equal(peak, 2);
  assert.equal(scheduler.stats().max_active, 2);
  scheduler.close();
});

test('cache is bounded, expires and isolates versions', async () => {
  let now = 0;
  const scheduler = make({ cacheSize: 2, ttlMs: 100, clock: () => now });
  await scheduler.predictMany(['a', 'b']);
  await scheduler.predictMany(['a']);
  await scheduler.predictMany(['c']);
  assert.equal(scheduler.cache.has(scheduler.key('b')), false);
  now = 101;
  await scheduler.predictMany(['a']);
  assert.equal(scheduler.stats().completed, 4);
  const other = make({ fingerprint: 'new-parser' });
  assert.notEqual(other.key('a'), scheduler.key('a'));
  scheduler.close(); other.close();
});

test('full queue admits joins, rejects new requests atomically and recovers', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const scheduler = make({ batchSize: 1, maxQueue: 2, infer: async (texts) => { await gate; return texts; } });
  const first = scheduler.predictMany(['a', 'b']);
  const joined = scheduler.predictMany(['a']);
  await assert.rejects(scheduler.predictMany(['c', 'd']), QueueFullError);
  assert.equal(scheduler.stats().admitted, 2);
  release(); await Promise.all([first, joined]);
  await scheduler.predictMany(['c']);
  assert.equal(scheduler.stats().completed, 3);
  scheduler.close();
});

test('failed/incomplete batches do not poison cache, leak slots or keep inFlight', async () => {
  let count = 0;
  const scheduler = make({ infer: async (texts) => {
    if (++count === 1) throw new Error('Transient failure');
    if (count === 2) return [];
    return texts;
  } });
  const failures = await Promise.allSettled([scheduler.predictMany(['a']), scheduler.predictMany(['a'])]);
  assert.equal(failures.every((row) => row.status === 'rejected'), true);
  assert.equal(scheduler.stats().cache_entries, 0);
  await assert.rejects(scheduler.predictMany(['a']), /Incomplete/);
  assert.deepEqual(await scheduler.predictMany(['a']), ['a']);
  assert.equal(scheduler.stats().active, 0);
  assert.equal(scheduler.stats().pending, 0);
  scheduler.close();
});

test('queue timeout removes waiting work without releasing an active slot early', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const scheduler = make({ batchSize: 1, queueTimeoutMs: 30, infer: async (texts) => { await gate; return texts; } });
  const result = scheduler.predictMany(['a', 'b']);
  await assert.rejects(result, QueueTimeoutError);
  assert.equal(scheduler.stats().active, 1);
  assert.equal(scheduler.stats().queued, 0);
  release(); await delay(10);
  assert.equal(scheduler.stats().active, 0);
  assert.equal(scheduler.stats().pending, 0);
  assert.deepEqual(await scheduler.predictMany(['b']), ['b']);
  scheduler.close();
});

test('shutdown rejects queued work and new requests', async () => {
  const scheduler = make();
  const pending = scheduler.predictMany(['a']);
  scheduler.close();
  await assert.rejects(pending, /stopped/);
  await assert.rejects(scheduler.predictMany(['a']), /stopped/);
  assert.equal(scheduler.stats().pending, 0);
});
