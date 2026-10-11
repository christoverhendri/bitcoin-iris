"""Regression: insertion order and processing order are not event-time order."""
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from news_pipeline.exports import export_data
from news_pipeline.storage import connect, process_pending, save_record

BASE = datetime(2026, 9, 5, 12, tzinfo=timezone.utc)


def post(text, publication='2026-09-05T08:00:00Z'):
    return {'source': 'watcher_guru', 'source_id': '17', 'raw_text': text, 'published_at': publication}


class ExportOrderingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.db = self.root / 'news.sqlite'

    def export(self, name, at, mode='ready', daily=False):
        output = self.root / name
        result = export_data(self.db, output, at.isoformat(), daily=daily, time_basis=mode)
        if not daily:
            return [json.loads(s) for s in output.read_text(encoding='utf-8').splitlines()]
        return output.read_text(encoding='utf-8'), result

    def test_newer_observed_version_wins_even_if_inserted_first(self):
        with connect(self.db) as db, db:
            # Backfills or out-of-order imports can place newer versions at lower ids.
            self.assertEqual(save_record(db, post('Bitcoin rises.'), BASE - timedelta(minutes=1)), 'inserted')
            self.assertEqual(save_record(db, post('Bitcoin falls.'), BASE - timedelta(minutes=10)), 'inserted')
        with patch('news_pipeline.storage.utcnow', return_value=BASE):
            self.assertEqual(process_pending(self.db)['processed'], 2)
        rows = self.export('articles.jsonl', BASE + timedelta(minutes=1))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['raw_text'], 'Bitcoin rises.')
        daily, _ = self.export('daily.csv', BASE + timedelta(minutes=1), daily=True)
        self.assertIn(',1,1,', daily)

    def test_publication_mode_uses_publication_time_not_insert_order(self):
        with connect(self.db) as db, db:
            save_record(db, post('Bitcoin rises.', '2026-09-05T10:00:00Z'), BASE)
            save_record(db, post('Bitcoin falls.', '2026-09-05T09:00:00Z'), BASE)
        with patch('news_pipeline.storage.utcnow', return_value=BASE):
            process_pending(self.db)
        rows = self.export('retrospective.jsonl', BASE, mode='publication')
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['raw_text'], 'Bitcoin rises.')
        self.assertTrue(rows[0]['export']['retrospective'])

    def test_not_ready_at_cutoff_is_excluded(self):
        with connect(self.db) as db, db:
            save_record(db, post('Bitcoin rises.'), BASE - timedelta(minutes=3))
        with patch('news_pipeline.storage.utcnow', return_value=BASE + timedelta(minutes=10)):
            process_pending(self.db)
        self.assertEqual(self.export('early.jsonl', BASE + timedelta(minutes=9)), [])
        self.assertEqual(len(self.export('later.jsonl', BASE + timedelta(minutes=11))), 1)

    def test_earlier_processed_version_cannot_supersede_newer_observation(self):
        # A previously observed version is temporarily failing to parse; it is
        # processed only after a newer version. The older version must not win.
        with connect(self.db) as db, db:
            save_record(db, post('Bitcoin rises.'), BASE - timedelta(minutes=10))
            save_record(db, post('Bitcoin falls.'), BASE - timedelta(minutes=1))
        from news_pipeline import storage
        original_parser = storage.parse_news
        with patch('news_pipeline.storage.parse_news', side_effect=lambda txt: (
                (_ for _ in ()).throw(ValueError('temporarily unavailable'))
                if txt == 'Bitcoin rises.' else original_parser(txt))):
            with patch('news_pipeline.storage.utcnow', return_value=BASE):
                self.assertEqual(process_pending(self.db)['processed'], 1)
        with patch('news_pipeline.storage.utcnow', return_value=BASE + timedelta(minutes=5)):
            self.assertEqual(process_pending(self.db, retry=True)['processed'], 1)
        rows = self.export('post_recovery.jsonl', BASE + timedelta(minutes=6))
        self.assertEqual(rows[0]['raw_text'], 'Bitcoin falls.')


if __name__ == '__main__':
    unittest.main()
