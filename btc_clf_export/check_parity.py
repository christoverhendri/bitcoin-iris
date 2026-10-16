"""
Bukti bahwa kode repo = notebook: bandingkan probabilitas hasil repo dengan
parity_check.csv (probabilitas test set dari notebook).

    python check_parity.py --model-dir models/clf_7d \
        --master data/clf/btc_master_2.csv --category-dir data/clf/kategori
"""
import argparse
import sys

import pandas as pd

from iris_clf import ClassifierSignal

ap = argparse.ArgumentParser()
ap.add_argument("--model-dir", default="models/clf_7d")
ap.add_argument("--master", required=True)
ap.add_argument("--category-dir", required=True)
ap.add_argument("--tol", type=float, default=1e-5)
a = ap.parse_args()

clf = ClassifierSignal.from_dir(a.model_dir)
_, frames = clf.build_frames(a.master, a.category_dir)
got = clf.predict_frames(frames)
ref = pd.read_csv(f"{a.model_dir}/parity_check.csv", index_col=0, parse_dates=True)

common = ref.index.intersection(got.index)
if len(common) != len(ref):
    sys.exit(f"GAGAL: hanya {len(common)} dari {len(ref)} tanggal referensi ada di data input")

diff = (got.loc[common, ref.columns] - ref).abs().max()
print("Selisih maks per kolom:\n", diff.to_string())
if diff.max() > a.tol:
    sys.exit(f"GAGAL: selisih {diff.max():.2e} > toleransi {a.tol:.0e}")
print(f"LOLOS ({len(common)} tanggal, toleransi {a.tol:.0e})")
