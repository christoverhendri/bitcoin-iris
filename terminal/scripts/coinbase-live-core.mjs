import {parseTrade,storeTradePage} from './coinbase-trade-ledger.mjs';

/** Durable executions are separate from transport state and replay cutoffs. */
export class CoinbaseLiveCollector {
  constructor(db,{now=Date.now,fetchPage, maxPages=50,onStatus=()=>{}}={}) {
    this.db=db;this.now=now;this.fetchPage=fetchPage;this.maxPages=maxPages;this.onStatus=onStatus;
    this.pending=new Map();this.anchor=Number(db.prepare('SELECT MAX(trade_id) AS id FROM trades').get().id)||null;
    const previous=db.prepare("SELECT value FROM iris_trade_meta WHERE key='live_status'").get();
    try{const saved=JSON.parse(previous?.value??'null');if(saved?.gapAnchor)this.anchor=saved.gapAnchor;}catch{}
    this.status={state:'CONNECTING',updatedAt:now(),heartbeatAt:null,lastTradeAt:null,gapAnchor:this.anchor,error:null};
    this.target=this.anchor??0;
    this.recovery=null;this.stopped=false;
  }
  publish(state=this.status.state,error=this.status.error) {
    this.status={...this.status,state,error,updatedAt:this.now(),gapAnchor:this.anchor};
    this.db.prepare("INSERT INTO iris_trade_meta VALUES('live_status',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(this.status));
    this.onStatus(this.status);
    return this.status;
  }
  accept(message) {
    if(message.product_id!=='BTC-USD')return;
    if(message.type==='heartbeat') {
      this.status.heartbeatAt=this.now();
      if(Number.isSafeInteger(message.last_trade_id))this.target=Math.max(this.target,message.last_trade_id);
      this.flush();
      if(Number.isSafeInteger(message.last_trade_id)&&message.last_trade_id>(this.anchor??0))void this.recover();
      return;
    }
    // last_match is a subscription snapshot, not a newly delivered execution.
    if(message.type!=='match')return;
    parseTrade(message,this.now()*1000+999);
    const old=this.pending.get(message.trade_id);
    if(old&&JSON.stringify([old.time,old.price,old.size,old.side])!==JSON.stringify([message.time,message.price,message.size,message.side]))throw new Error('Conflicting buffered execution');
    this.pending.set(message.trade_id,message);this.status.lastTradeAt=this.now();
    this.target=Math.max(this.target,message.trade_id);
    if(this.pending.size>10000)throw new Error('Trade buffer exceeded limit');
  }
  flush() {
    const rows=[...this.pending.values()].sort((a,b)=>b.trade_id-a.trade_id);
    for(let i=0;i<rows.length;i+=1000)storeTradePage(this.db,rows.slice(i,i+1000),this.now()*1000+999,{allowTimestampRounding:true});
    this.pending.clear();
    const maximum=Number(this.db.prepare('SELECT MAX(trade_id) AS id FROM trades').get().id)||null;
    if(this.anchor===null){this.anchor=maximum;return;}
    if(maximum!==null&&maximum>this.anchor) {
      const count=Number(this.db.prepare('SELECT COUNT(*) AS n FROM trades WHERE trade_id>? AND trade_id<=?').get(this.anchor,maximum).n);
      if(count===maximum-this.anchor)this.anchor=maximum;
      else if(!this.recovery)this.publish('GAP','Missing execution IDs; REST recovery pending');
    }
  }
  recover() {
    if(this.stopped)return Promise.resolve();
    if(this.recovery)return this.recovery;
    this.recovery=this.repair().catch(error=>{if(!this.stopped)this.publish('GAP',error instanceof Error?error.message:'Recovery failed');}).finally(()=>{this.recovery=null;});
    return this.recovery;
  }
  async repair() {
    this.flush();const anchor=this.anchor;let after=null,previousMin=Infinity;
    this.publish('RECOVERING',null);
    let bridged=anchor===null;
    for(let page=0;page<this.maxPages&&!this.stopped;page++) {
      const {rows,next}=await this.fetchPage(after);
      if(this.stopped)return;
      if(!Array.isArray(rows)||!rows.length)throw new Error('Empty recovery page');
      const min=rows.at(-1)?.trade_id;
      if(!Number.isSafeInteger(min)||min>=previousMin||next===after&&after!==null)throw new Error('Recovery cursor did not advance');
      storeTradePage(this.db,rows,this.now()*1000+999,{after,next,allowTimestampRounding:true});previousMin=min;
      this.flush();
      if(anchor!==null&&this.anchor>anchor){bridged=true;break;}
      if(anchor===null||min<=anchor){bridged=true;break;}
      if(!next)break;after=next;
    }
    if(this.stopped)return;
    this.flush();
    if(!bridged)throw new Error(`Recovery page budget exhausted (${this.maxPages}); gap remains open`);
    const maximum=Number(this.db.prepare('SELECT MAX(trade_id) AS id FROM trades').get().id);
    if(maximum<this.target)throw new Error('REST head has not reached the heartbeat execution watermark');
    if(anchor!==null) {
      const count=Number(this.db.prepare('SELECT COUNT(*) AS n FROM trades WHERE trade_id>? AND trade_id<=?').get(anchor,maximum).n);
      if(count!==maximum-anchor){this.anchor=anchor;throw new Error('Recovery did not close all execution ID holes');}
    }
    this.anchor=maximum;this.publish(this.status.heartbeatAt&&this.now()-this.status.heartbeatAt<10000?'LIVE':'CONNECTING',null);
  }
}
