import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { loadModel, SCHEMA, RELEASE_ID } from './model.mjs';
import { clean } from './baseline.mjs';
import { parseNews } from './parser.mjs';
import { Scheduler, QueueFullError, QueueTimeoutError } from './scheduler.mjs';

export function validateArticles(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.articles)
      || value.articles.length < 1 || value.articles.length > 40) throw new Error('Expected 1..40 articles');
  const seen = new Set();
  for (const article of value.articles) {
    if (!article || typeof article !== 'object' || Object.keys(article).sort().join() !== 'id,text'
        || typeof article.id !== 'string' || [...article.id].length < 1 || [...article.id].length > 128
        || seen.has(article.id) || typeof article.text !== 'string' || !article.text.trim()
        || [...article.text].length > 16_000 || !clean(article.text)) throw new Error('Invalid article identity or text');
    // Reject parser resource-limit violations before admitting shared work.
    parseNews(article.text);
    seen.add(article.id);
  }
  return value.articles;
}

async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 1_048_576) { const error = new Error('Request body too large'); error.status = 413; throw error; }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createService(model, options = {}) {
  const scheduler = new Scheduler({ infer: model.infer, fingerprint: model.fingerprint, ...options });
  const server = http.createServer(async (request, response) => {
    function send(status, value) {
      if (response.destroyed) return;
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
        ...(status === 429 ? { 'retry-after': '1' } : {}) });
      response.end(JSON.stringify(value));
    }
    if (request.method === 'GET' && request.url === '/health') {
      return send(200, { ...model.health, scheduler: scheduler.stats() });
    }
    if (request.method !== 'POST' || request.url !== '/v1/predict') return send(404, { error: 'Not found' });
    if (Number(request.headers['content-length']) > 1_048_576) {
      request.resume(); return send(413, { error: 'Request body too large' });
    }
    let articles;
    try { articles = validateArticles(await readJson(request)); }
    catch (error) { return send(error.status ?? 400, { error: error.status === 413 ? 'Request body too large' : 'Invalid articles or JSON' }); }
    try {
      // A disconnected HTTP caller does not cancel work shared by other callers.
      const values = await scheduler.predictMany(articles.map((article) => article.text));
      send(200, { schema: SCHEMA, release_id: RELEASE_ID, pipeline_fingerprint: model.fingerprint,
        rows: values.map((value, index) => ({ ...value, id: articles[index].id })) });
    } catch (error) {
      if (error instanceof QueueFullError) send(429, { error: 'Inference queue full; retry later' });
      else if (error instanceof QueueTimeoutError) send(503, { error: 'Inference queue deadline exceeded' });
      else { console.error('Sentiment inference failed:', error.message); send(503, { error: 'Inference unavailable' }); }
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.maxRequestsPerSocket = 100;
  return { server, scheduler, async close() {
    scheduler.close();
    server.closeIdleConnections();
    await new Promise((resolve) => server.close(resolve));
    await model.close?.();
  } };
}

function setting(name, fallback, max) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`Invalid ${name}`);
  return value;
}

async function main() {
  const { values } = parseArgs({ options: { host: { type: 'string', default: '127.0.0.1' },
    port: { type: 'string', default: '8765' } }, strict: true });
  if (!['127.0.0.1', 'localhost', '::1'].includes(values.host)) throw new Error('Local worker requires loopback host');
  const model = await loadModel({ threads: setting('IRIS_SENTIMENT_THREADS', 4, 32) });
  const service = createService(model, {
    concurrency: setting('IRIS_SENTIMENT_CONCURRENCY', 1, 4),
    batchSize: setting('IRIS_SENTIMENT_BATCH_SIZE', 8, 40),
    maxQueue: setting('IRIS_SENTIMENT_MAX_QUEUE', 128, 4096),
    cacheSize: setting('IRIS_SENTIMENT_CACHE_SIZE', 2048, 16384),
    ttlMs: setting('IRIS_SENTIMENT_CACHE_TTL_MS', 3_600_000, 86_400_000),
    queueTimeoutMs: setting('IRIS_SENTIMENT_QUEUE_TIMEOUT_MS', 10_000, 60_000),
  });
  service.server.on('error', async (error) => {
    console.error(error.message); service.scheduler.close(); await model.close(); process.exitCode = 1;
  });
  service.server.listen(Number(values.port), values.host, () => {
    console.log(JSON.stringify({ ...model.health, scheduler: service.scheduler.stats(),
      url: `http://${values.host}:${values.port}`, process_id: process.pid }));
  });
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await service.close();
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
