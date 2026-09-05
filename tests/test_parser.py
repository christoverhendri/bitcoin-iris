import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from news_pipeline.core import digest, ingest, parse_telegram
from news_pipeline.parser import VERSION, parse_news
from test_news import FakePipeline


class ParserTests(unittest.TestCase):
    def test_negation_and_expectation_are_distinct(self):
        cases = [
            ('SEC approves Bitcoin ETF.', 'affirmed', 'asserted'),
            ('SEC has not approved Bitcoin ETF.', 'negated', 'asserted'),
            ('Analysts expect SEC to approve Bitcoin ETF.', 'affirmed', 'expected'),
            ('Exchange denies it was hacked.', 'negated', 'asserted'),
            ('Exchange did not deny it was hacked.', 'unresolved', 'unresolved'),
            ('No inflation reported as Bitcoin rises.', 'unresolved', 'unresolved'),
            ('Bitcoin ETF approval expected tomorrow.', 'unresolved', 'unresolved'),
        ]
        for text, polarity, modality in cases:
            with self.subTest(text=text):
                event = parse_news(text)['events'][0]
                self.assertEqual((event['polarity'], event['modality']), (polarity, modality))
                self.assertFalse(event['verified_occurrence'])

    def test_contrast_does_not_spread_negation(self):
        result = parse_news('Bitcoin did not fall while Ethereum rises.')
        self.assertEqual([e['polarity'] for e in result['events']], ['negated', 'affirmed'])
        self.assertEqual([e['entity_mentions'][0]['canonical'] for e in result['events']], ['bitcoin', 'ethereum'])

    def test_multiple_events_are_not_forced_into_one_role(self):
        result = parse_news('SEC approves Bitcoin ETF and rejects Ethereum ETF.')
        self.assertEqual(len(result['events']), 2)
        self.assertTrue(all(e['polarity'] == 'unresolved' for e in result['events']))
        self.assertTrue(all(e['actor'] is None and e['target'] is None for e in result['events']))

    def test_offsets_preserve_unicode_and_boilerplate(self):
        text = 'JUST IN: 🇺🇸 SEC says Bitcoin may rise 2.5%\n@WatcherGuru https://example.com/hack'
        result = parse_news(text)
        def check(value):
            if isinstance(value, dict):
                if {'text', 'start', 'end'} <= value.keys():
                    self.assertEqual(text[value['start']:value['end']], value['text'])
                for child in value.values():
                    check(child)
            elif isinstance(value, list):
                for child in value:
                    check(child)
        check(result)
        self.assertEqual(len(result['events']), 1)
        self.assertEqual(result['events'][0]['event_type'], 'upward_movement')

    def test_quantities_and_abbreviations(self):
        result = parse_news('U.S. Fed cuts rates 25 bps. Bitcoin ETF sees $1.5 billion inflows and 2.5% growth.')
        self.assertEqual(len(result['segments']), 2)
        quantities = {(q['value'], q['unit']) for q in result['quantities']}
        self.assertEqual(quantities, {('25', 'bps'), ('1500000000.0', '$'), ('2.5', '%')})

    def test_time_is_not_fabricated(self):
        result = parse_news('Bitcoin rises today after yesterday. Next week may be different.')
        self.assertEqual([t['text'].lower() for t in result['time_expressions']], ['today', 'yesterday', 'next week'])
        self.assertNotIn('event_time', result['events'][0])

    def test_unknown_and_unsupported_text(self):
        result = parse_news('UnknownIssuer unveils an innovative service.')
        self.assertEqual(result['entities'], [])
        self.assertEqual(result['events'], [])
        self.assertEqual(result['btc_relevance'], 'undetermined')
        self.assertTrue(result['needs_review'])
        self.assertTrue(parse_news('')['needs_review'])

    def test_attribution_continuation_is_unresolved(self):
        result = parse_news('Analysts say Bitcoin rises while Ethereum falls.')
        self.assertEqual(result['events'][1]['polarity'], 'unresolved')

    def test_telegram_preserves_linebreaks_and_inline_words(self):
        html = '''<div class="tgme_widget_message" data-post="WatcherGuru/42">
        <div class="tgme_widget_message_text">Bit<b>coin</b> rises<br>Ethereum falls</div></div>'''
        self.assertEqual(parse_telegram(html)[0]['raw_text'], 'Bitcoin rises\nEthereum falls')

    def test_legacy_upgrade_and_raw_only_edit(self):
        bundle = {'pipeline': FakePipeline(), 'model_id': 'test'}
        record = {'source': 'watcher_guru', 'source_id': '1', 'raw_text': 'Bitcoin rises @old'}
        with tempfile.TemporaryDirectory() as directory:
            db = Path(directory) / 'live.sqlite'
            ingest(bundle, [record], db)
            connection = sqlite3.connect(db)
            payload = json.loads(connection.execute('SELECT payload FROM predictions').fetchone()[0])
            del payload['semantic_parse']
            connection.execute('UPDATE predictions SET payload=?, content_hash=?', (json.dumps(payload), digest('Bitcoin rises')))
            connection.commit()
            connection.close()
            self.assertEqual(ingest(bundle, [record], db), 0)
            connection = sqlite3.connect(db)
            updated = json.loads(connection.execute('SELECT payload FROM predictions').fetchone()[0])
            connection.close()
            self.assertEqual(updated['semantic_parse']['parser_version'], VERSION)
            self.assertEqual(updated['content_hash'], digest(record['raw_text']))
            self.assertEqual(ingest(bundle, [{**record, 'raw_text': 'Bitcoin rises @new'}], db), 1)


if __name__ == '__main__':
    unittest.main()
