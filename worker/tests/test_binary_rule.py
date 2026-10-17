"""
Aturan biner dari meta.json + rekam jejak sinyal:
- load_rule tanpa signal_rule.json -> ambang biner dari avg_threshold
- decide biner: BULL kalau p >= ambang (sesuai `combine` di meta)
- track_record.compute: presisi per sinyal di hari uji berlabel
- build_payload membawa rekam jejak sinyal yang sama
- artefak model terpasang konsisten dengan meta notebook
"""
import json
from pathlib import Path

import pandas as pd
import pytest

from iris_clf.signal_rule import BINARY_METHOD, decide, load_rule
from iris_worker.jobs.clf_weekly import build_payload
from iris_worker.track_record import compute

MODEL_DIR = Path(__file__).resolve().parent.parent / "models" / "clf_7d"


def test_load_rule_falls_back_to_meta_threshold(tmp_path):
    (tmp_path / "meta.json").write_text(json.dumps({"avg_threshold": 0.06}))
    rule = load_rule(str(tmp_path))
    assert rule["method"] == BINARY_METHOD
    assert rule["t_bear"] == rule["t_bull"] == 0.06


def test_signal_rule_json_wins_when_exported(tmp_path):
    (tmp_path / "meta.json").write_text(json.dumps({"avg_threshold": 0.06}))
    (tmp_path / "signal_rule.json").write_text(json.dumps({"t_bear": 0.1, "t_bull": 0.4, "method": "dual"}))
    assert load_rule(str(tmp_path))["t_bull"] == 0.4


def test_binary_decide_matches_meta_combine():
    rule = {"method": BINARY_METHOD, "t_bear": 0.06, "t_bull": 0.06}
    assert decide(0.06, rule) == "BULL"  # ">= avg_threshold"
    assert decide(0.24, rule) == "BULL"
    assert decide(0.0599, rule) == "BEAR"
    assert decide(0.0, rule) == "BEAR"


def test_track_record_precision_per_signal():
    idx = pd.date_range("2025-01-01", periods=6, freq="D")
    p = pd.Series([0.5, 0.5, 0.5, 0.01, 0.01, 0.5], index=idx)
    labels = pd.Series([1, 1, 0, 0, 1, None], index=idx)  # last day unlabelled (quiet week)
    rec = compute(p, labels, {"method": BINARY_METHOD, "t_bear": 0.06, "t_bull": 0.06})
    assert rec["n_labeled"] == 5
    assert rec["by_signal"]["BULL"] == pytest.approx(
        {"n": 3, "precision": 2 / 3, "share": 3 / 5, "base_rate": 3 / 5})
    assert rec["by_signal"]["BEAR"]["precision"] == pytest.approx(0.5)
    assert rec["accuracy"] == pytest.approx(3 / 5)
    assert rec["eval_to"] == "2025-01-05"


def test_build_payload_carries_matching_track_record():
    sig = {"as_of": "2026-10-15", "p_up": 0.24, "threshold": 0.06, "direction": "BULL",
           "margin": 0.18, "gate_pass": {}, "per_domain": {}, "n_nan_features": {}}
    rule = {"method": BINARY_METHOD, "t_bear": 0.06, "t_bull": 0.06}
    track = {"eval_from": "2025-01-30", "eval_to": "2026-08-09",
             "by_signal": {"BULL": {"n": 266, "precision": 0.526, "base_rate": 0.479},
                           "BEAR": {"n": 66, "precision": 0.712, "base_rate": 0.521}}}
    p = build_payload(sig, rule, {"test_metrics": {}}, "BULL", track)
    assert (p["track_precision"], p["track_n"], p["track_base_rate"]) == (0.526, 266, 0.479)
    assert p["rule_method"] == BINARY_METHOD and p["t_bear"] == p["t_bull"] == 0.06
    empty = build_payload(sig, rule, {"test_metrics": {}}, "BULL")
    assert empty["track_precision"] is None


def test_installed_model_artifacts_are_consistent():
    meta = json.loads((MODEL_DIR / "meta.json").read_text())
    track = json.loads((MODEL_DIR / "track_record.json").read_text())
    rule = load_rule(str(MODEL_DIR))
    assert not (MODEL_DIR / "signal_rule.json").exists(), "ambang harus dari export notebook"
    assert rule["t_bull"] == meta["avg_threshold"]
    assert track["model_created_utc"] == meta["created_utc"], "track_record basi: jalankan ulang"
    assert track["accuracy"] == pytest.approx(meta["test_metrics"]["accuracy"], abs=1e-9)


# ----------------------------------------------------------------------------
# Candle penutup minggu & coba ulang (Yahoo belum memfinalkan candle kemarin)
# ----------------------------------------------------------------------------
from datetime import date  # noqa: E402

from iris_worker import scheduler  # noqa: E402
from iris_worker.jobs import clf_weekly  # noqa: E402


class _FakeClf:
    meta = {"test_metrics": {}}

    def predict_latest(self, *_):
        return {"as_of": "2026-10-17", "p_up": 0.3, "threshold": 0.06, "direction": "BULL",
                "margin": 0.24, "gate_pass": {}, "per_domain": {}, "n_nan_features": {}}


def test_weekly_refuses_a_saturday_candle(tmp_path, monkeypatch):
    (tmp_path / "meta.json").write_text(json.dumps({"avg_threshold": 0.06}))
    (tmp_path / "m.csv").write_text("x")
    (tmp_path / "kategori").mkdir()
    monkeypatch.setattr(clf_weekly.ClassifierSignal, "from_dir", classmethod(lambda cls, d: _FakeClf()))
    monkeypatch.setattr(clf_weekly, "check_freshness", lambda *a, **k: (True, []))
    kw = dict(dry_run=True, model_dir=str(tmp_path), master_path=str(tmp_path / "m.csv"),
              category_dir=str(tmp_path / "kategori"))
    with pytest.raises(clf_weekly.WeekNotClosedError):
        clf_weekly.run_clf_weekly(require_as_of=date(2026, 10, 18), **kw)  # Sabtu < Minggu
    out = clf_weekly.run_clf_weekly(require_as_of=date(2026, 10, 17), **kw)
    assert out["signal"] == "BULL"


def test_retry_schedules_then_gives_up(monkeypatch):
    calls = []

    class FakeSched:
        def add_job(self, fn, trigger, **kw):
            calls.append((trigger, kw["id"], kw["kwargs"]["attempt"]))

    monkeypatch.setattr(scheduler, "_SCHED", FakeSched())
    scheduler._retry(lambda **k: None, "clf_weekly", 0, dry_run=False)
    scheduler._retry(lambda **k: None, "clf_weekly", scheduler.MAX_RETRIES, dry_run=False)
    assert calls == [("date", "clf_weekly_retry", 1)]
