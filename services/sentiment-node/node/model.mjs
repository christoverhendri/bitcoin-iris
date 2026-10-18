import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ort from 'onnxruntime-node';
import { Tokenizer } from '@huggingface/tokenizers';
import { clean, loadBaseline } from './baseline.mjs';
import { parseNews, applySentimentScope } from './parser.mjs';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const SCHEMA = 'iris-sentiment-worker/v1';
export const RELEASE_ID = 'iris-sentiment-local/1.0.0';
export const SCOPE_VERSION = 'iris-sentiment-scope/0.3.0';
const LABELS = ['negative', 'neutral', 'positive'];
export const hash = (text) => createHash('sha256').update(text).digest('hex');

async function fileHash(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}

function softmax(logits, labels) {
  if (logits.some((value) => !Number.isFinite(value))) throw new Error('Invalid model logits');
  const highest = Math.max(...logits);
  const exp = logits.map((value) => Math.exp(value - highest));
  const total = exp.reduce((a, b) => a + b, 0);
  return Object.fromEntries(labels.map((label, index) => [label, exp[index] / total]));
}

export async function loadModel({ threads = 4 } = {}) {
  const folder = path.join(ROOT, 'models/onnx-fp32');
  const manifest = JSON.parse(await readFile(path.join(folder, 'manifest.json'), 'utf8'));
  if (manifest.schema !== 'iris-sentiment-onnx/v1' || manifest.precision !== 'fp32'
      || manifest.quantized !== false || manifest.release_id !== RELEASE_ID
      || manifest.model_id !== 'mrm8488/distilroberta-finetuned-financial-news-sentiment-analysis@ae0eab9ad336d7d548e0efe394b07c04bcaf6e91'
      || [...manifest.labels].sort().join() !== LABELS.join()) throw new Error('Unsupported ONNX manifest');
  const identity = { runtime: 'node-onnx-fp32/v1', versions: { onnx: '1.30.0', tokenizer: '0.2.0' }, threads };
  for (const [relative, expected] of Object.entries(manifest.files)) {
    const file = path.join(folder, relative);
    if (path.basename(relative) !== relative || await fileHash(file) !== expected.sha256) {
      throw new Error(`ONNX asset integrity mismatch: ${relative}`);
    }
    identity[relative] = expected.sha256;
  }
  // Cache identities include every decision-making source, not just the neural weight.
  for (const relative of ['models/tfidf/model.node.json', 'node/parser.mjs', 'node/baseline.mjs', 'node/model.mjs']) {
    identity[relative] = await fileHash(path.join(ROOT, relative));
  }
  const tokenizer = new Tokenizer(JSON.parse(await readFile(path.join(folder, 'tokenizer.json'), 'utf8')),
    JSON.parse(await readFile(path.join(folder, 'tokenizer_config.json'), 'utf8')));
  const baseline = loadBaseline();
  if (baseline.model.model_id !== 'tfidf-logreg-d0d85bc862b5') throw new Error('Unexpected baseline identity');
  const session = await ort.InferenceSession.create(path.join(folder, 'model.onnx'), {
    executionProviders: ['cpu'], intraOpNumThreads: threads, interOpNumThreads: 1,
    executionMode: 'sequential', graphOptimizationLevel: 'all',
  });
  const fingerprint = hash(JSON.stringify(identity));

  function encode(text) {
    const cleaned = clean(text);
    if (!cleaned) throw new Error('Sentiment input must not be empty after cleaning');
    const full = tokenizer.encode(cleaned).ids;
    // Single-sequence RoBERTa right truncation preserves its final </s> token.
    const ids = full.length > manifest.max_tokens
      ? [...full.slice(0, manifest.max_tokens - 1), manifest.end_id] : full;
    return { cleaned, ids, input_tokens: full.length, truncated: full.length > manifest.max_tokens };
  }

  async function infer(texts) {
    const encoded = texts.map(encode);
    // Parse before doing native inference so parser input limits are enforced too.
    const semantics = texts.map(parseNews);
    const width = Math.max(...encoded.map((item) => item.ids.length));
    const input = new BigInt64Array(texts.length * width).fill(BigInt(manifest.padding_id));
    const attention = new BigInt64Array(texts.length * width);
    for (let row = 0; row < encoded.length; row++) {
      for (let col = 0; col < encoded[row].ids.length; col++) {
        input[row * width + col] = BigInt(encoded[row].ids[col]);
        attention[row * width + col] = 1n;
      }
    }
    const output = await session.run({ input_ids: new ort.Tensor('int64', input, [texts.length, width]),
      attention_mask: new ort.Tensor('int64', attention, [texts.length, width]) });
    if (output.logits.dims.join() !== [texts.length, 3].join()) throw new Error('Unexpected logits shape');
    return texts.map((text, index) => {
      const probabilities = softmax(Array.from(output.logits.data.slice(index * 3, index * 3 + 3)), manifest.labels);
      const sentiment = LABELS.reduce((best, label) => probabilities[label] > probabilities[best] ? label : best, LABELS[0]);
      const semantic = semantics[index];
      const inference = { input_tokens: encoded[index].input_tokens, max_tokens: manifest.max_tokens,
        truncated: encoded[index].truncated };
      const reasons = [];
      if (Math.max(...Object.values(probabilities)) < 0.6) reasons.push('low_confidence');
      if (semantic.needs_review) reasons.push('semantic_review');
      if (inference.truncated) reasons.push('input_truncated');
      if (new Set(semantic.entities.filter((entity) => entity.kind === 'asset').map((entity) => entity.canonical)).size > 1) {
        reasons.push('multiple_assets_document_sentiment');
      }
      const contentHash = hash(text);
      const prediction = applySentimentScope({ raw_text: text, cleaned_text: encoded[index].cleaned,
        content_hash: contentHash, semantic_parse: semantic, sentiment, probabilities,
        needs_review: reasons.length > 0, review_reasons: reasons,
        explicit_btc_mention: /(?<![\p{L}\p{N}_])(?:bitcoin|btc)(?![\p{L}\p{N}_])/iu.test(encoded[index].cleaned),
        model_id: manifest.model_id, label_basis: 'pretrained_financial_phrasebank', inference,
        research_only: true, classified_at: new Date().toISOString(),
      });
      return { content_hash: contentHash, prediction, baseline: baseline.predict(text) };
    });
  }
  return { infer, encode, fingerprint, manifest, close: () => session.release(),
    health: { schema: SCHEMA, status: 'ready', release_id: RELEASE_ID,
      model_id: manifest.model_id, baseline_model_id: baseline.model.model_id,
      scope_version: SCOPE_VERSION, research_only: true, backend: 'node-onnx-fp32',
      pipeline_fingerprint: fingerprint, precision: 'fp32', model_loads: 1 } };
}
