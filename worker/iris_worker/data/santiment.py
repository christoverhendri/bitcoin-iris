"""
iris_worker.data.santiment
==========================
Proporsi sentimen sosial BTC dari Santiment (GraphQL API, butuh SANTIMENT_API_KEY).

Metrik: sentiment_{positive,neutral,negative}_ratio_total_1d
  Definisi Santiment (academy.santiment.net/metrics/sentiment-ratio): jumlah
  dokumen berlabel positif / netral / negatif dibagi jumlah ketiganya, dihitung per
  hari. Sumber "total" = Twitter, Reddit, Telegram, 4chan. Ketiganya berjumlah 1.

Batas akun gratis (diukur 2026-10-16 lewat metadata `restrictedTo`): 30 hari
terakhir tidak tersedia, jadi baris terbaru selalu ~30 hari di belakang hari ini.
Kuota: 1000 request/bulan; satu fetch = satu request (tiga metrik di-alias dalam
satu query).
"""
from typing import Any, Dict, List, Tuple

from iris_worker.data import http

URL = "https://api.santiment.net/graphql"
SLUG = "bitcoin"
BUCKETS = ("positive", "neutral", "negative")
METRICS = {b: f"sentiment_{b}_ratio_total_1d" for b in BUCKETS}
SOURCES = ["twitter", "reddit", "telegram", "4chan"]
# Toleransi pembulatan untuk positif + netral + negatif = 1.
SUM_TOLERANCE = 0.01


def build_query(days: int) -> str:
    parts = [
        f'{b}: getMetric(metric: "{m}") {{ '
        f'metadata {{ restrictedTo }} '
        f'timeseriesData(slug: "{SLUG}", from: "utc_now-{days}d", to: "utc_now", interval: "1d") '
        f'{{ datetime value }} }}'
        for b, m in METRICS.items()
    ]
    return "{ " + " ".join(parts) + " }"


def fetch_raw(api_key: str, days: int = 60) -> Dict[str, Any]:
    if not api_key:
        raise RuntimeError("SANTIMENT_API_KEY belum di-set")
    r = http.session().post(
        URL,
        json={"query": build_query(days)},
        headers={"Authorization": f"Apikey {api_key}", "Content-Type": "application/json"},
        timeout=60,
    )
    if r.status_code != 200:
        raise RuntimeError(f"Santiment HTTP {r.status_code}: {r.text[:300]}")
    j = r.json()
    if j.get("errors"):
        raise RuntimeError(f"Santiment error: {str(j['errors'])[:300]}")
    return j["data"]


def to_rows(data: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[str], str]:
    """
    Gabungkan tiga seri per tanggal. Hanya tanggal yang punya ketiga nilai dan
    jumlahnya ≈ 1 yang dipakai; sisanya dikembalikan sebagai `rejected` supaya
    tidak ada yang dibuang diam-diam.

    Return (rows ascending, rejected_dates, restricted_to).
    """
    by_date: Dict[str, Dict[str, float]] = {}
    restricted_to = ""
    for b in BUCKETS:
        node = data.get(b) or {}
        restricted_to = restricted_to or ((node.get("metadata") or {}).get("restrictedTo") or "")
        for p in node.get("timeseriesData") or []:
            if p.get("value") is None:
                continue
            by_date.setdefault(p["datetime"][:10], {})[b] = float(p["value"])

    rows, rejected = [], []
    for d in sorted(by_date):
        v = by_date[d]
        if len(v) != len(BUCKETS) or abs(sum(v.values()) - 1) > SUM_TOLERANCE:
            rejected.append(d)
            continue
        rows.append({"date": d, **{b: v[b] for b in BUCKETS}})
    return rows, rejected, restricted_to
