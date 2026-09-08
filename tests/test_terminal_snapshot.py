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
