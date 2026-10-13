"""Synthetic fixtures only. They never establish actual provider accessibility."""
from contextlib import closing
from dataclasses import replace
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

import numpy as np

from research_models.market_memory.data import (DAY, HOUR, IDENTITY, _validated,
                                               payload_hash, read_sqlite, utc_seconds)
from research_models.market_memory.features import (VARIANTS, build_examples, clocks,
                                                   decay_update, geometry, signature2)
from research_models.market_memory.model import (Protocol, evaluate, partitions,
                                                ridge_fit, ridge_predict)
from research_models.market_memory.__main__ import run_experiment, verify_artifact, predict


def source_rows(days=460, seed=4):
    rng = np.random.default_rng(seed)
    first = utc_seconds('2020-01-01T00:00:00Z') - HOUR
    n = days*24 + 1
    scale = .001*(1+.4*np.sin(np.arange(n)/240))
    prices = 10000*np.exp(np.cumsum(rng.normal(size=n)*scale))
    volumes = 1 + rng.uniform(0, 5, n)
    rows = []
    for i in range(n):
        close = float(prices[i])
        opening = float(prices[max(0, i-1)])
        vals = (min(opening, close)*.999, max(opening, close)*1.001,
                opening, close, float(volumes[i]))
        ts = first+i*HOUR
        rows.append((ts, *vals, '2026-10-12T12:00:00.000000Z', payload_hash(ts, vals)))
    return rows


def write_database(path, rows):
    with closing(sqlite3.connect(path)) as db, db:
        db.executescript('''CREATE TABLE store_identity(key TEXT PRIMARY KEY,value TEXT);
          CREATE TABLE hourly_candles(ts INTEGER,payload_sha256 TEXT,observed_at TEXT,
            last_seen_at TEXT,low REAL,high REAL,open REAL,close REAL,volume REAL,
            PRIMARY KEY(ts,payload_sha256));
          CREATE TABLE hourly_windows(start_ts INTEGER,end_ts INTEGER,fetched_at TEXT,
            response_sha256 TEXT,rows_received INTEGER,missing_hours INTEGER);''')
        db.executemany('INSERT INTO store_identity VALUES(?,?)', IDENTITY.items())
        for ts, low, high, op, cl, vol, obs, sha in rows:
            db.execute('INSERT INTO hourly_candles VALUES(?,?,?,?,?,?,?,?,?)',
                       (ts, sha, obs, obs, low, high, op, cl, vol))


