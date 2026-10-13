'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import {createPortal} from 'react-dom';
import { Panel, PanelHeader, StatTile, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { OhlcvCandle } from '@/lib/features/ohlcv';
import type { SupportResistanceLevels } from '@/lib/features/levels';
import { toOhlcvLabel } from '@/lib/features/ohlcv/present';
import { fmtUsd, fmtPct } from '@/lib/format';
import { INTERVAL_MS, type ReplayGap } from '@/lib/features/ohlcv/replay';
import { useResearchFocus } from '../overview/ResearchFocusContext';
import { eventInChart } from '@/lib/researchWorkspace';
import {marketOverlays,chartRange} from '@/lib/marketStudies';
import {visibleMarketEvents,type MarketEvent} from '@/lib/marketSnapshot';

export interface PriceChartLargeProps {
  ohlcv: Envelope<OhlcvCandle[]>;
  levels?: Envelope<SupportResistanceLevels>;
  timeframe?: string;
  replay?: boolean;
  gaps?: ReplayGap[];
  replayGap?: ReplayGap;
  replayInterval?: string;
  events?:MarketEvent[];
  eventCutoff?:number;
  liveForming?:boolean;
  partial?:boolean;
}

const W = 1000;
const H = 420;
const PAD = 10;
const PRICE_BOTTOM = 320;
const VOLUME_TOP = 350;
const dateLabel = (ts: number) => new Date(ts).toISOString().slice(0, 16).replace('T', ' ');

export function PriceChartLarge({ ohlcv, levels, timeframe, replay = false, gaps = [], replayGap, replayInterval,events=[],eventCutoff=Infinity,liveForming=false,partial=false }: PriceChartLargeProps) {
  const research = useResearchFocus();
  const [selected, setSelected] = useState<number | null>(null);
  const [crossY,setCrossY]=useState<number|null>(null);
  const [view,setView]=useState<{from:number;to:number}|null>(null);
  const [log,setLog]=useState(false);
  const [autoscale,setAutoscale]=useState(true);
  const [locked,setLocked]=useState<{hi:number;lo:number}|null>(null);
  const [expanded,setExpanded]=useState(false);
  const [overlay,setOverlay]=useState({ema:false,bollinger:false,volume:true,etf:false,onchain:false});
  const host=useRef<HTMLDivElement>(null),svg=useRef<SVGSVGElement>(null);
  const pan=useRef<{x:number;from:number;to:number}|null>(null);
  const allCandles = useMemo(()=>ohlcv.unavailable ? [] : ohlcv.data,[ohlcv.unavailable,ohlcv.data]);
  const allGaps=gaps.length?gaps:allCandles.slice(1).flatMap((c,i)=>{const start=allCandles[i].ts+INTERVAL_MS[c.interval];return c.ts>start?[{start,end:c.ts,status:'UNKNOWN' as const}]:[];});
  const step = INTERVAL_MS[allCandles.at(-1)?.interval ?? replayInterval ?? '1h'];
  const fullStart=Math.min(allCandles[0]?.ts??Infinity,...allGaps.map(g=>g.start));
  const fullEnd=Math.max(allCandles.at(-1)?allCandles.at(-1)!.ts+step:0,...allGaps.map(g=>g.end));
  const range=view&&Number.isFinite(fullStart)?chartRange(fullStart,fullEnd,view.from,view.to,step):{from:fullStart,to:fullEnd};
  const candles=allCandles.filter(c=>c.ts>=range.from&&c.ts<range.to);
  const shownGaps=allGaps.filter(g=>g.end>range.from&&g.start<range.to);
  const n = candles.length;
  const latest = allCandles.at(-1);
  const timeStart = range.from;
  const timeEnd = range.to;
  const slots = Math.max(1, (timeEnd - timeStart) / step);
  const activeIndex = selected === null ? replayGap ? -1 : n - 1 : candles.findIndex((c) => c.ts === timeStart + selected * step);
  const active = candles[activeIndex];
  const selectedGap = selected === null ? replayGap : shownGaps.find((g) => timeStart + selected * step >= g.start && timeStart + selected * step < g.end);
  const ohl = active ? toOhlcvLabel(active) : null;
  // Do not overlay placeholder levels on observed price candles, or vice versa.
  const guides = levels && !levels.unavailable && levels.isMock === ohlcv.isMock
    ? [
        { key: 'R1', v: levels.data.r1, tone: 'var(--down)' },
        { key: 'VWAP', v: levels.data.vwap, tone: 'var(--blue)' },
        { key: 'S1', v: levels.data.s1, tone: 'var(--up)' },
      ].filter((g) => Number.isFinite(g.v) && g.v > 0)
    : [];
  const rawHi = n ? Math.max(...candles.map((c) => c.high)) : 1;
  const rawLo = n ? Math.min(...candles.map((c) => c.low)) : 0;
  const margin = (rawHi - rawLo || rawHi * 0.01 || 1) * 0.08;
  const hi = !autoscale&&locked?locked.hi:rawHi + margin;
  const lo = Math.max(.000001,!autoscale&&locked?locked.lo:rawLo - margin);
  const span = hi - lo;
  const cw = (W - PAD * 2) / Math.max(slots, replay&&!view ? 60 : 1);
  const x = (ts: number) => PAD + (ts - timeStart) / step * cw;
  const event = research.focus?.event;
  const showEvent = event && eventInChart(event.publishedAt,timeStart,timeEnd-step,step);
  const bodyW = Math.max(0.5, cw * 0.65);
  const transform=(p:number)=>log?Math.log(Math.max(.000001,p)):p;
  const scaledLo=transform(lo),scaledSpan=transform(hi)-scaledLo;
  const y = (p: number) => PRICE_BOTTOM - ((transform(p)-scaledLo) / scaledSpan) * (PRICE_BOTTOM - PAD);
  const priceAt=(t:number)=>log?Math.exp(scaledLo+scaledSpan*t):lo+span*t;
  const lines=useMemo(()=>marketOverlays(allCandles),[allCandles]);
  const path=(pick:(p:typeof lines[number])=>number|null)=>{
    let joined=false;
    return lines.filter(p=>p.ts>=timeStart&&p.ts<timeEnd).map(p=>{const value=pick(p);if(value===null){joined=false;return '';}const command=joined&&!p.breakBefore?'L':'M';joined=true;return `${command}${x(p.ts)+cw/2},${y(value)}`;}).join(' ');
  };
  const marked=visibleMarketEvents(events,timeStart,timeEnd,eventCutoff).filter(e=>e.kind==='ETF_NEWS'?overlay.etf:overlay.onchain);
  const zoom=(factor:number)=>{if(!Number.isFinite(fullStart))return;const center=(range.from+range.to)/2,half=(range.to-range.from)*factor/2;setView(chartRange(fullStart,fullEnd,center-half,center+half,step));setSelected(null);};
  const shift=(direction:number)=>{if(!Number.isFinite(fullStart))return;const delta=(range.to-range.from)*.2*direction;setView(chartRange(fullStart,fullEnd,range.from+delta,range.to+delta,step));setSelected(null);};
  useEffect(()=>{
    const node=svg.current;if(!node||!Number.isFinite(fullStart))return;
    const wheel=(e:WheelEvent)=>{e.preventDefault();const rect=node.getBoundingClientRect();const anchor=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));setView(current=>{const r=current?chartRange(fullStart,fullEnd,current.from,current.to,step):{from:fullStart,to:fullEnd};const span=(r.to-r.from)*(e.deltaY<0?.8:1.25),center=r.from+(r.to-r.from)*anchor;return chartRange(fullStart,fullEnd,center-span*anchor,center+span*(1-anchor),step);});setSelected(null);};
    node.addEventListener('wheel',wheel,{passive:false});return()=>node.removeEventListener('wheel',wheel);
  },[fullStart,fullEnd,step,expanded]);
  useEffect(()=>{
    if(!expanded)return;const previous=document.activeElement as HTMLElement|null,node=host.current;
    node?.querySelector<HTMLElement>('button')?.focus();
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();setExpanded(false);}if(e.key==='Tab'&&node){const items=Array.from(node.querySelectorAll<HTMLElement>('button:not(:disabled),select,input,[tabindex="0"]'));const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
    document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus();};
  },[expanded]);
  const maxVolume = Math.max(1, ...candles.map((c) => c.volume));
  const windowChange = !replayGap && candles.length && candles[0].open > 0
    ? ((candles.at(-1)!.close - candles[0].open) / candles[0].open) * 100 : null;

  const chart = (
    <div ref={host} className={expanded?'market-chart-fullscreen':undefined} role={expanded?'dialog':undefined} aria-modal={expanded?true:undefined} aria-label={expanded?'Fullscreen market chart':undefined}><Panel className="market-price-panel">
      <PanelHeader title={replay ? 'PRICE ACTION · REPLAY' : 'PRICE ACTION'} note={`${timeframe ?? '1D'} · ${n} ${latest?.interval ?? ''} candles`} right={<MockBadge env={ohlcv} />} />
      <div className="market-price-heading">
        <div><span className="market-caption">BTC / USD · {replayGap?.status ?? (replay ? 'REPLAY CLOSE' : liveForming?`FORMING${partial?' · PARTIAL':''}`:'LATEST CLOSE')}</span><div className="market-last-price">{fmtUsd(replayGap ? null : latest?.close)}</div></div>
        <div className="market-window-change"><span className="market-caption">DISPLAYED WINDOW</span><strong style={{ color: windowChange === null ? 'var(--mut)' : windowChange >= 0 ? 'var(--up)' : 'var(--down)' }}>{fmtPct(windowChange)}</strong></div>
      </div>
      <div className="market-chart-body">
        <div className="market-chart-tools" aria-label="Chart controls">
          <button disabled={!allCandles.length} onClick={()=>zoom(.7)} aria-label="Zoom chart in">Zoom +</button><button disabled={!allCandles.length} onClick={()=>zoom(1.4)} aria-label="Zoom chart out">Zoom −</button>
          <button disabled={!allCandles.length} onClick={()=>shift(-1)} aria-label="Pan chart earlier">← Pan</button><button disabled={!allCandles.length} onClick={()=>shift(1)} aria-label="Pan chart later">Pan →</button>
          <button onClick={()=>{setView(null);setLocked(null);setAutoscale(true);setSelected(null);}}>Reset view</button>
          <label><input type="checkbox" checked={autoscale} onChange={e=>{setLocked({hi,lo});setAutoscale(e.target.checked);}} /> Autoscale</label>
          <select aria-label="Chart price scale" value={log?'log':'linear'} onChange={e=>setLog(e.target.value==='log')}><option value="linear">Linear</option><option value="log">Log</option></select>
          <button onClick={()=>setExpanded(!expanded)}>{expanded?'Exit fullscreen':'Fullscreen'}</button>
        </div>
        <div className="market-chart-tools" aria-label="Indicator and event overlays">{(['ema','bollinger','volume','etf','onchain'] as const).map(key=><label key={key}><input type="checkbox" checked={overlay[key]} onChange={e=>setOverlay({...overlay,[key]:e.target.checked})} />{{ema:'EMA21',bollinger:'Bollinger 20/2',volume:'Volume',etf:'ETF news',onchain:'On-chain events'}[key]}</label>)}</div>
        {(overlay.etf||overlay.onchain)&&<span className="market-caption">{marked.length} validated events inside the view/cutoff. ETF markers are news publication events, not fund-flow amounts. Missing historical availability is excluded.</span>}
        <div className="market-chart-readout"><span>{active ? `${dateLabel(active.ts)} UTC` : replayGap ? `${dateLabel(replayGap.start)} UTC · ${replayGap.status}` : selected !== null ? `${dateLabel(timeStart + selected * step)} UTC · Missing price` : 'No candles available'}</span><span>{selected === null ? view?'LAST VISIBLE CANDLE':replay ? 'REPLAY POSITION' : 'LATEST CANDLE' : 'SELECTED INTERVAL'}</span></div>
        {ohl && <div className="market-ohlcv-grid">
          <StatTile label="OPEN" value={ohl.open} />
          <StatTile label="HIGH" value={ohl.high} tone="up" />
          <StatTile label="LOW" value={ohl.low} tone="down" />
          <StatTile label="CLOSE" value={ohl.close} tone={active.close >= active.open ? 'up' : 'down'} />
          <StatTile label="VOLUME · BTC" value={ohl.volume} tone="mut" />
        </div>}
        {!ohl && <div className="market-ohlcv-grid">{['OPEN', 'HIGH', 'LOW', 'CLOSE', 'VOLUME · BTC'].map((label) => <StatTile key={label} label={label} value={label === 'VOLUME · BTC' && selectedGap?.status === 'INFERRED_NO_TRADE' ? '0 (inferred)' : '—'} />)}</div>}
        {allCandles.length || shownGaps.length ? <>
          <div className="market-chart-grid">
            <svg ref={svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="market-candle-chart"
              role="group" aria-label="BTC/USD candlestick and volume chart. Use left and right arrows to inspect candles; Escape returns to latest." tabIndex={0}
              onPointerMove={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                if(pan.current){const delta=(event.clientX-pan.current.x)/bounds.width*(pan.current.to-pan.current.from);setView(chartRange(fullStart,fullEnd,pan.current.from-delta,pan.current.to-delta,step));return;}
                const x = ((event.clientX - bounds.left) / bounds.width) * W;
                setSelected(Math.max(0, Math.min(slots - 1, Math.floor((x - PAD) / cw))));
                setCrossY(Math.max(PAD,Math.min(PRICE_BOTTOM,(event.clientY-bounds.top)/bounds.height*H)));
              }}
              onPointerDown={e=>{if(e.button!==0)return;pan.current={x:e.clientX,from:range.from,to:range.to};e.currentTarget.setPointerCapture(e.pointerId);}}
              onPointerUp={e=>{pan.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
              onPointerCancel={()=>{pan.current=null;}}
              onPointerLeave={() => {if(!pan.current){setSelected(null);setCrossY(null);}}} onBlur={() => {setSelected(null);setCrossY(null);}}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setSelected(null);
                else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                  event.preventDefault();
                  const slot = selected ?? slots - 1;
                  setSelected(Math.max(0, Math.min(slots - 1, slot + (event.key === 'ArrowLeft' ? -1 : 1))));
                }
              }}>
              {[0, 0.25, 0.5, 0.75, 1].map((t) => <line key={t} x1={PAD} x2={W - PAD} y1={PAD + t * (PRICE_BOTTOM - PAD)} y2={PAD + t * (PRICE_BOTTOM - PAD)} stroke="var(--line)" vectorEffect="non-scaling-stroke" />)}
              <line x1={PAD} x2={W - PAD} y1={VOLUME_TOP - 12} y2={VOLUME_TOP - 12} stroke="var(--line)" vectorEffect="non-scaling-stroke" />
              {shownGaps.map((g) => <g key={`${g.start}-${g.end}`}><title>{g.status} · {(g.end - g.start) / 60_000} min · no observed price</title><rect x={x(g.start)} y={PAD} width={Math.max(0.5, (g.end - g.start) / step * cw)} height={H - PAD * 2} fill={g.status === 'UNKNOWN' ? 'var(--amber)' : 'var(--blue)'} opacity="0.16" /></g>)}
              {marked.map(e=><g key={e.id}><title>{e.kind} · {e.label} · {dateLabel(e.ts)} UTC</title><line x1={x(e.ts)} x2={x(e.ts)} y1={PAD} y2={PRICE_BOTTOM} stroke={e.kind==='ETF_NEWS'?'var(--purple)':'var(--blue)'} strokeDasharray="2 6" vectorEffect="non-scaling-stroke" /></g>)}
              {showEvent&&<g aria-label={`Investigated story published ${new Date(event.publishedAt).toISOString()}`}><title>{event.title} · publication time</title><line x1={x(event.publishedAt)} x2={x(event.publishedAt)} y1={PAD} y2={H-PAD} stroke="var(--purple)" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" /></g>}
              {candles.map((c) => {
                const cx = x(c.ts) + cw / 2;
                const tone = c.close >= c.open ? 'var(--up)' : 'var(--down)';
                const volumeHeight = (c.volume / maxVolume) * (H - VOLUME_TOP - PAD);
                return <g key={c.ts}>
                  <line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={tone} vectorEffect="non-scaling-stroke" />
                  <rect x={cx - bodyW / 2} y={y(Math.max(c.open, c.close))} width={bodyW} height={Math.max(1, Math.abs(y(c.open) - y(c.close)))} fill={tone} />
                  {overlay.volume&&<rect x={cx - bodyW / 2} y={H - PAD - volumeHeight} width={bodyW} height={volumeHeight} fill={tone} opacity="0.4" />}
                </g>;
              })}
              {overlay.ema&&<path d={path(p=>p.ema21)} fill="none" stroke="var(--amber)" vectorEffect="non-scaling-stroke" />}
              {overlay.bollinger&&(['upper','middle','lower'] as const).map(key=><path key={key} d={path(p=>p.bb?.[key]??null)} fill="none" stroke="var(--blue)" opacity=".65" vectorEffect="non-scaling-stroke" />)}
              {guides.filter((g) => g.v >= lo && g.v <= hi).map((g) => <line key={g.key} x1={PAD} x2={W - PAD} y1={y(g.v)} y2={y(g.v)} stroke={g.tone} strokeDasharray="4 5" opacity="0.7" vectorEffect="non-scaling-stroke" />)}
              {latest && !replayGap && <line x1={PAD} x2={W - PAD} y1={y(latest.close)} y2={y(latest.close)} stroke="var(--txt)" opacity="0.45" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />}
              {selected !== null && <g>
                <line x1={PAD + (selected + 0.5) * cw} x2={PAD + (selected + 0.5) * cw} y1={PAD} y2={H - PAD} stroke="var(--mut)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                {active && <circle cx={x(active.ts) + cw / 2} cy={y(active.close)} r="3" fill="var(--amber)" />}
                {crossY!==null&&<line x1={PAD} x2={W-PAD} y1={crossY} y2={crossY} stroke="var(--mut)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
              </g>}
            </svg>
            <div className="market-price-scale" aria-label="Price scale in USD">
              {[0, 0.25, 0.5, 0.75, 1].map((t) => <span key={t}>{n ? fmtUsd(priceAt(1-t)) : '—'}</span>)}
              <span className="market-volume-label">VOL · BTC</span>
            </div>
          </div>
          <div className="chart-dates"><span>{dateLabel(timeStart)}</span><span>UTC · proportional elapsed time</span><span>{dateLabel(timeEnd)}</span></div>
        </> : <div className="market-chart-empty">Price history is unavailable for this window.</div>}
        <div className="market-chart-legend"><span>Hover / ← → inspect · drag pan · wheel zoom {crossY!==null&&selected!==null?`· crosshair ${fmtUsd(priceAt((PRICE_BOTTOM-crossY)/(PRICE_BOTTOM-PAD)))}`:''}</span><div>{guides.map((g) => <span key={g.key} style={{ color: g.tone }}>{g.key}</span>)}{guides.length > 0 && levels?.isMock && <span>DEMO LEVELS</span>}<span>{replay ? 'REPLAY CLOSE' : 'LATEST CLOSE'}</span></div></div>
        {gaps.length > 0 && <div className="market-chart-legend"><span style={{ color: 'var(--amber)' }}>UNKNOWN gap</span><span style={{ color: 'var(--blue)' }}>INFERRED_NO_TRADE gap · OHLC remains missing</span></div>}
        {event&&<p className="research-chart-note">{showEvent?'Purple marker: story publication time.':'Story publication time is outside the loaded chart window.'} Candle interval: {latest?.interval??'unavailable'}. Publication time does not establish price causation.</p>}
      </div>
      <SourceFootnote env={ohlcv} />
    </Panel></div>
  );
  return expanded?createPortal(chart,document.body):chart;
}
