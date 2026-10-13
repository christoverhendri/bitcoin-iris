import {describe,it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {CoinbaseOrderBook,orderBookHash} from '../../scripts/coinbase-order-book.mjs';
import {readOrderBook} from './sources/orderBook';
import {buildDom} from './dom';
import {hydratedLiveView} from './liveView';
import type {LiveTradeSnapshot} from './liveTrades';
const now=Date.UTC(2026,0,1,0,0,30);
const snapshot={type:'snapshot',product_id:'BTC-USD',bids:[['100','1'],['99.99','0.5']],asks:[['100.01','2'],['101','0.25']]};
const update=(changes:string[][],time='2026-01-01T00:00:20.000001Z')=>({type:'l2update',product_id:'BTC-USD',time,changes});
describe('Coinbase live L2 and DOM',()=>{
  it('accepts full snapshots and absolute size replacement, zero deletion and exact decimals',()=>{
    const book=new CoinbaseOrderBook({now:()=>now});expect(book.snapshot(true).state).toBe('WAITING_SNAPSHOT');
    book.accept(snapshot);book.accept(update([['buy','100','0.00000001'],['sell','101','0']]));
    const value=book.snapshot(true);expect(value.bids[0]).toEqual(['100.00000000','0.00000001']);expect(value.asks).toHaveLength(1);
    book.accept(update([['buy','100','0.00000002']]));expect(book.snapshot(true).bids[0][1]).toBe('0.00000002');
    expect(orderBookHash(value)).toBe(value.version);
  });
  it('clears disconnected depth and requires a new snapshot before accepting updates',()=>{
    const book=new CoinbaseOrderBook({now:()=>now});book.accept(snapshot);const session=book.snapshot(true).session;
    book.reset('RECONNECTING');expect(book.snapshot(true).bids).toEqual([]);expect(book.snapshot(true).session).not.toBe(session);
    expect(()=>book.accept(update([['buy','100','1']]))).toThrow(/fresh snapshot/);
    book.accept({...snapshot,bids:[['98','1']]});expect(book.snapshot(true).bids).toEqual([['98.00000000','1.00000000']]);
    expect(book.snapshot(false).state).toBe('STALE');expect(book.snapshot(false).asks).toEqual([]);
  });
  it('fails closed on crossed, out-of-order, wrong precision or malformed batches without leaking partially applied levels',()=>{
    const book=new CoinbaseOrderBook({now:()=>now});book.accept(snapshot);
    expect(()=>book.accept(update([['buy','102','1']]))).toThrow(/Crossed/);expect(book.snapshot(true).state).toBe('INVALID');expect(book.snapshot(true).bids).toEqual([]);
    book.accept(snapshot);book.accept(update([['buy','100','1']]));
    expect(()=>book.accept(update([['buy','100','2']],'2026-01-01T00:00:19Z'))).toThrow(/ordering/);
    book.accept(snapshot);expect(()=>book.accept(update([['buy','100','3'],['sell','101','1e-8']]))).toThrow();expect(book.snapshot(true).asks).toEqual([]);
    expect(()=>book.accept({...snapshot,bids:[['100','1'],['100','2']]})).toThrow(/duplicate/);
    expect(book.accept({...snapshot,product_id:'ETH-USD'})).toBe(false);
    const bounded=new CoinbaseOrderBook({now:()=>now,maxLevels:1});expect(()=>bounded.accept(snapshot)).toThrow(/oversized/);
  });
  it('persists bounded nearest depth while retaining full book counts and fresh snapshot timestamps',()=>{
    const book=new CoinbaseOrderBook({now:()=>now,depthLimit:1});book.accept(snapshot);const value=book.snapshot(true);
    expect(value.totalBidLevels).toBe(2);expect(value.bids).toHaveLength(1);expect(value.asks[0][0]).toBe('100.01000000');expect(value.snapshotAt).toBe(now);
  });
  it('groups bids down and asks up, conserves visible size and computes cumulative / recent matched quantities',()=>{
    const book=new CoinbaseOrderBook({now:()=>now});book.accept(snapshot);
    const dom=buildDom(book.snapshot(true),'1',10,[{id:1,time:'2026-01-01T00:00:20Z',price:'100.01',size:'0.00000001',side:'sell'}]);
    expect(dom.bid).toBe('100.00000000');expect(dom.ask).toBe('100.01000000');expect(dom.spread).toBe('0.01000000');
    expect(dom.asks).toHaveLength(1);expect(dom.asks[0]).toMatchObject({price:'101.00000000',size:'2.25000000',cumulative:'2.25000000',recent:'0.00000001'});
    expect(dom.bidTotal).toBe('1.50000000');expect(dom.askTotal).toBe('2.25000000');expect(dom.bidShare).toBe(40);
    expect(buildDom(book.snapshot(false),'1',10).bids).toEqual([]);expect(()=>buildDom(book.snapshot(true),'0',10)).toThrow();
  });
  it('validates saved book hashes and hides dead publications',()=>{
    const db=new DatabaseSync(':memory:');
    try {
      db.exec('CREATE TABLE iris_trade_meta(key TEXT PRIMARY KEY,value TEXT)');
      const book=new CoinbaseOrderBook({now:()=>now});book.accept(snapshot);const value=book.snapshot(true);
      db.prepare('INSERT INTO iris_trade_meta VALUES(?,?)').run('live_order_book',JSON.stringify(value));
      expect(readOrderBook(db,now)?.state).toBe('LIVE');expect(readOrderBook(db,now+11000)).toMatchObject({state:'STALE',bids:[],asks:[]});
      value.bids[0][1]='999.00000000';db.prepare('UPDATE iris_trade_meta SET value=?').run(JSON.stringify(value));expect(()=>readOrderBook(db,now)).toThrow(/integrity/);
    }finally{db.close();}
  });
  it('keeps each streamed consumer on its SSR placeholder during hydration even when the parent stream is already live',()=>{
    const live={state:'LIVE',latest:{price:'100'}} as LiveTradeSnapshot;
    expect(hydratedLiveView(live,'CONNECTED',false)).toEqual({snapshot:null,transport:'CONNECTING'});
    expect(hydratedLiveView(live,'CONNECTED',true)).toEqual({snapshot:live,transport:'CONNECTED'});
  });
});
