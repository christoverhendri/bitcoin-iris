import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadModel, ROOT, hash } from './model.mjs';
import { createService } from './server.mjs';

const model = await loadModel();
const service = createService(model);
service.server.listen(0, '127.0.0.1');
await once(service.server, 'listening');
const url = `http://127.0.0.1:${service.server.address().port}`;
const folder = path.join(ROOT, 'validation');
const references = JSON.parse(await readFile(path.join(folder, 'reference-predictions.json'), 'utf8'));
const texts = [...new Set(references.slice(0, 24).map((row) => row.text))].slice(0, 16);
const post = (articles, signal) => fetch(`${url}/v1/predict`, { method: 'POST',
  headers: { 'content-type': 'application/json' }, body: JSON.stringify({ articles }), signal });
const health = async () => (await fetch(`${url}/health`)).json();
const report = { requests: 32, unique_texts: texts.length, backend: 'node-onnx-fp32',
  gold_or_holdout_used: false, trained: false, pushed: false };
try {
  const before = await health();
  const started = performance.now();
  const calls = Array.from({ length: report.requests }, (_, request) => {
    const articles = Array.from({ length: 8 }, (_, index) => ({ id: `${request}-${index}`,
      text: texts[(request + index) % texts.length] }));
    return { articles, response: post(articles) };
  });
  const outputs = await Promise.all(calls.map(async (call) => {
    const response = await call.response;
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.rows.length, call.articles.length);
    for (let index = 0; index < body.rows.length; index++) {
      assert.equal(body.rows[index].id, call.articles[index].id);
      assert.equal(body.rows[index].content_hash, hash(call.articles[index].text));
    }
    return body;
  }));
  report.concurrent_wall_ms = performance.now() - started;
  const canonical = new Map();
  for (const body of outputs) for (const row of body.rows) {
    const value = { ...row }; delete value.id;
    if (canonical.has(row.content_hash)) assert.deepEqual(value, canonical.get(row.content_hash));
    else canonical.set(row.content_hash, value);
  }
  const after = await health();
  assert.equal(after.scheduler.completed - before.scheduler.completed, texts.length);
  assert.equal(after.scheduler.admitted - before.scheduler.admitted, texts.length);
  assert.equal(after.scheduler.max_active, 1);
  assert.equal(after.scheduler.pending, 0);
  assert.equal(after.model_loads, 1);
  assert.ok(after.scheduler.joined > 0);
  for (const call of calls.slice(0, 4)) assert.equal((await post(call.articles)).status, 200);
  const warm = await health();
  assert.equal(warm.scheduler.completed, after.scheduler.completed);
  assert.equal(warm.scheduler.batches, after.scheduler.batches);
  report.before = before.scheduler; report.after = after.scheduler; report.warm = warm.scheduler;
  report.concurrent_results_consistent = true; report.warm_requests_without_inference = 4;
  report.invalid_requests = [];
  const invalid = [
    [{ id: 'x', text: texts[0] }, { id: 'x', text: texts[1] }],
    [{ id: 'x', text: '' }], [{ id: 'x', text: 'https://example.test @user' }],
    Array.from({ length: 41 }, (_, index) => ({ id: String(index), text: 'Bitcoin' })),
    [{ id: 'x', text: 'buy '.repeat(129) }],
  ];
  for (const articles of invalid) { const response = await post(articles);
    assert.equal(response.status, 400); report.invalid_requests.push(response.status); }
  const tooLarge = await fetch(`${url}/v1/predict`, { method: 'POST', body: 'x'.repeat(1_048_577) });
  assert.equal(tooLarge.status, 413);
  report.oversized_body_status = tooLarge.status;

  // Real FP32 engine behind a deliberately small queue demonstrates HTTP backpressure.
  const limited = createService(model, { maxQueue: 2, batchSize: 1 });
  limited.server.listen(0, '127.0.0.1'); await once(limited.server, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${limited.server.address().port}/v1/predict`, {
      method: 'POST', body: JSON.stringify({ articles: texts.slice(0, 3).map((text, index) => ({ id: String(index), text })) }),
    });
    assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '1');
    assert.equal(limited.scheduler.stats().admitted, 0);
    report.backpressure_status = response.status;
  } finally { limited.scheduler.close(); limited.server.closeIdleConnections();
    await new Promise((resolve) => limited.server.close(resolve)); }
  // One HTTP caller aborting must not cancel inference shared by another caller.
  const uncached = references[30].text;
  const controller = new AbortController();
  const aborted = post([{ id: 'aborted', text: uncached }], controller.signal).catch(() => null);
  const survivor = post([{ id: 'survivor', text: uncached }]);
  setTimeout(() => controller.abort(), 5);
  await aborted; assert.equal((await survivor).status, 200);
  report.abort_does_not_cancel_shared_work = true;
  report.final = (await health()).scheduler;
  report.passed = true;
  await writeFile(path.join(folder, 'http-concurrency.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await service.close(); }
