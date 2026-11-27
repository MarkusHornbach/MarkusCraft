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
import { noticeTexts } from '../progress/view';
import { LOCAL_PLAYER_ID } from '../actions/Session';
import { type WorldMeta, decodeMeta, encodeMeta } from '../save/saveFormat';
import { CLASSIC_GEN } from '../world/generation/worldOptions';
import { Rig, type RigGuest, type RigOptions } from '../testing/netRig';
import { Block } from '../world/blocks';
import { TrafficMeter, countedNetwork } from './traffic';

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
      by: 'Guest1',
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
    expect(rig.hostOutcomes).toContainEqual({
      kind: 'taskDone',
      task: LOG_TASK,
      actor: 'local',
      by: 'Hosta',
    });
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

  it('Fix Adventure 1 AC1.4: a crafted torch stays unlocked for its crafter only', async () => {
    const TORCH = 20;
    // Task 12 done, task 11 not: the torch is locked for anyone who never crafted it.
    const progress: WorldProgress = { done: [1, 2, 3, 4, 5, 6, 7, 8, 12], counts: [] };
    const torchStuff = (r: PlayerRecord, crafted: number[]): PlayerRecord => {
      const slots = r.slots.map(() => null) as PlayerRecord['slots'][number][];
      slots[0] = { item: Item.STICK, count: 4 };
      slots[1] = { item: Item.COAL, count: 4 };
      return { ...r, slots, crafted };
    };
    const fresh = createPlayerRecord('gathering');
    // The host made torches before, the guest did not.
    const a = await room(1, { progress, hostRecord: torchStuff(fresh, [TORCH]) });
    await editGuest(a.rig, a.gs[0], (r) => torchStuff(r, []));
    expect(await craftAsGuest(a.rig, a.gs[0], TORCH)).toEqual({ ok: false, reason: 'locked' });
    a.rig.host.local.submit({ kind: 'craft', recipe: TORCH });
    expect(a.rig.hostAnswers.at(-1)?.result.ok).toBe(true);
    // The reverse: the guest made torches before, the host did not.
    const b = await room(1, { progress, hostRecord: torchStuff(fresh, []) });
    await editGuest(b.rig, b.gs[0], (r) => torchStuff(r, [TORCH]));
    expect((await craftAsGuest(b.rig, b.gs[0], TORCH))?.ok).toBe(true);
    b.rig.host.local.submit({ kind: 'craft', recipe: TORCH });
    expect(b.rig.hostAnswers.at(-1)?.result).toEqual({ ok: false, reason: 'locked' });
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

/** The notices a player's screen shows for what it was told. */
function notices(outcomes: Parameters<typeof noticeTexts>[0]): string[] {
  return noticeTexts(outcomes, LOCAL_PLAYER_ID);
}

describe('guests see the shared book (Phase 8 AC8.2)', () => {
  it('a finished task reaches every guest with the name of its player; level-ups only the player concerned', async () => {
    // The host is far ahead: only the guests reach level 2 with the last task of chapter 1.
    const hostRecord = { ...createPlayerRecord('gathering'), xp: maxLevelXp() };
    const progress: WorldProgress = {
      done: [2, 3, 4],
      counts: [{ task: LOG_TASK, count: taskOf(LOG_TASK).count - 1 }],
    };
    const { rig, gs } = await room(2, { progress, hostRecord });
    const [g1, g2] = gs;
    // Each guest is 10 XP short of level 2 (50).
    for (const g of gs) await editGuest(rig, g, (r) => ({ ...r, xp: 40 }));
    g1.outcomes.length = 0;
    g2.outcomes.length = 0;
    const c = cellNear(guestPose(rig, g1));
    hostSet(rig, c, Block.LOG);
    expect((await breakAsGuest(rig, g1, c))?.ok).toBe(true);
    await until(rig, () => g2.client.record.xp === 50 && g1.client.record.xp === 50);
    expect(g1.progress).toEqual(rig.host.progress);
    expect(g2.client.progress).toEqual(rig.host.progress);
    const taskLine = 'Task done: Mine 32 logs (Guest1) · +10 XP';
    const levelLine = 'Level 2 · Unlocked: Wooden axe, Wooden shovel, Stone pickaxe';
    for (const g of gs) {
      expect(notices(g.outcomes)).toEqual([taskLine, 'Chapter done: First wood', levelLine]);
    }
    // The host sees the task and the chapter, and no level-up of others.
    expect(notices(rig.hostOutcomes)).toEqual([taskLine, 'Chapter done: First wood']);
  });

  it('a first find shows only for its finder, on the guest screen too', async () => {
    const { rig, gs } = await room(2);
    const [g1, g2] = gs;
    await editGuest(rig, g1, hold(Item.WOODEN_PICKAXE));
    const c = cellNear(guestPose(rig, g1));
    hostSet(rig, c, Block.COAL_ORE);
    expect((await breakAsGuest(rig, g1, c))?.ok).toBe(true);
    await until(rig, () => g1.outcomes.length > 0);
    expect(notices(g1.outcomes)).toEqual(['First find: Coal ore · +20 XP']);
    await rig.run(200);
    expect(notices(g2.outcomes)).toEqual([]);
    expect(notices(rig.hostOutcomes)).toEqual([]);
  });

  it('a guest joining mid-book receives the book in welcome', async () => {
    const progress: WorldProgress = { done: [1, 2, 3, 4, 5], counts: [{ task: 6, count: 9 }] };
    const { rig, gs } = await room(1, { progress });
    const [g] = gs;
    expect(g.welcome?.progress).toEqual(progress);
    expect(g.client.progress).toEqual(progress);
    // A Creative room sends an empty book.
    const creative = new Rig({ mode: 'creative' });
    await creative.open();
    const cg = creative.guest();
    expect(await creative.join(cg)).toBeNull();
    expect(cg.welcome?.progress).toEqual({ done: [], counts: [] });
    expect(rig.host.progress).toBe(progress);
  });

  it('a guest who leaves and returns keeps XP, finds and crafts', async () => {
    const { rig, gs } = await room(1);
    const [g] = gs;
    await editGuest(rig, g, hold(Item.WOODEN_PICKAXE));
    const c = cellNear(guestPose(rig, g));
    hostSet(rig, c, Block.COAL_ORE);
    expect((await breakAsGuest(rig, g, c))?.ok).toBe(true);
    await editGuest(rig, g, (r) => {
      const slots = r.slots.map(() => null) as PlayerRecord['slots'][number][];
      slots[0] = { item: Block.LOG, count: 1 };
      return { ...r, slots };
    });
    expect((await craftAsGuest(rig, g, 1))?.ok).toBe(true);
    await until(rig, () => g.client.record.crafted.length === 1);
    const kept = g.client.record;
    expect(kept.xp).toBe(25);
    g.client.leave();
    await rig.run(200);
    g.client.dispose();
    const again = rig.guest({ key: g.key });
    expect(await rig.join(again)).toBeNull();
    expect(again.client.record).toMatchObject({ xp: 25, found: [Block.COAL_ORE], crafted: [1] });
    // A new key starts at level 1.
    const stranger = rig.guest({ key: 'cd'.repeat(16) });
    expect(await rig.join(stranger)).toBeNull();
    expect(stranger.client.record).toMatchObject({ xp: 0, found: [], crafted: [] });
  });

  it("the host's save and reload keeps the book and every guest entry's progress", async () => {
    const first = (await room(2, { progress: logsLeft(1) })).rig;
    const [g1, g2] = first.guests;
    await editGuest(first, g2, hold(Item.WOODEN_PICKAXE));
    const coal = cellNear(guestPose(first, g2), 1);
    hostSet(first, coal, Block.COAL_ORE);
    expect((await breakAsGuest(first, g2, coal))?.ok).toBe(true);
    const c = cellNear(guestPose(first, g1));
    hostSet(first, c, Block.LOG);
    expect((await breakAsGuest(first, g1, c))?.ok).toBe(true);
    await first.run(200);
    first.host.close();
    // What the host's autosave writes, through the save format.
    const meta: WorldMeta = {
      id: 'w1',
      name: 'Shared',
      seed: 1337,
      mode: 'gathering',
      generatorVersion: CLASSIC_GEN.version,
      options: null,
      formatVersion: 4,
      createdMs: 1,
      playedMs: 2,
      time: 0.25,
      pose: { x: 0.5, y: 80, z: 0.5, yaw: 0, pitch: 0 },
      moveMode: 'walk',
      player: first.hostRecord,
      guests: first.host.guestEntries(),
      progress: first.host.progress,
    };
    const loaded = decodeMeta(JSON.parse(JSON.stringify(encodeMeta(meta))));
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.error));
    expect(loaded.value.progress).toEqual({ done: [LOG_TASK], counts: [] });
    const byName = Object.fromEntries(loaded.value.guests.map((e) => [e.name, e.record]));
    expect(byName.Guest1).toMatchObject({ xp: 10, found: [] });
    expect(byName.Guest2).toMatchObject({ xp: 30, found: [Block.COAL_ORE] });
    expect(loaded.value.player.xp).toBe(10);

    const rig = new Rig({
      mode: 'gathering',
      guests: loaded.value.guests,
      progress: loaded.value.progress,
      hostRecord: loaded.value.player,
    });
    await rig.open();
    const again = rig.guest({ key: g2.key });
    expect(await rig.join(again, 5000)).toBeNull();
    expect(again.client.progress).toEqual({ done: [LOG_TASK], counts: [] });
    expect(again.client.record).toMatchObject({ xp: 30, found: [Block.COAL_ORE] });
  });
});

