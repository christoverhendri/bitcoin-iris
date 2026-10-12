"""Offline wire, UTXO-subset, rollback, source-budget and artifact regression tests."""
import hashlib
import importlib.util
import json
import sqlite3
import struct
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from market_data.chain import VERSION
from market_data.chain.providers import BudgetExceeded, Coin, Core, Esplora, Transport, btc_to_sat
from market_data.chain.wire import (GENESIS, MAX_MONEY, ZERO, Reader, merkle, parse_block,
                                    parse_transaction, script_type, sha256d, transaction)
from market_data.chain.store import (analyze, compare_stats, connect, scan, status, verify_store, writer_lock)

PKH = bytes.fromhex('76a914') + b'\x11'*20 + bytes.fromhex('88ac')


def compact(n):
    if n < 253:
        return bytes([n])
    return b'\xfd'+struct.pack('<H',n) if n < 65536 else b'\xfe'+struct.pack('<I',n)


def txraw(inputs=None, outputs=None, coinbase=False, tag=1, witness=None):
    inputs = [(ZERO,0xffffffff)] if coinbase else (inputs or [('11'*32,0)])
    outputs = outputs if outputs is not None else [(50*100_000_000,PKH)]
    data = b'\x01\x00\x00\x00' + (b'\x00\x01' if witness is not None else b'') + compact(len(inputs))
    for h,v in inputs:
        script = struct.pack('<I',tag) if coinbase else b''
        data += bytes.fromhex(h)[::-1]+struct.pack('<I',v)+compact(len(script))+script+b'\xff'*4
    data += compact(len(outputs))
    for value,script in outputs:
        data += struct.pack('<Q',value)+compact(len(script))+script
    if witness is not None:
        for items in witness:
            data += compact(len(items))
            for item in items:
                data += compact(len(item))+item
    return data+b'\x00'*4


def txparse(raw):
    reader=Reader(raw)
    return transaction(reader)


def blockraw(parent, txs, timestamp=1700000000):
    root=merkle([bytes.fromhex(txparse(t).txid)[::-1] for t in txs])
    header=struct.pack('<I',1)+bytes.fromhex(parent)[::-1]+root+struct.pack('<III',timestamp,0x1d00ffff,0)
    raw=header+compact(len(txs))+b''.join(txs)
    return sha256d(header)[::-1].hex(),raw


GENESIS_RAW = bytes.fromhex(
 '01000000'+'00'*32+'3ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a'
 '29ab5f49ffff001d1dac2b7c01'
 '0100000001'+'00'*32+'ffffffff4d04ffff001d010445'
 '5468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73'
 'ffffffff0100f2052a01000000434104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac00000000')


class WireTests(unittest.TestCase):
    def test_real_genesis_hash_merkle_weight(self):
        block=parse_block(GENESIS_RAW,GENESIS)
        self.assertEqual(block.weight,1140)
        self.assertEqual(block.transactions[0].outputs[0].value,5_000_000_000)
        self.assertEqual(block.transactions[0].txid,'4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b')

    def test_noncanonical_varint_and_truncation(self):
        with self.assertRaises(ValueError): Reader(b'\xfd\x01\x00').compact()
        with self.assertRaises(ValueError): Reader(b'\x00').read(2)
        with self.assertRaises(ValueError): parse_block(GENESIS_RAW[:-1],GENESIS)

    def test_merkle_and_header_tampering(self):
        with self.assertRaises(ValueError): parse_block(bytes([2])+GENESIS_RAW[1:],GENESIS)
        raw=bytearray(GENESIS_RAW); raw[-5]^=1
        with self.assertRaises(ValueError): parse_block(bytes(raw),GENESIS)

    def test_money_precision_and_bounds(self):
        self.assertEqual(btc_to_sat(Decimal('0.00000001')),1)
        for v in (0.1, True, Decimal('0.000000001'),Decimal('NaN')):
            with self.assertRaises(ValueError): btc_to_sat(v)
        with self.assertRaises(ValueError): txparse(txraw(outputs=[(MAX_MONEY+1,PKH)]))

    def test_scripts_preserve_unknown(self):
        for script,expected in [(PKH,'p2pkh'),(b'\x6a\x00','nulldata'),
                                (b'\x00\x14'+b'\x00'*20,'p2wpkh'),
                                (b'\x51\x20'+b'\x00'*32,'p2tr'),(b'\xff','unknown')]:
            self.assertEqual(script_type(script),expected)

    def test_segwit_hashes_and_commitment(self):
        spend=txraw(outputs=[(100,PKH)],witness=[(b'hello',)])
        parsed=txparse(spend)
        self.assertNotEqual(parsed.txid,parsed.wtxid)
        root=merkle([bytes(32),bytes.fromhex(parsed.wtxid)[::-1]])
        commitment=bytes.fromhex('6a24aa21a9ed')+sha256d(root+bytes(32))
        cb=txraw(coinbase=True,outputs=[(5_000_000_000,PKH),(0,commitment)],witness=[(bytes(32),)])
        h,raw=blockraw(ZERO,[cb,spend])
        self.assertEqual(len(parse_block(raw,h,verify_pow=False).transactions),2)
        changed=raw.replace(b'hello',b'jello')
        with self.assertRaises(ValueError): parse_block(changed,h,verify_pow=False)

    def test_duplicate_spends_and_merkle_mutation(self):
        with self.assertRaises(ValueError): txparse(txraw(inputs=[('11'*32,0),('11'*32,0)]))
        with self.assertRaises(ValueError): merkle([bytes(32),bytes(32)])

    def test_uncommitted_witness_and_coinbase_position(self):
        spend=txraw(outputs=[(1,PKH)],witness=[(b'a',)])
        h,raw=blockraw(ZERO,[txraw(coinbase=True),spend])
        with self.assertRaises(ValueError): parse_block(raw,h,verify_pow=False)
        h,raw=blockraw(ZERO,[txraw(outputs=[(1,PKH)])])
        with self.assertRaises(ValueError): parse_block(raw,h,verify_pow=False)


