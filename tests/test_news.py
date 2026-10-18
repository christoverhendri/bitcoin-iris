import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from news_pipeline.core import clean, ingest, parse_telegram, temporal_split, timestamp


class FakePipeline:
    classes_ = ['negative', 'neutral', 'positive']

    def predict_proba(self, texts):
        return [[.1, .7, .2] for _ in texts]


class NewsTests(unittest.TestCase):
    def test_temporal_split(self):
        start = datetime(2025, 1, 1, tzinfo=timezone.utc)
        rows = [{'date': start + timedelta(days=i // 2)} for i in range(60)]
        train, validation, test = temporal_split(rows)
        self.assertLess(train[-1]['date'], validation[0]['date'])
        self.assertLess(validation[-1]['date'], test[0]['date'])
        self.assertEqual(len(train) + len(validation) + len(test), len(rows))

    def test_timestamps(self):
        for value in [None, '2025-01-01', 'invalid']:
            self.assertIsNone(timestamp(value))
        self.assertEqual(timestamp('2025-01-01T07:00:00+07:00').hour, 0)

    def test_parser_idempotency_and_edits(self):
        html = '''<div class="tgme_widget_message" data-post="WatcherGuru/42">
        <div class="tgme_widget_message_text">JUST IN: Bitcoin rises<br>@WatcherGuru</div>
        <time datetime="2025-01-01T12:00:00Z"></time></div>'''
        records = parse_telegram(html)
        self.assertEqual(clean(records[0]['raw_text']), 'Bitcoin rises')
        bundle = {'pipeline': FakePipeline(), 'model_id': 'test'}
        with tempfile.TemporaryDirectory() as directory:
            db = Path(directory) / 'live.sqlite'
            self.assertEqual(ingest(bundle, records, db), 1)
            self.assertEqual(ingest(bundle, records, db), 0)
            records[0]['raw_text'] = 'Bitcoin falls'
            self.assertEqual(ingest(bundle, records, db), 1)

    def test_layout_failure(self):
        with self.assertRaises(ValueError):
            parse_telegram('<html>Service unavailable</html>')


if __name__ == '__main__':
    unittest.main()
