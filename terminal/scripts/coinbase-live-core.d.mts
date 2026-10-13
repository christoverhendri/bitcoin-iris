import type {DatabaseSync} from 'node:sqlite';
export class CoinbaseLiveCollector {
  constructor(db:DatabaseSync,options:{now?:()=>number;fetchPage:(after:string|null)=>Promise<{rows:unknown[];next:string|null}>;maxPages?:number;onStatus?:(status:CoinbaseLiveCollector['status'])=>void});
  anchor:number|null;stopped:boolean;recovery:Promise<void>|null;
  status:{state:string;updatedAt:number;heartbeatAt:number|null;lastTradeAt:number|null;gapAnchor:number|null;error:string|null};
  accept(message:Record<string,unknown>):void;
  flush():void;
  publish(state?:string,error?:string|null):typeof this.status;
  recover():Promise<void>;
}
