"""
Prediksi mingguan — MUAT model tersimpan (TANPA training), hitung sinyal terbaru,
lalu catat ke CSV. Aman dijalankan berkali-kali: tanggal data yang sama tidak dicatat dua kali.

    python weekly_predict.py --master data/clf/btc_master_2.csv --category-dir data/clf/kategori
"""
import argparse
import os
import sys
from datetime import datetime, timezone

import pandas as pd

from iris_clf import ClassifierSignal

ap = argparse.ArgumentParser()
ap.add_argument("--model-dir", default="models/clf_7d")
ap.add_argument("--master", required=True)
ap.add_argument("--category-dir", required=True)
ap.add_argument("--log", default="logs/clf_7d_signals.csv")
ap.add_argument("--max-lag-days", type=int, default=3,
                help="tandai 'stale' kalau data terakhir lebih tua dari ini")
a = ap.parse_args()

s = ClassifierSignal.from_dir(a.model_dir).predict_latest(a.master, a.category_dir)
lag = (pd.Timestamp.today().normalize() - pd.Timestamp(s["as_of"])).days

row = {
    "as_of": s["as_of"],
    "direction": s["direction"],
    "p_up": round(s["p_up"], 6),
    "threshold": s["threshold"],
    "margin": round(s["margin"], 6),
    **{f"gate{k}_pass": v for k, v in s["gate_pass"].items()},
    **{f"p_{d}": round(p, 6) for d, p in s["per_domain"].items()},
    **{f"nan_{d}": n for d, n in s["n_nan_features"].items()},
    "data_lag_days": lag,
    "stale": lag > a.max_lag_days,
    "logged_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
}

print(f"[{row['as_of']}] {row['direction']}  p_up={row['p_up']:.3f}  "
      f"th={row['threshold']:.2f}  margin={row['margin']:.3f}")
if row["stale"]:
    print(f"PERINGATAN: data tertinggal {lag} hari — update data/clf dulu sebelum dipercaya.",
          file=sys.stderr)

os.makedirs(os.path.dirname(a.log) or ".", exist_ok=True)
if os.path.exists(a.log):
    old = pd.read_csv(a.log)
    if row["as_of"] in set(old["as_of"].astype(str)):
        print(f"Sudah tercatat untuk {row['as_of']}, dilewati.")
        sys.exit(0)
    pd.concat([old, pd.DataFrame([row])], ignore_index=True).to_csv(a.log, index=False)
else:
    pd.DataFrame([row]).to_csv(a.log, index=False)
print(f"Dicatat ke {a.log}")
