"""
Unit test sentimen sosial Santiment (tanpa jaringan):
- to_rows: gabung per tanggal, tolak hari yang tidak lengkap / tidak berjumlah 1
- build_query: satu request untuk tiga metrik _1d
- build_payload: hanya `keep` hari terakhir, gagal keras kalau kosong
- social_fetched_today: dasar catch-up scheduler
"""
import json
from datetime import datetime, timezone

import pandas as pd
import pytest

from iris_worker import config
from iris_worker.data import santiment
from iris_worker.jobs.social_sentiment import build_payload
from iris_worker.scheduler import social_fetched_today


def _series(values):
    return [{"datetime": f"{d}T00:00:00Z", "value": v} for d, v in values]


def _data(pos, neu, neg, restricted="2026-09-16T00:00:00Z"):
    return {
        "positive": {"metadata": {"restrictedTo": restricted}, "timeseriesData": _series(pos)},
        "neutral": {"metadata": {"restrictedTo": restricted}, "timeseriesData": _series(neu)},
        "negative": {"metadata": {"restrictedTo": restricted}, "timeseriesData": _series(neg)},
    }


def test_query_asks_for_the_three_daily_ratio_metrics_in_one_request():
    q = santiment.build_query(70)
    for m in ("sentiment_positive_ratio_total_1d", "sentiment_neutral_ratio_total_1d",
              "sentiment_negative_ratio_total_1d"):
        assert q.count(f'"{m}"') == 1
    assert 'slug: "bitcoin"' in q and "utc_now-70d" in q and 'interval: "1d"' in q


def test_to_rows_joins_by_date_and_keeps_order():
    d = _data(
        pos=[("2026-09-15", 0.5), ("2026-09-16", 0.4)],
        neu=[("2026-09-15", 0.2), ("2026-09-16", 0.2)],
        neg=[("2026-09-15", 0.3), ("2026-09-16", 0.4)],
    )
    rows, rejected, restricted = santiment.to_rows(d)
    assert [r["date"] for r in rows] == ["2026-09-15", "2026-09-16"]
    assert rows[1] == {"date": "2026-09-16", "positive": 0.4, "neutral": 0.2, "negative": 0.4}
    assert rejected == [] and restricted == "2026-09-16T00:00:00Z"


def test_to_rows_rejects_incomplete_and_non_unit_days():
    d = _data(
        pos=[("2026-09-14", 0.5), ("2026-09-15", 0.5), ("2026-09-16", 0.5)],
        neu=[("2026-09-14", 0.2), ("2026-09-15", 0.2)],             # 16 Sep tanpa netral
        neg=[("2026-09-14", 0.3), ("2026-09-15", 0.5), ("2026-09-16", 0.5)],  # 15 Sep jumlah 1.2
    )
    rows, rejected, _ = santiment.to_rows(d)
    assert [r["date"] for r in rows] == ["2026-09-14"]
    assert rejected == ["2026-09-15", "2026-09-16"]


def test_to_rows_skips_null_values():
    d = _data(pos=[("2026-09-16", None)], neu=[("2026-09-16", 0.2)], neg=[("2026-09-16", 0.3)])
    rows, rejected, _ = santiment.to_rows(d)
    assert rows == [] and rejected == ["2026-09-16"]


def test_build_payload_keeps_last_n_and_records_restriction():
    rows = [{"date": f"2026-09-{d:02d}", "positive": 0.5, "neutral": 0.2, "negative": 0.3}
            for d in range(1, 17)]
    p = build_payload(rows, [], "2026-09-16T00:00:00Z", keep=5,
                      now=datetime(2026, 10, 16, tzinfo=timezone.utc))
    assert [r["date"] for r in p["rows"]] == [f"2026-09-{d}" for d in range(12, 17)]
    assert p["restricted_to"] == "2026-09-16T00:00:00Z"
    assert p["sources"] == ["twitter", "reddit", "telegram", "4chan"]


def test_build_payload_fails_loudly_when_empty():
    with pytest.raises(RuntimeError):
        build_payload([], ["2026-09-16"], "", keep=30)


def test_social_fetched_today(tmp_path, monkeypatch):
    out = tmp_path / "social_sentiment.json"
    monkeypatch.setattr(config, "SOCIAL_SENTIMENT_OUT", out)
    now = pd.Timestamp("2026-10-16 08:00", tz="UTC")
    assert social_fetched_today(now) is False  # belum ada file
    out.write_text(json.dumps({"fetched_utc": "2026-10-15T23:59:00+00:00"}))
    assert social_fetched_today(now) is False  # kemarin
    out.write_text(json.dumps({"fetched_utc": "2026-10-16T00:20:00+00:00"}))
    assert social_fetched_today(now) is True
