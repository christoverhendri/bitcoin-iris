"""Benchmark: XGBoost quantile models vs. no-skill baselines (30-day BTC log return).

Reproduces the analysis that led IRIS to ship a volatility-based Monte Carlo
instead of a directional ML model for the monthly forecast.

    pip install -r worker/research/requirements.txt
    python worker/research/benchmark_xgb_vs_baselines.py path/to/btc_master_2.csv

Same 5 expanding walk-forward folds as the original baseline_v2 script. Scored by
coverage (overall, per fold, and on non-overlapping samples) and by pinball loss
— the proper score for quantile forecasts; coverage alone rewards a constant.

Findings on btc_master_2 (2018-02 .. 2026-08), mean over folds:
  XGB Step 1 / Step 2 (original)  pinball 0.053 / 0.050, fold coverage 63-92%
  Constant historical quantiles   pinball 0.045
  Vol-scaled, median 0            pinball 0.048, fold coverage 73-84% (best calibrated)
  XGB with stationary features + purge also fails to beat the baselines,
  so the gap is not only a bug: the 30-day *direction* is not predictable
  from these features, while the *width* (volatility) is.

Leakage note: the two "(asli)" rows deliberately reproduce the original
baseline_v2 script, which has two leaks — no purge gap (the last 30 training
rows' targets overlap the test window) and redundant-feature selection computed
on the full dataset including test rows. Both flatter the XGB models, so their
loss to the baselines is if anything understated. The "+ purge" rows remove the
first leak; the stationary-feature row also avoids price-level features.
"""
import sys

import numpy as np
import pandas as pd
import xgboost as xgb

P = sys.argv[1]; H = 30; NS = 5; Q = [0.1, 0.5, 0.9]
df = pd.read_csv(P, parse_dates=["date"]).sort_values("date").reset_index(drop=True)
c = df["btc_close"]
df["y"] = np.log(c.shift(-H) / c)
lr = np.log(c / c.shift(1))

# --- fitur ORIGINAL (step 1 + step 2 persis seperti script) ---
for l in [1,3,7,14,30]: df[f"close_lag_{l}"] = c.shift(l)
df["close_roll_mean_7"]=c.rolling(7).mean(); df["close_roll_std_7"]=c.rolling(7).std(); df["close_roll_mean_30"]=c.rolling(30).mean()
df["dayofweek"]=df.date.dt.dayofweek; df["month"]=df.date.dt.month; df["quarter"]=df.date.dt.quarter; df["dayofyear"]=df.date.dt.dayofyear
S1 = ["close_lag_1","close_lag_3","close_lag_7","close_lag_14","close_lag_30","close_roll_mean_7","close_roll_std_7","close_roll_mean_30","dayofweek","month","quarter","dayofyear"]
TECH = ["ema_5","ema_8","ema_13","ema_21","rsi_14","macd","macd_signal","macd_hist","bb_mid","bb_upper","bb_lower","bb_width","atr_14","log_return","realized_vol_14"]
def dedup(cols, thr=.95):
    cr = df[cols].corr().abs(); drop=set()
    for i,a in enumerate(cols):
        if a in drop: continue
        for b in cols[i+1:]:
            if b not in drop and cr.loc[a,b]>thr: drop.add(b)
    return [x for x in cols if x not in drop]
S2 = dedup(S1+TECH)

# --- fitur STASIONER (perbaikan) ---
for w in [7,30,90,180]: df[f"ret_{w}"] = np.log(c/c.shift(w))
for w in [14,30,90]: df[f"vol_{w}"] = lr.rolling(w).std()
df["vol_ratio"] = df.vol_14/df.vol_90
df["dist_ma50"] = np.log(c/c.rolling(50).mean()); df["dist_ma200"] = np.log(c/c.rolling(200).mean())
df["dd_365"] = np.log(c/c.rolling(365,min_periods=200).max())
df["rsi"] = df["rsi_14"]; df["bbw"] = df["bb_width"]/df["bb_mid"]
df["hs"] = df["halving_phase_sin"]; df["hc"] = df["halving_phase_cos"]
STAT = ["ret_7","ret_30","ret_90","ret_180","vol_14","vol_30","vol_90","vol_ratio","dist_ma50","dist_ma200","dd_365","rsi","bbw","hs","hc"]

valid = df.dropna(subset=S1+["y"]).reset_index(drop=True)
n=len(valid); fs=n//(NS+1)
folds=[(valid.date[fs*i], valid.date[min(fs*(i+1),n)-1]) for i in range(1,NS+1)]

