# IRIS Sentiment — Node.js only

Opheline · 18 October 2026 · Node.js model service on `azan-sentiment`.

Standalone backend with Financial DistilRoBERTa ONNX FP32, IRIS Semantic Parser
V3, the existing TF-IDF/logistic baseline, versioned TTL/LRU caching, shared
in-flight jobs and a bounded inference queue. Model weights and tokenizer are
included. Installation and all provided checks use only Node.js/npm.

## How the model works

Financial DistilRoBERTa turns subword tokens into 768-dimensional embeddings,
processes them through six Transformer layers, and classifies the final first-token
representation into three logits. The Node.js wrapper applies softmax to obtain
sentiment probabilities. Parser V3 can then adjust the label while retaining
those probabilities; TF-IDF + Logistic Regression remains an independent baseline.

See [cara kerja internal model: tokenisasi, attention, classification head, dan softmax](models/onnx-fp32/README.md)
beside the ONNX weight file for the architecture, tensor shapes, worked softmax
example, and the distinction between training and inference.

## Human screening results

On the same 114 determinate news items from a 120-article human-labeled sample,
TF-IDF achieved macro-F1 **0.3928** / accuracy **40.35%**, and Financial
DistilRoBERTa achieved macro-F1 **0.6318** / accuracy **66.67%** against adjudicated
gold v2. The other **6 uncertain items** and **10 separate stress cases** are
excluded from these metrics. Gold v2 revises five oil-news sentiment labels;
predictions were unchanged, so this is not a new blind test or a model update.

These are **model-only** results. The final parser V3 pipeline has synthetic
diagnostics but has not undergone independent human screening. The sample was
balanced by weak labels and does not establish production-wide accuracy or BTC
price effects. See the [screening scope and limitations](models/onnx-fp32/README.md#hasil-screening-manusia-gold-v2)
and [preserved source report](validation/human-screening-gold-v2.md).

## Run

Requires Node.js 22+ and npm. For a Git checkout, first run `git lfs install --local`
and `git lfs pull` from the repository root. The offline ZIP already includes
the full weight. Open a terminal in this service directory:

```powershell
npm ci
npm start
```

The service listens at http://127.0.0.1:8765. If another local worker already uses
that port, stop that worker or choose another port:

```powershell
npm start -- --port 8768
```

Dependencies are installed through npm; inference uses the bundled local assets
and makes no model downloads. `node_modules` is not included in this ZIP.

## Connect IRIS-Terminal

Run this service independently and use the existing terminal adapter with:

```dotenv
IRIS_SENTIMENT_URL=http://127.0.0.1:8765
IRIS_SENTIMENT_PROFILE=challenger
```

Then run the terminal with `npm run dev`. Avoid `dev:sentiment` when this separate
worker is already running, since that command starts another worker itself.

## HTTP API

`GET /health` reports model identity, pipeline fingerprint and scheduler counters.
`POST /v1/predict` accepts JSON with 1–40 articles:

```json
{"articles":[{"id":"news-1","text":"The bank supports Bitcoin adoption."}]}
```

Each result includes the matching caller ID, complete `prediction` from the
financial model + parser, and a separate `baseline`. Original neural
probabilities remain unchanged when the parser adjusts the label. Ambiguous
scope requests review and retains the model label. Results do not predict BTC
price effects. The contract remains `iris-sentiment-worker/v1`.

## Limits and cache

| Setting | Default |
|---|---:|
| `IRIS_SENTIMENT_CONCURRENCY` | 1 active batch |
| `IRIS_SENTIMENT_BATCH_SIZE` | 8 texts |
| `IRIS_SENTIMENT_MAX_QUEUE` | 128 queued unique texts |
| `IRIS_SENTIMENT_THREADS` | 4 CPU threads |
| `IRIS_SENTIMENT_CACHE_SIZE` | 2048 entries |
| `IRIS_SENTIMENT_CACHE_TTL_MS` | 3600000 |
| `IRIS_SENTIMENT_QUEUE_TIMEOUT_MS` | 10000 |

Set these as process environment variables before `npm start`. The model loads
once per worker process. Cache keys cover raw text and pipeline identity.
Identical requests share one Promise; cache misses alone enter the queue.
Completed model/parser/baseline output is cached together. Cache is per process
and disappears on restart. Multiple replicas need external coordination.

Full queues return 429 with Retry-After; queued expiry returns 503. Invalid
articles return 400 and oversized HTTP bodies return 413. Failed inference is
not cached. One disconnected caller does not cancel another caller's shared job.

## Verify locally

```powershell
npm run check
```

This runs 16 unit tests, full conversion parity on 66 synthetic examples and an
actual HTTP test with 32 simultaneous requests. The synthetic references are
bundled JSON; no reference interpreter is needed. HTTP tests bind a temporary
loopback port and close it afterward. Generated evidence is saved in
`validation/`. These diagnostics do not use human gold or holdout records and
are not sentiment-accuracy metrics. No training or quantization occurs.

The ONNX model is FP32, opset 17, revision
`ae0eab9ad336d7d548e0efe394b07c04bcaf6e91`. Scope version is
`iris-sentiment-scope/0.3.0`; baseline is `tfidf-logreg-d0d85bc862b5`.
Asset hashes are verified at startup. The upstream model card and Apache 2.0
license are included. `models/onnx-fp32/model.onnx` is tracked through Git LFS;
the offline ZIP also contains the complete weight file. Original source releases
remain separate.
