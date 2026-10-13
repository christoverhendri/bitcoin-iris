'use client';
import {useEffect,useRef,useState} from 'react';
import type {TradeProfile} from '@/lib/tradeProfile';
import {fmtUsd} from '@/lib/format';
export function TradeVolumeProfile({start,cutoff,strict,source,live=false}:{start:number|null;cutoff:number;strict:boolean;source:string;live?:boolean}) {
  const [window,setWindow]=useState('snapshot'),[profile,setProfile]=useState<TradeProfile|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const abort=useRef<AbortController|null>(null);
  useEffect(()=>()=>abort.current?.abort(),[]);
  useEffect(()=>{
    if(!live||source!=='coinbase')return;
    let active=true,controller:AbortController|null=null;
    const refresh=async()=>{
      if(controller)return;
      controller=new AbortController();const end=Date.now();
      const params=new URLSearchParams({start:new Date(end-15*60000).toISOString(),end:new Date(end).toISOString(),cutoff:new Date(end).toISOString(),strict:'false'});
      try{const response=await fetch(`/api/market/trades/profile?${params}`,{signal:controller.signal,cache:'no-store'});const value=await response.json();if(!response.ok||value.unavailable)throw new Error(value.error??'Live profile unavailable');if(active){setProfile(value);setError('');}}
      catch(e){if(active)setError(e instanceof Error?e.message:'Live profile unavailable');}
      finally{controller=null;}
    };
    void refresh();const timer=setInterval(()=>void refresh(),5000);
    return ()=>{active=false;clearInterval(timer);controller?.abort();};
  },[live,source]);
  const queryStart=start===null?null:window==='snapshot'?start:Math.max(start,cutoff-Number(window)*60000);
  // Explicit load avoids doing a large ledger query on every playback tick.
  const matching=profile&&source==='coinbase'&&(live||queryStart!==null&&Date.parse(profile.range.start)===queryStart&&Date.parse(profile.range.endExclusive)===cutoff&&profile.strict===strict);
  const shown=matching?profile:null;
  const load=async()=>{
    if(queryStart===null||source!=='coinbase')return;
    abort.current?.abort();const controller=new AbortController();abort.current=controller;setLoading(true);setError('');setProfile(null);
    const params=new URLSearchParams({start:new Date(queryStart).toISOString(),end:new Date(cutoff).toISOString(),cutoff:new Date(cutoff).toISOString(),strict:String(strict)});
    try{const response=await fetch(`/api/market/trades/profile?${params}`,{signal:controller.signal,cache:'no-store'});const value=await response.json();if(!response.ok||value.unavailable)throw new Error(value.error??'Trade profile unavailable');setProfile(value);}
    catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Trade profile failed');}
    finally{if(!controller.signal.aborted)setLoading(false);}
  };
  const max=Math.max(.00000001,...(shown?.bins??[]).map(b=>Number(b.volumeBtc)));
  return <section aria-label="Executed trade volume profile"><h3>Executed-trade volume profile</h3>
    {live?<p>Live rolling 15-minute profile · refreshes every 5 seconds · observation watermark shown below.</p>:<div className="market-chart-tools"><label>Trade window <select aria-label="Trade profile window" value={window} onChange={e=>setWindow(e.target.value)}><option value="snapshot">Snapshot window</option><option value="15">Last 15 minutes</option><option value="60">Last hour</option><option value="1440">Last 24 hours</option></select></label><button disabled={loading||queryStart===null||source!=='coinbase'} onClick={()=>void load()}>{loading?'Reading trade ledger…':'Load trade profile'}</button></div>}
    <p>Bins sum actual execution size at actual execution price. No OHLCV fallback. Venue must match the chart. Side is the maker side, not inferred buying/selling pressure.</p>
    {source!=='coinbase'&&<p role="status">Unavailable: chart venue does not match the trade ledger.</p>}
    {queryStart===null&&<p role="status">Unavailable: no eligible candle range at this position.</p>}
    {error&&<p role="alert">{error}</p>}
    {profile&&!matching&&<p role="status">Snapshot/window changed. Reload to avoid displaying a profile from another cutoff.</p>}
    {shown&&<><dl className="market-coverage-grid"><div><dt>Trade count / actual volume</dt><dd>{shown.tradeCount} trades · {shown.totalVolumeBtc} BTC</dd></div><div><dt>Coverage</dt><dd>{shown.coverage} · {shown.idRangeHoles} ID-range holes</dd></div><div><dt>Requested range</dt><dd>{shown.range.start} → {shown.range.endExclusive}</dd></div><div><dt>Captured ledger bounds</dt><dd>{shown.captured.start??'—'} → {shown.captured.endExclusive??'—'}</dd></div><div><dt>Observation watermark</dt><dd>{shown.observedAsOf} · {shown.strict?'strict':'reconstructed'}</dd></div>{shown.strict&&<div><dt>Versions excluded</dt><dd>{shown.excludedByObservationCutoff}</dd></div>}{process.env.NODE_ENV==='development'&&<div><dt>Source</dt><dd>{shown.venue}</dd></div>}</dl>
      <p>Volume describes captured trades only. Partial bounds or ID holes do not imply zero trading. Even contiguous IDs are coverage evidence, not an independent completeness certificate.</p>
      {shown.tradeCount?<div className="market-volume-profile">{shown.bins.map((b,i)=><div key={i}><span>{fmtUsd(Number(b.low))}–{fmtUsd(Number(b.high))}</span><meter min={0} max={max} value={Number(b.volumeBtc)} /><span>{b.volumeBtc} BTC</span></div>)}</div>:<p role="status">No eligible trades stored for this window. Historical trade coverage has not been invented.</p>}
    </>}
  </section>;
}
