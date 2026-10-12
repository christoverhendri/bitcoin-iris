"""Bounded Bitcoin wire decoding; hashes/merkle/witness checks, not consensus validation.

No script execution, ownership inference, signing or transaction broadcasting.
Monetary values are integer satoshis. Unknown script forms stay unknown.
"""
from __future__ import annotations

import hashlib
import struct
from dataclasses import dataclass

MAX_MONEY = 21_000_000 * 100_000_000
MAX_BYTES = 4_000_000
GENESIS = '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f'
ZERO = '00' * 32


def sha256d(data: bytes) -> bytes:
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()


def hexhash(value: object) -> str:
    if not isinstance(value, str) or len(value) != 64:
        raise ValueError('Expected a 32-byte lowercase hash')
    if any(c not in '0123456789abcdef' for c in value):
        raise ValueError('Invalid hash encoding')
    return value


class Reader:
    def __init__(self, data: bytes):
        if not isinstance(data, bytes) or not 0 < len(data) <= MAX_BYTES:
            raise ValueError('Empty/oversized raw Bitcoin object')
        self.data, self.pos = data, 0

    def read(self, n: int) -> bytes:
        if n < 0 or self.pos + n > len(self.data):
            raise ValueError('Truncated Bitcoin serialization')
        start = self.pos
        self.pos += n
        return self.data[start:self.pos]

    def number(self, size: int) -> int:
        return int.from_bytes(self.read(size), 'little')

    def compact(self, limit=MAX_BYTES) -> int:
        tag = self.number(1)
        if tag < 253:
            n = tag
        else:
            size = {253: 2, 254: 4, 255: 8}[tag]
            n = self.number(size)
            if n < {253: 253, 254: 65536, 255: 4294967296}[tag]:
                raise ValueError('Noncanonical CompactSize')
        if n > limit:
            raise ValueError('CompactSize exceeds allocation budget')
        return n

    def vector(self) -> bytes:
        return self.read(self.compact())


def script_type(script: bytes) -> str:
    if script[:1] == b'\x6a':
        return 'nulldata'
    if len(script) == 25 and script[:3] == bytes.fromhex('76a914') and script[-2:] == bytes.fromhex('88ac'):
        return 'p2pkh'
    if len(script) == 23 and script[:2] == bytes.fromhex('a914') and script[-1:] == b'\x87':
        return 'p2sh'
    if len(script) == 22 and script[:2] == b'\x00\x14':
        return 'p2wpkh'
    if len(script) == 34 and script[:2] == b'\x00\x20':
        return 'p2wsh'
    if len(script) == 34 and script[:2] == b'\x51\x20':
        return 'p2tr'
    if len(script) in (35, 67) and script[0] == len(script) - 2 and script[-1:] == b'\xac':
        return 'p2pk'
    return 'unknown'


@dataclass(frozen=True)
class Output:
    value: int
    script: bytes

    @property
    def kind(self) -> str:
        return script_type(self.script)

    @property
    def spendable(self) -> bool:
        # Bitcoin Core IsUnspendable; this does not prove a remaining script can be spent.
        return len(self.script) <= 10000 and self.script[:1] != b'\x6a'


@dataclass(frozen=True)
class Transaction:
    txid: str
    wtxid: str
    inputs: tuple[tuple[str, int], ...]
    outputs: tuple[Output, ...]
    size: int
    weight: int
    coinbase: bool
    witness: tuple[tuple[bytes, ...], ...]

    @property
    def vsize(self) -> int:
        return (self.weight + 3) // 4


def transaction(reader: Reader) -> Transaction:
    begin = reader.pos
    version = reader.read(4)
    witness_flag = reader.data[reader.pos:reader.pos + 1] == b'\x00'
    if witness_flag and reader.read(2) != b'\x00\x01':
        raise ValueError('Unsupported witness serialization flag')
    base_start = reader.pos
    n = reader.compact(100000)
    if not n or n > (len(reader.data) - reader.pos) // 41:
        raise ValueError('Invalid input count')
    inputs, scripts = [], []
    for _ in range(n):
        inputs.append((reader.read(32)[::-1].hex(), reader.number(4)))
        scripts.append(reader.vector())
        reader.read(4)  # sequence is preserved in the txid, not interpreted as intent
    if len(set(inputs)) != len(inputs):
        raise ValueError('Duplicate input outpoint')
    nout = reader.compact(100000)
    if not nout or nout > (len(reader.data) - reader.pos) // 9:
        raise ValueError('Invalid output count')
    outputs = []
    for _ in range(nout):
        value = reader.number(8)
        if value > MAX_MONEY:
            raise ValueError('Output exceeds Bitcoin money range')
        outputs.append(Output(value, reader.vector()))
    if sum(o.value for o in outputs) > MAX_MONEY:
        raise ValueError('Transaction output sum exceeds money range')
    base_end = reader.pos
    witness = []
    if witness_flag:
        for _ in inputs:
            count = reader.compact(100000)
            witness.append(tuple(reader.vector() for _ in range(count)))
        if not any(witness):
            raise ValueError('Superfluous witness serialization')
    locktime = reader.read(4)
    stripped = version + reader.data[base_start:base_end] + locktime
    full = reader.data[begin:reader.pos]
    coinbase = inputs == [(ZERO, 0xffffffff)]
    if coinbase:
        if not 2 <= len(scripts[0]) <= 100:
            raise ValueError('Invalid coinbase script length')
    elif any(h == ZERO and v == 0xffffffff for h, v in inputs):
        raise ValueError('Null non-coinbase input')
    weight = 3 * len(stripped) + len(full)
    if weight > MAX_BYTES:
        raise ValueError('Transaction exceeds block weight budget')
    return Transaction(sha256d(stripped)[::-1].hex(), sha256d(full)[::-1].hex(),
                       tuple(inputs), tuple(outputs), len(full), weight, coinbase, tuple(witness))


