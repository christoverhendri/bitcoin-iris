/**
 * History archiver: news sentiment, daily snapshots and the OHLCV archive.
 *
 * Several feeds only expose "now" (scraped ETF flows, funding, news scores), so
 * whatever is not stored the day it is seen is gone. The Python worker calls
 * this once an hour (`iris_worker.jobs.history_archive`); every write is an
 * upsert on a natural key, so overlapping runs are harmless.
 *
 *   curl -X POST https://<host>/api/ingest/history \
 *     -H "authorization: Bearer $CRON_SECRET"
 *
 * Rule: only genuine data is archived. An envelope with `isMock` set is skipped,
 * so a placeholder can never end up in a table that backtests read from.
 */
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { isAuthorizedCron } from '@/lib/cronAuth';
import { getNews } from '@/lib/features/news';
import { getOhlcv } from '@/lib/features/ohlcv';
import { getEtfFlows } from '@/lib/features/etfFlows';
import { getDerivatives } from '@/lib/features/derivatives';
import { getPositioning } from '@/lib/features/positioning';
import { getFearGreed } from '@/lib/features/fearGreed';
import { getConfluence } from '@/lib/features/confluence';
import { getChainNetwork } from '@/lib/features/chainNetwork';
import { getChainSupply } from '@/lib/features/chainSupply';
import { getMacroMarkets } from '@/lib/features/macroMarkets';
import { getVolatility } from '@/lib/features/volatility';
import type { NewsArticle } from '@/lib/features/news';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CANDLE_WINDOWS = [
  { interval: '1d', limit: 720 },
  { interval: '1h', limit: 290 },
] as const;

/** Signed score in [-1, 1]: P(positive) - P(negative) when the model gave probabilities. */
function newsScore(a: NewsArticle): { score: number; confidence: number | null } {
  const p = a.sentimentAssessment?.probabilities;
  if (p) return { score: p.positive - p.negative, confidence: Math.max(p.positive, p.negative, p.neutral) };
  return { score: a.sentiment === 'positive' ? 1 : a.sentiment === 'negative' ? -1 : 0, confidence: null };
}

async function ingest(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not set — ingestion is disabled' }, { status: 503 });
  }
  if (!isAuthorizedCron(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const db = getSupabaseAdmin();
  if (!db) {
    return NextResponse.json({ ok: false, error: 'Supabase admin client unconfigured' }, { status: 503 });
  }

  const result: Record<string, number | string> = {};
  const today = new Date().toISOString().slice(0, 10);

  // --- news sentiment -------------------------------------------------------
  try {
    const env = await getNews({ limit: 40 });
    if (!env.isMock) {
      const rows = env.data.map((a) => {
        const { score, confidence } = newsScore(a);
        return {
          id: createHash('sha1').update(a.url ?? `${a.source}|${a.title}`).digest('hex'),
          published_at: new Date(a.publishedAt).toISOString(),
          source: a.source,
          title: a.title,
          url: a.url ?? null,
          score,
          label: a.sentiment,
          confidence,
          model: a.sentimentAssessment?.modelId ?? a.sentimentAssessment?.engine ?? null,
        };
      });
      if (rows.length) {
        const { error } = await db.from('news_sentiment_items').upsert(rows, { onConflict: 'id' });
        result.news = error ? `error: ${error.message}` : rows.length;
      } else result.news = 0;
    } else result.news = 'skipped (mock)';
  } catch (e) {
    result.news = `error: ${e instanceof Error ? e.message : 'failed'}`;
  }

  // --- daily snapshots ------------------------------------------------------
  const snapshots: Array<[string, () => Promise<{ isMock: boolean; data: unknown }>]> = [
    ['etf_flows', () => getEtfFlows({})],
    ['derivatives', () => getDerivatives({})],
    ['positioning', () => getPositioning({})],
    ['fear_greed', () => getFearGreed({ limit: 1 })],
    ['confluence', () => getConfluence({})],
    ['chain_network', () => getChainNetwork({})],
    ['chain_supply', () => getChainSupply({})],
    ['macro_markets', () => getMacroMarkets({ range: '5d' })],
    ['volatility', () => getVolatility({})],
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snapRows: Array<{ snap_date: string; kind: string; payload: any; is_synthetic: boolean; captured_at: string }> = [];
  for (const [kind, load] of snapshots) {
    try {
      const env = await load();
      if (env.isMock) continue;
      snapRows.push({ snap_date: today, kind, payload: JSON.parse(JSON.stringify(env.data)), is_synthetic: false, captured_at: new Date().toISOString() });
    } catch (e) {
      console.error(`[ingest:history] snapshot ${kind}`, e);
    }
  }
  if (snapRows.length) {
    // Latest capture of the day wins: the table holds the end-of-day reading.
    const { error } = await db.from('daily_snapshots').upsert(snapRows, { onConflict: 'snap_date,kind' });
    result.snapshots = error ? `error: ${error.message}` : snapRows.length;
  } else result.snapshots = 0;

  // --- OHLCV archive --------------------------------------------------------
  let candles = 0;
  for (const { interval, limit } of CANDLE_WINDOWS) {
    try {
      const env = await getOhlcv({ symbol: 'BTC-USD', interval, limit });
      if (env.isMock) continue;
      const rows = env.data.map((c) => ({
        symbol: c.symbol,
        interval: c.interval,
        ts: new Date(c.ts).toISOString(),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));
      const { error } = await db.from('ohlcv_candles').upsert(rows, { onConflict: 'symbol,interval,ts' });
      if (error) console.error('[ingest:history] ohlcv', error);
      else candles += rows.length;
    } catch (e) {
      console.error(`[ingest:history] ohlcv ${interval}`, e);
    }
  }
  result.candles = candles;

  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: Request) {
  return ingest(request);
}

export async function GET(request: Request) {
  return ingest(request);
}
