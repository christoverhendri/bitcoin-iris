"""Point-in-time durability checks: no fabricated history, silent fills, or overwrites."""
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from market_data.coinmetrics import write_artifact
from market_data.observation_store import ingest_artifact, query_at_origin, quality_status


class ObservationStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.db = self.root / 'observations.sqlite'

    def artifact(self, folder, value='100', at='2026-10-11T02:00:00+00:00', state='observed'):
        rows = [{'date': '2026-10-10', 'metric': 'TxCnt', 'value': value if state == 'observed' else None,
                 'state': state, 'observed_at': at}]
        result = {'rows': rows, 'source': 'coinmetrics-community', 'requested_start': '2026-10-10',
                  'requested_end_exclusive': '2026-10-11', 'metrics': ('TxCnt',),
                  'observed_at': at, 'missing_days': [], 'pages': [], 'historical_backtest_safe': False}
        write_artifact(result, folder)
        return folder

    def test_import_idempotence_revision_as_of_and_status(self):
        first = self.artifact(self.root / 'first')
        second = self.artifact(self.root / 'second', '101', '2026-10-11T18:00:00+00:00')
        self.assertEqual(ingest_artifact(first, self.db)['inserted'], 1)
        self.assertEqual(ingest_artifact(first, self.db)['inserted'], 0)
        self.assertEqual(ingest_artifact(second, self.db)['inserted'], 1)
        self.assertEqual(query_at_origin(self.db, 'TxCnt', '2026-10-11T12:00:00Z')['value'], '100')
        self.assertEqual(query_at_origin(self.db, 'TxCnt', '2026-10-11T19:00:00Z')['value'], '101')
        status = quality_status(self.db)
        self.assertEqual(status['snapshot_count'], 2)
        self.assertEqual(status['row_states'], {'observed': 2})
        self.assertFalse(status['historical_backtest_safe'])

    def test_retrospective_data_cannot_time_travel(self):
        first = self.artifact(self.root / 'first')
        ingest_artifact(first, self.db)
        old = query_at_origin(self.db, 'TxCnt', '2024-01-02T12:00:00Z')
        self.assertFalse(old['available'])
        self.assertEqual(old['reason'], 'not_observed_at_origin')
        prefetch = query_at_origin(self.db, 'TxCnt', '2026-10-11T01:00:00Z')
        self.assertFalse(prefetch['available'])

    def test_missing_data_remains_missing(self):
        folder = self.artifact(self.root / 'missing', value=None, state='missing_metric')
        ingest_artifact(folder, self.db)
        self.assertEqual(quality_status(self.db)['row_states'], {'missing_metric': 1})
        self.assertFalse(query_at_origin(self.db, 'TxCnt', '2026-10-11T12:00:00Z')['available'])

    def test_tampering_with_csv_rejected(self):
        folder = self.artifact(self.root / 'first')
        p = folder / 'onchain_daily.csv'
        p.write_bytes(p.read_bytes().replace(b'100', b'999'))
        with self.assertRaisesRegex(ValueError, 'SHA-256'):
            ingest_artifact(folder, self.db)

    def test_bad_state_rolls_back_all_rows(self):
        folder = self.artifact(self.root / 'first', value='nan')
        with self.assertRaisesRegex(ValueError, 'Nonfinite'):
            ingest_artifact(folder, self.db)
        self.assertEqual(quality_status(self.db)['row_states'], {})
        self.assertEqual(quality_status(self.db)['snapshot_count'], 0)

    def test_same_timestamp_conflicting_revision_rejected(self):
        a = self.artifact(self.root / 'a', '100')
        b = self.artifact(self.root / 'b', '101')
        ingest_artifact(a, self.db)
        with self.assertRaisesRegex(ValueError, 'Conflicting'):
            ingest_artifact(b, self.db)
        self.assertEqual(quality_status(self.db)['row_states'], {'observed': 1})

    def test_missing_database_never_created_by_status(self):
        with self.assertRaises(FileNotFoundError):
            quality_status(self.db)
        with self.assertRaises(FileNotFoundError):
            query_at_origin(self.db, 'TxCnt', '2026-10-11T12:00:00Z')
        self.assertFalse(self.db.exists())

    def test_source_manifest_cannot_claim_historical_safety(self):
        folder = self.artifact(self.root / 'first')
        path = folder / 'provenance.json'
        manifest = json.loads(path.read_text())
        manifest['historical_backtest_safe'] = True
        path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, 'Historical availability'):
            ingest_artifact(folder, self.db)


if __name__ == '__main__':
    unittest.main()
