"""Optional analytical read-model contracts; runs in CI with duckdb installed."""
import csv
from datetime import date, datetime, timedelta, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from market_data.coinmetrics import write_artifact
from market_data.observation_store import ingest_artifact, query_at_origin
from market_data.warehouse import export_onchain, export_prices, query_onchain, verify_export

HAS_DUCKDB = importlib.util.find_spec('duckdb') is not None


@unittest.skipUnless(HAS_DUCKDB, 'Install optional requirements-warehouse.txt')
class WarehouseTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.root = Path(self.dir.name)
        self.db = self.root / 'market.sqlite'

    def _onchain_artifact(self, name, observed_at, value='100', state='observed'):
        folder = self.root / name
        sample = {'source': 'coinmetrics-community', 'requested_start': '2026-10-10',
                  'requested_end_exclusive': '2026-10-11', 'metrics': ('TxCnt',),
                  'observed_at': observed_at, 'historical_backtest_safe': False,
                  'missing_days': [], 'pages': [], 'rows': [{
                      'date': '2026-10-10', 'metric': 'TxCnt', 'value': value if state == 'observed' else None,
                      'state': state, 'observed_at': observed_at}]}
        write_artifact(sample, folder)
        return folder

    def _price_artifact(self, name, n=400, damaged=None):
        folder = self.root / name
        folder.mkdir()
        start = date(2025, 1, 1)
        path = folder / 'prices.csv'
        with path.open('w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['date', 'Low', 'High', 'Open', 'Close', 'Volume'])
            for i in range(n):
                day = start + timedelta(days=i)
                if damaged == 'gap' and i == 17:
                    day = day + timedelta(days=1)
                writer.writerow([day.isoformat(), 99+i, 110+i, 100+i, 101+i, 10+i])
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        (folder / 'provenance.json').write_text(json.dumps({
            'source': 'coinbase-exchange', 'venue': 'coinbase-exchange', 'instrument': 'BTC/USD',
            'requested_start': start.isoformat(),
            'requested_end_exclusive': datetime.combine(start + timedelta(days=n), datetime.min.time(), timezone.utc).isoformat(),
            'fetched_at': '2026-10-11T12:00:00+00:00',
            'data_sha256': digest}), encoding='utf-8')
        return folder

    def test_onchain_roundtrip_preserves_revisions_and_as_of_contract(self):
        a = self._onchain_artifact('early', '2026-10-11T02:00:00+00:00', '100')
        b = self._onchain_artifact('later', '2026-10-11T18:00:00+00:00', '105')
        ingest_artifact(a, self.db)
        ingest_artifact(b, self.db)
        out = self.root / 'warehouse_onchain'
        exported = export_onchain(self.db, out)
        self.assertEqual(exported['rows'], 2)
        self.assertTrue(verify_export(out)['verified'])
        for cutoff in ('2026-10-11T01:00:00Z', '2026-10-11T12:00:00Z', '2026-10-11T19:00:00Z'):
            self.assertEqual(query_onchain(out, 'TxCnt', cutoff), query_at_origin(self.db, 'TxCnt', cutoff))
        self.assertFalse(query_onchain(out, 'TxCnt', '2024-01-01T00:00:00Z')['available'])
        with self.assertRaises(FileExistsError):
            export_onchain(self.db, out)
        with sqlite3.connect(self.db) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM observations').fetchone()[0], 2)

    def test_missingness_is_not_zero_filled(self):
        ingest_artifact(self._onchain_artifact('missing', '2026-10-11T02:00:00+00:00', state='missing_metric'), self.db)
        out = self.root / 'missing_export'
        export_onchain(self.db, out)
        self.assertFalse(query_onchain(out, 'TxCnt', '2026-10-11T09:00:00Z')['available'])
        self.assertEqual(verify_export(out)['rows'], 1)

    def test_tampering_detected(self):
        ingest_artifact(self._onchain_artifact('good', '2026-10-11T02:00:00+00:00'), self.db)
        out = self.root / 'tampered'
        export_onchain(self.db, out)
        p = out / 'observations.parquet'
        with p.open('ab') as f:
            f.write(b'bad')
        with self.assertRaisesRegex(ValueError, 'SHA-256'):
            verify_export(out)
        with self.assertRaisesRegex(ValueError, 'SHA-256'):
            query_onchain(out, 'TxCnt', '2026-10-11T10:00:00Z')

    def test_prices_parquet_is_existing_model_compatible(self):
        from news_pipeline.system_diagnostics import load_close
        from news_pipeline.forecast_model import source_venue, frame_from_close
        folder = self._price_artifact('coinbase')
        out = self.root / 'prices_export'
        exported = export_prices(folder, out)
        self.assertEqual(exported['rows'], 400)
        self.assertEqual(verify_export(out)['rows'], 400)
        path = out / 'prices.parquet'
        self.assertEqual(source_venue(path), 'coinbase-exchange')
        cutoff = '2026-02-06T00:00:00Z'
        close = load_close(path, cutoff)
        self.assertEqual(len(close), 400)
        self.assertEqual(close.iloc[0], 101)
        self.assertEqual(close.iloc[-1], 500)
        frame = frame_from_close(close, 30)
        self.assertIn('return_30d', frame.columns)
        self.assertIn('target_return', frame.columns)
        self.assertFalse(frame.empty)

    def test_price_gaps_and_hash_mismatch_fail_closed(self):
        bad = self._price_artifact('gap', damaged='gap')
        out = self.root / 'should_not_exist'
        with self.assertRaisesRegex(ValueError, 'gaps'):
            export_prices(bad, out)
        self.assertFalse(out.exists())
        good = self._price_artifact('altered')
        (good / 'prices.csv').write_text('tampered')
        with self.assertRaisesRegex(ValueError, 'SHA-256'):
            export_prices(good, out)
        self.assertFalse(out.exists())

    def test_immutable_exports_and_reject_wrong_kind(self):
        prices = self._price_artifact('prices')
        out = self.root / 'parquet'
        export_prices(prices, out)
        with self.assertRaises(FileExistsError):
            export_prices(prices, out)
        with self.assertRaisesRegex(ValueError, 'Expected onchain'):
            query_onchain(out, 'TxCnt', '2026-10-11T12:00:00Z')
        with self.assertRaisesRegex(ValueError, 'Invalid metric'):
            query_onchain(out, "TxCnt'; DROP TABLE observations;--", '2026-10-11T12:00:00Z')


if __name__ == '__main__':
    unittest.main()
