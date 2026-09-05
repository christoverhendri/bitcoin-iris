# IRIS pipeline abuse review — 2026-09-05

Scope: local data pipeline, parser inputs, storage, fetch destination and exports.
Opheline performed code inspection and local adversarial/recovery tests. No attack
was made against Telegram or another external service. This is not a penetration
test certificate or a claim of complete security.

## Addressed paths

| Abuse/failure | Mitigation and evidence |
|---|---|
| Huge JSONL line / malformed JSON | Bounded binary line reads; reject/quarantine and continue; tests include 300 KB line and NaN |
| Repeated triggers / oversized text | Parser input and trigger budgets; adversarial tests |
| Whitespace regex amplification | Removed an optional leading-whitespace scan from the quantity matcher; long whitespace regression case |
| SQL-looking source ID | Strict numeric id validation and parameterized SQL; table survival test |
| Source URL used for SSRF | Fetch destination is fixed; numeric pagination only; imported URLs never fetched; derived URL reconstructed |
| Redirect to another destination | HTTP redirects refused; mock test |
| Oversized decompressed HTTP body | Streamed decoded-byte cap; mock response test |
| Forged scores/parser output/observation time | Derived fields regenerated from validated text; metadata poisoning test |
| Future/invalid publication time | Quarantine outside allowed date range or >5 minute skew; future weight is zero within tolerance |
| Duplicate flooding | Unique raw-version key; exact-text novelty suppression in exports; repeated insert test |
| Concurrent cursor writers | Per-database OS lock with release on process exit; second-writer rejection test |
| Crash between fetch and parse | Raw page saved first; pending page replay test |
| Crash/parser error after raw ingestion | Raw inbox retained; explicit retry and idempotent replay tests |
| Catch-up interruption | Anchor and older-page cursor committed with raw posts; multipage restart test |
| Formula-bearing source text in CSV | Daily CSV omits raw text; baseline training CSV escapes formula prefixes; regression checks |
| Terminal control/bidi spoofing | Control characters and directional overrides quarantined on durable ingestion |
| Untrusted model deserialization | Data commands do not load joblib; legacy model commands remain trusted-local-artifact only |

SQL placeholders are the documented way to bind untrusted values, rather than
interpolating them into statements. [Python sqlite3](https://docs.python.org/3/library/sqlite3.html)
CSV quoting alone does not prevent spreadsheet formula execution; source text
needs special handling or omission. [OWASP CSV injection](https://owasp.org/www-community/attacks/CSV_Injection)
Requests timeouts are not whole-download deadlines; the implementation adds a
body-loop time/size budget while retaining TLS verification.
[Requests documentation](https://requests.readthedocs.io/en/latest/user/advanced/)

## Residual risks

- An attacker who can publish source content can manipulate lexical relevance
  and event cues. Capped factors limit amplification, not semantic poisoning.
- Synonym changes, zero-width characters and paraphrases can evade exact-text
  deduplication. A source can publish many distinct posts. No semantic fraud
  detector or cross-source corroboration has been built.
- The source timestamp is not independently authenticated. Range validation
  cannot detect a plausible but false timestamp. Operational exports use local
  readiness; publication-mode exports remain retrospective.
- JSONL/raw HTML may contain dangerous markup or instructions as inert data.
  Downstream UIs must escape text, and future LLM integration must treat it as
  untrusted content. The current pipeline does not execute source text or follow
  URLs inside it.
- Denial/modality/role parsing is heuristic. Counts and weights are not gold labels,
  verified occurrence probabilities, or investment recommendations.
- Local administrators or processes with filesystem access can modify SQLite or
  replace model artifacts. There is no remote server/authentication surface here.
- SQLite budget is a bounded-growth guard, not a complete disk quota. Exports,
  WAL and retained raw pages consume additional space; archive/monitor explicitly.
- Strict HTML assumptions can break on source changes, and inaccessible/deleted
  posts remain gaps. Live pagination was exercised, but extended outage recovery
  and uninterrupted long-running service availability are not proven.

## Verification recorded

28 automated tests passed before the final documentation pass. Full historical
run: 9,471 raw posts stored/processed, zero quarantined/failed; 705 missing publication
timestamps excluded from a retrospective daily export, leaving 8,766 records.
An interrupted historical import was restarted with 3,841 duplicates skipped and
5,630 remaining records inserted. Live cycle: 17 inserted/processed, next cycle
17 duplicates and zero new processing. An actual `before=14940` request returned
older post ids 14919..14938. Fixtures test cursor replay, failure and abuse cases;
they do not establish real-world semantic accuracy.
