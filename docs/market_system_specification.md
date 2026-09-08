# Market system specification and Quant Iris integration decision

Date: 2026-09-08. Status: **research pipeline and terminal adapter implemented;
production promotion has not passed**. See [implementation and measured results](forecast_pipeline.md).

The order of work is system characterization -> variable determination -> Quant
Iris mapping -> controlled modelling -> integration. A convenient implementation
does not determine which variables belong in the market model.

## 1. Define the system before choosing a model

The initial observation boundary is BTC/USD spot, sampled in completed UTC daily
bars. This is a vendor observation of a fragmented market, not the entire Bitcoin
economy. The primary forecasting horizon is 30 calendar days to match the terminal;
7 days is a secondary experiment matching the existing news model. Intraday
execution, perpetual futures and other quote currencies require separate contracts.

Let P_t > 0 be the completed close of day t, x_t = log(P_t), and
r_t = x_t - x_(t-1). Define F_t as information actually available when that close
and the selected features are ready. A useful candidate system class is:

```text
s_(t+1) = f_theta(t)(s_t, u_t, eta_(t+1))
y_t     = g(s_t) + observation_error_t
r_(t+1) = mu_t + sigma_t * epsilon_(t+1), sigma_t >= 0
goal    = distribution(sum(r_(t+i), i=1..h) | F_t)
```

Here s_t is latent state; y_t consists of measured prices and other observations;
u_t denotes observed external drivers, which need not be causally exogenous.
Time-varying theta permits adaptation. This is a hypothesis class, not an identified
physical law. Conditional noise assumptions, finite moments, Markov order, the
existence of discrete regimes and causal directions still require evidence.
Daily closes alone cannot identify all latent states or distinguish intraday jumps
from large continuous moves. Do not infer determinism, chaos, equilibrium,
power-law price growth or four economic regimes from a fitted curve.

