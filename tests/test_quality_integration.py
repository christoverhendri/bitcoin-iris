"""Forecast quality gate is binding, not a decorative report in the UI."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from news_pipeline.forecast_model import require_price_quality


class ModelQualityIntegrationTests(unittest.TestCase):
    def test_parquet_requires_passing_bound_report_before_model_access(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            data = root / 'prices.parquet'
            data.write_bytes(b'fixture-only')
            with self.assertRaisesRegex(ValueError, 'requires --quality-report'):
                require_price_quality(data)
            report = {'schema_version': 'iris-data-quality/v1', 'kind': 'prices',
                      'source': 'coinbase-exchange', 'quality_gate': 'pass',
                      'historical_backtest_safe': False,
                      'data_sha256': hashlib.sha256(data.read_bytes()).hexdigest()}
            report_path = root / 'quality.json'
            report_path.write_text(json.dumps(report), encoding='utf-8')
            self.assertEqual(require_price_quality(data, report_path)['quality_gate'], 'pass')
            data.write_bytes(b'now-changed')
            with self.assertRaisesRegex(ValueError, 'different artifact'):
                require_price_quality(data, report_path)
            data.write_bytes(b'fixture-only')
            report['quality_gate'] = 'fail'
            report_path.write_text(json.dumps(report), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'failing'):
                require_price_quality(data, report_path)

    def test_legacy_csv_without_quality_report_remains_research_compatible(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'prices.csv'
            path.write_text('date,Close\n2026-10-10,100\n', encoding='utf-8')
            self.assertIsNone(require_price_quality(path))


if __name__ == '__main__':
    unittest.main()
