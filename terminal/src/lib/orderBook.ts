export interface LiveOrderBook {
  schema:'iris-order-book/v1';product:'BTC-USD';session:string;
  state:string;reason:string|null;snapshotAt:number|null;updatedAt:number;observedAt:number|null;eventTime:string|null;
  totalBidLevels:number;totalAskLevels:number;depthLimit:number;
  bids:[string,string][];asks:[string,string][];version:string;
}
