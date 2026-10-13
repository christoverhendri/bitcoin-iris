import type { Envelope } from './envelope';
import type { OhlcvCandle } from './features/ohlcv/types';
import type { IndicatorData } from './features/indicators/types';
import type { SupportResistanceLevels } from './features/levels/types';
import { INTERVAL_MS, completedReplayCandles,type ReplayGap } from './features/ohlcv/replay';
import { ema, rsi, macd, bollinger, pivotPoints, vwap, atrPct } from './quant/series';

export interface MarketEvent { id:string; ts:number; availableAt:number; kind:'ETF_NEWS'|'ONCHAIN'; label:string }
export interface MarketSnapshot {
  ohlcv:Envelope<OhlcvCandle[]>; indicators:Envelope<IndicatorData>; levels:Envelope<SupportResistanceLevels>;
  version:string; cutoff:number; reference:{start:number;end:number;interval:string}|null;
  integrity:'VALID'|'INVALID'|'UNAVAILABLE'; rejected:number; strict:boolean;
  interval:string|null;
}
/** A deterministic content fingerprint, not a cryptographic integrity certificate. */
export function marketVersion(env:Envelope<OhlcvCandle[]>) {
  let hash=2166136261;
  const text=JSON.stringify([env.sourceKey,env.asOf,env.isMock,env.data]);
  for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
  return `market-v1-${(hash>>>0).toString(16).padStart(8,'0')}`;
}
export function validCandle(c:OhlcvCandle) {
  return c.symbol==='BTC-USD'&&!!INTERVAL_MS[c.interval]&&Number.isSafeInteger(c.ts)&&c.ts>=0&&c.ts%(c.interval==='1w'?86400000:INTERVAL_MS[c.interval])===0
    &&[c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)&&Math.min(c.open,c.high,c.low,c.close)>0&&c.volume>=0
    &&c.low<=Math.min(c.open,c.close)&&c.high>=Math.max(c.open,c.close);
}
/** All derived values share one source payload and one completed-bar cutoff. */
export function buildMarketSnapshot(env:Envelope<OhlcvCandle[]>,cutoff:number,options:{version?:string;strict?:boolean}={}):MarketSnapshot {
  const invalid=env.data.some((c,i)=>!validCandle(c)||(i>0&&(c.ts<=env.data[i-1].ts||c.interval!==env.data[0].interval)));
  const eligible=invalid||env.unavailable?[]:completedReplayCandles(env.data,cutoff);
  const candles=options.strict?eligible.filter(c=>{
    const observed=(c as OhlcvCandle&{observedAt?:string}).observedAt;
    return !!observed&&Number.isFinite(Date.parse(observed))&&Date.parse(observed)<=cutoff;
  }):eligible;
  const unavailable=invalid||env.unavailable||!candles.length;
  const ohlcv={...env,data:candles,unavailable,unlockNote:invalid?'Invalid or unordered candle dataset.':unavailable?'No eligible observed candles at this cutoff.':env.unlockNote};
  const last=candles.at(-1),previous=candles.at(-2);
  const ref=last&&previous&&last.ts-previous.ts===INTERVAL_MS[last.interval]?previous:undefined;
  let segment=0;for(let i=1;i<candles.length;i++)if(candles[i].ts-candles[i-1].ts!==INTERVAL_MS[candles[i].interval])segment=i;
  const closes=candles.slice(segment).map(c=>c.close);
  const nan=NaN,bb=closes.length>=20?bollinger(closes):{upper:nan,middle:nan,lower:nan};
  const m=closes.length>=35?macd(closes):{macd:nan,signal:nan};
  const average=(period:number)=>closes.length>=period?ema(closes,period).at(-1)!:nan;
  const data:IndicatorData={rsi:closes.length>=15?rsi(closes):nan,macd:m.macd,macdSignal:m.signal,ema5:average(5),ema8:average(8),ema13:average(13),ema21:average(21),bollingerUpper:bb.upper,bollingerMiddle:bb.middle,bollingerLower:bb.lower,lastClose:last?.close??nan,atrPct:closes.length>=15?atrPct(candles.slice(segment),14):nan};
  const p=ref?pivotPoints(ref.high,ref.low,ref.close):null;
  const levels:SupportResistanceLevels={r1:p?.r1??nan,r2:p?.r2??nan,s1:p?.s1??nan,s2:p?.s2??nan,vwap:last?vwap(candles.slice(-100)):nan};
  const basis={...ohlcv,sourceKey:'internal_quant' as const};
  return {ohlcv,indicators:{...basis,data,unavailable:unavailable||closes.length<35,unlockNote:closes.length<35?'Needs at least 35 eligible candles for full indicator warmup.':basis.unlockNote},
    levels:{...basis,data:levels,unavailable:unavailable||!ref,unlockNote:!ref?'Pivot requires a prior completed candle.':basis.unlockNote},
    version:options.version??marketVersion(env),cutoff,reference:ref?{start:ref.ts,end:ref.ts+INTERVAL_MS[ref.interval],interval:ref.interval}:null,
    integrity:invalid?'INVALID':env.unavailable?'UNAVAILABLE':'VALID',rejected:eligible.length-candles.length,strict:!!options.strict,interval:env.data[0]?.interval??null};
}
export function visibleMarketEvents(events:MarketEvent[],start:number,end:number,cutoff:number) {
  const seen=new Set<string>();
  return events.filter(e=>!!e.id&&!seen.has(e.id)&&Number.isFinite(e.ts)&&Number.isFinite(e.availableAt)&&e.ts>=start&&e.ts<end&&e.ts<=cutoff&&e.availableAt<=cutoff&&(seen.add(e.id),true));
}
/** Unknown availability spans include rejected versions; no later inference leaks. */
export function availabilityGaps(candles:OhlcvCandle[],start:number,end:number,interval:string):ReplayGap[] {
  const step=INTERVAL_MS[interval];if(!step||!Number.isFinite(start)||end<=start)return [];
  const gaps:ReplayGap[]=[];let cursor=start;
  for(const c of candles){if(c.ts<start||c.ts>=end)continue;if(c.ts>cursor)gaps.push({start:cursor,end:c.ts,status:'UNKNOWN'});cursor=c.ts+step;}
  if(cursor<end)gaps.push({start:cursor,end,status:'UNKNOWN'});
  return gaps;
}
