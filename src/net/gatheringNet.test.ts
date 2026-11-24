// Gathering over the network (Phase 6 part C, step 9): timed breaking on the host's
// clock with a grace for jitter, the Gathering rules for a guest, stations far from the
// host, the authority cache and the rate limit.
import { describe, expect, it } from 'vitest';
import type { PlayerRecord } from '../actions/playerRecord';
import { ACTION_RATE_LIMIT, AUTHORITY_CACHE_CHUNKS } from '../game/config';
import { breakTimeMs } from '../items/hardness';
import { Item } from '../items/items';
import { Rig, type RigGuest, type RigOptions } from '../testing/netRig';
import { mulberry32 } from '../util/rng';
import { Block } from '../world/blocks';
import { World } from '../world/World';
import { FarReader } from './authority';
import { BreakClock, breakDueMs } from './breakTiming';

interface Cell {
  x: number;
  y: number;
  z: number;
}

async function gatheringRoom(options: RigOptions = {}): Promise<{ rig: Rig; g: RigGuest }> {
  const rig = new Rig({ mode: 'gathering', ...options });
  await rig.open();
  const g = rig.guest();
  expect(await rig.join(g, 5000)).toBeNull();
  return { rig, g };
}

function poseOf(rig: Rig, g: RigGuest) {
  const self = rig.host.players().find((p) => p.id === g.client.selfId);
  if (!self) throw new Error('guest not in the room');
  return self.pose;
}

/** A cell in front of the guest at its eye height (well within reach). */
function cellFor(rig: Rig, g: RigGuest): Cell {
  const p = poseOf(rig, g);
  return { x: Math.floor(p.x) + 2, y: Math.floor(p.y) + 1, z: Math.floor(p.z) };
}

/** Sets a block on the host past the action layer; the guests get it as a host edit. */
function hostSet(rig: Rig, c: Cell, id: number): void {
  rig.world.setBlock(c.x, c.y, c.z, id);
  rig.host.broadcastBlocks([{ ...c, id }]);
}

/** Replaces the guest's slots on the host (the test tool behind `give`). */
function setSlots(rig: Rig, g: RigGuest, change: (slots: PlayerRecord['slots'][number][]) => void) {
  const door = rig.host.guestRecordDoor(g.client.selfId ?? -1);
  if (!door) throw new Error('no guest');
  const slots = [...door.record.slots];
  change(slots);
  door.replaceRecord({ ...door.record, slots, selectedSlot: 0 });
}

async function until(rig: Rig, check: () => boolean, maxMs = 10_000): Promise<void> {
  for (let t = 0; t < maxMs; t += 10) {
    if (check()) return;
    await rig.run(10);
  }
  throw new Error('condition not reached');
}

/**
 * One break as the guest's screen does it: `startBreak`, wait for the record, wait on the
 * guest's own clock until the time is up (minus `earlyMs`), `break`; returns the answer.
 */
async function breakAsGuest(rig: Rig, g: RigGuest, c: Cell, earlyMs = 0) {
  const tool = g.client.record.slots[g.client.record.selectedSlot]?.item ?? null;
  const required = breakTimeMs(rig.world.getBlock(c.x, c.y, c.z), tool);
  if (required === null) throw new Error('unbreakable');
  const answers = g.answers.length;
  g.client.submit({ kind: 'startBreak', ...c });
  await until(rig, () => g.answers.length > answers);
  expect(g.answers.at(-1)?.result.ok).toBe(true);
  const started = g.client.record.breaking;
  if (!started) throw new Error('no break in the record');
  await until(rig, () => rig.net.nowMs >= started.startMs + required - earlyMs, required + 1000);
  g.client.submit({ kind: 'break', ...c });
  await until(rig, () => g.answers.length > answers + 1, 3000);
  return g.answers.at(-1)?.result;
}

