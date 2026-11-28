// Chests in rooms (Phase 8 part B3a): states in the snapshot, `chest` and `viewers`
// messages, races for one stack, a soak with a chest the host has not loaded, traffic.
import { describe, expect, it } from 'vitest';
import type { Action } from '../actions/actions';
import type { GameMode, ItemStack, PlayerRecord } from '../actions/playerRecord';
import { CHEST_SLOTS, INVENTORY_SLOTS } from '../game/config';
import { Rig, type RigGuest } from '../testing/netRig';
import { mulberry32, randInt } from '../util/rng';
import { Block } from '../world/blocks';
import { type ChestState, emptyChest } from '../world/blockState';
import type { World } from '../world/World';
import { TrafficMeter, countedNetwork } from './traffic';

interface Cell {
  x: number;
  y: number;
  z: number;
}

const stone = (count: number): ItemStack => ({ item: Block.STONE, count });

async function until(rig: Rig, check: () => boolean, maxMs = 10_000): Promise<void> {
  for (let t = 0; t < maxMs; t += 10) {
    if (check()) return;
    await rig.run(10);
  }
  throw new Error('condition not reached');
}

/** A room with `guests` guests who all stand around a chest next to the host. */
async function chestRoom(
  guests: number,
  mode: GameMode = 'gathering',
  given?: Rig,
): Promise<{ rig: Rig; gs: RigGuest[]; chest: Cell }> {
  // A rig given by the caller has opened its room itself.
  const rig = given ?? new Rig({ mode });
  if (!given) await rig.open();
  const gs: RigGuest[] = [];
  for (let i = 0; i < guests; i++) {
    const g = rig.guest();
    expect(await rig.join(g, 5000)).toBeNull();
    gs.push(g);
  }
  const p = rig.hostPose;
  const chest = { x: Math.floor(p.x) + 2, y: Math.floor(p.y) + 1, z: Math.floor(p.z) };
  hostSet(rig, chest, Block.CHEST);
  gs.forEach((g, i) =>
    standAt(rig, g, { x: chest.x - 1.5 + (i % 2) * 3, y: p.y, z: chest.z + 0.5 }),
  );
  await rig.run(200);
  return { rig, gs, chest };
}

/** Sets a block on the host past the action layer; the guests get it as a host edit. */
function hostSet(rig: Rig, c: Cell, id: number): void {
  rig.world.setBlock(c.x, c.y, c.z, id);
  rig.host.broadcastBlocks([{ ...c, id }]);
}

function standAt(rig: Rig, g: RigGuest, at: { x: number; y: number; z: number }): void {
  g.client.setPose({ ...at, yaw: 0, pitch: 0 }, rig.net.nowMs);
}

/** Gives a player slots on the host (the test tool behind `give`); id 1 is the host. */
function give(rig: Rig, g: RigGuest | null, stacks: Record<number, ItemStack>): void {
  const fill = (record: PlayerRecord): PlayerRecord => {
    const slots = [...record.slots];
    for (const [slot, stack] of Object.entries(stacks)) slots[Number(slot)] = stack;
    return { ...record, slots };
  };
  if (!g) {
    rig.host.local.replaceRecord(fill(rig.host.hostRecord));
    return;
  }
  const door = rig.host.guestRecordDoor(g.client.selfId ?? -1);
  if (!door) throw new Error('no guest');
  door.replaceRecord(fill(door.record));
}

function recordOf(rig: Rig, g: RigGuest | null): PlayerRecord {
  if (!g) return rig.host.hostRecord;
  const door = rig.host.guestRecordDoor(g.client.selfId ?? -1);
  if (!door) throw new Error('no guest');
  return door.record;
}

function chestIn(world: World | null, c: Cell): ChestState | null {
  return (world?.storedState(c.x, c.y, c.z) ?? null) as ChestState | null;
}

/** Every item of every player and in the given chests, by item id. */
function totals(rig: Rig, cells: readonly Cell[]): Map<number, number> {
  const out = new Map<number, number>();
  const add = (stack: ItemStack | null | undefined): void => {
    if (stack) out.set(stack.item, (out.get(stack.item) ?? 0) + stack.count);
  };
  for (const stack of rig.host.hostRecord.slots) add(stack);
  for (const g of rig.guests) for (const stack of recordOf(rig, g).slots) add(stack);
  for (const c of cells)
    for (const stack of rig.world.getState(c.x, c.y, c.z)?.slots ?? []) add(stack);
  return out;
}

function lastResult(g: RigGuest) {
  return g.answers.at(-1)?.result;
}

