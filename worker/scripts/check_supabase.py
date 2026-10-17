"""
Cek setup Supabase setelah migration dijalankan. Tidak pernah mencetak nilai key.

    cd worker && .venv/Scripts/python scripts/check_supabase.py

Membaca SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY dan
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (atau ..._ANON_KEY) dari worker/.env dan ../.env.local.

Yang dicek:
1. Semua tabel ada dan bisa dibaca dengan key publik (yang dipakai dashboard).
2. Key publik TIDAK bisa menulis (RLS) - kalau bisa, siapa pun bisa mengubah data.
3. Key service bisa menulis (dipakai worker) - diuji dengan upsert baris status
   yang sudah ada ke nilainya sendiri, jadi tidak mengubah apa pun.
4. Seed data_source_status lengkap.
"""
import sys
from pathlib import Path

import requests
from dotenv import dotenv_values

HERE = Path(__file__).resolve().parent.parent
env = {**dotenv_values(HERE.parent / ".env.local"), **dotenv_values(HERE / ".env")}
URL = (env.get("SUPABASE_URL") or env.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
SERVICE = env.get("SUPABASE_SERVICE_ROLE_KEY") or ""
PUBLIC = env.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") or env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or ""
TABLES = ["data_source_status", "clf_signals", "social_sentiment_daily", "whale_events"]

ok_all = True


def report(ok: bool, msg: str) -> None:
    global ok_all
    ok_all &= ok
    print(f"  [{'OK' if ok else 'GAGAL'}] {msg}")


def headers(key: str, bearer: bool = True) -> dict:
    h = {"apikey": key, "Content-Type": "application/json"}
    if bearer:
        h["Authorization"] = f"Bearer {key}"
    return h


def kind(key: str) -> str:
    if not key:
        return "KOSONG"
    if key.startswith("sb_publishable_"):
        return "publishable (format baru)"
    if key.startswith("sb_secret_"):
        return "secret (format baru)"
    if key.startswith("eyJ"):
        return "JWT (format lama anon/service_role)"
    return "format tidak dikenal"


print("Konfigurasi:")
report(URL.startswith("https://") and ".supabase.co" in URL, f"URL project: {URL or 'KOSONG'}")
report(bool(PUBLIC), f"key publik: {kind(PUBLIC)}")
report(bool(SERVICE), f"key service: {kind(SERVICE)}")
if PUBLIC and PUBLIC == SERVICE:
    report(False, "key publik dan key service SAMA - key service tidak boleh dipakai di browser")
if not (URL and PUBLIC and SERVICE):
    sys.exit(1)

# Format key baru (sb_secret_/sb_publishable_) bukan JWT; dicoba juga tanpa header Bearer.
bearer_ok = {}


def get(table: str, key: str, params: dict):
    for bearer in (True, False):
        r = requests.get(f"{URL}/rest/v1/{table}", headers=headers(key, bearer), params=params, timeout=30)
        if r.status_code != 401:
            bearer_ok[key] = bearer
            return r
    return r


print("\nTabel (dibaca dengan key publik):")
for t in TABLES:
    r = get(t, PUBLIC, {"select": "*", "limit": 1})
    report(r.status_code == 200, f"{t}: HTTP {r.status_code}" + ("" if r.ok else f" {r.text[:160]}"))

print("\nKeamanan (RLS):")
probe = {"source_key": "rls_probe", "display_name": "x", "category": "x"}
r = requests.post(f"{URL}/rest/v1/data_source_status", headers=headers(PUBLIC, bearer_ok.get(PUBLIC, True)),
                  json=probe, timeout=30)
report(r.status_code in (401, 403), f"key publik DITOLAK saat menulis (HTTP {r.status_code})")
if r.ok:
    print("  !! key publik bisa menulis - jalankan ulang setup_all.sql (RLS belum aktif)")

print("\nKey service (dipakai worker):")
r = get("data_source_status", SERVICE, {"select": "source_key,display_name,category", "source_key": "eq.fred"})
row = r.json()[0] if r.ok and r.json() else None
report(row is not None, f"baca baris status 'fred': HTTP {r.status_code}")
if row:
    h = headers(SERVICE, bearer_ok.get(SERVICE, True))
    h["Prefer"] = "resolution=merge-duplicates,return=minimal"
    w = requests.post(f"{URL}/rest/v1/data_source_status?on_conflict=source_key", headers=h, json=row, timeout=30)
    report(w.ok, f"tulis (upsert tanpa perubahan): HTTP {w.status_code}" + ("" if w.ok else f" {w.text[:160]}"))
if bearer_ok.get(SERVICE) is False:
    print("  catatan: key service hanya diterima TANPA header Bearer (format sb_secret_).")

print("\nIsi:")
r = get("data_source_status", PUBLIC, {"select": "source_key"})
n = len(r.json()) if r.ok else 0
report(n >= 21, f"data_source_status: {n} sumber (seed harus >= 21)")
for t in ("clf_signals", "social_sentiment_daily", "whale_events"):
    r = get(t, PUBLIC, {"select": "*", "limit": 1000})
    print(f"  {t}: {len(r.json()) if r.ok else '?'} baris")

print("\nHASIL:", "SEMUA OK" if ok_all else "ADA YANG GAGAL (lihat di atas)")
sys.exit(0 if ok_all else 1)
