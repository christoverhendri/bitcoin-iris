"""GARCH(1,1) volatility filter — Python port of ``src/lib/quant/garch.ts``.

Same estimator as the web app so the worker and the distribution page agree:

* Gaussian maximum likelihood with **variance targeting**: ``omega`` is pinned
  to ``sigma_LR^2 * (1 - alpha - beta)`` so the process reverts to the sample's
  own long-run variance.
* ``(alpha, beta)`` found by a coarse grid plus two refinement passes. Deterministic
  (no solver tolerance), which keeps a weekly run reproducible.
* EWMA (RiskMetrics, lambda 0.94) when the fit lands on a boundary or the sample
  is too short. Reported, never silent.

The grid is evaluated vectorised over all candidate ``(alpha, beta)`` pairs at
once, so a full fit on ~4000 daily returns takes well under a second.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

MAX_PERSISTENCE = 0.999


@dataclass
class GarchFit:
    omega: float
    alpha: float
    beta: float
    #: Conditional sigma for every observation (same length as input).
    sigma: np.ndarray
    #: Conditional sigma for the next, not-yet-observed day.
    last_sigma: float
    #: Unconditional sigma the process mean-reverts to.
    long_run_sigma: float
    persistence: float
    converged: bool
    method: str  # "garch" | "ewma"

    def as_dict(self) -> dict:
        return {
            "omega": self.omega,
            "alpha": self.alpha,
            "beta": self.beta,
            "persistence": self.persistence,
            "last_sigma": self.last_sigma,
            "long_run_sigma": self.long_run_sigma,
            "converged": self.converged,
            "method": self.method,
        }


def ewma_sigma(returns: np.ndarray, lam: float = 0.94) -> tuple[np.ndarray, float]:
    """RiskMetrics EWMA. Returns (sigma per observation, next-day sigma)."""
    r = np.asarray(returns, dtype=float)
    out = np.empty(len(r))
    if len(r) == 0:
        return out, 0.0
    v = float(np.var(r[:30])) if len(r) >= 2 else 0.0
    if not v > 0:
        v = float(np.var(r)) if len(r) >= 2 else 0.0
    if not v > 0:
        v = 1e-8
    for i, x in enumerate(r):
        out[i] = np.sqrt(v)
        v = lam * v + (1 - lam) * x * x
    return out, float(np.sqrt(v))


def _loglik_grid(r2: np.ndarray, alpha: np.ndarray, beta: np.ndarray, uvar: float) -> np.ndarray:
    """Gaussian log-likelihood for every (alpha, beta) pair, vectorised."""
    omega = uvar * (1.0 - alpha - beta)
    v = np.full(alpha.shape, uvar)
    ll = np.zeros(alpha.shape)
    with np.errstate(divide="ignore", invalid="ignore", over="ignore"):
        for x2 in r2:
            ll -= 0.5 * (np.log(v) + x2 / v)
            v = omega + alpha * x2 + beta * v
    ll[~np.isfinite(ll)] = -np.inf
    return ll


def _recursion(r: np.ndarray, omega: float, alpha: float, beta: float, v0: float):
    sigma = np.empty(len(r))
    v = v0
    ll = 0.0
    for i, x in enumerate(r):
        if not (v > 0) or not np.isfinite(v):
            return -np.inf, sigma, v0
        sigma[i] = np.sqrt(v)
        ll += -0.5 * (np.log(v) + x * x / v)
        v = omega + alpha * x * x + beta * v
    return ll, sigma, v


def filter_sigma(returns: np.ndarray, fit: GarchFit) -> tuple[np.ndarray, float]:
    """Run an already-fitted model's recursion over a (longer) series.

    Used by the backtest: parameters are fitted on a training prefix, then the
    volatility *state* is filtered forward with those fixed parameters up to each
    origin — the state uses only information available at that origin.
    """
    r = np.asarray(returns, dtype=float)
    if fit.method == "ewma":
        return ewma_sigma(r)
    _, sigma, next_var = _recursion(r, fit.omega, fit.alpha, fit.beta, fit.long_run_sigma**2)
    return sigma, float(np.sqrt(max(next_var, 1e-16)))


def fit_garch11(returns: np.ndarray) -> GarchFit:
    r = np.asarray(returns, dtype=float)
    uvar = float(np.var(r)) if len(r) >= 2 else 0.0

    if len(r) < 100 or not uvar > 0:
        sigma, nxt = ewma_sigma(r)
        return GarchFit(0.0, 0.06, 0.94, sigma, nxt, float(np.sqrt(max(uvar, 1e-8))), 1.0, False, "ewma")

    r2 = r * r
    best = {"alpha": 0.08, "beta": 0.90, "ll": -np.inf}

    def search(a_lo, a_hi, b_lo, b_hi, steps):
        a = np.linspace(a_lo, a_hi, steps + 1)
        b = np.linspace(b_lo, b_hi, steps + 1)
        A, B = np.meshgrid(a, b, indexing="ij")
        A, B = A.ravel(), B.ravel()
        ok = (A > 0) & (B >= 0) & (A + B < MAX_PERSISTENCE) & (uvar * (1 - A - B) > 0)
        if not ok.any():
            return
        A, B = A[ok], B[ok]
        ll = _loglik_grid(r2, A, B, uvar)
        k = int(np.argmax(ll))
        if ll[k] > best["ll"]:
            best.update(alpha=float(A[k]), beta=float(B[k]), ll=float(ll[k]))

    search(0.01, 0.30, 0.50, 0.98, 20)
    search(max(0.001, best["alpha"] - 0.03), best["alpha"] + 0.03,
           max(0.0, best["beta"] - 0.05), min(0.99, best["beta"] + 0.05), 12)
    search(max(0.001, best["alpha"] - 0.005), best["alpha"] + 0.005,
           max(0.0, best["beta"] - 0.008), min(0.995, best["beta"] + 0.008), 10)

    alpha, beta = best["alpha"], best["beta"]
    omega = uvar * (1 - alpha - beta)
    ll, sigma, next_var = _recursion(r, omega, alpha, beta, uvar)
    persistence = alpha + beta
    converged = (
        np.isfinite(ll)
        and persistence < MAX_PERSISTENCE - 1e-6
        and alpha > 0.0015
        and bool(np.all(np.isfinite(sigma) & (sigma > 0)))
    )

    if not converged:
        ew, nxt = ewma_sigma(r)
        return GarchFit(omega, alpha, beta, ew, nxt, float(np.sqrt(uvar)), persistence, False, "ewma")

    return GarchFit(omega, alpha, beta, sigma, float(np.sqrt(next_var)), float(np.sqrt(uvar)),
                    persistence, True, "garch")


def forecast_sigma_path(fit: GarchFit, horizon: int, start_sigma: float | None = None) -> np.ndarray:
    """Expected daily sigma for steps 1..horizon (mean-reverting GARCH path)."""
    lr = fit.long_run_sigma**2
    s0 = (start_sigma if start_sigma and start_sigma > 0 else fit.last_sigma) ** 2
    h = np.arange(1, horizon + 1)
    pers = min(fit.persistence, 1.0)
    return np.sqrt(np.maximum(lr + pers ** (h - 1) * (s0 - lr), 1e-16))
