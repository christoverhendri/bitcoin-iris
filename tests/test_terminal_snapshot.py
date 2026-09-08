import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
from news_pipeline.core import now
from news_pipeline.terminal_snapshot import publish


class TerminalSnapshotTests(unittest.TestCase):
    def test_history_merge_edits_and_invalid_records(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'snapshot.json'
            post = {'source_id': '1', 'raw_text': 'JUST IN: Bitcoin rally @WatcherGuru', 'published_at': now()}
            self.assertEqual(publish(output, [post]), 1)
            previous = json.loads(output.read_text(encoding='utf-8'))
            incoming = [{**post, 'raw_text': 'Bitcoin crash'}, {**post, 'source_id': '../bad'},
                        {**post, 'source_id': '2', 'published_at': None}]
            self.assertEqual(publish(output, incoming, previous), 1)
            self.assertEqual(json.loads(output.read_text(encoding='utf-8'))['records'][0]['raw_text'], 'Bitcoin crash')
            self.assertFalse(output.with_suffix('.tmp').exists())

    def test_semantics_preserve_original_evidence_and_negation(self):
        raw = 'JUST IN: 🇺🇸 SEC has not approved Bitcoin ETF.\n@WatcherGuru'
        with tempfile.TemporaryDirectory() as directory, patch('news_pipeline.terminal_snapshot.now', return_value='2026-09-07T00:00:00+00:00'):
            output = Path(directory) / 'snapshot.json'
            post = {'source_id': '1', 'raw_text': raw, 'published_at': '2026-09-07T00:00:00+00:00',
                    'semantic_parse': {'forged': True}, 'observed_at': '2026-09-07T00:00:00+00:00'}
            publish(output, [post])
            snapshot = json.loads(output.read_text(encoding='utf-8'))
            self.assertEqual(snapshot['version'], 2)
            record = snapshot['records'][0]
            self.assertEqual(record['raw_text'], raw)
            self.assertEqual(record['observed_at'], post['observed_at'])
            event = record['semantic_parse']['events'][0]
            self.assertEqual(event['polarity'], 'negated')
            self.assertTrue(record['semantic_parse']['needs_review'])
            self.assertEqual(raw[event['trigger']['start']:event['trigger']['end']], 'approved')
            self.assertEqual(record['weighting']['post_weight'], 0.5)

    def test_weights_use_shared_freshness_and_duplicate_rules(self):
        with tempfile.TemporaryDirectory() as directory, patch('news_pipeline.terminal_snapshot.now', return_value='2026-09-08T00:00:00+00:00'):
            output = Path(directory) / 'snapshot.json'
            publish(output, [
                {'source_id': '1', 'raw_text': 'Bitcoin rises.', 'published_at': '2026-09-07T00:00:00+00:00'},
                {'source_id': '2', 'raw_text': 'Bitcoin rises.', 'published_at': '2026-09-08T00:00:00+00:00'},
            ])
            records = {r['source_id']: r for r in json.loads(output.read_text(encoding='utf-8'))['records']}
            self.assertEqual(records['1']['weighting']['post_weight'], 0.5)
            self.assertEqual(records['2']['weighting']['post_weight'], 0)

    def test_bad_or_oversized_records_do_not_drop_valid_news(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'snapshot.json'
            valid = {'source_id': '1', 'raw_text': 'Bitcoin rises.', 'published_at': now()}
            self.assertEqual(publish(output, [None, [], valid, {**valid, 'source_id': '0'},
                                              {**valid, 'source_id': '2', 'raw_text': 'x' * 16001}]), 1)

    def test_terminal_fixture_matches_current_python_contract(self):
        fixture_path = Path(__file__).resolve().parents[1] / 'terminal/src/lib/sources/fixtures/semantic-news.json'
        fixture = json.loads(fixture_path.read_text(encoding='utf-8'))
        with tempfile.TemporaryDirectory() as directory, patch('news_pipeline.terminal_snapshot.now', return_value=fixture['generated_at']):
            output = Path(directory) / 'snapshot.json'
            publish(output, fixture['records'])
            self.assertEqual(json.loads(output.read_text(encoding='utf-8')), fixture)


class CanonicalSnapshotTests(unittest.TestCase):
    def test_failed_fetch_republish_does_not_advance_freshness(self):
        from datetime import datetime, timedelta, timezone
        from news_pipeline.collector import collect
        from news_pipeline.storage import process_pending
        from news_pipeline.terminal_snapshot import publish_database
        from test_data_pipeline import page
        at = datetime(2026, 9, 5, 12, tzinfo=timezone.utc)
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / 'canonical.sqlite'
            output = Path(directory) / 'snapshot.json'
            with patch('news_pipeline.collector.utcnow', return_value=at):
                collect(database, fetcher=lambda _: page([10]))
            process_pending(database)
            with patch('news_pipeline.terminal_snapshot.now', return_value=at.isoformat()):
                publish_database(database, output)
            initial = json.loads(output.read_text())
            later = at + timedelta(hours=1)
            with patch('news_pipeline.collector.utcnow', return_value=later):
                with self.assertRaises(RuntimeError):
                    collect(database, fetcher=lambda _: (_ for _ in ()).throw(RuntimeError('offline')))
            with patch('news_pipeline.terminal_snapshot.now', return_value=later.isoformat()):
                publish_database(database, output)
            failed = json.loads(output.read_text())
            self.assertEqual(failed['fetched_at'], initial['fetched_at'])
            self.assertNotEqual(failed['generated_at'], initial['generated_at'])
            self.assertEqual(failed['source_health']['status'], 'failed')
            self.assertEqual(len(failed['records']), 1)
            self.assertEqual(failed['origin'], 'durable_store')
            self.assertIn('feature_ready_at', failed['records'][0])

    def test_live_commands_publish_failed_health_without_advancing_success(self):
        from datetime import datetime, timezone
        from news_pipeline.collector import collect
        from news_pipeline.storage import process_pending
        from news_pipeline.terminal_snapshot import main as snapshot_main
        from news_pipeline.__main__ import main as data_main
        from test_data_pipeline import page
        at = datetime(2026, 9, 5, 12, tzinfo=timezone.utc)
        for command in ('snapshot', 'data'):
            with self.subTest(command=command), tempfile.TemporaryDirectory() as directory:
                database = Path(directory) / 'canonical.sqlite'
                output = Path(directory) / 'snapshot.json'
                with patch('news_pipeline.collector.utcnow', return_value=at):
                    collect(database, fetcher=lambda _: page([10]))
                process_pending(database)
                argv = (['snapshot', '--live', '--database', str(database), '--output', str(output)]
                        if command == 'snapshot' else
                        ['news_pipeline', 'data', 'run', '--database', str(database), '--snapshot-output', str(output)])
                with patch('sys.argv', argv), patch('news_pipeline.collector._collect', side_effect=RuntimeError('offline')):
                    with self.assertRaisesRegex(RuntimeError, 'offline'):
                        (snapshot_main if command == 'snapshot' else data_main)()
                result = json.loads(output.read_text())
                self.assertEqual(result['fetched_at'], at.isoformat())
                self.assertEqual(result['source_health']['status'], 'failed')

    def test_projection_cannot_overwrite_canonical_database(self):
        from news_pipeline.storage import connect
        from news_pipeline.terminal_snapshot import publish_database
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / 'canonical.sqlite'
            with connect(database):
                pass
            original = database.read_bytes()
            with self.assertRaisesRegex(ValueError, 'must not overwrite'):
                publish_database(database, database)
            self.assertEqual(database.read_bytes(), original)

    def test_watch_continues_after_projection_failure(self):
        from news_pipeline.__main__ import main
        with patch('sys.argv', ['news_pipeline', 'data', 'run', '--watch']), \
                patch('news_pipeline.collector.collect', return_value={}), \
                patch('news_pipeline.storage.process_pending', return_value={}), \
                patch('news_pipeline.terminal_snapshot.publish_database', side_effect=OSError('unwritable')), \
                patch('news_pipeline.__main__.logging.exception') as logged, \
                patch('news_pipeline.__main__.print'), \
                patch('news_pipeline.__main__.time.sleep', side_effect=KeyboardInterrupt) as sleep:
            with self.assertRaises(KeyboardInterrupt):
                main()
            sleep.assert_called_once_with(60)
            logged.assert_called_once()

    def test_projection_does_not_resurrect_superseded_unprocessed_version(self):
        from news_pipeline.storage import connect, save_record, process_pending
        from news_pipeline.terminal_snapshot import publish_database
        from test_data_pipeline import NOW, record
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / 'canonical.sqlite'
            output = Path(directory) / 'snapshot.json'
            with connect(database) as db, db:
                save_record(db, record(), NOW)
            process_pending(database)
            with patch('news_pipeline.terminal_snapshot.now', return_value=NOW.isoformat()):
                self.assertEqual(publish_database(database, output), 1)
                with connect(database) as db, db:
                    save_record(db, record(text='Bitcoin falls.'), NOW)
                self.assertEqual(publish_database(database, output), 0)
                process_pending(database)
                self.assertEqual(publish_database(database, output), 1)
                self.assertEqual(json.loads(output.read_text())['records'][0]['raw_text'], 'Bitcoin falls.')
