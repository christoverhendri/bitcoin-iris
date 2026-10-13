import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {openTradeLedger} from './coinbase-trade-ledger.mjs';
import {CoinbaseLiveCollector} from './coinbase-live-core.mjs';
import {CoinbaseOrderBook} from './coinbase-order-book.mjs';

const args=process.argv.slice(2);
let file=process.env.IRIS_TRADE_LEDGER_PATH||fileURLToPath(new URL('../../artifacts/market/coinbase_trades.sqlite',import.meta.url)),maxPages=50;
for(let i=0;i<args.length;i++){if(args[i]==='--ledger'&&args[i+1])file=args[++i];else if(args[i]==='--recovery-pages'&&args[i+1])maxPages=Number(args[++i]);else throw new Error('Usage: [--ledger PATH] [--recovery-pages 1..1000]');}
if(!Number.isInteger(maxPages)||maxPages<1||maxPages>1000)throw new Error('Invalid recovery page budget');
const db=openTradeLedger(resolve(file)),owner=randomUUID();
const meta=db.prepare('INSERT INTO iris_trade_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
db.exec('BEGIN IMMEDIATE');
try {
  const lease=JSON.parse(db.prepare("SELECT value FROM iris_trade_meta WHERE key='live_owner'").get()?.value??'null');
  if(lease&&lease.expires>Date.now())throw new Error('A realtime collector already owns this ledger');
  meta.run('live_owner',JSON.stringify({owner,expires:Date.now()+15000}));db.exec('COMMIT');
}catch(error){db.exec('ROLLBACK');db.close();throw error;}
let stopping=false,socket=null,retry=null,attempt=0,lastMessage=0;
const abort=new AbortController();
let lastStatus='';
const book=new CoinbaseOrderBook();
const publishBook=()=>meta.run('live_order_book',JSON.stringify(book.snapshot(!!collector.status.heartbeatAt&&Date.now()-collector.status.heartbeatAt<10000&&socket?.readyState===WebSocket.OPEN)));
const collector=new CoinbaseLiveCollector(db,{maxPages,onStatus:status=>{const key=`${status.state}:${status.error}`;if(key!==lastStatus){console.log(JSON.stringify(status));lastStatus=key;}},fetchPage:async after=>{
  const url=new URL('https://api.exchange.coinbase.com/products/BTC-USD/trades?limit=1000');if(after)url.searchParams.set('after',after);
  for(let retry=0;retry<4;retry++){
    await delay(250,undefined,{signal:abort.signal});
    let response;
    try{response=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15000)])});}
    catch(error){if(abort.signal.aborted||retry===3)throw error;await delay(1000*2**retry,undefined,{signal:abort.signal});continue;}
    if(response.ok)return {rows:await response.json(),next:response.headers.get('cb-after')};
    if(response.status!==429&&response.status<500||retry===3)throw new Error(`Recovery HTTP ${response.status}`);
    const seconds=Number(response.headers.get('retry-after'));await delay(seconds>0?Math.min(seconds*1000,30000):1000*2**retry,undefined,{signal:abort.signal});
  }
}});
function connect(){
  if(stopping)return;collector.status.heartbeatAt=null;collector.publish('CONNECTING');lastMessage=Date.now();
  book.reset('WAITING_SNAPSHOT');publishBook();
  const ws=new WebSocket('wss://ws-feed.exchange.coinbase.com');socket=ws;
  let retired=false;
  const reconnect=()=>{
    if(stopping||socket!==ws||retired)return;
    retired=true;socket=null;collector.flush();collector.publish('RECONNECTING');book.reset('RECONNECTING','Disconnected; awaiting a fresh depth snapshot');publishBook();
    // undici may emit another error synchronously when closing a failed handshake.
    // Retire the socket before close so that callback cannot recurse.
    try{ws.close();}catch{}
    retry=setTimeout(connect,Math.min(30000,1000*2**Math.min(attempt++,5))+Math.random()*500);
  };
  ws.addEventListener('open',()=>{if(stopping||retired||socket!==ws)return;ws.send(JSON.stringify({type:'subscribe',product_ids:['BTC-USD'],channels:['matches','heartbeat','level2_batch']}));void collector.recover();});
  ws.addEventListener('message',event=>{
    if(stopping||socket!==ws)return;
    try{const message=JSON.parse(String(event.data));if(message.type==='error')throw new Error(message.message||'Feed rejected subscription');book.accept(message);collector.accept(message);if(message.type==='heartbeat'){lastMessage=Date.now();attempt=0;}}
    catch(error){collector.publish('GAP',error.message);book.reset('INVALID',error.message);publishBook();reconnect();}
  });
  ws.addEventListener('error',reconnect);
  ws.addEventListener('close',reconnect);
}
const tick=setInterval(()=>{
  try {
    db.exec('BEGIN IMMEDIATE');
    const lease=JSON.parse(db.prepare("SELECT value FROM iris_trade_meta WHERE key='live_owner'").get()?.value??'null');
    if(lease?.owner!==owner)throw new Error('Collector ownership lost');
    meta.run('live_owner',JSON.stringify({owner,expires:Date.now()+15000}));db.exec('COMMIT');
    collector.flush();
    if(socket&&Date.now()-lastMessage>10000){collector.publish('STALE');book.reset('STALE','Connection heartbeat expired');publishBook();socket.close();}
    else if(!collector.recovery&&collector.status.state==='GAP')void collector.recover();
    else if(!collector.recovery&&collector.status.heartbeatAt&&socket?.readyState===WebSocket.OPEN&&collector.status.state!=='RECONNECTING')collector.publish('LIVE',null);
    else collector.publish();
    publishBook();
  }catch(error){try{db.exec('ROLLBACK');}catch{}console.error(error);process.exitCode=1;void stop();}
},1000);
async function stop(){
  if(stopping)return;stopping=true;collector.stopped=true;clearInterval(tick);clearTimeout(retry);abort.abort();socket?.close();
  await collector.recovery;
  try{
    const lease=JSON.parse(db.prepare("SELECT value FROM iris_trade_meta WHERE key='live_owner'").get()?.value??'null');
    if(lease?.owner===owner){collector.flush();collector.publish('STOPPED');book.reset('STOPPED','Collector stopped');publishBook();meta.run('live_owner',JSON.stringify({owner,expires:0}));}
  }finally{db.close();}
}
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
console.log(JSON.stringify({collector:'Coinbase BTC-USD realtime',ledger:resolve(file),maxRecoveryPages:maxPages}));connect();