describe('timed breaking over the network (Phase 6 AC9.1)', () => {
  const BLOCKS = [Block.DIRT, Block.SAND, Block.GRASS, Block.CLAY, Block.LEAVES, Block.GLASS];
  const TOOLS = [null, Item.WOODEN_SHOVEL, Item.STONE_SHOVEL, Item.IRON_SHOVEL];
  const HARD: [number, number][] = [
    [Block.LOG, Item.STONE_AXE],
    [Block.PLANKS, Item.WOODEN_AXE],
    [Block.STONE, Item.IRON_PICKAXE],
    [Block.COAL_ORE, Item.STONE_PICKAXE],
  ];

  it('500 breaks under seeded delays of 0–300 ms, sent when the guest clock is up, are all accepted', async () => {
    const { rig, g } = await gatheringRoom({ minDelayMs: 0, maxDelayMs: 300, netSeed: 9 });
    const c = cellFor(rig, g);
    const rng = mulberry32(21);
    let accepted = 0;
    for (let i = 0; i < 500; i++) {
      const hard = rng() < 0.2 ? HARD[Math.floor(rng() * HARD.length)] : null;
      const block = hard ? hard[0] : BLOCKS[Math.floor(rng() * BLOCKS.length)];
      const tool = hard ? hard[1] : TOOLS[Math.floor(rng() * TOOLS.length)];
      hostSet(rig, c, block);
      // Fresh slots each time: the tool in the hand, room for every drop.
      setSlots(rig, g, (slots) => {
        slots.fill(null);
        if (tool !== null) slots[0] = { item: tool, count: 1 };
      });
      await until(rig, () => (g.client.record.slots[0]?.item ?? null) === tool);
      const result = await breakAsGuest(rig, g, c);
      if (result?.ok) accepted++;
      else
        throw new Error(
          `break ${i} of ${block} with ${String(tool)} refused: ${JSON.stringify(result)}`,
        );
      expect(rig.world.getBlock(c.x, c.y, c.z)).toBe(Block.AIR);
    }
    expect(accepted).toBe(500);
    expect(rig.guestHash(g)).toBe(rig.hostHash());
  });

  it('a break sent 600 ms early is refused as early; one 300 ms early is held and accepted', async () => {
    const { rig, g } = await gatheringRoom({ minDelayMs: 40, maxDelayMs: 40 });
    const c = cellFor(rig, g);
    hostSet(rig, c, Block.LOG);
    expect(await breakAsGuest(rig, g, c, 600)).toEqual({ ok: false, reason: 'early' });
    expect(rig.world.getBlock(c.x, c.y, c.z)).toBe(Block.LOG);
    const result = await breakAsGuest(rig, g, c, 300);
    expect(result?.ok).toBe(true);
    expect(g.client.record.slots.some((s) => s?.item === Block.LOG)).toBe(true);
  });

  it("the guest's record carries its own clock's start; the host keeps its own", async () => {
    const screen = 5000;
    const rig = new Rig({ mode: 'gathering', minDelayMs: 50, maxDelayMs: 50 });
    await rig.open();
    const g = rig.guest();
    expect(await rig.join(g)).toBeNull();
    const c = cellFor(rig, g);
    hostSet(rig, c, Block.DIRT);
    // A client whose screen clock differs from the network's.
    const clock = new BreakClock();
    clock.noteSubmit({ kind: 'startBreak', ...c }, screen);
    g.client.submit({ kind: 'startBreak', ...c });
    await until(rig, () => g.client.record.breaking !== null);
    const hostStart = rig.host.guestRecordDoor(g.client.selfId ?? -1)?.record.breaking?.startMs;
    expect(hostStart).toBeGreaterThan(g.client.record.breaking?.startMs ?? Infinity);
    const viewed = clock.view(g.client.record);
    expect(viewed.breaking?.startMs).toBe(screen);
    // Another cell's record is left as it is.
    expect(
      clock.view({ ...g.client.record, breaking: { ...c, x: c.x + 1, startMs: 7 } }).breaking
        ?.startMs,
    ).toBe(7);
  });

  it('the grace rule', () => {
    const record = {
      slots: [],
      selectedSlot: 0,
      breaking: { x: 1, y: 2, z: 3, startMs: 1000 },
      xp: 0,
      found: [],
      crafted: [],
      track: 0,
    } as PlayerRecord;
    const action = { kind: 'break', x: 1, y: 2, z: 3 } as const;
    // Due at 1000 + 600 - 100 (the tolerance of `applyAction`).
    expect(breakDueMs(record, action, 600, 1500)).toBeNull();
    expect(breakDueMs(record, action, 600, 1499)).toBe(1500);
    expect(breakDueMs(record, action, 600, 1100)).toBe(1500);
    expect(breakDueMs(record, action, 600, 1099)).toBeNull();
    expect(breakDueMs(record, { ...action, x: 2 }, 600, 1400)).toBeNull();
    expect(breakDueMs(record, action, null, 1400)).toBeNull();
    expect(breakDueMs({ ...record, breaking: null }, action, 600, 1400)).toBeNull();
    expect(breakDueMs(record, { kind: 'selectSlot', slot: 1 }, 600, 1400)).toBeNull();
  });

  it('actions behind a held break keep their order', async () => {
    const { rig, g } = await gatheringRoom({ minDelayMs: 20, maxDelayMs: 20 });
    const c = cellFor(rig, g);
    hostSet(rig, c, Block.DIRT);
    g.client.submit({ kind: 'startBreak', ...c });
    await until(rig, () => g.client.record.breaking !== null);
    // Early by 300 ms: held; the slot change behind it waits until the break is decided.
    await rig.run(300);
    g.client.submit({ kind: 'break', ...c });
    g.client.submit({ kind: 'selectSlot', slot: 3 });
    await until(rig, () => g.answers.length >= 3);
    expect(g.answers.slice(1).map((a) => [a.action.kind, a.result.ok])).toEqual([
      ['break', true],
      ['selectSlot', true],
    ]);
    expect(g.client.record.selectedSlot).toBe(3);
  });
});

