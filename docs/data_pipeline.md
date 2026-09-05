# IRIS durable data pipeline

Use `data` commands for collection and parsing. They never load a sentiment model,
joblib artifact, neural weights, or GPU runtime. Existing `train`, `predict`, `poll`
and model `export` remain compatibility commands; they are not the durable inbox.

## Run from the repository root

```powershell
# One live cycle: durably collect, then process pending raw records.
.venv/Scripts/python.exe -m news_pipeline data run

# Continuous operation; Ctrl+C to stop. No background service is installed.
.venv/Scripts/python.exe -m news_pipeline data run --watch --interval 60

# Inspect backlog, failures, quarantine count and catch-up checkpoint.
.venv/Scripts/python.exe -m news_pipeline data status

# Offline recovery/processing, including at most 3 attempts on failed records.
.venv/Scripts/python.exe -m news_pipeline data process --retry --limit 1000

# Explicit reset after correcting the underlying parser/operational problem.
.venv/Scripts/python.exe -m news_pipeline data requeue
```

Default database: `artifacts/news/data.sqlite`. `--database` selects another file.
One writer per database is enforced with an OS file lock; different databases can
be used independently. Locks release on process exit, including crashes. SQLite
uses WAL and parameterized statements.

## Historical import and exports

```powershell
.venv/Scripts/python.exe -m news_pipeline data import --input "bitcoin iris/dataset/kategori/textual_news/watcher_guru_articles.jsonl" --database artifacts/news/history.sqlite
.venv/Scripts/python.exe -m news_pipeline data process --database artifacts/news/history.sqlite --limit 10000

.venv/Scripts/python.exe -m news_pipeline data export --database artifacts/news/history.sqlite --as-of 2026-09-05T23:59:59Z --output artifacts/news/articles.jsonl
.venv/Scripts/python.exe -m news_pipeline data daily --database artifacts/news/history.sqlite --as-of 2026-09-05T23:59:59Z --time-basis publication --output artifacts/news/daily.csv
```

Choose an appropriate explicit cutoff. Output files are created exclusively;
existing files are not overwritten. Input JSONL is read in bounded lines, so one
invalid or oversized record is quarantined and later records continue. Reimport
is idempotent and can resume an interrupted import by scanning the source again.
Import/derived writes commit in batches of up to 100: a crash can roll back the
current batch, which is recovered on rerun. The source file remains unchanged.

## Storage contract

| Table | Contents |
|---|---|
| `fetch_pages` | Bounded raw HTTP body, request cursor, observation time, parse status/error |
| `raw_posts` | Source id, original text/payload, publication time, trusted observation time, text/version hashes, processing state/attempts |
| `parsed_posts` | Derived `iris-parsed-post/v1` JSON by raw id and parser version, feature-ready timestamp |
| `quarantine` | Deduplicated rejection reason, bounded sample and fingerprint |
| `checkpoints` | Latest completed source anchor and partial catch-up position |

The raw page commits before structural parsing. Valid raw posts and page cursor
commit together before semantic processing begins. A process crash after page
save replays the pending page. A normal page parsing failure keeps the failed body
for audit and retries HTTP at the same cursor next run. A semantic failure leaves
the original post intact and records a bounded error. A parser-version change
produces a new derived row; failed records with exhausted attempts need requeue.

Raw version identity includes text and normalized publication time. Post edits and
timestamp corrections therefore remain separate versions. Imported observation
times, URLs, weights and assessments cannot override locally generated processing
metadata. Original imported payloads remain available as untrusted provenance.

## Catch-up behavior

Initial collection intentionally establishes an anchor from the latest preview
page; it does not claim to retrieve all history. Subsequent cycles traverse
`?before=<numeric id>` until reaching/passing the prior anchor. If `--max-pages`
(default 5, maximum 100) is exhausted, the older-page cursor is saved and resumed
next time. Posts published during catch-up are collected in a later cycle.

Media-only entries advance the source cursor and are counted as skipped, without
inventing textual content. Invalid text records are quarantined while traversal
continues. Deleted posts, inaccessible history and edits outside revisited pages
cannot be reconstructed from this preview. A nonadvancing page raises an error;
the collector never silently declares catch-up complete on a blocked/empty page.
Daily collection coverage remains `unknown` because preview traversal cannot prove
complete day-level source availability. Missing days are omitted, not zero-filled.

## Time-safe exports

Default `--time-basis ready` includes only rows with feature_ready_at <= as_of.
Importing old history today does not pretend those parsed features were available
in the past. Article export selects the latest known eligible version per source
post. Daily export selects the latest eligible version per post per availability
day, preserving earlier-day versions when later edits arrive.

`--time-basis publication` is a retrospective research mode. It uses source
publication dates, excludes missing timestamps, and does not enforce historical
model/processing availability. It cannot prove strict historical deployability or
recover edit availability. Output explicitly records that mode.

Exact normalized duplicate text is detected in eligible availability order, using
only records at/before the cutoff. Duplicate posts get zero novelty weight.
Daily totals count all posts but count text-derived features only for unique text.
Updates with different text remain eligible; semantic near-duplicate matching is
not implemented. Daily output contains date, post/unique counts, BTC mentions,
supported-event counts, review count, weight sum, cutoff, parser version and mode.
It does not contain source text or price-impact predictions.

## Post weighting

`news_pipeline/weighting.py` implements `iris-post-weight/1.0.0`:

```text
post_weight = relevance × evidence × certainty × timestamp_quality × freshness × novelty
```

| Factor | Current values |
|---|---|
| relevance | 1.0 for explicit BTC alias; 0.3 otherwise (unknown is not irrelevant) |
| evidence | 1.0 if any supported event trigger; 0.5 otherwise |
| certainty | 0.5 when parser needs review; 1.0 otherwise |
| timestamp_quality | 1.0 for valid publication time; 0.5 if missing |
| freshness | `2 ** (-age_hours / 24)`; zero for a future publication time |
| novelty | 0 for an earlier exact normalized duplicate in the export; 1 otherwise |

Weights are bounded 0..1, with factors, version and as-of time included. Stored
processing weights are per-post previews (novelty=1); exports recompute them with
cutoff-aware duplicate detection. Article exports decay at the export cutoff.
Daily weights decay at the end of each availability day, capped by as_of, so old
days are not repeatedly decayed just because the export runs later. Missing
publication times retain freshness=1 with reduced timestamp quality; they are
excluded entirely from publication-time exports.

Examples at publication time: explicit BTC + supported simple event = 1.0;
same post under uncertainty/review = 0.5; the first example after 24h = 0.5;
an exact duplicate in an export = 0.0. No numerical magnitude, repeated keyword
count, views or followers boost the score. Source reliability is not invented.

These are explicit starting coefficients, not fitted parameters, calibrated
confidence, objective importance, or expected returns. Negated claims may be
important; the review discount is conservative and needs human evaluation.
Do not drop low-weight posts from raw storage. Validate this ranking and its
forecast contribution before using it as a decision signal.

## Resource limits

- 2 MiB decoded HTTP page; 100 source nodes/page.
- HTTP connect/read timeout 10/15 seconds; 30-second body-loop budget checked
  between chunks, so it is not a strict whole-request deadline.
- 256 KiB imported record; 16,000 text characters; 2,000 parser words;
  128 supported event-trigger matches.
- 512 MiB SQLite logical size guard before inserts; one bounded insert can cross
  the threshold. WAL, output files and temporary export memory add overhead.
- At most three processing attempts before explicit requeue.

No automatic data deletion occurs at the database budget. Archive/rotate the
database before continuing. Future production needs include retention policy,
disk monitoring and long-running availability tests.
