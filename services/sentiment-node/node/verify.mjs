import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadModel, ROOT } from './model.mjs';

const folder = path.join(ROOT, 'validation');
const references = JSON.parse(await readFile(path.join(folder, 'reference-predictions.json'), 'utf8'));
const model = await loadModel();
const metrics = { synthetic_examples: references.length, neural_max_probability_delta: 0,
  baseline_max_probability_delta: 0, tokenizer_mismatches: 0, model_label_mismatches: 0,
  final_label_mismatches: 0, full_parser_mismatches: 0, full_metadata_mismatches: 0,
  truncation_examples: 0, gold_or_holdout_used: false, trained: false };
const failures = [];
const predictions = [];
try {
  // Test multiple dynamic batch sizes and different padded sequence lengths.
  let offset = 0, batchIndex = 0;
  while (offset < references.length) {
    const batch = references.slice(offset, offset + [1, 3, 8][batchIndex++ % 3]);
    const actual = await model.infer(batch.map((row) => row.text));
    for (let index = 0; index < batch.length; index++) {
      const expected = batch[index], row = actual[index];
      const mismatch = (name, left, right) => {
        try { assert.deepEqual(left, right); }
        catch (error) { metrics[name]++; failures.push({ id: expected.id, check: name, difference: error.message.slice(0, 2000) }); }
      };
      mismatch('tokenizer_mismatches', model.encode(expected.text).ids, expected.token_ids);
      mismatch('model_label_mismatches', row.prediction.model_sentiment, expected.prediction.model_sentiment);
      mismatch('final_label_mismatches', row.prediction.sentiment, expected.prediction.sentiment);
      mismatch('full_parser_mismatches', row.prediction.semantic_parse, expected.prediction.semantic_parse);
      for (const label of ['negative', 'neutral', 'positive']) {
        metrics.neural_max_probability_delta = Math.max(metrics.neural_max_probability_delta,
          Math.abs(row.prediction.probabilities[label] - expected.prediction.probabilities[label]));
        metrics.baseline_max_probability_delta = Math.max(metrics.baseline_max_probability_delta,
          Math.abs(row.baseline.probabilities[label] - expected.baseline.probabilities[label]));
      }
      const metadata = (prediction) => Object.fromEntries(Object.entries(prediction)
        .filter(([key]) => !['classified_at', 'semantic_parse', 'probabilities'].includes(key)));
      mismatch('full_metadata_mismatches', metadata(row.prediction), metadata(expected.prediction));
      mismatch('full_metadata_mismatches', { ...row.baseline, probabilities: null }, { ...expected.baseline, probabilities: null });
      if (row.prediction.inference.truncated) metrics.truncation_examples++;
      predictions.push({ id: expected.id, ...row });
    }
    offset += batch.length;
  }
} finally { await model.close(); }
await writeFile(path.join(folder, 'node-predictions.json'), JSON.stringify(predictions, null, 2));
await writeFile(path.join(folder, 'parity.json'), JSON.stringify({ ...metrics, failures }, null, 2));
console.log(JSON.stringify(metrics));
assert.equal(failures.length, 0, `See ${path.join(folder, 'parity.json')}`);
assert.ok(metrics.neural_max_probability_delta < 1e-5, 'Neural tolerance exceeded');
assert.ok(metrics.baseline_max_probability_delta < 1e-12, 'Baseline tolerance exceeded');
