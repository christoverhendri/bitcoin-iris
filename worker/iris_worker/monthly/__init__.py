"""Monthly (30-day) Monte Carlo forecast — Timothy's worker, from motmots/iris-monthly-forecast.

FHS over GARCH(1,1) residuals, paths started from Deribit DVOL x a walk-forward
variance-risk-premium factor, 10,000 paths, drift removed, with a leakage-tested
rolling-origin backtest and a live track record. Run:

    python -m iris_worker.monthly             # writes to Supabase (monthly_forecast_runs)
    python -m iris_worker.monthly --dry-run   # JSON files in --out only (local mode)

Modules are copied unchanged from that repository except `forecast.py` (its
`monthly.py`), which adds the local-file re-scoring for runs without Supabase.
"""

__version__ = "0.1.0"
