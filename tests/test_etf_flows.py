"""Deterministic free ETF HTML parsing, canonical history and export tests."""
from datetime import datetime, timezone
from pathlib import Path
import importlib.util
import json
import sqlite3
import tempfile
import unittest

from market_data.etf_flows import (
    URL, parse_farside_html, fetch_public_html, ingest_html, rows_asof, status,
    quality_report, export_parquet, verify_parquet,
)

HAS_DUCKDB = importlib.util.find_spec('duckdb') is not None
T1='2026-10-12T07:00:00Z'
T2='2026-10-12T07:05:00Z'
HEADER='<tr><th>Date</th><th>IBIT</th><th>FBTC</th><th>BITB</th><th>ARKB</th><th>GBTC</th><th>Total</th></tr>'
FIRST=['11 Jan 2024','111.7','227.0','237.9','65.3','(95.1)','546.8']
HOLIDAY=['15 Jan 2024','-','-','-','-','-','0.0']
THIRD=['16 Jan 2024','0.0','200.0','-','10.5','(30.5)','180.0']


def page(*rows, header=HEADER):
    def cells(r):
        return '<tr>'+''.join('<td>'+s+'</td>' for s in r)+'</tr>'
    return ('<!doctype html><html><head><title>Bitcoin ETF Flow – All Data (US$m)</title></head>'
            '<body><h1>Bitcoin ETF Flow</h1><table>'+header+''.join(cells(r) for r in rows)
            +'<tr><th>Total</th><td>1</td></tr></table></body></html>').encode()


class FakeResponse:
    def __init__(self, body=b'abc', status=200, content_type='text/html',retry_after='0'):
        self.status_code=status
        self.headers={'Content-Type':content_type,'Retry-After':retry_after}
        self.body=body
    def __enter__(self):return self
    def __exit__(self,*args):return False
    def iter_content(self,size):
        for i in range(0,len(self.body),size):yield self.body[i:i+size]


class EtfFlowsTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.db=self.root/'etf.sqlite'

    def ingest(self,html=None,at=T1):
        return ingest_html(html or page(FIRST,HOLIDAY,THIRD),self.db,observed_at=at)

    def test_public_farside_parse_preserves_missing_not_zero(self):
        rows=parse_farside_html(page(FIRST,HOLIDAY,THIRD))
        self.assertEqual([r['session'] for r in rows],['2024-01-11','2024-01-15','2024-01-16'])
        self.assertEqual(rows[0]['total_usd_m'],'546.8')
        self.assertEqual(rows[0]['funds']['GBTC'],'-95.1')
        self.assertEqual(rows[1]['reporting_state'],'NO_FUND_DATA')
        self.assertIsNone(rows[1]['funds']['FBTC'])
        self.assertEqual(rows[1]['total_usd_m'],'0')
        self.assertEqual(rows[2]['funds']['IBIT'],'0')
        self.assertIsNone(rows[2]['funds']['BITB'])
        self.assertEqual(rows[2]['reporting_state'],'REPORTED')

    def test_refuses_wrong_page_or_ambiguous_tables(self):
        with self.assertRaisesRegex(ValueError,'Not a Bitcoin'):
            parse_farside_html(b'<html><table><tr><td>foo</td></tr></table></html>')
        original=page(FIRST)
        with self.assertRaisesRegex(ValueError,'precisely one'):
            parse_farside_html(original.replace(b'</table>',b'</table><table>'+HEADER.encode()+b'</table>',1))

    def test_rejects_duplicate_days_and_wrong_width(self):
        with self.assertRaisesRegex(ValueError,'Duplicate'):
            parse_farside_html(page(FIRST,FIRST))
        with self.assertRaisesRegex(ValueError,'misalignment'):
            parse_farside_html(page(FIRST[:-1]))

    def test_bad_units_and_wrong_total_fail_before_sqlite(self):
        wrong=[*FIRST];wrong[-1]='160.0'
        with self.assertRaisesRegex(ValueError,'disagrees'):
            self.ingest(page(wrong))
        self.assertFalse(self.db.exists())
        wrong=[*FIRST];wrong[1]='nan'
        with self.assertRaisesRegex(ValueError,'Unrecognized'):
            self.ingest(page(wrong))
        self.assertFalse(self.db.exists())

    def test_missing_fund_partial_only_total_not_zero(self):
        rows=parse_farside_html(page(THIRD))
        self.assertEqual(rows[0]['reporting_state'],'REPORTED')
        self.assertIsNone(rows[0]['funds']['BITB'])
        no_total=[*THIRD];no_total[-1]='-'
        rows=parse_farside_html(page(no_total))
        self.assertEqual(rows[0]['reporting_state'],'TOTAL_UNREPORTED')
        self.assertIsNone(rows[0]['total_usd_m'])

    def test_idempotent_snapshots_and_canonical_revisions(self):
        initial=self.ingest()
        self.assertEqual(initial['rows'],3)
        self.assertEqual(initial['new_versions'],3)
        again=self.ingest()
        self.assertTrue(again['duplicate_snapshot'])
        later=self.ingest(at=T2)
        self.assertEqual(later['new_versions'],0)
        st=status(self.db)
        self.assertEqual(st['snapshots'],2)
        self.assertEqual(st['revision_versions'],3)
        self.assertEqual(st['distinct_sessions'],3)
        self.assertEqual(st['reporting_states']['NO_FUND_DATA'],1)

    def test_asof_keeps_old_value_after_update_and_no_lookahead(self):
        self.ingest()
        update=[*FIRST];update[1]='121.7';update[-1]='556.8'
        self.ingest(page(update,HOLIDAY,THIRD),T2)
        rows=rows_asof(self.db,as_of='2026-10-12T07:03:00Z')
        self.assertEqual(rows[0]['funds']['IBIT'],'111.7')
        self.assertEqual(rows[0]['total_usd_m'],'546.8')
        self.assertEqual(rows_asof(self.db,as_of='2026-10-12T06:59:59Z'),[])
        later=rows_asof(self.db,as_of='2026-10-12T07:06:00Z')
        self.assertEqual(later[0]['total_usd_m'],'556.8')
        self.assertEqual(status(self.db)['revised_sessions'],1)
        self.assertEqual(len(later),3)

    def test_explicit_future_session_rejected(self):
        future=[*FIRST];future[0]='15 Oct 2026'
        with self.assertRaisesRegex(ValueError,'future sessions'):
            self.ingest(page(future))

    def test_quality_counts_not_reported_separately(self):
        self.ingest()
        report=quality_report(self.db,as_of=T2)
        self.assertEqual(report['quality_gate'],'pass')
        self.assertEqual(report['summary']['reported_sessions'],2)
        self.assertEqual(report['summary']['no_fund_data_sessions'],1)
        self.assertEqual(report['summary']['per_fund_missing']['BITB'],2)
        self.assertFalse(report['historical_backtest_safe'])
        self.assertEqual(quality_report(self.db,as_of=T2,start='2024-01-15',end='2024-01-15')['quality_gate'],'fail')

    def test_integrates_with_common_quality_report(self):
        from market_data.quality import etf_flows_report
        self.ingest()
        report=etf_flows_report(self.db,as_of=T2)
        self.assertEqual(report['schema_version'],'iris-data-quality/v1')
        self.assertEqual(report['source'],'farside-investors')
        self.assertEqual(report['quality_gate'],'pass')
        self.assertEqual(report['summary']['unit'],'USD_millions')
        self.assertFalse(report['historical_backtest_safe'])

    def test_fails_closed_on_http403_redirect_or_json(self):
        for code in (301,403):
            with self.assertRaises(RuntimeError):
                fetch_public_html(get=lambda *a,**kw: FakeResponse(status=code))
        with self.assertRaisesRegex(ValueError,'not HTML'):
            fetch_public_html(get=lambda *a,**kw: FakeResponse(content_type='application/json'))
        self.assertFalse(self.db.exists())

    def test_http_fetch_uses_one_fixed_keyless_host_and_bounded_retry(self):
        received=[]
        codes=[429,200]
        def get(url,**kwargs):
            received.append((url,kwargs))
            return FakeResponse(page(FIRST),status=codes.pop(0))
        raw=fetch_public_html(get=get,sleep=lambda *_:None)
        self.assertEqual(parse_farside_html(raw)[0]['session'],'2024-01-11')
        self.assertEqual(len(received),2)
        for url,kwargs in received:
            self.assertEqual(url,URL)
            self.assertFalse(kwargs['allow_redirects'])
            self.assertTrue(kwargs['stream'])
            self.assertFalse('Authorization' in kwargs['headers'])

    def test_oversized_provider_payload_rejected(self):
        with self.assertRaisesRegex(ValueError,'bounded size'):
            fetch_public_html(get=lambda *a,**kw: FakeResponse(body=b'x'*(5*1024*1024+1)))
        self.assertFalse(self.db.exists())

    @unittest.skipUnless(HAS_DUCKDB,'Optional DuckDB is exercised in GitHub CI')
    def test_immutable_parquet_and_sha_verify(self):
        self.ingest()
        folder=self.root/'parquet_v1'
        exp=export_parquet(self.db,folder,as_of=T2)
        self.assertEqual(exp['sessions'],3)
        verified=verify_parquet(folder)
        self.assertTrue(verified['verified'])
        self.assertEqual(verified['fund_rows'],15)
        import duckdb
        with duckdb.connect(':memory:') as db:
            val=db.execute('SELECT flow_usd_m,value_state FROM read_parquet(?) WHERE session=? AND ticker=?',
                [str(folder/'fund_flows.parquet'),'2024-01-15','IBIT']).fetchone()
            self.assertEqual(val,(None,'not_reported'))
        with self.assertRaises(FileExistsError):
            export_parquet(self.db,folder,as_of=T2)
        with (folder/'fund_flows.parquet').open('ab') as f:f.write(b'BROKEN')
        with self.assertRaisesRegex(ValueError,'SHA256'):
            verify_parquet(folder)


if __name__=='__main__':unittest.main()
