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

# Freshness thresholds
CLF_MAX_DATA_LAG_DAYS = get_int("CLF_MAX_DATA_LAG_DAYS", 3)
CLF_MAX_NAN = get_int("CLF_MAX_NAN", 0)

# Scheduler cron schedule
CLF_CRON = get_str("CLF_CRON", "30 0 * * 1")
