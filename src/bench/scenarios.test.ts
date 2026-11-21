import { describe, expect, it } from 'vitest';
import { createPlayerRecord } from '../actions/playerRecord';
import { LocalSession } from '../actions/Session';
import type { ActionResult } from '../actions/apply';
import { BENCH_SEED, BENCH_SUITE_VERSION, BENCH_WARMUP_STEPS, SIM_DT } from '../game/config';
import { stepPlayer } from '../player/physics';
import { type PlayerState, applyLook, createPlayer } from '../player/player';
import { Block } from '../world/blocks';
import { toChunkCoord } from '../world/chunk';
import { findSpawn } from '../world/generation/spawn';
import { getTerrain } from '../world/generation/terrain';
import { World } from '../world/World';
import {
  BENCH_SPAWN,
  EDIT_CELLS,
  FLY_HEIGHT,
  PLAYERS_YAW,
  SCENARIOS,
  type Scenario,
  TORCH_CELLS,
  TORCH_HOVER,
  buildSuite,
  getScenario,
} from './scenarios';

function scenarioOf(id: string): Scenario {
  const scenario = getScenario(id);
  if (!scenario) throw new Error(`no scenario ${id}`);
  return scenario;
}

function playerAt(scenario: Scenario): PlayerState {
  const s = scenario.start;
  const p = createPlayer(s.x, s.y, s.z);
  applyLook(p, s.yaw, s.pitch);
  p.mode = s.mode;
  return p;
}

/** Generates the chunks around a position, as the game has them long before. */
function generateAround(world: World, x: number, z: number): void {
  const cx = toChunkCoord(x);
  const cz = toChunkCoord(z);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) world.generate(cx + dx, cz + dz);
  }
}

interface Route {
  /** Position when the window opens and when it closes. */
  from: { x: number; y: number; z: number };
  player: PlayerState;
  borders: number;
  /** Chunks the player was in, warm-up included. */
  chunks: Set<string>;
  world: World;
}

/** Plays warm-up and window of a scenario with the real physics. */
function play(scenario: Scenario): Route {
  const world = new World(BENCH_SEED, 1);
  const p = playerAt(scenario);
  let from = { x: p.x, y: p.y, z: p.z };
  let borders = 0;
  const chunks = new Set<string>();
  for (let step = -BENCH_WARMUP_STEPS; step < scenario.steps; step++) {
    if (step === 0) from = { x: p.x, y: p.y, z: p.z };
    generateAround(world, p.x, p.z);
    const cx = toChunkCoord(p.x);
    const cz = toChunkCoord(p.z);
    chunks.add(`${cx},${cz}`);
    stepPlayer(p, scenario.input(step, scenario.steps), world, SIM_DT);
    if (toChunkCoord(p.x) !== cx || toChunkCoord(p.z) !== cz) borders++;
  }
  return { from, player: p, borders, chunks, world };
}

