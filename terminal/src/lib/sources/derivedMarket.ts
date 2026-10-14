import { DatabaseSync } from 'node:sqlite';
import { lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { live } from '@/lib/envelope';
import { INTERVAL_MS } from '@/lib/features/ohlcv/replay';
import { validCandle } from '@/lib/marketSnapshot';
import type { OhlcvArgs, OhlcvCandle } from '@/lib/features/ohlcv/types';

/** Aggregate one immutable minute-derived snapshot. Incomplete parent buckets never fill gaps. */
export function readDerivedMarket(args: OhlcvArgs, directory = process.env.IRIS_MARKET_ARCHIVE_DIR || resolve(process.cwd(), '..', 'artifacts', 'market'), now = Date.now()) {
  const interval = args.interval ?? '1h', limit = args.limit ?? 100;
  const step = INTERVAL_MS[interval];
  if (args.symbol && args.symbol !== 'BTC-USD' || !step || !Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid derived market request');
  const derived = resolve(directory, 'coinbase_hourly_from_minutes.sqlite');
  const stat = lstatSync(derived);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Invalid derived archive');
  const db = new DatabaseSync(derived, { readOnly: true, allowExtension: false });
  try {
    db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000; BEGIN');
    const id = Object.fromEntries(db.prepare('SELECT key,value FROM store_identity').all().map(r => [r.key,r.value]));
    if (id.source!=='coinbase-exchange'||id.instrument!=='BTC/USD'||id.granularity_seconds!=='3600'||id.dataset_kind !== 'minute_derived_hourly' || !/^[a-f\d]{64}$/.test(String(id.dataset_version))) throw new Error('Invalid derived snapshot');
    const dataEnd = Number(id.range_end_exclusive) * 1000;
    const cutoff = Math.min(now, dataEnd);
    if (!Number.isSafeInteger(dataEnd) || dataEnd <= 0) throw new Error('Invalid snapshot cutoff');
    const offset = interval === '1w' ? 4 * 86400000 : 0; // Monday UTC, relative to the Unix epoch.
    const bucket = (ts: number) => Math.floor((ts-offset)/step)*step+offset;
    const end = bucket(cutoff), start = end - limit * step;
    const rows = db.prepare('SELECT ts,low,high,open,close,volume,observed_at,payload_sha256 FROM hourly_candles WHERE ts>=? AND ts<? ORDER BY ts').all(start/1000,end/1000);
    const parent = rows.map(r => ({ symbol:'BTC-USD', interval:'1h', ts:Number(r.ts)*1000, low:Number(r.low),high:Number(r.high),open:Number(r.open),close:Number(r.close),volume:Number(r.volume),observedAt:String(r.observed_at),revisionHash:String(r.payload_sha256) }));
    if (parent.some(c => !validCandle(c))) throw new Error('Invalid derived candle values');
    const data: OhlcvCandle[] = [];
    if (step >= 3600000) {
      const groups = new Map<number, typeof parent>();
      for (const c of parent) { const t=bucket(c.ts); const group=groups.get(t)??[]; group.push(c);groups.set(t,group); }
      for (const [ts,candles] of groups) {
        if (candles.length !== step/3600000 || candles.some((c,i)=>c.ts!==ts+i*3600000)) continue;
        data.push({symbol:'BTC-USD',interval,ts,low:Math.min(...candles.map(c=>c.low)),high:Math.max(...candles.map(c=>c.high)),open:candles[0].open,close:candles.at(-1)!.close,volume:candles.reduce((s,c)=>s+c.volume,0),
          ...{observedAt:String(id.derived_at),revisionHash:String(id.dataset_version)} });
      }
    } else {
      // Sub-hour bars require the frozen minute vintage, not retimed hourly candles.
      const minuteFile = resolve(directory,'coinbase_minute.sqlite');
      const minuteStat=lstatSync(minuteFile); if(!minuteStat.isFile()||minuteStat.isSymbolicLink())throw new Error('Invalid minute archive');
      const minutes=new DatabaseSync(minuteFile,{readOnly:true,allowExtension:false});
      try {
        minutes.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000; BEGIN');
        const minuteId=Object.fromEntries(minutes.prepare('SELECT key,value FROM store_identity').all().map(r=>[r.key,r.value]));
        if(minuteId.source!=='coinbase-exchange'||minuteId.instrument!=='BTC/USD'||minuteId.granularity_seconds!=='60')throw new Error('Incompatible minute identity');
        const native=minutes.prepare(`SELECT m.ts,m.low,m.high,m.open,m.close,m.volume FROM minute_candles m JOIN minute_seen s ON s.ts=m.ts AND s.content_sha256=m.content_sha256
          WHERE m.ts>=? AND m.ts<? AND s.seen_at<=? AND NOT EXISTS(SELECT 1 FROM minute_seen n WHERE n.ts=s.ts AND n.seen_at<=? AND (n.seen_at>s.seen_at OR (n.seen_at=s.seen_at AND n.content_sha256>s.content_sha256))) ORDER BY m.ts`).all(start/1000,end/1000,String(id.minute_as_of),String(id.minute_as_of));
        const groups=new Map<number,typeof native>();
        for(const r of native){const t=bucket(Number(r.ts)*1000);const g=groups.get(t)??[];g.push(r);groups.set(t,g);}
        for(const [ts,g] of groups){if(g.length!==step/60000||g.some((r,i)=>Number(r.ts)*1000!==ts+i*60000))continue;
          const c={symbol:'BTC-USD',interval,ts,low:Math.min(...g.map(r=>Number(r.low))),high:Math.max(...g.map(r=>Number(r.high))),open:Number(g[0].open),close:Number(g.at(-1)!.close),volume:g.reduce((n,r)=>n+Number(r.volume),0),observedAt:String(id.derived_at),revisionHash:String(id.dataset_version)};
          if(!validCandle(c))throw new Error('Invalid minute values');data.push(c);
        }
      } finally { minutes.close(); }
    }
    const quality=db.prepare("SELECT SUM(status='PARTIAL') AS partial,SUM(status='NO_DATA') AS empty FROM hourly_quality").get()!;
    return { env:{...live(data,'coinbase',String(id.derived_at)),marketDataset:{basis:'minute-derived' as const,version:String(id.dataset_version),dataEnd:new Date(dataEnd).toISOString(),partialHours:Number(quality.partial),noDataHours:Number(quality.empty)}},cutoff:end };
  } finally { db.close(); }
}
