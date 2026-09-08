import tempfile
import unittest
from pathlib import Path

try:
    import numpy as np
    import pandas as pd
    from news_pipeline.system_diagnostics import acf, diagnose, load_close, summarize
    AVAILABLE = True
except ImportError:
    AVAILABLE = False


@unittest.skipUnless(AVAILABLE, 'Install requirements-model.txt')
class SystemDiagnosticsTests(unittest.TestCase):
    def test_constant_series_has_no_fabricated_correlation(self):
        self.assertIsNone(acf(np.ones(100), 1))
        self.assertIsNone(summarize(np.zeros(100))['excess_kurtosis_moment'])

    def test_daily_validation_and_cutoff(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'prices.csv'
            dates = pd.date_range('2020-01-01', periods=400, tz='UTC')
            frame = pd.DataFrame({'date': dates, 'Close': np.exp(np.arange(400) * .001)})
            frame.to_csv(path, index=False)
            cutoff = dates[380]
            result = diagnose(path, cutoff)
            self.assertEqual(result['n_closes'], 380)
            self.assertAlmostEqual(result['full_sample']['mean_daily_log_return'], .001)
            self.assertEqual(result['age_days_since_last_completed_bar'], 0)
            # An unfinished/future bar cannot change any statistical output.
            frame.loc[380:, 'Close'] *= 2
            frame.to_csv(path, index=False)
            self.assertEqual(result['full_sample'], diagnose(path, cutoff)['full_sample'])
            for invalid in [frame.drop(index=100), pd.concat([frame, frame.iloc[[0]]]),
                            frame.assign(Close=-1), frame.assign(Close=np.inf),
                            frame.assign(date=dates + pd.Timedelta(hours=1))]:
                invalid.to_csv(path, index=False)
                with self.assertRaises(ValueError):
                    load_close(path, cutoff)
            frame.to_csv(path, index=False)
            with self.assertRaises(ValueError):
                load_close(path, '2021-01-01')


if __name__ == '__main__':
    unittest.main()
