"""
iris_worker.data.http
=====================
Satu sesi HTTP untuk semua fetcher: User-Agent browser-ish, timeout keras, dan
retry dengan backoff. Retry penting di sini — blockchain.com dan beberapa host
lain sering memutus koneksi (ConnectionResetError) di tengah jalan; satu kali
ulang biasanya cukup.
"""
import time
from typing import Any, Dict, Optional

import requests

UA = "Mozilla/5.0 (compatible; IRIS-Terminal-Worker/1.0)"
DEFAULT_TIMEOUT = 30

_session: Optional[requests.Session] = None


def session() -> requests.Session:
    global _session
    if _session is None:
        s = requests.Session()
        s.headers.update({"User-Agent": UA, "Accept": "*/*"})
        _session = s
    return _session


def get(
    url: str,
    params: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
    timeout: int = DEFAULT_TIMEOUT,
    attempts: int = 4,
    backoff: float = 2.0,
) -> requests.Response:
    """GET dengan retry untuk error jaringan, 429, dan 5xx. Error 4xx lain langsung dilempar."""
    last_err: Optional[Exception] = None
    for i in range(attempts):
        try:
            r = session().get(url, params=params, headers=headers, timeout=timeout)
            if r.status_code == 429 or r.status_code >= 500:
                last_err = requests.HTTPError(f"{r.status_code} {r.reason} for {url}")
            else:
                r.raise_for_status()
                return r
        except (requests.ConnectionError, requests.Timeout) as e:
            last_err = e
        if i < attempts - 1:
            time.sleep(backoff * (2**i))
    raise RuntimeError(f"GET {url} gagal setelah {attempts} percobaan: {last_err}")


def get_json(url: str, **kw) -> Any:
    return get(url, **kw).json()
