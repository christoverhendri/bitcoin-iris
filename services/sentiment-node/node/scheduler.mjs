import { createHash } from 'node:crypto';

export class QueueFullError extends Error {}
export class QueueTimeoutError extends Error {}

/** One owner for completed results, queued work and active work in this process. */
export class Scheduler {
  constructor({ infer, fingerprint, concurrency = 1, batchSize = 8, maxQueue = 128,
    cacheSize = 2048, ttlMs = 3_600_000, queueTimeoutMs = 10_000, clock = Date.now }) {
    for (const [name, value] of Object.entries({ concurrency, batchSize, maxQueue, cacheSize, ttlMs, queueTimeoutMs })) {
      if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid scheduler ${name}`);
    }
    if (typeof infer !== 'function' || !fingerprint) throw new Error('Missing inference or pipeline identity');
    Object.assign(this, { infer, fingerprint, concurrency, batchSize, maxQueue, cacheSize, ttlMs, queueTimeoutMs, clock });
    this.cache = new Map();
    this.inFlight = new Map();
    this.queue = [];
    this.active = 0;
    this.scheduled = false;
    this.closed = false;
    this.counts = { cache_hits: 0, joined: 0, admitted: 0, batches: 0,
      completed: 0, failed: 0, rejected: 0, expired: 0, max_active: 0, max_queued: 0 };
  }

  key(text) {
    return createHash('sha256').update(JSON.stringify([this.fingerprint, text])).digest('hex');
  }

  cached(key) {
    const item = this.cache.get(key);
    if (!item) return;
    if (item.expires <= this.clock()) { this.cache.delete(key); return; }
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.value;
  }

  async predictMany(texts) {
    if (this.closed) throw new Error('Scheduler stopped');
    const unique = new Map(texts.map((text) => [this.key(text), text]));
    const ready = new Map();
    const missing = [];
    for (const [key, text] of unique) {
      const value = this.cached(key);
      if (value !== undefined) { this.counts.cache_hits++; ready.set(key, Promise.resolve(value)); }
      else if (this.inFlight.has(key)) { this.counts.joined++; ready.set(key, this.inFlight.get(key).promise); }
      else missing.push({ key, text });
    }
    // Atomic admission: an oversized request never leaves partially admitted work.
    if (this.queue.length + missing.length > this.maxQueue) {
      this.counts.rejected += missing.length;
      throw new QueueFullError('Inference queue is full');
    }
    for (const { key, text } of missing) {
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      const item = { key, text, promise, resolve, reject, timer: null };
      // Register before scheduling or awaiting anything, including across overlapping requests.
      this.inFlight.set(key, item);
      item.timer = setTimeout(() => {
        const position = this.queue.indexOf(item);
        if (position < 0) return;
        this.queue.splice(position, 1);
        this.inFlight.delete(key);
        this.counts.expired++;
        reject(new QueueTimeoutError('Inference queue deadline exceeded'));
      }, this.queueTimeoutMs);
      this.queue.push(item);
      this.counts.admitted++;
      ready.set(key, promise);
    }
    this.counts.max_queued = Math.max(this.counts.max_queued, this.queue.length);
    this.pumpSoon();
    const values = await Promise.all([...ready].map(async ([key, value]) => [key, await value]));
    const byKey = new Map(values);
    return texts.map((text) => structuredClone(byKey.get(this.key(text))));
  }

  pumpSoon() {
    if (this.scheduled || this.closed) return;
    this.scheduled = true;
    setImmediate(() => { this.scheduled = false; this.pump(); });
  }

  pump() {
    while (!this.closed && this.active < this.concurrency && this.queue.length) {
      const batch = this.queue.splice(0, this.batchSize);
      for (const item of batch) clearTimeout(item.timer);
      this.active++;
      this.counts.batches++;
      this.counts.max_active = Math.max(this.counts.max_active, this.active);
      void this.run(batch);
    }
  }

  async run(batch) {
    try {
      const values = await this.infer(batch.map((item) => item.text));
      if (!Array.isArray(values) || values.length !== batch.length || values.some((value) => value == null)) {
        throw new Error('Incomplete inference batch');
      }
      // Validate the complete batch before publishing any cache entries.
      const copies = values.map((value) => structuredClone(value));
      for (const [index, item] of batch.entries()) {
        this.cache.set(item.key, { value: copies[index], expires: this.clock() + this.ttlMs });
        while (this.cache.size > this.cacheSize) this.cache.delete(this.cache.keys().next().value);
        this.counts.completed++;
        item.resolve(copies[index]);
      }
    } catch (error) {
      this.counts.failed += batch.length;
      for (const item of batch) item.reject(error);
    } finally {
      for (const item of batch) this.inFlight.delete(item.key);
      this.active--;
      this.pumpSoon();
    }
  }

  stats() {
    return { ...this.counts, active: this.active, queued: this.queue.length,
      pending: this.inFlight.size, cache_entries: this.cache.size,
      limits: { concurrency: this.concurrency, batch_size: this.batchSize,
        max_queue: this.maxQueue, cache_size: this.cacheSize, ttl_ms: this.ttlMs,
        queue_timeout_ms: this.queueTimeoutMs } };
  }

  close() {
    this.closed = true;
    for (const item of this.queue.splice(0)) {
      clearTimeout(item.timer);
      this.inFlight.delete(item.key);
      item.reject(new Error('Scheduler stopped'));
    }
  }
}
