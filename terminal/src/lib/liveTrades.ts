export interface LiveExecution {id:number;time:string;price:string;size:string;side:'buy'|'sell'}
export interface LiveTradeSnapshot {
  state:string;error:string|null;updatedAt:number;heartbeatAt:number|null;gapAnchor:number|null;
  latest:LiveExecution|null;trades:LiveExecution[];
  candle:{start:string;open:string;high:string;low:string;close:string;volume:string;count:number}|null;
  change24hPct?:number|null;
  orderBook?:import('./orderBook').LiveOrderBook;
  chart?:{interval:string;from:number;cutoff:number;candles:(import('./features/ohlcv/types').OhlcvCandle&{complete:boolean;forming:boolean;observedAt:string})[];error:string|null};
}
export const liveEligible=(replaying:boolean,archive:boolean,source:string,mock:boolean)=>!replaying&&!archive&&source==='coinbase'&&!mock;
