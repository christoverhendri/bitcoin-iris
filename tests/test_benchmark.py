"""DuckDB is optional locally; CI installs it and runs these integration tests."""
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from market_data.coinmetrics import write_artifact
from market_data.observation_store import ingest_artifact
from market_data.warehouse import export_onchain
from market_data.benchmark import benchmark_onchain

HAS_DUCKDB = importlib.util.find_spec('duckdb') is not None


@unittest.skipUnless(HAS_DUCKDB, 'Install optional requirements-warehouse.txt')
class BenchmarkTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        folder = self.root / 'source'
        write_artifact({'source': 'coinmetrics-community',
            'requested_start': '2026-10-10', 'requested_end_exclusive': '2026-10-11',
            'metrics': ('TxCnt',), 'observed_at': '2026-10-11T12:00:00+00:00',
            'historical_backtest_safe': False, 'missing_days': [], 'pages': [],
            'rows': [{'date':'2026-10-10', 'metric':'TxCnt', 'value':'100.25',
                      'state':'observed', 'observed_at':'2026-10-11T12:00:00+00:00'}]},folder)
        self.db=self.root/'observations.sqlite'
        ingest_artifact(folder,self.db)
        self.parquet=self.root/'warehouse'
        export_onchain(self.db,self.parquet)

    def test_parity_and_report_is_not_fictitious_speed_claim(self):
        result=benchmark_onchain(self.db,self.parquet,'TxCnt','2026-10-12T00:00:00Z',repeats=3)
        self.assertTrue(result['read_parity_verified'])
        self.assertEqual(result['rows_at_origin'],1)
        self.assertEqual(result['latest_at_origin']['value'],'100.25')
        self.assertGreater(result['disk']['parquet_bytes'],0)
        self.assertIn('point_lookup',result['timings_ms'])
        self.assertNotIn('winner',result)
        self.assertEqual(result['timings_ms']['point_lookup']['sqlite']['iterations'],3)

    def test_refuse_to_time_different_datasets(self):
        with sqlite3.connect(self.db) as db:
            db.execute("UPDATE observations SET value='999.5'")
        with self.assertRaisesRegex(ValueError,'disagreement'):
            benchmark_onchain(self.db,self.parquet,'TxCnt','2026-10-12T00:00:00Z',repeats=3)

    def test_no_query_future_observation(self):
        result=benchmark_onchain(self.db,self.parquet,'TxCnt','2026-10-11T02:00:00Z',repeats=3)
        self.assertEqual(result['rows_at_origin'],0)
        self.assertIsNone(result['latest_at_origin'])


if __name__ == '__main__':
    unittest.main()
