"""
iris_worker.jobs.clf_weekly
===========================
Job mingguan inferensi model klasifikasi BTC 7 hari (Average Ensemble).
Memeriksa kesegaran data, menghitung sinyal 3 keadaan, dan meng-upsert ke Supabase.

Penggunaan CLI:
    python -m iris_worker.jobs.clf_weekly [--dry-run] [--override-max-lag DAYS]
"""
import argparse
from datetime import date, datetime, timezone
import json
import os
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional, Tuple

from iris_clf import ClassifierSignal
from iris_clf.signal_rule import load_rule, decide
from iris_worker import config
from iris_worker.supabase_rest import upsert_clf_signal, SupabaseRestError


def check_freshness(
    as_of_str: str,
    n_nan_features: Dict[str, int],
    max_lag_days: int,
    max_nan: int,
    today_utc: Optional[date] = None,
) -> Tuple[bool, List[str]]:
    """
    Fungsi murni penjaga kesegaran:
    (a) today_utc - as_of > max_lag_days
    (b) sum(n_nan_features.values()) > max_nan

    Mengembalikan (is_fresh: bool, reasons: List[str]).
    """
    if today_utc is None:
        today_utc = datetime.now(timezone.utc).date()

    as_of = date.fromisoformat(as_of_str)
    lag_days = (today_utc - as_of).days
    total_nan = sum(n_nan_features.values())

    reasons = []
    if lag_days > max_lag_days:
        reasons.append(
            f"Data tertinggal {lag_days} hari (as_of={as_of_str}, today_utc={today_utc.isoformat()}), "
            f"melebihi batas CLF_MAX_DATA_LAG_DAYS={max_lag_days}"
        )
    if total_nan > max_nan:
        reasons.append(
            f"Ditemukan {total_nan} fitur bernilai NaN ({n_nan_features}), "
            f"melebihi batas CLF_MAX_NAN={max_nan}"
        )

    return (len(reasons) == 0, reasons)


def build_payload(
    sig: Dict[str, Any],
    rule: Dict[str, Any],
    meta: Dict[str, Any],
    signal: str,
) -> Dict[str, Any]:
    """
    Membangun payload snake_case lengkap untuk tabel public.clf_signals.
    """
    test_metrics = meta.get("test_metrics", {})
    test_f1 = test_metrics.get("f1_macro", 0.0)

    # Validasi signal sesuai constraint database
    if signal not in ("BULL", "BEAR", "NONE"):
        raise ValueError(f"Signal tidak valid: {signal}")

    return {
        "as_of": str(sig["as_of"]),
        "horizon_days": int(sig.get("horizon_days", 7)),
        "signal": signal,
        "p_up": float(sig["p_up"]),
        "t_bear": float(rule["t_bear"]),
        "t_bull": float(rule["t_bull"]),
        "threshold_binary": float(sig["threshold"]),
        "direction_binary": str(sig["direction"]),
        "margin": float(sig["margin"]),
        "gate_pass": sig.get("gate_pass", {}),
        "per_domain": sig.get("per_domain", {}),
        "n_nan_features": sig.get("n_nan_features", {}),
        "rule_method": str(rule.get("method", "dual_threshold_oof")),
        "model_name": str(meta.get("name", "btc_direction_7d_avg_ensemble")),
        "model_created_utc": str(meta.get("created_utc", "")),
        "model_train_end": str(meta.get("train_end", "")),
        "model_domains": list(meta.get("domains", {}).keys()),
        "val_f1_macro": float(meta.get("val_f1_macro", 0.0)),
        "test_f1_macro": float(test_f1),
        "is_synthetic": False,
    }


