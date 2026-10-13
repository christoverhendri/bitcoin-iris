import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {openTradeLedger,storeTradePage,timestampUs} from './coinbase-trade-ledger.mjs';

const args=process.argv.slice(2),options={pages:5,resume:false,after:null,until:null,ledger:process.env.IRIS_TRADE_LEDGER_PATH||fileURLToPath(new URL('../../artifacts/market/coinbase_trades.sqlite',import.meta.url))};
for(let i=0;i<args.length;i++){
  const key=args[i];if(key==='--resume'){options.resume=true;continue;}
  if(!['--pages','--after','--until','--ledger'].includes(key)||!args[i+1])throw new Error('Usage: --pages 1..1000 [--resume | --after CURSOR] [--until UTC_ISO] [--ledger PATH]');
  const value=args[++i];options[key.slice(2)]=key==='--pages'?Number(value):value;
}
if(!Number.isInteger(options.pages)||options.pages<1||options.pages>1000)throw new Error('Pages must be 1..1000');
if(options.resume&&options.after)throw new Error('Use --resume or --after, not both');
const until=options.until?timestampUs(options.until):null;
const db=openTradeLedger(resolve(options.ledger));
let after=options.after??(options.resume?db.prepare("SELECT value FROM iris_trade_meta WHERE key='oldest_after'").get()?.value??null:null);
let fetched=0,inserted=0,oldest=Infinity,reachedUntil=false,previousMin=Infinity;
try {
  for(let page=0;page<options.pages;page++) {
    const url=new URL('https://api.exchange.coinbase.com/products/BTC-USD/trades');url.searchParams.set('limit','1000');if(after)url.searchParams.set('after',after);
    let response;
    for(let attempt=0;attempt<4;attempt++){
      try{response=await fetch(url,{headers:{accept:'application/json','user-agent':'IRIS-local-trade-ledger/1'},signal:AbortSignal.timeout(15000)});}
      catch(error){if(attempt===3)throw error;await delay(1000*2**attempt);continue;}
      if(response.ok)break;
      if(response.status!==429&&response.status<500)throw new Error(`Coinbase HTTP ${response.status}`);
      if(attempt===3)throw new Error(`Coinbase HTTP ${response.status} after retries`);
      const retry=Number(response.headers.get('retry-after'));await delay(Number.isFinite(retry)&&retry>0?Math.min(retry*1000,30000):1000*2**attempt);
    }
    const raw=await response.json(),next=response.headers.get('cb-after');
    if(next&&(!/^[\w.:-]{1,128}$/.test(next)||next===after))throw new Error('Coinbase pagination cursor did not advance');
    if(Array.isArray(raw)&&raw.length&&raw.at(-1).trade_id>=previousMin)throw new Error('Older pagination did not move backwards');
    // Conservative upper bound of this millisecond; preserve exchange microseconds.
    const result=storeTradePage(db,raw,Date.now()*1000+999,{after,next});
    fetched+=result.count;inserted+=result.inserted;oldest=Math.min(oldest,result.oldestTsUs??Infinity);previousMin=result.minId??previousMin;
    console.log(JSON.stringify({page:page+1,...result,nextCursor:next}));
    after=next;if(until!==null&&oldest<=until){reachedUntil=true;break;}if(!next||!result.count)break;
    await delay(250);
  }
  console.log(JSON.stringify({ledger:resolve(options.ledger),fetched,inserted,nextCursor:after,reachedUntil,oldestTrade:oldest===Infinity?null:new Date(Math.floor(oldest/1000)).toISOString(),coverage:'OBSERVED_TRADES_ONLY; no historical completeness claim'}));
}finally{db.close();}
