"""Deterministic source, provenance, gap and as-of regression tests."""
from __future__ import annotations

import json
import sqlite3
import tempfile
from contextlib import closing
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from market_data import hourly_prices as h
from market_data import minute_activity as m

EARLY = '2015-07-21T00:00:00Z'
HOUR_LATER = '2015-07-21T01:00:00Z'
EVIDENCE = datetime(2026, 10, 12, 8, 0, 0, tzinfo=timezone.utc)
ASOF = '2026-10-12T09:00:00Z'


class FakeResponse:
    def __init__(self, rows, code=200, headers=None):
        self.raw = json.dumps(rows).encode('utf-8') if isinstance(rows,list) else rows
        self.status_code=code
        self.headers=headers or {'Content-Type':'application/json'}
    def __enter__(self):return self
    def __exit__(self, *_):return False
    def iter_content(self, chunk_size):
        for i in range(0,len(self.raw),chunk_size):
            yield self.raw[i:i+chunk_size]


def trades(*, omit=(14,), change=None):
    start=int(m.parse_minute(EARLY).timestamp())
    rows=[]
    for i in range(60):
        if i in omit:continue
        vol=1 if change is None or i not in change else change[i]
        rows.append([start + 60*i,100,100,100,100,vol])
    return rows


def factory(rows, errors=0):
    calls=[]
    def get(url, *,params, **kwargs):
        calls.append((url,params,kwargs))
        if len(calls)<=errors:
            return FakeResponse(b'{"reason":"rate limit"}',code=429,headers={'Content-Type':'application/json','Retry-After':'1'})
        return FakeResponse(rows)
    return get,calls


