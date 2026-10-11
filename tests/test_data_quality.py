"""Data Quality Gate: credible failure cases are as important as clean inputs."""
import csv
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from market_data.coinmetrics import write_artifact
from market_data.observation_store import ingest_artifact
from market_data.quality import (crosscheck_report, legacy_prices_report,
    onchain_report, prices_report, verify_quality_report, main)


class QualityTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)

    def make_prices(self, *, name='coinbase', days=20, damaged=None):
        folder = self.root / name
        folder.mkdir()
        start = date(2026, 9, 1)
        file = folder / 'prices.csv'
        with file.open('w', newline='', encoding='utf-8') as output:
            writer = csv.writer(output)
            writer.writerow(['date', 'Low', 'High', 'Open', 'Close', 'Volume'])
            for n in range(days):
                if damaged == 'gap' and n == 7:
                    continue
                date_ = start + timedelta(days=n)
                if damaged == 'duplicate' and n == 7:
                    date_ = start + timedelta(days=6)
                low, high, opening, closing, volume = 90+n, 120+n, 100+n, 105+n, 10+n
                if damaged == 'bad_ohlc' and n == 7:
                    low = 5000
                writer.writerow([date_.isoformat(), low, high, opening, closing, volume])
        (folder / 'provenance.json').write_text(json.dumps({
            'source':'coinbase-exchange', 'venue':'coinbase-exchange', 'instrument':'BTC/USD',
            'requested_start': start.isoformat(),
            'requested_end_exclusive': datetime.combine(start+timedelta(days=days), datetime.min.time(),timezone.utc).isoformat(),
            'fetched_at':'2026-10-01T12:00:00+00:00',
            'data_sha256':hashlib.sha256(file.read_bytes()).hexdigest()}),encoding='utf-8')
        return folder

    def make_onchain(self, name, date_, observed, val, *, state='observed'):
        folder = self.root / name
        write_artifact({'source':'coinmetrics-community',
                        'requested_start':date_,
                        'requested_end_exclusive':(date.fromisoformat(date_)+timedelta(days=1)).isoformat(),
                        'metrics':('TxCnt',), 'observed_at':observed,
                        'historical_backtest_safe':False, 'missing_days':[], 'pages':[],
                        'rows':[{'date':date_, 'metric':'TxCnt', 'value':val if state=='observed' else None,
                                 'state':state, 'observed_at':observed}]}, folder)
        return folder

    def test_complete_coinbase_passes_and_is_hash_bound(self):
        folder = self.make_prices()
        result = prices_report(folder, as_of='2026-10-02T00:00:00Z', max_age_days=32)
        self.assertEqual(result['quality_gate'], 'pass')
        self.assertEqual(result['summary']['coverage_pct'], 100)
        self.assertFalse(result['historical_backtest_safe'])
        report = self.root / 'quality.json'
        report.write_text(json.dumps(result))
        verified = verify_quality_report(report, folder / 'prices.csv')
        self.assertEqual(verified['data_sha256'], result['data_sha256'])
        with (folder / 'prices.csv').open('a') as out:
            out.write('bad')
        with self.assertRaisesRegex(ValueError, 'different artifact'):
            verify_quality_report(report, folder / 'prices.csv')

    def test_duplicate_gap_and_invalid_ohlc_fail(self):
        for issue, code in [('gap','daily_coverage'),('duplicate','unique_dates'),('bad_ohlc','ohlcv_invariants')]:
            with self.subTest(issue=issue):
                folder = self.make_prices(name=issue,damaged=issue)
                r = prices_report(folder, as_of='2026-10-02T00:00:00Z')
                self.assertEqual(r['quality_gate'], 'fail')
                self.assertIn(code, [x['code'] for x in r['checks'] if x['result']=='fail'])

    def test_asof_prevents_false_historical_access_and_freshness(self):
        folder = self.make_prices()
        r = prices_report(folder, as_of='2026-09-21T00:00:00Z')
        self.assertEqual(r['quality_gate'], 'fail')
        self.assertIn('snapshot_available', [x['code'] for x in r['checks'] if x['result']=='fail'])
        stale = prices_report(folder, as_of='2026-10-11T00:00:00Z', max_age_days=1)
        self.assertEqual(stale['quality_gate'], 'fail')

    def test_cli_writes_failing_report_instead_of_silent_success(self):
        folder = self.make_prices()
        (folder/'prices.csv').write_text('tampered',encoding='utf-8')
        dest=self.root/'quality_failed.json'
        with patch('builtins.print'):
            self.assertEqual(main(['prices','--artifact',str(folder),'--output',str(dest)]), 1)
        report = json.loads(dest.read_text())
        self.assertEqual(report['quality_gate'],'fail')
        self.assertEqual(report['checks'][0]['code'], 'validation_exception')
        with self.assertRaises(FileExistsError):
            with patch('builtins.print'):
                main(['prices','--artifact',str(folder),'--output',str(dest)])

    def test_onchain_revisions_preserved_and_missing_fails_threshold(self):
        database = self.root / 'observations.sqlite'
        ingest_artifact(self.make_onchain('first','2026-10-09','2026-10-10T02:00:00+00:00','100'),database)
        ingest_artifact(self.make_onchain('revised','2026-10-09','2026-10-11T02:00:00+00:00','120'),database)
        ingest_artifact(self.make_onchain('missing','2026-10-10','2026-10-11T02:00:00+00:00','',state='missing_metric'),database)
        report=onchain_report(database,as_of='2026-10-12T00:00:00Z',min_coverage=0.9)
        self.assertEqual(report['summary']['revision_rows'],1)
        self.assertEqual(report['summary']['metrics'][0]['missing_metric'],1)
        self.assertEqual(report['quality_gate'],'fail')
        self.assertFalse(report['historical_backtest_safe'])
        clean=onchain_report(database,as_of='2026-10-10T18:00:00Z',min_coverage=1.0)
        self.assertEqual(clean['quality_gate'],'pass')
        self.assertEqual(clean['summary']['eligible_revisions'],1)

    def test_sqlite_invalid_time_is_flagged(self):
        database = self.root / 'observations.sqlite'
        ingest_artifact(self.make_onchain('good','2026-10-09','2026-10-10T02:00:00+00:00','100'),database)
        with sqlite3.connect(database) as con:
            con.execute("UPDATE observations SET observed_at='2026-10-09T00:00:00+00:00'")
        r=onchain_report(database,as_of='2026-10-12T00:00:00Z')
        self.assertEqual(r['quality_gate'], 'fail')
        self.assertTrue(r['summary']['invalid_examples'])

    def test_legacy_is_research_only_even_if_clean(self):
        folder=self.make_prices()
        report=legacy_prices_report(folder/'prices.csv')
        self.assertEqual(report['quality_gate'],'research_only')
        self.assertFalse(report['historical_backtest_safe'])

    def test_crossvenue_overlap_not_blended(self):
        folder=self.make_prices()
        ref=self.root/'kraken.csv'
        with ref.open('w',newline='',encoding='utf-8') as f:
            w=csv.writer(f)
            w.writerow(['date','Close'])
            for i in range(20):
                w.writerow([(date(2026,9,1)+timedelta(days=i)).isoformat(),(105+i)*1.002])
        r=crosscheck_report(folder,ref,min_overlap=15,max_difference_bps=25,max_breach_pct=0)
        self.assertEqual(r['quality_gate'],'pass')
        self.assertEqual(r['summary']['overlap_days'],20)
        fail=crosscheck_report(folder,ref,min_overlap=15,max_difference_bps=10,max_breach_pct=0)
        self.assertEqual(fail['quality_gate'],'fail')
        self.assertEqual(fail['summary']['breach_days'],20)


if __name__ == '__main__':
    unittest.main()
