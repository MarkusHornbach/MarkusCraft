// Loot chests in rooms (Phase 8 part B3b, AC3.1): host and guests diff and patch against
// the derived contents of an untouched loot chest, so they always hold the same slots.
import { describe, expect, it } from 'vitest';
import type { Action } from '../actions/actions';
import type { ItemStack, PlayerRecord } from '../actions/playerRecord';
import { CHEST_SLOTS, INVENTORY_SLOTS } from '../game/config';
import { Rig, type RigGuest } from '../testing/netRig';
import { mulberry32, randInt } from '../util/rng';
import { Block } from '../world/blocks';
import type { BlockState } from '../world/blockState';
import { type Shaft, shaftChestCell } from '../world/generation/shafts';
import { getTerrain } from '../world/generation/terrain';
import type { TerrainV4 } from '../world/generation/terrainV4';
import type { World } from '../world/World';

interface Cell {
  x: number;
  y: number;
  z: number;
}

const GEN4 = { version: 4, options: { terrain: 'balanced', trees: 'few' } } as const;
const terrain = getTerrain(1337, GEN4) as TerrainV4;

function spawnShaft(): Shaft {
  const s = terrain.shafts.spawnShaft();
  if (!s) throw new Error('no spawn shaft');
  return s;
}

/** The nearest grid shaft to the spawn shaft (in chunks nobody has loaded). */
function gridShaft(): Shaft {
  const own = spawnShaft();
  const grid = terrain.shafts
    .shaftsIn(own.x - 400, own.z - 400, own.x + 400, own.z + 400)
    .filter((s) => !s.spawn)
    .sort((a, b) => Math.hypot(a.x - own.x, a.z - own.z) - Math.hypot(b.x - own.x, b.z - own.z));
  return grid[0];
}

async function until(rig: Rig, check: () => boolean, maxMs = 10_000): Promise<void> {
  for (let t = 0; t < maxMs; t += 10) {
    if (check()) return;
    await rig.run(10);
  }
  throw new Error('condition not reached');
}

/** A standing pose in the chamber next to a chest cell. */
function by(c: Cell): { x: number; y: number; z: number; yaw: number; pitch: number } {
  return { x: c.x + 1.5, y: c.y, z: c.z - 0.5, yaw: 0, pitch: 0 };
}

/** The chest as a world reads it: stored, else derived (loaded or not). */
function viewOf(world: World | null, c: Cell): BlockState | null {
  return world?.stateFor(Block.CHEST, c.x, c.y, c.z) ?? null;
}

function recordOf(rig: Rig, g: RigGuest | null): PlayerRecord {
  if (!g) return rig.host.hostRecord;
  const door = rig.host.guestRecordDoor(g.client.selfId ?? -1);
  if (!door) throw new Error('no guest');
  return door.record;
}

function lastResult(g: RigGuest) {
  return g.answers.at(-1)?.result;
}

/** An Adventure room in a generator 4 world; the host and every guest stand by the spawn chest. */
async function lootRoom(guests: number): Promise<{ rig: Rig; gs: RigGuest[]; chest: Cell }> {
  const rig = new Rig({ mode: 'gathering', gen: GEN4 });
  const chest = shaftChestCell(spawnShaft());
  rig.hostPose = by(chest);
  await rig.open();
  const gs: RigGuest[] = [];
  for (let i = 0; i < guests; i++) {
    const g = rig.guest();
    expect(await rig.join(g, 5000)).toBeNull();
    g.client.setPose(by(chest), rig.net.nowMs);
    gs.push(g);
  }
  await rig.run(200);
  return { rig, gs, chest };
}