describe('Gathering rules for a guest (Phase 6 AC9.2)', () => {
  it('tool gating: stone by hand yields nothing, with a pickaxe it yields stone', async () => {
    const { rig, g } = await gatheringRoom();
    const c = cellFor(rig, g);
    hostSet(rig, c, Block.STONE);
    const bare = await breakAsGuest(rig, g, c);
    expect(bare).toEqual({ ok: true, blocks: [], player: null, notices: [] });
    expect(g.client.record.slots.every((s) => s === null)).toBe(true);
    hostSet(rig, c, Block.STONE);
    setSlots(rig, g, (slots) => {
      slots[0] = { item: Item.WOODEN_PICKAXE, count: 1 };
    });
    await until(rig, () => g.client.record.slots[0] !== null);
    const result = await breakAsGuest(rig, g, c);
    expect(result?.ok && result.notices).toEqual([{ item: Block.STONE, count: 1 }]);
  });

  it('a full inventory refuses the break of a block whose item has no room', async () => {
    const { rig, g } = await gatheringRoom();
    const c = cellFor(rig, g);
    hostSet(rig, c, Block.DIRT);
    setSlots(rig, g, (slots) => slots.fill({ item: Block.SAND, count: 99 }));
    await until(rig, () => g.client.record.slots[35] !== null);
    g.client.submit({ kind: 'startBreak', ...c });
    await until(rig, () => g.answers.length > 0);
    expect(g.answers.at(-1)?.result).toEqual({ ok: false, reason: 'full' });
    expect(rig.world.getBlock(c.x, c.y, c.z)).toBe(Block.DIRT);
  });

  it('a torch comes off with its support block and goes into the inventory', async () => {
    const { rig, g } = await gatheringRoom();
    const c = cellFor(rig, g);
    hostSet(rig, c, Block.STONE);
    hostSet(rig, { ...c, y: c.y + 1 }, Block.TORCH);
    setSlots(rig, g, (slots) => {
      slots[0] = { item: Item.IRON_PICKAXE, count: 1 };
    });
    await until(rig, () => g.client.record.slots[0] !== null);
    const result = await breakAsGuest(rig, g, c);
    expect(result?.ok && result.notices).toEqual([
      { item: Block.STONE, count: 1 },
      { item: Block.TORCH, count: 1 },
    ]);
    for (const world of [rig.world, g.world]) {
      expect(world?.getBlock(c.x, c.y, c.z)).toBe(Block.AIR);
      expect(world?.getBlock(c.x, c.y + 1, c.z)).toBe(Block.AIR);
    }
    expect(g.client.record.slots.some((s) => s?.item === Block.TORCH)).toBe(true);
  });

  it('a carried torch without room is lost; the break still goes through', async () => {
    const { rig, g } = await gatheringRoom();
    const c = cellFor(rig, g);
    hostSet(rig, c, Block.STONE);
    hostSet(rig, { ...c, y: c.y + 1 }, Block.TORCH);
    setSlots(rig, g, (slots) => {
      slots.fill({ item: Block.SAND, count: 99 });
      slots[0] = { item: Item.IRON_PICKAXE, count: 1 };
      slots[1] = { item: Block.STONE, count: 5 };
    });
    await until(rig, () => g.client.record.slots[1]?.item === Block.STONE);
    const result = await breakAsGuest(rig, g, c);
    expect(result?.ok && result.notices).toEqual([{ item: Block.STONE, count: 1 }]);
    expect(rig.world.getBlock(c.x, c.y + 1, c.z)).toBe(Block.AIR);
    expect(g.client.record.slots.some((s) => s?.item === Block.TORCH)).toBe(false);
    expect(g.client.record.slots[1]).toEqual({ item: Block.STONE, count: 6 });
  });
});

