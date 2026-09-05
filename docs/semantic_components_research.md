# News semantic components: research and proposed experiment

Research date: 2026-09-05. Author: Opheline.

## Decision

### Scope correction: IRIS component audit

The model list below is an offline comparison shortlist, not a proposed set of
models to load together. Vian clarified that component assessment must focus on
the IRIS codespace. The following findings supersede any implication that the
Arline comparison defines the implementation scope.

Direct inspection of IRIS found:

| Existing component | Actual behavior | Next decision |
|---|---|---|
| `fetch_latest` / `parse_telegram` | Latest-page HTTP fetch and raw post parsing | Keep; improve catch-up separately |
| `clean` | Lexical cleanup, no semantic interpretation | Keep for TF-IDF; preserve raw offsets for future extraction |
| `training_rows` | Uses raw text and only the sign of historical sentiment polarity | Audit label quality before expanding training |
| `classify` | One TF-IDF/logistic model plus BTC keyword flag | Keep as baseline; evaluate at most one semantic replacement |
| Historical `parse` / `assessment` | Contains entities, evidence, attribution and speculation cues | Inspect/reproduce these fields before adding overlapping components |
| `ingest` | SQLite persistence and per-post-version deduplication | Keep; move model execution outside long write transactions if inference becomes slow |
| Daily feature aggregation | Absent from this news package | Define time-safe output contract for forecasting |

In 9,471 stored posts, 2,587 have nonempty attribution_cues, 413 speculative_cues,
4,415 affected_entities, and 3,238 event_evidence. These are existing heuristic
outputs, not verified semantic annotations. The runtime currently ignores these
fields except historical sentiment polarity during training. Source implementations
for the named structural-rs/importance-rs processors were not found in this
codespace's file inventory; stored outputs alone cannot reproduce them for live posts.

The saved TF-IDF pipeline file is 710,074 bytes (about 0.68 MiB). This is serialized
artifact size, not process RAM. Loading several neural models would add separate
weight and activation allocations; no combined runtime footprint was measured.

Revised minimal deployment proposal: retain HTTP ingestion, one shared lightweight
normalizer/parser, one classifier or semantic extractor, and SQLite. Benchmark
neural candidates sequentially offline and deploy only a winner that justifies its
cost. Omit embedding retrieval, local LLM fallback, and multiple sentiment models
until an IRIS evaluation demonstrates a need. Rule-based semantics is an initial
auditable baseline, not a claim of general language understanding.

Build an evaluated event-understanding layer before replacing the current model.
Shortlist GLiNER2.5 for structured extraction, FinBERT for financial sentiment,
CryptoBERT as a separate crypto-stance challenger, and MiniLM for candidate event
matching. Retain the TF-IDF baseline. These are experiment candidates, not models
already validated on Watcher.Guru. No new model weights were downloaded or run in
this research pass, and the application/dependencies were not changed.

## Evidence from this workspace

The 9,471 raw posts have median 17 whitespace-delimited words, p95 27, p99 39,
maximum 310. These are word counts, not tokenizer lengths. Long-context machinery
is not the first priority, but recap posts still need claim/event segmentation.

Regex screening over raw_text found 496 posts with negation/denial cues, 2,924
with attribution cues, and 415 with modality/rumor cues. These overlapping counts
are screening signals, not verified annotations. Patterns respectively:
`not|no|never|denies|denied|false`, `says|said|according to|reports`, and
`may|might|could|expects|expected|plans|proposes|rumor|rumors`, with case-insensitive
word boundaries. Explicit `bitcoin|btc` screening finds 2,285 posts; the historical
README says 2,295. Resolve that counting-definition discrepancy before reusing
the older number in reporting; keyword absence is not irrelevance.

Actual predictions from the saved baseline (maximum softmax probability):

| Synthetic diagnostic input | Prediction | Probability |
|---|---|---:|
| SEC approves Bitcoin ETF. | neutral | 0.9789 |
| SEC has not approved Bitcoin ETF. | neutral | 0.7116 |
| Analysts expect SEC to approve Bitcoin ETF. | positive | 0.9922 |
| Exchange was hacked. | negative | 0.9766 |
| Exchange denies it was hacked. | negative | 0.8197 |

These examples diagnose missing explicit semantics; they are not a gold sentiment
benchmark. A denial can itself have ambiguous sentiment. The structural requirement
is that a denied hack must not be recorded as an asserted hack.

GPU inspection reports NVIDIA GeForce RTX 5060 Ti, 16,311 MiB. This supports trying
compact encoders locally, but does not establish PyTorch CUDA compatibility,
simultaneous model fit, throughput, or training capacity. The current environment
uses Python 3.13 and the lightweight sklearn baseline.

## Components and their boundaries

