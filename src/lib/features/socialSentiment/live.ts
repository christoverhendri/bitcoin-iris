/**
 * Live BTC social sentiment — Santiment's daily share of posts labelled
 * positive / neutral / negative across Twitter, Reddit, Telegram and 4chan.
 *
 * The worker job `social_sentiment` fetches it once a day (Santiment's free plan
 * allows 1000 requests a month and withholds the latest 30 days) and writes:
 *   - Supabase `social_sentiment_daily` when configured — read first here;
 *   - `worker/out/social_sentiment.json` always — read only in local dev when
 *     Supabase is not configured and SOCIAL_SENTIMENT_LOCAL_FILE points at it.
 *
 * Nothing here calls Santiment, so the API key never reaches the web server.
 */
import { getSupabase, asRow } from '@/lib/supabase/server';
import type { SocialSentimentArgs, SocialSentimentData, SocialSentimentDay } from './types';

const SOURCES = ['twitter', 'reddit', 'telegram', '4chan'];
const DAY_MS = 86_400_000;

interface Row {
  date: string;
  positive_ratio: number;
  neutral_ratio: number;
  negative_ratio: number;
  fetched_at: string;
  is_synthetic: boolean;
}

interface LocalFile {
  fetched_utc: string;
  sources?: string[];
  rows: SocialSentimentDay[];
}

function assemble(history: SocialSentimentDay[], fetchedAt: string, sources: string[], synthetic: boolean) {
  if (history.length === 0) return null;
  const latest = history[history.length - 1];
  const fetched = Date.parse(fetchedAt);
  const lagDays = Number.isFinite(fetched)
    ? Math.max(0, Math.floor((fetched - Date.parse(`${latest.date}T00:00:00Z`)) / DAY_MS))
    : 0;
  const data: SocialSentimentData = { latest, history, sources, lagDays };
  return { data, asOf: `${latest.date}T00:00:00.000Z`, synthetic };
}

async function readLocal(days: number) {
  const file = process.env.SOCIAL_SENTIMENT_LOCAL_FILE;
  if (!file) return null;
  try {
    const { readFile } = await import('node:fs/promises');
    const j = JSON.parse(await readFile(file, 'utf8')) as LocalFile;
    const rows = Array.isArray(j.rows) ? j.rows.slice(-days) : [];
    return assemble(rows, j.fetched_utc, j.sources ?? SOURCES, false);
  } catch (err) {
    console.warn('[socialSentiment:local_file]', err);
    return null;
  }
}

export async function fetchSocialSentiment({ days = 30 }: SocialSentimentArgs) {
  const db = getSupabase();
  if (!db) return readLocal(days);

  const { data, error } = await db
    .from('social_sentiment_daily')
    .select('date, positive_ratio, neutral_ratio, negative_ratio, fetched_at, is_synthetic')
    .eq('slug', 'bitcoin')
    .order('date', { ascending: false })
    .limit(days);
  if (error) throw new Error(`social_sentiment_daily: ${error.message}`);

  const rows = (data ?? []).map(asRow<Row>).reverse();
  if (rows.length === 0) return null;
  const history = rows.map((r) => ({
    date: r.date,
    positive: Number(r.positive_ratio),
    neutral: Number(r.neutral_ratio),
    negative: Number(r.negative_ratio),
  }));
  return assemble(
    history,
    rows[rows.length - 1].fetched_at,
    SOURCES,
    rows.some((r) => r.is_synthetic),
  );
}
