# Annotation-free news modelling

Implemented in `news_pipeline/market_model.py`. No sentiment annotators or heuristic
sentiment labels are used. The unsupervised stages are frozen text representations,
PCA and clustering. Ridge regressions learn automatically generated market targets.
This is market-supervised prediction, not reinforcement learning or causal inference.

## Install and run

The modelling dependencies are isolated from the lightweight data pipeline:

```powershell
uv venv .venv-model
uv pip install --python .venv-model/Scripts/python.exe -r requirements-model.txt
.venv-model/Scripts/python.exe -m news_pipeline.market_model --output artifacts/news/my_experiment
.venv-model/Scripts/python.exe -m unittest discover -s tests -q
```

Output directories must be new. The first run downloads one frozen MiniLM encoder;
subsequent matching runs reuse `artifacts/news/embeddings.npy` without loading it.
Model id, immutable Hub revision, ordered-text fingerprint and chunk settings are
saved beside the cache. Use `--revision <commit>` to request an explicit checkpoint.
The selected encoder produces 384-dimensional embeddings; longer posts are divided
into 220-token chunks and normalized pooled vectors. CPU inference uses batches of
32. No GPU or parallel neural-model stack is required.
[MiniLM model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)

Options: `--news <jsonl>`, `--prices <csv>`, `--horizon 7` (1..90 days),
`--clusters 8` (2..32), `--time-basis publication|ready`, `--cache <path.npy>`.
Publication mode is the explicit default for the historical corpus. Ready mode
requires feature_ready_at records from the durable data export. It needs at least
500 overlapping daily observations and is currently unsuitable for our short live
collection history. The command fails rather than silently switching time bases.

## Data and time alignment

Default prices are `bitcoin iris/dataset/btc/btc_daily_features.csv`, using only
`date` and `Close`. A master CSV with `btc_close` is also accepted, but must be
audited separately for filling/revisions. Invalid/nonpositive prices, duplicate
dates and missing daily bars raise errors. Unfinished daily bars are excluded.

Assumption: date-D Close is available at D+1 00:00 UTC. News available during day D
is aggregated with that close; origin is D+1. Relative to that close, targets are:

```text
return_h = log(close[D+h] / close[D])
volatility_h = sqrt(mean(next h daily log returns squared))
```

Volatility is an unannualized realized RMS, not sample standard deviation. The
last h rows have unknown labels and cannot enter training. Numeric results are
log-return/volatility units, not dollar price error or trading profit.

Historical records without the selected time field are excluded. Earliest dated
versions per source id and exact whitespace/case-normalized duplicate text are
retained once; this parser differs from legacy sentiment cleaning, so its retained
count differs. Article edits cannot be reconstructed as point-in-time historical
truth. Publication mode and the encoder's historical availability are limitations
of the retrospective experiment.

Only the news/price date overlap is modelled. Days with no observed posts use zero
news vectors/counts; that encodes no observation, not proven absence of news.
Coverage is unknown. No macro, legacy sentiment/importance label or future price
is included as an input feature.

## Features and experiments

| Variant | Features |
|---|---|
| market_only | Trailing 1/7/30-day log returns, trailing 7/30-day RMS volatility |
| market_counts | Market features plus number of observed unique posts |
| news_semantic | Market, counts of posts/events/review/BTC mentions, mean PCA vectors, cluster proportions |
| news_weighted | Market, the same counts plus weight sum, weighted PCA vectors and cluster proportions |
| naive | Zero future return; current trailing 30-day volatility |

The shared frozen encoder runs once, not once per variant. KMeans has 8 clusters,
10 initializations and seed 42. PCA has up to 8 dimensions. Both fit only on news
earlier than each fold's last training-feature cutoff. Cluster examples come only
from training articles and are descriptive groups, not manually named event labels.

`post_weight` affects aggregation only in the weighted comparison. It never weights
the loss or becomes a target label. Counts and weights are deliberately evaluated
as separate variants so their benefit is measurable.

## Evaluation and fitted artifacts

The last 30% of labelled days form three chronological test blocks. Each fold has
90 usable validation days; training target endpoints precede validation origins,
and validation target endpoints precede test origins, with conservative purging.
Earlier test blocks may become historical training data in later folds.

StandardScaler and Ridge fit only training rows. Ridge alpha is selected from
0.1/1/10/100 using validation MAE independently for each target/variant. Test results
do not select the winner. Negative volatility predictions are clipped to zero
consistently in validation, test and final predictions. No refit on validation is
performed inside the evaluation folds. Test forecasts overlap at a daily stride;
they must not be treated as independent trades or used for naive significance tests.

After evaluation, final regressions fit all matured labels, using the final fold's
validation-selected alphas. Representations refit only on available training news.
These final models are different from the fold models used to measure performance.
The last available overlap day gets a prediction with origin, target endpoint and
an out-of-sample flag. Check those dates: the command does not fetch fresh prices.

Outputs:

- `report.json`: data fingerprints, revision, splits, assumptions, mean fold MAE.
- `metrics.csv`: validation MAE, selected alpha, test MAE/RMSE by fold and variant.
- `predictions.csv`: held-out origin, target, actual and prediction for regressions.
- `clusters_fold_*.json`: training-cluster examples for inspection.
- `models.joblib`: final regressions, PCA/KMeans, encoder and horizon metadata.
- `latest_predictions.json`: predictions at the last available overlap origin.

Only load locally trusted joblib files. To forecast a later dataset with the current
workflow, refresh the inputs and run a new experiment; there is no deployed model
service or RL agent. Automatic model selection/deployment is not performed.

## Verified first experiment — 2026-09-06

9,471 inputs; 705 missing timestamps excluded; 306 duplicates excluded; 8,460
articles retained. Encoder cache contains 8,466 chunks pooled to 8,460 vectors.
Price/news overlap yields 1,443 labelled daily observations. Three test folds have
144, 144 and 145 days. All 32 automated tests passed in the modelling environment,
including label construction, price-gap rejection, purge boundaries, and a check
that modifying future vectors cannot change fitted training PCA/clusters/features.

Mean test MAE across the three folds, horizon seven days:

| Variant | Return | Volatility |
|---|---:|---:|
| naive | **0.041033** | 0.007622 |
| market_only | 0.042486 | **0.007244** |
| market_counts | 0.043146 | 0.007850 |
| news_semantic | 0.043680 | 0.008773 |
| news_weighted | 0.044182 | 0.008595 |

News features did not improve these baselines. Keep that negative finding; do not
interpret unsupervised clusters or weights as established predictive signals.
The price file ends 2026-08-11. Final prediction origin is 2026-08-12, ending
2026-08-19; this is not a current September forecast. Verified artifacts are in
`artifacts/news/market_model_verified/` and are intentionally excluded from Git.
