"""
Unit test pipeline data & scheduler (tanpa jaringan):
- parse_cron: hari cron standar (1 = Senin) tidak bergeser di APScheduler
- last_closed_day / week_start_sunday: tidak ada candle hari berjalan
- build.assemble: candle hari ini dibuang, ffill, fomc_rate_changed, urutan kolom
- state.rescale_trends: skala dari overlap, riwayat tidak ditulis ulang
- clf_weekly.write_local: idempoten per as_of
"""
import json
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import pytest

from iris_worker.data import build, state
from iris_worker.jobs.clf_weekly import write_local
from iris_worker.scheduler import parse_cron, week_start_sunday


def _next_fire(cron, after):
    return parse_cron(cron).get_next_fire_time(None, after)


def test_cron_monday_is_monday():
    after = datetime(2026, 10, 14, 12, 0, tzinfo=timezone.utc)  # Rabu
    nxt = _next_fire("30 0 * * 1", after)
    assert nxt.strftime("%A %H:%M") == "Monday 00:30"


def test_cron_sunday_zero_and_seven():
    after = datetime(2026, 10, 14, 12, 0, tzinfo=timezone.utc)
    assert _next_fire("0 1 * * 0", after).strftime("%A") == "Sunday"
    assert _next_fire("0 1 * * 7", after).strftime("%A") == "Sunday"
    assert _next_fire("0 1 * * 1-5", after).strftime("%A") == "Thursday"


def test_cron_daily_and_every_5_min():
    after = datetime(2026, 10, 14, 0, 16, tzinfo=timezone.utc)
    assert _next_fire("15 0 * * *", after) == datetime(2026, 10, 15, 0, 15, tzinfo=timezone.utc)
    assert _next_fire("*/5 * * * *", after).minute == 20


def test_last_closed_day_excludes_today():
    now = pd.Timestamp("2026-10-16 00:05", tz="UTC")
    assert build.last_closed_day(now) == pd.Timestamp("2026-10-15")


def test_week_start_sunday():
    # Senin 2026-10-19 00:30 UTC -> candle Minggu 2026-10-18
    assert week_start_sunday(pd.Timestamp("2026-10-19 00:30", tz="UTC")) == pd.Timestamp("2026-10-18")
    # Rabu -> Minggu sebelumnya
    assert week_start_sunday(pd.Timestamp("2026-10-21 10:00", tz="UTC")) == pd.Timestamp("2026-10-18")


def _ohlcv(start, end):
    idx = pd.date_range(start, end, freq="D")
    c = pd.Series(np.linspace(100, 200, len(idx)), index=idx)
    return pd.DataFrame({"open": c, "high": c * 1.01, "low": c * 0.99, "close": c, "volume": 1.0})


def test_assemble_drops_today_and_ffills():
    btc = _ohlcv("2017-06-01", "2026-10-16")  # memuat candle "hari ini" (16 Okt)
    as_of = pd.Timestamp("2026-10-15")
    template = ["btc_close", "btc_high", "btc_low", "btc_open", "btc_volume", "ema_5",
                "days_since_last_halving", "next_halving_is_projected", "fomc_rate_upper",
                "fomc_rate_changed", "sp500_close", "eth_volume_usd", "eth_price_is_backfilled",
                "dxy", "gold_price", "m2_money_supply", "usdt_dominance",
                "cpi_headline", "core_pce", "ppi", "nonfarm_payrolls", "unemployment_rate",
                "avg_hourly_earnings", "retail_sales", "gdp_nominal", "fomc_rate_lower",
                "sp500_volume", "dowjones_close", "dowjones_volume", "oil_close", "oil_volume",
                "eth_close"]
    raw_cols = [c for c in template if c not in ("btc_close", "btc_high", "btc_low", "btc_open",
                                                   "btc_volume", "ema_5", "days_since_last_halving",
                                                   "next_halving_is_projected", "fomc_rate_changed",
                                                   "eth_volume_usd", "eth_price_is_backfilled")]
    # Seri mingguan dengan nilai "masa depan" (16 Okt) yang tidak boleh bocor.
    widx = pd.date_range("2017-01-01", "2026-10-16", freq="7D").union([pd.Timestamp("2026-10-16")])
    raw = pd.DataFrame({c: np.arange(len(widx), dtype=float) for c in raw_cols}, index=widx)
    raw.loc[pd.Timestamp("2026-10-16"), :] = 9999.0
    up = pd.Series(1.5, index=widx)
    up[widx >= "2026-09-01"] = 1.75
    raw["fomc_rate_upper"] = up

    f = build.assemble(btc, {"x": raw}, template, as_of)
    m = f["master"]
    assert list(m.columns) == template
    assert m.index[-1] == as_of
    assert (m.iloc[-1] != 9999.0).all()
    assert m["sp500_close"].isna().sum() == 0
    assert m["fomc_rate_changed"].sum() == 1
    changed_on = m.index[m["fomc_rate_changed"]][0]
    assert pd.Timestamp("2026-09-01") <= changed_on < pd.Timestamp("2026-09-08")
    assert m["btc_close"].iloc[-1] == btc.loc[as_of, "close"]
    assert m["eth_volume_usd"].eq(0).all()


def test_halving_features_match_training_convention():
    hv = build.halving_features(pd.DatetimeIndex(["2018-02-01", "2024-04-20", "2026-08-11"]))
    assert hv.loc["2018-02-01", "days_since_last_halving"] == 572
    assert hv.loc["2018-02-01", "days_until_next_halving"] == 830
    assert hv.loc["2024-04-20", "days_since_last_halving"] == 0
    assert bool(hv.loc["2024-04-20", "next_halving_is_projected"]) is True
    assert hv.loc["2026-08-11", "days_until_next_halving"] == 615


def test_rescale_trends_uses_overlap_and_keeps_history():
    idx = pd.date_range("2026-07-01", "2026-08-20", freq="D")
    stored = pd.Series(np.arange(1, len(idx) + 1, dtype=float) * 10.0, index=idx)
    raw_idx = pd.date_range("2026-07-15", "2026-09-10", freq="D")
    raw = pd.Series(np.arange(1, len(raw_idx) + 1, dtype=float), index=raw_idx)
    # stored = 10 * (14 + raw) pada overlap -> rasio tidak konstan, tapi median deterministik
    out = state.rescale_trends(stored, raw)
    pd.testing.assert_series_equal(out.loc[:"2026-08-20"], stored, check_names=False)
    assert out.index.max() == pd.Timestamp("2026-09-10")
    assert (out.loc["2026-08-21":] > 0).all()


def test_rescale_trends_refuses_without_overlap():
    stored = pd.Series(1.0, index=pd.date_range("2026-01-01", "2026-02-01"))
    raw = pd.Series(50.0, index=pd.date_range("2026-06-01", "2026-09-01"))
    with pytest.raises(ValueError):
        state.rescale_trends(stored, raw)


def test_write_local_idempotent(tmp_path):
    out = tmp_path / "out" / "clf_signal_latest.json"
    write_local({"as_of": "2026-10-11", "signal": "NONE"}, out)
    write_local({"as_of": "2026-10-18", "signal": "BULL"}, out)
    write_local({"as_of": "2026-10-18", "signal": "BEAR"}, out)  # run ulang hari yang sama
    hist = (out.parent / "clf_signals_history.jsonl").read_text().splitlines()
    assert [json.loads(h)["as_of"] for h in hist] == ["2026-10-11", "2026-10-18"]
    assert json.loads(hist[-1])["signal"] == "BEAR"
    assert json.loads(out.read_text())["signal"] == "BEAR"