class FakeSource:
    name='fixture-source'
    def __init__(self, start=200000):
        self.start=start
        self.blocks={}
        self.coins={('11'*32,0):Coin(1000,PKH,start-100,1699999000,False,'fixture')}
        self.proofs={}; self.prevout_errors=0
        self.http=SimpleNamespace(evidence=[],requests=0,bytes=0)
        self.anchor='aa'*32
        self.fail_height=None

    def tip(self): return max(self.blocks)+100
    def block_hash(self,height):
        if height==0:return GENESIS
        if height==self.start-1:return self.anchor
        return self.blocks[height][0]
    def raw_block(self,h):
        for height,(bh,raw) in self.blocks.items():
            if bh==h:
                if self.fail_height==height:raise RuntimeError('fixture failure')
                return raw
        raise ValueError('Missing fake block')
    def prepare(self,block):pass
    def stats(self,h):return None
    def coin(self,txid,vout):return self.coins.get((txid,vout))
    def add(self,height,spend=None,tag=None):
        parent=self.anchor if height==self.start else self.blocks[height-1][0]
        txs=[txraw(coinbase=True,tag=height if tag is None else tag)]
        if spend:txs.append(spend)
        self.blocks[height]=blockraw(parent,txs,1700000000+(height-self.start)*600)


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.path=Path(self.tmp.name)/'blocks.sqlite'
        self.source=FakeSource(); self.h=self.source.start
        self.patcher=patch('market_data.chain.store.parse_block',side_effect=lambda raw,h:parse_block(raw,h,verify_pow=False))
        self.patcher.start();self.addCleanup(self.patcher.stop)

    def runscan(self,end=None,**kwargs):
        return scan(self.source,self.path,start=self.h,end=end or self.h+1,**kwargs)

    def test_idempotent_resume_and_input_fee(self):
        spend=txraw(outputs=[(900,PKH)])
        self.source.add(self.h,spend)
        self.assertEqual(self.runscan()['added_blocks'],1)
        self.assertEqual(self.runscan()['added_blocks'],0)
        self.assertEqual(status(self.path)['transactions'],2)
        self.assertEqual(verify_store(self.path)['quality_gate'],'pass')
        with connect(self.path,readonly=True) as db:
            s=json.loads(db.execute('SELECT summary FROM blocks').fetchone()[0])
        self.assertEqual(s['fees_total_sat'],100)
        self.assertEqual(s['input_count'],1)

    def test_missing_prevout_is_not_zero_fee(self):
        self.source.coins={}; self.source.add(self.h,txraw(outputs=[(900,PKH)]))
        self.runscan()
        self.assertEqual(status(self.path)['missing_prevouts'],1)
        self.assertEqual(verify_store(self.path)['quality_gate'],'partial')
        with connect(self.path,readonly=True) as db:
            self.assertIsNone(json.loads(db.execute('SELECT summary FROM blocks').fetchone()[0])['fees_total_sat'])

    def test_intrablock_spend_and_coin_age(self):
        a=txraw(outputs=[(900,PKH)])
        b=txraw(inputs=[(txparse(a).txid,0)],outputs=[(800,PKH)])
        parent=self.source.anchor
        self.source.blocks[self.h]=blockraw(parent,[txraw(coinbase=True,tag=self.h),a,b])
        self.runscan()
        self.assertEqual(status(self.path)['tracked_unspent_outputs'],2)
        with connect(self.path,readonly=True) as db:
            s=json.loads(db.execute('SELECT summary FROM blocks').fetchone()[0])
        self.assertEqual(s['fees_total_sat'],200)
        self.assertEqual(s['age_height_known_inputs'],2)

    def test_reorg_restores_previously_spent_output(self):
        a=txraw(outputs=[(900,PKH)]); self.source.add(self.h,a)
        b=txraw(inputs=[(txparse(a).txid,0)],outputs=[(800,PKH)])
        self.source.add(self.h+1,b); self.runscan(self.h+2)
        self.source.add(self.h+1,tag=7654)
        result=self.runscan(self.h+2)
        self.assertEqual(result['detached_blocks'],1)
        with connect(self.path,readonly=True) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM spends').fetchone()[0],1)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM blocks').fetchone()[0],3)
        self.assertEqual(status(self.path)['tracked_unspent_outputs'],3)

    def test_failure_keeps_completed_blocks_only(self):
        self.source.add(self.h); self.source.add(self.h+1)
        self.source.fail_height=self.h+1
        with self.assertRaises(RuntimeError):self.runscan(self.h+2)
        self.assertEqual(status(self.path)['blocks'],1)
        self.source.fail_height=None
        self.assertEqual(self.runscan(self.h+2)['added_blocks'],1)

    def test_block_budget_and_exclusive_end(self):
        for i in range(3):self.source.add(self.h+i)
        self.assertEqual(self.runscan(self.h+3,max_blocks=1)['next_height'],self.h+1)
        self.assertEqual(self.runscan(self.h+3,max_blocks=1)['next_height'],self.h+2)

    def test_changed_anchor_cannot_silently_rewrite_range(self):
        self.source.add(self.h);self.runscan()
        self.source.anchor='bb'*32
        with self.assertRaises(ValueError):self.runscan()
        self.assertEqual(status(self.path)['blocks'],1)

    def test_immature_coinbase_and_negative_fees_fail_atomically(self):
        self.source.coins[('11'*32,0)]=Coin(10,PKH,self.h-1,1699999000,True,'fixture')
        self.source.add(self.h,txraw(outputs=[(900,PKH)]))
        with self.assertRaises(ValueError):self.runscan()
        self.assertEqual(status(self.path)['blocks'],0)
        self.source.coins[('11'*32,0)]=Coin(10,PKH,self.h-101,1699999000,False,'fixture')
        with self.assertRaises(ValueError):self.runscan()

    def test_double_spend_across_blocks_rolls_back_new_block(self):
        self.source.add(self.h,txraw(outputs=[(900,PKH)]))
        self.source.add(self.h+1,txraw(outputs=[(800,PKH)]))
        with self.assertRaises(ValueError):self.runscan(self.h+2)
        self.assertEqual(status(self.path)['blocks'],1)

    def test_unknown_foreign_database_rejected(self):
        with sqlite3.connect(self.path) as db:db.execute('CREATE TABLE unrelated(x)')
        self.source.add(self.h)
        with self.assertRaises(ValueError):self.runscan()

    def test_corrupted_archive_is_detected(self):
        self.source.add(self.h);self.runscan()
        with sqlite3.connect(self.path) as db:db.execute("UPDATE blocks SET raw_sha256='bad'")
        with self.assertRaises(ValueError):verify_store(self.path)

    def test_projection_tampering_detected(self):
        self.source.add(self.h);self.runscan()
        with sqlite3.connect(self.path) as db:db.execute('UPDATE outputs SET value_sat=value_sat+1')
        with self.assertRaises(ValueError):verify_store(self.path)

    def test_reorg_budget_refuses_mutation(self):
        for i in range(3):self.source.add(self.h+i)
        self.runscan(self.h+3)
        for i in range(3):self.source.add(self.h+i,tag=900+i)
        with self.assertRaises(ValueError):self.runscan(self.h+3,max_reorg=1)
        self.assertEqual(status(self.path)['blocks'],3)

    def test_coinbase_only_genesis_creates_no_utxo(self):
        self.source.start=self.h=0
        self.source.blocks[0]=(GENESIS,GENESIS_RAW)
        self.source.anchor=ZERO
        self.runscan()
        self.assertEqual(status(self.path)['tracked_unspent_outputs'],0)
        self.assertEqual(verify_store(self.path)['blocks'],1)

    def test_getblockstats_comparison_definitions(self):
        h,raw=blockraw(ZERO,[txraw(coinbase=True),txraw(outputs=[(900,PKH)])])
        s,*_=analyze(parse_block(raw,h,verify_pow=False),self.h,lambda k:self.source.coins[k],lambda k:False)
        mapping={'blockhash':'block_hash','height':'height','txs':'tx_count','ins':'input_count','outs':'output_count',
          'total_out':'non_coinbase_output_sat','total_size':'non_coinbase_size','total_weight':'non_coinbase_weight',
          'subsidy':'subsidy_sat','utxo_increase':'output_minus_input_count','totalfee':'fees_total_sat'}
        stats={k:s[v] for k,v in mapping.items()}
        self.assertEqual(compare_stats(s,stats)['status'],'pass')
        stats['totalfee']+=1
        with self.assertRaises(ValueError):compare_stats(s,stats)


