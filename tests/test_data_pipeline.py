import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from news_pipeline.collector import collect, fetch_page, page_records
from news_pipeline.exports import export_data, safe_csv_text
from news_pipeline.parser import parse_news
from news_pipeline.storage import connect, import_jsonl, process_pending, save_record, status, writer_lock
from news_pipeline.weighting import weight_post

NOW = datetime(2026, 9, 5, 12, tzinfo=timezone.utc)


def record(source_id='1', text='Bitcoin rises.', published='2026-09-05T10:00:00+00:00'):
    return {'source': 'watcher_guru', 'source_id': source_id, 'raw_text': text, 'published_at': published}


def page(ids):
    return ''.join(f'<div class="tgme_widget_message" data-post="WatcherGuru/{i}"><div class="tgme_widget_message_text">Bitcoin rises {i}</div><time datetime="2026-09-05T10:00:00Z"></time></div>' for i in ids)


class DataTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.db = self.root / 'data.sqlite'

    def test_raw_survives_processing_failure_and_restart(self):
        with connect(self.db) as db, db:
            save_record(db, record(), NOW)
        with patch('news_pipeline.storage.parse_news', side_effect=RuntimeError('simulated parser failure')):
            self.assertEqual(process_pending(self.db)['failed'], 1)
        self.assertEqual(status(self.db)['raw'], {'failed': 1})
        self.assertEqual(process_pending(self.db)['processed'], 0)
        self.assertEqual(process_pending(self.db, retry=True)['processed'], 1)
        self.assertEqual(process_pending(self.db)['processed'], 0)

    def test_quarantine_and_duplicate_flood(self):
        bad = [record("1'; DROP TABLE raw_posts;--"), record(text='x' * 16001),
               record(published='2099-01-01T00:00:00Z'), record(text='evil\x00text'),
               record(text='evil\u202etext'), record(published='yesterday'), {'raw_text': 'missing'}]
        with connect(self.db) as db, db:
            for r in bad:
                self.assertEqual(save_record(db, r, NOW), 'quarantined')
            self.assertEqual(save_record(db, record(), NOW), 'inserted')
            for _ in range(100):
                self.assertEqual(save_record(db, record(), NOW), 'duplicate')
        self.assertEqual(status(self.db)['raw'], {'pending': 1})
        self.assertEqual(status(self.db)['quarantine'], 7)

    def test_poisoned_metadata_not_used(self):
        poisoned = {**record(), 'url': 'http://127.0.0.1/admin', 'post_weight': 1e100,
                    'semantic_parse': {'needs_review': False}, 'observed_at': '1900-01-01T00:00:00Z'}
        with connect(self.db) as db, db:
            save_record(db, poisoned, NOW)
        process_pending(self.db)
        with connect(self.db) as db:
            out = json.loads(db.execute('SELECT payload FROM parsed_posts').fetchone()[0])
        self.assertEqual(out['url'], 'https://t.me/WatcherGuru/1')
        self.assertEqual(out['observed_at'], NOW.isoformat())
        self.assertLessEqual(out['weighting']['post_weight'], 1)

    def test_import_bad_line_and_oversize_does_not_abort(self):
        path = self.root / 'input.jsonl'
        path.write_bytes(b'{invalid}\n' + b'x' * 300000 + b'\n' + json.dumps(record()).encode() + b'\nNaN\n')
        out = import_jsonl(path, self.db)
        self.assertEqual(out, {'inserted': 1, 'duplicate': 0, 'quarantined': 3})
        self.assertEqual(import_jsonl(path, self.db)['duplicate'], 1)

    def test_catchup_resumes_between_pages(self):
        collect(self.db, fetcher=lambda before: page([10, 9]))
        seen = []
        def fetch(before):
            seen.append(before)
            return page([20, 19]) if before is None else page([18, 10])
        partial = collect(self.db, max_pages=1, fetcher=fetch)
        self.assertEqual(partial['checkpoint']['before'], 19)
        self.assertEqual(partial['checkpoint']['anchor'], 10)
        done = collect(self.db, fetcher=fetch)
        self.assertEqual(seen, [None, 19])
        self.assertEqual(done['checkpoint']['anchor'], 20)
        self.assertIsNone(done['checkpoint']['before'])

    def test_crash_after_page_save_replays_without_network(self):
        with patch('news_pipeline.collector.page_records', side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt):
                collect(self.db, fetcher=lambda before: page([10]))
        self.assertEqual(status(self.db)['pages'], {'pending': 1})
        def forbidden(before):
            self.fail('should replay saved page')
        self.assertEqual(collect(self.db, fetcher=forbidden)['inserted'], 1)

    def test_layout_failure_preserves_page_and_cursor(self):
        collect(self.db, fetcher=lambda before: page([10]))
        with self.assertRaises(ValueError):
            collect(self.db, fetcher=lambda before: '<html>blocked</html>')
        state = status(self.db)
        self.assertEqual(state['checkpoint'][0]['anchor'], 10)
        self.assertEqual(state['pages']['failed'], 1)

    def test_invalid_cursor_never_requests_network(self):
        with patch('news_pipeline.collector.requests.get') as request:
            with self.assertRaises(ValueError):
                fetch_page('http://localhost')
            request.assert_not_called()

    def test_second_writer_is_rejected(self):
        with writer_lock(self.db):
            with self.assertRaises(RuntimeError):
                collect(self.db, fetcher=lambda before: page([1]))

    def test_redirect_and_response_budget(self):
        with patch('news_pipeline.collector.requests.get') as request:
            response = request.return_value.__enter__.return_value
            response.status_code = 302
            with self.assertRaises(ValueError):
                fetch_page()
            self.assertFalse(request.call_args.kwargs['allow_redirects'])
            response.status_code = 200
            response.headers = {'Content-Type': 'text/html'}
            response.iter_content.return_value = iter([b'x' * (2 * 1024 * 1024 + 1)])
            with self.assertRaises(ValueError):
                fetch_page()

    def test_adversarial_parser_budget(self):
        with self.assertRaises(ValueError):
            parse_news('Bitcoin rises ' * 200)
        with self.assertRaises(ValueError):
            parse_news('x' * 16001)
        self.assertEqual(parse_news(' ' * 15999)['events'], [])

    def test_weights_bounded_decay_and_no_amount_boost(self):
        p = parse_news('Bitcoin rises $1 million.')
        bigger = parse_news('Bitcoin rises $999 trillion.')
        pub = NOW.isoformat()
        a = weight_post(p, pub, NOW)['post_weight']
        self.assertEqual(a, weight_post(bigger, pub, NOW)['post_weight'])
        self.assertEqual(weight_post(p, pub, NOW, duplicate=True)['post_weight'], 0)
        self.assertEqual(weight_post(p, pub, NOW + timedelta(hours=24))['post_weight'], a / 2)
        self.assertEqual(weight_post(p, pub, NOW - timedelta(hours=1))['post_weight'], 0)
        self.assertLess(weight_post(parse_news('Bitcoin may rise.'), pub, NOW)['post_weight'], a)

    def test_cutoff_duplicate_and_safe_export(self):
        self.assertEqual(safe_csv_text('=1+1'), "'=1+1")
        self.assertEqual(safe_csv_text('  @evil'), "'  @evil")
        with connect(self.db) as db, db:
            save_record(db, record(), NOW)
            save_record(db, record('2'), NOW)
            save_record(db, record('3', '=HYPERLINK("http://evil") Bitcoin rises.'), NOW)
        with patch('news_pipeline.storage.utcnow', return_value=NOW):
            process_pending(self.db)
        before = self.root / 'before.jsonl'
        self.assertEqual(export_data(self.db, before, (NOW - timedelta(seconds=1)).isoformat())['exported'], 0)
        output = self.root / 'out.jsonl'
        export_data(self.db, output, NOW.isoformat())
        out = [json.loads(s) for s in output.read_text().splitlines()]
        self.assertEqual(out[1]['weighting']['post_weight'], 0)
        daily = self.root / 'daily.csv'
        export_data(self.db, daily, NOW.isoformat(), daily=True)
        self.assertNotIn('HYPERLINK', daily.read_text())
        with self.assertRaises(FileExistsError):
            export_data(self.db, output, NOW.isoformat())

    def test_media_only_page_advances_without_fabricated_text(self):
        result = collect(self.db, fetcher=lambda before: '<div class="tgme_widget_message" data-post="WatcherGuru/4"></div>')
        self.assertEqual(result['media_skipped'], 1)
        self.assertEqual(result['inserted'], 0)
        self.assertEqual(result['checkpoint']['anchor'], 4)


if __name__ == '__main__':
    unittest.main()
