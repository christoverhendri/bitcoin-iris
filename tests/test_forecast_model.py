import tempfile
import unittest
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

from news_pipeline.forecast_model import (FEATURES, artifact, bootstrap_quantiles,
                                         fit_candidate, frame_from_close, partitions, predict, source_venue)


class ForecastTests(unittest.TestCase):
    def test_source_identity_and_hash_must_match(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'prices.csv'
            path.write_text('date,Close\n2020-01-01,100\n', encoding='utf-8')
            with self.assertRaises(ValueError):
                source_venue(path)
            manifest = {'venue': 'coinbase-exchange', 'instrument': 'BTC/USD',
                        'data_sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
            (path.parent / 'provenance.json').write_text(json.dumps(manifest), encoding='utf-8')
            self.assertEqual(source_venue(path), 'coinbase-exchange')
            with self.assertRaises(ValueError):
                source_venue(path, 'other-venue')
            path.write_text('date,Close\n2020-01-01,200\n', encoding='utf-8')
            with self.assertRaises(ValueError):
                source_venue(path)

    def setUp(self):
        rng = np.random.default_rng(7)
        self.close = pd.Series(np.exp(5 + np.cumsum(rng.normal(0, .02, 1500))),
                               index=pd.date_range('2020-01-01', periods=1500, tz='UTC'))
        self.frame = frame_from_close(self.close, 30)

    def test_targets_and_all_purge_boundaries(self):
        frame = self.frame
        t, v, c = partitions(frame, 1200, 30)
        self.assertLess(frame.loc[t, 'target_end'].max(), frame.loc[v, 'origin'].min())
        self.assertLess(frame.loc[v, 'target_end'].max(), frame.loc[c, 'origin'].min())
        self.assertLess(frame.loc[c, 'target_end'].max(), frame['origin'].iloc[1200])
        self.assertTrue(frame['target_return'].iloc[-30:].isna().all())
        self.assertAlmostEqual(frame['target_return'].iloc[0], np.log(self.close.iloc[60] / self.close.iloc[30]))

    def test_future_changes_do_not_change_fit_or_bootstrap(self):
        frame = self.frame
        t, v, c = partitions(frame, 1200, 30)
        model = fit_candidate(frame, t, v, c, 'ridge')
        changed = frame.copy()
        changed.loc[frame.index[1200]:, FEATURES + ['target_return']] *= 10
        other = fit_candidate(changed, t, v, c, 'ridge')
        np.testing.assert_array_equal(predict(model, frame.iloc[1200:1202][FEATURES]), predict(other, frame.iloc[1200:1202][FEATURES]))
        close = self.close.copy()
        date = close.index[1000]
        original = bootstrap_quantiles(close, [date], 30, block=7)
        close.iloc[1001:] *= 3
        np.testing.assert_array_equal(original, bootstrap_quantiles(close, [date], 30, block=7))

    def test_inference_rows_preserved_and_research_contract(self):
        frame = self.frame
        t, v, c = partitions(frame, len(frame) - 1, 30)
        model = fit_candidate(frame, t, v, c, 'ridge')
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'prices.csv'
            self.close.rename('Close').to_csv(path)
            bundle = {'model': model, 'training_cutoff': frame.loc[c, 'target_end'].max().isoformat(),
                      'venue': 'test', 'horizon_days': 30, 'data_sha256': 'a' * 64}
            result = artifact(bundle, frame, path, frame['origin'].iloc[-1])
            self.assertEqual(result['origin'], frame['origin'].iloc[-1].isoformat())
            self.assertEqual(result['calibration']['status'], 'research_only')
            values = list(result['return_quantiles'].values())
            self.assertEqual(values, sorted(values))
            for key, q in result['return_quantiles'].items():
                self.assertAlmostEqual(result['price_quantiles'][key], result['reference_price'] * np.exp(q))
            bundle['training_cutoff'] = result['origin']
            with self.assertRaises(ValueError):
                artifact(bundle, frame, path, frame['origin'].iloc[-1])


if __name__ == '__main__':
    unittest.main()
