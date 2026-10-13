'use client';
import {useMemo,useState} from 'react';
import {Panel,PanelHeader} from '@/components/primitives';
import type {MarketSnapshot} from '@/lib/marketSnapshot';
import type {ArchivePage} from '@/lib/sources/marketArchive';
import type {ReplayGap} from '@/lib/features/ohlcv/replay';
import {INTERVAL_MS} from '@/lib/features/ohlcv/replay';
import type {OhlcvCandle} from '@/lib/features/ohlcv/types';
import {confirmedSwings,priceStructure,comparePeriods} from '@/lib/marketStudies';
import {TradeVolumeProfile} from './TradeVolumeProfile';
import {fmtUsd,fmtPct} from '@/lib/format';
const stamp=(ts:number|undefined)=>ts===undefined?'—':new Date(ts).toISOString();
export function MarketCoverage({snapshot,archive,gaps}:{snapshot:MarketSnapshot;archive:ArchivePage|null;gaps:ReplayGap[]}) {
  const bars=snapshot.ohlcv.data,interval=bars[0]?.interval??archive?.archive.interval??snapshot.interval;
  return <Panel><PanelHeader title="ARCHIVE / COVERAGE INSPECTOR" note={snapshot.integrity} />
    <div className="market-research-body"><dl className="market-coverage-grid">
      <div><dt>Eligible loaded candles</dt><dd>{bars.length}</dd></div><div><dt>Resolution</dt><dd>{interval??'unavailable'}</dd></div>
      <div><dt>First candle start / last completed end</dt><dd>{stamp(bars[0]?.ts)} → {stamp(bars.at(-1)?bars.at(-1)!.ts+INTERVAL_MS[interval!]:undefined)}</dd></div>
      <div><dt>Archive total at frozen observation cutoff</dt><dd>{archive?archive.archive.availableCandles:'Current window only'}</dd></div>
      {archive&&<div><dt>Full saved archive bounds</dt><dd>{archive.archive.availableStart??'—'} → {archive.archive.availableEndExclusive??'—'} · {archive.nextCursor?'More pages available':'End of scanned range'}</dd></div>}
      {archive&&<div><dt>Archive observation watermark (loaded vintage)</dt><dd>{archive.archive.snapshotAt}</dd></div>}
      <div><dt>Revealed gaps</dt><dd>{gaps.length} spans · {gaps.reduce((n,g)=>n+(g.end-g.start)/60000,0)} minutes</dd></div>
      <div><dt>Content version</dt><dd>{snapshot.version}</dd></div>
      {snapshot.strict&&<div><dt>Versions excluded by observation cutoff</dt><dd>{snapshot.rejected}</dd></div>}
      {process.env.NODE_ENV==='development'&&<div><dt>Source</dt><dd>{archive?.archive.venue??snapshot.ohlcv.sourceKey}</dd></div>}
    </dl><p>Loaded integrity validates OHLCV values, ordering and native resolution. Fingerprints identify payloads; they are not cryptographic certificates. Archive revision hashes are retained, not recomputed here. Loaded coverage is separate from full archive bounds.</p>
    {gaps.length>0&&<details><summary>Inspect revealed gap spans</summary><ul>{gaps.map(g=><li key={`${g.start}-${g.end}`}>{g.status} · {stamp(g.start)} → {stamp(g.end)}</li>)}</ul></details>}
    </div></Panel>;
}
export function MarketStudiesPanel({candles,cutoff,strict,source,profileStart}:{candles:OhlcvCandle[];cutoff:number;strict:boolean;source:string;profileStart:number|null}) {
  const [period,setPeriod]=useState(20);
  const swings=useMemo(()=>confirmedSwings(candles),[candles]);
  const comparison=comparePeriods(candles,period);
  const segment=Math.max(0,candles.findLastIndex((c,i)=>i>0&&c.ts-candles[i-1].ts!==INTERVAL_MS[c.interval]));
  return <Panel><PanelHeader title="ADVANCED MARKET STUDIES" note="RESEARCH ONLY" /><div className="market-research-body">
    <strong>{priceStructure(swings.filter(s=>s.ts>=(candles[segment]?.ts??Infinity)))}</strong><p>Swing method: strict extrema with two candles on either side. The latest two candles cannot be confirmed pivots. Confirmation stops across gaps; structure uses the latest continuous segment.</p>
    <details><summary>{swings.length} confirmed swings</summary><ul>{swings.slice(-20).map(s=><li key={`${s.ts}-${s.kind}`}>{s.kind} {fmtUsd(s.price)} · pivot {stamp(s.ts)} · confirmed {stamp(s.confirmedAt)}</li>)}</ul></details>
    <TradeVolumeProfile start={profileStart} cutoff={cutoff} strict={strict} source={source} />
    <h3>Historical period comparison</h3><label>Bars per period <select aria-label="Comparison bars per period" value={period} onChange={e=>setPeriod(Number(e.target.value))}>{[5,20,50,100].map(n=><option key={n}>{n}</option>)}</select></label>
    {comparison?<table><thead><tr><th>Period</th><th>Range UTC</th><th>Return</th><th>Volume BTC</th><th>Coverage</th></tr></thead><tbody>{comparison.map((p,i)=><tr key={p.start}><td>{i?'Recent':'Previous'}</td><td>{stamp(p.start)} → {stamp(p.end)}</td><td>{fmtPct(p.returnPct)}</td><td>{p.volume.toFixed(2)}</td><td>{p.complete?'Continuous':'GAPS · not equal elapsed coverage'}</td></tr>)}</tbody></table>:<p>Needs {period*2} eligible candles. Both periods end at or before the snapshot cutoff.</p>}
  </div></Panel>;
}
