"""
iris_worker.data.state
======================
Seri yang TIDAK bisa diambil ulang lengkap dari API gratis, jadi riwayatnya
disimpan sendiri dan ditambah setiap run:

- usdt_dominance: CoinGecko hanya memberi snapshot saat ini.
- google_trends_bitcoin: Google Trends menormalkan 0-100 per jendela waktu,
  jadi nilai baru harus di-rescale ke seri tersimpan lewat periode overlap.

Riwayat awal diambil dari CSV training (data/seed/btc_master_2.csv) sehingga
skala tetap sama dengan yang dilihat model saat training.
"""
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

SEED_COLUMNS = ("usdt_dominance", "google_trends_bitcoin")


def _path(state_dir: Path, col: str) -> Path:
    return Path(state_dir) / f"{col}.csv"


def load(state_dir: Path, col: str, seed_master: Path) -> pd.Series:
    """Baca seri state; kalau belum ada, buat dari CSV seed (hanya hari dengan nilai berubah,
    supaya ekor ffill di seed tidak dianggap observasi)."""
    p = _path(state_dir, col)
    if p.exists():
        s = pd.read_csv(p, index_col=0, parse_dates=True).iloc[:, 0].astype(float)
        return s.sort_index()
    seed = pd.read_csv(seed_master, index_col=0, parse_dates=True)[col].astype(float)
    # Buang ekor yang hanya hasil ffill: potong setelah perubahan nilai terakhir.
    changed = seed.ne(seed.shift())
    last_real = seed.index[changed][-1]
    s = seed.loc[:last_real]
    save(state_dir, col, s)
    return s


def save(state_dir: Path, col: str, s: pd.Series) -> None:
    Path(state_dir).mkdir(parents=True, exist_ok=True)
    s.sort_index().rename(col).to_frame().to_csv(_path(state_dir, col), index_label="date")


def append_snapshot(stored: pd.Series, date: pd.Timestamp, value: float) -> pd.Series:
    """Upsert satu nilai pada tanggal tertentu (idempoten untuk run ulang di hari yang sama)."""
    out = stored.copy()
    out.loc[pd.Timestamp(date).normalize()] = float(value)
    return out.sort_index()


def rescale_trends(
    stored: pd.Series,
    raw: pd.Series,
    min_overlap: int = 14,
    exclude_recent: int = 3,
) -> pd.Series:
    """
    Sambungkan jendela Google Trends baru (`raw`, skala 0-100) ke seri tersimpan.

    Skala = median(stored / raw) pada tanggal overlap (raw > 0). Hari-hari terakhir
    seri tersimpan dibuang dari overlap karena bisa jadi masih estimasi. Hanya tanggal
    SETELAH tanggal terakhir tersimpan yang ditambahkan — riwayat tidak ditulis ulang.
    """
    raw = raw[raw > 0]
    ref = stored.iloc[:-exclude_recent] if len(stored) > exclude_recent else stored
    common = ref.index.intersection(raw.index)
    if len(common) < min_overlap:
        raise ValueError(
            f"google trends: overlap hanya {len(common)} hari (< {min_overlap}); "
            "seri tersimpan terlalu tertinggal untuk di-rescale dengan aman"
        )
    scale = float(np.median(ref.loc[common] / raw.loc[common]))
    new = raw[raw.index > stored.index.max()] * scale
    return pd.concat([stored, new]).sort_index()


def last_observation(s: Optional[pd.Series]) -> Optional[str]:
    if s is None or s.dropna().empty:
        return None
    return str(s.dropna().index.max().date())
