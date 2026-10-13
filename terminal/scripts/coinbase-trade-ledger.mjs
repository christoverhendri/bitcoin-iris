import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

export function decimalUnits(value) {
  if(typeof value!=='string'||!/^\d{1,12}(?:\.\d{1,8})?$/.test(value))throw new Error('Invalid trade decimal');
  const [whole,fraction='']=value.split('.');
  const units=BigInt(whole)*100000000n+BigInt(fraction.padEnd(8,'0'));
  if(units<=0n)throw new Error('Trade price and size must be positive');
  return units.toString();
}
export function timestampUs(value) {
  if(typeof value!=='string')throw new Error('Invalid trade timestamp');
  const match=/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?Z$/.exec(value);
  if(!match)throw new Error('Trade time needs UTC with at most six fractional digits');
  const base=Date.parse(`${match[1]}Z`);
  if(!Number.isFinite(base)||base<0||new Date(base).toISOString().slice(0,19)!==match[1])throw new Error('Invalid trade calendar timestamp');
  const units=base*1000+Number((match[2]??'').padEnd(6,'0'));
  if(!Number.isSafeInteger(units))throw new Error('Trade timestamp is outside supported precision');
  return units;
}
export function tradeHash(trade) {
  return createHash('sha256').update(JSON.stringify([trade.tradeId,trade.tsUs,trade.priceUnits,trade.sizeUnits,trade.makerSide])).digest('hex');
}
export function parseTrade(raw,observedAtUs) {
  if(!raw||!Number.isSafeInteger(raw.trade_id)||raw.trade_id<=0||!['buy','sell'].includes(raw.side))throw new Error('Invalid Coinbase trade identity/side');
  if(raw.product_id!==undefined&&raw.product_id!=='BTC-USD')throw new Error('Trade product mismatch');
  const trade={tradeId:raw.trade_id,tsUs:timestampUs(raw.time),priceUnits:decimalUnits(raw.price),sizeUnits:decimalUnits(raw.size),makerSide:raw.side};
  if(trade.tsUs>observedAtUs)throw new Error('Trade timestamp is later than its observation');
  return {...trade,hash:tradeHash(trade)};
}
export function openTradeLedger(path) {
  mkdirSync(dirname(path),{recursive:true});const db=new DatabaseSync(path);
  try {
    db.exec('PRAGMA busy_timeout=5000');
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    if(tables.length&&!tables.some(t=>t.name==='iris_trade_meta'))throw new Error('Not an IRIS Coinbase trade ledger');
    if(tables.length&&db.prepare("SELECT value FROM iris_trade_meta WHERE key='schema_version'").get()?.value!=='1')throw new Error('Unsupported trade ledger schema');
    if(tables.length&&db.prepare("SELECT value FROM iris_trade_meta WHERE key='product'").get()?.value!=='BTC-USD')throw new Error('Trade ledger product mismatch');
    db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS iris_trade_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      INSERT OR IGNORE INTO iris_trade_meta VALUES('schema_version','1');
      INSERT OR IGNORE INTO iris_trade_meta VALUES('product','BTC-USD');
      CREATE TABLE IF NOT EXISTS trades(trade_id INTEGER PRIMARY KEY,ts_us INTEGER NOT NULL,price_units TEXT NOT NULL,size_units TEXT NOT NULL,maker_side TEXT NOT NULL CHECK(maker_side IN ('buy','sell')),observed_at_us INTEGER NOT NULL,content_sha256 TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS trades_time ON trades(ts_us,trade_id);
      CREATE INDEX IF NOT EXISTS trades_observation ON trades(observed_at_us,ts_us);
      CREATE TABLE IF NOT EXISTS trade_pages(id INTEGER PRIMARY KEY,fetched_at_us INTEGER NOT NULL,request_after TEXT,response_after TEXT,row_count INTEGER NOT NULL,min_id INTEGER,max_id INTEGER,payload_sha256 TEXT NOT NULL);`);
    if(db.prepare("SELECT value FROM iris_trade_meta WHERE key='product'").get()?.value!=='BTC-USD')throw new Error('Trade ledger product mismatch');
    return db;
  }catch(error){db.close();throw error;}
}
/** One immutable page transaction; conflicting versions never overwrite trades. */
export function storeTradePage(db,raw,observedAtUs,{after=null,next=null}={}) {
  if(!Array.isArray(raw)||raw.length>1000||!Number.isSafeInteger(observedAtUs))throw new Error('Invalid trade page');
  const parsed=raw.map(t=>parseTrade(t,observedAtUs));
  for(let i=1;i<parsed.length;i++)if(parsed[i].tradeId>=parsed[i-1].tradeId)throw new Error('Trade page must be strictly newest-ID first');
  const put=db.prepare('INSERT OR IGNORE INTO trades VALUES(?,?,?,?,?,?,?)');
  const existing=db.prepare('SELECT content_sha256 FROM trades WHERE trade_id=?');
  let inserted=0;
  db.exec('BEGIN IMMEDIATE');
  try {
    for(const t of parsed){const old=existing.get(t.tradeId);if(old&&old.content_sha256!==t.hash)throw new Error(`Conflicting immutable trade ${t.tradeId}`);inserted+=Number(put.run(t.tradeId,t.tsUs,t.priceUnits,t.sizeUnits,t.makerSide,observedAtUs,t.hash).changes);}
    const min=parsed.at(-1)?.tradeId??null,max=parsed[0]?.tradeId??null;
    db.prepare('INSERT INTO trade_pages(fetched_at_us,request_after,response_after,row_count,min_id,max_id,payload_sha256) VALUES(?,?,?,?,?,?,?)').run(observedAtUs,after,next,parsed.length,min,max,createHash('sha256').update(JSON.stringify(raw)).digest('hex'));
    const oldest=Number(db.prepare("SELECT value FROM iris_trade_meta WHERE key='oldest_id'").get()?.value??Infinity);
    if(min!==null&&min<oldest&&next){for(const [key,value] of [['oldest_id',String(min)],['oldest_after',next]])db.prepare('INSERT INTO iris_trade_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value);}
    db.exec('COMMIT');return {inserted,count:parsed.length,minId:min,maxId:max,oldestTsUs:parsed.length?Math.min(...parsed.map(t=>t.tsUs)):null};
  }catch(error){db.exec('ROLLBACK');throw error;}
}
