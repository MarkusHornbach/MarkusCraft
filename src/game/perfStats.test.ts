import { describe, expect, it } from 'vitest';
import { PerfStats } from './perfStats';

describe('PerfStats (Phase 4 AC4.4)', () => {
  it('is empty at first', () => {
    expect(new PerfStats().summary(1000)).toEqual({
      chunkWorkAvgMs: 0,
      chunkWorkMaxMs: 0,
      longFrames: 0,
      frames: 0,
    });
  });

  it('counts frames and long frames and averages the chunk work', () => {
    const stats = new PerfStats();
    stats.record(100, 16, 2);
    stats.record(116, 16, 0);
    stats.record(160, 44, 7);
    stats.record(193, 33, 3);
    const summary = stats.summary(200);
    expect(summary.frames).toBe(4);
    // Longer than 33 ms counts; exactly 33 does not.
    expect(summary.longFrames).toBe(1);
    expect(summary.chunkWorkAvgMs).toBeCloseTo(3, 6);
    expect(summary.chunkWorkMaxMs).toBe(7);
  });

  it('forgets frames older than ten seconds', () => {
    const stats = new PerfStats();
    stats.record(0, 50, 9);
    stats.record(5000, 16, 1);
    expect(stats.summary(9000).frames).toBe(2);
    const later = stats.summary(10_001);
    expect(later).toEqual({ chunkWorkAvgMs: 1, chunkWorkMaxMs: 1, longFrames: 0, frames: 1 });
    expect(stats.summary(20_000).frames).toBe(0);
  });

  it('keeps only the newest frames when more arrive than it can hold', () => {
    const stats = new PerfStats(4);
    for (let i = 0; i < 10; i++) stats.record(i, 40, i);
    const summary = stats.summary(10);
    expect(summary.frames).toBe(4);
    expect(summary.longFrames).toBe(4);
    expect(summary.chunkWorkMaxMs).toBe(9);
    expect(summary.chunkWorkAvgMs).toBeCloseTo(7.5, 6);
    stats.reset();
    expect(stats.summary(10).frames).toBe(0);
  });
});
