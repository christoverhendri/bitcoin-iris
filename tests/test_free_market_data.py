"""Deterministic offline tests for the free Community on-chain collector."""
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock

from market_data.coinmetrics import API_URL, fetch_community, parse_metrics, valid_page_url, write_artifact

AT = datetime(2026, 10, 11, 12, tzinfo=timezone.utc)


class Response:
    def __init__(self, obj, status=200, headers=None):
        self.data = json.dumps(obj).encode() if not isinstance(obj, bytes) else obj
        self.status_code = status
        self.headers = headers if headers is not None else {'Content-Type': 'application/json'}

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return None

    def iter_content(self, chunk_size):
        yield self.data

    def raise_for_status(self):
        raise ValueError(f'HTTP {self.status_code}')


def row(day, **metrics):
    return {'asset': 'btc', 'time': f'{day}T00:00:00.000000000Z', **metrics}


class FreeOnchainTests(unittest.TestCase):
    def test_no_backfill_and_provenance(self):
        pages = [Response({'data': [row('2026-10-08', AdrActCnt='112.15', TxCnt='100'),
                                    row('2026-10-10', AdrActCnt=None, TxCnt='120')],
                           'next_page_url': None})]
        get = Mock(side_effect=lambda *a, **kw: pages.pop(0))
        result = fetch_community('2026-10-08', '2026-10-11', get=get, sleep=lambda _: None, now=AT)
        self.assertEqual(len(result['rows']), 6)
        self.assertEqual(result['missing_days'], ['2026-10-09'])
        self.assertEqual([r['state'] for r in result['rows']],
                         ['observed', 'observed', 'missing_day', 'missing_day', 'missing_metric', 'observed'])
        with tempfile.TemporaryDirectory() as root:
            output = Path(root) / 'new'
            metadata = write_artifact(result, output)
            self.assertFalse(metadata['historical_backtest_safe'])
            self.assertEqual(metadata['row_states']['missing_day'], 2)
            with (output / 'onchain_daily.csv').open() as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(rows[2]['value'], '')
            self.assertEqual(rows[0]['value'], '112.15')
            self.assertEqual(rows[0]['observed_at'], AT.isoformat())
            with self.assertRaises(FileExistsError):
                write_artifact(result, output)

    def test_pagination_with_api_host_lock(self):
        nxt = API_URL + '?next_page_token=abc'
        calls = []
        def get(url, **kw):
            calls.append((url, kw['params']))
            return Response({'data': [row('2026-10-09', TxCnt='3', AdrActCnt='2')],
                             'next_page_url': nxt} if len(calls) == 1 else
                            {'data': [row('2026-10-10', TxCnt='4', AdrActCnt='3')], 'next_page_url': None})
        result = fetch_community('2026-10-09', '2026-10-11', get=get, sleep=lambda _: None, now=AT)
        self.assertEqual(len(result['pages']), 2)
        self.assertIsNone(calls[1][1])
        self.assertFalse(valid_page_url('https://127.0.0.1/admin'))
        self.assertFalse(valid_page_url('https://community-api.coinmetrics.io.evil.test/v4/timeseries/asset-metrics'))
        self.assertFalse(valid_page_url(API_URL + '/../secrets'))
        self.assertFalse(valid_page_url(API_URL + '?api_key=paid-secret'))
        self.assertFalse(valid_page_url(API_URL + '?assets=eth'))
        self.assertFalse(valid_page_url(API_URL + '?frequency=1h'))

    def test_rejects_redirect_and_private_tier(self):
        with self.assertRaisesRegex(PermissionError, 'free'):
            fetch_community('2026-10-10', '2026-10-11', get=lambda *a, **kw: Response({}, status=403), now=AT)
        with self.assertRaisesRegex(ValueError, 'Unexpected.*HTTP'):
            fetch_community('2026-10-10', '2026-10-11', get=lambda *a, **kw: Response({}, status=302), now=AT)
        with self.assertRaisesRegex(ValueError, 'pagination destination'):
            fetch_community('2026-10-10', '2026-10-11', now=AT, get=lambda *a, **kw:
                            Response({'data': [row('2026-10-10', TxCnt='1')],
                                      'next_page_url': 'http://localhost:9999'}))

    def test_fails_on_conflicting_duplicates_and_poison(self):
        with self.assertRaisesRegex(ValueError, 'Conflicting duplicate'):
            fetch_community('2026-10-10', '2026-10-11', now=AT, get=lambda *a, **kw:
                            Response({'data': [row('2026-10-10', AdrActCnt='10', TxCnt='2'),
                                               row('2026-10-10', AdrActCnt='11', TxCnt='2')]}))
        with self.assertRaisesRegex(ValueError, 'nonfinite'):
            fetch_community('2026-10-10', '2026-10-11', now=AT, get=lambda *a, **kw:
                            Response({'data': [row('2026-10-10', AdrActCnt='NaN', TxCnt='2')]}))
        with self.assertRaisesRegex(ValueError, 'Unexpected asset'):
            fetch_community('2026-10-10', '2026-10-11', now=AT, get=lambda *a, **kw:
                            Response({'data': [{**row('2026-10-10', TxCnt='2'), 'asset': 'eth'}]}))

    def test_rejects_unfinished_day_and_invalid_metrics(self):
        with self.assertRaisesRegex(ValueError, 'unfinished bars'):
            fetch_community('2026-10-10', '2026-10-12', now=AT)
        with self.assertRaises(ValueError):
            parse_metrics('TxCnt,TxCnt')
        with self.assertRaises(ValueError):
            parse_metrics('TxCnt,../../../etc/passwd')

    def test_bounded_page(self):
        payload = b'x' * (2 * 1024 * 1024 + 1)
        with self.assertRaisesRegex(ValueError, 'byte/time budget'):
            fetch_community('2026-10-10', '2026-10-11', now=AT,
                            get=lambda *a, **kw: Response(payload))


if __name__ == '__main__':
    unittest.main()
