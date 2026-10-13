'use client';
import {createContext,useCallback,useContext,useEffect,useMemo,useState,useSyncExternalStore,type ReactNode} from 'react';
import {hydratedLiveView} from '@/lib/liveView';
import type {LiveTradeSnapshot} from '@/lib/liveTrades';
type ChartRequest={interval:string;from:number;book?:boolean}|null;
const Context=createContext<{snapshot:LiveTradeSnapshot|null;transport:string;configure:(request:ChartRequest)=>void}>({snapshot:null,transport:'CONNECTING',configure:()=>{}});
/** One browser subscription shared by header, chart and execution panels. */
export function LiveMarketProvider({children}:{children:ReactNode}) {
  const [snapshot,setSnapshot]=useState<LiveTradeSnapshot|null>(null),[transport,setTransport]=useState('CONNECTING'),[query,setQuery]=useState('');
  const configure=useCallback((request:ChartRequest)=>setQuery(request?`?${new URLSearchParams({interval:request.interval,from:String(request.from),...(request.book?{book:'true'}:{})})}`:''),[]);
  useEffect(()=>{
    let active=true,received=0;const feed=new EventSource(`/api/market/trades/live${query}`);
    feed.addEventListener('snapshot',event=>{if(!active)return;try{const data=JSON.parse((event as MessageEvent).data);setSnapshot(data);received=Date.now();setTransport('CONNECTED');}catch{setTransport('UNAVAILABLE');}});
    feed.onerror=()=>{if(active)setTransport('RECONNECTING');};
    const watchdog=setInterval(()=>{if(active&&received&&Date.now()-received>5000)setTransport('STALE');},1000);
    return ()=>{active=false;clearInterval(watchdog);feed.close();};
  },[query]);
  const value=useMemo(()=>({snapshot,transport,configure}),[snapshot,transport,configure]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
const subscribeHydration=()=>()=>{};
const clientHydration=()=>true;
const serverHydration=()=>false;
export function useLiveMarket(){
  const context=useContext(Context);
  // A streamed Suspense child can hydrate after its parent already received SSE.
  // React uses the server snapshot for that child's initial hydration render.
  const hydrated=useSyncExternalStore(subscribeHydration,clientHydration,serverHydration);
  return {...hydratedLiveView(context.snapshot,context.transport,hydrated),configure:context.configure};
}
