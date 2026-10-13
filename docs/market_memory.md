# IRIS Market Memory: path order and activity-clock experiment

Status: **implemented research prototype, not a validated predictive advantage**.
Entry point: `python -m research_models.market_memory`. Research view:
`/research/market-memory`. No collector, network request, GPU, node installation,
paid API, scheduler, or live Forecast promotion is started by this module.

## Scientific contract

Question: does the order of completed intraday price/activity observations add
information beyond summaries, recency, and ordinary periodic patterns?

- B0: 12 conventional past-return, realized-variance, volume, range and concentration features.
- B1: B0 plus 12 past-only recency/seasonality controls (24 total).
- B2: B1 plus six signed areas from the second-level signature of a four-channel
  piecewise-linear path (30 total).
- B3: B2 plus six volume-versus-variation clock diagnostics (36 total).
- B2_SHUFFLED: B1 remains unchanged; the six areas are recomputed after a seeded
  within-day joint permutation of hourly return/volume pairs. This model is
  **refitted on its own transformed features**, using the same chronological splits.
- Benchmarks: historical medians, last realized variance, 7-day-half-life EWMA,
  and a three-predictor log-HAR. All receive the same test origins per horizon.

The source archive has already been explored. Walk-forward results on it are
out-of-sample relative to each fit, **not an untouched confirmatory holdout**.
No new name or combination of existing mathematical methods establishes novelty.

## Source integration and missingness

Read the existing canonical `coinbase_hourly.sqlite` using a read-only SQLite
snapshot transaction, or pass an existing hourly Parquet warehouse. The latter
reuses `market_data.hourly_prices.verify_hourly` before analysis. Each effective
candle's payload hash is checked, not merely its shape. Accept only the explicit
Coinbase Exchange BTC/USD / 3600-second source identity.

SQLite analysis uses latest effective versions and detects tied contradictory
revision timestamps. It does **not** reconstruct historical availability from
mutable `last_seen_at`. The content digest covers effective timestamp, payload
hash, and observation evidence, including WAL-visible data in the read transaction.
It is not falsely described as a hash of the database's main file alone.

A global archive coverage failure does not override integrity: use only continuous
valid windows, with exclusions reported. A complete daily observation requires
24 hourly returns **and the preceding hour's close**, not merely 24 closes.
All 30 feature days and every target day must qualify. Zero daily volume gives
an undefined activity clock; RV <= 1e-16 gives an undefined normalized path.
Those days are explicitly excluded for all candidates, never forward-filled.
This conservative policy can exclude substantially more training windows than
there are individual missing source hours. It is a disclosed selection policy.

`--as-of` is a completed-bar/label cutoff, **not a historical source-vintage query**.
Running/fitting/predicting requires `--allow-retrospective`. Artifacts remain
`historical_backtest_safe=false`, `model_ready=false`, `status=research_only`.

## Mathematics and numerical choices

For the 24 hourly log returns in completed UTC day d:

```
R_d = sum(r_dh)
RV_d = sum(r_dh ** 2)
X increments = [1/24, r_dh/sqrt(RV_d), volume_dh/sum(volume_dh), r_dh**2/RV_d]
```

For a linear path step `dx`, exact Chen concatenation through level two is:

```
S2 <- S2 + outer(S1, dx) + outer(dx, dx)/2
S1 <- S1 + dx
A_ij = (S2_ij - S2_ji)/2, i<j
```

Four channels give 21 signature coordinates including the constant. B2 retains
only the six antisymmetric areas, avoiding redundant symmetric products and
constant endpoint channels. This remains a low-order representation, not a
complete reconstruction of the market's hidden state.

Signatures are invariant to reparameterization of the **same** augmented path.
B3 therefore does not claim information from simply retiming that path. It adds
observable clock disagreement: variance/volume temporal centroids, supremum
cumulative gap, signed mean gap, Jensen-Shannon divergence, and signed peak gap.

Finite-memory weights use `2**(-age_hours / half_life_hours)` over a complete
30-day history, normalized by their sum. The exact constant-forcing ODE update
uses `gain=-expm1(-log(2)*elapsed/half_life)` rather than forward Euler. No update
bridges an unobserved gap. Hour-of-day templates are estimated from the preceding
29 complete days, excluding the current day; weekday terms are deterministic.

Targets, for h in {1,7,30} calendar days after the feature origin:

```
y0 = log(mean(RV of the next h complete days))
y1 = sum(next h*24 hourly log returns)
D  = max(0, -min(cumulative future hourly log return))
y2 = log1p(100 * D)
```

The primary target is y0. Return and adverse-excursion heads are exploratory.
D is monitored at hourly closes, not ticks or intrahour lows. RV is unannualized
hourly-derived daily variation, not the variance of daily closes or latent volatility.