def parse_transaction(raw: bytes, expected_txid: str) -> Transaction:
    reader = Reader(raw)
    tx = transaction(reader)
    if reader.pos != len(raw) or tx.txid != hexhash(expected_txid):
        raise ValueError('Raw transaction/hash mismatch or trailing bytes')
    return tx


def merkle(hashes: list[bytes]) -> bytes:
    if not hashes:
        raise ValueError('Empty merkle tree')
    level = list(hashes)
    while len(level) > 1:
        if any(level[i] == level[i + 1] for i in range(0, len(level) - 1, 2)):
            raise ValueError('Mutated merkle tree')
        if len(level) % 2:
            level.append(level[-1])
        level = [sha256d(level[i] + level[i + 1]) for i in range(0, len(level), 2)]
    return level[0]


@dataclass(frozen=True)
class Block:
    hash: str
    parent: str
    timestamp: int
    weight: int
    transactions: tuple[Transaction, ...]


def parse_block(raw: bytes, expected_hash: str, *, verify_pow=True) -> Block:
    reader = Reader(raw)
    header = reader.read(80)
    digest = sha256d(header)
    if digest[::-1].hex() != hexhash(expected_hash):
        raise ValueError('Block header hash mismatch')
    bits = int.from_bytes(header[72:76], 'little')
    exponent, coefficient = bits >> 24, bits & 0x007fffff
    target = coefficient >> (8 * (3-exponent)) if exponent <= 3 else coefficient << (8 * (exponent-3))
    if verify_pow and (bits & 0x00800000 or not 0 < target <= (0xffff << 208)
                       or int.from_bytes(digest, 'little') > target):
        raise ValueError('Invalid mainnet proof-of-work target/hash')
    count = reader.compact(100000)
    prefix_bytes = reader.pos
    if count < 1 or count > (len(raw) - prefix_bytes) // 10:
        raise ValueError('Invalid block transaction count')
    txs = tuple(transaction(reader) for _ in range(count))
    if reader.pos != len(raw):
        raise ValueError('Trailing bytes after block')
    if not txs[0].coinbase or any(t.coinbase for t in txs[1:]):
        raise ValueError('Block must begin with exactly one coinbase')
    if len({t.txid for t in txs}) != count:
        raise ValueError('Duplicate transaction in block')
    if merkle([bytes.fromhex(t.txid)[::-1] for t in txs]) != header[36:68]:
        raise ValueError('Transaction merkle root mismatch')
    commitment = None
    for output in txs[0].outputs:
        if len(output.script) >= 38 and output.script[:6] == bytes.fromhex('6a24aa21a9ed'):
            commitment = output.script[6:38]  # Highest matching output index wins (BIP141).
    if commitment is not None:
        if len(txs[0].witness) != 1 or len(txs[0].witness[0]) != 1 or len(txs[0].witness[0][0]) != 32:
            raise ValueError('Invalid witness reserved value')
        root = merkle([bytes(32)] + [bytes.fromhex(t.wtxid)[::-1] for t in txs[1:]])
        if sha256d(root + txs[0].witness[0][0]) != commitment:
            raise ValueError('Witness commitment mismatch')
    elif any(t.witness for t in txs):
        raise ValueError('Witness data without block commitment')
    weight = 4 * prefix_bytes + sum(t.weight for t in txs)
    if weight > MAX_BYTES:
        raise ValueError('Block exceeds consensus weight limit')
    return Block(expected_hash, header[4:36][::-1].hex(), int.from_bytes(header[68:72], 'little'), weight, txs)
