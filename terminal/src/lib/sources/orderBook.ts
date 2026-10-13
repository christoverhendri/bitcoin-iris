import type {DatabaseSync} from 'node:sqlite';
import type {LiveOrderBook} from '../orderBook';
import {orderBookHash} from '../../../scripts/coinbase-order-book.mjs';
import {timestampUs} from '../../../scripts/coinbase-trade-ledger.mjs';
export function readOrderBook(db:DatabaseSync,now:number):LiveOrderBook|undefined {
  const stored=db.prepare("SELECT value FROM iris_trade_meta WHERE key='live_order_book'").get();
  if(!stored)return;
  const raw=String(stored.value);if(raw.length>200000)throw new Error('Oversized depth metadata');
  const book=JSON.parse(raw) as LiveOrderBook;
  if(book.schema!=='iris-order-book/v1'||book.product!=='BTC-USD'||!Number.isSafeInteger(book.updatedAt)||book.updatedAt>now||!Number.isInteger(book.depthLimit)||book.depthLimit<1||book.depthLimit>500||!Array.isArray(book.bids)||!Array.isArray(book.asks)||book.bids.length>book.depthLimit||book.asks.length>book.depthLimit||orderBookHash(book)!==book.version)throw new Error('Depth integrity failure');
  if(!['LIVE','READY','WAITING_SNAPSHOT','RECONNECTING','STALE','INVALID','STOPPED'].includes(book.state)||typeof book.session!=='string'||!Number.isInteger(book.totalBidLevels)||!Number.isInteger(book.totalAskLevels)||book.totalBidLevels<book.bids.length||book.totalAskLevels<book.asks.length||book.totalBidLevels>100000||book.totalAskLevels>100000)throw new Error('Invalid depth metadata');
  if(book.state==='LIVE'&&(!Number.isSafeInteger(book.snapshotAt)||!Number.isSafeInteger(book.observedAt)||book.snapshotAt!>book.observedAt!||book.observedAt!>book.updatedAt))throw new Error('Invalid depth observation time');
  if(book.eventTime!==null&&timestampUs(book.eventTime)>(book.observedAt??0)*1000+999)throw new Error('Invalid depth event time');
  const parse=(value:string)=>{if(typeof value!=='string'||!/^\d{1,12}\.\d{8}$/.test(value))throw new Error('Invalid depth decimal');return BigInt(value.replace('.',''));};
  for(const [rows,descending] of [[book.bids,true],[book.asks,false]] as const){let previous:bigint|null=null;for(const row of rows){if(!Array.isArray(row)||row.length!==2)throw new Error('Invalid depth level');const p=parse(row[0]),q=parse(row[1]);if(p<=BigInt(0)||q<=BigInt(0)||previous!==null&&(descending?p>=previous:p<=previous))throw new Error('Invalid depth ordering');previous=p;}}
  if(book.state==='LIVE'&&(!book.bids.length||!book.asks.length||parse(book.bids[0][0])>=parse(book.asks[0][0])))throw new Error('Invalid live book spread');
  if(now-book.updatedAt>10000)return {...book,state:'STALE',reason:'Collector depth publication expired',bids:[],asks:[]};
  if(book.state!=='LIVE')return {...book,bids:[],asks:[]};
  return book;
}
