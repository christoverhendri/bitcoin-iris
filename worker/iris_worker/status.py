"""
iris_worker.status
==================
Laporan run sukses ke public.data_source_status (meniru reportIngestSuccess di
src/lib/supabase/sourceStatusWriter.ts).

Hanya SUKSES yang ditulis. `defineFeature` memaksa panel ke MOCK begitu baris
sumbernya `degraded`/`failed`, jadi menulis kegagalan worker ke
`internal_forecast` akan menyembunyikan sinyal minggu lalu yang masih sah — panel
sudah menandai sinyal basi sendiri (transform.ts, > 9 hari). Kegagalan dicatat di
log job dan di data/clf/refresh_report.json.

Penulisan status adalah pembukuan: kalau Supabase belum dikonfigurasi atau
request-nya gagal, fungsi ini hanya mencetak peringatan.
"""
import sys
from datetime import datetime, timezone

import requests

from iris_worker import config


def report_success(source_key: str, n: int = 0) -> None:
    if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_ROLE_KEY:
        return
    k = config.SUPABASE_SERVICE_ROLE_KEY
    now = datetime.now(timezone.utc).isoformat()
    try:
        r = requests.patch(
            f"{config.SUPABASE_URL.rstrip('/')}/rest/v1/data_source_status",
            params={"source_key": f"eq.{source_key}"},
            headers={"apikey": k, "Authorization": f"Bearer {k}", "Content-Type": "application/json"},
            json={
                "mode": "live",
                "last_attempt_at": now,
                "last_success_at": now,
                "last_error": None,
                "last_row_count": n,
                "consecutive_failures": 0,
            },
            timeout=15,
        )
        if not r.ok:
            print(f"[status] gagal menulis {source_key}: {r.status_code} {r.text[:200]}",
                  file=sys.stderr)
    except requests.RequestException as e:
        print(f"[status] gagal menulis {source_key}: {e}", file=sys.stderr)