describe('loot chests in rooms (Phase 8B3b 6.4)', () => {
  it('Phase 8B3b AC3.1 a guest takes one stack of an untouched loot chest; all hold the same slots', async () => {
    const { rig, gs, chest } = await lootRoom(2);
    const [a, b] = gs;
    // Untouched: nothing stored anywhere, everyone derives the same loot.
    expect(rig.world.storedState(chest.x, chest.y, chest.z)).toBeNull();
    const loot = viewOf(rig.world, chest);
    expect(loot).toEqual(terrain.lootAt(chest.x, chest.y, chest.z));
    expect(viewOf(a.world, chest)).toEqual(loot);
    const slot = loot?.slots.findIndex((s) => s !== null) ?? -1;
    const item = loot?.slots[slot]?.item ?? 0;
    a.client.submit({ kind: 'quickMove', ...chest, slot, fromChest: true, item });
    await until(rig, () => a.answers.length === 1);
    expect(lastResult(a)?.ok).toBe(true);
    await rig.run(200);
    const host = viewOf(rig.world, chest);
    expect(host?.slots[slot]).toBeNull();
    // The emptied slot is empty for both guests too: the host sent it as count 0.
    for (const g of gs) {
      expect(viewOf(g.world, chest)).toEqual(host);
      expect(rig.guestHash(g)).toBe(rig.hostHash());
    }
    expect(b.states.at(-1)?.[0].state).toEqual(host);
    expect(host?.slots.filter((s) => s !== null).length).toBe(
      (loot?.slots.filter((s) => s !== null).length ?? 0) - 1,
    );
  });

  it('Phase 8B3b AC3.1 a move inside the chest that empties a slot shows as empty on the guest', async () => {
    const { rig, gs, chest } = await lootRoom(1);
    const [g] = gs;
    const loot = viewOf(rig.world, chest);
    const from = loot?.slots.findIndex((s) => s !== null) ?? -1;
    const to = loot?.slots.findIndex((s) => s === null) ?? -1;
    rig.host.local.submit({
      kind: 'chestMove',
      ...chest,
      from,
      fromChest: true,
      to,
      toChest: true,
      item: loot?.slots[from]?.item ?? 0,
    });
    await rig.run(200);
    const host = viewOf(rig.world, chest);
    expect(host?.slots[from]).toBeNull();
    expect(host?.slots[to]).toEqual(loot?.slots[from]);
    expect(viewOf(g.world, chest)).toEqual(host);
    expect(rig.guestHash(g)).toBe(rig.hostHash());
  });

  it('Phase 8B3b AC3.1 two guests race for one loot stack: one gets it, the other missing', async () => {
    const { rig, gs, chest } = await lootRoom(2);
    const [a, b] = gs;
    const loot = viewOf(rig.world, chest);
    const slot = loot?.slots.findIndex((s) => s !== null) ?? -1;
    const item = loot?.slots[slot]?.item ?? 0;
    a.client.submit({ kind: 'quickMove', ...chest, slot, fromChest: true, item });
    b.client.submit({ kind: 'quickMove', ...chest, slot, fromChest: true, item });
    await until(rig, () => a.answers.length === 1 && b.answers.length === 1);
    const reasons = [lastResult(a), lastResult(b)].map((r) => (r?.ok ? 'ok' : r?.reason)).sort();
    expect(reasons).toEqual(['missing', 'ok']);
    await rig.run(200);
    for (const g of gs) {
      expect(viewOf(g.world, chest)).toEqual(viewOf(rig.world, chest));
      expect(rig.guestHash(g)).toBe(rig.hostHash());
    }
  });

  it('Phase 8B3b AC3.1 a guest who joins late reads the same contents, touched or not', async () => {
    const { rig, gs, chest } = await lootRoom(1);
    const [a] = gs;
    const far = shaftChestCell(gridShaft());
    a.client.submit({ kind: 'takeAll', ...chest });
    await until(rig, () => a.answers.length === 1);
    expect(lastResult(a)?.ok).toBe(true);
    await rig.run(200);
    const late = rig.guest();
    expect(await rig.join(late, 5000)).toBeNull();
    await rig.run(200);
    // Touched: the snapshot carries the stored (empty) chest.
    expect(viewOf(late.world, chest)).toEqual(viewOf(rig.world, chest));
    expect(viewOf(late.world, chest)?.slots.every((s) => s === null)).toBe(true);
    // Untouched: not in the snapshot; the late guest derives the same loot.
    expect(late.world?.storedState(far.x, far.y, far.z)).toBeNull();
    expect(viewOf(late.world, far)).toEqual(viewOf(rig.world, far));
    expect(viewOf(late.world, far)).toEqual(terrain.lootAt(far.x, far.y, far.z));
    expect(rig.guestHash(late)).toBe(rig.hostHash());
  });
});