describe('progress traffic (Phase 8 plan 5.12)', () => {
  it('one progress message per action that changes the book; none for poses that complete nothing', async () => {
    const { rig, gs } = await room(2);
    const [g1, g2] = gs;
    const c = cellNear(guestPose(rig, g1));
    for (let i = 0; i < 5; i++) {
      hostSet(rig, c, Block.LOG);
      expect((await breakAsGuest(rig, g1, c))?.ok).toBe(true);
    }
    await rig.run(200);
    expect(rig.host.progress.counts).toEqual([{ task: LOG_TASK, count: 5 }]);
    expect(g1.client.progressReceived).toBe(5);
    expect(g2.client.progressReceived).toBe(5);
    // Moving around with no reach task open sends nothing.
    const p = guestPose(rig, g1);
    for (let i = 1; i <= 20; i++) {
      g1.client.setPose({ ...p, y: p.y + i * 0.1, x: p.x + i * 0.1 }, rig.net.nowMs);
      rig.host.local.notePose(p.y + i);
      await rig.run(60);
    }
    expect(g1.client.progressReceived).toBe(5);
    expect(g2.client.progressReceived).toBe(5);
  });

  it('a reach task open: poses below the height send nothing, the one reaching it sends one', async () => {
    const before = Array.from({ length: CLIMB_TASK - 1 }, (_, i) => i + 1);
    const { rig, gs } = await room(1, { progress: { done: before, counts: [] } });
    const [g] = gs;
    const p = guestPose(rig, g);
    for (let i = 1; i <= 10; i++) {
      g.client.setPose({ ...p, x: p.x + i * 0.1, y: 40 }, rig.net.nowMs);
      rig.host.local.notePose(40);
      await rig.run(60);
    }
    expect(g.client.progressReceived).toBe(0);
    g.client.setPose({ ...p, y: 66 }, rig.net.nowMs);
    rig.host.local.notePose(66);
    await rig.run(200);
    expect(g.client.progressReceived).toBe(1);
  });
});

