"""Faithful re-run of BTC_Halving_Cycle_PowerLaw.ipynb (no plots, no quantile-regression
visual) on prices frozen at 2026-10-18, to produce parity fixtures for the TypeScript port.
Usage: python nb_repro.py <out_dir> [<price_csv>]"""
import json, sys, os
import numpy as np
import pandas as pd
import requests
from scipy import stats

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
CACHE_CSV = os.path.join(OUT, "btc_price_daily.csv")
END = "2026-10-18"
HEIGHT = 972106
REF = pd.Timestamp(END)

GENESIS = pd.Timestamp("2009-01-03")
HALVINGS = [pd.Timestamp(d) for d in ["2012-11-28", "2016-07-09", "2020-05-11", "2024-04-20"]]
NEXT_HALVING_HEIGHT = 1_050_000
MAJOR_TOP_DRAWDOWN = 0.60
TOP_CONFIRM_DRAWDOWN = 0.40
EXCLUDE_FIRST_CYCLE = False
SCALE_INFLATE = 1.0
PL_WF_START = pd.Timestamp("2012-01-01")
LOWER_PCT, UPPER_PCT = 10, 90
EPISODE_GAP_DAYS = 60


def from_coinmetrics():
    url = "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics"
    params = {"assets": "btc", "metrics": "PriceUSD", "frequency": "1d",
              "start_time": "2010-07-01", "end_time": END, "page_size": 10000}
    rows, nxt = [], None
    while True:
        r = requests.get(nxt or url, params=None if nxt else params, timeout=60)
        r.raise_for_status()
        j = r.json()
        rows += [(d["time"][:10], float(d["PriceUSD"])) for d in j["data"] if d.get("PriceUSD")]
        nxt = j.get("next_page_url")
        if not nxt:
            break
    return pd.Series(dict(rows), name="close")


if len(sys.argv) > 2:
    s = pd.read_csv(sys.argv[2], index_col=0)["close"]
else:
    s = from_coinmetrics()
s.index = pd.to_datetime(s.index)
s = s[s > 0].sort_index()
s = s[~s.index.duplicated(keep="last")].asfreq("D").ffill()
price = s.astype(float)
price.to_frame("close").to_csv(CACHE_CSV, float_format="%.10f")
# Re-read so every downstream number comes from exactly what the fixture holds.
price = pd.read_csv(CACHE_CSV, index_col=0, parse_dates=True)["close"].asfreq("D")
TODAY = price.index.max()
print("price", price.index.min().date(), TODAY.date(), len(price))


def find_major_tops(px, min_dd):
    tops = []
    peak_d, peak_p = px.index[0], px.iloc[0]
    trough_d, trough_p = peak_d, peak_p
    for d, p in px.items():
        if p > peak_p:
            if 1 - trough_p / peak_p >= min_dd:
                tops.append((peak_d, peak_p, trough_d, trough_p))
            peak_d, peak_p, trough_d, trough_p = d, p, d, p
        elif p < trough_p:
            trough_d, trough_p = d, p
    return tops, (peak_d, peak_p, trough_d, trough_p)


major, open_peak = find_major_tops(price, MAJOR_TOP_DRAWDOWN)
rows = []
for k, h in enumerate(HALVINGS, start=1):
    end = HALVINGS[k] if k < len(HALVINGS) else TODAY + pd.Timedelta(days=1)
    cand = [t for t in major if h <= t[0] < end]
    complete = bool(cand)
    if cand:
        top_d, top_p, bot_d, bot_p = max(cand, key=lambda t: t[1])
    elif k == len(HALVINGS) and open_peak[0] >= h:
        top_d, top_p, bot_d, bot_p = open_peak
    else:
        continue
    rows.append({"siklus": k, "halving": h, "top_date": top_d, "top_price": top_p,
                 "bottom_date": bot_d, "bottom_price": bot_p,
                 "top_confirmed": complete or (1 - bot_p / top_p) >= TOP_CONFIRM_DRAWDOWN,
                 "bottom_confirmed": complete})
cyc = pd.DataFrame(rows).set_index("siklus")
cur = cyc.iloc[-1]
print(cyc)


def predictive(values):
    x = np.asarray(values, float)
    n = len(x)
    if n < 2:
        return None
    return stats.t(df=n - 1, loc=x.mean(), scale=x.std(ddof=1) * np.sqrt(1 + 1 / n) * SCALE_INFLATE)