| Component | Candidate | Proposed responsibility | Main acceptance question |
|---|---|---|---|
| Text structure | spaCy sentence/dependency parser plus explicit rules | Boundaries, quoting cues, grammatical relations; preserve offsets | Does it handle headlines, abbreviations, and nested denial? |
| Entity/event extraction | fastino/gliner2.5-base-v1 | Actors, targets, event triggers, quantities, evidence spans, attributes | Correct event-role links and assertion status on human-labelled posts? |
| Extraction fallback | fastino/gliner2-base-v1 | Earlier extraction checkpoint for comparison | Does 2.5 improve task quality or operational behavior? |
| Financial sentiment | ProsusAI/finbert | Sentence/event-context sentiment baseline | Transfers from financial news to this crypto source? |
| Crypto stance | ElKulako/cryptobert | Bearish/neutral/bullish stance challenger | Does social-post stance match our intended target definition? |
| Event retrieval | sentence-transformers/all-MiniLM-L6-v2 | Retrieve likely repeated-event candidates | High recall without merging denials, updates, or unrelated similar events? |
| Larger embedding challenger | BAAI/bge-m3 | Multilingual/longer-context retrieval if needed | Material gain over MiniLM on our event pairs? |
| Difficult-case extraction | Local LLM through LM Studio JSON schema | Propose structured claims for review | Evidence support, abstention, and latency, beyond valid JSON? |

