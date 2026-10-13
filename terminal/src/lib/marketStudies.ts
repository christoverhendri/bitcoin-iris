import type {OhlcvCandle} from './features/ohlcv/types';
import {INTERVAL_MS} from './features/ohlcv/replay';
import {bollinger} from './quant/series';
export interface Swing {ts:number;confirmedAt:number;price:number;kind:'HIGH'|'LOW'}
export function marketOverlays(candles:OhlcvCandle[]) {
  let count=0,average=0;const window:number[]=[];
  return candles.map((c,i)=>{
    const breakBefore=!i||c.ts-candles[i-1].ts!==INTERVAL_MS[c.interval];
    if(breakBefore){count=0;window.length=0;average=c.close;}
    else average=c.close*(2/22)+average*(1-2/22);
    count++;window.push(c.close);if(window.length>20)window.shift();
    return {ts:c.ts,breakBefore,ema21:count>=21?average:null,bb:count>=20?bollinger(window):null};
  });
}
/** Two bars on each side; confirmation is only emitted once those bars exist. */
export function confirmedSwings(candles:OhlcvCandle[]):Swing[] {
  const out:Swing[]=[];
  for(let i=2;i<candles.length-2;i++) {
    const window=candles.slice(i-2,i+3),c=candles[i];
    if(window.some((b,j)=>j>0&&b.ts-window[j-1].ts!==INTERVAL_MS[b.interval]))continue;
    if(window.every(b=>b===c||c.high>b.high))out.push({ts:c.ts,confirmedAt:candles[i+2].ts+INTERVAL_MS[c.interval],price:c.high,kind:'HIGH'});
    if(window.every(b=>b===c||c.low<b.low))out.push({ts:c.ts,confirmedAt:candles[i+2].ts+INTERVAL_MS[c.interval],price:c.low,kind:'LOW'});
  }
  return out;
}
export function priceStructure(swings:Swing[]) {
  const high=swings.filter(s=>s.kind==='HIGH').slice(-2),low=swings.filter(s=>s.kind==='LOW').slice(-2);
  if(high.length<2||low.length<2)return 'INSUFFICIENT CONFIRMED SWINGS';
  if(high[1].price>high[0].price&&low[1].price>low[0].price)return 'HIGHER HIGH / HIGHER LOW';
  if(high[1].price<high[0].price&&low[1].price<low[0].price)return 'LOWER HIGH / LOWER LOW';
  return 'MIXED / RANGE';
}
export function comparePeriods(candles:OhlcvCandle[],bars:number) {
  if(!Number.isInteger(bars)||bars<2||bars>500||candles.length<bars*2)return null;
  const groups=[candles.slice(-bars*2,-bars),candles.slice(-bars)];
  return groups.map(group=>({start:group[0].ts,end:group.at(-1)!.ts+INTERVAL_MS[group[0].interval],bars:group.length,
    returnPct:(group.at(-1)!.close/group[0].open-1)*100,volume:group.reduce((n,c)=>n+c.volume,0),
    complete:group.every((c,i)=>!i||c.ts-group[i-1].ts===INTERVAL_MS[c.interval])}));
}
export function chartRange(start:number,end:number,from:number,to:number,step:number) {
  const span=Math.min(end-start,Math.max(step*2,Math.round((to-from)/step)*step));
  const left=Math.max(start,Math.min(end-span,start+Math.round((from-start)/step)*step));
  return {from:left,to:left+span};
}
