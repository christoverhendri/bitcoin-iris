"""Atomic bounded-chain ingestion and reversible tracked-output state.

The tracked UTXO subset is NOT the global Bitcoin UTXO set. Archived blocks stay
available after a reorg; only active output/spend projections are reversed.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
import statistics
import zlib
from collections import Counter
from contextlib import closing, contextmanager
from datetime import datetime, timezone
from pathlib import Path

from . import VERSION
from .providers import Coin, integer, utc_now
from .wire import GENESIS, MAX_MONEY, Output, ZERO, parse_block

DEFAULT_DB = Path('artifacts/market/bitcoin_blocks.sqlite')
MAX_DB_BYTES = 512 * 1024 * 1024
TABLES = {'identity', 'blocks', 'chain', 'outputs', 'spends', 'tx_features', 'chain_events', 'proofs', 'analyses'}


def dumps(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)


@contextmanager
def writer_lock(path):
    path = Path(path)
    if path.is_symlink():
        raise ValueError('Canonical database may not be a symlink')
    path.parent.mkdir(parents=True, exist_ok=True)
    with Path(str(path) + '.writer.lock').open('a+b') as handle:
        if handle.tell() == 0:
            handle.write(b'0'); handle.flush()
        handle.seek(0)
        if os.name == 'nt':
            import msvcrt
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            handle.seek(0)
            if os.name == 'nt':
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def connect(path, *, readonly=False):
    path = Path(path)
    if path.is_symlink() or (readonly and not path.is_file()):
        raise ValueError('Canonical block database missing or symlinked')
    db = sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True) if readonly else sqlite3.connect(path, timeout=15)
    db.row_factory = sqlite3.Row
    tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if (tables and not TABLES <= tables) or (readonly and not TABLES <= tables):
        db.close()
        raise ValueError('Not an IRIS block-analytics database')
    if readonly:
        if dict(db.execute('SELECT key,value FROM identity')).get('schema') != VERSION:
            db.close(); raise ValueError('Unsupported block store schema')
        return db
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('PRAGMA synchronous=FULL')
    db.executescript('''
      CREATE TABLE IF NOT EXISTS identity(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS blocks(hash TEXT PRIMARY KEY,height INTEGER NOT NULL,parent TEXT NOT NULL,
        observed_at TEXT NOT NULL,processed_at TEXT NOT NULL,raw_sha256 TEXT NOT NULL,raw_z BLOB NOT NULL,
        summary TEXT NOT NULL,evidence TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS chain(height INTEGER PRIMARY KEY,hash TEXT UNIQUE NOT NULL);
      CREATE TABLE IF NOT EXISTS outputs(txid TEXT,vout INTEGER,block_hash TEXT NOT NULL,height INTEGER,
        block_time INTEGER,value_sat INTEGER,script BLOB,coinbase INTEGER,spendable INTEGER,
        PRIMARY KEY(txid,vout));
      CREATE TABLE IF NOT EXISTS spends(txid TEXT,vout INTEGER,block_hash TEXT NOT NULL,
        spending_txid TEXT NOT NULL,value_sat INTEGER,created_height INTEGER,created_time INTEGER,
        evidence TEXT NOT NULL,PRIMARY KEY(txid,vout));
      CREATE TABLE IF NOT EXISTS tx_features(block_hash TEXT,position INTEGER,txid TEXT NOT NULL,
        feature TEXT NOT NULL,PRIMARY KEY(block_hash,position));
      CREATE TABLE IF NOT EXISTS chain_events(id INTEGER PRIMARY KEY,event TEXT NOT NULL,
        height INTEGER,hash TEXT,observed_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS proofs(id TEXT PRIMARY KEY,raw_z BLOB,metadata TEXT,observed_at TEXT);
      CREATE TABLE IF NOT EXISTS analyses(id INTEGER PRIMARY KEY,block_hash TEXT,summary TEXT,evidence TEXT,processed_at TEXT);
    ''')
    return db


def local_coin(db, key):
    row = db.execute('SELECT * FROM outputs WHERE txid=? AND vout=?', key).fetchone()
    if row is None:
        return None
    if not row['spendable']:
        raise ValueError('Spend of tracked unspendable/genesis output')
    return Coin(row['value_sat'], bytes(row['script']), row['height'], row['block_time'],
                bool(row['coinbase']), 'tracked_confirmed_block')


def analyze(block, height, resolve, already_spent):
    """Compute features from bytes and resolved prevouts; every amount stays integer."""
    created, spent, features = {}, {}, []
    all_ids = {t.txid for t in block.transactions}
    known_fees = unknown_inputs = input_count = age_count = age_seconds_count = 0
    known_age_sat_seconds = 0
    scripts = Counter()
    rates = []
    subsidy = (50 * 100_000_000) >> (height // 210000) if height // 210000 < 64 else 0
    for position, tx in enumerate(block.transactions):
        input_values, missing, ages = [], 0, []
        if not tx.coinbase:
            for key in tx.inputs:
                if key in spent or already_spent(key):
                    raise ValueError('Duplicate spend in tracked canonical range')
                coin = created.get(key)
                if coin is None:
                    if key[0] in all_ids:
                        raise ValueError('Forward/inexistent intra-block prevout')
                    coin = resolve(key)
                evidence = 'missing_prevout'
                if coin is not None:
                    if not Output(coin.value, coin.script).spendable:
                        raise ValueError('Spend of provably unspendable output')
                    integer(coin.value, 'prevout value')
                    if coin.height is not None:
                        if coin.height > height or (coin.coinbase and (coin.height == 0 or height - coin.height < 100)):
                            raise ValueError('Future prevout or immature coinbase spend')
                        ages.append(height - coin.height)
                        age_count += 1
                    if coin.timestamp is not None and coin.timestamp <= block.timestamp:
                        known_age_sat_seconds += coin.value * (block.timestamp - coin.timestamp)
                        age_seconds_count += 1
                    input_values.append(coin.value)
                    evidence = coin.evidence
                else:
                    missing += 1
                spent[key] = (block.hash, tx.txid, coin.value if coin else None,
                              coin.height if coin else None, coin.timestamp if coin else None, evidence)
            input_count += len(tx.inputs)
        if sum(input_values) > MAX_MONEY:
            raise ValueError('Resolved partial input sum exceeds money range')
        output_sum = sum(o.value for o in tx.outputs)
        fee = None if tx.coinbase or missing else sum(input_values) - output_sum
        if not tx.coinbase and not missing:
            if sum(input_values) > MAX_MONEY or fee < 0:
                raise ValueError('Invalid resolved input sum or negative fee')
            known_fees += fee
            rates.append(fee / tx.vsize)
        unknown_inputs += missing
        features.append({'height': height, 'block_hash': block.hash, 'position': position,
                         'txid': tx.txid, 'wtxid': tx.wtxid, 'coinbase': tx.coinbase,
                         'inputs': 0 if tx.coinbase else len(tx.inputs), 'outputs': len(tx.outputs),
                         'output_value_sat': output_sum, 'fee_sat': fee, 'size': tx.size,
                         'weight': tx.weight, 'vsize': tx.vsize, 'missing_prevouts': missing,
                         'feerate_sat_vb': fee / tx.vsize if fee is not None else None,
                         'known_age_blocks_median': statistics.median(ages) if ages else None})
        for vout, out in enumerate(tx.outputs):
            created[(tx.txid, vout)] = Coin(out.value, out.script, height, block.timestamp,
                                            tx.coinbase, 'tracked_confirmed_block')
            scripts[out.kind] += 1
    if not unknown_inputs and sum(o.value for o in block.transactions[0].outputs) > subsidy + known_fees:
        raise ValueError('Coinbase reward exceeds subsidy plus resolved fees')
    nouts = len(created)
    spendable = sum(Output(c.value, c.script).spendable for c in created.values()) if height != 0 else 0
    summary = {
        'height': height, 'block_hash': block.hash, 'parent_hash': block.parent,
        'block_time': block.timestamp, 'tx_count': len(features), 'input_count': input_count,
        'output_count': nouts, 'non_coinbase_output_sat': sum(f['output_value_sat'] for f in features[1:]),
        'fees_total_sat': known_fees if not unknown_inputs else None, 'fees_known_sat': known_fees,
        'missing_prevouts': unknown_inputs, 'prevout_coverage': (input_count-unknown_inputs)/input_count if input_count else 1.0,
        'fee_rate_median_sat_vb': statistics.median(rates) if rates else None,
        'non_coinbase_size': sum(t.size for t in block.transactions[1:]),
        'non_coinbase_weight': sum(t.weight for t in block.transactions[1:]), 'block_weight': block.weight,
        'output_minus_input_count': nouts-input_count,
        'spendable_output_delta': spendable-input_count, 'subsidy_sat': subsidy,
        'script_counts': dict(scripts), 'age_height_known_inputs': age_count,
        'age_time_known_inputs': age_seconds_count,
        'known_coin_age_sat_seconds': str(known_age_sat_seconds),
        'fee_quality': 'complete' if not unknown_inputs else 'partial',
        'semantics': 'output values include change/self-transfers; tracked outputs are not global UTXOs',
    }
    return summary, created, spent, features


def compare_stats(summary, stats):
    if stats is None:
        return {'status': 'not_checked', 'reason': 'Bitcoin Core not connected'}
    mapping = {'blockhash': 'block_hash', 'height': 'height', 'txs': 'tx_count',
               'ins': 'input_count', 'outs': 'output_count', 'total_out': 'non_coinbase_output_sat',
               'total_size': 'non_coinbase_size', 'total_weight': 'non_coinbase_weight',
               'subsidy': 'subsidy_sat', 'utxo_increase': 'output_minus_input_count'}
    if summary['fees_total_sat'] is not None:
        mapping['totalfee'] = 'fees_total_sat'
    for source, local in mapping.items():
        if source not in stats or stats[source] != summary[local]:
            raise ValueError(f'Bitcoin Core getblockstats disagreement: {source}')
    return {'status': 'pass', 'fields': list(mapping), 'fee_checked': 'totalfee' in mapping}


def rollback(db, height):
    """Detach suffix atomically; spend deletion makes earlier outputs unspent again."""
    rows = db.execute('SELECT height,hash FROM chain WHERE height>? ORDER BY height DESC', (height,)).fetchall()
    with db:
        for row in rows:
            for table in ('outputs', 'spends', 'tx_features'):
                db.execute(f'DELETE FROM {table} WHERE block_hash=?', (row['hash'],))
            db.execute('DELETE FROM chain WHERE height=?', (row['height'],))
            db.execute('INSERT INTO chain_events(event,height,hash,observed_at) VALUES (?,?,?,?)',
                       ('detach', row['height'], row['hash'], utc_now()))
    return len(rows)


def _room(path, extra):
    size = sum(p.stat().st_size for p in (path, Path(str(path)+'-wal')) if p.exists())
    if size + extra > MAX_DB_BYTES or shutil.disk_usage(path.parent).free < 2*extra + 16*1024*1024:
        raise ValueError('Canonical store/disk budget exceeded; start a documented partition')


def scan(source, database=DEFAULT_DB, *, start, end, max_blocks=8, confirmations=6, max_reorg=12):
    integer(start, 'start height', high=100_000_000)
    integer(end, 'exclusive end height', low=start+1, high=100_000_000)
    integer(max_blocks, 'block budget', low=1, high=64)
    integer(confirmations, 'confirmations', low=1, high=2016)
    integer(max_reorg, 'reorg budget', low=1, high=100)
    path = Path(database)
    with writer_lock(path), closing(connect(path)) as db:
        if source.block_hash(0) != GENESIS:
            raise ValueError('Refusing non-Bitcoin-mainnet source')
        tip = source.tip()
        eligible_end = min(end, tip - confirmations + 2)
        if eligible_end <= start:
            raise ValueError('No requested blocks meet the confirmation threshold')
        anchor = source.block_hash(start-1) if start else ZERO
        ident = dict(db.execute('SELECT key,value FROM identity'))
        expected = {'schema': VERSION, 'network': 'bitcoin-mainnet', 'source': source.name,
                    'start_height': str(start), 'anchor_hash': anchor}
        if ident and ident != expected:
            raise ValueError('Store identity/anchor changed; use a new range after boundary reorg')
        with db:
            db.executemany('INSERT OR IGNORE INTO identity VALUES (?,?)', expected.items())
        old_tip = db.execute('SELECT height,hash FROM chain ORDER BY height DESC LIMIT 1').fetchone()
        detached = 0
        if old_tip:
            height = old_tip['height']
            while height >= start:
                local = db.execute('SELECT hash FROM chain WHERE height=?', (height,)).fetchone()
                if local is None:
                    raise ValueError('Noncontiguous canonical store')
                if height <= tip and source.block_hash(height) == local[0]:
                    break
                if old_tip['height'] - height >= max_reorg:
                    raise ValueError('Reorg exceeds configured rollback budget; no mutation')
                height -= 1
            detached = rollback(db, height)
        row = db.execute('SELECT MAX(height) FROM chain').fetchone()
        next_height = row[0]+1 if row[0] is not None else start
        added, started = 0, utc_now()
        for height in range(next_height, min(eligible_end, next_height + max_blocks)):
            wanted = source.block_hash(height)
            mark = len(source.http.evidence)
            raw = source.raw_block(wanted)
            block = parse_block(raw, wanted)
            previous = db.execute('SELECT hash FROM chain WHERE height=?', (height-1,)).fetchone()
            if block.parent != (previous[0] if previous else anchor):
                raise ValueError('Block parent discontinuity; no partial block committed')
            source.prepare(block)
            resolve = lambda key: local_coin(db, key) or source.coin(*key)
            used = lambda key: db.execute('SELECT 1 FROM spends WHERE txid=? AND vout=?', key).fetchone() is not None
            summary, created, spent, features = analyze(block, height, resolve, used)
            previous_times = [r[0] for r in db.execute(
                "SELECT json_extract(b.summary, '$.block_time') FROM chain c JOIN blocks b ON b.hash=c.hash ORDER BY c.height DESC LIMIT 10")]
            summary['median_time_past'] = (int(statistics.median(previous_times+[block.timestamp]))
                                           if len(previous_times) == 10 else None)
            summary['core_parity'] = compare_stats(summary, source.stats(wanted))
            # Recheck active membership after download/enrichment; reorg mid-read must not commit.
            if source.block_hash(height) != wanted:
                raise ValueError('Source reorg during block read; retry the run')
            observed, processed = utc_now(), utc_now()
            summary.update(source=source.name, observed_at=observed, feature_ready_at=processed,
                           confirmation_count_at_fetch=tip-height+1)
            _room(path, max(len(raw)*12, 1024*1024))
            with db:
                old = db.execute('SELECT raw_sha256 FROM blocks WHERE hash=?', (wanted,)).fetchone()
                raw_sha = hashlib.sha256(raw).hexdigest()
                if old is not None and old[0] != raw_sha:
                    raise ValueError('Same block hash has conflicting archived bytes')
                db.execute('INSERT OR IGNORE INTO blocks VALUES (?,?,?,?,?,?,?,?,?)',
                    (wanted,height,block.parent,observed,processed,raw_sha,zlib.compress(raw),dumps(summary),
                     dumps(source.http.evidence[mark:])))
                db.execute('INSERT INTO analyses(block_hash,summary,evidence,processed_at) VALUES (?,?,?,?)',
                    (wanted,dumps(summary),dumps(source.http.evidence[mark:]),processed))
                db.execute('UPDATE blocks SET summary=?,processed_at=? WHERE hash=?',
                           (dumps(summary),processed,wanted))
                # BIP30 duplicate historical txid overwrite is deliberately refused, not silently lost.
                for (txid,vout), coin in created.items():
                    db.execute('INSERT INTO outputs VALUES (?,?,?,?,?,?,?,?,?)',
                        (txid,vout,wanted,height,block.timestamp,coin.value,coin.script,
                         int(coin.coinbase),int(height != 0 and Output(coin.value,coin.script).spendable)))
                db.executemany('INSERT INTO spends VALUES (?,?,?,?,?,?,?,?)',
                               [(*key,*value) for key,value in spent.items()])
                db.executemany('INSERT INTO tx_features VALUES (?,?,?,?)',
                               [(wanted,f['position'],f['txid'],dumps(f)) for f in features])
                for key, proof in source.proofs.items():
                    db.execute('INSERT OR IGNORE INTO proofs VALUES (?,?,?,?)',
                        (key,zlib.compress(proof['raw']),proof['metadata'],proof['observed_at']))
                db.execute('INSERT INTO chain VALUES (?,?)', (height,wanted))
                db.execute('INSERT INTO chain_events(event,height,hash,observed_at) VALUES (?,?,?,?)',
                           ('attach',height,wanted,observed))
            added += 1
        return {'schema_version': VERSION, 'source': source.name, 'start_height': start,
                'end_exclusive': end, 'added_blocks': added, 'detached_blocks': detached,
                'next_height': next_height+added, 'range_complete': next_height+added >= end,
                'run_started_at': started, 'requests': source.http.requests, 'response_bytes': source.http.bytes,
                'prevout_fetch_errors': source.prevout_errors, 'model_ready': False}


def status(database=DEFAULT_DB):
    with closing(connect(database, readonly=True)) as db:
        db.execute('BEGIN')
        ids = dict(db.execute('SELECT key,value FROM identity'))
        stats = db.execute('SELECT COUNT(*),MIN(height),MAX(height) FROM chain').fetchone()
        unknown = db.execute('SELECT COUNT(*) FROM spends WHERE value_sat IS NULL').fetchone()[0]
        unspent = db.execute('''SELECT COUNT(*),COALESCE(SUM(o.value_sat),0) FROM outputs o
            LEFT JOIN spends s ON o.txid=s.txid AND o.vout=s.vout
            WHERE s.txid IS NULL AND o.spendable=1''').fetchone()
        n_tx = db.execute('SELECT COUNT(*) FROM tx_features').fetchone()[0]
        generation = db.execute('SELECT COALESCE(MAX(id),0) FROM chain_events').fetchone()[0]
        return {'schema_version': VERSION, 'identity': ids, 'blocks': stats[0],
                'first_height': stats[1], 'last_height': stats[2], 'transactions': n_tx,
                'missing_prevouts': unknown, 'tracked_unspent_outputs': unspent[0],
                'tracked_unspent_value_sat': unspent[1], 'generation': generation,
                'scope': 'tracked range only, not the complete Bitcoin UTXO set', 'model_ready': False}


def unpack_block(value):
    # Defend a corrupt local archive against decompression bombs too.
    decoder = zlib.decompressobj()
    raw = decoder.decompress(value, 4_000_001)
    if len(raw) > 4_000_000 or not decoder.eof or decoder.unused_data:
        raise ValueError('Invalid/oversized compressed block archive')
    return raw


def verify_store(database=DEFAULT_DB):
    with closing(connect(database, readonly=True)) as db:
        db.execute('BEGIN')
        if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
            raise ValueError('SQLite integrity check failed')
        identity = dict(db.execute('SELECT key,value FROM identity'))
        parent, height = identity['anchor_hash'], int(identity['start_height'])
        count = partial = 0
        for row in db.execute('SELECT b.* FROM chain c JOIN blocks b ON b.hash=c.hash ORDER BY c.height'):
            raw = unpack_block(row['raw_z'])
            if len(raw) > 4_000_000 or hashlib.sha256(raw).hexdigest() != row['raw_sha256']:
                raise ValueError('Stored raw block hash mismatch')
            block = parse_block(raw, row['hash'])
            summary = json.loads(row['summary'])
            if row['height'] != height or block.parent != parent or len(block.transactions) != summary['tx_count']:
                raise ValueError('Canonical chain or summary mismatch')
            stored_features = db.execute('SELECT feature FROM tx_features WHERE block_hash=? ORDER BY position', (block.hash,)).fetchall()
            if len(stored_features) != len(block.transactions):
                raise ValueError('Transaction projection missing')
            total_fees, unknown, all_ins, all_outs, total_value = 0, 0, 0, 0, 0
            for tx, feature_row in zip(block.transactions, stored_features):
                feature = json.loads(feature_row[0])
                outputs = db.execute('SELECT * FROM outputs WHERE txid=? ORDER BY vout', (tx.txid,)).fetchall()
                if len(outputs) != len(tx.outputs):
                    raise ValueError('Output projection count mismatch')
                for vout, (out, stored) in enumerate(zip(tx.outputs, outputs)):
                    if (stored['vout'] != vout or stored['value_sat'] != out.value or bytes(stored['script']) != out.script
                        or stored['block_hash'] != block.hash or stored['height'] != height
                        or stored['spendable'] != int(height != 0 and out.spendable)):
                        raise ValueError('Output projection disagrees with serialized transaction')
                values = []
                if not tx.coinbase:
                    for key in tx.inputs:
                        spent = db.execute('SELECT * FROM spends WHERE txid=? AND vout=?', key).fetchone()
                        if not spent or spent['block_hash'] != block.hash or spent['spending_txid'] != tx.txid:
                            raise ValueError('Spend projection mismatch')
                        values.append(spent['value_sat'])
                    all_ins += len(tx.inputs)
                    total_value += sum(o.value for o in tx.outputs)
                missing = sum(v is None for v in values)
                fee = None if tx.coinbase or missing else sum(values)-sum(o.value for o in tx.outputs)
                if fee is not None and fee < 0:
                    raise ValueError('Corrupt negative fee')
                expected = {'txid':tx.txid,'wtxid':tx.wtxid,'weight':tx.weight,'size':tx.size,
                            'vsize':tx.vsize,'missing_prevouts':missing,'fee_sat':fee,
                            'output_value_sat':sum(o.value for o in tx.outputs)}
                if any(feature.get(k) != v for k,v in expected.items()):
                    raise ValueError('Transaction feature projection mismatch')
                unknown += missing
                total_fees += fee or 0
                all_outs += len(tx.outputs)
            metrics = {'input_count':all_ins,'output_count':all_outs,'non_coinbase_output_sat':total_value,
                       'missing_prevouts':unknown,'fees_known_sat':total_fees,
                       'fees_total_sat':None if unknown else total_fees,'block_weight':block.weight}
            if any(summary.get(k) != v for k,v in metrics.items()):
                raise ValueError('Block summary projection mismatch')
            parent, height = block.hash, height+1
            count += 1
            partial += summary['missing_prevouts'] > 0
        if not count:
            raise ValueError('No verified blocks stored')
        return {'schema_version': VERSION, 'kind': 'block_analytics', 'integrity': 'pass',
                'quality_gate': 'pass' if not partial else 'partial', 'blocks': count,
                'blocks_with_missing_prevouts': partial, 'tip_hash': parent, 'model_ready': False}
