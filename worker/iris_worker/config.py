"""
iris_worker.config
==================
Konfigurasi 12-factor worker klasifikasi mingguan.
Semua nilai dibaca dari environment variable dengan fallback yang aman.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Muat file .env di folder worker atau root IRIS-Terminal jika ada
_worker_dir = Path(__file__).resolve().parent.parent
load_dotenv(_worker_dir / ".env")
load_dotenv(_worker_dir.parent / ".env.local")


def get_str(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def get_int(name: str, default: int) -> int:
    val = os.environ.get(name)
    if val is None or not val.strip():
        return default
    try:
        return int(val.strip())
    except ValueError:
        return default


# Supabase
SUPABASE_URL = get_str("SUPABASE_URL") or get_str("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = get_str("SUPABASE_SERVICE_ROLE_KEY")

# Data & Model paths
def resolve_dir(env_name: str, default_rel: str) -> Path:
    val = get_str(env_name)
    if val:
        p = Path(val)
        if p.is_absolute():
            return p
        # Check relative to cwd, then relative to worker_dir
        if p.exists():
            return p.resolve()
        if (_worker_dir / p).exists():
            return (_worker_dir / p).resolve()
        return p.resolve()
    # Default search
    for cand in [_worker_dir / default_rel, _worker_dir.parent / default_rel, Path(default_rel)]:
        if cand.exists():
            return cand.resolve()
    return (_worker_dir / default_rel).resolve()


CLF_DATA_DIR = resolve_dir("CLF_DATA_DIR", "data/clf")
CLF_MODEL_DIR = resolve_dir("CLF_MODEL_DIR", "models/clf_7d")
# CSV training asli (read-only): template kolom + riwayat awal seri ber-state.
CLF_SEED_DIR = resolve_dir("CLF_SEED_DIR", "data/seed")
# Riwayat seri yang tidak bisa diambil ulang dari API (usdt_dominance, google trends).
CLF_STATE_DIR = resolve_dir("CLF_STATE_DIR", "data/state")
# Salinan sinyal terakhir untuk dashboard lokal tanpa Supabase (CLF_LOCAL_SIGNAL_FILE di Next).
CLF_SIGNAL_OUT = resolve_dir("CLF_SIGNAL_OUT", "out/clf_signal_latest.json")

# API keys input model
FRED_API_KEY = get_str("FRED_API_KEY")
COINGECKO_API_KEY = get_str("COINGECKO_API_KEY")

# Sentimen sosial (Santiment). Kosong = job social_sentiment tidak dijadwalkan.
SANTIMENT_API_KEY = get_str("SANTIMENT_API_KEY")
SOCIAL_SENTIMENT_OUT = resolve_dir("SOCIAL_SENTIMENT_OUT", "out/social_sentiment.json")
# Baris yang disimpan per run (riwayat untuk grafik 30 hari).
SOCIAL_SENTIMENT_DAYS = get_int("SOCIAL_SENTIMENT_DAYS", 30)

# Freshness thresholds
CLF_MAX_DATA_LAG_DAYS = get_int("CLF_MAX_DATA_LAG_DAYS", 3)
CLF_MAX_NAN = get_int("CLF_MAX_NAN", 0)

# Jadwal (cron 5-field, UTC)
# refresh data: setiap hari 00:15 UTC (07:15 WIB), setelah candle harian UTC tutup.
REFRESH_CRON = get_str("REFRESH_CRON", "15 0 * * *")
# klasifikasi mingguan: Senin 00:30 UTC (07:30 WIB) — candle Minggu sudah tutup.
CLF_CRON = get_str("CLF_CRON", "30 0 * * 1")
# sentimen sosial Santiment: setiap hari 00:20 UTC (07:20 WIB).
SOCIAL_CRON = get_str("SOCIAL_CRON", "20 0 * * *")
# whale ingest: panggil route Next /api/ingest/whale (butuh IRIS_APP_URL + CRON_SECRET).
WHALE_CRON = get_str("WHALE_CRON", "*/5 * * * *")
WATCHER_CRON = get_str("WATCHER_CRON", "* * * * *")
# Monday 00:20 UTC: Sunday's daily close is final (same as .github/workflows/monthly-forecast.yml).
MONTHLY_CRON = get_str("MONTHLY_CRON", "20 0 * * 1")
IRIS_APP_URL = get_str("IRIS_APP_URL")
CRON_SECRET = get_str("CRON_SECRET")
