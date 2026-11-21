// Scenarios of the performance test: fixed scripts of input and actions, counted in
// simulation steps, and the suites that run them. Pure.
import type { Action } from '../actions/actions';
import {
  BENCH_EDIT_INTERVAL,
  BENCH_TORCH_MOVE_SHARE,
  BENCH_FLY_STOP_STEPS,
  BENCH_GENERATOR_VERSION,
  BENCH_GUEST_ARC,
  BENCH_GUEST_BUSY_STEPS,
  BENCH_GUEST_EDIT_INTERVAL,
  BENCH_GUEST_LOOKS,
  BENCH_GUEST_RADII,
  BENCH_SEED,
  BENCH_QUICK_DIVISOR,
  BENCH_QUICK_MIN_STEPS,
  BENCH_QUICK_RENDER_DISTANCES,
  BENCH_QUICK_WARMUP_STEPS,
  BENCH_RENDER_DISTANCES,
  BENCH_WARMUP_STEPS,
  SIM_HZ,
  WALK_SPEED,
} from '../game/config';
import { generateChunk, getTerrain } from '../world/generation/terrain';
import { Block } from '../world/blocks';
import { blockIndex, chunkKey, toChunkCoord, toLocalCoord } from '../world/chunk';
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
  /** Time of day (0..1, 0.25 is noon) while it runs; the test world's time if absent. */
  time?: number;
  /**
   * Input of one step. Warm-up steps are negative, measured steps count from 0 to
   * `steps - 1`; `steps` is the length of the window in this suite.
   */
  input(step: number, steps: number): MoveInput;
  /** The action to submit before this step, or null. Warm-up steps have none. */
  action(step: number, steps: number): Action | null;
  /** Simulated guests in a room the page hosts while the scenario runs (Phase 6 part E). */
  guests?: GuestScript;
}

/** Where a simulated guest is before a step, and whether it holds break. */
export interface GuestPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  busy: boolean;
}

