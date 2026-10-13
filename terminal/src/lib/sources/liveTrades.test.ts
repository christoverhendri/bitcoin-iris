import {afterEach,describe,it,expect,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {openTradeLedger,storeTradePage} from '../../../scripts/coinbase-trade-ledger.mjs';
import {CoinbaseLiveCollector} from '../../../scripts/coinbase-live-core.mjs';
import {readLiveTrades} from './liveTrades';
import {liveEligible} from '../liveTrades';
import {readTradeProfile} from './tradeLedger';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {GET} from '../../app/api/market/trades/live/route';
import {CoinbaseOrderBook} from '../../../scripts/coinbase-order-book.mjs';
const now=Date.UTC(2026,0,1,0,0,30),directories:string[]=[],databases:DatabaseSync[]=[];
function fixture(){const directory=mkdtempSync(join(tmpdir(),'iris-live-test-'));directories.push(directory);const file=join(directory,'ledger.sqlite'),db=openTradeLedger(file);databases.push(db);return {db,file};}
const trade=(id:number)=>({type:'match',product_id:'BTC-USD',trade_id:id,time:`2026-01-01T00:00:${String(id).padStart(2,'0')}.000001Z`,price:`${100+id}.00000000`,size:'0.10000001',side:'buy'});
afterEach(()=>{vi.unstubAllEnvs();for(const db of databases.splice(0))db.close();for(const dir of directories.splice(0)){if(!resolve(dir).startsWith(resolve(tmpdir())+sep))throw new Error('Unsafe fixture cleanup');rmSync(dir,{recursive:true,force:true});}});
describe('realtime Coinbase ingestion and isolation',()=>{
  it('includes current depth only on explicit book requests and isolates bad depth from valid execution data',()=>{
    const {db,file}=fixture();storeTradePage(db,[trade(1)],now*1000);
    const core=new CoinbaseLiveCollector(db,{now:()=>now,fetchPage:async()=>({rows:[],next:null})});core.publish('LIVE');
    const book=new CoinbaseOrderBook({now:()=>now});book.accept({type:'snapshot',product_id:'BTC-USD',bids:[['100','1']],asks:[['101','2']]});
    db.prepare('INSERT INTO iris_trade_meta VALUES(?,?)').run('live_order_book',JSON.stringify(book.snapshot(true)));
    expect(readLiveTrades(file,now).orderBook).toBeUndefined();
    expect(readLiveTrades(file,now,new URLSearchParams({book:'true'})).orderBook?.state).toBe('LIVE');
    core.publish('STOPPED');expect(readLiveTrades(file,now,new URLSearchParams({book:'true'})).orderBook).toMatchObject({state:'STOPPED',bids:[],asks:[]});core.publish('LIVE');
    db.prepare("UPDATE iris_trade_meta SET value='bad' WHERE key='live_order_book'").run();
    const failed=readLiveTrades(file,now,new URLSearchParams({book:'true'}));expect(failed.orderBook?.state).toBe('UNAVAILABLE');expect(failed.latest?.id).toBe(1);expect(failed.state).toBe('LIVE');
  });
  it('builds native interval bars with actual volume and requires preceding continuity for complete coverage',()=>{
    const {db,file}=fixture();const prior={...trade(1),time:'2025-12-31T23:59:59.000001Z'};
    storeTradePage(db,[trade(3),trade(2),prior],now*1000);
    const core=new CoinbaseLiveCollector(db,{now:()=>now,fetchPage:async()=>({rows:[],next:null})});core.publish('LIVE');
    const query=new URLSearchParams({interval:'1m',from:String(Date.UTC(2026,0,1))});
    const snapshot=readLiveTrades(file,now,query);
    expect(snapshot.chart?.candles).toHaveLength(1);expect(snapshot.chart?.candles[0]).toMatchObject({interval:'1m',volume:.20000002,forming:true,complete:true,open:102,close:103});
    db.prepare('DELETE FROM trades WHERE trade_id=1').run();expect(readLiveTrades(file,now,query).chart?.candles[0].complete).toBe(false);
    expect(readLiveTrades(file,now,new URLSearchParams({interval:'bogus',from:'0'})).chart?.error).toBeTruthy();
    expect(readLiveTrades(file,now).change24hPct).toBeNull();
  });
  it('streams read-only SSE snapshots and releases the stream when its consumer aborts',async()=>{
    const {db,file}=fixture();storeTradePage(db,[trade(1)],now*1000);
    const core=new CoinbaseLiveCollector(db,{now:Date.now,fetchPage:async()=>({rows:[],next:null})});core.publish('LIVE');
    vi.stubEnv('IRIS_TRADE_LEDGER_PATH',file);const abort=new AbortController();
    const response=await GET(new Request('http://localhost/api/market/trades/live',{signal:abort.signal}));
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const reader=response.body!.getReader();const first=await reader.read();expect(new TextDecoder().decode(first.value)).toContain('"state":"LIVE"');
    abort.abort();expect((await reader.read()).done).toBe(true);
  });
  it.each(['drop','handshake'])('reconnects %s, repairs missed executions and shuts down the actual CLI cleanly',mode=>{
    const {db,file}=fixture();storeTradePage(db,[trade(1)],now*1000);
    const runner=pathToFileURL(resolve('scripts/stream-coinbase-trades.mjs')).href;
    const harness=`
      const {DatabaseSync}=await import('node:sqlite');
      let connections=0;
      const raw=id=>({type:'match',product_id:'BTC-USD',trade_id:id,time:'2026-01-01T00:00:01.000001Z',price:'101.00000000',size:'0.10000001',side:'buy'});
      globalThis.fetch=async()=>new Response(JSON.stringify([raw(3),raw(2),raw(1)]),{headers:{'cb-after':'1'}});
      class Socket extends EventTarget {
        static OPEN=1;readyState=0;closed=false;
        constructor(){super();this.connection=++connections;setTimeout(()=>{if(${JSON.stringify(mode)}==='handshake'&&this.connection===1){this.dispatchEvent(new Event('error'));return;}this.readyState=1;this.dispatchEvent(new Event('open'));},5);}
        send(payload){console.log('DEPTH_SUBSCRIBED='+JSON.parse(payload).channels.includes('level2_batch'));setTimeout(()=>{
          this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'snapshot',product_id:'BTC-USD',bids:[[this.connection===1?'99':'100','1']],asks:[['102','2']]})}));
          this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'l2update',product_id:'BTC-USD',time:'2026-01-01T00:00:02Z',changes:[['buy',this.connection===1?'99':'100','0.00000002']]})}));
          this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(raw(this.connection===1?1:3))}));this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'heartbeat',product_id:'BTC-USD',last_trade_id:this.connection===1?1:3})}));if(this.connection===1)setTimeout(()=>this.close(),100);
        },10);}
        close(){if(${JSON.stringify(mode)}==='handshake'&&this.connection===1){this.dispatchEvent(new Event('error'));return;}if(this.closed)return;this.closed=true;this.readyState=3;this.dispatchEvent(new Event('close'));}
      }
      globalThis.WebSocket=Socket;
      process.argv=['node','collector','--ledger',${JSON.stringify(file)}];
      await import(${JSON.stringify(runner)});
      setTimeout(()=>{const reader=new DatabaseSync(${JSON.stringify(file)},{readOnly:true});const depth=JSON.parse(reader.prepare("SELECT value FROM iris_trade_meta WHERE key='live_order_book'").get().value);console.log('BOOK_LIVE='+String(depth.state==='LIVE'&&depth.bids[0][0]==='100.00000000'&&depth.bids[0][1]==='0.00000002'));reader.close();console.log('CONNECTIONS='+connections);process.emit('SIGTERM');},2300);
    `;
    const child=spawnSync(process.execPath,['--input-type=module','-e',harness],{encoding:'utf8',timeout:10000});
    expect(child.status,child.stderr).toBe(0);expect(child.stdout).toContain('RECONNECTING');expect(child.stdout).toContain('"state":"LIVE"');expect(child.stdout).toContain('CONNECTIONS=2');
    expect(child.stdout).toContain('DEPTH_SUBSCRIBED=true');expect(child.stdout).toContain('BOOK_LIVE=true');
    expect(db.prepare('SELECT COUNT(*) AS n FROM trades').get()?.n).toBe(3);
    expect(JSON.parse(String(db.prepare("SELECT value FROM iris_trade_meta WHERE key='live_status'").get()?.value)).state).toBe('STOPPED');
    expect(JSON.parse(String(db.prepare("SELECT value FROM iris_trade_meta WHERE key='live_owner'").get()?.value)).expires).toBe(0);
    expect(JSON.parse(String(db.prepare("SELECT value FROM iris_trade_meta WHERE key='live_order_book'").get()?.value))).toMatchObject({state:'STOPPED',bids:[],asks:[]});
  });
  it('retains explicit one-microsecond REST/WS aliases without changing canonical time, size or first observation',()=>{
    const {db}=fixture();storeTradePage(db,[trade(1)],now*1000);
    const alias={...trade(1),time:'2026-01-01T00:00:01.000002Z'};
    expect(()=>storeTradePage(db,[alias],now*1000+999)).toThrow();
    storeTradePage(db,[alias],now*1000+999,{allowTimestampRounding:true});
    expect(db.prepare('SELECT COUNT(*) AS n FROM trade_time_aliases').get()?.n).toBe(1);
    expect(db.prepare('SELECT ts_us,observed_at_us FROM trades').get()).toMatchObject({ts_us:Date.UTC(2026,0,1,0,0,1)*1000+1,observed_at_us:now*1000});
    expect(()=>storeTradePage(db,[{...alias,size:'0.2'}],now*1000+999,{allowTimestampRounding:true})).toThrow();
    expect(()=>storeTradePage(db,[{...alias,time:'2026-01-01T00:00:01.000003Z'}],now*1000+999,{allowTimestampRounding:true})).toThrow();
  });
  it('ignores subscription snapshot and unrelated venues; deduplicates buffered prints',()=>{
    const {db}=fixture();const core=new CoinbaseLiveCollector(db,{now:()=>now,fetchPage:async()=>({rows:[],next:null})});
    core.accept({...trade(1),type:'last_match'});core.accept({...trade(1),product_id:'ETH-USD'});core.flush();
    expect(core.anchor).toBeNull();core.accept(trade(2));core.accept(trade(2));core.flush();
    expect(db.prepare('SELECT COUNT(*) AS n FROM trades').get()?.n).toBe(1);
    expect(()=>core.accept({...trade(3),price:'1e8'})).toThrow();
  });
  it('repairs skipped IDs and overlapping REST/live trades without overwriting first observations',async()=>{
    const {db,file}=fixture();storeTradePage(db,[trade(1)],now*1000);
    const core=new CoinbaseLiveCollector(db,{now:()=>now,fetchPage:async()=>({rows:[trade(4),trade(3),trade(2),trade(1)],next:'1'})});
    core.accept(trade(4));core.flush();expect(core.status.state).toBe('GAP');expect(core.anchor).toBe(1);
    core.status.heartbeatAt=now;await core.recover();expect(core.status.state).toBe('LIVE');expect(core.anchor).toBe(4);
    expect(db.prepare('SELECT COUNT(*) AS n FROM trades').get()?.n).toBe(4);
    expect(db.prepare('SELECT observed_at_us FROM trades WHERE trade_id=1').get()?.observed_at_us).toBe(now*1000);
    expect(readLiveTrades(file,now).candle?.volume).toBe('0.40000004');
  });
  it('keeps exhausted budgets and unresolved holes visible; recovers after retry',async()=>{
    const {db}=fixture();storeTradePage(db,[trade(1)],now*1000);let repaired=false;
    const core=new CoinbaseLiveCollector(db,{now:()=>now,maxPages:1,fetchPage:async()=>({rows:repaired?[trade(3),trade(2),trade(1)]:[trade(3)],next:'3'})});
    core.status.heartbeatAt=now;await core.recover();expect(core.status.state).toBe('GAP');expect(core.anchor).toBe(1);
    const restarted=new CoinbaseLiveCollector(db,{now:()=>now,fetchPage:async()=>({rows:[trade(3),trade(2),trade(1)],next:'1'})});expect(restarted.anchor).toBe(1);
    repaired=true;await core.recover();expect(core.status.state).toBe('LIVE');
  });
  it('coalesces concurrent recovery, buffers incoming trades, and handles failed REST requests',async()=>{
    const {db}=fixture();storeTradePage(db,[trade(1)],now*1000);let release!:(value:{rows:unknown[];next:string|null})=>void;
    const core=new CoinbaseLiveCollector(db,{now:()=>now,fetchPage:()=>new Promise(resolve=>{release=resolve;})});
    const first=core.recover();expect(core.recover()).toBe(first);core.accept(trade(3));release({rows:[trade(2),trade(1)],next:'1'});await first;
    expect(core.anchor).toBe(3);
    const failure=new CoinbaseLiveCollector(db,{now:()=>now,fetchPage:async()=>{throw new Error('network failure');}});await failure.recover();expect(failure.status.state).toBe('GAP');
  });
  it('does not call a lagging REST head LIVE ahead of the heartbeat watermark',async()=>{
    const {db}=fixture();storeTradePage(db,[trade(1)],now*1000);
    const core=new CoinbaseLiveCollector(db,{now:()=>now,fetchPage:async()=>({rows:[trade(1)],next:'1'})});
    core.accept({type:'heartbeat',product_id:'BTC-USD',last_trade_id:3});await core.recover();
    expect(core.status.state).toBe('GAP');expect(core.status.error).toContain('watermark');
  });
  it('marks dead collectors stale and fails closed on corrupt executions',()=>{
    const {db,file}=fixture();storeTradePage(db,[trade(1)],now*1000);const core=new CoinbaseLiveCollector(db,{now:()=>now,fetchPage:async()=>({rows:[],next:null})});core.publish('LIVE');
    expect(readLiveTrades(file,now+11000).state).toBe('STALE');db.prepare('UPDATE trades SET size_units=?').run('99');expect(readLiveTrades(file,now).state).toBe('UNAVAILABLE');
  });
  it('leaves strict replay unchanged when executions arrive later; disallows live subscriptions for replay/archive/mock/other venue',()=>{
    const {db,file}=fixture();const params=new URLSearchParams({start:'2026-01-01T00:00:00Z',end:'2026-01-01T00:00:10Z',cutoff:'2026-01-01T00:00:10Z',strict:'true'});
    const before=readTradeProfile(params,file,now);storeTradePage(db,[trade(1)],now*1000);const after=readTradeProfile(params,file,now);
    expect(after.tradeCount).toBe(before.tradeCount);expect(after.version).toBe(before.version);expect(after.excludedByObservationCutoff).toBe(1);
    expect(liveEligible(false,false,'coinbase',false)).toBe(true);
    expect(liveEligible(true,false,'coinbase',false)).toBe(false);expect(liveEligible(false,true,'coinbase',false)).toBe(false);expect(liveEligible(false,false,'kraken',false)).toBe(false);expect(liveEligible(false,false,'coinbase',true)).toBe(false);
  });
});