def run_clf_weekly(
    dry_run: bool = False,
    override_max_lag: Optional[int] = None,
    override_max_nan: Optional[int] = None,
    master_path: Optional[str] = None,
    category_dir: Optional[str] = None,
    model_dir: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Menjalankan alur lengkap clf_weekly:
    1. Muat model & aturan
    2. predict_latest
    3. Cek kesegaran (gagal keras jika tidak segar)
    4. Sinyal decide
    5. Build payload
    6. Upsert atau dry-run output
    """
    m_dir = Path(model_dir) if model_dir else config.CLF_MODEL_DIR
    d_dir = Path(master_path).parent if master_path else config.CLF_DATA_DIR

    # 1. Pastikan model dan signal_rule.json ada
    rule_file = m_dir / "signal_rule.json"
    if not rule_file.exists():
        raise FileNotFoundError(
            f"FATAL: signal_rule.json tidak ditemukan di {m_dir}. Gagal keras sesuai D3."
        )

    clf = ClassifierSignal.from_dir(str(m_dir))
    rule = load_rule(str(m_dir))

    # Tentukan path file data
    m_path = Path(master_path) if master_path else (d_dir / "btc_master_2.csv")
    c_dir = Path(category_dir) if category_dir else (d_dir / "kategori")

    if not m_path.exists():
        raise FileNotFoundError(f"File master data tidak ditemukan di {m_path}")
    if not c_dir.exists():
        raise FileNotFoundError(f"Folder data kategori tidak ditemukan di {c_dir}")

    # 2. Prediksi data terbaru
    sig = clf.predict_latest(str(m_path), str(c_dir))

    # 3. Penjaga kesegaran
    max_lag = override_max_lag if override_max_lag is not None else config.CLF_MAX_DATA_LAG_DAYS
    max_nan = override_max_nan if override_max_nan is not None else config.CLF_MAX_NAN

    is_fresh, reasons = check_freshness(
        sig["as_of"],
        sig["n_nan_features"],
        max_lag_days=max_lag,
        max_nan=max_nan,
    )

    if not is_fresh:
        msg = (
            "PENJAGA KESEGARAN MENOLAK DATA:\n"
            + "\n".join(f" - {r}" for r in reasons)
            + "\nModel tidak pernah melihat NaN saat training dan data basi menghasilkan sinyal yang menyesatkan."
            + "\nDatabase tidak disentuh."
        )
        print(msg, file=sys.stderr)
        sys.exit(2)

    # 4. Keputusan 3 keadaan
    signal = decide(sig["p_up"], rule)

    # 5. Payload
    payload = build_payload(sig, rule, clf.meta, signal)

    if dry_run:
        print(json.dumps(payload, indent=2))
        return payload

    # 6. Mode normal: Upsert ke Supabase
    if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_ROLE_KEY:
        raise SupabaseRestError(
            "SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum terkonfigurasi di environment."
        )

    res = upsert_clf_signal(
        config.SUPABASE_URL,
        config.SUPABASE_SERVICE_ROLE_KEY,
        payload,
    )
    print(f"Berhasil upsert clf_signals untuk as_of={payload['as_of']} (signal={payload['signal']})")
    return res


def main():
    parser = argparse.ArgumentParser(description="BTC 7-Day Classification Weekly Ingestion Job")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Cetak payload JSON saja ke stdout tanpa menyentuh database atau jaringan.",
    )
    parser.add_argument(
        "--override-max-lag",
        type=int,
        default=None,
        help="Pengecualian toleransi lag hari HANYA untuk pengujian/dry-run lokal.",
    )
    parser.add_argument(
        "--override-max-nan",
        type=int,
        default=None,
        help="Pengecualian toleransi jumlah NaN HANYA untuk pengujian/dry-run lokal.",
    )
    parser.add_argument("--model-dir", default=None, help="Lokasi folder model clf_7d")
    parser.add_argument("--master", default=None, help="Lokasi btc_master_2.csv")
    parser.add_argument("--category-dir", default=None, help="Lokasi folder data kategori")
    args = parser.parse_args()

    try:
        run_clf_weekly(
            dry_run=args.dry_run,
            override_max_lag=args.override_max_lag,
            override_max_nan=args.override_max_nan,
            master_path=args.master,
            category_dir=args.category_dir,
            model_dir=args.model_dir,
        )
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