class GeometryTests(unittest.TestCase):
    def test_straight_segment(self):
        d = np.array([1., 2., -3.])
        first, second = signature2(d[None, :])
        np.testing.assert_allclose(first, d)
        np.testing.assert_allclose(second, .5*np.outer(d, d))

    def test_chens_identity(self):
        a, b = np.array([[1., 2.], [3., -1.]]), np.array([[2., 1.]])
        a1, a2 = signature2(a)
        b1, b2 = signature2(b)
        c1, c2 = signature2(np.vstack((a, b)))
        np.testing.assert_allclose(c1, a1+b1)
        np.testing.assert_allclose(c2, a2+b2+np.outer(a1, b1))

    def test_known_ordered_area(self):
        _, s = signature2(np.array([[1., 0.], [0., 1.]]))
        self.assertEqual(.5*(s[0, 1]-s[1, 0]), .5)
        _, rev = signature2(np.array([[0., 1.], [1., 0.]]))
        self.assertEqual(.5*(rev[0, 1]-rev[1, 0]), -.5)

    def test_collinear_subdivision_is_invariant(self):
        d = np.array([[2., 3.]])
        one = signature2(d)
        split = signature2(np.vstack((d*.2, d*.8)))
        for x, y in zip(one, split):
            np.testing.assert_allclose(x, y)

    def test_shuffle_identity(self):
        first, second = signature2(np.random.default_rng(2).normal(size=(24, 4)))
        np.testing.assert_allclose(second+second.T, np.outer(first, first), atol=1e-12)

    def test_undefined_clock_is_rejected(self):
        with self.assertRaises(ValueError):
            geometry(np.zeros(24), np.ones(24))
        with self.assertRaises(ValueError):
            clocks(np.ones(24), np.zeros(24))

    def test_negative_volume_rejected(self):
        v = np.ones(24)
        v[0] = -1
        with self.assertRaises(ValueError):
            geometry(np.ones(24), v)

    def test_clock_scaling_invariance(self):
        r = np.linspace(-.01, .02, 24)
        v = np.arange(1., 25.)
        np.testing.assert_allclose(clocks(r, v), clocks(4*r, 9*v), atol=1e-14)
        self.assertLessEqual(clocks(r, v)[2], 1.)
        self.assertLessEqual(clocks(r, v)[4], np.log(2))

    def test_same_clock_zero_disagreement(self):
        r = np.arange(1., 25.)
        c = clocks(r, r*r)
        np.testing.assert_allclose(c[2:], 0, atol=1e-14)

    def test_half_life_and_semigroup(self):
        self.assertAlmostEqual(float(decay_update(.8, 0., 2., 2.)), .4)
        first = decay_update(.8, .2, 1., 2.)
        np.testing.assert_allclose(decay_update(first, .2, 3., 2.), decay_update(.8, .2, 4., 2.))
        with self.assertRaises(ValueError):
            decay_update(1., 2., -1., 2.)


class InputTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name)/'source.sqlite'
        self.rows = source_rows(3)
        write_database(self.path, self.rows)

    def tearDown(self):
        self.tmp.cleanup()

    def test_canonical_read_is_readonly(self):
        before = self.path.read_bytes()
        source = read_sqlite(self.path)
        self.assertEqual(len(source.ts), len(self.rows))
        self.assertEqual(before, self.path.read_bytes())
        self.assertIs(source.provenance['historical_backtest_safe'], False)

    def test_wrong_venue(self):
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("UPDATE store_identity SET value='kraken' WHERE key='source'")
        with self.assertRaises(ValueError):
            read_sqlite(self.path)

    def test_hash_tamper(self):
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute('UPDATE hourly_candles SET volume=volume+1')
        with self.assertRaisesRegex(ValueError, 'SHA'):
            read_sqlite(self.path)

    def test_duplicate_timestamp_rejected(self):
        with self.assertRaises(ValueError):
            _validated([self.rows[0], self.rows[0]], {})

    def test_future_observation_claim_rejected(self):
        row = list(self.rows[0])
        row[-2] = '2019-01-01T00:00:00Z'
        with self.assertRaises(ValueError):
            _validated([tuple(row)], {})

    def test_ambiguous_revision_rejected(self):
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute('''INSERT INTO hourly_candles SELECT ts,?,observed_at,last_seen_at,
              low,high,open,close,volume FROM hourly_candles LIMIT 1''', ('f'*64,))
        with self.assertRaisesRegex(ValueError, 'Ambiguous'):
            read_sqlite(self.path)

    def test_inverted_observation_order(self):
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("UPDATE hourly_candles SET last_seen_at='2020-01-01T00:00:00Z'")
        with self.assertRaises(ValueError):
            read_sqlite(self.path)

    def test_invalid_ohlc_even_with_updated_hash(self):
        row = list(self.rows[0])
        row[1] = row[2]*2
        row[-1] = payload_hash(row[0], row[1:6])
        with self.assertRaisesRegex(ValueError, 'OHLCV'):
            _validated([tuple(row)], {})


class ResearchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = source_rows()
        cls.data = _validated(cls.rows, {'input_kind': 'synthetic_unit_fixture'})
        cls.cutoff = int(cls.data.ts[-1]+HOUR)
        cls.ds = build_examples(cls.data, horizon=7, cutoff=cls.cutoff)
        cls.protocol = Protocol(folds=2, min_train=80, tune_size=30,
                                calibration_size=30, bootstrap_reps=0)

    def test_future_targets_exact(self):
        origin = self.ds.origins[0]
        i = np.searchsorted(self.data.ts, origin-HOUR)
        closes = self.data.ohlcv[i:i+7*24+1, 3]
        r = np.diff(np.log(closes))
        self.assertAlmostEqual(self.ds.y[0, 0], np.log(np.sum(r*r)/7))
        self.assertAlmostEqual(self.ds.y[0, 1], np.log(closes[-1]/closes[0]))
        self.assertAlmostEqual(self.ds.y[0, 2], np.log1p(100*max(0, -np.cumsum(r).min())))

    def test_signatures_change_when_order_changes(self):
        self.assertGreater(float(np.max(np.abs(self.ds.x['B2'][:, -6:]-
                                              self.ds.x['B2_SHUFFLED'][:, -6:]))), 1e-3)
        np.testing.assert_array_equal(self.ds.x['B2'][:, :24], self.ds.x['B2_SHUFFLED'][:, :24])

    def test_feature_dimensions(self):
        self.assertEqual({k: v.shape[1] for k, v in self.ds.x.items()},
                         {'B0': 12, 'B1': 24, 'B2': 30, 'B3': 36, 'B2_SHUFFLED': 30})

    def test_no_future_feature_leakage(self):
        boundary = self.ds.origins[100]
        values = self.data.ohlcv.copy()
        values[self.data.ts >= boundary, :4] *= 2
        changed = build_examples(replace(self.data, ohlcv=values), horizon=7, cutoff=self.cutoff)
        np.testing.assert_array_equal(self.ds.x['B3'][:101], changed.x['B3'][:101])

    def test_missing_hours_not_compressed(self):
        cut = 200*24+4
        damaged = replace(self.data, ts=np.delete(self.data.ts, cut),
                          ohlcv=np.delete(self.data.ohlcv, cut, axis=0),
                          observed=np.delete(self.data.observed, cut))
        ds = build_examples(damaged, horizon=7, cutoff=self.cutoff)
        missing = self.data.ts[cut]
        for origin, end in zip(ds.origins, ds.target_ends):
            self.assertFalse(origin-30*DAY-HOUR <= missing < end)
        self.assertLess(len(ds.origins), len(self.ds.origins))

    def test_cutoff_excludes_unfinished_day(self):
        boundary = self.ds.origins[100]
        ds = build_examples(self.data, horizon=7, cutoff=int(boundary+HOUR))
        self.assertEqual(utc_seconds(ds.latest['origin']), boundary)
        self.assertTrue(np.all(ds.target_ends <= boundary))

    def test_purged_partitions_use_times(self):
        before = int(self.ds.origins[-70])
        train, tune, fit, cal = partitions(self.ds, before, self.protocol)
        self.assertLess(self.ds.target_ends[train].max(), self.ds.origins[tune[0]])
        self.assertLess(self.ds.target_ends[fit].max(), self.ds.origins[cal[0]])
        self.assertLess(self.ds.target_ends[cal].max(), before)

    def test_svd_matches_augmented_lstsq(self):
        x = np.random.default_rng(4).normal(size=(40, 5))
        x[:, 4] = x[:, 1]
        y = np.random.default_rng(9).normal(size=(40, 3))
        m = ridge_fit(x, y, .1)
        z = (x-np.array(m['mean']))/np.array(m['scale'])
        a = np.vstack((z, np.sqrt(len(x)*.1)*np.eye(5)))
        b = np.vstack((y-y.mean(axis=0), np.zeros((5, 3))))
        ref = np.linalg.lstsq(a, b, rcond=None)[0]
        np.testing.assert_allclose(m['coef'], ref, atol=1e-12)
        self.assertTrue(np.isfinite(ridge_predict(m, x)).all())

    def test_end_to_end_reproducible_no_auto_promotion(self):
        with tempfile.TemporaryDirectory() as temp:
            a, b = Path(temp)/'a', Path(temp)/'b'
            for output in (a, b):
                run_experiment(self.data, output, cutoff=self.cutoff, horizons=(7,),
                               protocol=self.protocol, allow_retrospective=True)
            self.assertEqual((a/'predictions.csv').read_bytes(), (b/'predictions.csv').read_bytes())
            report, saved = verify_artifact(a)
            self.assertEqual(len(report['experiments'][0]['summary']), 9)
            self.assertIs(report['model_ready'], False)
            self.assertIn('B2_SHUFFLED', saved['models']['7'])
            result = predict(self.data, a, cutoff=self.cutoff, horizon=7, variant='B2', allow_retrospective=True)
            self.assertIs(result['model_ready'], False)
            self.assertLessEqual(result['rv_quantiles'][0], result['rv_quantiles'][1])
            self.assertLessEqual(result['rv_quantiles'][1], result['rv_quantiles'][2])
            with self.assertRaises(FileExistsError):
                run_experiment(self.data, a, cutoff=self.cutoff, horizons=(7,),
                               protocol=self.protocol, allow_retrospective=True)
            (a/'models.json').write_text('{}')
            with self.assertRaises(ValueError):
                verify_artifact(a)

    def test_fail_closed_acknowledgement_and_short_data(self):
        with tempfile.TemporaryDirectory() as t:
            path = Path(t)/'new'
            with self.assertRaises(ValueError):
                run_experiment(self.data, path, cutoff=self.cutoff)
            self.assertFalse(path.exists())
            with self.assertRaises(ValueError):
                run_experiment(self.data, path, cutoff=self.cutoff, horizons=(7,7), allow_retrospective=True)
            self.assertFalse(path.exists())

    def test_outer_labels_cannot_change_first_fold_predictions(self):
        report, pred, _ = evaluate(self.ds, self.protocol)
        y = self.ds.y.copy()
        split = int(len(y)*.75)
        y[split:, 0] += .25
        _, changed, _ = evaluate(replace(self.ds, y=y), self.protocol)
        before = [p['pred_log_rv_q50'] for p in pred if p['fold'] == 0]
        after = [p['pred_log_rv_q50'] for p in changed if p['fold'] == 0]
        np.testing.assert_array_equal(before, after)

    def test_bootstrap_is_reproducible(self):
        from research_models.market_memory.model import _bootstrap
        d = np.linspace(-.2, .2, 20)
        times = np.r_[np.arange(10), np.arange(12,22)]*DAY
        folds = np.zeros(20)
        a = _bootstrap(d,times,folds,block=3,reps=40,seed=9)
        self.assertEqual(a,_bootstrap(d,times,folds,block=3,reps=40,seed=9))
        self.assertLessEqual(a[0], a[1])


@unittest.skipUnless(importlib.util.find_spec('duckdb'), 'Optional DuckDB needed for actual warehouse roundtrip')
class WarehouseIntegrationTests(unittest.TestCase):
    def test_existing_hourly_export_to_research_loader(self):
        from market_data.hourly_prices import export_hourly
        from research_models.market_memory.data import read_warehouse, iso
        with tempfile.TemporaryDirectory() as t:
            root = Path(t)
            rows = source_rows(35)
            write_database(root/'input.sqlite', rows)
            export_hourly(root/'input.sqlite', root/'parquet',
                          start=iso(rows[0][0]), end=iso(rows[-1][0]+HOUR))
            loaded = read_warehouse(root/'parquet')
            direct = read_sqlite(root/'input.sqlite')
            np.testing.assert_array_equal(loaded.ohlcv, direct.ohlcv)
            self.assertEqual(loaded.provenance['effective_sha256'], direct.provenance['effective_sha256'])


if __name__ == '__main__':
    unittest.main()
