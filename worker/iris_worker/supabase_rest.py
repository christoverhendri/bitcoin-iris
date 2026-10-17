"""
iris_worker.supabase_rest
=========================
Upsert ke PostgREST Supabase menggunakan library requests.
Bekerja dengan service role key melewati RLS.
"""
from typing import Any, Dict, List
import requests


class SupabaseRestError(Exception):
    pass


def upsert_clf_signal(
    supabase_url: str,
    service_role_key: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Melakukan upsert satu baris ke tabel public.clf_signals via PostgREST.
    on_conflict=as_of
    Prefer: resolution=merge-duplicates,return=representation
    """
    if not supabase_url:
        raise SupabaseRestError("SUPABASE_URL tidak boleh kosong untuk upsert database.")
    if not service_role_key:
        raise SupabaseRestError("SUPABASE_SERVICE_ROLE_KEY tidak boleh kosong untuk upsert database.")

    base_url = supabase_url.rstrip("/")
    endpoint = f"{base_url}/rest/v1/clf_signals?on_conflict=as_of"

    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation",
    }

    try:
        response = requests.post(endpoint, headers=headers, json=payload, timeout=15)
    except requests.RequestException as e:
        raise SupabaseRestError(f"Koneksi jaringan ke Supabase gagal: {e}") from e

    if not response.ok:
        raise SupabaseRestError(
            f"Gagal upsert ke clf_signals [{response.status_code}]: {response.text}"
        )

    try:
        data = response.json()
        if isinstance(data, list) and len(data) > 0:
            return data[0]
        return data
    except Exception:
        return payload


def upsert_rows(
    supabase_url: str,
    service_role_key: str,
    table: str,
    rows: List[Dict[str, Any]],
    on_conflict: str,
) -> int:
    """Upsert banyak baris ke `table` (idempoten pada `on_conflict`). Return jumlah baris."""
    if not supabase_url or not service_role_key:
        raise SupabaseRestError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum di-set.")
    if not rows:
        return 0
    endpoint = f"{supabase_url.rstrip('/')}/rest/v1/{table}?on_conflict={on_conflict}"
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    try:
        response = requests.post(endpoint, headers=headers, json=rows, timeout=30)
    except requests.RequestException as e:
        raise SupabaseRestError(f"Koneksi jaringan ke Supabase gagal: {e}") from e
    if not response.ok:
        raise SupabaseRestError(f"Gagal upsert ke {table} [{response.status_code}]: {response.text}")
    return len(rows)
