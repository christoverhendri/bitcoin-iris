# Financial DistilRoBERTa + IRIS parser V3

> Historical Python integration, preserved. The default worker now uses
> [Node.js + ONNX FP32](SENTIMENT_NODE.md). The Python worker can still be started
> separately from the archived source. The active launcher is Node.js only;
> the former `--python` option is no longer part of that launcher.
> The archived Python source is preserved locally and is not included in this branch.

Opheline · local integration on `azan-sentiment` · 17 October 2026.

## Run the complete local stack

The checkout includes the full pinned checkpoint, tokenizer, TF-IDF baseline,
frozen inference source, Python worker, Next.js adapter, UI provenance and tests.
The environment itself is generated locally and excluded from Git/archives.

On Windows, with Node/npm, Python 3.13 and uv available:

```powershell
npm ci
./services/sentiment/setup.ps1
npm run dev:sentiment
```

Open `http://127.0.0.1:3000/sentiment` or `/overview`. This one command starts
the worker, waits for its readiness, then starts Next.js. Exiting the launcher
stops its two child processes. The default worker listens on loopback port 8765;
Next.js uses port 3000. Stop an existing instance before starting another.

For a separately managed worker, use `npm run sentiment:serve` in one terminal
and `npm run dev` in another. `GET /health` on the worker reports actual readiness;
`GET /api/sentiment` on Next.js returns the envelopes both panels consume.

`IRIS_SENTIMENT_URL`, `IRIS_SENTIMENT_PROFILE` and optional
`IRIS_SENTIMENT_PYTHON` are server-only environment variables. `.env.example`
contains their defaults; copying it to `.env.local` is optional. These variables
must not use a `NEXT_PUBLIC_` prefix.

## What is integrated

RSS → latest 40 unique headlines → shared Next.js prediction adapter → persistent
Python worker → Financial DistilRoBERTa model-only → parser V3 decision → both
news labels and the headline sentiment distribution. TF-IDF model-only runs on
the same inputs and remains the explicit baseline comparison.

The worker loads both models once. CPU inference uses four neural threads and a
serialized inference lock. Its bounded 2,048-headline LRU cache reuses outputs
within the running process; a restart clears it. Next.js caches each prediction
for five minutes, coalesces identical pending batches across panels, and uses a
15-second request timeout. The two layers never fit models or access labels.

Predictions are keyed by the exact UTF-8 headline hash and pinned model/parser
identity within the worker process. Only headline text and identity are sent;
the article source, publication time, and impact calculation remain with RSS.
The news list ranks the shared latest-40 pool by the existing impact heuristic.
The aggregate describes this headline sample, not all articles in a seven-day
archive. The legacy `days` argument does not expand RSS coverage.

`src/lib/sentiment/client.ts` validates response identities, counts, model
probabilities, parser version, decision consistency and raw text before use.
Rows are matched by ID rather than response order. Model probabilities remain
model-only probabilities even when parser V3 changes the final class.

## Profiles and visible provenance

| `IRIS_SENTIMENT_PROFILE` | Panel source |
|---|---|
| `challenger` (default for this integration) | Financial DistilRoBERTa + parser V3, with TF-IDF comparison |
| `baseline` | TF-IDF model-only, explicitly labeled baseline |
| `heuristic` | Original keyword lexicon, explicitly labeled disabled model |

The archived package CLI `services/sentiment/run.py` still defaults to TF-IDF.
The panel integration defaults to `challenger` because this change connects the
requested Financial + V3 pipeline. This is a local integration choice, not a new
quality claim or promotion based on fresh human evaluation.

News rows show source, review status and the TF-IDF label. Tooltips identify the
model-only label, model revision and parser evidence/reason. The sentiment strip
shows source, sample size, model coverage, review count and baseline percentages.
The overview intelligence feed carries the same provenance. Mock envelopes keep
their existing MOCK badges and do not receive fabricated model metadata.

If the worker is unreachable or its response is invalid, RSS articles remain
available with **Heuristic · model unavailable** provenance. Such fallback is
cached for only five seconds so the next request can recover. It is never labeled
Financial or TF-IDF. RSS failures still use the existing badged mock mechanism.

The score keeps the existing blend: 60% headline net tone and 40% normalized
Fear & Greed when the latter is available; otherwise headline net tone alone.
It is not one article's model probability or an effect-to-BTC prediction.

## Immutable model assets

Model: `mrm8488/distilroberta-finetuned-financial-news-sentiment-analysis`, pinned
revision `ae0eab9ad336d7d548e0efe394b07c04bcaf6e91`.
Base parser: `iris-news-rules/1.3.0`. Scope policy:
`iris-sentiment-scope/0.3.0`. TF-IDF:
`tfidf-logreg-d0d85bc862b5`. Package: `iris-sentiment-local/1.0.0`.

All original 31 package files retain their manifest hashes. New worker/setup
files sit beside that immutable package. The archived `services/sentiment/README.md`
describes the original package; this document describes the active integration.
`run.py --verify` checks the original package, while the worker additionally
reports its model/parser identity through health and response metadata.

Inference is offline: `HF_HUB_OFFLINE`, `TRANSFORMERS_OFFLINE` and the packaged
cache path are set before loading. Safetensors and `trust_remote_code=False`
remain in use. There is no silent model fallback at the worker level.

The full offline handoff includes the 328 MB neural weight. Normal Git ignores
that file, caches and environments. After a source-only clone, restore it with
`bootstrap_weights.py --archive <full-offline-zip>` before setup/launch, or use
the complete integrated archive. Do not commit the full archive or weight into
ordinary Git; use a Release asset or a separately configured LFS workflow.

The pinned dependency lock was validated on Windows Python 3.13.2. Other deployment
operating systems need an appropriate environment and runtime verification.
Python inference runs in a separate long-lived worker, not in a browser bundle
or a Next.js edge function. Remote deployment is outside this local-only run.

## Validation and known limits

- Full frontend/adaptor suite: 203 tests pass, including 15 adapter/panel tests
  covering shared results, baseline selection, invalid responses and recovery.
- TypeScript passes. ESLint has no errors; seven pre-existing warnings remain
  in unrelated files. Python environment files are excluded from lint.
- Production build passes. Existing middleware deprecation and unrelated
  on-chain upstream/cache warnings remain visible; the model routes compile.
- Real HTTP worker: all eight preserved regressions pass; repeated requests return
  cached identical results. Duplicate IDs, oversized batches and empty input are
  rejected. No gold or holdout is used.
- Live Next.js API and browser DOM show 40 RSS articles with Financial + V3
  provenance and TF-IDF comparison. This is integration evidence, not an accuracy
  measurement on newly labeled news. Review flags remain visible.
- An actual unavailable loopback endpoint was tested through Next.js and the
  browser DOM: live RSS remained available with explicit heuristic provenance
  and zero model results. Restoring the endpoint recovered Financial + V3 labels.

Repeat the local worker smoke test after starting it:

```powershell
services/sentiment/.venv/Scripts/python.exe services/sentiment/smoke_test.py
```

The frozen V3 diagnostic evidence remains in `services/sentiment/evidence/`.
Its six missed-coverage cases and two neural regressions relative to V2 are
unchanged. A successful integration does not eliminate those limitations.
No new training, gold/holdout changes, push, or external deployment occurred.

Local validation outputs are in `.local/sentiment-integration/` and are excluded
from Git. The service's full prediction API retains the complete semantic parse
and evidence; the Next.js adapter sends the relevant summary to the UI.
