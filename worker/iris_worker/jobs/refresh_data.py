"""
iris_worker.jobs.refresh_data
=============================
Job harian: tarik ulang semua input model klasifikasi dari API, rakit
btc_master_2.csv + kategori/*.csv di CLF_DATA_DIR, dan tulis refresh_report.json.

Penggunaan CLI:
    python -m iris_worker.jobs.refresh_data [--data-dir DIR]

Sumber yang gagal tidak menghentikan job: kolomnya diisi dari CSV sebelumnya
(ffill) dan dilaporkan `ok=false` di refresh_report.json. Yahoo BTC-USD adalah
satu-satunya sumber wajib — tanpanya tidak ada candle untuk diprediksi.
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional

import pandas as pd

from iris_worker import config
from iris_worker.data import build, sources, state


def _log(msg: str) -> None:
    print(msg, flush=True)


def _markets() -> pd.DataFrame:
    gold = sources.yahoo_daily(sources.YAHOO_SYMBOLS["gold"], start="2017-01-01")
    spx = sources.yahoo_daily(sources.YAHOO_SYMBOLS["sp500"], start="2017-01-01")
    dji = sources.yahoo_daily(sources.YAHOO_SYMBOLS["dowjones"], start="2017-01-01")
    oil = sources.yahoo_daily(sources.YAHOO_SYMBOLS["oil"], start="2017-01-01")
    eth = sources.yahoo_daily(sources.YAHOO_SYMBOLS["eth"], start="2017-01-01")
    return pd.DataFrame({
        "gold_price": gold["close"],
        "sp500_close": spx["close"], "sp500_volume": spx["volume"],
        "dowjones_close": dji["close"], "dowjones_volume": dji["volume"],
        "oil_close": oil["close"], "oil_volume": oil["volume"],
        "eth_close": eth["close"],
    })


def _previous(data_dir: Path) -> pd.DataFrame:
    """CSV terakhir yang berhasil ditulis, atau seed training kalau belum ada."""
    for p in (data_dir / "btc_master_2.csv", config.CLF_SEED_DIR / "btc_master_2.csv"):
        if p.exists():
            return pd.read_csv(p, index_col=0, parse_dates=True)
    raise FileNotFoundError("Tidak ada CSV sebelumnya maupun seed di data/seed/")


def _fallback(prev: pd.DataFrame, cols) -> pd.DataFrame:
    """Kolom dari CSV sebelumnya, hanya sampai perubahan nilai terakhir per kolom
    (ekor ffill dibuang supaya `last_obs` jujur)."""
    out = {}
    for c in cols:
        s = prev[c]
        changed = s.ne(s.shift())
        out[c] = s.loc[: s.index[changed][-1]]
    return pd.DataFrame(out)


def run_refresh(data_dir: Optional[Path] = None, now: Optional[pd.Timestamp] = None) -> Dict:
    data_dir = Path(data_dir) if data_dir else config.CLF_DATA_DIR
    seed_master = config.CLF_SEED_DIR / "btc_master_2.csv"
    template = list(pd.read_csv(seed_master, nrows=0, index_col=0).columns)
    prev = _previous(data_dir)
    _log(f"Refresh data model -> {data_dir}")

    # 1. BTC (wajib)
    btc, btc_res = build.run_fetch(
        "yahoo_btc", ["btc_open", "btc_high", "btc_low", "btc_close", "btc_volume"],
        lambda: sources.yahoo_daily(sources.YAHOO_SYMBOLS["btc"]), _log,
    )
    if btc is None:
        raise RuntimeError(f"Sumber wajib Yahoo BTC-USD gagal: {btc_res.error}")
    # as_of = candle harian tertutup TERAKHIR YANG SUDAH ADA. Tepat setelah 00:00 UTC
    # Yahoo sering mengirim candle kemarin dengan close kosong (baris itu dibuang
    # `yahoo_daily`), jadi "kemarin" tidak boleh diasumsikan ada. Scheduler mencoba
    # ulang sampai candle kemarin muncul (lihat scheduler.data_is_fresh).
    btc = btc[btc.index <= build.last_closed_day(now)]
    as_of = btc.index.max()

    results = {"yahoo_btc": btc_res}
    parts: Dict[str, pd.DataFrame] = {}

    plan = [
        ("yahoo_markets", ["gold_price", "sp500_close", "sp500_volume", "dowjones_close",
                           "dowjones_volume", "oil_close", "oil_volume", "eth_close"], _markets),
        ("blockchain_com", list(sources.BLOCKCHAIN_CHARTS) + ["avg_transaction_value_btc",
                                                              "avg_fee_to_reward_ratio"],
         sources.blockchain_onchain),
        ("bitcoin_data", ["sopr", "mvrv"], sources.sopr_mvrv),
        ("alternative_me", ["fear_greed_value", "value_classification"], sources.fear_greed),
        ("fred", list(sources.FRED_SERIES),
         lambda: pd.DataFrame(sources.fred_all(config.FRED_API_KEY))),
    ]
    for key, cols, fn in plan:
        df, res = build.run_fetch(key, cols, fn, _log)
        results[key] = res
        # Data baru menang; riwayat yang tidak dikirim API (mis. bitcoin-data.com hanya
        # beberapa tahun terakhir) tetap diisi dari CSV sebelumnya.
        old = _fallback(prev, cols)
        parts[key] = df[cols].combine_first(old) if df is not None else old

    # 2. Seri ber-state (snapshot / rescale)
    state_dir = config.CLF_STATE_DIR

    def _usdt():
        s = state.load(state_dir, "usdt_dominance", seed_master)
        val = sources.usdt_dominance_now(config.COINGECKO_API_KEY)
        s = state.append_snapshot(s, as_of, val)
        state.save(state_dir, "usdt_dominance", s)
        return s.to_frame("usdt_dominance")

    def _trends():
        s = state.load(state_dir, "google_trends_bitcoin", seed_master)
        raw = sources.google_trends_raw()
        s = state.rescale_trends(s, raw[raw.index <= as_of])
        state.save(state_dir, "google_trends_bitcoin", s)
        return s.to_frame("google_trends_bitcoin")

    for key, col, fn in (("coingecko", "usdt_dominance", _usdt),
                         ("google_trends", "google_trends_bitcoin", _trends)):
        df, res = build.run_fetch(key, [col], fn, _log)
        results[key] = res
        if df is None:
            # Pakai state yang ada (atau seed) apa adanya.
            df = state.load(state_dir, col, seed_master).to_frame(col)
            res.last_obs = state.last_observation(df[col])
        parts[key] = df

    # 3. Rakit & tulis
    frames = build.assemble(btc, parts, template, as_of)
    for key, res in results.items():
        if res.last_obs:
            res.stale_days = int((as_of - pd.Timestamp(res.last_obs)).days)
        elif not res.ok:
            cols = [c for c in res.columns if c in parts.get(key, pd.DataFrame()).columns]
            last = parts[key][cols].dropna(how="all").index.max() if cols else None
            if last is not None:
                res.last_obs = str(last.date())
                res.stale_days = int((as_of - last).days)

    out = build.BuildResult(str(as_of.date()), frames["master"], frames["fred"],
                            frames["makro"], frames["cross"], results)
    out.write(data_dir)

    report = {
        "as_of": out.as_of,
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "rows": int(len(frames["master"])),
        "n_nan_last_row": int(frames["master"].iloc[-1].isna().sum()),
        "sources": {k: r.as_dict() for k, r in results.items()},
    }
    (data_dir / "refresh_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    failed = [k for k, r in results.items() if not r.ok]
    _log(f"Selesai: as_of={out.as_of}, {len(frames['master'])} baris, "
         f"sumber gagal: {failed or 'tidak ada'}")

    return report


def main():
    ap = argparse.ArgumentParser(description="Refresh data input model klasifikasi BTC 7 hari")
    ap.add_argument("--data-dir", default=None)
    a = ap.parse_args()
    try:
        run_refresh(Path(a.data_dir) if a.data_dir else None)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