use = cyc.iloc[1:] if EXCLUDE_FIRST_CYCLE else cyc
tops_ok = use[use.top_confirmed]
done = use[use.bottom_confirmed]
h2t = {k: (r.top_date - r.halving).days for k, r in tops_ok.iterrows()}
t2b = {k: (r.bottom_date - r.top_date).days for k, r in done.iterrows()}
t2t = {f"{a}-{b}": (cyc.loc[b, "top_date"] - cyc.loc[a, "top_date"]).days
       for a, b in zip(cyc.index[:-1], cyc.index[1:]) if a in tops_ok.index and cyc.loc[b, "top_confirmed"]}
b2t = {f"{a}-{b}": (cyc.loc[b, "top_date"] - cyc.loc[a, "bottom_date"]).days
       for a, b in zip(cyc.index[:-1], cyc.index[1:]) if a in done.index and cyc.loc[b, "top_confirmed"]}
mult = {f"{a}-{b}": cyc.loc[b, "top_price"] / cyc.loc[a, "top_price"]
        for a, b in zip(cyc.index[:-1], cyc.index[1:]) if a in tops_ok.index and cyc.loc[b, "top_confirmed"]}
dd = {k: (r.bottom_price / r.top_price - 1) * 100 for k, r in done.iterrows()}


def interval(values):
    d = predictive(values)
    if d is None:
        return None
    return {"mean": float(np.mean(values)), "p80": [float(d.ppf(0.10)), float(d.ppf(0.90))],
            "p95": [float(d.ppf(0.025)), float(d.ppf(0.975))]}


duration_intervals = {"halving_to_top": interval(list(h2t.values())), "top_to_bottom": interval(list(t2b.values())),
                      "top_to_top": interval(list(t2t.values())), "bottom_to_top": interval(list(b2t.values())),
                      "multiple": interval(list(mult.values())), "drawdown_pct": interval(list(dd.values()))}


def loo_row(target, method, anchor, history, actual):
    pred = anchor + pd.Timedelta(days=float(np.mean(history)))
    d = predictive(history)
    inside = None
    if d is not None:
        off = (actual - anchor).days
        inside = bool(d.ppf(0.10) <= off <= d.ppf(0.90))
    return {"target": target, "method": method, "n": len(history), "guess": str(pred.date()),
            "actual": str(actual.date()), "miss_days": (actual - pred).days, "inside80": inside}


bt = []
ks = list(cyc.index)
for i, k in enumerate(ks):
    prev = ks[:i]
    if not prev or not cyc.loc[k, "top_confirmed"]:
        continue
    actual_top = cyc.loc[k, "top_date"]
    hist_t2t = [(cyc.loc[b, "top_date"] - cyc.loc[a, "top_date"]).days for a, b in zip(prev[:-1], prev[1:])]
    if hist_t2t:
        bt.append(loo_row(f"top {k}", "A", cyc.loc[prev[-1], "top_date"], hist_t2t, actual_top))
    hist_h2t = [(cyc.loc[p, "top_date"] - cyc.loc[p, "halving"]).days for p in prev]
    bt.append(loo_row(f"top {k}", "B", cyc.loc[k, "halving"], hist_h2t, actual_top))
    hist_b2t = [(cyc.loc[b, "top_date"] - cyc.loc[a, "bottom_date"]).days for a, b in zip(prev[:-1], prev[1:])]
    if hist_b2t:
        bt.append(loo_row(f"top {k}", "C", cyc.loc[prev[-1], "bottom_date"], hist_b2t, actual_top))
    if cyc.loc[k, "bottom_confirmed"]:
        hist_t2b = [(cyc.loc[p, "bottom_date"] - cyc.loc[p, "top_date"]).days for p in prev]
        bt.append(loo_row(f"bottom {k}", "BOTTOM", actual_top, hist_t2b, cyc.loc[k, "bottom_date"]))

d_t2b = predictive(list(t2b.values()))
top_now, top_now_p = cur.top_date, cur.top_price
day = lambda anchor, x: str((anchor + pd.Timedelta(days=float(x))).date())
bottom_intervals = {str(int(l * 100)): [day(top_now, d_t2b.ppf((1 - l) / 2)), day(top_now, d_t2b.ppf(1 - (1 - l) / 2))]
                    for l in [0.5, 0.8, 0.95]}
