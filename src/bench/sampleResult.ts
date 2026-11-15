// A built-in result of the performance test with fixed, invented numbers: what
// `bench=sample` shows, so layout tests and the reference screenshot have a stable
// picture. Pure.
import {
  BENCH_CHUNK_EDGES,
  BENCH_FORMAT_VERSION,
  BENCH_FRAME_EDGES,
  BENCH_SUITE_VERSION,
} from '../game/config';
import type { BenchResult, ScenarioResult } from './benchReport';

function row(
  id: string,
  rd: number,
  frames: number,
  ms: number,
  p99: number,
  max: number,
  long: number,
  work: [avg: number, max: number, over: number],
  lag: [avg: number, min: number, pending: number],
  catchUpMs: number | null,
): ScenarioResult {
  // All frames in one bucket each: the sample is for the eye, not for statistics.
  const fh = BENCH_FRAME_EDGES.map(() => 0).concat(0);
  const ch = BENCH_CHUNK_EDGES.map(() => 0).concat(0);
  fh[2] = frames;
  ch[1] = frames;
  return {
    id,
    v: 1,
    rd,
    ms,
    frames,
    fps: Math.round((frames * 10000) / ms) / 10,
    p99,
    max,
    long,
    cwAvg: work[0],
    cwMax: work[1],
    cwOver: work[2],
    lagAvg: lag[0],
    lagMin: lag[1],
    pendMax: lag[2],
    catchUpMs,
    heap: 48,
    cut: false,
    fh,
    ch,
  };
}

export const SAMPLE_RESULT: BenchResult = {
  format: BENCH_FORMAT_VERSION,
  suite: BENCH_SUITE_VERSION,
  quick: false,
  commit: 'sample',
  date: '2026-01-01T12:00:00.000Z',
  ready: [
    { rd: 5, ms: 2400 },
    { rd: 8, ms: 6100 },
    { rd: 5, ms: 2500 },
  ],
  throttled: true,
  workers: 'borderline',
  env: {
    ua: 'Sample browser (not a real run)',
    gpu: 'Sample GPU',
    screenW: 800,
    screenH: 360,
    dpr: 3,
    pixelRatio: 1.5,
    canvasW: 1200,
    canvasH: 540,
    input: 'touch',
    cores: 8,
    memory: 4,
    hz: 60,
    wake: true,
  },
  frameEdges: [...BENCH_FRAME_EDGES],
  chunkEdges: [...BENCH_CHUNK_EDGES],
  scenarios: [
    row('stand', 5, 600, 10000, 17.2, 18.1, 0, [0.1, 1.2, 0], [6, 6, 0], null),
    row('walk', 5, 1195, 20010, 21.5, 34.8, 3, [1.4, 9.6, 0], [5.9, 5, 11], null),
    row('fly', 5, 1150, 20100, 30.4, 61.3, 22, [5.8, 34.2, 4], [3.1, 1, 64], 1900),
    row('edit', 5, 898, 15020, 24.9, 41, 5, [2.2, 18.5, 0], [6, 6, 0], null),
    row('torches', 5, 1196, 20010, 22.6, 38.4, 4, [2.4, 17.9, 0], [5.8, 5, 6], null),
    row('stand', 8, 598, 10020, 17.4, 25.3, 0, [0.1, 1.5, 0], [9, 9, 0], null),
    row('walk', 8, 1170, 20030, 33.1, 52.7, 31, [2.1, 12.4, 0], [8.7, 7, 17], null),
    row('fly', 8, 960, 20400, 58.2, 131.6, 240, [6.4, 47.9, 14], [3.3, 1, 150], 7400),
    row('edit', 8, 880, 15040, 31.8, 55.2, 12, [2.6, 21.3, 0], [9, 9, 0], null),
    row('torches', 8, 1182, 20030, 29.7, 49.6, 14, [2.9, 22.4, 0], [8.8, 8, 9], null),
    row('stand', 5, 470, 10010, 26.3, 34.9, 2, [0.1, 1.4, 0], [6, 6, 0], null),
  ],
};