class MinuteActivityTests(unittest.TestCase):
    def setUp(self):
        self.t=tempfile.TemporaryDirectory()
        self.addCleanup(self.t.cleanup)
        self.root=Path(self.t.name)
        self.minutes=self.root/'minute.sqlite'
        self.hourly=self.root/'hour.sqlite'

    def hour(self, volume=59, *, timestamp=EVIDENCE, close=100):
        self.hourly.parent.mkdir(parents=True,exist_ok=True)
        with closing(sqlite3.connect(self.hourly)) as db, db:
            h._schema(db)
            db.execute('''INSERT OR REPLACE INTO hourly_candles
                (ts,payload_sha256,observed_at,last_seen_at,low,high,open,close,volume)
                VALUES(?,?,?,?,?,?,?,?,?)''',
                (int(m.parse_minute(EARLY).timestamp()),'a'*64,h.observed_stamp(timestamp),
                 h.observed_stamp(timestamp),100,max(100,close),100,close,volume))
            db.commit()

    def fetch(self, rows=None, *, end=HOUR_LATER, now=EVIDENCE, page_minutes=240, retry_gaps=False):
        get,calls=factory(rows if rows is not None else trades())
        out=m.backfill(self.minutes,start=EARLY,end=end,max_pages=12,
                       page_minutes=page_minutes, now=now,get=get,sleep=lambda _:None,
                       retry_gaps=retry_gaps)
        return out,calls

    def check(self, *, as_of=ASOF, with_rows=True):
        return m.classify(self.minutes,self.hourly,start=EARLY,end=HOUR_LATER,
                          as_of=as_of,with_rows=with_rows)

    def test_independent_hourly_reconciliation_infers_one_no_trade(self):
        self.hour(59)
        run,calls=self.fetch()
        self.assertEqual(run['missing_slots_in_fetched_windows'],1)
        self.assertEqual(calls[0][1]['granularity'],60)
        self.assertEqual(len(calls),1)
        report,rows=self.check()
        self.assertEqual(report['quality_gate'],'pass')
        self.assertEqual(report['counts']['TRADED'],59)
        self.assertEqual(report['counts']['INFERRED_NO_TRADE'],1)
        inferred=rows[14]
        self.assertEqual(inferred['status'],'INFERRED_NO_TRADE')
        self.assertEqual(inferred['volume'],0.0)
        self.assertIsNone(inferred['close'])
        self.assertEqual(report['hours'][0]['hourly_reference_sha256'],'a'*64)
        self.assertTrue(report['hours'][0]['hour_fetch_covered'])
        self.assertTrue(report['hours'][0]['reconciled'])
        self.assertFalse(report['historical_backtest_safe'])

    def test_one_hour_volume_disagreement_stays_unknown(self):
        self.hour(60)
        self.fetch()
        report,rows=self.check()
        self.assertEqual(report['counts']['UNKNOWN'],1)
        self.assertEqual(rows[14]['status'],'UNKNOWN')
        self.assertIsNone(rows[14]['volume'])
        self.assertEqual(report['quality_gate'],'fail')
        self.assertEqual(report['diagnostics']['hourly_disagreement'],1)

    def test_no_hourly_reference_keeps_missing_unknown(self):
        self.fetch()
        report=m.classify(self.minutes,None,start=EARLY,end=HOUR_LATER,as_of=ASOF)
        self.assertEqual(report['counts']['UNKNOWN'],1)
        self.assertEqual(report['diagnostics']['missing_hourly_references'],1)

    def test_failed_or_partial_minute_page_is_not_no_trade(self):
        self.hour(59)
        self.fetch(end='2015-07-21T00:30:00Z',page_minutes=30)
        report,rows=self.check()
        self.assertFalse(report['hours'][0]['hour_fetch_covered'])
        self.assertEqual(report['counts']['UNKNOWN'],31)
        self.assertEqual(report['counts']['INFERRED_NO_TRADE'],0)
        self.assertEqual(rows[14]['status'],'UNKNOWN')

    def test_asof_with_seconds_can_see_newly_collected_minute(self):
        self.hour(59, timestamp=EVIDENCE.replace(second=12))
        self.fetch(now=EVIDENCE.replace(second=12))
        report,rows=self.check(as_of='2026-10-12T08:00:20Z')
        self.assertEqual(report['counts']['TRADED'],59)
        self.assertEqual(report['counts']['INFERRED_NO_TRADE'],1)
        self.assertEqual(report['quality_gate'],'pass')

    def test_prospective_observation_guards_against_future_data(self):
        self.hour(59)
        self.fetch()
        report,rows=self.check(as_of='2026-10-12T07:00:00Z')
        self.assertEqual(report['counts']['UNKNOWN'],60)
        self.assertEqual(report['counts']['TRADED'],0)
        self.assertEqual(report['quality_gate'],'fail')

    def test_zero_volume_returned_candle_is_distinct_from_absence(self):
        self.hour(58)
        values=trades(omit=(14,))
        values[0][-1]=0
        self.fetch(values)
        report,rows=self.check()
        self.assertEqual(rows[0]['status'],'ZERO_VOLUME_CANDLE')
        self.assertEqual(rows[14]['status'],'INFERRED_NO_TRADE')
        self.assertEqual(report['counts']['ZERO_VOLUME_CANDLE'],1)

    def test_revisions_are_recorded_and_prior_asof_state_retained(self):
        self.hour(59)
        self.fetch()
        report_before,_=self.check(as_of='2026-10-12T09:00:00Z')
        self.assertEqual(report_before['counts']['INFERRED_NO_TRADE'],1)
        later=EVIDENCE+timedelta(days=1)
        self.fetch(trades(omit=()), now=later, retry_gaps=True)
        with closing(sqlite3.connect(self.minutes)) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM minute_candles').fetchone()[0],60)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM minute_windows').fetchone()[0],2)
        earlier,_=self.check(as_of='2026-10-12T09:00:00Z')
        self.assertEqual(earlier['counts']['INFERRED_NO_TRADE'],1)
        later_report,_=self.check(as_of='2026-10-13T09:00:00Z')
        self.assertEqual(later_report['counts']['TRADED'],60)
        self.assertEqual(later_report['quality_gate'],'fail')
        self.assertEqual(later_report['diagnostics']['hourly_disagreement'],1)

    def test_retries_then_success_are_bounded_and_idempotent(self):
        get,calls=factory(trades(), errors=2)
        run=m.backfill(self.minutes,start=EARLY,end=HOUR_LATER,
                       now=EVIDENCE,get=get,sleep=lambda _:None)
        self.assertEqual(run['fetched_pages'],1)
        self.assertEqual(len(calls),3)
        self.assertEqual(m.status(self.minutes)['distinct_minutes'],59)
        rerun=m.backfill(self.minutes,start=EARLY,end=HOUR_LATER,
                         now=EVIDENCE,get=get,sleep=lambda _:None,
                         recheck_minutes=0)
        self.assertEqual(rerun['skipped_pages'],1)

    def test_failed_api_does_not_create_successful_empty_page(self):
        def bad(*_args,**_kwargs):return FakeResponse([],code=403)
        with self.assertRaises(RuntimeError):
            m.backfill(self.minutes,start=EARLY,end=HOUR_LATER,
                       now=EVIDENCE,get=bad,sleep=lambda _:None)
        with closing(sqlite3.connect(self.minutes)) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM minute_windows').fetchone()[0],0)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM minute_errors').fetchone()[0],1)

    def test_no_duplicated_or_conflicting_minutes(self):
        values=trades()
        values.append(values[0][:])
        self.fetch(values)
        self.assertEqual(m.status(self.minutes)['distinct_minutes'],59)
        other=trades()
        other.append([other[0][0],99,101,100,100,100])
        with self.assertRaises(ValueError):
            m.backfill(self.root/'invalid.sqlite',start=EARLY,end=HOUR_LATER,
                       now=EVIDENCE,get=factory(other)[0],sleep=lambda _:None)
        with closing(sqlite3.connect(self.root/'invalid.sqlite')) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM minute_windows').fetchone()[0],0)

    def test_invalid_range_is_rejected_before_request(self):
        with self.assertRaises(ValueError):
            m.backfill(self.minutes,start=EARLY,end=HOUR_LATER,
                       now=datetime(2015,7,21,0,10,tzinfo=timezone.utc),
                       get=lambda *_a,**_k: self.fail('should not reach API'))

    def test_parquet_roundtrip_preserves_unknown_and_inferred_semantics(self):
        try:
            import duckdb  # noqa: F401
        except ImportError:
            self.skipTest('DuckDB optional locally; GitHub Python CI installs it')
        self.hour(59)
        self.fetch()
        dest=self.root/'activity'
        result=m.export_parquet(self.minutes,self.hourly,dest,start=EARLY,end=HOUR_LATER,as_of=ASOF)
        self.assertTrue(result['verified'])
        self.assertEqual(result['status_counts']['INFERRED_NO_TRADE'],1)
        with self.assertRaises(FileExistsError):
            m.export_parquet(self.minutes,self.hourly,dest,start=EARLY,end=HOUR_LATER,as_of=ASOF)
        with (dest/'minute_activity.parquet').open('ab') as f:f.write(b'corrupt')
        with self.assertRaises(ValueError):m.verify_parquet(dest)


if __name__=='__main__':unittest.main()
