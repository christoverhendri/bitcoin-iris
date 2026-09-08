# System-derived forecast pipeline

Implemented 2026-09-08. This is an independently written numerical pipeline using
the existing scikit-learn stack, with a terminal artifact adapter. It does not copy
Quant Iris source. The [system specification](market_system_specification.md) and
[source audit](quant_iris_source_audit.md) explain the feature and architecture choices.

## Run from the repository root

Use the existing modelling environment (`requirements-model.txt`). All outputs
must be new paths; research artifacts are ignored by Git. The commands below are
the verified September 8 run. Use a new timestamp/output path to repeat them.

```powershell
# Optional fresh vendor data. Never append this to a different vendor's series.
.venv-model/Scripts/python.exe -m news_pipeline.market_prices --start 2020-01-01 --as-of 2026-09-08T00:00:00Z --output artifacts/system/coinbase_20260908

# Train and evaluate the primary 30-day horizon.
.venv-model/Scripts/python.exe -m news_pipeline.forecast_model train --prices artifacts/system/coinbase_20260908/prices.csv --as-of 2026-09-08T00:00:00Z --output artifacts/system/forecast_coinbase_v1_20260908

# Load the saved local model and infer from completed bars; no retraining.
.venv-model/Scripts/python.exe -m news_pipeline.forecast_model predict --model artifacts/system/forecast_coinbase_v1_20260908/model.joblib --prices artifacts/system/coinbase_20260908/prices.csv --as-of 2026-09-08T00:00:00Z --output artifacts/system/forecast_coinbase_v1_20260908/inference_verified.json
```

For the pre-existing historical dataset, omit `--prices`. Training also accepts
`--horizon 7`; the terminal adapter deliberately accepts only 30-day artifacts.
Prediction takes the horizon from the saved model. For other CSVs use `date,Close`
and provide `--venue` or a sibling `provenance.json` containing the matching
`instrument`, `venue`, and `data_sha256`. Inference rejects a different venue from
the fitted model. Source metadata is an identity check, not a historical vintage
audit. Load only trusted local joblib models.

The Coinbase fetcher uses daily buckets, filters overlapping page boundaries,
excludes unfinished days, validates full date coverage and OHLC consistency, and
writes a SHA-256 provenance record. Missing bars fail instead of being filled.
It uses the OS certificate store through the same `truststore` dependency as the
existing news collector; TLS verification remains enabled.
[Coinbase candle API contract](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles).

## What runs

- Five inputs: trailing 1/7/30-day log returns and 7/30-day daily RMS volatility.
- Return models: scaled Ridge, ExtraTrees and direct quantile gradient boosting.
  Each has two fixed tuning configurations; no full-history feature selection.
- Three chronological outer test blocks covering the final 30% of matured labels.
  Each has separate earlier tuning and residual-calibration windows. Every boundary
  is purged using label endpoint timestamps, including tune-to-calibration.
- Ridge/ExtraTrees tune on MAE. Direct quantile boosting tunes on pinball loss.
  Calibration estimates per-quantile residual offsets on a distinct window;
  quantiles are sorted consistently for evaluation and inference.
- Baselines: zero-return, training-only empirical horizon quantiles, trailing-year
  IID bootstrap and seven-day circular block bootstrap (1,000 paths, daily seed).
  The Python IID benchmark follows the terminal's resampling method, but is not
  bit-identical to its 2,000-path JavaScript PRNG implementation.
- Metrics: MAE, mean pinball loss, P10-P90 coverage and width on common test origins;
  also split by a trailing-scale threshold fitted on training data. Separate future
  RMS MAE compares volatility persistence with a fixed Ridge baseline.
- Exploratory uncertainty: circular block-bootstrap intervals for paired pinball
  differences against IID bootstrap, using h and 2h block lengths per fold. These
  are sensitivity estimates, not an automatic statistical certification.

The final research artifact uses Ridge or ExtraTrees selected on the most recent
past tuning MAE, then calibrated on separate matured labels. Quantile boosting is
evaluated but is not part of this point-family export selector. No model is selected
using its outer test result; no model is automatically promoted to production.

