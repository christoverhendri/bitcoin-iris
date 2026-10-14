import type {MarketSnapshot} from './marketSnapshot';
import {buildMarketSnapshot,validCandle} from './marketSnapshot';
import type {LiveTradeSnapshot} from './liveTrades';
import {INTERVAL_MS} from './features/ohlcv/replay';
/** Replace by bar timestamp, never add snapshot volume to a previously applied bar. */
export function applyLiveMarket(initial:MarketSnapshot,live:LiveTradeSnapshot|null,enabled:boolean) {
  const chart=live?.chart;
  if(initial.ohlcv.marketDataset?.basis==='minute-derived'||!enabled||!chart||chart.error||initial.ohlcv.isMock||initial.ohlcv.sourceKey!=='coinbase'||chart.interval!==initial.interval||chart.cutoff<initial.cutoff)return {market:initial,display:initial.ohlcv,forming:false,partial:false};
  const base=initial.ohlcv.data.filter(c=>c.ts+INTERVAL_MS[c.interval]<=initial.cutoff);
  const tail=chart.candles.filter(c=>validCandle(c)&&c.ts>=chart.from&&c.ts+INTERVAL_MS[c.interval]>initial.cutoff);
  const completed=tail.filter(c=>!c.forming&&c.complete);
  const merged=[...base,...completed].sort((a,b)=>a.ts-b.ts);
  const forming=tail.find(c=>c.forming);
  const env={...initial.ohlcv,data:forming?[...merged,forming]:merged,asOf:new Date(chart.cutoff).toISOString(),unavailable:!merged.length&&!forming};
  // The payload fingerprint includes the forming version; derived values still
  // pass through the shared completed-bar cutoff in buildMarketSnapshot.
  const market=buildMarketSnapshot(env,chart.cutoff);
  const display={...market.ohlcv,data:forming?[...market.ohlcv.data,forming]:market.ohlcv.data,unavailable:!market.ohlcv.data.length&&!forming};
  return {market,display,forming:!!forming,partial:!!forming&&!forming.complete};
}
