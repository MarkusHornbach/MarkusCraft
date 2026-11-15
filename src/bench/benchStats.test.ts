import { describe, expect, it } from 'vitest';
import { BENCH_CHUNK_EDGES, BENCH_FRAME_EDGES } from '../game/config';
import { BenchStats, bucketOf } from './benchStats';

/** Frame times 1, 2, …, n ms in a scrambled order. */
function statsOf(n: number): BenchStats {
  const stats = new BenchStats();
  for (let i = 0; i < n; i++) stats.record(((i * 7919) % n) + 1, 0, 0, 0);
  return stats;
}

describe('benchStats (Phase 4P AC1.1)', () => {
  it('gives the exact 99th percentile for 1, 99, 100, 101 and 1 000 frames', () => {
    expect(statsOf(1).summary().p99).toBe(1);
    expect(statsOf(99).summary().p99).toBe(99);
    expect(statsOf(100).summary().p99).toBe(99);
    expect(statsOf(101).summary().p99).toBe(100);
    expect(statsOf(1000).summary().p99).toBe(990);
    expect(new BenchStats().summary().p99).toBe(0);
  });

  it('gives the median frame time', () => {
    expect(statsOf(101).median()).toBe(51);
    expect(new BenchStats().median()).toBe(0);
  });

  it('sums frames, long frames, chunk work, lag and pending chunks', () => {
    const stats = new BenchStats();
    stats.record(16, 2, 10, 5);
    stats.record(33, 30, 40, 3);
    stats.record(34, 31, 20, 4);
    stats.record(100, 61, 0, 6);
    const s = stats.summary();
    expect(s.frames).toBe(4);
    expect(s.ms).toBe(183);
    expect(stats.elapsedMs).toBe(183);
    expect(s.max).toBe(100);
    // 33 ms is not a long frame, 34 ms is.
    expect(s.long).toBe(2);
    expect(s.cwAvg).toBe(31);
    expect(s.cwMax).toBe(61);
    // 30 ms of chunk work is on the limit, not above it.
    expect(s.cwOver).toBe(2);
    expect(s.lagAvg).toBe(4.5);
    expect(s.lagMin).toBe(3);
    expect(s.pendMax).toBe(40);
  });

  it('puts a value on an edge into the upper bucket; the buckets sum to the frames', () => {
    expect(bucketOf(8.9, BENCH_FRAME_EDGES)).toBe(0);
    expect(bucketOf(9, BENCH_FRAME_EDGES)).toBe(1);
    expect(bucketOf(249.9, BENCH_FRAME_EDGES)).toBe(7);
    expect(bucketOf(250, BENCH_FRAME_EDGES)).toBe(8);
    expect(bucketOf(0, BENCH_CHUNK_EDGES)).toBe(0);
    expect(bucketOf(100, BENCH_CHUNK_EDGES)).toBe(10);
    const stats = new BenchStats();
    const frames = [5, 9, 16.7, 17, 33, 49, 50, 120, 250, 900];
    const work = [0, 1, 1.5, 4, 7, 8, 16, 29, 30, 100];
    frames.forEach((ms, i) => stats.record(ms, work[i], 0, 0));
    const s = stats.summary();
    expect(s.fh).toEqual([1, 1, 1, 1, 0, 2, 1, 1, 2]);
    expect(s.ch).toEqual([1, 2, 0, 1, 1, 1, 0, 2, 1, 0, 1]);
    expect(s.fh.length).toBe(BENCH_FRAME_EDGES.length + 1);
    expect(s.ch.length).toBe(BENCH_CHUNK_EDGES.length + 1);
    expect(s.fh.reduce((a, b) => a + b)).toBe(frames.length);
    expect(s.ch.reduce((a, b) => a + b)).toBe(frames.length);
  });

  it('starts over after a reset and keeps counting beyond its capacity', () => {
    const stats = statsOf(50);
    stats.reset();
    expect(stats.summary()).toMatchObject({ frames: 0, ms: 0, max: 0, lagMin: 0, pendMax: 0 });
    // More frames than are kept for the percentile: nothing grows, everything else counts.
    for (let i = 0; i < 40_000; i++) stats.record(10, 1, 1, 2);
    const s = stats.summary();
    expect(s.frames).toBe(40_000);
    expect(s.ms).toBe(400_000);
    expect(s.p99).toBe(10);
    expect(s.fh[1]).toBe(40_000);
  });
});