describe('a soak on loot chests (Phase 8B3b AC3.1, as B3a AC3.3)', () => {
  it('host and three guests, 1 000 random actions, two loot chests (one the host has not loaded)', async () => {
    const { rig, gs, chest } = await lootRoom(3);
    const far = shaftChestCell(gridShaft());
    expect(rig.world.hasChunk(Math.floor(far.x / 16), Math.floor(far.z / 16))).toBe(false);
    gs[2].client.setPose(by(far), rig.net.nowMs);
    const players: (RigGuest | null)[] = [null, ...gs];
    players.forEach((p, i) => {
      const fill = (record: PlayerRecord): PlayerRecord => {
        const slots = [...record.slots];
        const stacks: Record<number, ItemStack> = {
          0: { item: Block.STONE, count: 60 + i },
          10: { item: Block.PLANKS, count: 99 },
        };
        for (const [slot, stack] of Object.entries(stacks)) slots[Number(slot)] = stack;
        return { ...record, slots };
      };
      if (!p) rig.host.local.replaceRecord(fill(rig.host.hostRecord));
      else {
        const door = rig.host.guestRecordDoor(p.client.selfId ?? -1);
        if (!door) throw new Error('no guest');
        door.replaceRecord(fill(door.record));
      }
    });
    await rig.run(300);
    const cells = [chest, far];
    const totals = (): Map<number, number> => {
      const out = new Map<number, number>();
      const add = (s: ItemStack | null | undefined): void => {
        if (s) out.set(s.item, (out.get(s.item) ?? 0) + s.count);
      };
      for (const s of rig.host.hostRecord.slots) add(s);
      for (const g of rig.guests) for (const s of recordOf(rig, g).slots) add(s);
      for (const c of cells) for (const s of viewOf(rig.world, c)?.slots ?? []) add(s);
      return out;
    };
    const before = totals();
    const rng = mulberry32(2027);
    const answered = (): number =>
      rig.hostAnswers.length + gs.reduce((sum, g) => sum + g.answers.length, 0);
    for (let i = 0; i < 1000; i++) {
      const who = randInt(rng, 4);
      const player = players[who];
      const cell = who === 3 ? far : chest;
      const record = player ? player.client.record : rig.host.local.record;
      const slots = viewOf(player ? player.world : rig.world, cell)?.slots ?? [];
      const fromChest = randInt(rng, 2) === 0;
      const side = fromChest ? slots : record.slots;
      const filled = side.flatMap((stack, slot) => (stack ? [slot] : []));
      const from =
        filled.length > 0 && randInt(rng, 5) > 0
          ? filled[randInt(rng, filled.length)]
          : randInt(rng, fromChest ? CHEST_SLOTS : INVENTORY_SLOTS);
      const item = side[from]?.item ?? 3;
      const roll = randInt(rng, 10);
      let action: Action;
      if (roll < 6) {
        const toChest = randInt(rng, 2) === 0;
        const to = randInt(rng, toChest ? CHEST_SLOTS : INVENTORY_SLOTS);
        action = { kind: 'chestMove', ...cell, from, fromChest, to, toChest, item };
      } else if (roll < 9) {
        action = { kind: 'quickMove', ...cell, slot: from, fromChest, item };
      } else {
        action = { kind: 'takeAll', ...cell };
      }
      if (player) player.client.submit(action);
      else rig.host.local.submit(action);
      await rig.run(10);
    }
    await until(rig, () => answered() >= 1000, 20_000);
    await rig.run(500);
    const accepted =
      rig.hostAnswers.filter((a) => a.result.ok).length +
      gs.reduce((sum, g) => sum + g.answers.filter((a) => a.result.ok).length, 0);
    expect(accepted).toBeGreaterThan(300);
    expect(totals()).toEqual(before);
    for (const g of gs) {
      expect(rig.guestHash(g)).toBe(rig.hostHash());
      for (const c of cells) expect(viewOf(g.world, c)).toEqual(viewOf(rig.world, c));
      expect(g.client.record.slots).toEqual(recordOf(rig, g).slots);
    }
    expect(rig.world.hasChunk(Math.floor(far.x / 16), Math.floor(far.z / 16))).toBe(false);
    expect(rig.world.storedState(far.x, far.y, far.z)).not.toBeNull();
  });
});
