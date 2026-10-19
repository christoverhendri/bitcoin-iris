import json

import numpy as np
import pandas as pd

from iris_clf.features import make_label
from iris_worker.forward_validation import is_week_close, score_history_file, score_signal
from iris_worker.monthly.forward import score_horizons


def _data(closes, start="2026-09-01"):
    idx = pd.date_range(start, periods=len(closes), freq="D")
    return pd.DataFrame({"btc_close": closes}, index=idx)


def _quiet_then(jump):
    """60 days of small alternating moves, then a 7-day move of `jump` (log)."""
    rng = np.random.default_rng(7)
    base = 100 * np.exp(np.cumsum(rng.normal(0, 0.01, 60)))
    tail = base[-1] * np.exp(np.linspace(jump / 7, jump, 7))
    return np.concatenate([base, tail])


def test_week_close_is_sunday():
    assert is_week_close("2026-10-18")  # Sunday
    assert not is_week_close("2026-10-16")


def test_scores_with_the_training_label_rule():
    for jump, label, bull_correct in [(0.2, "UP", True), (-0.2, "DOWN", False), (0.0005, "NOISE", None)]:
        data = _data(_quiet_then(jump))
        labels = make_label(data)
        as_of = data.index[59]
        z = score_signal({"as_of": str(as_of.date()), "signal": "BULL"}, data, labels)
        assert z["label"] == label
        assert z["correct"] is bull_correct
        assert z["end_date"] == str((as_of + pd.Timedelta(days=7)).date())
        assert abs(z["return_7d"] - (data["btc_close"].iloc[66] / data["btc_close"].iloc[59] - 1)) < 1e-12


def test_not_scored_until_the_week_has_closed():
    data = _data(_quiet_then(0.2))
    labels = make_label(data)
    assert score_signal({"as_of": str(data.index[-3].date()), "signal": "BULL"}, data, labels) is None


def test_history_file_scored_in_place_once(tmp_path):
    data = _data(_quiet_then(0.2))
    labels = make_label(data)
    hist = tmp_path / "clf_signals_history.jsonl"
    rows = [{"as_of": str(data.index[59].date()), "signal": "BEAR"}, {"as_of": str(data.index[-1].date()), "signal": "BULL"}]
    hist.write_text("\n".join(json.dumps(r) for r in rows) + "\n", encoding="utf-8")
    assert score_history_file(hist, data, labels) == 1
    first = [json.loads(l) for l in hist.read_text(encoding="utf-8").splitlines()]
    assert first[0]["realized"]["correct"] is False and "realized" not in first[1]
    # Running again changes nothing: a scored row is never re-scored.
    assert score_history_file(hist, data, labels) == 0
    assert [json.loads(l) for l in hist.read_text(encoding="utf-8").splitlines()] == first


def test_monthly_outcomes_at_7_14_28_days():
    bands = [{"step": s, "date": f"d{s}", "p5": 90, "p10": 93, "p25": 97, "p50": 100, "p75": 103, "p90": 107, "p95": 110}
             for s in range(31)]
    z = score_horizons(bands, {"d7": 101, "d14": 108, "d28": 80})
    assert z["7"]["inside80"] and z["7"]["inside90"]
    assert not z["14"]["inside80"] and z["14"]["inside90"] and z["14"]["bucket"] == "p90-p95"
    assert not z["28"]["inside90"] and z["28"]["bucket"] == "<p5"
    assert abs(z["28"]["abs_err_median"] - 0.2) < 1e-12
    assert score_horizons(bands, {"d7": 101}).keys() == {"7"}