describe('the authority cache (Phase 6 AC9.3)', () => {
  it(`holds at most ${AUTHORITY_CACHE_CHUNKS} chunks and reads what a loaded chunk holds, with and without edits`, () => {
    const seed = 4242;
    const host = new World(seed);
    const reader = new FarReader(host);
    const rng = mulberry32(77);
    // 40 chunks far from the start: more than the cache holds.
    const chunks = Array.from({ length: 40 }, (_, i) => [200 + (i % 8), -30 + Math.floor(i / 8)]);
    const pick = (): [number, number, number] => {
      const [cx, cz] = chunks[Math.floor(rng() * chunks.length)];
      return [
        cx * 16 + Math.floor(rng() * 16),
        Math.floor(rng() * 128),
        cz * 16 + Math.floor(rng() * 16),
      ];
    };
    // Edits before anything is cached, and edits into cached chunks (`noteEdit`).
    for (let i = 0; i < 300; i++) {
      const [x, y, z] = pick();
      host.setBlock(x, y, z, 1 + (i % 9));
    }
    const positions: [number, number, number][] = [];
    for (let group = 0; group < 200; group++) {
      const [cx, cz] = chunks[Math.floor(rng() * chunks.length)];
      for (let k = 0; k < 50; k++) {
        positions.push([
          cx * 16 + Math.floor(rng() * 16),
          Math.floor(rng() * 128),
          cz * 16 + Math.floor(rng() * 16),
        ]);
      }
      if (group % 10 === 5) {
        const [x, y, z] = pick();
        reader.getBlock(x, y, z);
        host.setBlock(x, y, z, Block.BRICKS);
        reader.noteEdit(x, y, z, Block.BRICKS);
        positions.push([x, y, z]);
      }
    }
    const read = positions.map(([x, y, z]) => {
      const id = reader.getBlock(x, y, z);
      expect(reader.cached).toBeLessThanOrEqual(AUTHORITY_CACHE_CHUNKS);
      return id;
    });
    // The reference: the same world with every chunk loaded.
    const loaded = new World(seed, undefined, host.edits);
    for (const [cx, cz] of chunks) loaded.generate(cx, cz);
    const expected = positions.map(([x, y, z]) => loaded.getBlock(x, y, z));
    expect(positions.length).toBeGreaterThanOrEqual(10_000);
    expect(read).toEqual(expected);
    expect(reader.cached).toBe(AUTHORITY_CACHE_CHUNKS);
  });
});

describe('stations far from the host (Phase 6 AC9.4)', () => {
  it('a guest crafts at a workbench 300 blocks away; without it the answer is `station`', async () => {
    const { rig, g } = await gatheringRoom();
    const reader = rig.host.reader;
    const x = 310;
    const z = 4;
    let y = 120;
    while (y > 1 && reader.getBlock(x, y - 1, z) === Block.AIR) y--;
    const bench = { x: x + 2, y, z };
    expect(rig.world.getChunk(Math.floor(x / 16), 0)).toBeUndefined();
    g.client.setPose({ x: x + 0.5, y, z: z + 0.5, yaw: 0, pitch: 0 }, rig.net.nowMs, true);
    setSlots(rig, g, (slots) => {
      slots[0] = { item: Block.PLANKS, count: 6 };
      slots[1] = { item: Item.STICK, count: 4 };
    });
    await rig.run(300);
    // Wooden pickaxe (recipe 4) needs the workbench.
    g.client.submit({ kind: 'craft', recipe: 4 });
    await until(rig, () => g.answers.length > 0);
    expect(g.answers.at(-1)?.result).toEqual({ ok: false, reason: 'station' });
    hostSet(rig, bench, Block.WORKBENCH);
    g.client.submit({ kind: 'craft', recipe: 4 });
    await until(rig, () => g.answers.length > 1);
    expect(g.answers.at(-1)?.result.ok).toBe(true);
    await until(rig, () => g.client.record.slots.some((s) => s?.item === Item.WOODEN_PICKAXE));
    // Still not loaded on the host: read on the side.
    expect(rig.world.getChunk(Math.floor(x / 16), 0)).toBeUndefined();
  });
});

describe('the rate limit (Phase 6 AC9.5)', () => {
  it(`the ${ACTION_RATE_LIMIT + 1}st action within one second is refused \`rate\`; the next second accepts`, async () => {
    const { rig, g } = await gatheringRoom({ minDelayMs: 30, maxDelayMs: 30 });
    for (let i = 0; i <= ACTION_RATE_LIMIT; i++)
      g.client.submit({ kind: 'selectSlot', slot: i % 9 });
    await until(rig, () => g.answers.length === ACTION_RATE_LIMIT + 1);
    const reasons = g.answers.map((a) => (a.result.ok ? 'ok' : a.result.reason));
    expect(reasons.slice(0, ACTION_RATE_LIMIT).every((r) => r === 'ok')).toBe(true);
    expect(reasons[ACTION_RATE_LIMIT]).toBe('rate');
    await rig.run(1000);
    g.client.submit({ kind: 'selectSlot', slot: 2 });
    await until(rig, () => g.answers.length === ACTION_RATE_LIMIT + 2);
    expect(g.answers.at(-1)?.result.ok).toBe(true);
    // The host's own player has no limit.
    for (let i = 0; i < 50; i++) rig.host.local.submit({ kind: 'selectSlot', slot: i % 9 });
    expect(rig.hostAnswers.every((a) => a.result.ok)).toBe(true);
  });
});
