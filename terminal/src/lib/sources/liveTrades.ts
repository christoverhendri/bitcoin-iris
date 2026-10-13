import {DatabaseSync} from 'node:sqlite';
import {lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {tradeHash} from '../../../scripts/coinbase-trade-ledger.mjs';
import type {LiveTradeSnapshot,LiveExecution} from '../liveTrades';
import {INTERVAL_MS} from '../features/ohlcv/replay';
import {readOrderBook} from './orderBook';
const fixed=(n:bigint)=>`${n/BigInt(100000000)}.${String(n%BigInt(100000000)).padStart(8,'0')}`;
export function readLiveTrades(file=process.env.IRIS_TRADE_LEDGER_PATH||resolve(process.cwd(),'..','artifacts','market','coinbase_trades.sqlite'),now=Date.now(),params=new URLSearchParams()):LiveTradeSnapshot {
  const empty:LiveTradeSnapshot={state:'OFFLINE',error:'Run npm run stream:trades to start the local collector',updatedAt:now,heartbeatAt:null,gapAnchor:null,latest:null,trades:[],candle:null};
  let db:DatabaseSync|undefined;
  try {
    const stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())return empty;
    db=new DatabaseSync(file,{readOnly:true});db.exec('PRAGMA busy_timeout=1000; BEGIN');
    if(db.prepare("SELECT value FROM iris_trade_meta WHERE key='schema_version'").get()?.value!=='1'||db.prepare("SELECT value FROM iris_trade_meta WHERE key='product'").get()?.value!=='BTC-USD')throw new Error('Invalid execution ledger');
    const status=JSON.parse(String(db.prepare("SELECT value FROM iris_trade_meta WHERE key='live_status'").get()?.value??'null'));
    if(!status)return empty;
    const start=Math.floor(now/60000)*60000;
    // Bounded current-minute query. Never truncate silently under extreme volume.
    const rows=db.prepare('SELECT * FROM trades WHERE ts_us>=? AND ts_us<? ORDER BY ts_us,trade_id LIMIT 20001').all(start*1000,now*1000);
    if(rows.length>20000)throw new Error('Live minute exceeds read limit');
    const decode=(r:Record<string,unknown>):LiveExecution=>{
      const t={tradeId:Number(r.trade_id),tsUs:Number(r.ts_us),priceUnits:String(r.price_units),sizeUnits:String(r.size_units),makerSide:r.maker_side as 'buy'|'sell'};
      if(!/^[0-9]{1,20}$/.test(t.priceUnits)||!/^[0-9]{1,20}$/.test(t.sizeUnits)||tradeHash(t)!==r.content_sha256)throw new Error('Live execution integrity failed');
      return {id:t.tradeId,time:new Date(Math.floor(t.tsUs/1000)).toISOString().replace(/\.\d{3}Z$/,`.${String(t.tsUs%1000000).padStart(6,'0')}Z`),price:fixed(BigInt(t.priceUnits)),size:fixed(BigInt(t.sizeUnits)),side:t.makerSide};
    };
    const trades=db.prepare('SELECT * FROM trades WHERE ts_us<? ORDER BY trade_id DESC LIMIT 20').all(now*1000).map(decode);
    const minute=rows.map(decode);let volume=BigInt(0),low=BigInt(0),high=BigInt(0);
    for(const row of rows){const p=BigInt(String(row.price_units));if(!volume)low=high=p;low=p<low?p:low;high=p>high?p:high;volume+=BigInt(String(row.size_units));}
    const state=now-Number(status.updatedAt)>10000?'STALE':status.state;
    const baseline=db.prepare('SELECT * FROM trades WHERE ts_us<=? ORDER BY ts_us DESC,trade_id DESC LIMIT 1').get((now-86400000)*1000);
    const change24hPct=baseline&&now-86400000-Number(baseline.ts_us)/1000<=60000&&trades.length?(Number(trades[0].price)/Number(decode(baseline).price)-1)*100:null;
    let chart:LiveTradeSnapshot['chart'];
    if(params.has('interval')){
      const interval=params.get('interval')!,step=INTERVAL_MS[interval],from=Number(params.get('from'));
      chart={interval,from,cutoff:now,candles:[],error:null};
      if(!step||interval==='1w'||!Number.isSafeInteger(from)||from<0||from%step!==0||from>now||now-from>2*86400000)chart.error='Live chart range requires aligned native bars within two days; reload the timeframe window';
      else {
        const tail=db.prepare('SELECT * FROM trades WHERE ts_us>=? AND ts_us<? ORDER BY ts_us,trade_id LIMIT 200001').all(from*1000,now*1000);
        if(tail.length>200000)chart.error='Live chart exceeds 200,000 executions; reload the timeframe window';
        else {
          const predecessor=db.prepare('SELECT trade_id FROM trades WHERE ts_us<? ORDER BY ts_us DESC,trade_id DESC LIMIT 1').get(from*1000);
          let previous=Number(predecessor?.trade_id)||null;
          const groups=new Map<number,typeof tail>();
          for(const r of tail){decode(r);const ts=Math.floor(Number(r.ts_us)/1000/step)*step;const group=groups.get(ts)??[];group.push(r);groups.set(ts,group);}
          const grouped=[...groups.entries()];
          for(const [index,[ts,group]] of grouped.entries()){
            const first=group[0],last=group.at(-1)!;
            const contiguous=previous!==null&&Number(first.trade_id)===previous+1&&group.every((r,i)=>i===0||Number(r.trade_id)===Number(group[i-1].trade_id)+1);
            const following=grouped[index+1]?.[1][0];
            const forming=ts+step>now;
            const complete=contiguous&&(forming?state==='LIVE':Number(following?.trade_id)===Number(last.trade_id)+1);
            let lo=BigInt(String(first.price_units)),hi=lo,volume=BigInt(0);
            for(const r of group){const p=BigInt(String(r.price_units));lo=p<lo?p:lo;hi=p>hi?p:hi;volume+=BigInt(String(r.size_units));}
            chart.candles.push({symbol:'BTC-USD',interval,ts,open:Number(fixed(BigInt(String(first.price_units)))),close:Number(fixed(BigInt(String(last.price_units)))),high:Number(fixed(hi)),low:Number(fixed(lo)),volume:Number(fixed(volume)),complete,forming,observedAt:new Date(now).toISOString()});
            previous=Number(last.trade_id);
          }
        }
      }
    }
    let orderBook:LiveTradeSnapshot['orderBook'];
    if(params.get('book')==='true'){
      try{
        orderBook=readOrderBook(db,now);
        if(orderBook?.state==='LIVE'&&['STOPPED','RECONNECTING','STALE','CONNECTING'].includes(state))orderBook={...orderBook,state,reason:'Shared collector connection is not ready',bids:[],asks:[]};
      }catch{
        orderBook={schema:'iris-order-book/v1',product:'BTC-USD',session:'unavailable',state:'UNAVAILABLE',reason:'Depth metadata unavailable or integrity check failed',snapshotAt:null,updatedAt:now,observedAt:null,eventTime:null,totalBidLevels:0,totalAskLevels:0,depthLimit:500,bids:[],asks:[],version:''};
      }
    }
    return {...empty,...status,state,trades,latest:trades[0]??null,change24hPct,chart,orderBook,candle:minute.length?{start:new Date(start).toISOString(),open:minute[0].price,close:minute.at(-1)!.price,low:fixed(low),high:fixed(high),volume:fixed(volume),count:minute.length}:null};
  }catch{return {...empty,state:'UNAVAILABLE',error:'Live execution ledger unavailable or integrity check failed'};}
  finally{db?.close();}
}
