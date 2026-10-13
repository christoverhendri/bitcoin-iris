'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Envelope } from '@/lib/envelope';
import type { SupportResistanceLevels } from '@/lib/features/levels/types';
import { completedReplayCandles, replayEntrySnapshot, replayTimeline, replayDelay,seekReplayIndex } from '@/lib/features/ohlcv/replay';
import { PriceChartLarge } from './PriceChartLarge';
import { LevelsLadder } from './LevelsLadder';
import type { ArchivePage } from '@/lib/sources/marketArchive';
import { buildMarketSnapshot, marketVersion, validCandle,availabilityGaps, type MarketSnapshot, type MarketEvent } from '@/lib/marketSnapshot';
import { TechReadout } from '../overview/TechReadout';
import { MarketCoverage, MarketStudiesPanel } from './MarketResearchPanels';
import {LiveCoinbasePanel} from './LiveCoinbasePanel';
import {liveEligible} from '@/lib/liveTrades';
import {useLiveMarket} from '@/components/shell/LiveMarketContext';
import {applyLiveMarket} from '@/lib/liveMarket';
import {INTERVAL_MS} from '@/lib/features/ohlcv/replay';
import {OrderBookDom} from './OrderBookDom';

export function MarketReplay({ initial, timeframe,events=[] }: {
  initial: MarketSnapshot;
  timeframe: string;
  events?:MarketEvent[];
}) {
  const {ohlcv,cutoff}=initial;
  const [replaying, setReplaying] = useState(false);
  const [replayBase,setReplayBase]=useState<MarketSnapshot|null>(null);
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [strict,setStrict]=useState(false);
  const [seekDate,setSeekDate]=useState('');
  const [seekError,setSeekError]=useState('');
  const [archiveInterval, setArchiveInterval] = useState<'1m' | '1h'>('1h');
  const [archive, setArchive] = useState<ArchivePage | null>(null);
  const [loadingArchive, setLoadingArchive] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const {snapshot:liveSnapshot,transport,configure}=useLiveMarket();
  const enabled=liveEligible(replaying,!!archive,ohlcv.sourceKey,!!(ohlcv.isMock||ohlcv.unavailable));
  const liveFrom=ohlcv.data.at(-1)?ohlcv.data.at(-1)!.ts+INTERVAL_MS[ohlcv.data.at(-1)!.interval]:null;
  useEffect(()=>{configure(enabled&&initial.interval&&liveFrom!==null?{interval:initial.interval,from:liveFrom,book:true}:null);return ()=>configure(null);},[configure,enabled,initial.interval,liveFrom]);
  const applied=applyLiveMarket(initial,liveSnapshot,enabled);
  const abortRef = useRef<AbortController | null>(null);
  const playback=useRef<{key:string;remaining:number}|null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const activeOhlcv = archive ?? (replaying&&replayBase?replayBase.ohlcv:ohlcv);
  const activeCutoff=archive?Date.parse(archive.archive.snapshotAt):replaying&&replayBase?replayBase.cutoff:cutoff;
  const replayCandles = useMemo(() => activeOhlcv.unavailable ? [] : completedReplayCandles(activeOhlcv.data, activeCutoff), [activeOhlcv, activeCutoff]);
  const timeline = useMemo(() => replayTimeline(replayCandles, archive?.gaps), [replayCandles, archive]);
  const total = timeline.length;
  const position = timeline[cursor];
  const interval = archive?.archive.interval ?? replayCandles[0]?.interval ?? '1h';
  const isPlaying = replaying && playing && cursor < total - 1;

  useEffect(() => {
    if (!isPlaying) return;
    const key=`${cursor}:${timeline[cursor].start}:${timeline[cursor].end}`;
    if(playback.current?.key!==key)playback.current={key,remaining:replayDelay(timeline[cursor],interval,1)};
    const progress=playback.current;let started=performance.now(),timer:number;
    const elapsed=()=>{const now=performance.now();progress.remaining=Math.max(0,progress.remaining-(now-started)*speed);started=now;};
    const schedule=()=>{timer=window.setTimeout(()=>{elapsed();if(progress.remaining>1)schedule();else setCursor(i=>Math.min(i+1,total-1));},Math.min(60000,progress.remaining/speed));};
    schedule();
    return () => {window.clearTimeout(timer);elapsed();};
  }, [isPlaying, speed, total, cursor, timeline, interval]);

  const snapshot = replaying ? replayEntrySnapshot(timeline, cursor)
    : archive ? replayEntrySnapshot(timeline, total - 1) : null;
  const revealedGaps=snapshot?.gaps??timeline.flatMap(e=>e.gap?[e.gap]:[]);
  const archiveGap = replaying ? snapshot?.entry?.gap : undefined;
  // Preserve the loaded source timestamp: replay is retrospective reconstruction.
  const version=useMemo(()=>marketVersion(activeOhlcv),[activeOhlcv]);
  const market=enabled?applied.market:buildMarketSnapshot(snapshot?{...activeOhlcv,data:snapshot.candles}:activeOhlcv,replaying?position?.end??activeCutoff:activeCutoff,{version,strict:replaying&&strict});
  const shownGaps=enabled?availabilityGaps(market.ohlcv.data,ohlcv.data[0]?.ts??market.cutoff,Math.floor(market.cutoff/INTERVAL_MS[interval])*INTERVAL_MS[interval],interval):market.strict?availabilityGaps(market.ohlcv.data,timeline[0]?.start??market.cutoff,market.cutoff,interval):revealedGaps;
  const gap=market.strict?shownGaps.find(g=>position&&position.start>=g.start&&position.start<g.end):archiveGap;
  const shownOhlcv=enabled?applied.display:market.ohlcv;
  const shownLevels: Envelope<SupportResistanceLevels> = gap?{...market.levels,unavailable:true,data:{r1:NaN,r2:NaN,s1:NaN,s2:NaN,vwap:NaN}}:market.levels;
  const seek = (index: number) => { setPlaying(false); setCursor(index);playback.current=null; };
  const loadArchive = async (append = false) => {
    setPlaying(false); setLoadingArchive(true); setArchiveError(null);
    abortRef.current?.abort();
    const controller = new AbortController(); abortRef.current = controller;
    const interval = append && archive ? archive.archive.interval : archiveInterval;
    const params = new URLSearchParams({ interval, limit: '500' });
    if (append && archive?.nextCursor) params.set('cursor', archive.nextCursor);
    try {
      const response = await fetch(`/api/market/history?${params}`, { signal: controller.signal, cache: 'no-store' });
      const page = await response.json();
      if (!response.ok || page.unavailable) throw new Error(page.error || 'Local archive is unavailable');
      if (!Array.isArray(page.data) || page.isMock || page.sourceKey !== 'coinbase' || page.archive?.interval !== interval) throw new Error('Invalid archive response');
      if(page.data.some((c:Parameters<typeof validCandle>[0])=>!validCandle(c)||c.interval!==interval))throw new Error('Archive contains invalid candles');
      if(append&&archive&&page.archive.snapshotAt!==archive.archive.snapshotAt)throw new Error('Archive observation cutoff changed between pages');
      if (!page.data.length && !page.gaps?.length && !append) throw new Error('No completed candles are saved in this local archive yet.');
      const previous = append && archive ? archive.data : [];
      if (previous.length && page.data.length && page.data[0].ts <= previous[previous.length - 1].ts) throw new Error('Archive pages overlap');
      const combined = [...previous, ...page.data];
      if (combined.length > 5000) throw new Error('Replay is limited to 5,000 loaded archive candles.');
      setArchive({ ...page, data: combined, gaps: [...(append ? archive?.gaps ?? [] : []), ...(page.gaps ?? [])], coverage: {
        expectedCandles: (append ? archive?.coverage.expectedCandles ?? 0 : 0) + page.coverage.expectedCandles,
        observedCandles: combined.length,
        missingCandles: (append ? archive?.coverage.missingCandles ?? 0 : 0) + page.coverage.missingCandles,
      } });
      if (!append) setCursor(0);
      setReplaying(true);
    } catch (error) {
      if (!controller.signal.aborted) setArchiveError(error instanceof Error ? error.message : 'Archive request failed');
    } finally { if (!controller.signal.aborted) setLoadingArchive(false); }
  };

  return (
    <div className="market-replay-workspace">
      <section className="market-replay-controls" aria-label="Historical candle replay">
        <div className="market-replay-toolbar market-archive-toolbar">
          <label>Local archive <select aria-label="Archive interval" value={archiveInterval} disabled={loadingArchive} onChange={(event) => setArchiveInterval(event.target.value as '1m' | '1h')}>
            <option value="1h">1-hour candles</option><option value="1m">1-minute candles</option>
          </select></label>
          <button disabled={loadingArchive} onClick={() => void loadArchive()}>{loadingArchive ? 'Loading archive…' : 'Load local archive'}</button>
          {archive && <>
            <button disabled={loadingArchive || !archive.nextCursor || archive.data.length >= 5000} onClick={() => void loadArchive(true)}>Load next page</button>
            <button disabled={loadingArchive} onClick={() => { setArchive(null); setArchiveError(null); setCursor(0); setPlaying(false); setReplaying(false); }}>Use current window</button>
            <span className="market-replay-status">{process.env.NODE_ENV === 'development' ? 'COINBASE ARCHIVE' : 'ARCHIVE'} · {archive.data.length} loaded · {archive.coverage.missingCandles} missing in scanned range</span>
          </>}
        </div>
        {archiveError && <p role="alert" className="market-archive-error">{archiveError}</p>}
        <div className="market-replay-toolbar">
          <span className="market-replay-label">{replaying ? 'BAR REPLAY' : 'HISTORICAL REPLAY'}</span>
          {!replaying ? <button disabled={total < 2 || loadingArchive} onClick={() => { setReplayBase(applied.market);setCursor(0); setPlaying(false); setReplaying(true); }}>Start replay</button> : <>
            <button disabled={cursor === 0 || loadingArchive} onClick={() => seek(Math.max(0, cursor - 1))} aria-label="Previous replay step">← Back</button>
            <button disabled={loadingArchive} onClick={() => {
              if (isPlaying) setPlaying(false);
              else { if (cursor >= total - 1) setCursor(0); setPlaying(true); }
            }}>{isPlaying ? 'Pause' : cursor >= total - 1 ? 'Replay again' : 'Play'}</button>
            <button disabled={cursor >= total - 1 || loadingArchive} onClick={() => seek(Math.min(total - 1, cursor + 1))} aria-label="Next replay step">Next →</button>
            <label>Speed <select aria-label="Replay speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
              {[0.5, 1, 2, 4, 8].map((s) => <option value={s} key={s}>{s}×</option>)}
            </select></label>
            <button disabled={loadingArchive} onClick={() => seek(0)}>Reset</button>
            <button disabled={loadingArchive} onClick={() => { setPlaying(false); setReplaying(false); }}>Exit replay</button>
          </>}
          <span className="market-replay-status" role="status">{replaying ? `${cursor + 1} / ${total} steps · ${gap?.status ?? 'OBSERVED'} · ${isPlaying ? 'PLAYING' : cursor >= total - 1 ? 'COMPLETE' : 'PAUSED'}` : `${replayCandles.length} completed candles available`}</span>
        </div>
        {replaying && <div className="market-replay-timeline">
          <label htmlFor="market-replay-cursor">Replay time · {position ? new Date(position.start).toISOString().slice(0, 16).replace('T', ' ') : '—'} UTC · Elapsed {position && timeline[0] ? ((position.start - timeline[0].start) / 60_000).toLocaleString() : 0} min</label>
          <input id="market-replay-cursor" type="range" disabled={loadingArchive} min={0} max={Math.max(0, total - 1)} value={cursor} onChange={(event) => seek(Number(event.target.value))} />
          <span>1× plays one {interval} interval per second. Gap spans retain their full duration; Next skips the span. Future bars are hidden.</span>
          <form className="market-replay-seek" onSubmit={e=>{e.preventDefault();const ts=Date.parse(`${seekDate}Z`);const index=seekReplayIndex(timeline,ts);if(!Number.isFinite(ts)||index<0||ts>activeCutoff){setSeekError('Choose a UTC time after the first completed candle and before the snapshot cutoff.');return;}setSeekError('');seek(index);}}>
            <label>Seek UTC <input aria-label="Seek replay UTC date" type="datetime-local" value={seekDate} onChange={e=>setSeekDate(e.target.value)} onInput={e=>setSeekDate(e.currentTarget.value)} required /></label><button disabled={loadingArchive}>Seek date</button>
          </form>
          <span>Date seek snaps to the last fully completed candle or gap span at/before the chosen UTC time, never ahead of it.</span>
          {seekError&&<span role="alert">{seekError}</span>}
          <label><input type="checkbox" checked={strict} onChange={e=>{setPlaying(false);setStrict(e.target.checked);}} /> Strict availability: require a recorded observation timestamp no later than replay cutoff</label>
          {strict&&<span role="status">{market.rejected} revealed versions excluded. Missing historical versions remain unavailable; reconstruction is not a point-in-time backtest.</span>}
        </div>}
      </section>
      <LiveCoinbasePanel key={`${replaying}:${!!archive}`} enabled={liveEligible(replaying,!!archive,ohlcv.sourceKey,!!(ohlcv.isMock||ohlcv.unavailable))} />
      <div className="market-snapshot-meta">Snapshot {market.version} · cutoff {new Date(market.cutoff).toISOString()} · {strict&&replaying?'STRICT OBSERVATION ELIGIBILITY':'RETROSPECTIVE RECONSTRUCTION'} · integrity {market.integrity}</div>
      {enabled&&<p role="status">Chart stream {transport==='CONNECTED'?liveSnapshot?.state??'CONNECTING':transport} · {applied.forming?`forming ${initial.interval} candle${applied.partial?' · PARTIAL captured coverage':''}`:'awaiting captured interval'} · Indicators and pivots use completed bars at this cutoff; forming chart overlays are provisional. {liveSnapshot?.chart?.error}</p>}
      {replaying && <p className="market-replay-disclosure">REPLAY · Only revealed candles determine price and levels. Replay covers {archive ? 'loaded local archive pages' : 'the loaded timeframe window'}; the header ticker remains current. Historical data is reconstructed from the source available today.</p>}
      {replaying && shownGaps.length ? <div className="market-replay-disclosure" role="status">
        {gap ? `${gap.status} · ${new Date(gap.start).toISOString()} → ${new Date(gap.end).toISOString()} · ${(gap.end - gap.start) / 60_000} min · OHLC unavailable. ` : ''}
        Revealed gaps: {shownGaps.filter((g) => g.status === 'UNKNOWN').reduce((n, g) => n + (g.end - g.start) / 60_000, 0)} min UNKNOWN · {shownGaps.filter((g) => g.status === 'INFERRED_NO_TRADE').reduce((n, g) => n + (g.end - g.start) / 60_000, 0)} min INFERRED_NO_TRADE. Inference is not trade-ledger proof.
      </div> : null}
      <div className="market-price-workspace">
        <PriceChartLarge key={`${archive ? 'archive' : 'window'}-${replaying ? 'replay' : 'current'}`} ohlcv={shownOhlcv} levels={shownLevels} timeframe={archive ? 'ARCHIVE' : timeframe} replay={replaying} gaps={shownGaps} replayGap={gap} replayInterval={interval} events={events} eventCutoff={market.cutoff} liveForming={enabled&&applied.forming} partial={enabled&&applied.partial} />
        <LevelsLadder levels={shownLevels} price={gap?0:shownOhlcv.data.at(-1)?.close??0} replay={replaying} reference={market.reference} />
      </div>
      <TechReadout indicators={gap?{...market.indicators,unavailable:true}:market.indicators} timeframe={`${interval} · ${market.ohlcv.data.length} eligible bars`} />
      <OrderBookDom enabled={enabled} />
      <MarketCoverage snapshot={market} archive={archive} gaps={shownGaps} />
      <MarketStudiesPanel candles={gap?[]:market.ohlcv.data} cutoff={market.cutoff} strict={market.strict} source={activeOhlcv.isMock||activeOhlcv.unavailable?'unavailable':activeOhlcv.sourceKey} profileStart={timeline[0]?.start??null} />
    </div>
  );
}
