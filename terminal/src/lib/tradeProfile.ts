export interface TradeProfileBin {low:string;high:string;volumeBtc:string;trades:number}
export interface TradeProfile {
  product:'BTC-USD';venue:'coinbase-exchange';version:string;observedAsOf:string;strict:boolean;
  range:{start:string;endExclusive:string};captured:{start:string|null;endExclusive:string|null};
  coverage:'EMPTY'|'PARTIAL'|'CONTIGUOUS_ID_EVIDENCE';idRangeHoles:number;excludedByObservationCutoff:number;
  tradeCount:number;totalVolumeBtc:string;totalNotionalUsd:string;bins:TradeProfileBin[];
}
