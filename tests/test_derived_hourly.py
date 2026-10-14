import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from contextlib import closing
from market_data.minute_activity import _schema as minute_schema
from market_data.hourly_prices import _schema as hourly_schema
from market_data.derived_hourly import build


class DerivedHourlyTests(unittest.TestCase):
    def test_complete_only_versioned_lineage_and_preserved_original(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); minute=root/'minutes.sqlite'; hourly=root/'hourly.sqlite'; output=root/'derived.sqlite'
            start=1767225600
            with closing(sqlite3.connect(minute)) as db, db:
                minute_schema(db)
                for i in range(119):
                    ts=start+i*60;values=[100.0,102.0,101.0,101.5,1.0]
                    sha=hashlib.sha256(json.dumps([ts,*values],separators=(',',':')).encode()).hexdigest()
                    db.execute('INSERT INTO minute_candles VALUES (?,?,?,?,?,?,?)',(ts,sha,*values))
                    db.execute('INSERT INTO minute_seen VALUES (?,?,?)',(ts,sha,'2026-01-02T00:00:00.000000Z'))
            with closing(sqlite3.connect(hourly)) as db, db:
                hourly_schema(db)
                db.execute('INSERT INTO hourly_candles VALUES (?,?,?,?,?,?,?,?,?)',(start,'a'*64,'2026-01-02T00:00:00Z','2026-01-02T00:00:00Z',100,102,101,101.5,58))
            original_bytes=hourly.read_bytes()
            result=build(minute,hourly,output,start='2026-01-01T00:00:00Z',end='2026-01-01T03:00:00Z',as_of='2026-01-03T00:00:00Z')
            self.assertEqual(result['counts'],{'COMPLETE':1,'PARTIAL':1,'NO_DATA':1,'mismatched_complete_hours':1})
            self.assertEqual(hourly.read_bytes(),original_bytes)
            with closing(sqlite3.connect(output)) as db:
                self.assertEqual(db.execute('SELECT volume FROM hourly_candles').fetchall(),[(60.0,)])
                self.assertEqual(db.execute('SELECT status,minute_count,missing_minutes FROM hourly_quality ORDER BY ts').fetchall(),[('COMPLETE',60,0),('PARTIAL',59,1),('NO_DATA',0,60)])
                metadata=dict(db.execute('SELECT key,value FROM store_identity'))
                self.assertEqual(metadata['dataset_version'],result['dataset_version'])
                self.assertEqual(metadata['aggregation_policy'],'60_observed_minutes_only')
            with self.assertRaises(FileExistsError):
                build(minute,hourly,output,start='2026-01-01T00:00:00Z',end='2026-01-01T03:00:00Z')
            with self.assertRaises(ValueError):
                build(minute,hourly,hourly,start='2026-01-01T00:00:00Z',end='2026-01-01T03:00:00Z')
            before=root/'before.sqlite'
            early=build(minute,hourly,before,start='2026-01-01T00:00:00Z',end='2026-01-01T03:00:00Z',as_of='2026-01-01T04:00:00Z')
            self.assertEqual(early['counts']['COMPLETE'],0)
            self.assertEqual(early['counts']['NO_DATA'],3)

if __name__=='__main__': unittest.main()
