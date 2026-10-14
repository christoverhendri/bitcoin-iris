import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { readDerivedMarket } from './derivedMarket';
import { readArchivePage } from './marketArchive';
import { buildMarketSnapshot, marketVersion } from '@/lib/marketSnapshot';
import { applyLiveMarket } from '@/lib/liveMarket';

const directories:string[]=[];
const start=Date.parse('2026-01-01T00:00:00Z')/1000;
const now=Date.parse('2026-01-03T00:00:00Z');
function fixture(){
  const directory=mkdtempSync(join(tmpdir(),'iris-derived-'));directories.push(directory);
  const db=new DatabaseSync(join(directory,'coinbase_hourly_from_minutes.sqlite'));
  db.exec(`CREATE TABLE store_identity(key TEXT,value TEXT);
    CREATE TABLE hourly_candles(ts INTEGER,payload_sha256 TEXT,observed_at TEXT,last_seen_at TEXT,low REAL,high REAL,open REAL,close REAL,volume REAL);
    CREATE TABLE hourly_quality(ts INTEGER,status TEXT);`);
  const entries={source:'coinbase-exchange',instrument:'BTC/USD',granularity_seconds:'3600',dataset_kind:'minute_derived_hourly',dataset_version:'a'.repeat(64),range_end_exclusive:String(start+48*3600),derived_at:'2026-01-03T00:00:00.000000Z',minute_as_of:'2026-01-02T23:59:59.000000Z'};
  for(const [k,v] of Object.entries(entries))db.prepare('INSERT INTO store_identity VALUES (?,?)').run(k,v);
  for(let i=0;i<48;i++){
    if(i!==30)db.prepare('INSERT INTO hourly_candles VALUES (?,?,?,?,?,?,?,?,?)').run(start+i*3600,'b'.repeat(64),entries.derived_at,entries.derived_at,100,110,101,109,60);
    db.prepare('INSERT INTO hourly_quality VALUES (?,?)').run(start+i*3600,i===30?'PARTIAL':'COMPLETE');
  }
  db.close();return directory;
}
afterEach(()=>{for(const directory of directories.splice(0))rmSync(directory,{recursive:true,force:true});});
it('aggregates full native windows, rejects incomplete daily bars, and shares snapshot provenance',()=>{
  const directory=fixture();const {env,cutoff}=readDerivedMarket({interval:'1d',limit:2},directory,now);
  expect(env.data).toHaveLength(1);expect(env.data[0].volume).toBe(1440);
  expect(env.marketDataset.partialHours).toBe(1);
  const snapshot=buildMarketSnapshot(env,cutoff);
  expect(snapshot.indicators.marketDataset).toEqual(snapshot.ohlcv.marketDataset);
  expect(snapshot.levels.marketDataset).toEqual(snapshot.ohlcv.marketDataset);
  expect(marketVersion({...env,marketDataset:{...env.marketDataset,version:'c'.repeat(64)}})).not.toBe(snapshot.version);
  const applied=applyLiveMarket(snapshot,{state:'LIVE',error:null,updatedAt:now,heartbeatAt:now,gapAnchor:null,latest:null,trades:[],candle:null,chart:{interval:'1d',from:now,cutoff:now+86400000,candles:[],error:null}},true);
  expect(applied.market).toBe(snapshot);
});
it('locks archive pagination to its derived dataset version and basis',()=>{
  const directory=fixture();const page=readArchivePage(new URLSearchParams({interval:'1h',basis:'derived',limit:'2'}),directory,now);
  expect(page.marketDataset?.basis).toBe('minute-derived');expect(page.nextCursor).not.toBeNull();
  expect(()=>readArchivePage(new URLSearchParams({interval:'1h',basis:'original',limit:'2',cursor:page.nextCursor!}),directory,now)).toThrow();
  const db=new DatabaseSync(join(directory,'coinbase_hourly_from_minutes.sqlite'));db.prepare("UPDATE store_identity SET value=? WHERE key='dataset_version'").run('c'.repeat(64));db.close();
  expect(()=>readArchivePage(new URLSearchParams({interval:'1h',basis:'derived',limit:'2',cursor:page.nextCursor!}),directory,now)).toThrow('Dataset version changed');
});
it('uses the frozen minute observation vintage for sub-hour bars, excluding incomplete buckets',()=>{
  const directory=fixture();const db=new DatabaseSync(join(directory,'coinbase_minute.sqlite'));
  db.exec(`CREATE TABLE store_identity(key TEXT,value TEXT);
    INSERT INTO store_identity VALUES ('source','coinbase-exchange'),('instrument','BTC/USD'),('granularity_seconds','60');
    CREATE TABLE minute_candles(ts INTEGER,content_sha256 TEXT,low REAL,high REAL,open REAL,close REAL,volume REAL);
    CREATE TABLE minute_seen(ts INTEGER,content_sha256 TEXT,seen_at TEXT); CREATE INDEX seen_idx ON minute_seen(ts,seen_at);`);
  db.exec('BEGIN');
  for(let i=0;i<1440;i++){
    if(i===1439)continue;
    db.prepare('INSERT INTO minute_candles VALUES (?,?,?,?,?,?,?)').run(start+86400+i*60,'b'.repeat(64),100,110,101,109,1);
    db.prepare('INSERT INTO minute_seen VALUES (?,?,?)').run(start+86400+i*60,'b'.repeat(64),'2026-01-02T23:59:00.000000Z');
  }
  db.prepare('INSERT INTO minute_candles VALUES (?,?,?,?,?,?,?)').run(start+86400,'c'.repeat(64),100,210,101,200,100);
  db.prepare('INSERT INTO minute_seen VALUES (?,?,?)').run(start+86400,'c'.repeat(64),'2026-01-03T00:00:00.000000Z');
  db.exec('COMMIT');
  db.close();
  const {env}=readDerivedMarket({interval:'15m',limit:96},directory,now);
  expect(env.data).toHaveLength(95);expect(env.data[0].volume).toBe(15);expect(env.data[0].high).toBe(110);
});
