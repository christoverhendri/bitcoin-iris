"""
iris_clf.signal_rule
====================
Aturan keputusan sinyal dari probabilitas rata-rata model (`p_up`).

Dua bentuk, dipilih dari artefak export notebook:

1. `signal_rule.json` ada di folder model -> aturan dua ambang (BULL / BEAR / NONE):
       p_up > t_bull -> BULL;  p_up < t_bear -> BEAR;  selain itu -> NONE
2. Tidak ada -> aturan biner dari `meta.json` `avg_threshold` (ambang hasil tuning di
   notebook), persis seperti `combine` di meta: BULL kalau p_up >= ambang, selain itu BEAR.

Tidak ada ambang yang ditulis tangan di repo ini: angkanya selalu dari export notebook.
"""
import json
import os

BINARY_METHOD = "binary_avg_threshold"


def load_rule(model_dir: str) -> dict:
    path = os.path.join(model_dir, "signal_rule.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    with open(os.path.join(model_dir, "meta.json"), "r", encoding="utf-8") as f:
        meta = json.load(f)
    th = float(meta["avg_threshold"])
    return {
        "method": BINARY_METHOD,
        # Kolom t_bear / t_bull tetap diisi (sama dengan ambang) supaya bentuk baris
        # clf_signals tidak berubah; `method` yang menentukan cara membacanya.
        "t_bear": th,
        "t_bull": th,
        "threshold_source": "meta.json avg_threshold",
    }


def decide(p_up: float, rule: dict) -> str:
    t_bear = float(rule["t_bear"])
    t_bull = float(rule["t_bull"])
    if rule.get("method") == BINARY_METHOD:
        return "BULL" if p_up >= t_bull else "BEAR"
    if p_up > t_bull:
        return "BULL"
    elif p_up < t_bear:
        return "BEAR"
    else:
        return "NONE"
