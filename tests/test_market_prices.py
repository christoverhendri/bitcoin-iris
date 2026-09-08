import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import Mock

from news_pipeline.market_prices import fetch_daily, write_artifact


def response(rows):
    out = Mock()
    out.json.return_value = rows
    out.raise_for_status.return_value = None
    return out


def candle(day, close=10, low=9, high=11, opening=10, volume=2):
    stamp = int(datetime.fromisoformat(day).replace(tzinfo=timezone.utc).timestamp())
    return [stamp, low, high, opening, close, volume]


class MarketPriceTests(unittest.TestCase):
    def test_page_overlap_and_incomplete_bar_are_excluded(self):
        first = datetime(2025, 1, 1)
        all_rows = [candle((first + timedelta(days=i)).date().isoformat()) for i in range(303)]
        # Endpoint is inclusive in these responses, and second page repeats the
        # day preceding its requested start. Neither creates duplicate bars.
        get = Mock(side_effect=[response(all_rows[:301]), response(all_rows[299:])])
        cutoff = (first + timedelta(days=302, hours=12)).replace(tzinfo=timezone.utc).isoformat()
        rows = fetch_daily('2025-01-01', cutoff, get=get, sleep=lambda _: None)
        self.assertEqual(len(rows), 302)
        self.assertEqual(get.call_count, 2)
        self.assertEqual(rows[-1][0], (first + timedelta(days=301)).date().isoformat())

    def test_invalid_high_and_naive_cutoff_fail(self):
        with self.assertRaisesRegex(ValueError, 'inconsistent OHLC'):
            fetch_daily('2026-01-01', '2026-01-02T00:00:00Z',
                        get=Mock(return_value=response([candle('2026-01-01', high=8)])))
        with self.assertRaisesRegex(ValueError, 'timezone'):
            fetch_daily('2026-01-01', datetime(2026, 1, 2))

    def test_requests_are_ordered_and_rows_are_sorted(self):
        get = Mock(return_value=response([candle("2026-01-02"), candle("2026-01-01")]))
        rows = fetch_daily("2026-01-01", "2026-01-03T00:00:00Z", get=get, sleep=lambda _: None)
        self.assertEqual([r[0] for r in rows], ["2026-01-01", "2026-01-02"])
        self.assertEqual(get.call_args.kwargs["params"], {
            "granularity": 86400, "start": "2026-01-01T00:00:00Z", "end": "2026-01-03T00:00:00Z"})

    def test_missing_duplicate_and_nonpositive_are_rejected(self):
        cases = [
            ([candle("2026-01-01")], "missing Coinbase candles"),
            ([candle("2026-01-01"), candle("2026-01-01")], "duplicate candle"),
            ([candle("2026-01-01", close=0)], "nonpositive"),
        ]
        for rows, message in cases:
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                cutoff = "2026-01-03T00:00:00Z" if message == "missing Coinbase candles" else "2026-01-02T00:00:00Z"
                fetch_daily("2026-01-01", cutoff, get=Mock(return_value=response(rows)), sleep=lambda _: None)

    def test_incomplete_shape_and_conflicting_duplicate_are_rejected(self):
        get = Mock(return_value=response([candle("2026-01-01"), candle("2026-01-01", close=12)]))
        with self.assertRaisesRegex(ValueError, "duplicate candle"):
            fetch_daily("2026-01-01", "2026-01-02T00:00:00Z", get=get, sleep=lambda _: None)
        with self.assertRaisesRegex(ValueError, "must contain"):
            fetch_daily("2026-01-01", "2026-01-02T00:00:00Z", get=Mock(return_value=response([[1, 2]])), sleep=lambda _: None)

    def test_artifact_contains_csv_and_provenance_hash(self):
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "prices"
            rows = [("2026-01-01", 9, 11, 10, 10, 2)]
            metadata = write_artifact(rows, out, "2026-01-01", "2026-01-02T00:00:00Z", fetched_at="2026-01-02T00:00:00Z")
            self.assertEqual(metadata["instrument"], "BTC/USD")
            self.assertEqual(metadata["data_sha256"], __import__("hashlib").sha256((out / "prices.csv").read_bytes()).hexdigest())
            self.assertTrue((out / "provenance.json").exists())


if __name__ == "__main__":
    unittest.main()
