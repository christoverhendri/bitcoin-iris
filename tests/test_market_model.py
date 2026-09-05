import tempfile
import unittest
from pathlib import Path

try:
    import numpy as np
    import pandas as pd
    from news_pipeline.market_model import market_frame, representation, split_fold
    AVAILABLE = True
except ImportError:
    AVAILABLE = False


@unittest.skipUnless(AVAILABLE, 'Install requirements-model.txt for modelling tests')
class MarketModelTests(unittest.TestCase):
    def test_targets_and_bar_availability(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'prices.csv'
            dates = pd.date_range('2020-01-01', periods=60)
            pd.DataFrame({'date': dates, 'Close': np.exp(np.arange(60) * .01)}).to_csv(path, index=False)
            result = market_frame(path, 7)
            self.assertAlmostEqual(result['target_return'].iloc[0], .07)
            self.assertAlmostEqual(result['target_volatility'].iloc[0], .01)
            self.assertEqual(result['origin'].iloc[0], result.index[0] + pd.Timedelta(days=1))
            self.assertTrue(result['target_return'].iloc[-7:].isna().all())
            self.assertTrue(result['target_volatility'].iloc[-7:].isna().all())

    def test_purge_uses_target_end_dates(self):
        days = pd.date_range('2020-01-01', periods=700, tz='UTC')
        f = pd.DataFrame({'origin': days, 'target_end': days + pd.Timedelta(days=7)}, index=days)
        train, valid, test = split_fold(f, 490, 560, 7)
        self.assertLess(f['target_end'].iloc[train[-1]], f['origin'].iloc[valid[0]])
        self.assertLess(f['target_end'].iloc[valid[-1]], f['origin'].iloc[test[0]])

    def test_future_news_cannot_change_fitted_representation(self):
        days = pd.date_range('2020-01-01', periods=30, tz='UTC')
        rows = [{'when': d.to_pydatetime(), 'day': d, 'weight': 1., 'events': 1,
                 'review': 0, 'btc': 1, 'source_id': str(i), 'text': 'test'} for i, d in enumerate(days)]
        vectors = np.random.default_rng(42).normal(size=(30, 12))
        a = representation(rows, vectors, days, days[:20], 3)
        vectors[20:] *= 100
        b = representation(rows, vectors, days, days[:20], 3)
        np.testing.assert_allclose(a[3]['kmeans'].cluster_centers_, b[3]['kmeans'].cluster_centers_)
        np.testing.assert_allclose(a[3]['pca'].components_, b[3]['pca'].components_)
        np.testing.assert_allclose(a[1][:20], b[1][:20])

    def test_gapped_prices_fail_instead_of_wrong_horizon(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'prices.csv'
            pd.DataFrame({'date': ['2020-01-01', '2020-01-03'], 'Close': [1, 2]}).to_csv(path, index=False)
            with self.assertRaises(ValueError):
                market_frame(path, 1)


if __name__ == '__main__':
    unittest.main()
