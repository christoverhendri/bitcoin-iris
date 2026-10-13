import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {tradeHash,timestampUs} from '../../../scripts/coinbase-trade-ledger.mjs';
import type {TradeProfile} from '../tradeProfile';

export class TradeRequestError extends Error {}
export class TradeLedgerError extends Error {}
const fixed=(value:bigint,scale:number)=>{const divisor=BigInt(10)**BigInt(scale);return `${value/divisor}.${(value%divisor).toString().padStart(scale,'0')}`;};
const iso=(us:number)=>new Date(Math.floor(us/1000)).toISOString();
const exactIso=(us:number)=>iso(us).replace(/\.\d{3}Z$/,`.${String(us%1000000).padStart(6,'0')}Z`);
const timestamp=(raw:string|null)=>{
  try{return timestampUs(raw);}catch{throw new TradeRequestError('Trade profile dates require valid UTC timestamps');}
};
/** Read-only exact trade-size accumulation. Candle estimates never enter bins. */
export function readTradeProfile(params:URLSearchParams,file=process.env.IRIS_TRADE_LEDGER_PATH||resolve(process.cwd(),'..','artifacts','market','coinbase_trades.sqlite'),now=Date.now()):TradeProfile {
  const start=timestamp(params.get('start')),end=timestamp(params.get('end')),cutoff=timestamp(params.get('cutoff'));
  const strict=params.get('strict')==='true';
  if(params.has('strict')&&!['true','false'].includes(params.get('strict')!))throw new TradeRequestError('Invalid strict mode');
  const bins=Number(params.get('bins')??12);
  if(!Number.isInteger(bins)||bins<2||bins>50||start>=end||end>cutoff||cutoff>now*1000||end-start>366*86400000000)throw new TradeRequestError('Invalid profile range/cutoff/bins; choose a range up to 366 days');
  let db:DatabaseSync|undefined;
  try {
    const stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw new TradeLedgerError('Invalid trade ledger file');
    db=new DatabaseSync(file,{readOnly:true});db.exec('PRAGMA busy_timeout=5000; BEGIN');
    if(db.prepare("SELECT value FROM iris_trade_meta WHERE key='schema_version'").get()?.value!=='1'||db.prepare("SELECT value FROM iris_trade_meta WHERE key='product'").get()?.value!=='BTC-USD')throw new TradeLedgerError('Trade ledger schema/product mismatch');
    const asOf=now*1000,watermark=strict?cutoff:asOf;
    const rows=db.prepare('SELECT * FROM trades WHERE ts_us>=? AND ts_us<? AND observed_at_us<=? ORDER BY ts_us,trade_id LIMIT 200001').all(start,end,watermark);
    if(rows.length>200000)throw new TradeRequestError('Profile exceeds 200,000 trades; choose a narrower window');
    const trades=rows.map(r=>{
      const tradeId=Number(r.trade_id),tsUs=Number(r.ts_us),observed=Number(r.observed_at_us);
      const priceUnits=String(r.price_units),sizeUnits=String(r.size_units),makerSide=r.maker_side as 'buy'|'sell';
      if(!Number.isSafeInteger(tradeId)||tradeId<=0||!Number.isSafeInteger(tsUs)||!Number.isSafeInteger(observed)||observed<tsUs||!/^\d{1,20}$/.test(priceUnits)||!/^\d{1,20}$/.test(sizeUnits)||BigInt(priceUnits)<=BigInt(0)||BigInt(sizeUnits)<=BigInt(0)||!['buy','sell'].includes(makerSide))throw new TradeLedgerError('Trade ledger contains invalid values');
      const t={tradeId,tsUs,priceUnits,sizeUnits,makerSide};if(tradeHash(t)!==r.content_sha256)throw new TradeLedgerError('Trade content hash mismatch');return t;
    });
    const excluded=strict?Number(db.prepare('SELECT COUNT(*) AS n FROM trades WHERE ts_us>=? AND ts_us<? AND observed_at_us>? AND observed_at_us<=?').get(start,end,cutoff,asOf)?.n??0):0;
    const bounds=db.prepare('SELECT MIN(ts_us) AS first,MAX(ts_us) AS last FROM trades WHERE observed_at_us<=?').get(watermark)!;
    let total=BigInt(0),notional=BigInt(0),low=BigInt(0),high=BigInt(0);
    for(const t of trades){const p=BigInt(t.priceUnits),s=BigInt(t.sizeUnits);if(!total){low=p;high=p;}low=p<low?p:low;high=p>high?p:high;total+=s;notional+=p*s;}
    const count=low===high?1:bins,width=(high-low+BigInt(count))/BigInt(count);
    const buckets=Array.from({length:trades.length?count:0},(_,i)=>({low:fixed(low+BigInt(i)*width,8),high:fixed(low+BigInt(i+1)*width,8),units:BigInt(0),trades:0}));
    for(const t of trades){const index=Math.min(count-1,Number((BigInt(t.priceUnits)-low)/width));buckets[index].units+=BigInt(t.sizeUnits);buckets[index].trades++;}
    const ids=trades.map(t=>t.tradeId),idMin=ids.reduce((a,b)=>Math.min(a,b),Infinity),idMax=ids.reduce((a,b)=>Math.max(a,b),0);
    const holes=trades.length?idMax-idMin+1-trades.length:0;
    const before=db.prepare('SELECT trade_id FROM trades WHERE ts_us<? AND observed_at_us<=? ORDER BY ts_us DESC,trade_id DESC LIMIT 1').get(start,watermark);
    const after=db.prepare('SELECT trade_id FROM trades WHERE ts_us>=? AND observed_at_us<=? ORDER BY ts_us,trade_id LIMIT 1').get(end,watermark);
    const covered=!!trades.length&&Number(before?.trade_id)===idMin-1&&Number(after?.trade_id)===idMax+1;
    const version=createHash('sha256').update(JSON.stringify([start,end,watermark,bins,trades.map(tradeHash)])).digest('hex');
    db.exec('COMMIT');
    return {product:'BTC-USD',venue:'coinbase-exchange',version,observedAsOf:exactIso(watermark),strict,range:{start:exactIso(start),endExclusive:exactIso(end)},captured:{start:bounds.first===null?null:exactIso(Number(bounds.first)),endExclusive:bounds.last===null?null:exactIso(Number(bounds.last)+1)},coverage:!trades.length?'EMPTY':covered&&!holes?'CONTIGUOUS_ID_EVIDENCE':'PARTIAL',idRangeHoles:holes,excludedByObservationCutoff:excluded,tradeCount:trades.length,totalVolumeBtc:fixed(total,8),totalNotionalUsd:fixed(notional,16),bins:buckets.map(b=>({low:b.low,high:b.high,volumeBtc:fixed(b.units,8),trades:b.trades}))};
  }catch(error){if(error instanceof TradeRequestError||error instanceof TradeLedgerError)throw error;throw new TradeLedgerError('Local trade ledger is unavailable; collect execution data before loading a profile');}
  finally{db?.close();}
}
