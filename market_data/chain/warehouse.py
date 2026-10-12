"""Immutable analytical snapshots, explicitly bound to a canonical block range."""
from __future__ import annotations

import hashlib
import json
import os
import tempfile
from contextlib import closing
from pathlib import Path

from . import VERSION
from .providers import utc_now
from .store import connect, dumps, verify_store

BLOCK_FIELDS = ['height','block_hash','source','block_time','tx_count','input_count','output_count',
    'non_coinbase_output_sat','fees_total_sat','fees_known_sat','missing_prevouts','block_weight',
    'output_minus_input_count','spendable_output_delta','observed_at','feature_ready_at','details_json']
TX_FIELDS = ['height','block_hash','position','txid','wtxid','coinbase','inputs','outputs','output_value_sat',
    'fee_sat','size','weight','vsize','missing_prevouts','feerate_sat_vb']
FILES = {'blocks.parquet': BLOCK_FIELDS, 'transactions.parquet': TX_FIELDS}


def fingerprint(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024*1024), b''):
            h.update(chunk)
    return h.hexdigest()


def duck():
    try:
        import duckdb
    except ImportError as exc:
        raise RuntimeError('Install optional requirements-warehouse.txt for Parquet') from exc
    return duckdb


def schema(fields):
    text = {'block_hash','source','observed_at','feature_ready_at','details_json','txid','wtxid'}
    return ','.join(f'{f} '+('VARCHAR' if f in text else 'BOOLEAN' if f=='coinbase'
                            else 'DOUBLE' if f=='feerate_sat_vb' else 'DECIMAL(38,0)' if f=='non_coinbase_output_sat' else 'BIGINT') for f in fields)


def export(database, output):
    verified = verify_store(database)
    target = Path(output)
    if target.exists() or target.is_symlink():
        raise FileExistsError('Use a new immutable block-analytics output directory')
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.iris-chain-', dir=target.parent) as temp:
        stage = Path(temp)
        with closing(connect(database, readonly=True)) as src, closing(duck().connect(':memory:')) as con:
            src.execute('BEGIN')
            identity = dict(src.execute('SELECT key,value FROM identity'))
            chain = [dict(r) for r in src.execute('SELECT height,hash FROM chain ORDER BY height')]
            if not chain or len(chain) > 4096:
                raise ValueError('Export supports 1..4096 blocks; partition first')
            if chain[-1]['hash'] != verified['tip_hash']:
                raise ValueError('Canonical tip changed while validating; retry export')
            generation = src.execute('SELECT COALESCE(MAX(id),0) FROM chain_events').fetchone()[0]
            tables = [('blocks.parquet', BLOCK_FIELDS,
                       'SELECT summary FROM blocks JOIN chain ON chain.hash=blocks.hash ORDER BY chain.height'),
                      ('transactions.parquet', TX_FIELDS,
                       'SELECT feature FROM tx_features JOIN chain ON chain.hash=tx_features.block_hash ORDER BY chain.height,position')]
            manifest_files = {}
            for index, (name, fields, sql) in enumerate(tables):
                table = f'export_{index}'
                con.execute(f'CREATE TABLE {table} ({schema(fields)})')
                count, batch = 0, []
                for row in src.execute(sql):
                    item = json.loads(row[0])
                    item['details_json'] = row[0]
                    batch.append(tuple(item.get(f) for f in fields))
                    count += 1
                    if count > 250000:
                        raise ValueError('Parquet row budget exceeded; partition range')
                    if len(batch) >= 1000:
                        con.executemany(f'INSERT INTO {table} VALUES ({",".join("?" for _ in fields)})', batch)
                        batch.clear()
                if batch:
                    con.executemany(f'INSERT INTO {table} VALUES ({",".join("?" for _ in fields)})', batch)
                dest = str((stage/name).resolve()).replace("'", "''")
                con.execute(f"COPY {table} TO '{dest}' (FORMAT PARQUET, COMPRESSION ZSTD)")
                manifest_files[name] = {'sha256': fingerprint(stage/name), 'rows': count, 'columns': fields}
        manifest = {'schema_version': VERSION, 'kind': 'block_analytics', 'created_at': utc_now(),
            'identity': identity, 'chain': chain, 'generation': generation, 'files': manifest_files,
            'quality': verified, 'model_ready': False, 'historical_first_seen_certified': False,
            'scope': 'bounded confirmed-block research; not global UTXO state or economic transfer labels'}
        (stage/'manifest.json').write_text(dumps(manifest)+'\n', encoding='utf-8')
        if target.exists():
            raise FileExistsError('Output appeared during export')
        os.rename(stage, target)
    return {'output': str(target), 'blocks': len(chain), 'files': manifest_files,
            'quality_gate': verified['quality_gate'], 'model_ready': False}


def verify(artifact, database=None):
    folder = Path(artifact)
    if folder.is_symlink() or (folder/'manifest.json').is_symlink():
        raise ValueError('Artifact must not be symlinked')
    meta = json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
    if (meta.get('schema_version') != VERSION or meta.get('kind') != 'block_analytics'
        or meta.get('model_ready') is not False or set(meta.get('files', {})) != set(FILES)):
        raise ValueError('Unknown block artifact schema')
    with closing(duck().connect(':memory:')) as con:
        for name, fields in FILES.items():
            path = folder/name
            item = meta['files'][name]
            if path.is_symlink() or fingerprint(path) != item['sha256']:
                raise ValueError('Parquet integrity mismatch')
            relation = con.execute('SELECT * FROM read_parquet(?) LIMIT 0', [str(path)])
            names = [d[0] for d in relation.description]
            count = con.execute('SELECT count(*) FROM read_parquet(?)', [str(path)]).fetchone()[0]
            if names != fields or item['columns'] != fields or count != item['rows']:
                raise ValueError('Parquet schema/count mismatch')
        pairs = con.execute('SELECT height,block_hash FROM read_parquet(?) ORDER BY height',
                            [str(folder/'blocks.parquet')]).fetchall()
        if [{'height': h, 'hash': v} for h,v in pairs] != meta['chain']:
            raise ValueError('Manifest chain does not match Parquet')
    current = None
    if database is not None:
        with closing(connect(database, readonly=True)) as db:
            db.execute('BEGIN')
            if dict(db.execute('SELECT key,value FROM identity')) != meta['identity']:
                raise ValueError('Artifact/database identity mismatch')
            for height, block_hash in pairs:
                actual = db.execute('SELECT hash FROM chain WHERE height=?', (height,)).fetchone()
                if not actual or actual[0] != block_hash:
                    raise ValueError('Artifact invalidated by canonical reorg or missing blocks')
        current = True
    return {'verified': True, 'blocks': len(pairs), 'canonical_checked': current,
            'quality_gate': meta['quality']['quality_gate'], 'model_ready': False}
