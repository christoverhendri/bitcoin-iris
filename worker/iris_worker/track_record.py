"""
iris_worker.track_record
========================
Rekam jejak sinyal model di data uji (out-of-sample): "kalau model bilang BULL,
seberapa sering benar?" Inilah angka "confidence" yang ditampilkan di dashboard —
BUKAN `p_up` mentah, yang tidak terkalibrasi (model ini memberi p_up 0.24 dan
tetap berarti BULL karena ambangnya 0.06).

Bahan:
- `parity_check.csv` dari export notebook = probabilitas model di set uji;
- label set uji dibangun ulang dengan `make_label` (kode yang sama dengan training)
  dari CSV training (data/seed). Label hanya ada untuk minggu dengan pergerakan
  berarti (|return 7h| > 0.5 x vol mingguan); minggu "noise" memang tidak berlabel.

    python -m iris_worker.track_record    # tulis models/clf_7d/track_record.json
"""
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

import pandas as pd

from iris_clf.signal_rule import decide, load_rule


def compute(p_avg: pd.Series, labels: pd.Series, rule: Dict[str, Any]) -> Dict[str, Any]:
    """Pure: precision per sinyal pada hari uji yang berlabel."""
    df = pd.DataFrame({"p": p_avg, "label": labels.reindex(p_avg.index)}).dropna()
    df["signal"] = [decide(float(p), rule) for p in df["p"]]
    n = len(df)
    out: Dict[str, Any] = {
        "eval_from": str(df.index.min().date()),
        "eval_to": str(df.index.max().date()),
        "n_labeled": n,
        "base_rate_up": float(df["label"].mean()),
        "accuracy": None,
        "by_signal": {},
    }
    target = {"BULL": 1.0, "BEAR": 0.0}
    hits = 0
    called = 0
    for sig, want in target.items():
        sub = df[df["signal"] == sig]
        if len(sub) == 0:
            out["by_signal"][sig] = {"n": 0, "precision": None, "share": 0.0}
            continue
        correct = int((sub["label"] == want).sum())
        hits += correct
        called += len(sub)
        out["by_signal"][sig] = {
            "n": int(len(sub)),
            "precision": correct / len(sub),
            "share": len(sub) / n,
            # Seberapa sering arah ini terjadi tanpa model, untuk pembanding.
            "base_rate": float((df["label"] == want).mean()),
        }
    none = df[df["signal"] == "NONE"]
    out["by_signal"]["NONE"] = {"n": int(len(none)), "share": len(none) / n if n else 0.0}
    out["accuracy"] = hits / called if called else None
    return out


def build(model_dir: Path, seed_master: Path) -> Dict[str, Any]:
    from iris_clf.features import load_master, make_label

    pc = pd.read_csv(model_dir / "parity_check.csv", index_col=0, parse_dates=True)
    labels = make_label(load_master(str(seed_master)))
    rule = load_rule(str(model_dir))
    meta = json.loads((model_dir / "meta.json").read_text(encoding="utf-8"))
    rec = compute(pc["p_avg"], labels, rule)
    rec.update({
        "model_created_utc": meta.get("created_utc"),
        "rule_method": rule.get("method"),
        "threshold": rule.get("t_bull") if rule.get("t_bull") == rule.get("t_bear") else None,
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "note": "Labelled test weeks only (|7d return| > 0.5 x weekly vol); quiet weeks have no label.",
    })
    return rec


def load(model_dir: Path) -> Dict[str, Any]:
    p = Path(model_dir) / "track_record.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def main():
    from iris_worker import config

    rec = build(Path(config.CLF_MODEL_DIR), Path(config.CLF_SEED_DIR) / "btc_master_2.csv")
    out = Path(config.CLF_MODEL_DIR) / "track_record.json"
    out.write_text(json.dumps(rec, indent=2), encoding="utf-8")
    print(json.dumps(rec, indent=2))
    print(f"Ditulis ke {out}")


if __name__ == "__main__":
    main()
