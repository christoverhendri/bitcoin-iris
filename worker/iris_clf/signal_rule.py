"""
iris_clf.signal_rule
====================
Aturan keputusan 3 keadaan (BULL, BEAR, NONE) berdasarkan threshold Validation.
"""
import json
import os


def load_rule(model_dir: str) -> dict:
    path = os.path.join(model_dir, "signal_rule.json")
    if not os.path.exists(path):
        raise FileNotFoundError(f"signal_rule.json tidak ditemukan di {model_dir}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def decide(p_up: float, rule: dict) -> str:
    """
    Menghitung keputusan 3 keadaan:
    - p_up > t_bull -> 'BULL'
    - p_up < t_bear -> 'BEAR'
    - selain itu (termasuk pada batas p == t_bear atau p == t_bull) -> 'NONE'
    """
    t_bear = float(rule["t_bear"])
    t_bull = float(rule["t_bull"])
    if p_up > t_bull:
        return "BULL"
    elif p_up < t_bear:
        return "BEAR"
    else:
        return "NONE"
