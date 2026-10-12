"""Actual DuckDB/Parquet round trips; runs in GitHub CI with optional dependency."""
import csv
import importlib.util
import json
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from test_hourly_prices import FakeGet, NOW, START
from market_data.hourly_prices import (
    backfill, export_hourly, export_daily, verify_hourly,
)

DUCKDB_AVAILABLE = importlib.util.find_spec('duckdb') is not None


@unittest.skipUnless(DUCKDB_AVAILABLE, 'Optional DuckDB unavailable in local environment')
class HourlyWarehouseTest(unittest.TestCase):
    def test_full_hourly_parquet_to_complete_daily_research_input(self):
        from market_data.warehouse import export_prices, verify_export
        from market_data.quality import prices_report
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            db = root / 'canonical.sqlite'
            get = FakeGet()
            result = backfill(db, start='2026-10-10T00:00:00Z', end='2026-10-12T00:00:00Z',
                             page_hours=24,max_pages=3,get=get,now=NOW,sleep=lambda _:None)
            self.assertTrue(result['all_windows_visited'])
            self.assertEqual(result['new_candle_versions'],48)
            warehouse=root/'hourly'
            exported=export_hourly(db,warehouse,start='2026-10-10T00:00:00Z',end='2026-10-12T00:00:00Z')
            self.assertEqual(exported['quality_gate'],'pass')
            self.assertEqual(exported['coverage_pct'],100)
            verified=verify_hourly(warehouse)
            self.assertEqual(verified['observed_hours'],48)
            self.assertEqual(verify_export(warehouse)['kind'],'prices_hourly')
            daily=root/'derived_daily'
            outcome=export_daily(warehouse,daily,start='2026-10-10T00:00:00Z',end='2026-10-12T00:00:00Z')
            self.assertEqual(outcome['daily_bars'],2)
            with (daily/'prices.csv').open() as f:
                values=list(csv.DictReader(f))
            self.assertEqual([v['date'] for v in values],['2026-10-10','2026-10-11'])
            self.assertEqual(float(values[0]['Volume']),24*4.5)
            self.assertIn('source_hourly_sha256',json.loads((daily/'provenance.json').read_text()))
            p=export_prices(daily,root/'daily_parquet')
            self.assertEqual(p['rows'],2)
            self.assertEqual(prices_report(root/'daily_parquet', as_of='2026-10-13T00:00:00Z')['quality_gate'],'pass')
            with self.assertRaises(FileExistsError):
                export_hourly(db,warehouse,start='2026-10-10T00:00:00Z',end='2026-10-12T00:00:00Z')
            with self.assertRaises(ValueError):
                # The stored data can never include an unfinished last hour.
                export_hourly(db,root/'illegal',start='2026-10-12T00:00:00Z',end='2090-01-01T00:00:00Z')

    def test_gap_fails_quality_and_strict_daily_materialization(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);db=root/'db.sqlite'
            get=FakeGet();get.drop.add(START+timedelta(hours=4))
            backfill(db,start='2026-10-10T00:00:00Z',end='2026-10-11T00:00:00Z',
                page_hours=24,get=get,now=NOW,sleep=lambda _:None)
            export_hourly(db,root/'hourly',start='2026-10-10T00:00:00Z',end='2026-10-11T00:00:00Z')
            status=verify_hourly(root/'hourly')
            self.assertEqual(status['quality_gate'],'fail')
            self.assertEqual(status['missing_hours'],1)
            with self.assertRaisesRegex(ValueError,'Missing hourly bars'):
                export_daily(root/'hourly',root/'daily',start='2026-10-10T00:00:00Z',end='2026-10-11T00:00:00Z')
            with (root/'hourly'/'hourly.parquet').open('ab') as f:
                f.write(b'corrupt')
            with self.assertRaisesRegex(ValueError,'SHA-256'):
                verify_hourly(root/'hourly')

    def test_verified_parquet_selects_latest_reobserved_version(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);db=root/'db.sqlite';get=FakeGet()
            span={'start':'2026-10-10T00:00:00Z','end':'2026-10-10T03:00:00Z',
                'get':get,'sleep':lambda _:None,'page_hours':3,'recheck_hours':3}
            backfill(db,now=NOW,**span)
            revised=START+timedelta(hours=2)
            get.adjust[revised]=333
            backfill(db,now=NOW+timedelta(seconds=5),**span)
            get.adjust.pop(revised)
            backfill(db,now=NOW+timedelta(seconds=10),**span)
            export_hourly(db,root/'hourly',start=span['start'],end=span['end'])
            import duckdb
            with duckdb.connect(':memory:') as c:
                value=c.execute('SELECT Close FROM read_parquet(?) WHERE ts=?',
                    [str(root/'hourly'/'hourly.parquet'),int(revised.timestamp())]).fetchone()[0]
            self.assertEqual(value,102)
            with sqlite3.connect(db) as c:
                self.assertEqual(c.execute('SELECT count(*) FROM hourly_candles WHERE ts=?',
                   (int(revised.timestamp()),)).fetchone()[0],2)


if __name__ == '__main__':
    unittest.main()