spaCy exposes syntactic annotations; full negation scope and factuality remain our
task-specific work. A negation dependency or a keyword alone does not solve nested
claims. [spaCy linguistic features](https://spacy.io/usage/linguistic-features)

GLiNER2.5 base is an English 194M-parameter boundary model, with entity spans,
relations, structured records, and span attributes. Its detailed card requires
`AutoExtractor`; the generic autogenerated example still shows the legacy loader.
Use the detailed instructions and test the imported API. A model supporting these
outputs does not establish financial-domain extraction accuracy.
[GLiNER2.5 card](https://huggingface.co/fastino/gliner2.5-base-v1)

FinBERT was adapted to finance and fine-tuned on Financial PhraseBank for three-way
sentiment. It does not expose a target-conditioned API in its ordinary classifier.
Simply prepending BTC does not create a validated target-specific model.
[FinBERT card](https://huggingface.co/ProsusAI/finbert)

CryptoBERT uses crypto social text and a classifier trained on labelled StockTwits
posts, with bearish/neutral/bullish labels. Its card recommends staying within
128 tokens. Do not silently map bullish stance to realized BTC price impact or
combine its scores with FinBERT as though their targets were identical.
[CryptoBERT card](https://huggingface.co/ElKulako/cryptobert)

MiniLM produces 384-dimensional vectors and truncates beyond 256 wordpieces by
default. It is the first retrieval experiment for short English posts. BGE-M3
provides 1,024 dimensions, multilingual support and up to 8,192 tokens; its extra
capacity needs justification here. Neither embedding is a factuality verifier.
[MiniLM](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2),
[BGE-M3](https://huggingface.co/BAAI/bge-m3)

LM Studio supports JSON-schema output through chat completions. Structural validity
does not prove factual correctness. Require evidence spans, nullable unknowns,
schema checks and a review path; never let article text become executable tool
instructions. Start without autonomous tool access or external retrieval.
[LM Studio structured output](https://lmstudio.ai/docs/developer/openai-compat/structured-output)

## Arline: what transfers

Current local code inspected in `E:/Developen/Github/Arline Studio` includes
`src/core/semantic_core.py`, `src/state_extractor/claim_extractor.py`,
`src/state_extractor/semantic_segmenter.py`, and `src/memory/embedding.py`.

Reuse the design ideas: traceable evidence, separate claims and events, temporal
scope, explicit versus inferred fields, unresolved queues, and interchangeable
embedding providers. The local narrative extraction rules and authority hierarchy
do not directly transfer. A news publisher or quoted speaker has no equivalent
to an authoritative narrator who establishes story-world truth. Preserve competing
claims instead of choosing a true claim using a fixed source ranking.

The public README and local checkout describe different development states; the
above implementation observations are from the local files, not a claim that the
public default branch contains all of them.
[Public Arline repository](https://github.com/RetrixAlfariz/Arline-Studio)

## Proposed event representation

Store multiple claims per post. Separate orthogonal dimensions instead of one
exclusive status label:

```text
event_id, article_version_id
actor, action, target, event_type
polarity: affirmed | negated | unknown
modality: asserted | possible | expected | planned | conditional | unknown
attribution: speaker + quoted/reported span
event_time: explicit value or unresolved expression
quantity: value + unit + linked event role
btc_relevance: direct | indirect | unrelated | unclear
target_sentiment: positive | negative | neutral | mixed | unclear
evidence: start/end offsets into preserved text, per extracted field
extractor_id, model_revision, schema_version, processed_at
```

For “Analysts expect SEC to approve Bitcoin ETF”, the attribution is analysts,
the embedded action is SEC approval, modality is expected, and occurrence is not
established. For a denial, preserve both the denial speech act and the denied
proposition. Do not turn an expectation into a completed regulatory decision.

Preserve punctuation, negators, cashtags, quantities and quotes for neural parsing.
Maintain raw-to-normalized offset mapping if any normalization changes lengths.
The current TF-IDF cleaning should remain specific to that baseline.

## Similarity, novelty and causal timing

Use embeddings for candidate retrieval, then compare actor/action/target, event
time, quantities, polarity and modality. Link same-event updates without deleting
them. Separate exact duplicates, repeated claims, material updates and conflicting
claims. A denial can be very similar to the original allegation.

Choose similarity thresholds and lookback windows on development event pairs;
there is no universal 0.8/0.9 cosine threshold. A vector database is unnecessary
for the initial bounded corpus/window; normalized NumPy vectors can suffice.

Historical embeddings/clusters must be constructed using only earlier available
articles, never future cluster members. Record publication, observation, event,
and processing times separately. In operational replay use feature_ready_at, no
earlier than observation and semantic processing completion. Historical publication
time is only a documented availability approximation for backfilled data.

A model released in 2026 applied to 2022 articles is a retrospective feature study,
not proof of a model deployable in 2022. Save checkpoint releases/training-cutoff
information and distinguish retrospective NLP from a strict historical simulation.

## Evaluation resources and experimental order

SENTiVENT is a useful schema and annotation reference for financial events,
arguments, negation and modality. Its company-news domain is auxiliary, not crypto
ground truth. SemEval-2017 Task 5 explicitly evaluates sentiment toward mentioned
companies/stocks and is useful for designing a target-aware task. Financial
PhraseBank is already part of FinBERT training and should not be presented as an
independent held-out test of that pretrained checkpoint.
[SENTiVENT paper](https://doi.org/10.1007/s10579-021-09562-4),
[SENTiVENT guidelines](https://github.com/GillesJ/sentivent-event-annotation-guidelines),
[SemEval task](https://aclanthology.org/S17-2089/)

FinCausal evaluates extraction of expressed cause/effect relationships. That is
useful later for separating what a source claims caused an event; it cannot
establish an actual causal market effect.
[FinCausal](https://aclanthology.org/2022.fnp-1.16/)

Proposed pilot, not a completed annotation set:

1. Develop guidelines on 100 older posts, independently label with two reviewers,
   adjudicate differences, then freeze the schema.
2. Label a separate 300-post development sample and 300-post later-period random
   test sample. Track coverage and expand rare classes where necessary. These
   counts are a budget proposal, not a statistical sufficiency claim.
3. Maintain a separate challenge set for negation, attribution, speculation,
   multi-entity sentiment, amounts, and recaps. Report it separately from random
   sampling, following behavioral-testing principles.
4. Evaluate TF-IDF, FinBERT and CryptoBERT against aligned human labels; report
   any taxonomy mapping explicitly. Evaluate extraction and relevance separately.
5. Compare semantics-only and semantics-plus-context variants. Add LLM fallback
   only if it resolves measured errors at an acceptable latency.
6. Test forecasting with price-only, price plus article counts, plus sentiment,
   and plus semantic events on identical purged walk-forward origins/horizons.
   Tune inside the development folds. Inspect effects across folds, not one score.

Annotation samples must be event-group aware across boundaries. Remove repeated
event overlap from held-out evaluation rather than moving future posts into train.
Do not expose model suggestions to gold annotators before independent annotation.
[CheckList behavioral testing](https://aclanthology.org/2020.acl-main.442/)

Report per-class F1/recall, entity/argument span F1, assertion-state confusion,
target-sentiment F1, duplicate-link precision/recall, abstention coverage, and
calibration. A model's confidence is not the probability that a news claim is true.
For runtime report cold load, warm p50/p95, peak RAM/VRAM, batch size, backlog
recovery and error rate on the actual Windows machine. Candidate operational gate:
a page-sized batch finishes within the 60-second poll interval; stronger latency
targets must follow a benchmark, not model-card advertising.

## Dependency feasibility checked

PyPI metadata and uv resolver were queried on the research date. No installation
was performed. `gliner2[local]==2.0.0` requires Transformers <5, while
`sentence-transformers==6.0.1` requires Transformers >=5,<6. A joint resolution
failed as expected. Resolving GLiNER2 2.0.0 with Sentence Transformers <6 succeeded,
selecting Sentence Transformers 5.7.0 and Transformers 4.57.6 on the current Python.
This is dependency-resolution evidence only, not successful imports/inference.

Start the experiment in an isolated environment; pin the complete resolved stack,
checkpoint revisions and tokenizer versions after real import/inference tests.
The alternative is separate extraction and embedding workers. Verify GPU execution
with an actual tensor operation; nvidia-smi alone does not prove CUDA support.
[GLiNER2 dependency declarations](https://raw.githubusercontent.com/fastino-ai/GLiNER2/main/pyproject.toml),
[GLiNER2 release metadata](https://pypi.org/pypi/gliner2/2.0.0/json),
[Sentence Transformers release metadata](https://pypi.org/pypi/sentence-transformers/6.0.1/json)

## Unresolved before implementation selection

Watcher.Guru human gold labels, target-sentiment policy, extraction quality,
tokenization overflow, actual CUDA compatibility/latency, event-link thresholds,
catch-up collection completeness, and forecast uplift remain unverified. The
recommended next deliverable is a small reproducible component benchmark, not
immediate replacement of the working pipeline or a claim of improved forecasts.
