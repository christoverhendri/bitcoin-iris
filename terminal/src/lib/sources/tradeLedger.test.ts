import {afterEach,describe,it,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openTradeLedger,storeTradePage,parseTrade,timestampUs,decimalUnits} from '../../../scripts/coinbase-trade-ledger.mjs';
import {readTradeProfile,TradeLedgerError} from './tradeLedger';
const directories:string[]=[];
afterEach(()=>{for(const directory of directories.splice(0)){if(!resolve(directory).startsWith(resolve(tmpdir())+sep))throw new Error('Unsafe test cleanup');rmSync(directory,{recursive:true,force:true});}});
const sample=[{trade_id:3,time:'2020-01-01T00:00:02.000003Z',price:'100.00000000',size:'0.10000001',side:'buy'},{trade_id:2,time:'2020-01-01T00:00:01.000002Z',price:'120.00000000',size:'0.20000002',side:'sell'}];
const observed=Date.UTC(2026,0,1)*1000;
function fixture(){const directory=mkdtempSync(join(tmpdir(),'iris-trade-test-'));directories.push(directory);const file=join(directory,'ledger.sqlite');const db=openTradeLedger(file);return {file,db};}
function params(strict=false){return new URLSearchParams({start:'2020-01-01T00:00:00Z',end:'2020-01-01T00:00:03Z',cutoff:'2020-01-01T00:00:03Z',bins:'2',strict:String(strict)});}
describe('Coinbase execution ledger',()=>{
  it('preserves microsecond timestamps and decimal quantities; rejects malformed/future records',()=>{
    expect(timestampUs(sample[0].time)).toBe(Date.UTC(2020,0,1,0,0,2)*1000+3);
    expect(decimalUnits('0.00000001')).toBe('1');
    expect(()=>decimalUnits('1e-8')).toThrow();expect(()=>decimalUnits('0.123456789')).toThrow();
    expect(()=>timestampUs('2020-02-30T00:00:00Z')).toThrow();
    expect(()=>parseTrade(sample[0],Date.UTC(2019,0,1)*1000)).toThrow();
    expect(()=>parseTrade({...sample[0],product_id:'ETH-USD'},observed)).toThrow();
  });
  it('deduplicates overlap, preserves first observation and atomically rejects conflicting trades',()=>{
    const {db}=fixture();
    expect(storeTradePage(db,sample,observed,{next:'2'}).inserted).toBe(2);
    expect(storeTradePage(db,sample,observed+1000,{next:'2'}).inserted).toBe(0);
    expect(db.prepare('SELECT observed_at_us FROM trades WHERE trade_id=3').get()?.observed_at_us).toBe(observed);
    expect(()=>storeTradePage(db,[{...sample[0],trade_id:4},{...sample[1],price:'999'}],observed,{next:'2'})).toThrow(/Conflicting/);
    expect(db.prepare('SELECT COUNT(*) AS n FROM trades').get()?.n).toBe(2);db.close();
  });
  it('sums actual execution prices/sizes exactly and conserves volume across bins',()=>{
    const {file,db}=fixture();storeTradePage(db,sample,observed,{next:'2'});db.close();
    const profile=readTradeProfile(params(),file,observed/1000+1000);
    expect(profile.tradeCount).toBe(2);expect(profile.totalVolumeBtc).toBe('0.30000003');
    expect(profile.totalNotionalUsd).toBe('34.0000034000000000');
    expect(profile.bins.map(b=>b.volumeBtc)).toEqual(['0.10000001','0.20000002']);
    expect(profile.captured.start).toBe('2020-01-01T00:00:01.000002Z');
    expect(profile.coverage).toBe('PARTIAL');expect(profile.idRangeHoles).toBe(0);
    expect(readTradeProfile(params(true),file,observed/1000+1000)).toMatchObject({tradeCount:0,coverage:'EMPTY',excludedByObservationCutoff:2,totalVolumeBtc:'0.00000000'});
  });
  it('detects ID holes, corrupt payloads and invalid ranges without a candle fallback',()=>{
    const {file,db}=fixture();storeTradePage(db,[sample[0],{...sample[1],trade_id:1}],observed,{next:'1'});
    expect(readTradeProfile(params(),file,observed/1000+1000).idRangeHoles).toBe(1);
    db.prepare('UPDATE trades SET size_units=? WHERE trade_id=3').run('999');
    expect(()=>readTradeProfile(params(),file,observed/1000+1000)).toThrow(TradeLedgerError);
    const bad=params();bad.set('end','2019-01-01T00:00:00Z');expect(()=>readTradeProfile(bad,file,observed/1000+1000)).toThrow();db.close();
  });
  it('uses adjacent boundary trades for continuity evidence and honors microsecond range edges',()=>{
    const {file,db}=fixture();storeTradePage(db,[{...sample[0],trade_id:4,time:'2020-01-01T00:00:03.000004Z'},...sample,{...sample[1],trade_id:1,time:'2020-01-01T00:00:00.000001Z'}],observed,{next:'1'});db.close();
    const p=params();p.set('start',sample[1].time);p.set('end','2020-01-01T00:00:02.000004Z');
    expect(readTradeProfile(p,file,observed/1000+1000)).toMatchObject({tradeCount:2,coverage:'CONTIGUOUS_ID_EVIDENCE',totalVolumeBtc:'0.30000003'});
    p.set('end',sample[0].time);
    expect(readTradeProfile(p,file,observed/1000+1000).tradeCount).toBe(1);
  });
  it('refuses to initialize over unrelated candle storage',()=>{
    const directory=mkdtempSync(join(tmpdir(),'iris-trade-test-'));directories.push(directory);const file=join(directory,'hourly.sqlite');
    const db=new DatabaseSync(file);db.exec('CREATE TABLE hourly_candles(ts INTEGER);INSERT INTO hourly_candles VALUES(123)');db.close();
    expect(()=>openTradeLedger(file)).toThrow(/Not an IRIS/);
    const verify=new DatabaseSync(file,{readOnly:true});expect(verify.prepare('SELECT ts FROM hourly_candles').get()?.ts).toBe(123);verify.close();
  });
});
