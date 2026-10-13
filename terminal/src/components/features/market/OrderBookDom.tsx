'use client';
import {useEffect,useRef,useState} from 'react';
import {Panel,PanelHeader} from '@/components/primitives';
import {useLiveMarket} from '@/components/shell/LiveMarketContext';
import {buildDom,DOM_GROUPS,type DomRow} from '@/lib/dom';
import {fmtUsd} from '@/lib/format';
export function OrderBookDom({enabled}:{enabled:boolean}) {
  const {snapshot,transport}=useLiveMarket();
  const [group,setGroup]=useState('1'),[count,setCount]=useState(10);
  const [follow,setFollow]=useState(true);
  const viewport=useRef<HTMLDivElement>(null),spread=useRef<HTMLTableRowElement>(null);
  const book=enabled?snapshot?.orderBook:undefined;
  const state=!enabled?'ISOLATED':transport!=='CONNECTED'?transport:book?.state??'WAITING_SNAPSHOT';
  const dom=book&&state==='LIVE'?buildDom(book,group,count,snapshot?.trades):null;
  const max=Math.max(.00000001,...(dom?[...dom.bids,...dom.asks]:[]).map(r=>Number(r.size)));
  const askRows=dom?.asks.length??0;
  useEffect(()=>{
    const host=viewport.current,row=spread.current;
    if(follow&&host&&row)host.scrollTop+=row.getBoundingClientRect().top-host.getBoundingClientRect().top-host.clientHeight/2+row.clientHeight/2;
  },[follow,count,group,askRows]);
  const row=(r:DomRow)=><tr key={`${r.side}-${r.price}`} className={`dom-${r.side}`}><td>{r.side.toUpperCase()}</td><td className="dom-quantity">{r.side==='bid'&&<><span className="dom-bar" style={{width:`${Number(r.size)/max*100}%`}} /><span>{r.size}</span></>}</td><th scope="row">{fmtUsd(Number(r.price))}</th><td className="dom-quantity">{r.side==='ask'&&<><span className="dom-bar" style={{width:`${Number(r.size)/max*100}%`}} /><span>{r.size}</span></>}</td><td>{r.cumulative}</td><td>{r.recent==='0.00000000'?'—':r.recent}</td></tr>;
  return <section aria-label="Live order book and DOM"><Panel className="market-dom-panel"><PanelHeader title="ORDER BOOK / DOM" note={process.env.NODE_ENV==='development'?'BTC-USD · Coinbase L2 batch':'BTC-USD · LIVE DEPTH'} right={<span className="dom-state" role="status">{state}</span>} />
    <div className="market-dom-body">
      {!enabled?<p role="status">Live depth is isolated during replay, archive inspection and other chart venues. No historical order book is inferred from candles or trades. The header quote continues independently.</p>:<>
        <div className="market-chart-tools"><label>Price grouping USD <select aria-label="DOM price grouping" value={group} onChange={e=>setGroup(e.target.value)}>{DOM_GROUPS.map(g=><option key={g} value={g}>{g}</option>)}</select></label><label>Levels per side <select aria-label="DOM levels per side" value={count} onChange={e=>setCount(Number(e.target.value))}>{[10,20,40].map(n=><option key={n} value={n}>{n}</option>)}</select></label><label><input aria-label="DOM follow spread" type="checkbox" checked={follow} onChange={e=>setFollow(e.target.checked)} /> Follow spread</label></div>
        {state!=='LIVE'&&<p role="status">{book?.reason??'Awaiting a fresh depth snapshot from the collector.'} Depth is hidden until a synchronized snapshot and fresh heartbeat are available.</p>}
        {dom&&<><dl className="market-coverage-grid"><div><dt>Best bid / ask</dt><dd>{fmtUsd(Number(dom.bid))} / {fmtUsd(Number(dom.ask))}</dd></div><div><dt>Spread USD</dt><dd>{dom.spread}</dd></div><div><dt>Displayed bid / ask BTC</dt><dd>{dom.bidTotal} / {dom.askTotal}</dd></div><div><dt>Displayed-depth bid share</dt><dd>{dom.bidShare?.toFixed(2)}%</dd></div></dl>
          <div ref={viewport} className="market-dom-scroll"><table className="market-dom-ladder" aria-label="BTC-USD depth ladder"><thead><tr><th>Side</th><th>Bid BTC</th><th>Price USD</th><th>Ask BTC</th><th>Cumulative BTC</th><th>Recent matched BTC</th></tr></thead><tbody>{[...dom.asks].reverse().map(row)}<tr ref={spread} className="dom-spread"><td colSpan={6}>SPREAD {dom.spread} USD · best bid {fmtUsd(Number(dom.bid))} / best ask {fmtUsd(Number(dom.ask))}</td></tr>{dom.bids.map(row)}</tbody></table></div>
          <p>Depth is resting quantity, not executed volume. Grouped totals use the nearest {book!.bids.length} bid / {book!.asks.length} ask levels captured for display, out of {book!.totalBidLevels} / {book!.totalAskLevels} levels maintained by the collector. Cumulative size and bid share describe displayed rows only.</p>
          <p>Recent matched size uses the latest {snapshot?.trades.length??0} captured trades and their maker side; it is not an interval footprint or a pressure signal. Grouped quantities retain eight-decimal BTC precision.</p>
          <p className="iris-micro">Snapshot {book!.snapshotAt?new Date(book!.snapshotAt).toISOString():'—'} · last observed depth {book!.observedAt?new Date(book!.observedAt).toISOString():'—'} · exchange event {book!.eventTime??'snapshot only'} · coalesced display updates every second.</p>
        </>}
      </>}
    </div></Panel></section>;
}