describe('scenario scripts', () => {
  it('Phase 4P AC1.2: walking covers ground, crosses chunks and stays out of the water', () => {
    const walk = scenarioOf('walk');
    const route = play(walk);
    const p = route.player;
    expect(Math.hypot(p.x - walk.start.x, p.z - walk.start.z)).toBeGreaterThanOrEqual(60);
    expect(Math.hypot(p.x - route.from.x, p.z - route.from.z)).toBeGreaterThanOrEqual(60);
    expect(route.borders).toBeGreaterThanOrEqual(3);
    expect(p.inWater).toBe(false);
    expect(route.world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))).toBe(Block.AIR);
    // The same route every time.
    const again = play(walk).player;
    expect([again.x, again.y, again.z]).toEqual([p.x, p.y, p.z]);
  });

  it('the scenarios start at the start point of the test world', () => {
    const spawn = findSpawn(getTerrain(BENCH_SEED));
    expect(BENCH_SPAWN).toEqual({ x: spawn.x + 0.5, y: spawn.y, z: spawn.z + 0.5 });
    for (const id of ['stand', 'walk']) {
      const { x, y, z } = scenarioOf(id).start;
      expect({ x, y, z }).toEqual(BENCH_SPAWN);
    }
  });

  it('Phase 4P AC1.3: flying goes 380 to 400 blocks straight, high above the terrain', () => {
    const fly = scenarioOf('fly');
    const route = play(fly);
    const p = route.player;
    const distance = Math.hypot(p.x - route.from.x, p.z - route.from.z);
    expect(distance).toBeGreaterThanOrEqual(380);
    expect(distance).toBeLessThanOrEqual(400);
    // Straight north at one height, and at rest when the window closes.
    expect(p.x).toBe(fly.start.x);
    expect(p.y).toBe(FLY_HEIGHT);
    expect(p.z).toBeLessThan(route.from.z);
    expect(Math.hypot(p.vx, p.vy, p.vz)).toBe(0);
    expect(route.chunks.size).toBeGreaterThanOrEqual(25);
    for (const key of route.chunks) {
      const [cx, cz] = key.split(',').map(Number);
      const blocks = route.world.generate(cx, cz).blocks;
      let top = blocks.length - 1;
      while (top >= 0 && blocks[top] === Block.AIR) top--;
      // Layers are 256 cells; the block on top of the highest one ends at `(top >> 8) + 1`.
      expect(FLY_HEIGHT - ((top >> 8) + 1), `chunk ${key}`).toBeGreaterThanOrEqual(8);
    }
  });

  it('Phase 4P AC1.4: all edits are accepted, change light across chunks and undo themselves', () => {
    const edit = scenarioOf('edit');
    const world = new World(BENCH_SEED, 1);
    for (let cz = -3; cz <= 2; cz++) for (let cx = -3; cx <= 2; cx++) world.generate(cx, cz);
    for (let cz = -2; cz <= 1; cz++) for (let cx = -2; cx <= 1; cx++) world.light(cx, cz);
    const before = new Map<string, Uint8Array>();
    for (const chunk of world.allChunks())
      before.set(`${chunk.cx},${chunk.cz}`, chunk.blocks.slice());
    const reported = new Set<string>();
    world.onLightChange = (cx, cz, lit) => {
      expect(lit).toBe(true);
      reported.add(`${cx},${cz}`);
    };
    const results: ActionResult[] = [];
    const player = playerAt(edit);
    const session = new LocalSession(
      { world, mode: 'creative', pose: () => player, nowMs: () => 0 },
      createPlayerRecord('creative'),
      { onBlocks: () => {}, onPlayer: () => {}, onResult: (_, result) => results.push(result) },
    );
    let wide = 0;
    let actions = 0;
    for (let step = -BENCH_WARMUP_STEPS; step < edit.steps; step++) {
      // The player hovers: the script never moves it.
      expect(edit.input(step, edit.steps)).toMatchObject({ forward: 0, jump: false });
      const action = edit.action(step, edit.steps);
      if (!action) continue;
      expect(step).toBeGreaterThanOrEqual(0);
      reported.clear();
      session.submit(action);
      actions++;
      if (reported.size >= 2) wide++;
    }
    expect(actions).toBe(150);
    expect(results.length).toBe(150);
    expect(results.filter((result) => !result.ok)).toEqual([]);
    expect(wide).toBeGreaterThanOrEqual(75);
    for (const chunk of world.allChunks()) {
      expect(chunk.blocks, `chunk ${chunk.cx},${chunk.cz}`).toEqual(
        before.get(`${chunk.cx},${chunk.cz}`),
      );
    }
    expect(world.verifyLight()).toBe(0);
  });

  it('the slab of the edit scenario lies across a chunk corner', () => {
    expect(EDIT_CELLS.length).toBe(75);
    expect(new Set(EDIT_CELLS.map((c) => `${c.x},${c.z}`)).size).toBe(75);
    const chunks = new Set(EDIT_CELLS.map((c) => `${toChunkCoord(c.x)},${toChunkCoord(c.z)}`));
    expect([...chunks].sort()).toEqual(['-1,-1', '-1,0', '0,-1', '0,0']);
  });

  it('a short window places and breaks the same cells', () => {
    const edit = scenarioOf('edit');
    const kinds: string[] = [];
    for (let step = 0; step < 45; step++) {
      const action = edit.action(step, 45);
      if (action) kinds.push(action.kind);
    }
    expect(kinds).toEqual(['place', 'place', 'place', 'break', 'break', 'break']);
  });
});

