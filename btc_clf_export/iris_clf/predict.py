"""
iris_clf.predict
================
Inference Average Ensemble (XGBoost per domain, probabilitas dirata-rata).

Pakai dari repo:
    from iris_clf import ClassifierSignal
    clf = ClassifierSignal.from_dir("models/clf_7d")
    sig = clf.predict_latest("data/clf/btc_master_2.csv", "data/clf/kategori")
    # {'as_of': '2026-08-21', 'direction': 'BULL', 'p_up': 0.61, ...}

CLI:
    python -m iris_clf.predict --model-dir models/clf_7d \
        --master data/clf/btc_master_2.csv --category-dir data/clf/kategori
"""
import argparse
import json
import os

import numpy as np
import pandas as pd
import xgboost as xgb

from .features import build_domain_frames


class ClassifierSignal:
    def __init__(self, meta, boosters):
        self.meta = meta
        self.boosters = boosters
        self.domains = list(meta["domains"].keys())
        self.threshold = float(meta["avg_threshold"])

    # -- load ---------------------------------------------------------------
    @classmethod
    def from_dir(cls, model_dir):
        with open(os.path.join(model_dir, "meta.json")) as f:
            meta = json.load(f)
        boosters = {}
        for name in meta["domains"]:
            b = xgb.Booster()
            b.load_model(os.path.join(model_dir, f"xgb_{name}.json"))
            boosters[name] = b
        return cls(meta, boosters)

    # -- fitur --------------------------------------------------------------
    def build_frames(self, master_path, category_dir):
        data, frames = build_domain_frames(
            master_path, category_dir, self.domains,
            non_tech_cols=self.meta.get("universal_non_tech_cols"),
        )
        out = {}
        for name, df in frames.items():
            cols = self.meta["domains"][name]
            missing = [c for c in cols if c not in df.columns]
            if missing:
                raise KeyError(
                    f"[{name}] {len(missing)} kolom fitur hilang dari data input: {missing[:8]}..."
                )
            out[name] = df[cols]  # urutan kolom persis seperti saat training
        return data, out

    # -- prediksi -----------------------------------------------------------
    def predict_frames(self, frames):
        """DataFrame proba per domain + p_avg untuk semua tanggal (baris NaN tidak dibuang)."""
        probs = {}
        for name, X in frames.items():
            probs[name] = pd.Series(self.boosters[name].predict(xgb.DMatrix(X)), index=X.index)
        out = pd.DataFrame(probs)
        out["p_avg"] = out[self.domains].mean(axis=1)
        return out

    def predict_latest(self, master_path, category_dir):
        data, frames = self.build_frames(master_path, category_dir)
        proba = self.predict_frames({k: v.iloc[[-1]] for k, v in frames.items()})
        row = proba.iloc[0]
        p, th = float(row["p_avg"]), self.threshold
        margin = abs(p - th)
        gates = self.meta.get("conviction_gate_margin", {})
        return {
            "as_of": str(proba.index[0].date()),
            "horizon_days": self.meta["horizon_days"],
            "direction": "BULL" if p >= th else "BEAR",
            "p_up": p,
            "threshold": th,
            "margin": margin,
            # contoh: {"35": True} = margin masuk 35% keyakinan tertinggi di validation
            "gate_pass": {k: bool(margin >= v) for k, v in gates.items()},
            "per_domain": {d: float(row[d]) for d in self.domains},
            "n_nan_features": {d: int(frames[d].iloc[-1].isna().sum()) for d in self.domains},
        }


def _main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model-dir", default="models/clf_7d")
    ap.add_argument("--master", required=True)
    ap.add_argument("--category-dir", required=True)
    a = ap.parse_args()
    sig = ClassifierSignal.from_dir(a.model_dir).predict_latest(a.master, a.category_dir)
    print(json.dumps(sig, indent=2))


if __name__ == "__main__":
    _main()
