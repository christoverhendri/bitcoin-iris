import type {LiveOrderBook} from './orderBook';
import type {LiveExecution} from './liveTrades';
export const DOM_GROUPS=['0.01','1','5','10','25','50','100'] as const;
const units=(value:string)=>{if(!/^\d+(?:\.\d{1,8})?$/.test(value))throw new Error('Invalid DOM decimal');const [whole,fraction='']=value.split('.');return BigInt(whole)*BigInt(100000000)+BigInt(fraction.padEnd(8,'0'));};
const fixed=(n:bigint)=>`${n/BigInt(100000000)}.${String(n%BigInt(100000000)).padStart(8,'0')}`;
export interface DomRow {price:string;size:string;cumulative:string;recent:string;side:'bid'|'ask'}
export function buildDom(book:LiveOrderBook,group:string,count:number,trades:LiveExecution[]=[]) {
  if(!DOM_GROUPS.includes(group as typeof DOM_GROUPS[number])||!Number.isInteger(count)||count<1||count>40)throw new Error('Invalid DOM grouping/row count');
  const step=units(group);
  const groupedPrice=(p:bigint,ask:boolean)=>(ask?(p+step-BigInt(1))/step:p/step)*step;
  const side=(levels:[string,string][],ask:boolean):DomRow[]=>{
    const buckets=new Map<bigint,bigint>(),recent=new Map<bigint,bigint>();
    for(const [price,size] of levels){const p=groupedPrice(units(price),ask);buckets.set(p,(buckets.get(p)??BigInt(0))+units(size));}
    for(const trade of trades){if((trade.side==='sell')!==ask)continue;const p=groupedPrice(units(trade.price),ask);recent.set(p,(recent.get(p)??BigInt(0))+units(trade.size));}
    let cumulative=BigInt(0);
    return [...buckets.entries()].sort((a,b)=>a[0]===b[0]?0:(a[0]<b[0]?-1:1)*(ask?1:-1)).slice(0,count).map(([p,q])=>{cumulative+=q;return {price:fixed(p),size:fixed(q),cumulative:fixed(cumulative),recent:fixed(recent.get(p)??BigInt(0)),side:ask?'ask':'bid'};});
  };
  const bids=book.state==='LIVE'?side(book.bids,false):[],asks=book.state==='LIVE'?side(book.asks,true):[];
  const bidTotal=bids.reduce((sum,r)=>sum+units(r.size),BigInt(0)),askTotal=asks.reduce((sum,r)=>sum+units(r.size),BigInt(0));
  const bid=book.bids[0]?.[0]??null,ask=book.asks[0]?.[0]??null;
  return {bids,asks,bid,ask,spread:bid&&ask?fixed(units(ask)-units(bid)):null,bidTotal:fixed(bidTotal),askTotal:fixed(askTotal),bidShare:bidTotal+askTotal>BigInt(0)?Number(bidTotal*BigInt(10000)/(bidTotal+askTotal))/100:null};
}
