# Quant Iris source audit

Inspected 2026-09-08 by an independent agent; key engine code and Git revision
also checked by the primary agent. No upstream scripts were executed or copied
into this project. This is a source audit, not reproduced performance evidence.

Exact revision: `a956fdcd605da4167b703e9d2be2f3d7a8514bbc`.
[Pinned repository](https://github.com/Programmer7177/quant_iris/tree/a956fdcd605da4167b703e9d2be2f3d7a8514bbc).

## Actual variables and execution

The main engine loads daily Coinbase BTC/USD bars. Short-horizon features are
`rsi_90`, `dist_ema50`, `spread_50_200`, `vol_21`, `power_law_res`.
Medium adds `hmm_norm`; long adds `halving_cos`, `halving_sin`,
`dxy_dist_ema50`, `us10y_yield` and `hmm_norm`.
Forward targets are log(close[t+h]/close[t]) for h=7/14/30/90.
The main estimator paths are ExtraTrees and an ExtraTrees/GradientBoosting/Ridge
stack, followed by magnitude-percentile abstention. Separate classifier presets
and experimental feature families do not establish a single common production
architecture. Fear & Greed and Coinbase premium are loaded in the main engine
but absent from its three feature lists.

[Main feature lists and backtest](https://github.com/Programmer7177/quant_iris/blob/a956fdcd605da4167b703e9d2be2f3d7a8514bbc/forecast_engine.py#L133-L160).

## Findings that affect integration

| Finding | Source evidence | Required correction |
|---|---|---|
| Full-history HMM fit and sequence decoding | [forecast_engine.py, 89-103](https://github.com/Programmer7177/quant_iris/blob/a956fdcd605da4167b703e9d2be2f3d7a8514bbc/forecast_engine.py#L89-L103); invoked before evaluation at 230-237 | Fit on past training data; use causal filtering at each origin. Four states and their economic names are unvalidated assumptions |
| Backward fill and fabricated defaults | [forecast_engine.py, 55-82](https://github.com/Programmer7177/quant_iris/blob/a956fdcd605da4167b703e9d2be2f3d7a8514bbc/forecast_engine.py#L55-L82) | Point-in-time joins, bounded forward fill and missingness; broad exceptions must not invent neutral market observations |
| Nonchronological inner stacking folds | [forecast_engine.py, 105-124](https://github.com/Programmer7177/quant_iris/blob/a956fdcd605da4167b703e9d2be2f3d7a8514bbc/forecast_engine.py#L105-L124) | Inner training uses both past and future relative to its validation block; scaler also fits all outer training data. Replace both with fold-local chronological operations |
| Unpurged forward labels | [forecast_engine.py, 139-149](https://github.com/Programmer7177/quant_iris/blob/a956fdcd605da4167b703e9d2be2f3d7a8514bbc/forecast_engine.py#L139-L149) | Training target endpoints extend into test dates; purge by timestamps for each horizon |
| Future prediction distribution used for abstention | [forecast_engine.py, 127-131](https://github.com/Programmer7177/quant_iris/blob/a956fdcd605da4167b703e9d2be2f3d7a8514bbc/forecast_engine.py#L127-L131) and call at 159 | Main engine computes cutoff across a whole test block. Calibrate from prior validation predictions; this percentile filter is not conformal interval calibration |
| Global preset gates | [config_presets.py, 87-106](https://github.com/Programmer7177/quant_iris/blob/a956fdcd605da4167b703e9d2be2f3d7a8514bbc/config_presets.py#L87-L106), and 143-160 | Global test-prediction percentiles are unavailable at earlier origins. Use past calibration only |
| Feature pruning reuses evaluation history | [upgrade_engine.py, 128-143](https://github.com/Programmer7177/quant_iris/blob/a956fdcd605da4167b703e9d2be2f3d7a8514bbc/upgrade_engine.py#L128-L143) | Fixed 65/35 split permutation selection must be nested before reporting outer results |
| Inference rows dropped with labels | [forecast_engine.py, 84-87](https://github.com/Programmer7177/quant_iris/blob/a956fdcd605da4167b703e9d2be2f3d7a8514bbc/forecast_engine.py#L84-L87) | Requiring `fwd_ret_90` removes the newest 90 rows even for shorter horizons. Separate feature-only inference rows from matured training labels |

The alternate `upgrade_engine.py` also has unpurged evaluation at 107-123 and
nonchronological stacking at 204-227. Fixing the main file alone would not validate
all experiment paths. Prediction-magnitude gating uses no future labels directly,
but it still uses a distribution of future-origin predictions unavailable at the
decision time. Report that distinction accurately.

No explicit transaction/slippage model was established in the inspected main
engine. Directional accuracy and its reported Sharpe must not be presented as
deployable net performance. Documentation architecture claims need reconciliation
with an exact runnable configuration and data revision.

The pinned root tree contains no `LICENSE` or `COPYING` file, while README lines
115-116 claim MIT and research/educational use. Confirm the applicable reuse terms
before copying source. Mathematical ideas and independently written diagnostics
can be evaluated without importing that implementation.

Feature and pipeline decisions are in
[market_system_specification.md](market_system_specification.md). Nothing in this
audit establishes that excluded features can never work: they lack admission
evidence for the initial system specification.
