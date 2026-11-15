// Statistics of one measurement window of the performance test: sums, the exact 99th
// percentile and two histograms over the frames recorded. Pure; nothing is allocated per
// frame.
import {
  BENCH_CHUNK_EDGES,
  BENCH_CHUNK_WORK_LIMIT_MS,
  BENCH_FRAME_EDGES,
  LONG_FRAME_MS,
} from '../game/config';

/** The numbers of a window as they were measured (not rounded). */
export interface WindowStats {
  frames: number;
  /** Sum of the frame times: the wall time of the window. */
  ms: number;
  p99: number;
  max: number;
  /** Frames longer than `LONG_FRAME_MS`. */
  long: number;
  cwAvg: number;
  cwMax: number;
  /** Frames whose chunk work exceeded `BENCH_CHUNK_WORK_LIMIT_MS`. */
  cwOver: number;
  /** Distance to the nearest missing mesh, in chunks. */
  lagAvg: number;
  lagMin: number;
  pendMax: number;
  /** Frames per bucket of frame time and of chunk work. */
  fh: number[];
  ch: number[];
}

/**
 * Frames whose time is kept for the percentile. The longest window (20 s nominal, cut
 * off after 60 s) stays below this even at 240 frames per second.
 */
const CAPACITY = 16_384;

/** Bucket of a value: the first edge above it; a value on an edge is in the upper bucket. */
export function bucketOf(value: number, edges: readonly number[]): number {
  let bucket = 0;
  while (bucket < edges.length && value >= edges[bucket]) bucket++;
  return bucket;
}

/**
 * The value at a share of a sorted list by the nearest-rank rule: the smallest value
 * that at least `share` of the list does not exceed.
 */
function atShare(sorted: Float32Array, count: number, share: number): number {
  if (count === 0) return 0;
  return sorted[Math.max(0, Math.ceil(share * count) - 1)];
}

export class BenchStats {
  private readonly times = new Float32Array(CAPACITY);
  private readonly sorted = new Float32Array(CAPACITY);
  private readonly frameBuckets = new Uint32Array(BENCH_FRAME_EDGES.length + 1);
  private readonly chunkBuckets = new Uint32Array(BENCH_CHUNK_EDGES.length + 1);
  private count = 0;
  private sumMs = 0;
  private maxMs = 0;
  private long = 0;
  private workSum = 0;
  private workMax = 0;
  private workOver = 0;
  private lagSum = 0;
  private lagMin = Infinity;
  private pendMax = 0;

  reset(): void {
    this.frameBuckets.fill(0);
    this.chunkBuckets.fill(0);
    this.count = 0;
    this.sumMs = 0;
    this.maxMs = 0;
    this.long = 0;
    this.workSum = 0;
    this.workMax = 0;
    this.workOver = 0;
    this.lagSum = 0;
    this.lagMin = Infinity;
    this.pendMax = 0;
  }

  get frames(): number {
    return this.count;
  }

  /** Wall time of the frames recorded so far. */
  get elapsedMs(): number {
    return this.sumMs;
  }

  /**
   * Notes one frame: its time, the chunk work done in it, the chunks still pending and
   * the distance to the nearest missing mesh.
   */
  record(frameMs: number, chunkWorkMs: number, pending: number, lag: number): void {
    // Frames beyond the capacity still count for everything but the percentile.
    if (this.count < CAPACITY) this.times[this.count] = frameMs;
    this.count++;
    this.sumMs += frameMs;
    if (frameMs > this.maxMs) this.maxMs = frameMs;
    if (frameMs > LONG_FRAME_MS) this.long++;
    this.frameBuckets[bucketOf(frameMs, BENCH_FRAME_EDGES)]++;
    this.workSum += chunkWorkMs;
    if (chunkWorkMs > this.workMax) this.workMax = chunkWorkMs;
    if (chunkWorkMs > BENCH_CHUNK_WORK_LIMIT_MS) this.workOver++;
    this.chunkBuckets[bucketOf(chunkWorkMs, BENCH_CHUNK_EDGES)]++;
    this.lagSum += lag;
    if (lag < this.lagMin) this.lagMin = lag;
    if (pending > this.pendMax) this.pendMax = pending;
  }

  private sortTimes(): number {
    const kept = Math.min(this.count, CAPACITY);
    this.sorted.set(this.times.subarray(0, kept));
    this.sorted.subarray(0, kept).sort();
    return kept;
  }

  /** The median frame time; the refresh rate of the display is estimated from it. */
  median(): number {
    return atShare(this.sorted, this.sortTimes(), 0.5);
  }

  summary(): WindowStats {
    const kept = this.sortTimes();
    const frames = this.count;
    return {
      frames,
      ms: this.sumMs,
      p99: atShare(this.sorted, kept, 0.99),
      max: this.maxMs,
      long: this.long,
      cwAvg: frames > 0 ? this.workSum / frames : 0,
      cwMax: this.workMax,
      cwOver: this.workOver,
      lagAvg: frames > 0 ? this.lagSum / frames : 0,
      lagMin: frames > 0 ? this.lagMin : 0,
      pendMax: this.pendMax,
      fh: Array.from(this.frameBuckets),
      ch: Array.from(this.chunkBuckets),
    };
  }
}
