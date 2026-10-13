'use client';
import {useLiveMarket} from '@/components/shell/LiveMarketContext';
import {fmtUsd} from '@/lib/format';
import {TradeVolumeProfile} from './TradeVolumeProfile';
export function LiveCoinbasePanel({enabled}:{enabled:boolean}) {
  const {snapshot,transport}=useLiveMarket();
  if(!enabled)return <section className="market-replay-controls" aria-label="Live execution stream isolated"><h3>Live execution stream isolated</h3><p>Live chart aggregation and profile updates are disconnected during replay, archive inspection, and other chart venues. Historical charts, indicators and profiles retain their selected cutoff. The header quote remains live and separate from replay.</p></section>;
  const state=transport==='CONNECTED'?snapshot?.state??'CONNECTING':transport;
  const fresh=transport==='CONNECTED'&&snapshot?.state==='LIVE';
  const collecting=transport==='CONNECTED'&&snapshot?.heartbeatAt!==null&&['LIVE','GAP','RECOVERING'].includes(snapshot?.state??'');
  return <section className="market-replay-controls market-live-panel" aria-label="Live execution workspace"><h3>{process.env.NODE_ENV==='development'?'Coinbase · ':''}Live executions <span role="status">{state}</span></h3>
    <p>Shared live chart stream · current minute is forming and reflects captured executions only.</p>
    {snapshot?.error&&<p role="status">{snapshot.error}</p>}
    <dl className="market-coverage-grid"><div><dt>Last execution {fresh?'':'· last captured'}</dt><dd>{snapshot?.latest?fmtUsd(Number(snapshot.latest.price)):'—'}</dd></div><div><dt>Execution time UTC</dt><dd>{snapshot?.latest?.time??'—'}</dd></div><div><dt>Heartbeat UTC</dt><dd>{snapshot?.heartbeatAt?new Date(snapshot.heartbeatAt).toISOString():'—'}</dd></div></dl>
    {snapshot?.candle&&<><h4>Forming 1-minute candle · {snapshot.candle.start}</h4><dl className="market-coverage-grid">{(['open','high','low','close'] as const).map(k=><div key={k}><dt>{k}</dt><dd>{fmtUsd(Number(snapshot.candle![k]))}</dd></div>)}<div><dt>Captured volume</dt><dd>{snapshot.candle.volume} BTC · {snapshot.candle.count} trades</dd></div></dl></>}
    <details><summary>Time &amp; sales · latest 20 captured executions</summary><table><thead><tr><th>UTC</th><th>Price</th><th>BTC</th><th>Maker side</th></tr></thead><tbody>{snapshot?.trades.map(t=><tr key={t.id}><td>{t.time.slice(11)}</td><td>{fmtUsd(Number(t.price))}</td><td>{t.size}</td><td>{t.side}</td></tr>)}</tbody></table></details>
    {snapshot&&<TradeVolumeProfile start={snapshot.updatedAt-15*60000} cutoff={snapshot.updatedAt} strict={false} source="coinbase" live={collecting} />}
  </section>;
}
