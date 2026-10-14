"""Immutable hourly snapshots from observed minute candles, preserving original data."""
from __future__ import annotations
import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sqlite3
import tempfile

from .hourly_prices import _schema, _collector_lock
from .minute_activity import asof_time, parse_minute


def build(minutes, hourly, output, *, start, end, as_of=None):
    left, right = int(parse_minute(start).timestamp()), int(parse_minute(end).timestamp())
    cutoff = asof_time(as_of)
    if left % 3600 or right % 3600 or not left < right <= cutoff.timestamp():
        raise ValueError('Use completed UTC hour-aligned bounds')
    observed = cutoff.isoformat(timespec='microseconds').replace('+00:00', 'Z')
    available = datetime.now(timezone.utc).isoformat(timespec='microseconds').replace('+00:00', 'Z')
    dest = Path(output).resolve()
    if dest in (Path(minutes).resolve(), Path(hourly).resolve()):
        raise ValueError('Never replace either original archive')
    dest.parent.mkdir(parents=True, exist_ok=True)
    with _collector_lock(dest):
        if dest.exists():
            raise FileExistsError('Derived snapshot already exists; use a new output path')
        with tempfile.TemporaryDirectory(dir=dest.parent, prefix='.derived-hourly-') as temp:
            stage = Path(temp) / 'snapshot.sqlite'
            with closing(sqlite3.connect(Path(minutes).resolve().as_uri() + '?mode=ro', uri=True)) as source, \
                 closing(sqlite3.connect(Path(hourly).resolve().as_uri() + '?mode=ro', uri=True)) as original, \
                 closing(sqlite3.connect(stage)) as target:
                source.execute('BEGIN'); original.execute('BEGIN')
                for db, grain in [(source, '60'), (original, '3600')]:
                    identity = dict(db.execute('SELECT key,value FROM store_identity'))
                    if any(identity.get(k) != v for k, v in [('source','coinbase-exchange'),('instrument','BTC/USD'),('granularity_seconds',grain)]):
                        raise ValueError('Incompatible source identity')
                ambiguous = source.execute('''WITH latest AS (
                  SELECT ts,MAX(seen_at) seen FROM minute_seen WHERE seen_at<=? GROUP BY ts)
                  SELECT s.ts FROM minute_seen s JOIN latest l ON s.ts=l.ts AND s.seen_at=l.seen
                  GROUP BY s.ts HAVING COUNT(DISTINCT s.content_sha256)>1 LIMIT 1''', (observed,)).fetchone()
                if ambiguous: raise ValueError('Ambiguous minute revisions')
                _schema(target)
                target.execute('''CREATE TABLE hourly_quality(ts INTEGER PRIMARY KEY,status TEXT NOT NULL,
                  minute_count INTEGER NOT NULL,missing_minutes INTEGER NOT NULL,minute_lineage_sha256 TEXT NOT NULL,
                  original_sha256 TEXT,original_mismatch INTEGER,partial_ohlcv TEXT)''')
                query = '''SELECT m.ts,m.low,m.high,m.open,m.close,m.volume,m.content_sha256,s.seen_at
                  FROM minute_candles m JOIN minute_seen s ON s.ts=m.ts AND s.content_sha256=m.content_sha256
                  WHERE m.ts>=? AND m.ts<? AND s.seen_at<=? AND NOT EXISTS (
                    SELECT 1 FROM minute_seen n WHERE n.ts=s.ts AND n.seen_at<=?
                    AND (n.seen_at>s.seen_at OR (n.seen_at=s.seen_at AND n.content_sha256>s.content_sha256))) ORDER BY m.ts'''
                iterator = iter(source.execute(query, (left,right,observed,observed)))
                pending = next(iterator, None)
                digest = hashlib.sha256()
                counts = {'COMPLETE':0,'PARTIAL':0,'NO_DATA':0,'mismatched_complete_hours':0}
                for hour in range(left, right, 3600):
                    rows = []
                    while pending is not None and pending[0] < hour + 3600:
                        ts, *values, sha, seen = pending
                        if ts % 60 or (rows and ts <= rows[-1][0]) or any(not math.isfinite(v) for v in values) or min(values[:4])<=0 or values[4]<0 or values[0]>min(values[2:4]) or values[1]<max(values[2:4]):
                            raise ValueError('Invalid minute candle')
                        if hashlib.sha256(json.dumps([ts,*values],separators=(',',':'),allow_nan=False).encode()).hexdigest()!=sha:
                            raise ValueError('Minute hash mismatch')
                        if asof_time(seen).timestamp()<ts+60: raise ValueError('Minute observed before completion')
                        rows.append(pending); pending = next(iterator, None)
                    state = 'COMPLETE' if len(rows)==60 else 'PARTIAL' if rows else 'NO_DATA'
                    counts[state] += 1
                    lineage = hashlib.sha256(json.dumps([(r[0],r[6],r[7]) for r in rows],separators=(',',':')).encode()).hexdigest()
                    values = [min(r[1] for r in rows),max(r[2] for r in rows),rows[0][3],rows[-1][4],math.fsum(r[5] for r in rows)] if rows else None
                    ref = original.execute('''SELECT low,high,open,close,volume,payload_sha256 FROM hourly_candles
                      WHERE ts=? AND observed_at<=? ORDER BY julianday(last_seen_at) DESC,payload_sha256 DESC LIMIT 1''',(hour,observed)).fetchone()
                    mismatch = None if ref is None or values is None else int(any(abs(a-b)>max(1e-8,abs(b)*(1e-6 if i==4 else 1e-7)) for i,(a,b) in enumerate(zip(values,ref[:5]))))
                    if state=='COMPLETE':
                        counts['mismatched_complete_hours'] += int(mismatch==1)
                        sha = hashlib.sha256(json.dumps([hour,*values],separators=(',',':'),allow_nan=False).encode()).hexdigest()
                        target.execute('INSERT INTO hourly_candles VALUES (?,?,?,?,?,?,?,?,?)',(hour,sha,available,available,*values))
                    target.execute('INSERT INTO hourly_quality VALUES (?,?,?,?,?,?,?,?)',(hour,state,len(rows),60-len(rows),lineage,ref[5] if ref else None,mismatch,json.dumps(values) if values else None))
                    digest.update(json.dumps([hour,state,lineage,ref[5] if ref else None,mismatch],separators=(',',':')).encode()+b'\n')
                # Availability is the completed computation, never its start time.
                available = datetime.now(timezone.utc).isoformat(timespec='microseconds').replace('+00:00', 'Z')
                target.execute('UPDATE hourly_candles SET observed_at=?,last_seen_at=?',(available,available))
                digest.update(json.dumps({'minute_as_of':observed,'derived_at':available},separators=(',',':')).encode())
                version = digest.hexdigest()
                metadata = {'dataset_kind':'minute_derived_hourly','dataset_version':version,'minute_as_of':observed,
                            'derived_at':available,'range_start':str(left),'range_end_exclusive':str(right),
                            'aggregation_policy':'60_observed_minutes_only','historical_backtest_safe':'false'}
                target.executemany('INSERT INTO store_identity VALUES (?,?)',metadata.items())
                target.execute('INSERT INTO hourly_windows VALUES (?,?,?,?,?,?)',(left,right,available,version,counts['COMPLETE'],counts['PARTIAL']+counts['NO_DATA']))
                target.commit()
                if target.execute('PRAGMA integrity_check').fetchone()[0]!='ok': raise ValueError('Derived SQLite integrity failure')
                target.execute('PRAGMA wal_checkpoint(TRUNCATE)')
                target.execute('PRAGMA journal_mode=DELETE')
            stage.rename(dest)
    return {'output':str(dest),'dataset_version':version,'counts':counts,'minute_as_of':observed,'derived_at':available,'historical_backtest_safe':False}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--minutes',default='artifacts/market/coinbase_minute.sqlite')
    p.add_argument('--hourly',default='artifacts/market/coinbase_hourly.sqlite')
    p.add_argument('--output',required=True);p.add_argument('--start',required=True);p.add_argument('--end',required=True);p.add_argument('--as-of')
    args=p.parse_args()
    print(json.dumps(build(args.minutes,args.hourly,args.output,start=args.start,end=args.end,as_of=args.as_of),indent=2))

if __name__=='__main__': main()