function circlePose(base: { x: number; y: number; z: number }, i: number, t: number) {
  const a = t / 1000 + (i * Math.PI) / 2;
  return {
    x: base.x + Math.cos(a) * (1.5 + i),
    y: base.y,
    z: base.z + Math.sin(a) * (1.5 + i),
    yaw: a,
    pitch: 0.1 * i,
  };
}

describe('the traffic of an Adventure room (Phase 8 AC8.6)', () => {
  it('four moving players whose every action changes the book: the host sends less than 20 kB per second', async () => {
    const BRICKS_TASK = 20;
    const done = Array.from({ length: BRICKS_TASK - 1 }, (_, i) => i + 1);
    const rig = new Rig({ mode: 'gathering', progress: { done, counts: [] } });
    const meter = new TrafficMeter(() => rig.net.nowMs);
    const counted = countedNetwork(
      { signaling: () => rig.net.signaling(), directory: rig.net.directory() },
      meter,
    );
    const hostSignaling = counted.signaling();
    hostSignaling.onConnection = (conn) => rig.host.accept(conn);
    await rig.settle(hostSignaling.open('mc-test123-r-ABCDEF'));
    for (let i = 0; i < 3; i++) expect(await rig.join(rig.guest())).toBeNull();
    for (const g of rig.guests) {
      await editGuest(rig, g, (r) => {
        const slots = r.slots.map(() => null) as PlayerRecord['slots'][number][];
        slots[0] = { item: Block.STONE_BRICKS, count: 64 };
        return { ...r, slots, selectedSlot: 0 };
      });
    }
    await rig.run(500);
    const base = { ...rig.hostPose };
    const sentBefore = meter.outBytes;
    const msgsBefore = meter.outMsgs;
    const start = rig.net.nowMs;
    // Ten seconds of four players walking; every guest places a stone brick twice a second
    // (60 in all, below the task's 64: every place changes the book), the host walks
    // through the pose step.
    for (let step = 0; step < 600; step++) {
      const t = rig.net.nowMs;
      rig.hostPose = circlePose(base, 0, t);
      rig.host.local.notePose(rig.hostPose.y);
      rig.guests.forEach((g, i) => {
        const pose = circlePose(base, i + 1, t);
        g.client.setPose(pose, t);
        if (step % 30 === i * 10) {
          const cell = {
            x: Math.floor(pose.x),
            y: Math.floor(pose.y) + 3 + Math.floor(step / 200),
            z: Math.floor(pose.z),
          };
          g.client.submit({ kind: 'place', ...cell, slot: 0 });
        }
      });
      await rig.run(10);
      await rig.run(7, true);
    }
    await rig.run(200);
    const seconds = (rig.net.nowMs - start) / 1000;
    const bytesPerS = (meter.outBytes - sentBefore) / seconds;
    const msgsPerS = (meter.outMsgs - msgsBefore) / seconds;
    console.log(
      `AC8.6: host sends ${(bytesPerS / 1024).toFixed(2)} kB/s in ${msgsPerS.toFixed(0)} messages/s`,
    );
    expect(bytesPerS).toBeLessThan(20 * 1024);
    const placed = rig.guests.flatMap((g) =>
      g.answers.filter((a) => a.action.kind === 'place' && a.result.ok),
    ).length;
    expect(placed).toBeGreaterThanOrEqual(50);
    // Every accepted place counted, and every guest heard of each one once.
    expect(rig.host.progress.counts).toEqual([{ task: BRICKS_TASK, count: placed }]);
    for (const g of rig.guests) expect(g.client.progressReceived).toBe(placed);
  });
});
