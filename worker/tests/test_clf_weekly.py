"""
Unit tests untuk fungsi murni worker:
- iris_clf.signal_rule.decide (termasuk batas)
- iris_worker.jobs.clf_weekly.check_freshness
- iris_worker.jobs.clf_weekly.build_payload
- iris_worker.scheduler.parse_cron
"""
from datetime import date
import pytest

from iris_clf.signal_rule import decide
from iris_worker.jobs.clf_weekly import check_freshness, build_payload
from iris_worker.scheduler import parse_cron


# ============================================================================
# 1. Test decide() pada batas & di luar batas
# ============================================================================
def test_decide_boundaries_and_signals():
    rule = {
        "t_bear": 0.23,
        "t_bull": 0.70,
        "method": "dual_threshold_oof",
    }

    # Di luar batas
    assert decide(0.71, rule) == "BULL"
    assert decide(0.99, rule) == "BULL"
    assert decide(0.22, rule) == "BEAR"
    assert decide(0.05, rule) == "BEAR"

    # Di dalam batas (zona NO SIGNAL)
    assert decide(0.50, rule) == "NONE"
    assert decide(0.35, rule) == "NONE"

    # TEPAT pada batas (p == t_bear -> NONE, p == t_bull -> NONE)
    assert decide(0.23, rule) == "NONE"
    assert decide(0.70, rule) == "NONE"


# ============================================================================
# 2. Test penjaga kesegaran (check_freshness)
# ============================================================================
def test_check_freshness_pass():
    today = date(2026, 10, 16)
    as_of = "2026-10-15"  # 1 hari lag
    n_nan = {"MacroCrossAsset": 0, "Universal": 0}

    is_fresh, reasons = check_freshness(
        as_of_str=as_of,
        n_nan_features=n_nan,
        max_lag_days=3,
        max_nan=0,
        today_utc=today,
    )
    assert is_fresh is True
    assert len(reasons) == 0


def test_check_freshness_stale_data():
    today = date(2026, 10, 16)
    as_of = "2026-10-10"  # 6 hari lag > 3
    n_nan = {"MacroCrossAsset": 0, "Universal": 0}

    is_fresh, reasons = check_freshness(
        as_of_str=as_of,
        n_nan_features=n_nan,
        max_lag_days=3,
        max_nan=0,
        today_utc=today,
    )
    assert is_fresh is False
    assert any("tertinggal 6 hari" in r for r in reasons)


def test_check_freshness_nan_features():
    today = date(2026, 10, 16)
    as_of = "2026-10-15"
    n_nan = {"MacroCrossAsset": 1, "Universal": 0}  # total nan = 1 > 0

    is_fresh, reasons = check_freshness(
        as_of_str=as_of,
        n_nan_features=n_nan,
        max_lag_days=3,
        max_nan=0,
        today_utc=today,
    )
    assert is_fresh is False
    assert any("1 fitur bernilai NaN" in r for r in reasons)


def test_check_freshness_both_failures():
    today = date(2026, 10, 16)
    as_of = "2026-08-21"  # 56 hari lag
    n_nan = {"MacroCrossAsset": 2, "Universal": 1}

    is_fresh, reasons = check_freshness(
        as_of_str=as_of,
        n_nan_features=n_nan,
        max_lag_days=3,
        max_nan=0,
        today_utc=today,
    )
    assert is_fresh is False
    assert len(reasons) == 2


# ============================================================================
# 3. Test pembentukan payload (build_payload)
# ============================================================================
def test_build_payload_structure_and_types():
    sig_fixture = {
        "as_of": "2026-08-21",
        "horizon_days": 7,
        "direction": "BULL",
        "p_up": 0.625521,
        "threshold": 0.11,
        "margin": 0.515521,
        "gate_pass": {"20": True, "35": True, "40": True},
        "per_domain": {"MacroCrossAsset": 0.739911, "Universal": 0.511131},
        "n_nan_features": {"MacroCrossAsset": 0, "Universal": 0},
    }
    rule_fixture = {
        "t_bear": 0.23,
        "t_bull": 0.70,
        "method": "dual_threshold_oof",
    }
    meta_fixture = {
        "name": "btc_direction_7d_avg_ensemble",
        "created_utc": "2026-10-15T05:04:50+00:00",
        "train_end": "2023-05-29",
        "domains": {"MacroCrossAsset": ["f1"], "Universal": ["f2"]},
        "val_f1_macro": 0.589768,
        "test_metrics": {"f1_macro": 0.580448, "accuracy": 0.605},
    }

    payload = build_payload(sig_fixture, rule_fixture, meta_fixture, signal="NONE")

    expected_keys = {
        "as_of",
        "horizon_days",
        "signal",
        "p_up",
        "t_bear",
        "t_bull",
        "threshold_binary",
        "direction_binary",
        "margin",
        "gate_pass",
        "per_domain",
        "n_nan_features",
        "rule_method",
        "track_precision",
        "track_n",
        "track_base_rate",
        "track_eval_from",
        "track_eval_to",
        "model_name",
        "model_created_utc",
        "model_train_end",
        "model_domains",
        "val_f1_macro",
        "test_f1_macro",
        "is_synthetic",
    }

    assert set(payload.keys()) == expected_keys
    assert payload["as_of"] == "2026-08-21"
    assert payload["horizon_days"] == 7
    assert payload["signal"] == "NONE"
    assert isinstance(payload["p_up"], float)
    assert payload["p_up"] == pytest.approx(0.625521)
    assert payload["t_bear"] == 0.23
    assert payload["t_bull"] == 0.70
    assert payload["threshold_binary"] == 0.11
    assert payload["direction_binary"] == "BULL"
    assert isinstance(payload["gate_pass"], dict)
    assert isinstance(payload["per_domain"], dict)
    assert isinstance(payload["n_nan_features"], dict)
    assert payload["model_domains"] == ["MacroCrossAsset", "Universal"]
    assert payload["val_f1_macro"] == pytest.approx(0.589768)
    assert payload["test_f1_macro"] == pytest.approx(0.580448)
    assert payload["is_synthetic"] is False


def test_build_payload_invalid_signal():
    with pytest.raises(ValueError, match="Signal tidak valid"):
        build_payload(
            {"as_of": "2026-08-21", "threshold": 0.11, "direction": "BULL", "margin": 0.1, "p_up": 0.5},
            {"t_bear": 0.2, "t_bull": 0.7},
            {},
            signal="INVALID_SIGNAL",
        )


# ============================================================================
# 4. Test cron parsing
# ============================================================================
def test_parse_cron():
    trigger = parse_cron("30 0 * * 1")
    assert str(trigger.timezone) == "UTC"