describe('chests in rooms (Phase 8B3a 6.5)', () => {
  it('Phase 8B3a AC3.1: a guest who joins late gets every state; hashes are equal', async () => {
    const { rig, chest } = await chestRoom(0);
    give(rig, null, { 0: stone(40), 1: { item: Block.LOG, count: 9 } });
    rig.host.local.submit({
      kind: 'chestMove',
      ...chest,
      from: 0,
      fromChest: false,
      to: 4,
      toChest: true,
      item: 3,
    });
    rig.host.local.submit({ kind: 'quickMove', ...chest, slot: 1, fromChest: false, item: 5 });
    // A second chest, stored explicitly empty, in a chunk the guest generates later.
    const other = { x: chest.x - 3, y: chest.y, z: chest.z };
    hostSet(rig, other, Block.CHEST);
    give(rig, null, { 2: { item: Block.CHEST, count: 1 } });
    rig.host.local.submit({ kind: 'break', ...other });
    await rig.run(50);
    expect(chestIn(rig.world, chest)?.slots.slice(0, 5)).toEqual([
      { item: Block.LOG, count: 9 },
      null,
      null,
      null,
      stone(40),
    ]);
    const g = rig.guest();
    expect(await rig.join(g, 5000)).toBeNull();
    expect(chestIn(g.world, chest)).toEqual(chestIn(rig.world, chest));
    expect(rig.guestHash(g)).toBe(rig.hostHash());
    expect(g.world?.verifyLight()).toBe(0);
  });

  it('Phase 8B3a AC3.2: both players see each move at once; a race gives the stack to one', async () => {
    const { rig, gs, chest } = await chestRoom(2);
    const [a, b] = gs;
    give(rig, a, { 0: stone(30) });
    give(rig, b, { 0: { item: Block.PLANKS, count: 5 } });
    await rig.run(100);
    a.client.submit({
      kind: 'chestMove',
      ...chest,
      from: 0,
      fromChest: false,
      to: 0,
      toChest: true,
      item: 3,
    });
    await until(rig, () => chestIn(b.world, chest)?.slots[0]?.count === 30);
    expect(b.states.at(-1)).toEqual([{ ...chest, state: chestIn(rig.world, chest) }]);
    expect(chestIn(a.world, chest)).toEqual(chestIn(rig.world, chest));
    const before = totals(rig, [chest]);
    // Both take the stack in the same moment.
    a.client.submit({ kind: 'quickMove', ...chest, slot: 0, fromChest: true, item: 3 });
    b.client.submit({
      kind: 'chestMove',
      ...chest,
      from: 0,
      fromChest: true,
      to: 3,
      toChest: false,
      item: 3,
    });
    await until(rig, () => a.answers.length === 2 && b.answers.length === 1);
    const reasons = [lastResult(a), lastResult(b)].map((r) => (r?.ok ? 'ok' : r?.reason)).sort();
    expect(reasons).toEqual(['missing', 'ok']);
    await rig.run(200);
    expect(totals(rig, [chest])).toEqual(before);
    expect(rig.guestHash(a)).toBe(rig.hostHash());
    expect(rig.guestHash(b)).toBe(rig.hostHash());
    expect(countOf(recordOf(rig, a), Block.STONE) + countOf(recordOf(rig, b), Block.STONE)).toBe(
      30,
    );
  });

  it('Phase 8B3a AC3.4: notEmpty reaches a guest; an emptied chest breaks and is gone everywhere', async () => {
    const { rig, gs, chest } = await chestRoom(1, 'creative');
    const [g] = gs;
    give(rig, g, { 0: stone(1) });
    await rig.run(100);
    g.client.submit({
      kind: 'chestMove',
      ...chest,
      from: 0,
      fromChest: false,
      to: 9,
      toChest: true,
      item: 3,
    });
    await rig.run(100);
    g.client.submit({ kind: 'break', ...chest });
    await until(rig, () => g.answers.length === 2);
    expect(lastResult(g)).toEqual({ ok: false, reason: 'notEmpty' });
    g.client.submit({ kind: 'takeAll', ...chest });
    g.client.submit({ kind: 'break', ...chest });
    await until(rig, () => g.answers.length === 4);
    expect(lastResult(g)?.ok).toBe(true);
    await rig.run(100);
    expect(g.world?.getBlock(chest.x, chest.y, chest.z)).toBe(Block.AIR);
    expect(g.world?.states.size).toBe(0);
    expect(g.states.at(-1)).toEqual([{ ...chest, state: null }]);
    expect(rig.guestHash(g)).toBe(rig.hostHash());
  });

  it('Phase 8B3a AC3.6: viewers reach each viewer on open, close, leave and break', async () => {
    const { rig, gs, chest } = await chestRoom(2, 'creative');
    const [a, b] = gs;
    const idA = a.client.selfId ?? -1;
    const idB = b.client.selfId ?? -1;
    a.client.submit({ kind: 'openChest', ...chest });
    await until(rig, () => a.viewers.length === 1);
    expect(a.viewers[0]).toEqual({ ...chest, ids: [idA] });
    rig.host.local.submit({ kind: 'openChest', ...chest });
    await until(rig, () => a.viewers.length === 2);
    expect(a.viewers[1].ids).toEqual([1, idA]);
    expect(rig.hostViewers.at(-1)?.ids).toEqual([1, idA]);
    b.client.submit({ kind: 'openChest', ...chest });
    await until(rig, () => b.viewers.length === 1);
    expect([...b.viewers[0].ids].sort()).toEqual([1, idA, idB].sort());
    await until(rig, () => a.viewers.at(-1)?.ids.length === 3);
    // b leaves: the others learn it.
    const heard = rig.hostViewers.length;
    b.client.leave();
    await until(rig, () => rig.hostViewers.length > heard && a.viewers.at(-1)?.ids.length === 2);
    expect(rig.hostViewers.at(-1)?.ids).toEqual([1, idA]);
    expect(a.viewers.at(-1)?.ids).toEqual([1, idA]);
    // The host closes.
    rig.host.local.submit({ kind: 'closeChest' });
    await until(rig, () => a.viewers.at(-1)?.ids.length === 1);
    expect(rig.host.viewersOf(chest.x, chest.y, chest.z)).toEqual([idA]);
    // The host breaks the (empty) chest: a has nothing open any more.
    rig.host.local.submit({ kind: 'break', ...chest });
    await until(rig, () => a.viewers.at(-1)?.ids.length === 0);
    expect(rig.host.viewersOf(chest.x, chest.y, chest.z)).toEqual([]);
    // A new openChest replaces the one before (a chest elsewhere).
    const other = { x: chest.x, y: chest.y + 1, z: chest.z };
    hostSet(rig, other, Block.CHEST);
    hostSet(rig, chest, Block.CHEST);
    a.client.submit({ kind: 'openChest', ...chest });
    a.client.submit({ kind: 'openChest', ...other });
    await until(rig, () => a.viewers.at(-1)?.y === other.y);
    expect(rig.host.viewersOf(chest.x, chest.y, chest.z)).toEqual([]);
    expect(rig.host.viewersOf(other.x, other.y, other.z)).toEqual([idA]);
  });
});

