// Rolling performance numbers of the last ten seconds: frames, long frames and the time
// spent on chunk work per frame. Pure: time comes in as a parameter.
import { LONG_FRAME_MS, PERF_WINDOW_MS } from './config';

export interface PerfSummary {
  /** Average and largest time a frame spent generating, lighting and meshing chunks. */
  chunkWorkAvgMs: number;
  chunkWorkMaxMs: number;
  /** Frames that took longer than `LONG_FRAME_MS`. */
  longFrames: number;
  frames: number;
}

export class PerfStats {
  // A ring of frames; old entries are overwritten once the ring is full.
  private readonly times: Float64Array;
  private readonly frameMs: Float32Array;
  private readonly workMs: Float32Array;
  private next = 0;
  private count = 0;

  constructor(capacity = 2048) {
    this.times = new Float64Array(capacity);
    this.frameMs = new Float32Array(capacity);
    this.workMs = new Float32Array(capacity);
  }

  /** Notes a frame that ended at `nowMs`, took `frameMs` and spent `chunkWorkMs` on chunks. */
  record(nowMs: number, frameMs: number, chunkWorkMs: number): void {
    this.times[this.next] = nowMs;
    this.frameMs[this.next] = frameMs;
    this.workMs[this.next] = chunkWorkMs;
    this.next = (this.next + 1) % this.times.length;
    if (this.count < this.times.length) this.count++;
  }

  reset(): void {
    this.next = 0;
    this.count = 0;
  }

  /** The numbers over the frames of the last ten seconds before `nowMs`. */
  summary(nowMs: number): PerfSummary {
    let frames = 0;
    let longFrames = 0;
    let sum = 0;
    let max = 0;
    for (let i = 0; i < this.count; i++) {
      if (nowMs - this.times[i] > PERF_WINDOW_MS) continue;
      frames++;
      if (this.frameMs[i] > LONG_FRAME_MS) longFrames++;
      sum += this.workMs[i];
      if (this.workMs[i] > max) max = this.workMs[i];
    }
    return {
      chunkWorkAvgMs: frames > 0 ? sum / frames : 0,
      chunkWorkMaxMs: max,
      longFrames,
      frames,
    };
  }
}