class Response:
    def __init__(self,data,code=200,kind='application/octet-stream',retry=None):
        self.data=data;self.status_code=code;self.headers={'Content-Type':kind}
        if retry is not None:self.headers['Retry-After']=retry
    def __enter__(self):return self
    def __exit__(self,*args):return False
    def iter_content(self,n):yield self.data


class SourceTests(unittest.TestCase):
    def test_budget_counts_retries(self):
        calls=[]
        def request(*a,**kw):calls.append(kw);return Response(b'',429,retry='0')
        t=Transport(max_requests=2,request=request,sleep=lambda x:None)
        with self.assertRaises(BudgetExceeded):t.read('GET','https://blockstream.info/api/test',binary=True)
        self.assertEqual(len(calls),2)
        self.assertTrue(all(not c['allow_redirects'] for c in calls))
        t.close()

    def test_redirect_and_html_are_not_bypassed(self):
        for response in (Response(b'',302),Response(b'captcha',kind='text/html')):
            t=Transport(request=lambda *a,**k:response,sleep=lambda x:None)
            with self.assertRaises((RuntimeError,ValueError)):t.read('GET','https://blockstream.info/api/test')
            t.close()

    def test_rpc_loopback_only_and_read_only_methods(self):
        for url in ('http://evil.test:8332','http://127.0.0.1@evil.test','http://127.0.0.1:8332/wallet/a'):
            with self.assertRaises(ValueError):Core(Transport(),Path('/no-cookie'),url)
        core=Core(Transport(),Path('/no-cookie'))
        with self.assertRaises(ValueError):core.rpc('sendrawtransaction',[])
        core.http.close()

    def test_rpc_exact_decimal_and_credentials_never_in_evidence(self):
        with tempfile.TemporaryDirectory() as temp:
            cookie=Path(temp)/'cookie';cookie.write_text('user:secret')
            def request(method,url,**kw):
                self.assertEqual(kw['auth'],('user','secret'))
                return Response(b'{"id":"iris-block","error":null,"result":0.00000001}',kind='application/json')
            t=Transport(request=request,sleep=lambda x:None);c=Core(t,cookie)
            self.assertEqual(btc_to_sat(c.rpc('getblockstats',[1])[0]),1)
            self.assertNotIn('secret',json.dumps(t.evidence))
            t.close()


@unittest.skipUnless(importlib.util.find_spec('duckdb'),'Optional DuckDB installed in repository CI')
class WarehouseTests(unittest.TestCase):
    setUp = StoreTests.setUp
    runscan = StoreTests.runscan
    def test_parquet_roundtrip_and_reorg_invalidation(self):
        from market_data.chain.warehouse import export,verify
        self.source.add(self.h);self.source.add(self.h+1);self.runscan(self.h+2)
        out=Path(self.tmp.name)/'snapshot'
        export(self.path,out)
        self.assertTrue(verify(out,self.path)['canonical_checked'])
        with self.assertRaises(FileExistsError):export(self.path,out)
        self.source.add(self.h+1,tag=333);self.runscan(self.h+2)
        with self.assertRaises(ValueError):verify(out,self.path)
        self.assertTrue(verify(out)['verified'])

    def test_parquet_tamper_rejected(self):
        from market_data.chain.warehouse import export,verify
        self.source.add(self.h);self.runscan()
        out=Path(self.tmp.name)/'snapshot';export(self.path,out)
        with (out/'blocks.parquet').open('ab') as f:f.write(b'bad')
        with self.assertRaises(ValueError):verify(out)
