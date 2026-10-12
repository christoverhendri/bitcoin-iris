"""Offline Coinbase HTTP contract and resumable SQLite regression checks."""
import hashlib
import json
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from market_data.hourly_prices import (
    HOUR, API_URL, _validate_candles, backfill, parse_hour, probe, status,
)

NOW = datetime(2026, 10, 12, 12, tzinfo=timezone.utc)
START = datetime(2026, 10, 10, tzinfo=timezone.utc)


def bar(dt, *, close=100.0):
    return [int(dt.timestamp()), close - 2, close + 2, close - 1, close, 4.5]


class FakeResponse:
    def __init__(self, rows, code=200, headers=None):
        self.status_code = code
        self.headers = {'Content-Type': 'application/json', **(headers or {})}
        self.data = json.dumps(rows).encode('utf-8')

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def iter_content(self, chunk_size):
        for i in range(0, len(self.data), chunk_size):
            yield self.data[i:i + chunk_size]


class FakeGet:
    def __init__(self):
        self.calls = []
        self.adjust = {}
        self.drop = set()
        self.retry = []

    def __call__(self, url, *, params, **options):
        assert url == API_URL
        assert options['allow_redirects'] is False
        assert options['stream'] is True
        self.calls.append((url, params))
        if self.retry:
            return FakeResponse([], code=self.retry.pop(0), headers={'Retry-After': '0'})
        start, end = parse_hour(params['start']), parse_hour(params['end'])
        rows = []
        for i in range(int((end-start).total_seconds() / HOUR)):
            dt = start + timedelta(hours=i)
            if dt in self.drop:
                continue
            rows.append(bar(dt, close=self.adjust.get(dt, 100 + i)))
        # Returning the left boundary repeatedly is legal only when identical.
        return FakeResponse(list(reversed(rows)))


class HourlyPricesTest(unittest.TestCase):
    def test_probe_accepts_only_aligned_completed_hours(self):
        get = FakeGet()
        result = probe('2026-10-10T00:00:00Z', '2026-10-10T03:00:00Z', get=get, now=NOW)
        self.assertEqual(result['received_hours'], 3)
        self.assertEqual(result['granularity_seconds'], 3600)
        self.assertEqual(len(get.calls), 1)
        self.assertEqual(get.calls[0][1]['granularity'], 3600)
        with self.assertRaises(ValueError):
            probe('2026-10-10T00:00:00Z', '2026-10-10T01:30:00Z', get=get, now=NOW)
        with self.assertRaises(ValueError):
            probe('2026-10-12T11:00:00Z', '2026-10-12T13:00:00Z', get=get, now=NOW)

    def test_gaps_explicit_and_source_duplicates_rejected(self):
        first = START
        values = [bar(first), bar(first + timedelta(hours=2))]
        out = _validate_candles(values, first, first+timedelta(hours=3))
        self.assertEqual(len(out), 2)  # gap not filled
        with self.assertRaisesRegex(ValueError, 'Conflicting duplicate'):
            _validate_candles([bar(first), bar(first,close=99)], first, first+timedelta(hours=3))
        with self.assertRaisesRegex(ValueError, 'envelope'):
            _validate_candles([[int(first.timestamp()), 110, 120, 100, 101, 1]], first, first+timedelta(hours=3))
        self.assertEqual(_validate_candles([bar(first-timedelta(hours=1)),bar(first)],first,first+timedelta(hours=1))[0][0],int(first.timestamp()))

    def test_resume_idempotency_and_latest_revision(self):
        with tempfile.TemporaryDirectory() as folder:
            database=Path(folder)/'hourly.sqlite'
            get=FakeGet()
            common={'database': database, 'start': '2026-10-10T00:00:00Z',
                'end':'2026-10-10T06:00:00Z','page_hours':3,'get':get,'now':NOW,
                'sleep':lambda _:None, 'recheck_hours':0}
            partial=backfill(max_pages=1,**common)
            self.assertFalse(partial['all_windows_visited'])
            self.assertEqual(partial['next_start'],'2026-10-10T03:00:00Z')
            final=backfill(max_pages=1,**common)
            self.assertTrue(final['all_windows_visited'])
            self.assertEqual(final['skipped_pages'],1)
            self.assertEqual(status(database)['unique_hours'],6)
            self.assertEqual(backfill(max_pages=2,**common)['fetched_pages'],0)
            # Two new versions at the same candle timestamp must be traceable.
            target=START+timedelta(hours=5)
            get.adjust[target]=300
            revision=backfill(max_pages=2,**{**common,'recheck_hours':3,
               'now': NOW+timedelta(seconds=2)})
            self.assertEqual(revision['new_candle_versions'],1)
            self.assertEqual(status(database)['revised_hours'],1)
            # Vendor reverts to the earlier candle; last_seen must restore it.
            del get.adjust[target]
            backfill(max_pages=2,**{**common,'recheck_hours':3,
                 'now': NOW+timedelta(seconds=4)})
            with sqlite3.connect(database) as db:
                latest=db.execute('''SELECT close FROM hourly_candles WHERE ts=? ORDER BY last_seen_at DESC LIMIT 1''',
                    (int(target.timestamp()),)).fetchone()[0]
            self.assertEqual(latest,102)  # index 2 within second 3-hour window
            self.assertEqual(status(database)['versions'],7)

    def test_missing_hours_do_not_become_zeros(self):
        with tempfile.TemporaryDirectory() as folder:
            get=FakeGet();get.drop.add(START+timedelta(hours=2))
            db=Path(folder)/'prices.sqlite'
            report=backfill(db,start='2026-10-10T00:00:00Z',end='2026-10-10T04:00:00Z',
                page_hours=4,get=get,now=NOW,sleep=lambda _:None)
            self.assertEqual(report['missing_slots_in_fetched_windows'],1)
            self.assertEqual(status(db)['unique_hours'],3)
            with sqlite3.connect(db) as con:
                self.assertEqual(con.execute('SELECT count(*) FROM hourly_candles WHERE close=0').fetchone()[0],0)

    def test_invalid_payload_does_not_checkpoint(self):
        with tempfile.TemporaryDirectory() as folder:
            db=Path(folder)/'hourly.sqlite'
            def bad(*args,**kwargs):
                return FakeResponse([[int(START.timestamp()), float('nan'), 101, 99, 100, 1]])
            with self.assertRaises(ValueError):
                backfill(db,start='2026-10-10T00:00:00Z',end='2026-10-10T01:00:00Z',
                    get=bad,now=NOW,sleep=lambda _:None)
            self.assertEqual(status(db)['fetched_windows'],0)
            self.assertEqual(status(db)['versions'],0)

    def test_retry_429_then_success(self):
        get=FakeGet();get.retry=[429]
        report=probe('2026-10-10T00:00:00Z','2026-10-10T02:00:00Z',get=get,
                     sleep=lambda _:None,now=NOW)
        self.assertEqual(report['received_hours'],2)
        self.assertEqual(len(get.calls),2)


if __name__ == '__main__':
    unittest.main()
