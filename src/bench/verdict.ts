// Verdicts of the performance test: numbers → traffic lights, the throttling flag and
// the line about Web Workers. Pure; the thresholds are in `config.ts`.
import {
  BENCH_LONG_SHARE_GREEN,
  BENCH_LONG_SHARE_YELLOW,
  BENCH_P99_GREEN_MS,
  BENCH_P99_YELLOW_MS,
  BENCH_THROTTLE_FACTOR,
  BENCH_WORKERS_RENDER_DISTANCE,
  BENCH_WORK_SHARE_GREEN,
  BENCH_WORK_SHARE_YELLOW,
} from '../game/config';

export type Light = 'green' | 'yellow' | 'red';

/** What the line about Web Workers says; `workersText` turns it into words. */
export type WorkersVerdict = 'recommended' | 'borderline' | 'not needed' | 'mouse' | 'quick';

/** The numbers of a scenario that the lights look at. */
export interface JudgedScenario {
  id: string;
  rd: number;
  frames: number;
  ms: number;
  p99: number;
  long: number;
  cwOver: number;
  lagAvg: number;
  cut: boolean;
}

const ORDER: readonly Light[] = ['green', 'yellow', 'red'];

export function worstLight(lights: readonly (Light | null)[]): Light {
  let worst = 0;
  for (const light of lights) if (light) worst = Math.max(worst, ORDER.indexOf(light));
  return ORDER[worst];
}

/** Long frames and the 99th percentile of the frame times. */
export function smoothnessLight(s: JudgedScenario): Light {
  const share = s.frames > 0 ? s.long / s.frames : 1;
  if (share <= BENCH_LONG_SHARE_GREEN && s.p99 <= BENCH_P99_GREEN_MS) return 'green';
  if (share <= BENCH_LONG_SHARE_YELLOW && s.p99 <= BENCH_P99_YELLOW_MS) return 'yellow';
  return 'red';
}

/** How far the nearest missing mesh was on average. Only flying loads enough to tell. */
export function loadingLight(s: JudgedScenario): Light | null {
  if (s.id !== 'fly') return null;
  if (s.lagAvg >= s.rd - 1) return 'green';
  if (s.lagAvg >= s.rd / 2) return 'yellow';
  return 'red';
}

/** Share of frames whose chunk work was above the limit. */
export function chunkWorkLight(s: JudgedScenario): Light {
  const share = s.frames > 0 ? s.cwOver / s.frames : 1;
  if (share <= BENCH_WORK_SHARE_GREEN) return 'green';
  if (share <= BENCH_WORK_SHARE_YELLOW) return 'yellow';
  return 'red';
}

/** The light of a scenario: its worst one; a window that was cut off is red. */
export function scenarioLight(s: JudgedScenario): Light {
  if (s.cut) return 'red';
  return worstLight([smoothnessLight(s), loadingLight(s), chunkWorkLight(s)]);
}

/** One letter per light, so the table reads without colour. */
export function lightLetter(light: Light): string {
  return light === 'green' ? 'G' : light === 'yellow' ? 'Y' : 'R';
}

/**
 * True if the device slowed down during the run: the last scenario repeats the first,
 * and its average frame took clearly longer.
 */
export function isThrottled(scenarios: readonly JudgedScenario[]): boolean {
  if (scenarios.length < 2) return false;
  const first = scenarios[0];
  const last = scenarios[scenarios.length - 1];
  if (first.id !== last.id || first.rd !== last.rd) return false;
  if (first.frames === 0 || last.frames === 0) return false;
  return last.ms / last.frames > (first.ms / first.frames) * BENCH_THROTTLE_FACTOR;
}

/**
 * Whether Web Workers (Part C) are needed: decided only by a full run in touch mode,
 * from the loading and chunk-work lights of `fly` and `edit` at the touch render distance.
 */
export function workersVerdict(
  scenarios: readonly JudgedScenario[],
  input: 'mouse' | 'touch',
  quick: boolean,
): WorkersVerdict {
  if (quick) return 'quick';
  if (input !== 'touch') return 'mouse';
  const lights: (Light | null)[] = [];
  for (const s of scenarios) {
    if (s.rd !== BENCH_WORKERS_RENDER_DISTANCE || (s.id !== 'fly' && s.id !== 'edit')) continue;
    lights.push(loadingLight(s), chunkWorkLight(s));
  }
  const worst = worstLight(lights);
  return worst === 'red' ? 'recommended' : worst === 'yellow' ? 'borderline' : 'not needed';
}

export function workersText(verdict: WorkersVerdict): string {
  const said =
    verdict === 'mouse'
      ? 'decided on phones and tablets'
      : verdict === 'quick'
        ? 'not a measurement'
        : verdict;
  return `Web Workers (Part C): ${said}`;
}

export const THROTTLED_TEXT =
  'The device slowed down during the run; the later scenarios may look worse than they are.';
