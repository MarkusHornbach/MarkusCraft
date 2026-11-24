// Shared progress in rooms (Phase 8 part A2): the host owns the task book, counts every
// player's actions and poses, gives a task's XP to everyone in the room and first finds to
// the finder, and locks each player's crafts by their own level.
import { describe, expect, it } from 'vitest';
import type { ActionResult } from '../actions/apply';
import type { PlayerRecord } from '../actions/playerRecord';
import { createPlayerRecord } from '../actions/playerRecord';
import { breakTimeMs } from '../items/hardness';
import { Item } from '../items/items';
import { type WorldProgress, maxLevelXp } from '../progress/progress';
import { FIRST_FIND_XP, getTask } from '../progress/tables';
import { Rig, type RigGuest, type RigOptions } from '../testing/netRig';
import { Block } from '../world/blocks';

interface Cell {
  x: number;
  y: number;
  z: number;
}

const LOG_TASK = 1;
const CLIMB_TASK = 8;

function taskOf(id: number) {
  const task = getTask(id);
  if (!task) throw new Error(`no task ${id}`);
  return task;
}

/** The book with "Mine 32 logs" short of its goal by `left`. */
function logsLeft(left: number): WorldProgress {
  return { done: [], counts: [{ task: LOG_TASK, count: taskOf(LOG_TASK).count - left }] };
}

async function room(
  guests: number,
  options: RigOptions = {},
): Promise<{ rig: Rig; gs: RigGuest[] }> {
  const rig = new Rig({ mode: 'gathering', ...options });
  await rig.open();
  const gs: RigGuest[] = [];
  for (let i = 0; i < guests; i++) {
    const g = rig.guest({ name: `Guest${i + 1}` });
    expect(await rig.join(g, 5000)).toBeNull();
    gs.push(g);
  }
  return { rig, gs };
}

async function until(rig: Rig, check: () => boolean, maxMs = 10_000): Promise<void> {
  for (let t = 0; t < maxMs; t += 10) {
    if (check()) return;
    await rig.run(10);
  }
  throw new Error('condition not reached');
}

function guestPose(rig: Rig, g: RigGuest) {
  const self = rig.host.players().find((p) => p.id === g.client.selfId);
  if (!self) throw new Error('guest not in the room');
  return self.pose;
}

/** A cell in front of a pose at eye height, well within reach. */
function cellNear(p: { x: number; y: number; z: number }, dz = 0): Cell {
  return { x: Math.floor(p.x) + 2, y: Math.floor(p.y) + 1, z: Math.floor(p.z) + dz };
}

/** Sets a block on the host past the action layer; the guests get it as a host edit. */
function hostSet(rig: Rig, c: Cell, id: number): void {
  rig.world.setBlock(c.x, c.y, c.z, id);
  rig.host.broadcastBlocks([{ ...c, id }]);
}

/** Replaces a guest's record on the host (the test tool behind `give` and `setProgress`). */
async function editGuest(rig: Rig, g: RigGuest, edit: (r: PlayerRecord) => PlayerRecord) {
  const door = rig.host.guestRecordDoor(g.client.selfId ?? -1);
  if (!door) throw new Error('no guest');
  const next = edit(door.record);
  door.replaceRecord(next);
  await until(
    rig,
    () => g.client.record.xp === next.xp && g.client.record.slots[0]?.item === next.slots[0]?.item,
  );
}

function hold(item: number): (r: PlayerRecord) => PlayerRecord {
  return (r) => {
    const slots = r.slots.map(() => null) as PlayerRecord['slots'][number][];
    slots[0] = { item, count: 1 };
    return { ...r, slots, selectedSlot: 0 };
  };
}

/** One break as the guest's screen does it; returns the answer. */
async function breakAsGuest(rig: Rig, g: RigGuest, c: Cell): Promise<ActionResult | undefined> {
  const tool = g.client.record.slots[g.client.record.selectedSlot]?.item ?? null;
  const required = breakTimeMs(rig.world.getBlock(c.x, c.y, c.z), tool);
  if (required === null) throw new Error('unbreakable');
  const answers = g.answers.length;
  g.client.submit({ kind: 'startBreak', ...c });
  await until(rig, () => g.answers.length > answers);
  const started = g.client.record.breaking;
  if (!started) throw new Error('no break in the record');
  await until(rig, () => rig.net.nowMs >= started.startMs + required, required + 1000);
  g.client.submit({ kind: 'break', ...c });
  await until(rig, () => g.answers.length > answers + 1, 3000);
  return g.answers.at(-1)?.result;
}

/** A craft of a guest; returns the answer. */
async function craftAsGuest(rig: Rig, g: RigGuest, recipe: number) {
  const answers = g.answers.length;
  g.client.submit({ kind: 'craft', recipe });
  await until(rig, () => g.answers.length > answers);
  return g.answers.at(-1)?.result;
}

