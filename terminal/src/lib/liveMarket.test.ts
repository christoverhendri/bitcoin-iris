import {describe,it,expect} from 'vitest';
import {live} from './envelope';
import {buildMarketSnapshot} from './marketSnapshot';
import {applyLiveMarket} from './liveMarket';
import type {OhlcvCandle} from './features/ohlcv/types';
import type {LiveTradeSnapshot} from './liveTrades';
const step=3600000,base=Date.UTC(2026,0,1);
const bar=(ts:number):OhlcvCandle=>({symbol:'BTC-USD',interval:'1h',ts,open:100,high:110,low:90,close:105,volume:1});
const initial=buildMarketSnapshot(live(Array.from({length:40},(_,i)=>bar(base+i*step)),'coinbase',new Date(base+40*step).toISOString()),base+40*step+1000);
function streamed():LiveTradeSnapshot{return {state:'LIVE',error:null,updatedAt:base+41*step+30000,heartbeatAt:base+41*step+30000,gapAnchor:1,latest:null,trades:[],candle:null,chart:{interval:'1h',from:base+40*step,cutoff:base+41*step+30000,error:null,candles:[{...bar(base+40*step),complete:true,forming:false,observedAt:new Date(base+41*step).toISOString()},{...bar(base+41*step),close:109,volume:2,complete:true,forming:true,observedAt:new Date(base+41*step+30000).toISOString()}]}};}
describe('shared live chart and replay isolation',()=>{
  it('updates the forming candle, while indicators/levels use only completed bars at the same cutoff',()=>{
    const result=applyLiveMarket(initial,streamed(),true);
    expect(result.display.data).toHaveLength(42);expect(result.display.data.at(-1)?.close).toBe(109);
    expect(result.market.ohlcv.data).toHaveLength(41);expect(result.market.indicators.data.lastClose).toBe(105);
    expect(result.market.cutoff).toBe(streamed().chart!.cutoff);expect(result.forming).toBe(true);
  });
  it('replaces candles by timestamp instead of accumulating volume on repeated/recovered snapshots',()=>{
    const first=applyLiveMarket(initial,streamed(),true),second=applyLiveMarket(initial,streamed(),true);
    expect(first.display).toEqual(second.display);expect(second.display.data.at(-1)?.volume).toBe(2);
    const amended=streamed();amended.chart!.candles[1].volume=3;
    expect(applyLiveMarket(initial,amended,true).display.data.at(-1)?.volume).toBe(3);
  });
  it('retains partial forming bars without promoting incomplete closed bars into indicators',()=>{
    const data=streamed();data.chart!.candles.forEach(c=>{c.complete=false;});
    const result=applyLiveMarket(initial,data,true);expect(result.market.ohlcv.data).toHaveLength(40);expect(result.partial).toBe(true);expect(result.display.data.at(-1)?.ts).toBe(base+41*step);
  });
  it('freezes replay dataset/version/cutoff even when the live quote continues changing',()=>{
    const frozen=applyLiveMarket(initial,streamed(),true).market;
    const later=streamed();later.chart!.cutoff+=step;later.chart!.candles[1].close=108;
    const replay=applyLiveMarket(frozen,later,false);
    expect(replay.market).toBe(frozen);expect(replay.display).toBe(frozen.ohlcv);expect(initial.ohlcv.data).toHaveLength(40);
  });
  it('refuses other intervals/venues and invalid tail candles',()=>{
    const mismatch=streamed();mismatch.chart!.interval='1d';expect(applyLiveMarket(initial,mismatch,true).market).toBe(initial);
    const bad=streamed();bad.chart!.candles[1].high=50;expect(applyLiveMarket(initial,bad,true).forming).toBe(false);
    expect(applyLiveMarket({...initial,ohlcv:{...initial.ohlcv,sourceKey:'kraken'}},streamed(),true).forming).toBe(false);
  });
});
