import type {LiveOrderBook} from '../src/lib/orderBook';
export function orderBookHash(book:Omit<LiveOrderBook,'version'>|LiveOrderBook):string;
export class CoinbaseOrderBook {
  constructor(options?:{now?:()=>number;maxLevels?:number;depthLimit?:number});
  ready:boolean;state:string;reason:string|null;
  reset(state?:string,reason?:string|null):void;
  accept(message:Record<string,unknown>):boolean;
  snapshot(healthy?:boolean):LiveOrderBook;
}