Ridge minimizes `mean((y-Xb)^2) + alpha*||b||^2` with an unpenalized intercept.
Thin SVD uses `s/(s*s+n*alpha)` rather than explicitly inverting X'X. Centering
and scaling are fitted only on the relevant training partition. BLAS is limited
to one thread using the existing `threadpoolctl` dependency.

## Evaluation protocol (fixed before viewing the implemented model's results)

Default: final 25% of eligible origins split into 3 chronological outer blocks.
Each fold uses >=180 training samples, 60 earlier tuning origins, and 90 separate
calibration origins. Every boundary is purged by **label endpoint timestamp**:
training endpoints precede tuning; refit endpoints precede calibration;
calibration endpoints precede the first test origin. Missing days do not collapse
calendar time into sample index time.

Alpha candidates are {0.01,0.1,1,10}; choose by tuning y0 MAE only. Refit on
matured pre-calibration labels. Learn signed 5/50/95% residual quantile offsets
only from calibration. All candidates use the same origin set and split policy.
Residual intervals have no distribution-free conditional coverage guarantee under
serial dependence. They may be badly miscalibrated, and that result is retained.

For QLIKE, mean variance uses empirical residual smearing:
`exp(predicted_log_variance + log(mean(exp(calibration_residual))))`.
Exponentiating the central log prediction alone would not generally give a mean.
No target or unstable prediction is silently clipped to manufacture a good score.

Reports include log-variance median MAE, pinball loss, QLIKE, 90% interval coverage,
interval width, return MAE/pinball and adverse-excursion MAE. Summaries equally
weight folds. Paired circular block-bootstrap diagnostics use h and 2h blocks,
separately within each uninterrupted origin segment and each fold. Intervals are
exploratory, preserve original segment weights, and are not multiplicity-adjusted.
One shuffle realization is a diagnostic, not a full permutation significance test.

Final saved models repeat chronological tuning/refit/calibration on matured labels.
**Every candidate is saved; there is no test-selected production winner.**

## Commands

From repository root; existing `requirements.txt` supplies NumPy and threadpoolctl:

```bash
python -m pip install -r requirements.txt
python -m research_models.market_memory inspect \
  --database artifacts/market/coinbase_hourly.sqlite \
  --as-of 2026-10-12T03:05:00Z --horizon 7

python -m research_models.market_memory run \
  --database artifacts/market/coinbase_hourly.sqlite \
  --as-of 2026-10-12T03:05:00Z --horizons 1,7,30 \
  --allow-retrospective --output artifacts/research/market_memory_v1

python -m research_models.market_memory verify \
  --artifact artifacts/research/market_memory_v1

python -m research_models.market_memory predict \
  --database artifacts/market/coinbase_hourly.sqlite \
  --artifact artifacts/research/market_memory_v1 \
  --as-of 2026-10-12T03:05:00Z --horizon 7 --variant B2 \
  --allow-retrospective
```

Use a cutoff appropriate to your actual snapshot, not blindly the example date.
Alternatively use `--warehouse artifacts/warehouse/coinbase_hourly_full` after
installing `requirements-warehouse.txt`. A single artifact is limited to 250,000
source hours; no blind concatenation of mismatched files. There are at most three
horizons, five folds, six penalty values and 2,000 bootstrap replicates per run.
New output directories are reserved exclusively; failures remove only that run's
new directory. No previously published artifact is overwritten.

Outputs: `summary.json`, `predictions.csv`, `models.json`, SHA-256 `manifest.json`.
Saved coefficients/scales and calibration are plain JSON, never unpickled code.
Forecast entry points intentionally cannot consume this research-specific schema.

## Terminal integration

Set `IRIS_MARKET_MEMORY_DIR` in `terminal/.env.local` to the **absolute** completed
output directory and restart. Open **Research > Market Memory**. Without an artifact,
the page says unavailable, not mock performance. No query parameter selects a file.
The server validates source/status/schema/numeric fields and the summary's manifest
checksum. Full model/CSV hashes remain the CLI verifier's responsibility; the UI
says **report checksum verified**, not certified forecast or full data verification.
The terminal does not require Python, DuckDB, or fitting at startup/page render.

## Remaining hypotheses

- Event-response residual state requires timestamped events, control windows and
  matured responses; it is not silently approximated by headline sentiment here.
- UTXO-cohort hazards need defined populations and previous-output coverage. Our
  bounded block pilot cannot justify a global holder/selling metric.
- Larger signature depth, neural heads, adaptive calibration and clock-time targets
  require separate hypotheses and held-out experiments, not tuning this test set.
- Multi-seed surrogates, stronger time-of-day normalization and a genuinely unseen
  evaluation period are prerequisites for a confirmatory novelty claim.

References: [Chevyrev & Kormilitzin, signature primer](https://arxiv.org/abs/1603.03788),
[NumPy linear algebra](https://numpy.org/doc/stable/reference/routines.linalg.html),
[IRIS data quality](data_quality.md), [hourly contract](hourly_backfill.md).
