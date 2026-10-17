"""
Backtest pita volatilitas 7 hari yang tampil di kartu Weekly Forecast.

Rumus yang sama dengan dashboard (src/lib/quant/series.ts realizedVolPct +
weeklyForecast/transform.ts):
    sigma_7d = vol_realisasi_30h(std populasi log-return harian) * sqrt(365) * sqrt(7/365)
    rentang  = close_t * (1 +- sigma_7d)
Diuji: berapa persen hari yang close 7 hari kemudian berakhir di dalam rentang.

    cd worker && .venv/Scripts/python scripts/backtest_vol_band.py [path master csv]
"""
import sys

import numpy as np
import pandas as pd

path = sys.argv[1] if len(sys.argv) > 1 else "data/clf/btc_master_2.csv"
c = pd.read_csv(path, index_col=0, parse_dates=True)["btc_close"].astype(float)
lr = np.log(c).diff()
sigma7 = lr.rolling(30).std(ddof=0) * np.sqrt(365) * np.sqrt(7 / 365)
fwd = c.shift(-7) / c - 1
inside = (fwd.abs() <= sigma7).where(fwd.notna() & sigma7.notna()).dropna()

print(f"data {inside.index.min().date()} .. {inside.index.max().date()}, n={len(inside)} hari")
print(f"di dalam rentang: {inside.mean() * 100:.1f}%  (teori normal 1 sigma: 68.3%)")
for y, s in inside.groupby(inside.index.year):
    print(f"  {y}: {s.mean() * 100:.1f}%  (n={len(s)})")