checkpoints = pd.date_range(TODAY - pd.DateOffset(months=3), TODAY + pd.DateOffset(months=9), freq="ME")
cdf = [{"date": str(c.date()), "p": float(d_t2b.cdf((c - top_now).days))} for c in checkpoints]
dd_vals = list(dd.values())
trend = np.polyfit(range(len(dd_vals)), dd_vals, 1)
scen = {"last": dd_vals[-1], "mean": float(np.mean(dd_vals)), "trend": float(np.polyval(trend, len(dd_vals)))}

remaining = NEXT_HALVING_HEIGHT - HEIGHT
halving_est = {m: REF + pd.Timedelta(minutes=remaining * m) for m in [9.6, 9.85, 10.0]}
next_h = halving_est[9.85]
d_h2t = predictive(list(h2t.values()))
d_t2t = predictive(list(t2t.values()))
next_top = {}
for name, anchor, d in [("B", next_h, d_h2t), ("A", top_now, d_t2t)]:
    next_top[name] = {"center": day(anchor, d.median()), "p80": [day(anchor, d.ppf(0.1)), day(anchor, d.ppf(0.9))]}
lm = np.log(list(mult.values()))
ratios = lm[1:] / lm[:-1]
scen_top = {"last": float(np.exp(lm[-1])), "ratio_mean": float(np.exp(lm[-1] * np.nanmean(ratios))),
            "ratio_min": float(np.exp(lm[-1] * np.nanmin(ratios))), "ratio_max": float(np.exp(lm[-1] * np.nanmax(ratios)))}

# --- power law
x_all = np.log10((price.index - GENESIS).days.values.astype(float))
y_all = np.log10(price.values)
QUANTS = [0.05, 0.25, 0.50, 0.75, 0.95]
idx = price.index
refits = pd.date_range(PL_WF_START, TODAY, freq="MS")
wf_pct = pd.Series(np.nan, index=idx)
fit_log = []
for i, R in enumerate(refits):
    past = idx < R
    b, a = np.polyfit(x_all[past], y_all[past], 1)
    resid = np.sort(y_all[past] - (a + b * x_all[past]))
    nxt = refits[i + 1] if i + 1 < len(refits) else TODAY + pd.Timedelta(days=1)
    blk = (idx >= R) & (idx < nxt)
    r_blk = y_all[blk] - (a + b * x_all[blk])
    wf_pct[blk] = np.searchsorted(resid, r_blk, side="right") / len(resid) * 100
    fit_log.append({"refit": R, "a": a, "b": b, "resid_q": np.quantile(resid, QUANTS)})
wf_pct = wf_pct.dropna()


def zone(p):
    return ("Sangat murah" if p < 10 else "Murah" if p < 30 else "Wajar" if p < 70
            else "Mahal" if p < 90 else "Sangat mahal")


fl = pd.DataFrame(fit_log).set_index("refit")
fwd365 = price.shift(-365) / price - 1
fwd180 = price.shift(-180) / price - 1
dfz = pd.DataFrame({"pct": wf_pct, "fwd365": fwd365.reindex(wf_pct.index)}).dropna()
dfz["zona"] = dfz["pct"].apply(zone)
order = ["Sangat murah", "Murah", "Wajar", "Mahal", "Sangat mahal"]
g = dfz.groupby("zona")
zones = [{"zone": z, "n": int(g.size()[z]), "p_up": float((g.get_group(z)["fwd365"] > 0).mean()),
          "median": float(g.get_group(z)["fwd365"].median())} for z in order]
base = {"n": len(dfz), "p_up": float((dfz["fwd365"] > 0).mean()), "median": float(dfz["fwd365"].median()),
        "from": str(dfz.index.min().date()), "to": str(dfz.index.max().date())}


def episode_starts(cond, gap=EPISODE_GAP_DAYS):
    starts, last = [], None
    for d in cond.index[cond.values]:
        if last is None or (d - last).days >= gap:
            starts.append(d)
        last = d
    return starts


def nn(v):
    return None if v is None or (isinstance(v, float) and np.isnan(v)) else float(v)


def episode_table(starts):
    out = []
    for d in starts:
        p = price[d]
        nxt = price[(price.index > d) & (price.index <= d + pd.Timedelta(days=365))]
        out.append({"date": str(d.date()), "price": float(p), "pct": float(wf_pct[d]),
                    "ret180": nn(fwd180.get(d)), "ret365": nn(fwd365.get(d)),
                    "max_up": float(nxt.max() / p - 1) if len(nxt) else None,
                    "max_down": float(nxt.min() / p - 1) if len(nxt) else None})
    return out