describe('the torches scenario (Phase 4 AC9.8)', () => {
  /** Plays a window of `torches` with the real physics, world and action layer. */
  function playTorches(steps: number) {
    const torches = scenarioOf('torches');
    const world = new World(BENCH_SEED, 1);
    for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) world.generate(cx, cz);
    for (let cz = -2; cz <= 2; cz++) for (let cx = -2; cx <= 2; cx++) world.light(cx, cz);
    const before = new Map<string, Uint8Array>();
    for (const chunk of world.allChunks())
      before.set(`${chunk.cx},${chunk.cz}`, chunk.blocks.slice());
    const reported = new Set<string>();
    world.onLightChange = (cx, cz) => reported.add(`${cx},${cz}`);
    const results: ActionResult[] = [];
    const player = playerAt(torches);
    const session = new LocalSession(
      { world, mode: 'creative', pose: () => player, nowMs: () => 0 },
      createPlayerRecord('creative'),
      { onBlocks: () => {}, onPlayer: () => {}, onResult: (_, result) => results.push(result) },
    );
    const kinds: string[] = [];
    let lightChanges = 0;
    let moved = { x: player.x, z: player.z };
    for (let step = -BENCH_WARMUP_STEPS; step < steps; step++) {
      const action = torches.action(step, steps);
      if (action) {
        expect(step).toBeGreaterThanOrEqual(0);
        reported.clear();
        session.submit(action);
        kinds.push(action.kind);
        if (reported.size > 0) lightChanges++;
      }
      if (step === 0) moved = { x: player.x, z: player.z };
      generateAround(world, player.x, player.z);
      stepPlayer(player, torches.input(step, steps), world, SIM_DT);
    }
    return { world, results, kinds, lightChanges, player, moved, before };
  }

  it('starts at midnight above a line of open grass across a chunk border', () => {
    const torches = scenarioOf('torches');
    expect(torches.time).toBe(0.75);
    expect(torches.start).toMatchObject({ ...TORCH_HOVER, mode: 'fly' });
    const world = new World(BENCH_SEED, 1);
    for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) world.generate(cx, cz);
    for (const cell of TORCH_CELLS) {
      expect(world.getBlock(cell.x, cell.y, cell.z), `${cell.x}`).toBe(Block.AIR);
      expect(world.getBlock(cell.x, cell.y - 1, cell.z), `${cell.x}`).toBe(Block.GRASS);
    }
    const chunks = new Set(TORCH_CELLS.map((c) => toChunkCoord(c.x)));
    expect([...chunks].sort()).toEqual([-1, 0]);
  });

  it('accepts every action, changes light, keeps the light correct and ends with the line placed', () => {
    const run = playTorches(1200);
    // The torch into the bar, then 119 places and breaks.
    expect(run.kinds.length).toBe(120);
    expect(run.kinds[0]).toBe('setBarSlot');
    expect(run.results.filter((result) => !result.ok)).toEqual([]);
    expect(run.lightChanges).toBeGreaterThanOrEqual(110);
    expect(run.world.verifyLight()).toBe(0);
    for (const cell of TORCH_CELLS) {
      expect(run.world.getBlock(cell.x, cell.y, cell.z)).toBe(Block.TORCH);
    }
    // Nothing else of the world changed.
    let changed = 0;
    for (const chunk of run.world.allChunks()) {
      const old = run.before.get(`${chunk.cx},${chunk.cz}`);
      if (!old) continue;
      for (let i = 0; i < old.length; i++) if (old[i] !== chunk.blocks[i]) changed++;
    }
    expect(changed).toBe(TORCH_CELLS.length);
    // Then the player moves past the line: north and up, over it.
    expect(run.player.z).toBeLessThan(TORCH_CELLS[0].z - 10);
    expect(Math.abs(run.player.x - TORCH_HOVER.x)).toBeLessThan(1e-9);
    // The same route every time.
    const again = playTorches(1200).player;
    expect([again.x, again.y, again.z]).toEqual([run.player.x, run.player.y, run.player.z]);
  });

  it('the quick window places a part of the line, all accepted', () => {
    const run = playTorches(60);
    expect(run.kinds).toEqual(['setBarSlot', 'place', 'place', 'place', 'place', 'place']);
    expect(run.results.every((result) => result.ok)).toBe(true);
    expect(run.world.verifyLight()).toBe(0);
  });
});

describe('the scenario table (Phase 4P AC1.5)', () => {
  it('is pinned: ids, versions and steps', () => {
    expect(SCENARIOS.map((s) => [s.id, s.version, s.steps, s.label])).toEqual([
      ['stand', 1, 600, 'standing'],
      ['walk', 1, 1200, 'walking'],
      ['fly', 1, 1200, 'flying'],
      ['edit', 1, 900, 'building'],
      ['torches', 1, 1200, 'torches at night'],
      ['players', 1, 1200, 'four players'],
    ]);
    expect(SCENARIOS.map((s) => s.time ?? null)).toEqual([null, null, null, null, 0.75, null]);
    // Only `players` has simulated guests (Phase 6 AC15.1), three of them in looks 2, 5, 8.
    expect(SCENARIOS.map((s) => s.guests?.looks ?? null)).toEqual([
      null,
      null,
      null,
      null,
      null,
      [2, 5, 8],
    ]);
    expect(getScenario('players')?.start).toMatchObject({
      ...BENCH_SPAWN,
      yaw: PLAYERS_YAW,
      mode: 'walk',
    });
    expect(BENCH_SUITE_VERSION).toBe(3);
  });

  it('the full suite: both render distances, then standing once more', () => {
    const full = buildSuite('full');
    expect(full.map((e) => `${e.scenario.id}@${e.renderDistance}`)).toEqual([
      'stand@5',
      'walk@5',
      'fly@5',
      'edit@5',
      'torches@5',
      'players@5',
      'stand@8',
      'walk@8',
      'fly@8',
      'edit@8',
      'torches@8',
      'players@8',
      'stand@5',
    ]);
    expect(full.map((e) => e.steps)).toEqual([
      600, 1200, 1200, 900, 1200, 1200, 600, 1200, 1200, 900, 1200, 1200, 600,
    ]);
    expect(full.every((e) => e.warmup === 120)).toBe(true);
    // A fresh world per block.
    expect(full.map((e) => e.fresh)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it('the quick suite has the same scenarios in the same order, a twentieth as long', () => {
    const full = buildSuite('full');
    const quick = buildSuite('quick');
    expect(quick.map((e) => e.scenario.id)).toEqual(full.map((e) => e.scenario.id));
    expect(quick.map((e) => e.fresh)).toEqual(full.map((e) => e.fresh));
    expect(quick.map((e) => e.renderDistance)).toEqual([2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 2]);
    expect(quick.map((e) => e.steps)).toEqual([30, 60, 60, 45, 60, 60, 30, 60, 60, 45, 60, 60, 30]);
    expect(quick.every((e) => e.warmup === 6)).toBe(true);
  });
});
