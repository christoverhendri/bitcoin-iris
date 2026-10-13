import { describe, expect, it } from 'vitest';
import { completedReplayCandles, replaySnapshot, replayTimeline, replayEntrySnapshot, replayDelay,seekReplayIndex } from './replay';
import type { OhlcvCandle } from './types';

const bars: OhlcvCandle[] = Array.from({ length: 8 }, (_, i) => ({
  symbol: 'BTC-USD', interval: '1h', ts: Date.UTC(2020, 0, 1, i),
  open: 100 + i, close: 102 + i, high: 105 + i, low: 99 + i, volume: i + 1,
}));

describe('historical candle replay', () => {
  it('date seeks backwards across missing spans without revealing an unfinished candle',()=>{
    const entries=replayTimeline([bars[0],bars[4]]);
    expect(seekReplayIndex(entries,bars[0].ts)).toBe(-1);
    expect(seekReplayIndex(entries,bars[2].ts)).toBe(0);
    expect(seekReplayIndex(entries,bars[4].ts)).toBe(1);
    expect(seekReplayIndex(entries,bars[4].ts+1800000)).toBe(1);
    expect(seekReplayIndex(entries,bars[4].ts+3600000)).toBe(2);
  });
  it('preserves missing prices, elapsed time and hides future bars at gaps', () => {
    const timeline = replayTimeline([bars[0], bars[4]]);
    expect(timeline[1]).toMatchObject({ start: bars[1].ts, end: bars[4].ts, gap: { status: 'UNKNOWN' } });
    expect(replayDelay(timeline[1], '1h', 2)).toBe(1500);
    const gap = replayEntrySnapshot(timeline, 1);
    expect(gap.candles).toEqual([bars[0]]);
    expect(gap.levels).toBeNull();
    expect(gap.entry?.candle).toBeUndefined();
    expect(gap.gaps).toHaveLength(1);
    expect(replayEntrySnapshot(timeline, 2).candles).toEqual([bars[0], bars[4]]);
  });
  it('keeps explicit leading, trailing and inferred gaps without creating candles', () => {
    const gaps = [{ start: bars[0].ts - 3600000, end: bars[0].ts, status: 'INFERRED_NO_TRADE' as const },
      { start: bars[1].ts, end: bars[3].ts, status: 'UNKNOWN' as const }];
    const timeline = replayTimeline([bars[0]], gaps);
    expect(replayEntrySnapshot(timeline, 0).candles).toEqual([]);
    expect(replayEntrySnapshot(timeline, 0).levels).toBeNull();
    expect(timeline).toHaveLength(3);
    expect(replayEntrySnapshot(timeline, 2).gaps).toEqual(gaps);
  });
  it('excludes unfinished bars and unknown intervals from replay', () => {
    const cutoff = bars[2].ts + 30 * 60_000;
    expect(completedReplayCandles(bars, cutoff)).toEqual(bars.slice(0, 2));
    expect(completedReplayCandles([{ ...bars[0], interval: 'unknown' }], cutoff)).toEqual([]);
  });
  it('never reveals future bars or lets future values influence levels', () => {
    const original = replaySnapshot(bars, 2);
    const changedFuture = bars.map((bar, i) => i <= 2 ? bar : {
      ...bar, high: 1_000_000, low: 1, close: 999_999, volume: 9_999_999,
    });
    expect(original.candles).toEqual(bars.slice(0, 3));
    expect(replaySnapshot(changedFuture, 2)).toEqual(original);
    expect(replaySnapshot([...changedFuture, ...changedFuture], 2)).toEqual(original);
  });

  it('handles the first bar, end boundaries, and empty input', () => {
    expect(replaySnapshot(bars, -5).candles).toEqual([bars[0]]);
    expect(replaySnapshot(bars, 999).candles).toEqual(bars);
    expect(replaySnapshot(bars, NaN).candles).toEqual([bars[0]]);
    expect(replaySnapshot([], 0)).toEqual({ candles: [], levels: null });
    expect(replaySnapshot(bars, 0).levels?.vwap).toBeCloseTo((105 + 99 + 102) / 3);
  });
});