low_ep = episode_table(episode_starts(wf_pct <= LOWER_PCT))
up_ep = episode_table(episode_starts(wf_pct >= UPPER_PCT))
pts = [{"kind": "top", "date": str(r.top_date.date()), "pct": float(wf_pct.get(r.top_date, np.nan))} for _, r in cyc.iterrows()] + \
      [{"kind": "bottom", "date": str(r.bottom_date.date()), "pct": float(wf_pct.get(r.bottom_date, np.nan))}
       for _, r in cyc[cyc.bottom_confirmed].iterrows()]
last = fl.iloc[-1]


def band_price(date, q_index):
    days = (date - GENESIS).days
    return 10 ** (last["a"] + last["b"] * np.log10(days) + last["resid_q"][q_index])


points = {"today": TODAY, "bottom_center": top_now + pd.Timedelta(days=d_t2b.median()),
          "next_top_B": next_h + pd.Timedelta(days=d_h2t.median())}
bands = {k: {"date": str(d.date()), "bands": [float(band_price(d, i)) for i in range(5)]} for k, d in points.items()}

summary = {
    "as_of": str(TODAY.date()), "price_now": float(price.iloc[-1]), "block_height": HEIGHT, "ref_date": END,
    "cycles": [{"siklus": int(i), "halving": str(r.halving.date()), "top_date": str(r.top_date.date()),
                "top_price": float(r.top_price), "bottom_date": str(r.bottom_date.date()),
                "bottom_price": float(r.bottom_price), "top_confirmed": bool(r.top_confirmed),
                "bottom_confirmed": bool(r.bottom_confirmed)} for i, r in cyc.iterrows()],
    "durations_days": {"halving_to_top": {str(k): int(v) for k, v in h2t.items()},
                       "top_to_bottom": {str(k): int(v) for k, v in t2b.items()},
                       "top_to_top": t2t, "bottom_to_top": b2t},
    "multiples": {k: float(v) for k, v in mult.items()},
    "drawdowns_pct": {str(k): float(v) for k, v in dd.items()},
    "duration_intervals": duration_intervals,
    "backtest": bt,
    "current_cycle": {
        "top_date": str(top_now.date()), "top_price": float(top_now_p), "top_confirmed": bool(cur.top_confirmed),
        "bottom_center": day(top_now, d_t2b.median()),
        "bottom_intervals": bottom_intervals,
        "bottom_cdf": cdf,
        "low_so_far": {"date": str(cur.bottom_date.date()), "price": float(cur.bottom_price)},
        "bottom_drawdown_scenarios_pct": scen,
        "bottom_price_scenarios": {k: float(top_now_p * (1 + v / 100)) for k, v in scen.items()},
    },
    "next_halving_est": {str(m): str(v.date()) for m, v in halving_est.items()},
    "next_top": next_top,
    "next_top_multiples": scen_top,
    "next_top_price_scenarios": {k: float(top_now_p * v) for k, v in scen_top.items()},
    "power_law": {"percentile_today": float(wf_pct.iloc[-1]), "zone_today": zone(wf_pct.iloc[-1]),
                  "a": float(last["a"]), "b": float(last["b"]),
                  "b_2014": float(fl.loc["2014-01-01", "b"]), "b_2018": float(fl.loc["2018-01-01", "b"]),
                  "resid_quantiles": [float(v) for v in last["resid_q"]], "refits": len(fl)},
    "zones": zones, "zone_base": base,
    "episodes_low": low_ep, "episodes_high": up_ep,
    "percentile_at_turns": pts,
    "bands_at": bands,
}
with open(os.path.join(OUT, "cycle_powerlaw_summary.json"), "w") as f:
    json.dump(summary, f, indent=2)
pd.DataFrame({"corridor_pct": wf_pct, "zone": wf_pct.apply(zone)}).to_csv(
    os.path.join(OUT, "power_law_daily.csv"), float_format="%.10f")
print(json.dumps({k: summary[k] for k in ["current_cycle", "next_halving_est", "next_top", "next_top_price_scenarios"]}, indent=1))
print(json.dumps(summary["power_law"]), json.dumps(zones), json.dumps(base))
print([e["date"] for e in low_ep], [e["date"] for e in up_ep])
print(pts)
print(json.dumps(bt))