## Outputs

| File | Contents |
|---|---|
| `model.joblib` | Saved estimator, calibration offsets, ordered features, venue, horizon and information cutoff |
| `report.json` | Input diagnostic/hash, timestamp boundaries, selection rule, uncertainty and limitations |
| `metrics.csv` | Fold/model/regime scores; volatility rows use RMS MAE units |
| `predictions.csv` | Held-out actual log returns and return quantiles by origin |
| `latest_forecast.json` | Versioned terminal contract; newest feature row survives unknown future labels |

The export records instrument, venue, origin, target end, feature/information
cutoffs, model version, hashes, reference close, return/price quantiles and
`calibration.status = research_only`. `training_cutoff` is the last information
endpoint used, including calibration labels. No intra-horizon path is invented.

## Terminal integration

`IRIS_FORECAST_PATH` is a server-only absolute path to the exported JSON. Set it
in `terminal/.env.local` and restart the terminal to select artifact mode:

```dotenv
IRIS_FORECAST_PATH=E:/Developen/Github/bitcoin-iris/artifacts/system/forecast_coinbase_v1_20260908/latest_forecast.json
```

With today's research export this deliberately displays **UNAVAILABLE**. The
adapter accepts numeric forecasts only with `calibration.status = validated`,
matching BTC/USD/30-day semantics, sorted finite quantiles, consistent exponential
price conversion, valid cutoffs and an origin no more than 48 hours old. Missing,
invalid, research-only or disabled-source results never fall back to mock values.
The monthly page checks the file at request time, avoiding a cached build-time
bootstrap bypass. Accepted future artifacts display horizon, target end, method
and venue without synthesizing a trajectory from endpoint quantiles.

Leaving the variable unset preserves the existing bootstrap mode. This change has
not set the variable in the user's environment. There is intentionally no command
to flip a research artifact to validated: the next promotion step needs fresh
confirmatory evaluation and calibration evidence, not a manual flag edit.

## Verified results, 2026-09-08

Fresh Coinbase input: **2,442 completed daily bars**, 2020-01-01 through
2026-09-07. Separate model fit; no mixing with the historical yfinance dataset.
Final research origin: September 8; endpoint: October 8. Saved-model inference
matches the original export exactly.

The production build passes. A local production-server HTTP check returned 200
with `UNAVAILABLE` and the research-only reason, with no Monte Carlo fallback,
when configured with the actual Python export. The temporary verification server
was stopped afterward. The 13 forecast adapter tests pass; Python validation
covers data integrity, purging, future-data invariance, source binding and inference.

Equal-weight means across three test folds (log-return units):

| Method | MAE | Mean pinball | 80% interval coverage |
|---|---:|---:|---:|
| Zero-return | 0.101376 | 0.050688 | 0% (degenerate interval) |
| Empirical quantiles | 0.101178 | 0.035533 | 89.1% |
| IID bootstrap | 0.107173 | 0.034814 | 76.7% |
| Block bootstrap | 0.106156 | 0.034802 | 73.9% |
| Ridge | 0.110943 | 0.035580 | 65.8% |
| ExtraTrees | 0.118684 | 0.038468 | 60.2% |
| Quantile boosting | 0.134017 | 0.043493 | 59.1% |

The candidates do not justify replacing the baselines. Ridge's coverage is well
below the nominal 80%; block-bootstrap's tiny pinball difference is not proof of
superiority. Future RMS persistence MAE is 0.007173 versus Ridge's 0.009166.
Historical-only yfinance evaluation also failed to establish candidate superiority.
These negative findings are retained rather than tuned away on the test set.

Validation commands:

```powershell
.venv-model/Scripts/python.exe -m unittest discover -s tests -q
npm --prefix terminal test -- --run src/lib/features/monthlyForecast
npm --prefix terminal run build
```

The broader terminal test suite has an unrelated existing `sourcesSeed.test.ts`
failure: the FRED unlock note in `sources.ts` differs from migration
`0002_data_source_status.sql`. Neither source was changed by this integration.
