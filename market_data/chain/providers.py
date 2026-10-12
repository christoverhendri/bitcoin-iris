"""Read-only, budgeted sources: public Blockstream pilot or loopback Bitcoin Core.

All HTTP attempts including retries share a request/byte/deadline budget.
Only public raw blocks are fetched at scale per bounded invocation; missing
prevout evidence is allowed but never silently converted into a zero fee.
"""
from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlsplit

import requests

from .wire import MAX_BYTES, MAX_MONEY, Output, hexhash, parse_transaction

PUBLIC = 'https://blockstream.info/api'
RPC_METHODS = {'getblockhash', 'getblockcount', 'getblock', 'getblockstats'}


class BudgetExceeded(RuntimeError):
    pass


@dataclass(frozen=True)
class Coin:
    value: int
    script: bytes
    height: int | None
    timestamp: int | None
    coinbase: bool
    evidence: str


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='microseconds')


def integer(value, name, low=0, high=MAX_MONEY) -> int:
    if type(value) is not int or not low <= value <= high:
        raise ValueError(f'Invalid integer {name}')
    return value


def btc_to_sat(value) -> int:
    if isinstance(value, (float, bool)):
        raise ValueError('Binary float is not accepted for Bitcoin amounts')
    amount = Decimal(str(value)) * 100_000_000
    if not amount.is_finite() or amount != amount.to_integral_value():
        raise ValueError('Invalid BTC decimal precision')
    return integer(int(amount), 'satoshis')


class Transport:
    def __init__(self, *, max_requests=100, max_bytes=64*1024*1024,
                 deadline=600, pace=1.0, request=None, sleep=time.sleep):
        if (type(max_requests) is not int or not 1 <= max_requests <= 1000
            or not 1 <= max_bytes <= 512*1024*1024 or not 1 <= deadline <= 1800
            or not 1 <= pace <= 60):
            raise ValueError('Invalid network budget')
        self.session = requests.Session()
        self.session.trust_env = False  # No proxy/implicit .netrc credentials.
        self.request = request or self.session.request
        self.sleep = sleep
        self.max_requests, self.max_bytes = max_requests, max_bytes
        self.expires, self.pace = time.monotonic() + deadline, pace
        self.requests = self.bytes = 0
        self.last = None
        self.evidence: list[dict] = []

    def close(self):
        self.session.close()

    def read(self, method, url, *, json_body=None, auth=None, cap=MAX_BYTES, binary=False):
        for attempt in range(3):
            if self.requests >= self.max_requests or time.monotonic() >= self.expires:
                raise BudgetExceeded('Source request/deadline budget exhausted')
            if self.last is not None:
                self.sleep(max(0, self.pace - (time.monotonic() - self.last)))
            if time.monotonic() >= self.expires:
                raise BudgetExceeded('Source deadline exhausted')
            self.requests += 1
            self.last = time.monotonic()
            try:
                with self.request(method, url, json=json_body, auth=auth,
                                  headers={'User-Agent': 'IRIS-Block-Research/1.0', 'Accept': '*/*'},
                                  timeout=(5, 20), stream=True, allow_redirects=False) as response:
                    code = response.status_code
                    if code in (429, 500, 502, 503, 504) and attempt < 2:
                        retry = response.headers.get('Retry-After', '0')
                        try:
                            delay = float(retry)
                        except (TypeError, ValueError):
                            try:
                                delay = (parsedate_to_datetime(retry) - datetime.now(timezone.utc)).total_seconds()
                            except (TypeError, ValueError):
                                delay = 0
                        if delay > 60:
                            raise BudgetExceeded('Provider cooldown exceeds this pilot budget')
                        self.sleep(max(2**attempt, delay, 0))
                        continue
                    if code != 200:
                        raise RuntimeError(f'Read-only source HTTP {code}; no bypass or paid fallback')
                    kind = response.headers.get('Content-Type', '').lower()
                    allowed = ('application/octet-stream',) if binary else ('application/json', 'text/plain')
                    if not any(k in kind for k in allowed):
                        raise ValueError('Unexpected source content type')
                    chunks, n = [], 0
                    for chunk in response.iter_content(65536):
                        if not isinstance(chunk, bytes):
                            raise ValueError('Non-byte HTTP chunk')
                        n += len(chunk)
                        self.bytes += len(chunk)
                        if n > cap or self.bytes > self.max_bytes or time.monotonic() >= self.expires:
                            raise BudgetExceeded('Source response/byte/deadline budget exhausted')
                        chunks.append(chunk)
                    raw = b''.join(chunks)
            except requests.RequestException:
                if attempt == 2:
                    raise RuntimeError('Source network request failed; credentials suppressed') from None
                self.sleep(2**attempt)
                continue
            self.evidence.append({'request': urlsplit(url).path,
                                  'rpc_method': json_body.get('method') if json_body else None,
                                  'sha256': hashlib.sha256(raw).hexdigest(),
                                  'bytes': len(raw), 'observed_at': utc_now()})
            return raw
        raise RuntimeError('Source retry budget exhausted')


def decode_json(raw):
    return json.loads(raw, parse_float=Decimal,
                      parse_constant=lambda x: (_ for _ in ()).throw(ValueError('Nonfinite source JSON')))


