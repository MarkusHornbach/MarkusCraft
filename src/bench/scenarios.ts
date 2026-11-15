// Scenarios of the performance test: fixed scripts of input and actions, counted in
// simulation steps, and the suites that run them. Pure.
import type { Action } from '../actions/actions';
import {
  BENCH_EDIT_INTERVAL,
  BENCH_FLY_STOP_STEPS,
  BENCH_QUICK_DIVISOR,
  BENCH_QUICK_MIN_STEPS,
  BENCH_QUICK_RENDER_DISTANCES,
  BENCH_QUICK_WARMUP_STEPS,
  BENCH_RENDER_DISTANCES,
  BENCH_WARMUP_STEPS,
} from '../game/config';
import type { MoveInput } from '../player/physics';
import { NO_INPUT } from '../player/physics';
import type { MoveMode } from '../player/player';

/** Where and how a scenario starts. Angles in radians. */
export interface ScenarioPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  mode: MoveMode;
}

export interface Scenario {
  id: string;
  /** Raised when the script, the steps or the warm-up of this scenario change. */
  version: number;
  /** What the progress line and the result table call it. */
  label: string;
  /** Measured steps of the full suite. */
  steps: number;
  start: ScenarioPose;
  /**
   * Input of one step. Warm-up steps are negative, measured steps count from 0 to
   * `steps - 1`; `steps` is the length of the window in this suite.
   */
  input(step: number, steps: number): MoveInput;
  /** The action to submit before this step, or null. Warm-up steps have none. */
  action(step: number, steps: number): Action | null;
}

const DEG = Math.PI / 180;

/** The start point of seed 1337 (`findSpawn`), feet centre. Pinned by the tests. */
export const BENCH_SPAWN = { x: -0.5, y: 57, z: 4.5 };

/** `walk`: found by a search over headings; 80 blocks of ground without water. */
const WALK_YAW = 165 * DEG;
/** `fly`: north along -Z; the highest block on the route is at 86. */
export const FLY_HEIGHT = 100;
const FLY_PITCH = -15 * DEG;

/** `edit`: the player hovers on the corner of four chunks, above the trees. */
export const EDIT_HOVER = { x: 0, y: 70, z: 0 };
/** The slab lies two blocks below the feet. */
const EDIT_SLAB_Y = EDIT_HOVER.y - 2;
const EDIT_CELL_COUNT = 75;

/**
 * The cells of the slab around the chunk corner, nearest to the corner first: every new
 * cell then deepens the shade under cells of the other chunks.
 */
export const EDIT_CELLS: readonly { x: number; z: number }[] = (() => {
  const cells: { x: number; z: number; d: number }[] = [];
  for (let z = -5; z < 5; z++) {
    for (let x = -4; x < 4; x++) {
      const dx = x + 0.5 - EDIT_HOVER.x;
      const dz = z + 0.5 - EDIT_HOVER.z;
      cells.push({ x: EDIT_HOVER.x + x, z: EDIT_HOVER.z + z, d: dx * dx + dz * dz });
    }
  }
  cells.sort((a, b) => a.d - b.d || a.z - b.z || a.x - b.x);
  return cells.slice(0, EDIT_CELL_COUNT).map(({ x, z }) => ({ x, z }));
})();

const WALK_INPUT: MoveInput = { forward: 1, strafe: 0, jump: true, sprint: true, descend: false };
const FLY_INPUT: MoveInput = { forward: 1, strafe: 0, jump: false, sprint: true, descend: false };

function noAction(): Action | null {
  return null;
}

/**
 * `edit`: the first half of the actions places the cells of the slab, the second half
 * breaks them again, the outermost first, so the world ends as it began.
 */
function editAction(step: number, steps: number): Action | null {
  if (step < 0 || step % BENCH_EDIT_INTERVAL !== 0) return null;
  const half = Math.min(EDIT_CELL_COUNT, Math.floor(steps / BENCH_EDIT_INTERVAL / 2));
  const index = step / BENCH_EDIT_INTERVAL;
  if (index >= half * 2) return null;
  const cell = EDIT_CELLS[index < half ? index : half * 2 - 1 - index];
  const at = { x: cell.x, y: EDIT_SLAB_Y, z: cell.z };
  // Slot 0 of a new Creative player holds a solid block.
  return index < half ? { kind: 'place', ...at, slot: 0 } : { kind: 'break', ...at };
}

/** The scenario table. Append new scenarios; never change one without a new version. */
export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'stand',
    version: 1,
    label: 'standing',
    steps: 600,
    start: { ...BENCH_SPAWN, yaw: 0, pitch: 0, mode: 'walk' },
    input: () => NO_INPUT,
    action: noAction,
  },
  {
    id: 'walk',
    version: 1,
    label: 'walking',
    steps: 1200,
    start: { ...BENCH_SPAWN, yaw: WALK_YAW, pitch: 0, mode: 'walk' },
    input: () => WALK_INPUT,
    action: noAction,
  },
  {
    id: 'fly',
    version: 1,
    label: 'flying',
    steps: 1200,
    start: {
      x: BENCH_SPAWN.x,
      y: FLY_HEIGHT,
      z: BENCH_SPAWN.z,
      yaw: 0,
      pitch: FLY_PITCH,
      mode: 'fly',
    },
    // The player stands still when the window ends: the catch-up time starts from a stop.
    input: (step, steps) => (step < steps - BENCH_FLY_STOP_STEPS ? FLY_INPUT : NO_INPUT),
    action: noAction,
  },
  {
    id: 'edit',
    version: 1,
    label: 'building',
    steps: 900,
    start: { ...EDIT_HOVER, yaw: 0, pitch: -60 * DEG, mode: 'fly' },
    input: () => NO_INPUT,
    action: editAction,
  },
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id);
}

export type SuiteKind = 'full' | 'quick';

/** One measured scenario of a suite. */
export interface SuiteEntry {
  scenario: Scenario;
  renderDistance: number;
  /** Measured steps in this suite. */
  steps: number;
  warmup: number;
  /** The entry starts a block: a fresh world is loaded and the time until ready is taken. */
  fresh: boolean;
}

/**
 * The scenarios of a suite in order: all of them at the first render distance, all at
 * the second, then the first scenario once more at the first distance (throttling check).
 */
export function buildSuite(kind: SuiteKind): SuiteEntry[] {
  const quick = kind === 'quick';
  const distances = quick ? BENCH_QUICK_RENDER_DISTANCES : BENCH_RENDER_DISTANCES;
  const warmup = quick ? BENCH_QUICK_WARMUP_STEPS : BENCH_WARMUP_STEPS;
  const stepsOf = (scenario: Scenario): number =>
    quick
      ? Math.max(BENCH_QUICK_MIN_STEPS, Math.round(scenario.steps / BENCH_QUICK_DIVISOR))
      : scenario.steps;
  const entries: SuiteEntry[] = [];
  const block = (renderDistance: number, scenarios: readonly Scenario[]): void => {
    scenarios.forEach((scenario, index) => {
      entries.push({
        scenario,
        renderDistance,
        steps: stepsOf(scenario),
        warmup,
        fresh: index === 0,
      });
    });
  };
  for (const distance of distances) block(distance, SCENARIOS);
  block(distances[0], [SCENARIOS[0]]);
  return entries;
}
