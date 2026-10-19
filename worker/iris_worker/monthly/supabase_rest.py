"""Minimal Supabase (PostgREST) client over ``requests``.

The full ``supabase`` Python SDK pulls in a large dependency tree for the three
calls this worker makes. Service-role key only — it bypasses RLS, so it must
live in GitHub Actions secrets and never in the web app.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

import requests


class Supabase:
    def __init__(self, url: str, key: str):
        self.base = url.rstrip("/") + "/rest/v1"
        self.s = requests.Session()
        self.s.headers.update({
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        })

    @classmethod
    def from_env(cls) -> "Supabase | None":
        url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        return cls(url, key) if url and key else None

    def _check(self, resp: requests.Response) -> requests.Response:
        if resp.status_code >= 400:
            raise RuntimeError(f"supabase {resp.request.method} {resp.url} -> {resp.status_code}: {resp.text[:400]}")
        return resp

    def select(self, table: str, params: dict) -> list[dict]:
        return self._check(self.s.get(f"{self.base}/{table}", params=params, timeout=30)).json()

    def upsert(self, table: str, rows: list[dict] | dict, on_conflict: str) -> None:
        self._check(self.s.post(
            f"{self.base}/{table}",
            params={"on_conflict": on_conflict},
            json=rows,
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            timeout=60,
        ))

    def patch(self, table: str, match: dict, values: dict) -> None:
        params = {k: f"eq.{v}" for k, v in match.items()}
        self._check(self.s.patch(f"{self.base}/{table}", params=params, json=values,
                                 headers={"Prefer": "return=minimal"}, timeout=30))

    # -- data_source_status, same contract as src/lib/supabase/sourceStatusWriter.ts
    def report_status(self, source: str, ok: bool, rows: int = 0, error: str | None = None) -> None:
        now = datetime.now(timezone.utc).isoformat()
        prev = self.select("data_source_status",
                           {"source_key": f"eq.{source}", "select": "consecutive_failures"})
        fails = int(prev[0]["consecutive_failures"]) if prev else 0
        values = {"last_attempt_at": now}
        if ok:
            values.update(mode="live", last_success_at=now, last_error=None,
                          last_row_count=rows, consecutive_failures=0)
        else:
            values.update(mode="failed" if fails + 1 >= 3 else "degraded",
                          last_error=(error or "unknown")[:500], consecutive_failures=fails + 1)
        if prev:
            self.patch("data_source_status", {"source_key": source}, values)
        # No row means migration 0003 was not applied; nothing to report into.