class Esplora:
    name = 'blockstream-esplora-mainnet'

    def __init__(self, transport: Transport, max_prevout_txs=20):
        self.http = transport
        self.max_prevout_txs = integer(max_prevout_txs, 'prevout request budget', high=100)
        self.cache, self.proofs = {}, {}
        self.prevout_errors = 0

    def tip(self):
        return integer(int(self.http.read('GET', PUBLIC + '/blocks/tip/height', cap=32)), 'tip', high=100_000_000)

    def block_hash(self, height):
        integer(height, 'height', high=100_000_000)
        return hexhash(self.http.read('GET', PUBLIC + f'/block-height/{height}', cap=64).decode('ascii').strip())

    def raw_block(self, block_hash):
        return self.http.read('GET', PUBLIC + f'/block/{hexhash(block_hash)}/raw', binary=True)

    def prepare(self, block):
        pass

    def coin(self, txid, vout):
        hexhash(txid)
        integer(vout, 'vout', high=0xffffffff)
        if txid not in self.cache:
            if len(self.cache) >= self.max_prevout_txs:
                return None
            self.cache[txid] = None
            try:
                raw = self.http.read('GET', PUBLIC + f'/tx/{txid}/raw', binary=True)
                tx = parse_transaction(raw, txid)
                status_raw = self.http.read('GET', PUBLIC + f'/tx/{txid}/status', cap=8192)
                status = decode_json(status_raw)
                if status.get('confirmed') is not True:
                    return None
                height = integer(status.get('block_height'), 'prevout height', high=100_000_000)
                ts = integer(status.get('block_time'), 'prevout block time', high=0xffffffff)
                hexhash(status.get('block_hash'))
                self.cache[txid] = tx, height, ts
                self.proofs[txid] = {'raw': raw, 'metadata': status_raw.decode('utf-8'),
                                    'observed_at': utc_now()}
            except BudgetExceeded:
                raise
            except (ValueError, RuntimeError):
                self.prevout_errors += 1
                return None
        value = self.cache[txid]
        if value is None:
            return None
        tx, height, ts = value
        if vout >= len(tx.outputs):
            raise ValueError('Previous output index not present in txid-verified source')
        out = tx.outputs[vout]
        return Coin(out.value, out.script, height, ts, tx.coinbase,
                    'txid_verified;creation_metadata_provider_asserted')

    def stats(self, block_hash):
        return None


class Core:
    name = 'bitcoin-core-mainnet'

    def __init__(self, transport: Transport, cookie: Path, url='http://127.0.0.1:8332'):
        u = urlsplit(url)
        if (u.scheme != 'http' or u.hostname not in ('127.0.0.1', '::1')
            or u.username or u.password or u.path not in ('', '/') or u.query or u.fragment):
            raise ValueError('Bitcoin Core RPC must be a literal loopback endpoint')
        self.http, self.url, self.cookie = transport, url, Path(cookie)
        self.prevouts, self.proofs = {}, {}
        self.prevout_errors = 0

    def rpc(self, method, params):
        if method not in RPC_METHODS:
            raise ValueError('Non-read-only RPC method refused')
        if not self.cookie.is_file() or self.cookie.stat().st_size > 4096:
            raise ValueError('Local Bitcoin Core cookie missing or oversized')
        auth = self.cookie.read_text(encoding='utf-8').strip().split(':', 1)
        if len(auth) != 2:
            raise ValueError('Invalid local RPC cookie')
        raw = self.http.read('POST', self.url,
                             json_body={'jsonrpc': '2.0', 'id': 'iris-block', 'method': method, 'params': params},
                             auth=tuple(auth), cap=32*1024*1024)
        result = decode_json(raw)
        if result.get('error') is not None or result.get('id') != 'iris-block':
            raise ValueError('Bitcoin Core RPC returned an error or mismatched ID')
        return result['result'], raw

    def tip(self):
        return integer(self.rpc('getblockcount', [])[0], 'tip', high=100_000_000)

    def block_hash(self, height):
        return hexhash(self.rpc('getblockhash', [integer(height, 'height', high=100_000_000)])[0])

    def raw_block(self, block_hash):
        return bytes.fromhex(self.rpc('getblock', [hexhash(block_hash), 0])[0])

    def prepare(self, block):
        # Verbosity 3 requires accessible block/undo data; missing prevouts stay unknown.
        data, raw = self.rpc('getblock', [block.hash, 3])
        if data.get('hash') != block.hash or data.get('confirmations', -1) < 1:
            raise ValueError('Core block is not in its best chain')
        self.prevouts = {}
        for tx in data.get('tx', []):
            for vin in tx.get('vin', []):
                previous = vin.get('prevout')
                if previous is None:
                    continue
                key = (hexhash(vin['txid']), integer(vin['vout'], 'vout', high=0xffffffff))
                coin = Coin(btc_to_sat(previous['value']), bytes.fromhex(previous['scriptPubKey']['hex']),
                            integer(previous['height'], 'prevout height', high=100_000_000),
                            None, previous.get('generated') is True, 'local_core_undo')
                self.prevouts[key] = coin
        self.proofs['core-' + block.hash] = {'raw': raw, 'metadata': '{}', 'observed_at': utc_now()}

    def coin(self, txid, vout):
        return self.prevouts.get((txid, vout))

    def stats(self, block_hash):
        return self.rpc('getblockstats', [hexhash(block_hash),
            ['blockhash', 'height', 'txs', 'ins', 'outs', 'totalfee', 'total_out',
             'total_size', 'total_weight', 'utxo_increase', 'subsidy']])[0]
