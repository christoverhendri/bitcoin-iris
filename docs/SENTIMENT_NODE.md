# Node.js sentiment backend: ONNX FP32

Opheline · local implementation · 18 October 2026 · `azan-sentiment`.

The active service is `services/sentiment-node/`; the launcher has no Python
backend option. It loads Financial DistilRoBERTa as
FP32 ONNX, executes the native JavaScript port of frozen parser V3, and returns
the unchanged TF-IDF/logistic baseline alongside it. No Python process is used
for serving. The original checkpoint, joblib, Python rules, release manifest,
previous ZIPs and reports remain intact.

## Run locally

Requires Node.js 22 or newer and npm. With the local model assets present:

```powershell
git lfs install --local
git lfs pull
npm ci
npm run dev:sentiment
```

Open `http://127.0.0.1:3000/sentiment`. `npm run sentiment:serve` starts only the
worker. The launcher loads `.env.local`, binds the worker to loopback and waits
for its backend/model health before starting Next.js. Its default worker URL is
`http://127.0.0.1:8765`. Health and scheduler counters are at `/health`.

The full `services/sentiment-node/models/onnx-fp32/model.onnx` file is tracked
through Git LFS on `azan-sentiment`. Git stores a small pointer and LFS stores
the 328,611,855-byte weight. If a clone has only the pointer, run `git lfs pull`.
No training or conversion is needed after cloning. Its sibling
`manifest.json` verifies all ONNX/tokenizer assets before loading. `model.node.json`
contains the baseline's existing vocabulary, IDF and logistic coefficients;
these are exported coefficients, not new training results.

Production startup after a successful build uses the same Node.js service:

```powershell
npm run build
npm run start:sentiment
```

The previous `services/sentiment/` directory and earlier packages are retained
locally as historical references and excluded from this Node.js branch.
Active startup, tests and validation do not read that
directory. The portable service package is also runnable independently using
its own `package.json`.

## Request ownership and cache correctness

The existing `POST /v1/predict` contract is retained: 1–40 `{id,text}` articles,
matching response IDs, full raw-text parse, model probabilities, V3 evidence,
baseline probabilities and explicit review metadata. Only text and IDs are
accepted; no labels are submitted to inference.

One scheduler owns completed results, queued jobs and active jobs. It checks
cache, joins an existing per-text Promise, or synchronously registers a new job
before scheduling it. This includes requests with partially overlapping batches.
Caller IDs are attached after inference; cached output never contains another
caller's article ID. Results are copied before returning to prevent mutation.

Keys hash raw text plus a pipeline fingerprint covering the ONNX model,
tokenizer/configuration, baseline JSON, parser/adapter source and runtime version.
The model/parser output is published together. Baseline and challenger occupy
different fields; neither silently overwrites the other. This is an in-memory
TTL/LRU cache and is lost on restart; every process has its own model/cache.
Multiple replicas require a shared owner or external coordination to deduplicate
across processes.

The Next.js adapter coalesces active work per headline, including overlapping
panel requests. It deliberately keeps no completed-result or fallback cache:
the worker is the single owner of versioned cache entries, so restarting it
with a new pipeline cannot leave old predictions in a separate Next.js cache.
Worker failure or queue rejection remains visibly labeled
`Heuristic · model unavailable` in the existing UI. Baseline is selected only
through the explicit baseline profile; it is never an unlabeled error fallback.

## Resource bounds

The following are conservative initial settings, not an optimal-performance claim:

| Environment variable | Default | Meaning |
|---|---:|---|
| `IRIS_SENTIMENT_CONCURRENCY` | 1 | Maximum active inference batches |
| `IRIS_SENTIMENT_BATCH_SIZE` | 8 | Maximum texts per native ONNX run |
| `IRIS_SENTIMENT_MAX_QUEUE` | 128 | Maximum queued unique texts |
| `IRIS_SENTIMENT_THREADS` | 4 | Native intra-op CPU threads; inter-op is 1 |
| `IRIS_SENTIMENT_CACHE_SIZE` | 2048 | Maximum completed cache entries |
| `IRIS_SENTIMENT_CACHE_TTL_MS` | 3600000 | Worker result TTL |
| `IRIS_SENTIMENT_QUEUE_TIMEOUT_MS` | 10000 | Deadline while a job is queued |

Only cache misses consume queue/concurrency capacity. Admission of new work is
atomic per request: if all new unique texts do not fit, HTTP 429 with Retry-After
is returned before any of them are queued. Existing jobs can still be joined
while the queue is full. Queued expiry returns 503 and removes that queued job;
active native inference retains its slot until it actually finishes. Errors
are not cached as model results. Disconnected callers do not cancel shared work.

HTTP bodies are limited to 1 MiB, individual texts to 16,000 codepoints and the
original parser's 2,000-word/128-event bounds. RoBERTa uses the original 512-token
limit, right truncation with terminal token preservation, and longest-sequence
padding within each batch. Truncation is reported and prevents parser overrides.

## Conversion and verification

Export is local, offline and FP32 (328,611,855-byte ONNX file, opset 17).
The pinned upstream model revision is `ae0eab9ad336d7d548e0efe394b07c04bcaf6e91`.
The baseline remains `tfidf-logreg-d0d85bc862b5`; scope remains
`iris-sentiment-scope/0.3.0`. Source and ONNX manifests record asset provenance.
No quantization, training, calibration against gold, or holdout use occurred.

The export scripts in the archived `services/sentiment/` directory record how
the existing ONNX asset was produced. Export is not a startup or validation step.

The exporter refuses to overwrite an existing ONNX export. Preserve it and use
a new version directory for future exports. Baseline export is separately
implemented by `services/sentiment/export_baseline.py`.

```powershell
npm test
npm run sentiment:check
```

Parity and HTTP scripts use bundled synthetic JSON references and save results
under `services/sentiment-node/validation/`. Active panel integration evidence
is saved under `.local/sentiment-node-active-20261018/`.
They are diagnostics, excluded from the main human-gold metrics. The smoke test
starts its own worker on a temporary loopback port and closes it afterward.
The protected-files audit verifies originals by hash without using gold/holdout
content as model inputs. Old evaluation scores are not recalculated or replaced.

## Local results

- 204 application tests and 16 Node backend tests passed; typecheck and production
  build passed. ESLint has zero errors and the same seven unrelated warnings.
- 66 synthetic examples: identical token IDs, model labels, final labels, full
  parser structures and review metadata against frozen Python. This includes two
  truncated inputs. Maximum neural probability difference was 0.000003616;
  baseline difference was below 0.000000000001.
- 32 simultaneous HTTP requests containing 256 article occurrences admitted
  only 16 unique texts: two native batches, one active at a time, with 240 joins.
  Four warm requests performed no additional inference.
- Real HTTP validation covered queue rejection (429), malformed input (400),
  oversized payload (413), and a disconnected caller sharing an active job.
  Unit tests additionally covered queue expiry, failure cleanup, cache expiry,
  LRU eviction, concurrency two, version isolation and shutdown.
- Four simultaneous Next API calls returned the same 40 live RSS articles and
  matching aggregate counts. Worker-unavailable fallback preserved live articles;
  recovery returned 40 model results without another model load.
- Existing build warnings remain: middleware deprecation, oversized Blockstream
  fetch-cache entries and an unrelated chain-supply feed fallback. These are
  outside this sentiment backend change.

These are conversion/integration diagnostics, not new sentiment-quality scores
or a Python-versus-Node resource benchmark. No quantization was performed.