/** What the simulated guests of a scenario do; counted in steps like the player's script. */
export interface GuestScript {
  /** The look of each guest (1–8); its length is the number of guests. */
  looks: readonly number[];
  /** Guest `guest`'s pose before this step (warm-up steps are negative). */
  pose(guest: number, step: number, steps: number): GuestPose;
  /** The guest's action before this step, or null. Warm-up steps have none. */
  action(guest: number, step: number, steps: number): Action | null;
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

/** `torches`: the player hovers above a slope south of the start point, at midnight. */
export const TORCH_HOVER = { x: 0.5, y: 60.5, z: 9.5 };
const TORCH_TIME = 0.75;
/**
 * The cells of the line: on the grass of row z = 7, across the chunk border at x = 0,
 * one block above the ground (the slope rises towards +X). Pinned by the tests.
 */
export const TORCH_CELLS: readonly { x: number; y: number; z: number }[] = [
  { x: -3, y: 57, z: 7 },
  { x: -2, y: 57, z: 7 },
  { x: -1, y: 58, z: 7 },
  { x: 0, y: 58, z: 7 },
  { x: 1, y: 59, z: 7 },
  { x: 2, y: 59, z: 7 },
  { x: 3, y: 60, z: 7 },
];
/** The bar slot that receives the torch (a new Creative player holds blocks in all nine). */
const TORCH_SLOT = 0;
const TORCH_ID = 19;
/** Moving past the line: forward and up, slowly, so trees ahead are cleared. */
const PASS_INPUT: MoveInput = { forward: 1, strafe: 0, jump: true, sprint: false, descend: false };

/** First step of the part in which the player moves past the line. */
function torchMoveStart(steps: number): number {
  const actions = Math.floor((steps * (1 - BENCH_TORCH_MOVE_SHARE)) / BENCH_EDIT_INTERVAL);
  return actions * BENCH_EDIT_INTERVAL;
}

/**
 * `torches`: the torch is put into the bar, then the line is placed from west to east and
 * broken again from east to west, round after round; the rounds end with the line placed,
 * and the player moves past it for the rest of the window.
 */
function torchAction(step: number, steps: number): Action | null {
  if (step < 0 || step % BENCH_EDIT_INTERVAL !== 0 || step >= torchMoveStart(steps)) return null;
  if (step === 0) return { kind: 'setBarSlot', slot: TORCH_SLOT, item: TORCH_ID };
  const index = step / BENCH_EDIT_INTERVAL - 1;
  const n = TORCH_CELLS.length;
  const k = index % (2 * n);
  const cell = TORCH_CELLS[k < n ? k : 2 * n - 1 - k];
  return k < n ? { kind: 'place', ...cell, slot: TORCH_SLOT } : { kind: 'break', ...cell };
}

/**
 * `players`: the player stands at the start point and looks south-south-west, the most
 * open view from there (the woods to the north would hide the guests), a little down.
 */
export const PLAYERS_YAW = 195 * DEG;
const PLAYERS_PITCH = -10 * DEG;
const PLAYERS_TERRAIN = getTerrain(BENCH_SEED);

/** Angle of guest `g` on its arc at `step` (0 straight ahead) and the way it walks (±1). */
function guestAngle(g: number, step: number): { a: number; dir: number } {
  const radius = BENCH_GUEST_RADII[g];
  // One swing there and back covers the arc twice, at walking speed.
  const periodSteps = ((4 * BENCH_GUEST_ARC * radius) / WALK_SPEED) * SIM_HZ;
  let u = (step / periodSteps + g / BENCH_GUEST_RADII.length) % 1;
  if (u < 0) u += 1;
  return u < 0.5
    ? { a: BENCH_GUEST_ARC * (-1 + 4 * u), dir: 1 }
    : { a: BENCH_GUEST_ARC * (3 - 4 * u), dir: -1 };
}

/** The point at `radius` from the start point, `a` from the way the player looks. */
function arcPoint(radius: number, a: number): { x: number; z: number } {
  const yaw = PLAYERS_YAW + a;
  return { x: BENCH_SPAWN.x - radius * Math.sin(yaw), z: BENCH_SPAWN.z - radius * Math.cos(yaw) };
}

/** Feet height on the terrain (trees left out: a guest walks through them). */
function groundAt(x: number, z: number): number {
  return PLAYERS_TERRAIN.heightAt(Math.floor(x), Math.floor(z)) + 1;
}

/** Where guest `g` walks at `step`, facing the way it goes. */
function guestWalk(g: number, step: number): { x: number; y: number; z: number; yaw: number } {
  const { a, dir } = guestAngle(g, step);
  const radius = BENCH_GUEST_RADII[g];
  const p = arcPoint(radius, a);
  // Facing where it walks: the tangent of the arc.
  const dx = -radius * Math.cos(PLAYERS_YAW + a) * dir;
  const dz = radius * Math.sin(PLAYERS_YAW + a) * dir;
  return { x: p.x, y: groundAt(p.x, p.z), z: p.z, yaw: Math.atan2(-dx, -dz) };
}

function guestPose(g: number, step: number, steps: number): GuestPose {
  return { ...guestWalk(g, step), pitch: PLAYERS_PITCH, busy: guestBusy(g, step, steps) };
}

/** First step of guest `g`'s edits: the guests take turns. */
function editOffset(g: number): number {
  return Math.round((g * BENCH_GUEST_EDIT_INTERVAL) / BENCH_GUEST_RADII.length);
}

/** How many edits guest `g` makes in a window of `steps`: whole pairs of place and break. */
function editCount(g: number, steps: number): number {
  const count = Math.max(
    0,
    Math.floor((steps - 1 - editOffset(g)) / BENCH_GUEST_EDIT_INTERVAL) + 1,
  );
  return count - (count % 2);
}

/** The guest holds break in the steps that lead up to one of its breaks. */
function guestBusy(g: number, step: number, steps: number): boolean {
  const since = step - editOffset(g);
  if (since < 0) return false;
  const next = Math.floor(since / BENCH_GUEST_EDIT_INTERVAL) + 1;
  const untilNext = next * BENCH_GUEST_EDIT_INTERVAL - since;
  return next % 2 === 1 && next < editCount(g, steps) && untilNext <= BENCH_GUEST_BUSY_STEPS;
}

/**
 * Guest `g`'s action at `step`: every `BENCH_GUEST_EDIT_INTERVAL` steps it places a block
 * on the ground outside its arc, and breaks it with the next edit; a window ends with
 * every block broken again.
 */
function guestAction(g: number, step: number, steps: number): Action | null {
  const since = step - editOffset(g);
  const interval = BENCH_GUEST_EDIT_INTERVAL;
  if (since < 0 || since % interval !== 0) return null;
  const index = since / interval;
  if (index >= editCount(g, steps)) return null;
  const placeStep = step - (index % 2) * interval;
  const cell = guestCell(g, placeStep);
  return index % 2 === 0 ? { kind: 'place', ...cell, slot: 0 } : { kind: 'break', ...cell };
}

/** Chunks of the test world as generated (no edits), for the cells of the guests. */
const PLAYERS_CHUNKS = new Map<string, Uint8Array>();

function generatedBlock(x: number, y: number, z: number): number {
  const cx = toChunkCoord(x);
  const cz = toChunkCoord(z);
  const key = chunkKey(cx, cz);
  let blocks = PLAYERS_CHUNKS.get(key);
  if (!blocks) {
    blocks = generateChunk(BENCH_SEED, cx, cz, BENCH_GENERATOR_VERSION);
    PLAYERS_CHUNKS.set(key, blocks);
  }
  return blocks[blockIndex(toLocalCoord(x), y, toLocalCoord(z))];
}

/** The cell on the ground of a column is free, and so are the two above it (no leaves). */
function freeGround(x: number, y: number, z: number): boolean {
  return (
    generatedBlock(x, y, z) === Block.AIR &&
    generatedBlock(x, y + 1, z) === Block.AIR &&
    generatedBlock(x, y + 2, z) === Block.AIR
  );
}

/** Turns (radians) from the guest's direction tried for its cell: straight out first. */
const CELL_TURNS: readonly number[] = [
  0,
  ...Array.from({ length: 16 }, (_, i) => [-(i + 1) * 0.05, (i + 1) * 0.05]).flat(),
];

/**
 * The cell a guest places a block in at `step`: on the ground outside its arc, where the
 * generated world has nothing (a little further out, or to the side, next to a tree).
 */
export function guestCell(g: number, step: number): { x: number; y: number; z: number } {
  const { a } = guestAngle(g, step);
  const placeAt = guestWalk(g, step);
  const breakAt = guestWalk(g, step + BENCH_GUEST_EDIT_INTERVAL);
  // Within reach from where it places and from where it breaks, with room to spare.
  const near = (cell: { x: number; y: number; z: number }, p: typeof placeAt): boolean =>
    Math.hypot(cell.x + 0.5 - p.x, cell.y + 0.5 - p.y - 1.62, cell.z + 0.5 - p.z) <= 5.5;
  // No guest stands in the cell when it is placed.
  const free = (cell: { x: number; z: number }): boolean =>
    BENCH_GUEST_RADII.every((_, h) => {
      const o = guestWalk(h, step);
      return Math.abs(o.x - cell.x - 0.5) > 1 || Math.abs(o.z - cell.z - 0.5) > 1;
    });
  const radius = BENCH_GUEST_RADII[g];
  // Outward offsets between this arc and the next, then turns to either side.
  let first: { x: number; y: number; z: number } | null = null;
  for (const turn of CELL_TURNS) {
    for (const out of [1.5, 1, 2]) {
      const p = arcPoint(radius + out, a + turn);
      const x = Math.floor(p.x);
      const z = Math.floor(p.z);
      const cell = { x, y: PLAYERS_TERRAIN.heightAt(x, z) + 1, z };
      first ??= cell;
      const ok =
        freeGround(cell.x, cell.y, cell.z) &&
        near(cell, placeAt) &&
        near(cell, breakAt) &&
        free(cell);
      if (ok) return cell;
    }
  }
  // Never reached on the scenario's route (the tests place every cell).
  return first ?? { x: 0, y: 0, z: 0 };
}

/** The three simulated guests of `players`. */
export const PLAYERS_GUESTS: GuestScript = {
  looks: BENCH_GUEST_LOOKS,
  pose: (g, step, steps) => guestPose(g, step, steps),
  action: (g, step, steps) => (step < 0 ? null : guestAction(g, step, steps)),
};

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
  {
    id: 'torches',
    version: 1,
    label: 'torches at night',
    steps: 1200,
    start: { ...TORCH_HOVER, yaw: 0, pitch: -30 * DEG, mode: 'fly' },
    time: TORCH_TIME,
    input: (step, steps) => (step >= torchMoveStart(steps) ? PASS_INPUT : NO_INPUT),
    action: torchAction,
  },
  {
    id: 'players',
    version: 1,
    label: 'four players',
    steps: 1200,
    start: { ...BENCH_SPAWN, yaw: PLAYERS_YAW, pitch: PLAYERS_PITCH, mode: 'walk' },
    input: () => NO_INPUT,
    action: noAction,
    guests: PLAYERS_GUESTS,
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
