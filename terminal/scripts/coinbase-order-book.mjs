import {createHash,randomUUID} from 'node:crypto';
import {decimalUnits,timestampUs} from './coinbase-trade-ledger.mjs';
const fixed=n=>`${n/100000000n}.${String(n%100000000n).padStart(8,'0')}`;
const quantity=value=>{
  if(typeof value!=='string'||!/^\d{1,12}(?:\.\d{1,8})?$/.test(value))throw new Error('Invalid depth quantity');
  const [whole,fraction='']=value.split('.');return BigInt(whole)*100000000n+BigInt(fraction.padEnd(8,'0'));
};
export const orderBookHash=book=>{const {version,...content}=book;void version;return createHash('sha256').update(JSON.stringify(content)).digest('hex');};
/** Full L2 maintained in memory; only bounded current depth is persisted. */
export class CoinbaseOrderBook {
  constructor({now=Date.now,maxLevels=100000,depthLimit=500}={}){
    this.now=now;this.maxLevels=maxLevels;this.depthLimit=depthLimit;
    this.reset('WAITING_SNAPSHOT');
  }
  reset(state='WAITING_SNAPSHOT',reason=null){
    this.bids=new Map();this.asks=new Map();this.ready=false;this.state=state;this.reason=reason;
    this.session=randomUUID();this.snapshotAt=null;this.observedAt=null;this.eventTime=null;this.lastEventUs=0;
  }
  accept(message){
    if(message.product_id!=='BTC-USD'||!['snapshot','l2update'].includes(message.type))return false;
    try {
      if(message.type==='snapshot'){
        const parse=rows=>{
          if(!Array.isArray(rows)||!rows.length||rows.length>this.maxLevels)throw new Error('Invalid or oversized depth snapshot');
          const map=new Map();
          for(const row of rows){if(!Array.isArray(row)||row.length!==2)throw new Error('Invalid depth level');const price=BigInt(decimalUnits(row[0])),size=quantity(row[1]);if(size<=0n||map.has(price))throw new Error('Invalid or duplicate snapshot level');map.set(price,size);}
          return map;
        };
        const bids=parse(message.bids),asks=parse(message.asks);
        this.check(bids,asks);this.bids=bids;this.asks=asks;this.ready=true;this.state='READY';this.reason=null;
        this.snapshotAt=this.observedAt=this.now();this.eventTime=null;this.lastEventUs=0;
      } else {
        if(!this.ready)throw new Error('Depth update arrived before a fresh snapshot');
        const event=timestampUs(message.time);
        if(event<this.lastEventUs||event>this.now()*1000+999)throw new Error('Depth update has an invalid event ordering/time');
        if(!Array.isArray(message.changes)||message.changes.length>this.maxLevels)throw new Error('Invalid depth update batch');
        // Validate the full message before changing any price level.
        const changes=message.changes.map(row=>{
          if(!Array.isArray(row)||row.length!==3||!['buy','sell'].includes(row[0]))throw new Error('Invalid depth change');
          return {side:row[0],price:BigInt(decimalUnits(row[1])),size:quantity(row[2])};
        });
        for(const {side,price,size} of changes){const map=side==='buy'?this.bids:this.asks;if(size===0n)map.delete(price);else map.set(price,size);}
        this.check(this.bids,this.asks);this.lastEventUs=event;this.eventTime=message.time;this.observedAt=this.now();
      }
      return true;
    }catch(error){this.reset('INVALID',error instanceof Error?error.message:'Invalid depth message');throw error;}
  }
  check(bids,asks){
    if(!bids.size||!asks.size||bids.size>this.maxLevels||asks.size>this.maxLevels)throw new Error('Empty or oversized order book');
    let bid=0n,ask=null;
    for(const p of bids.keys())if(p>bid)bid=p;
    for(const p of asks.keys())if(ask===null||p<ask)ask=p;
    if(bid>=ask)throw new Error('Crossed order book; fresh snapshot required');
  }
  snapshot(healthy=false){
    const side=(map,descending)=>[...map.entries()].sort((a,b)=>a[0]===b[0]?0:(a[0]>b[0]?1:-1)*(descending?-1:1)).slice(0,this.depthLimit).map(([p,s])=>[fixed(p),fixed(s)]);
    const active=this.ready&&healthy;
    const data={schema:'iris-order-book/v1',product:'BTC-USD',session:this.session,state:active?'LIVE':this.ready?'STALE':this.state,reason:active?null:this.reason??(this.ready?'Awaiting fresh connection heartbeat':null),snapshotAt:this.snapshotAt,updatedAt:this.now(),observedAt:this.observedAt,eventTime:this.eventTime,totalBidLevels:this.bids.size,totalAskLevels:this.asks.size,depthLimit:this.depthLimit,bids:active?side(this.bids,true):[],asks:active?side(this.asks,false):[]};
    return {...data,version:orderBookHash(data)};
  }
}
