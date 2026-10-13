import type {DatabaseSync} from 'node:sqlite';
export interface NormalTrade {tradeId:number;tsUs:number;priceUnits:string;sizeUnits:string;makerSide:'buy'|'sell';hash:string}
export function decimalUnits(value:unknown):string;
export function timestampUs(value:unknown):number;
export function tradeHash(trade:Omit<NormalTrade,'hash'>):string;
export function parseTrade(raw:unknown,observedAtUs:number):NormalTrade;
export function openTradeLedger(path:string):DatabaseSync;
export function storeTradePage(db:DatabaseSync,raw:unknown,observedAtUs:number,cursor?:{after?:string|null;next?:string|null}):{inserted:number;count:number;minId:number|null;maxId:number|null;oldestTsUs:number|null};
