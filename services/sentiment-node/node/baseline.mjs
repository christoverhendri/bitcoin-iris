import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNews } from './parser.mjs';

const DEFAULT_MODEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'models', 'tfidf', 'model.node.json');
const TOKEN_RE = /[\p{L}\p{N}_]+/gu;

export function clean(text) {
  if (typeof text !== 'string') throw new TypeError('Sentiment input must be a string.');
  const withoutLinks = text.replace(/https?:\/\/\S+|@[\p{L}\p{N}_]+/gu, ' ');
  const withoutBanner = withoutLinks.trim().replace(/^(?:JUST IN|BREAKING|JUST ANNOUNCED)\s*:/iu, '');
  return withoutBanner.replace(/\s+/gu, ' ').trim();
}

function tokens(text) {
  return (text.toLowerCase().match(TOKEN_RE) ?? []).filter((token) => [...token].length >= 2);
}

function features(text, model) {
  const terms = tokens(text);
  const counts = new Map();
  for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);
  if (model.vectorizer.ngram_range[1] >= 2) {
    for (let index = 0; index + 1 < terms.length; index += 1) {
      const term = `${terms[index]} ${terms[index + 1]}`;
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }
  const values = new Map();
  let norm = 0;
  for (const [term, count] of counts) {
    if (!Object.hasOwn(model.vocabulary, term)) continue;
    const index = model.vocabulary[term];
    const value = (model.vectorizer.sublinear_tf ? 1 + Math.log(count) : count) * model.idf[index];
    values.set(index, value);
    norm += value * value;
  }
  norm = Math.sqrt(norm);
  if (norm > 0) for (const [index, value] of values) values.set(index, value / norm);
  return values;
}

export function loadBaseline(modelPath = DEFAULT_MODEL) {
  const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
  if (model.format !== 'iris-sentiment-tfidf-node-v1') throw new Error('Unsupported baseline model format.');
  return {
    model,
    predict(text) {
      const cleaned = clean(text);
      if (!cleaned) throw new Error('Sentiment input must not be empty after cleaning.');
      const vector = features(cleaned, model);
      const logits = model.intercept.map((bias, row) => {
        let score = bias;
        for (const [index, value] of vector) score += model.coef[row][index] * value;
        return score;
      });
      const maxLogit = Math.max(...logits);
      const exp = logits.map((value) => Math.exp(value - maxLogit));
      const total = exp.reduce((sum, value) => sum + value, 0);
      const probabilities = Object.fromEntries(model.classes.map((label, index) => [label, exp[index] / total]));
      let best = 0;
      for (let index = 1; index < model.classes.length; index += 1) {
        if (probabilities[model.classes[index]] > probabilities[model.classes[best]]) best = index;
      }
      const sentiment = model.classes[best];
      const semantic = parseNews(text);
      const assets = new Set(semantic.entities.filter((entity) => entity.kind === 'asset').map((entity) => entity.canonical));
      const needs_review = Math.max(...Object.values(probabilities)) < 0.6 || semantic.needs_review || assets.size > 1;
      return { sentiment, probabilities, model_id: model.model_id, needs_review };
    },
  };
}

export default loadBaseline;