function countOf(record: PlayerRecord, item: number): number {
  return record.slots.reduce((sum, s) => sum + (s?.item === item ? s.count : 0), 0);
}

describe('a soak of chest actions (Phase 8B3a AC3.3)', () => {
  it('host and three guests, 1 000 random actions, a chest the host has not loaded', async () => {
    const { rig, gs, chest } = await chestRoom(3);
    // A chest about 100 blocks away, in a chunk nobody has loaded; the third guest stands there.
    const far = { x: chest.x + 100, y: 100, z: chest.z };
    expect(rig.world.hasChunk(Math.floor(far.x / 16), Math.floor(far.z / 16))).toBe(false);
    hostSet(rig, far, Block.CHEST);
    standAt(rig, gs[2], { x: far.x - 1.5, y: far.y - 1, z: far.z + 0.5 });
    const players: (RigGuest | null)[] = [null, ...gs];
    players.forEach((p, i) =>
      give(rig, p, {
        0: stone(60 + i),
        1: { item: Block.LOG, count: 20 },
        10: { item: Block.PLANKS, count: 99 },
        20: { item: Block.DIRT, count: 7 },
      }),
    );
    await rig.run(300);
    const cells = [chest, far];
    const before = totals(rig, cells);
    const rng = mulberry32(2026);
    const answered = (): number =>
      rig.hostAnswers.length + gs.reduce((sum, g) => sum + g.answers.length, 0);
    for (let i = 0; i < 1000; i++) {
      const who = randInt(rng, 4);
      const player = players[who];
      const cell = who === 3 ? far : chest;
      // Each player acts on its own view: the guest's world and record.
      const record = player ? player.client.record : rig.host.local.record;
      const view = player ? chestIn(player.world, cell) : chestIn(rig.world, cell);
      const slots = view?.slots ?? emptyChest().slots;
      const fromChest = randInt(rng, 2) === 0;
      // Mostly a slot the player sees filled; sometimes any slot (then mostly `missing`).
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
    console.log(`AC3.3: ${accepted} of 1000 actions accepted`);
    expect(accepted).toBeGreaterThan(300);
    expect(totals(rig, cells)).toEqual(before);
    for (const g of gs) {
      expect(rig.guestHash(g)).toBe(rig.hostHash());
      for (const c of cells) expect(chestIn(g.world, c)).toEqual(chestIn(rig.world, c));
      expect(g.client.record.slots).toEqual(recordOf(rig, g).slots);
    }
    // Nothing of the far chunk was loaded on the host; its state lives in `World.states`.
    expect(rig.world.hasChunk(Math.floor(far.x / 16), Math.floor(far.z / 16))).toBe(false);
    expect(rig.world.storedState(far.x, far.y, far.z)).not.toBeNull();
    expect(rig.world.verifyLight()).toBe(0);
  });
});

describe('the traffic of chests (Phase 8B3a AC3.5)', () => {
  it('four moving players, every guest moving twice a second in one chest: below 20 kB/s', async () => {
    const rig = new Rig({ mode: 'gathering' });
    const meter = new TrafficMeter(() => rig.net.nowMs);
    const counted = countedNetwork(
      { signaling: () => rig.net.signaling(), directory: rig.net.directory() },
      meter,
    );
    const hostSignaling = counted.signaling();
    hostSignaling.onConnection = (conn) => rig.host.accept(conn);
    await rig.settle(hostSignaling.open('mc-test123-r-ABCDEF'));
    const { gs, chest } = await chestRoom(3, 'gathering', rig);
    gs.forEach((g, i) => give(rig, g, { 0: { item: Block.LOG + i, count: 50 } }));
    await rig.run(300);
    const base = { x: chest.x + 0.5, y: rig.hostPose.y, z: chest.z + 0.5 };
    const sentBefore = meter.outBytes;
    const start = rig.net.nowMs;
    for (let step = 0; step < 600; step++) {
      const t = rig.net.nowMs;
      rig.hostPose = circlePose(base, 0, t);
      gs.forEach((g, i) => {
        g.client.setPose(circlePose(base, i + 1, t), t);
        if (step % 30 === i * 10) {
          // Back and forth between slot 0 and the chest slot of this guest.
          const inChest = chestIn(g.world, chest)?.slots[i];
          const action: Action = inChest
            ? {
                kind: 'chestMove',
                ...chest,
                from: i,
                fromChest: true,
                to: 0,
                toChest: false,
                item: inChest.item,
              }
            : {
                kind: 'chestMove',
                ...chest,
                from: 0,
                fromChest: false,
                to: i,
                toChest: true,
                item: Block.LOG + i,
              };
          g.client.submit(action);
        }
      });
      await rig.run(10);
      await rig.run(7, true);
    }
    await rig.run(200);
    const seconds = (rig.net.nowMs - start) / 1000;
    const bytesPerS = (meter.outBytes - sentBefore) / seconds;
    console.log(`AC3.5: host sends ${(bytesPerS / 1024).toFixed(2)} kB/s`);
    expect(bytesPerS).toBeLessThan(20 * 1024);
    const moved = gs.flatMap((g) => g.answers.filter((a) => a.result.ok)).length;
    expect(moved).toBeGreaterThanOrEqual(50);
    for (const g of gs) expect(rig.guestHash(g)).toBe(rig.hostHash());
  });
});

/** A pose on a circle around the chest, within reach (radius 1.5 to 3). */
function circlePose(base: { x: number; y: number; z: number }, i: number, t: number) {
  const a = t / 1000 + (i * Math.PI) / 2;
  return {
    x: base.x + Math.cos(a) * (1.5 + i * 0.5),
    y: base.y,
    z: base.z + Math.sin(a) * (1.5 + i * 0.5),
    yaw: a,
    pitch: 0.1 * i,
  };
}

describe('stores in rooms (Phase 8B3a AC6.2)', () => {
  it("a guest's stores count for the host's book; taking out does not subtract", async () => {
    // Chapters 1 and 2 done: chapter 3, with task 21, is open.
    const rig = new Rig({
      mode: 'gathering',
      progress: { done: [1, 2, 3, 4, 5, 6, 7, 8], counts: [] },
    });
    await rig.open();
    const { gs, chest } = await chestRoom(1, 'gathering', rig);
    const [g] = gs;
    give(rig, g, { 9: stone(20) });
    await rig.run(100);
    g.client.submit({ kind: 'quickMove', ...chest, slot: 9, fromChest: false, item: Block.STONE });
    await until(rig, () => g.answers.length >= 1);
    expect(lastResult(g)?.ok).toBe(true);
    expect(rig.host.progress.counts).toContainEqual({ task: 21, count: 20 });
    g.client.submit({ kind: 'quickMove', ...chest, slot: 0, fromChest: true, item: Block.STONE });
    await until(rig, () => g.answers.length >= 2);
    expect(lastResult(g)?.ok).toBe(true);
    expect(rig.host.progress.counts).toContainEqual({ task: 21, count: 20 });
    expect(rig.world.verifyLight()).toBe(0);
  });
});
