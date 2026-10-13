import {describe,it,expect} from 'vitest';
import {live} from './envelope';
import {buildMarketSnapshot,marketVersion,visibleMarketEvents,availabilityGaps} from './marketSnapshot';
import type {OhlcvCandle} from './features/ohlcv/types';
const bars:OhlcvCandle[]=Array.from({length:50},(_,i)=>({symbol:'BTC-USD',interval:'1h',ts:Date.UTC(2020,0,1)+i*3600000,open:100+i,low:99+i,high:106+i,close:102+i,volume:i+1}));
describe('unified market snapshot',()=>{
  it('derives all values from completed bars and prior completed pivot period',()=>{
    const source=live(bars,'coinbase','2026-10-13T00:00:00Z');
    const s=buildMarketSnapshot(source,bars[40].ts);
    expect(s.ohlcv.data).toHaveLength(40);
    expect(s.reference?.start).toBe(bars[38].ts);
    expect(s.indicators.unavailable).toBe(false);
    const altered=bars.map((b,i)=>i<40?b:{...b,high:1000000,close:999999});
    const other=buildMarketSnapshot({...source,data:altered},s.cutoff,{version:s.version});
    expect(other.indicators).toEqual(s.indicators);expect(other.levels).toEqual(s.levels);
    expect(marketVersion({...source,data:altered})).not.toBe(s.version);
  });
  it('fails closed on corrupt ordering/values and insufficient warmup',()=>{
    expect(buildMarketSnapshot(live([...bars].reverse(),'coinbase',null),Infinity).integrity).toBe('INVALID');
    expect(buildMarketSnapshot(live([{...bars[0],volume:-1}],'coinbase',null),bars[1].ts).ohlcv.data).toEqual([]);
    const first=buildMarketSnapshot(live(bars,'coinbase',null),bars[1].ts);
    expect(first.levels.unavailable).toBe(true);expect(first.indicators.unavailable).toBe(true);
  });
  it('requires real observed timestamps in strict replay, not publication timestamps',()=>{
    const seen=bars.map((b,i)=>({...b,observedAt:new Date(i===0?b.ts+3600000:Date.UTC(2026,0,1)).toISOString()}));
    const s=buildMarketSnapshot(live(seen,'coinbase',null),bars[4].ts,{strict:true});
    expect(s.ohlcv.data).toEqual([seen[0]]);expect(s.rejected).toBe(3);
    expect(availabilityGaps(s.ohlcv.data,bars[0].ts,bars[4].ts,'1h')).toEqual([{start:bars[1].ts,end:bars[4].ts,status:'UNKNOWN'}]);
    expect(buildMarketSnapshot(live(bars,'coinbase',null),bars[4].ts,{strict:true}).ohlcv.unavailable).toBe(true);
    expect(visibleMarketEvents([{id:'a',kind:'ETF_NEWS',ts:10,availableAt:30,label:'a'},{id:'b',kind:'ONCHAIN',ts:10,availableAt:20,label:'b'}],0,40,20).map(e=>e.id)).toEqual(['b']);
  });
});
