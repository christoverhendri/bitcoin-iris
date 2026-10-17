import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { donutArcs, netTilt, BUCKETS } from './present';
import { mockSocialSentiment } from './mock';
import { fetchSocialSentiment } from './live';
import { forecastTargetDate } from '@/lib/features/weeklyForecast/present';

const day = { date: '2026-09-16', positive: 0.5, neutral: 0.15, negative: 0.35 };

describe('donutArcs', () => {
  it('draws one segment per bucket, in fixed order, with shares that sum to 1', () => {
    const arcs = donutArcs(day, 50, 50, 49, 30);
    expect(arcs.map((a) => a.bucket)).toEqual([...BUCKETS]);
    expect(arcs.reduce((s, a) => s + a.share, 0)).toBeCloseTo(1, 10);
    expect(arcs[0].share).toBeCloseTo(0.5, 10);
  });

  it('uses the large-arc flag only for a segment over half the ring', () => {
    const big = donutArcs({ ...day, positive: 0.7, negative: 0.15 }, 50, 50, 49, 30);
    expect(big[0].d).toContain(' 0 1 1 '); // positive 70% -> large arc
    expect(big[2].d).toContain(' 0 0 1 '); // negative 15% -> small arc
  });

  it('skips a segment smaller than its gap instead of drawing it inside out', () => {
    const arcs = donutArcs({ ...day, neutral: 0, negative: 0.5 }, 50, 50, 49, 30);
    expect(arcs.map((a) => a.bucket)).toEqual(['positive', 'negative']);
  });
});

describe('netTilt', () => {
  it('is positive minus negative share in points', () => {
    expect(netTilt(day)).toBeCloseTo(15, 10);
  });
});

describe('mockSocialSentiment', () => {
  it('is deterministic and every day sums to 1', () => {
    const a = mockSocialSentiment({ days: 30 });
    const b = mockSocialSentiment({ days: 30 });
    expect(a).toEqual(b);
    expect(a.history).toHaveLength(30);
    for (const d of a.history) expect(d.positive + d.neutral + d.negative).toBeCloseTo(1, 10);
    expect(a.latest).toEqual(a.history[29]);
  });
});

describe('fetchSocialSentiment (local file, no Supabase)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reads the worker output and reports how far behind it is', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const dir = mkdtempSync(join(tmpdir(), 'social-'));
    const file = join(dir, 'social_sentiment.json');
    writeFileSync(
      file,
      JSON.stringify({
        fetched_utc: '2026-10-16T16:21:25+00:00',
        sources: ['twitter', 'reddit', 'telegram', '4chan'],
        rows: [{ ...day, date: '2026-09-15' }, day],
      }),
    );
    vi.stubEnv('SOCIAL_SENTIMENT_LOCAL_FILE', file);
    const env = await fetchSocialSentiment({ days: 30 });
    expect(env).not.toBeNull();
    expect(env!.data.latest).toEqual(day);
    expect(env!.data.history).toHaveLength(2);
    expect(env!.data.lagDays).toBe(30);
    expect(env!.asOf).toBe('2026-09-16T00:00:00.000Z');
    expect(env!.synthetic).toBe(false);
  });

  it('returns null (-> badged mock) when no file is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SOCIAL_SENTIMENT_LOCAL_FILE', '');
    expect(await fetchSocialSentiment({ days: 30 })).toBeNull();
  });
});

describe('forecastTargetDate', () => {
  it('is the close 7 days after the data date', () => {
    expect(forecastTargetDate('2026-10-15')).toBe('2026-10-22');
    expect(forecastTargetDate('2026-12-28')).toBe('2027-01-04');
    expect(forecastTargetDate('not a date')).toBe('');
  });
});