/** The records the host keeps of every guest (present or not), by name. */
function guestXp(rig: Rig): Record<string, number> {
  return Object.fromEntries(rig.host.guestEntries().map((e) => [e.name, e.record.xp]));
}

describe('shared progress in rooms (Phase 8 AC8.1)', () => {
  it("2 players: a guest's breaks advance the shared task; both get its XP", async () => {
    const { rig, gs } = await room(1, { progress: logsLeft(2) });
    const [g] = gs;
    const c = cellNear(guestPose(rig, g));
    hostSet(rig, c, Block.LOG);
    expect((await breakAsGuest(rig, g, c))?.ok).toBe(true);
    expect(rig.host.progress.counts).toEqual([
      { task: LOG_TASK, count: taskOf(LOG_TASK).count - 1 },
    ]);
    expect(rig.hostProgress).toBe(rig.host.progress);
    expect(rig.hostRecord.xp).toBe(0);

    hostSet(rig, c, Block.LOG);
    expect((await breakAsGuest(rig, g, c))?.ok).toBe(true);
    const xp = taskOf(LOG_TASK).xp;
    expect(rig.host.progress.done).toEqual([LOG_TASK]);
    expect(rig.host.progress.counts).toEqual([]);
    expect(rig.hostRecord.xp).toBe(xp);
    await until(rig, () => g.client.record.xp === xp);
    expect(rig.hostOutcomes).toContainEqual({
      kind: 'taskDone',
      task: LOG_TASK,
      actor: String(g.client.selfId),
    });
  });

  it('4 players: everyone in the room gets the task XP, also the host breaking it', async () => {
    const { rig, gs } = await room(3, { progress: logsLeft(1) });
    const c = cellNear(rig.hostPose);
    hostSet(rig, c, Block.LOG);
    const start = rig.net.nowMs;
    rig.host.local.submit({ kind: 'startBreak', ...c });
    const required = breakTimeMs(Block.LOG, null) ?? 0;
    await until(rig, () => rig.net.nowMs >= start + required);
    rig.host.local.submit({ kind: 'break', ...c });
    expect(rig.hostAnswers.at(-1)?.result.ok).toBe(true);
    const xp = taskOf(LOG_TASK).xp;
    expect(rig.host.progress.done).toEqual([LOG_TASK]);
    expect(rig.hostRecord.xp).toBe(xp);
    for (const g of gs) await until(rig, () => g.client.record.xp === xp);
    expect(guestXp(rig)).toEqual({ Guest1: xp, Guest2: xp, Guest3: xp });
    expect(rig.hostOutcomes).toContainEqual({ kind: 'taskDone', task: LOG_TASK, actor: 'local' });
  });

  it('a guest who left before the task completes gets nothing', async () => {
    const { rig, gs } = await room(2, { progress: logsLeft(1) });
    const [g1, g2] = gs;
    g2.client.leave();
    await until(rig, () => rig.host.playerCount === 2);
    const c = cellNear(guestPose(rig, g1));
    hostSet(rig, c, Block.LOG);
    expect((await breakAsGuest(rig, g1, c))?.ok).toBe(true);
    const xp = taskOf(LOG_TASK).xp;
    expect(guestXp(rig)).toEqual({ Guest1: xp, Guest2: 0 });
    expect(rig.hostRecord.xp).toBe(xp);
  });

  it('first finds go to the finder only, once per player', async () => {
    const { rig, gs } = await room(3);
    const [g1, g2] = gs;
    const coal = FIRST_FIND_XP.get(Block.COAL_ORE) ?? 0;
    for (const g of [g1, g2]) await editGuest(rig, g, hold(Item.WOODEN_PICKAXE));
    const c1 = cellNear(guestPose(rig, g1));
    hostSet(rig, c1, Block.COAL_ORE);
    expect((await breakAsGuest(rig, g1, c1))?.ok).toBe(true);
    await until(rig, () => g1.client.record.xp === coal);
    expect(g1.client.record.found).toEqual([Block.COAL_ORE]);
    expect(guestXp(rig)).toEqual({ Guest1: coal, Guest2: 0, Guest3: 0 });
    expect(rig.hostRecord.xp).toBe(0);
    expect(rig.hostOutcomes).toContainEqual({
      kind: 'firstFind',
      player: String(g1.client.selfId),
      block: Block.COAL_ORE,
    });

    // A second coal ore gives the finder nothing more; another player finds it for itself.
    hostSet(rig, c1, Block.COAL_ORE);
    expect((await breakAsGuest(rig, g1, c1))?.ok).toBe(true);
    const c2 = cellNear(guestPose(rig, g2), 1);
    hostSet(rig, c2, Block.COAL_ORE);
    expect((await breakAsGuest(rig, g2, c2))?.ok).toBe(true);
    await until(rig, () => g2.client.record.xp === coal);
    expect(guestXp(rig)).toEqual({ Guest1: coal, Guest2: coal, Guest3: 0 });
    // Nothing of the book changed: no chapter 3 task was open.
    expect(rig.host.progress.done).toEqual([]);
  });

  it("each player's craft is locked by their own level", async () => {
    const hostRecord = { ...createPlayerRecord('gathering'), xp: maxLevelXp() };
    const { rig, gs } = await room(2, { hostRecord });
    const [g1, g2] = gs;
    const STONE_PICKAXE = 7;
    // The guests start at level 1: the stone pickaxe (level 2) is locked for them.
    expect(await craftAsGuest(rig, g1, STONE_PICKAXE)).toEqual({ ok: false, reason: 'locked' });
    // The host at the maximum level gets past the lock (no workbench near).
    rig.host.local.submit({ kind: 'craft', recipe: STONE_PICKAXE });
    expect(rig.hostAnswers.at(-1)?.result).toEqual({ ok: false, reason: 'station' });
    // A guest's own level unlocks it for that guest only.
    await editGuest(rig, g1, (r) => ({ ...r, xp: 50 }));
    expect(await craftAsGuest(rig, g1, STONE_PICKAXE)).toEqual({ ok: false, reason: 'station' });
    expect(await craftAsGuest(rig, g2, STONE_PICKAXE)).toEqual({ ok: false, reason: 'locked' });
  });

  it('a first craft gives XP to the crafter only', async () => {
    const { rig, gs } = await room(2);
    const [g1, g2] = gs;
    await editGuest(rig, g1, (r) => {
      const slots = r.slots.map(() => null) as PlayerRecord['slots'][number][];
      slots[0] = { item: Block.LOG, count: 2 };
      return { ...r, slots };
    });
    const PLANKS = 1;
    expect((await craftAsGuest(rig, g1, PLANKS))?.ok).toBe(true);
    await until(rig, () => g1.client.record.xp === 5);
    expect(g1.client.record.crafted).toEqual([PLANKS]);
    // The 4 planks count towards "Make 64 planks" for the whole room.
    expect(rig.host.progress.counts).toEqual([{ task: 2, count: 4 }]);
    expect((await craftAsGuest(rig, g1, PLANKS))?.ok).toBe(true);
    await rig.run(200);
    expect(g1.client.record.xp).toBe(5);
    expect(g2.client.record.xp).toBe(0);
    expect(rig.hostRecord.xp).toBe(0);
  });

  it("a guest's pose and the host's own pose complete reach tasks", async () => {
    const before = Array.from({ length: CLIMB_TASK - 1 }, (_, i) => i + 1);
    const { rig, gs } = await room(1, { progress: { done: before, counts: [] } });
    const [g] = gs;
    // Below the height: nothing; the host's pose step alone changes nothing either.
    const p = guestPose(rig, g);
    rig.host.local.notePose(p.y);
    expect(rig.host.progress.done).toEqual(before);
    g.client.setPose({ ...p, y: 70 }, rig.net.nowMs);
    await until(rig, () => rig.host.progress.done.includes(CLIMB_TASK));
    const xp = taskOf(CLIMB_TASK).xp;
    expect(rig.hostRecord.xp).toBe(xp);
    await until(rig, () => g.client.record.xp === xp);
    expect(rig.hostOutcomes.map((o) => o.kind)).toContain('chapterDone');
  });

  it("the host's pose step completes a reach task for everyone", async () => {
    const before = Array.from({ length: CLIMB_TASK - 1 }, (_, i) => i + 1);
    const { rig, gs } = await room(1, { progress: { done: before, counts: [] } });
    rig.host.local.notePose(80);
    expect(rig.host.progress.done).toContain(CLIMB_TASK);
    await until(rig, () => gs[0].client.record.xp === taskOf(CLIMB_TASK).xp);
  });

  it('Creative rooms count nothing', async () => {
    const rig = new Rig({ mode: 'creative' });
    await rig.open();
    const g = rig.guest();
    expect(await rig.join(g)).toBeNull();
    const c = cellNear(guestPose(rig, g));
    hostSet(rig, c, Block.LOG);
    const answers = g.answers.length;
    g.client.submit({ kind: 'break', ...c });
    await until(rig, () => g.answers.length > answers);
    expect(g.answers.at(-1)?.result.ok).toBe(true);
    rig.host.local.notePose(90);
    expect(rig.host.progress.done).toEqual([]);
    expect(rig.hostOutcomes).toEqual([]);
  });
});