def pinball(y,q,a): d=y-q; return np.mean(np.maximum(a*d,(a-1)*d))
def xgbq(tr,te,cols,a,deep=False):
    m=xgb.XGBRegressor(objective="reg:quantileerror",quantile_alpha=a,n_estimators=100,max_depth=3,learning_rate=.05,
        colsample_bytree=.7,subsample=.8,min_child_weight=10,reg_alpha=1,reg_lambda=2,random_state=42)
    m.fit(tr[cols],tr["y"]); return m.predict(te[cols])

def run(name, fn, purge):
    rows=[]
    for k,(t0,t1) in enumerate(folds,1):
        d=df.dropna(subset=["y"])
        te=d[(d.date>=t0)&(d.date<=t1)]
        # purge: buang baris train yang targetnya "melihat" periode test
        cutoff = t0 - pd.Timedelta(days=H) if purge else t0
        tr=d[d.date<cutoff] if purge else d[(d.date<t0)&(d.date>=valid.date[0])]
        P_=fn(tr,te); lo,mi,hi=P_
        lo,hi=np.minimum(lo,hi),np.maximum(lo,hi)
        y=te.y.values; inn=(y>=lo)&(y<=hi)
        idx=np.arange(0,len(y),H)  # sampel non-overlapping
        rows.append(dict(model=name,fold=k,test=f"{t0.date()}..{t1.date()}",cov=inn.mean(),cov_indep=inn[idx].mean(),n_indep=len(idx),
            width=np.mean(hi-lo),pinball=np.mean([pinball(y,p,a) for p,a in zip([lo,mi,hi],Q)]),
            mae_mid=np.mean(np.abs(y-mi)),dir_acc=np.mean(np.sign(mi)==np.sign(y)),pct_up=np.mean(y>0),
            frac_q50_up=np.mean(mi>0)))
    return rows

M={}
M["XGB Step1 (asli)"]=(lambda tr,te:[xgbq(tr.dropna(subset=S1),te,S1,a) for a in Q], False)
M["XGB Step2 (asli)"]=(lambda tr,te:[xgbq(tr.dropna(subset=S2),te,S2,a) for a in Q], False)
# baseline 1: kuantil empiris historis (tanpa fitur apa pun)
M["Baseline: kuantil historis"]=(lambda tr,te:[np.full(len(te),np.quantile(tr.y,a)) for a in Q], True)
# baseline 2: median 0, lebar = vol 30h saat ini * sqrt(30) * kuantil standar residual historis
def volscale(tr,te):
    z=(tr.y/(tr.vol_30*np.sqrt(H))).dropna()
    s=te.vol_30.values*np.sqrt(H)
    return [np.quantile(z,a)*s if a!=0.5 else np.zeros(len(te)) for a in Q]
M["Baseline: vol-scaled, median 0"]=(volscale, True)
M["XGB fitur stasioner + purge"]=(lambda tr,te:[xgbq(tr.dropna(subset=STAT),te,STAT,a) for a in Q], True)
M["XGB Step2 + purge"]=(lambda tr,te:[xgbq(tr.dropna(subset=S2),te,S2,a) for a in Q], True)

allr=[]
for k,(f,pg) in M.items(): allr+=run(k,f,pg)
R=pd.DataFrame(allr)
pd.set_option("display.width",250); pd.set_option("display.max_columns",30)
print("S2 features:",S2)
print(R.round(3).to_string(index=False))
print("\n=== RATA-RATA ===")
print(R.groupby("model",sort=False)[["cov","cov_indep","width","pinball","mae_mid","dir_acc","frac_q50_up","pct_up"]].mean().round(3).to_string())
print("\n|cov-0.8| rata2 per fold (kalibrasi per fold):")
print(R.assign(err=(R["cov"]-.8).abs()).groupby("model",sort=False)["err"].mean().round(3).to_string())
# range harga train vs test untuk fitur level
for k,(t0,t1) in enumerate(folds,1):
    tr=df[df.date<t0]; te=df[(df.date>=t0)&(df.date<=t1)]
    print(f"fold{k}: train close max={tr.btc_close.max():,.0f} | test close range={te.btc_close.min():,.0f}-{te.btc_close.max():,.0f} | %test di atas max train={np.mean(te.btc_close>tr.btc_close.max()):.0%}")
