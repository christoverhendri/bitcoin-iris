import {describe,it,expect} from 'vitest';
import {confirmedSwings,priceStructure,comparePeriods,chartRange,marketOverlays} from './marketStudies';
import type {OhlcvCandle} from './features/ohlcv/types';
const bars:OhlcvCandle[]=Array.from({length:60},(_,i)=>({symbol:'BTC-USD',interval:'1h',ts:Date.UTC(2020,0,1)+i*3600000,open:100,close:100+Math.sin(i)*5,high:110+Math.sin(i)*5,low:90+Math.sin(i)*5,volume:i+1}));
describe('cutoff-bound market studies',()=>{
  it('delays swing confirmation and resets confirmations/overlays across gaps',()=>{
    const spike=bars.slice(0,5).map((c,i)=>({...c,high:i===2?999:110}));
    expect(confirmedSwings(spike.slice(0,4))).toEqual([]);
    expect(confirmedSwings(spike)[0]).toMatchObject({kind:'HIGH',ts:spike[2].ts,confirmedAt:spike[4].ts+3600000});
    const gap=spike.map((c,i)=>i>=3?{...c,ts:c.ts+3600000}:c);
    expect(confirmedSwings(gap)).toEqual([]);
    expect(marketOverlays(bars)[20].ema21).not.toBeNull();
    const afterGap=marketOverlays(bars.map((c,i)=>i>=30?{...c,ts:c.ts+3600000}:c));
    expect(afterGap[30]).toMatchObject({breakBefore:true,ema21:null,bb:null});
    expect(priceStructure([])).toContain('INSUFFICIENT');
  });
  it('compares trailing revealed periods and flags unequal gap coverage',()=>{
    expect(comparePeriods(bars.slice(0,30),20)).toBeNull();
    expect(comparePeriods(bars,20)?.[1].end).toBe(bars.at(-1)!.ts+3600000);
    const gapped=bars.map((c,i)=>i>=50?{...c,ts:c.ts+3600000}:c);
    expect(comparePeriods(gapped,20)?.[1].complete).toBe(false);
  });
  it('bounds pan/zoom and keeps view coordinates on the candle grid',()=>{
    expect(chartRange(0,100,95,200,10)).toEqual({from:0,to:100});
    expect(chartRange(0,100,33,47,10)).toEqual({from:30,to:50});
    expect(chartRange(0,100,-40,-10,10)).toEqual({from:0,to:30});
  });
});
