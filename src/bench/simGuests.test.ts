import { describe, expect, it } from 'vitest';
import type { Action } from '../actions/actions';
import { createPlayerRecord } from '../actions/playerRecord';
import { BENCH_SEED, BENCH_WARMUP_STEPS } from '../game/config';
import { Block } from '../world/blocks';
import { getTerrain } from '../world/generation/terrain';
import { World } from '../world/World';
import { PLAYERS_GUESTS, getScenario } from './scenarios';
import { SimRoom } from './simGuests';

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Every action of the guests' script in a window of `steps`, in the order they come. */
function scriptActions(steps: number): { step: number; guest: number; action: Action }[] {
  const out: { step: number; guest: number; action: Action }[] = [];
  for (let step = -BENCH_WARMUP_STEPS; step < steps; step++) {
    for (let g = 0; g < PLAYERS_GUESTS.looks.length; g++) {
      const action = PLAYERS_GUESTS.action(g, step, steps);
      if (action) out.push({ step, guest: g, action });
    }
  }
  return out;
}

/** Plays a window of `players` with the real sessions over the memory transport. */
async function play(steps: number) {
  const scenario = getScenario('players');
  if (!scenario?.guests) throw new Error('no players scenario');
  const world = new World(BENCH_SEED, 1);
  for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) world.generate(cx, cz);
  for (let cz = -2; cz <= 2; cz++) for (let cx = -2; cx <= 2; cx++) world.light(cx, cz);
  const before = new Map<string, Uint8Array>();
  for (const chunk of world.allChunks())
    before.set(`${chunk.cx},${chunk.cz}`, chunk.blocks.slice());
  const s = scenario.start;
  let changes = 0;
  const room = new SimRoom({
    world,
    hostPose: () => ({ x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: s.pitch }),
    hostRecord: createPlayerRecord('creative'),
    script: scenario.guests,
    onBlocks: (c) => {
      changes += c.length;
    },
  });
  for (let i = 0; i < 50 && !room.ready; i++) {
    room.frame();
    await flush();
  }
  expect(room.ready).toBe(true);
  let busySeen = 0;
  const flags = new Set<string>();
  for (let step = -BENCH_WARMUP_STEPS; step < steps; step++) {
    room.step(step, steps);
    for (const p of room.roster.list()) {
      if (p.busy) flags.add(`${p.id}`);
    }
    if (room.roster.list().some((p) => p.busy)) busySeen++;
  }
  const players = room.roster.list();
  room.close();
  return { room, world, before, changes, players, busySeen, flags };
}

describe('the scenario players (Phase 6 AC15.1)', () => {
  it('Phase 6 AC15.1: three guests walk and edit; every action is accepted and the world ends as it began', async () => {
    const run = await play(1200);
    const actions = scriptActions(1200);
    // Two edits a second for each guest for 20 s, places and breaks in pairs.
    expect(actions.length).toBe(120);
    expect(actions.every((a) => a.step >= 0)).toBe(true);
    expect(actions.filter((a) => a.action.kind === 'place').length).toBe(60);
    expect(run.room.refusals).toEqual([]);
    expect([run.room.accepted, run.room.refused]).toEqual([120, 0]);
    expect(run.room.refused).toBe(0);
    expect(run.changes).toBe(120);
    for (const chunk of run.world.allChunks()) {
      expect(chunk.blocks, `chunk ${chunk.cx},${chunk.cz}`).toEqual(
        run.before.get(`${chunk.cx},${chunk.cz}`),
      );
    }
    expect(run.world.verifyLight()).toBe(0);
    // Three figures in three looks; each held break for a while.
    expect(run.players.map((p) => p.look)).toEqual([2, 5, 8]);
    expect(run.flags.size).toBe(3);
    expect(run.busySeen).toBeGreaterThan(100);
  });

  it('Phase 6 AC15.1: the guests do the same in every run', () => {
    expect(scriptActions(1200)).toEqual(scriptActions(1200));
    const poses = (): unknown[] =>
      [0, 1, 2].flatMap((g) =>
        [-120, 0, 333, 1199].map((step) => PLAYERS_GUESTS.pose(g, step, 1200)),
      );
    expect(poses()).toEqual(poses());
  });

  it('the guests walk on the ground in front of the player, never in water', () => {
    const terrain = getTerrain(BENCH_SEED);
    const start = getScenario('players')?.start;
    if (!start) throw new Error('no players scenario');
    for (let g = 0; g < 3; g++) {
      let travelled = 0;
      let last = PLAYERS_GUESTS.pose(g, -BENCH_WARMUP_STEPS, 1200);
      for (let step = -BENCH_WARMUP_STEPS; step < 1200; step++) {
        const p = PLAYERS_GUESTS.pose(g, step, 1200);
        expect(p.y).toBe(terrain.heightAt(Math.floor(p.x), Math.floor(p.z)) + 1);
        expect(terrain.isUnderWater(Math.floor(p.x), Math.floor(p.z))).toBe(false);
        // In front: within 45° of north (−Z) as seen from the player.
        const angle = Math.atan2(-(p.x - start.x), -(p.z - start.z));
        expect(Math.abs(angle)).toBeLessThanOrEqual(Math.PI / 4 + 1e-9);
        travelled += Math.hypot(p.x - last.x, p.z - last.z);
        last = p;
      }
      // About walking speed (4.3 blocks a second) for 22 s.
      expect(travelled).toBeGreaterThan(85);
      expect(travelled).toBeLessThan(100);
    }
  });

  it('the quick window places and breaks again, all accepted', async () => {
    const run = await play(60);
    expect(scriptActions(60).map((a) => a.action.kind)).toEqual([
      'place',
      'place',
      'place',
      'break',
      'break',
      'break',
    ]);
    expect(run.room.accepted).toBe(6);
    expect(run.room.refused).toBe(0);
    expect(run.world.verifyLight()).toBe(0);
    const edited = scriptActions(60).map((a) => a.action);
    for (const action of edited) {
      if (action.kind !== 'break') continue;
      expect(run.world.getBlock(action.x, action.y, action.z)).toBe(Block.AIR);
    }
  });

  it('a closed room does nothing more', async () => {
    const run = await play(20);
    run.room.step(0, 20);
    run.room.frame();
    run.room.close();
    expect(run.room.accepted).toBe(0);
  });
});
