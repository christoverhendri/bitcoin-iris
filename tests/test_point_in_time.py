import unittest
from market_data.point_in_time import value_at_origin


class PointInTimeTests(unittest.TestCase):
    def test_retrospective_backfill_cannot_be_used_in_past(self):
        rows = [{'date': '2024-01-01', 'metric': 'TxCnt', 'value': '123', 'state': 'observed',
                 'observed_at': '2026-10-11T12:00:00Z'}]
        result = value_at_origin(rows, 'TxCnt', '2024-01-02T12:00:00Z', max_age_days=2)
        self.assertFalse(result['available'])
        self.assertEqual(result['reason'], 'not_observed_at_origin')

    def test_completed_day_visible_after_observed_timestamp(self):
        rows = [{'date': '2026-10-10', 'metric': 'TxCnt', 'value': '100', 'state': 'observed',
                 'observed_at': '2026-10-11T12:00:00Z'}]
        self.assertFalse(value_at_origin(rows, 'TxCnt', '2026-10-11T11:59:59Z')['available'])
        value = value_at_origin(rows, 'TxCnt', '2026-10-11T14:00:00Z')
        self.assertTrue(value['available'])
        self.assertEqual(value['value'], '100')
        self.assertEqual(value['age_hours'], 14)

    def test_latest_version_only_if_available(self):
        rows = [
            {'date': '2026-10-10', 'metric': 'TxCnt', 'value': '100', 'state': 'observed',
             'observed_at': '2026-10-11T01:00:00Z'},
            {'date': '2026-10-10', 'metric': 'TxCnt', 'value': '101', 'state': 'observed',
             'observed_at': '2026-10-11T18:00:00Z'},
        ]
        early = value_at_origin(rows, 'TxCnt', '2026-10-11T12:00:00Z')
        late = value_at_origin(rows, 'TxCnt', '2026-10-11T19:00:00Z')
        self.assertEqual(early['value'], '100')
        self.assertEqual(late['value'], '101')

    def test_explicit_staleness_and_missing(self):
        rows = [{'date': '2026-10-08', 'metric': 'TxCnt', 'value': '99', 'state': 'observed',
                 'observed_at': '2026-10-09T10:00:00Z'},
                {'date': '2026-10-10', 'metric': 'TxCnt', 'value': None, 'state': 'missing_metric',
                 'observed_at': '2026-10-11T10:00:00Z'}]
        self.assertEqual(value_at_origin(rows, 'TxCnt', '2026-10-11T12:00:00Z',
                                         max_age_days=1)['reason'], 'stale')
        self.assertEqual(value_at_origin(rows, 'TxCnt', '2026-10-11T12:00:00Z',
                                         max_age_days=3)['value'], '99')

    def test_reject_naive_cutoff(self):
        with self.assertRaises(ValueError):
            value_at_origin([], 'TxCnt', '2026-10-11T12:00:00')


if __name__ == '__main__':
    unittest.main()