The exact return identity justifies a log-return target; it does not imply that
return direction is forecastable. Financial empirical research motivates examining
distribution and dependence across timescales, rather than selecting a parametric
model first ([Cont, 2001](https://www.stat.rice.edu/~dobelman/courses/texts/stylized.cont.2001.pdf)).

For the daily research contract, date-D close is assumed available at D+1 00:00
UTC. Actual vendor latency must be measured before deployment. A feature's usable
time is max(source release time, ingestion time, processing completion time).
If this is later than the origin, move the origin or exclude the observation.

Targets, relative to the close at t:

```text
R_(t,h) = log(P_(t+h) / P_t)
V_(t,h) = sqrt(sum(r_(t+i)^2, i=1..h) / h)
```

V is unannualized future daily RMS, not standard deviation or full intraday realized
volatility. Forecast R quantiles at 0.1, 0.5 and 0.9; report interval coverage and
width. Monotonic exponentiation maps return quantiles to price quantiles. The
exponent of a mean log return is not generally the mean future price. Keep trading
actions and their cost model separate from these statistical targets.

## 2. What the current data actually supports

Run the new diagnostic without downloading data or fitting a forecasting model:

```powershell
.venv-model/Scripts/python.exe -m news_pipeline.system_diagnostics --as-of 2026-09-08T00:00:00Z --output artifacts/system/market_diagnostics_20260908.json
.venv-model/Scripts/python.exe -m unittest discover -s tests -p test_system_diagnostics.py -v
```

Use a new output filename for another run. The modelling environment uses the
existing `requirements-model.txt`; no new dependency is introduced. The diagnostic
accepts `--prices` with `date,Close`, rejects missing/duplicate/intraday dates,
nonfinite/nonpositive closes and gaps, and excludes unfinished bars. It records
the input hash, cutoff, sample moments, autocorrelations and chronological windows.

Verified input: `bitcoin iris/dataset/btc/btc_daily_features.csv`, SHA-256
`ac44470300b9122f43386bb86fef361657f6dd40e874ae8d7a08e493852d6128`.
4,241 closes, 2015-01-01 through 2026-08-11, producing 4,240 daily returns.
The last assumed bar availability is 27 days before the diagnostic cutoff.
This is historical characterization, not a current forecast.

| Observation | Measured result | Consequence for model design |
|---|---:|---|
| Return ACF, lags 1 / 7 / 30 | -0.0263 / -0.0211 / 0.0044 | Include zero-return baseline; trend inputs remain hypotheses |
| Absolute-return ACF, same lags | 0.2162 / 0.1792 / 0.0772 | Test persistent conditional scale with trailing volatility |
| Squared-return ACF, same lags | 0.1375 / 0.1053 / 0.0175 | Compare a volatility process against constant scale |
| Sample excess kurtosis | 12.147 | Challenge constant-scale Gaussian assumptions; test quantile calibration |
| Beyond three sample standard deviations | 1.863% | Preserve genuine extremes; do not remove them by IQR rule alone |
| Window daily standard deviations | approximately 0.022 to 0.049 | Evaluate stability by time period, not just aggregate score |

These are descriptive estimates, with no significance claim. Window variability
does not prove discrete regimes, and sample kurtosis does not identify a power-law
tail. No unit-root, change-point, causal or nonlinear predictability test has been
completed here. The whole inspected history is now exploratory; freeze the design
before reserving new, unseen evaluation data.

Remaining assumption checks: compare log-level/return stationarity using ADF and
KPSS with their differing nulls and break sensitivity; examine conditional variance
with ARCH diagnostics and residual checks; estimate uncertainty with dependence-
preserving block bootstrap and block-length sensitivity; compare rolling-window
results; then test predictive distributions out of sample. No individual p-value
certifies the market model. Specify lag/window choices before confirmatory testing.

## 3. Determine variables from properties

Only close-derived quantities and timestamp validity are required for the initial
baseline. Other measurements are candidates when they resolve a stated mechanism;
mathematics alone does not identify a unique sufficient feature set.

| System property or hypothesis | Measurement / candidate variable | Availability and admission rule |
|---|---|---|
| Multiplicative positive price evolution | log close for reconstruction; 1/7/30-day log returns for inputs | Completed closes; never future prices |
| Persistent scale, large tails | 7/30-day trailing RMS; compare EWMA, downside/upside RMS, OHLC range | Trailing data only; compare against persistence forecast |
| Possible trend persistence | One normalized trend family, e.g. log(close/EMA) | Incremental ablation versus return/vol baseline; do not duplicate every indicator |
| Observation uncertainty | source, available_at, age, missingness and coverage | Required metadata; missing data is not a zero economic observation |
| Liquidity / price impact | spread/mid, depth at fixed distance, signed flow imbalance | Requires venue-specific point-in-time book/trade history; volume alone is insufficient |
| Derivatives positioning | funding, basis, open-interest change, liquidations | Align venue, quote and release/settlement timing; spot-only data cannot establish effect |
| Cross-market transmission | DXY returns/deviation, changes in yields; macro release surprises | Point-in-time vintages and releases, bounded forward fill plus age; no backward fill |
| Information arrival | ready-time news counts, coverage, frozen text representations | Fold-local learned transforms and news ablations; publication time alone is retrospective |
| Supply schedule | observed block height, subsidy, time since known halving | Future halving date must be an origin-time estimate, not hindsight realized date |
| Changing latent dynamics | filtered regime probability vector | Optional only; past-only fit and filtering, stable out-of-sample benefit |

Macro vintages matter: today's historical values may differ from what was known at
the origin. FRED distinguishes present knowledge from ALFRED historical real-time
periods ([FRED API documentation](https://fred.stlouisfed.org/docs/api/fred/realtime_period.html)).
The local dataset README documents backward filling, fixed release lags and an
unlagged daily-filled M2 input. Quarantine those inputs until provenance is repaired;
do not remove source datasets or rewrite historical reports.

## 4. Map Quant Iris to this specification

The independent source audit is pinned to the revision linked below. The actual
engine uses forward log-return targets at 7/14/30/90 days, technical features,
ExtraTrees or an ExtraTrees/GBM/Ridge stack, and magnitude-based abstention gates.
Classifier presets also exist. README performance claims are not a substitute for
reproducing the checked-in execution path.

| Quant Iris component | Decision | Reason / required adaptation |
|---|---|---|
| Daily OHLCV and forward log-return labels | Retain concept | Add source identity, completed-bar checks, explicit origin/end timestamps |
| 21-day annualized volatility | Modify | Compare windows on training data; match unannualized target units or explicitly record conversion |
| RSI-90, EMA-50 deviation, EMA-50/200 spread; optional monthly MA distances | Optional ablation | Multiple transformations of the same price history; not independent economic state variables |
| Semi-volatility skew | Optional ablation | Candidate asymmetry measure; validate denominator and incremental information |
| DXY EMA deviation and US 10Y yield | Modify / quarantine | Require historical availability; test yield changes versus levels and training-only transformations |
| Fixed-coefficient power-law residual | Exclude from initial model | Assumes a growth law not established by observed tails or return dynamics |
| Fixed 1,460-day sine/cosine cycle | Exclude from initial model | Calendar periodicity is not implied by block-based subsidy changes; few independent cycles |
| HMM state / `hmm_norm` | Exclude as implemented | Full-sample fitting and full-sequence Viterbi decoding leak future information; filtered probability vectors would be a new experiment |
| Fear & Greed, premium, ETF flows, book/funding/intraday loaders | Do not automatically import | Loaded data is not necessarily an active model feature; admit by mechanism, coverage and timing |
| ExtraTrees / boosting / Ridge estimators | Retain as candidate families | Feed system-derived inputs; compare with simpler baselines under one evaluation contract |
| Current stacking | Replace before use | OOF training includes observations after its validation block; use chronological, purged inner folds |
| Expanding evaluation | Retain structure, audit boundaries | Purge by label endpoint at every training/validation/test boundary |
| Full-history percentile gates and pruning | Replace before use | Select features and calibrate abstention only within past training/validation data |
| Economic names for HMM states | Remove from claims | Ordering Gaussian states by mean return does not identify accumulation or euphoria |

Audit source links and verified revision are recorded in
[quant_iris_source_audit.md](quant_iris_source_audit.md).

## 5. Local modelling and integration gates

Current local entry points:

- `news_pipeline/market_model.py`: existing return/RMS targets, market baseline,
  fold-local semantic transforms and label-endpoint purging. Reuse this evaluation
  discipline. Its recorded news ablations did not beat the relevant baselines;
  see [annotation_free_modelling.md](annotation_free_modelling.md).
- `bitcoin iris/baseline_v2_xgboost_master3.py`: the inspected walk-forward methods
  directly adjoin training and test rows without horizon purging. Repair before
  using their 30-day results as evidence. A chronological row split alone does not
  stop training labels from extending into the test period.
- `terminal/src/lib/features/monthlyForecast/live.ts` and
  `terminal/src/lib/quant/montecarlo.ts`: current forecast independently resamples
  daily returns. This loses temporal volatility dependence. Keep it as a benchmark;
  do not claim its interval calibration has been established by this audit.

The ordered experiment is:

1. **Data gate:** obtain current, source-identified bars and validate availability;
   repair candidate macro/news provenance. Preserve genuine tails and missingness.
2. **Baseline gate:** same origins/horizons for zero-return, trailing volatility,
   empirical quantiles and current bootstrap. Compare a block-bootstrap or
   conditional-volatility alternative without assuming it must win.
3. **Model gate:** add the minimal return/scale inputs to Ridge and ExtraTrees;
   evaluate quantile boosting separately. Add one candidate family at a time on
   common coverage so a feature change cannot win merely by changing sample dates.
4. **Evaluation gate:** chronological outer test blocks; all feature selection,
   scaling, HMM fitting and hyperparameters inside training/validation. Require
   each training target_end < first validation origin and each validation
   target_end < first test origin. Apply the same rule to stacking. Calibrate gates
   only on past predictions. Report MAE, pinball loss, 80% coverage and interval
   width, by fold and regime proxy, with dependence-aware uncertainty. A candidate
   needs consistent held-out improvement in its declared primary score without
   degraded calibration, not a headline directional accuracy alone.
5. **Integration gate:** only after those results, export a versioned forecast with
   instrument/venue, origin, horizon_days, target_end, feature cutoff, training
   cutoff, data hash, model version, return/price quantiles, and calibration status.
   Add a Python inference adapter, then a terminal adapter with schema validation,
   quantile ordering, freshness and explicit unavailable behavior. Distinguish a
   calibrated forecast from a scenario and reject stale historical outputs.

If a trading strategy is later evaluated, define positions, overlapping holdings,
fees, slippage and funding explicitly; do not annualize overlapping horizon returns
as independent daily trades. This specification does not implement trading.

No upstream implementation has been copied or deployed. Its README claims MIT but
the audited tree has no license file; resolve reuse terms before copying source.
The diagnostic, candidate evaluation and inference are integrated into local
research tooling. The terminal adapter is implemented and rejects unvalidated
artifacts. Production promotion remains pending empirical gates. There is no
automatic approval flag.
