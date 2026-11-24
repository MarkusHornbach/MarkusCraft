// The progress engine: counting, XP, levels, unlocks, chapters (Phase 8 AC2).
import { describe, expect, it } from 'vitest';
import { type PlayerRecord, createPlayerRecord } from '../actions/playerRecord';
import { Item } from '../items/items';
import { Block } from '../world/blocks';
import type { ProgressEvent } from './events';
import {
  EMPTY_PROGRESS,
  type ProgressPlayer,
  type WorldProgress,
  countOf,
  levelOf,
  nextLevelXp,
  openChapter,
  outcomesOfBook,
  outcomesOfRecord,
  recipeUnlocked,
  recipesOfLevel,
  stepProgress,
  unlockText,
} from './progress';
import { STARTING_TABLES as T } from '../testing/startingTables';

/** The plan's starting values: these tests do not follow the tuning of the shipped tables. */
const TASKS = T.tasks;
const getTask = (id: number) => TASKS.find((t) => t.id === id);

const fresh = (): PlayerRecord => createPlayerRecord('gathering');
const me = (record: PlayerRecord = fresh()): ProgressPlayer => ({ id: 'me', record });

const mine = (block: number, item = block, count = 1): ProgressEvent => ({
  kind: 'mine',
  block,
  item,
  count,
});
const craft = (recipe: number, item: number, count: number): ProgressEvent => ({
  kind: 'craft',
  recipe,
  item,
  count,
});
const place = (block: number): ProgressEvent => ({ kind: 'place', block });
const pose = (y: number): ProgressEvent => ({ kind: 'pose', y });

/** Progress with every task of the chapters before `chapter` done. */
function atChapter(chapter: number): WorldProgress {
  return { done: TASKS.filter((t) => t.chapter < chapter).map((t) => t.id), counts: [] };
}

/** Deep-freezes a value so that a mutation throws. */
function frozen<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) frozen(v);
  }
  return value;
}

/** Runs events through the step for one player, frozen inputs every time. */
function run(
  events: ProgressEvent[],
  world: WorldProgress = EMPTY_PROGRESS,
  record: PlayerRecord = fresh(),
): { world: WorldProgress; record: PlayerRecord; outcomes: unknown[] } {
  const outcomes: unknown[] = [];
  for (const event of events) {
    const player = frozen(me(record));
    const step = stepProgress(frozen(world), player, frozen(event), [player], T);
    world = step.progress;
    record = step.records.find((r) => r.id === 'me')?.record ?? record;
    outcomes.push(...step.outcomes);
  }
  return { world, record, outcomes };
}

describe('task types (Phase 8 AC2.1)', () => {
  it('mine counts items received, only while its chapter is open', () => {
    // Stone of chapter 2 mined in chapter 1 counts nothing.
    let r = run([mine(Block.STONE, Block.STONE, 1)]);
    expect(r.world.counts).toEqual([]);
    r = run([mine(Block.LOG), mine(Block.LOG)]);
    expect(r.world.counts).toEqual([{ task: 1, count: 2 }]);
    r = run([mine(Block.LOG), mine(Block.LOG)], r.world, r.record);
    expect(r.world.done).toEqual([1]);
    expect(r.world.counts).toEqual([]);
  });

  it('craft counts the result count; place counts blocks', () => {
    let r = run([craft(1, Block.PLANKS, 4)]);
    expect(r.world.counts).toEqual([{ task: 2, count: 4 }]);
    r = run([craft(1, Block.PLANKS, 4), place(Block.WORKBENCH)], r.world, r.record);
    expect(r.world.done).toEqual([2, 4]);
  });

  it('reach tasks complete on the pose step', () => {
    let r = run([pose(63.9)], atChapter(2));
    expect(r.world.done).toEqual(atChapter(2).done);
    r = run([pose(64)], atChapter(2));
    expect(r.world.done).toContain(8);
    r = run([pose(30.5)], atChapter(4));
    expect(r.world.done).not.toContain(14);
    r = run([pose(30)], atChapter(4));
    expect(r.world.done).toContain(14);
  });

  it('surplus is not carried over', () => {
    const r = run([mine(Block.LOG, Block.LOG, 9)]);
    expect(r.world.done).toEqual([1]);
    expect(r.world.counts).toEqual([]);
    expect(countOf(r.world, TASKS[0])).toBe(4);
  });

  it('work before the chapter opened does not count; the next chapter starts at 0', () => {
    // 8 planks done in chapter 1; the planks of the same event do not reach chapter 2.
    const world: WorldProgress = { done: [1, 3, 4], counts: [{ task: 2, count: 4 }] };
    const r = run([craft(1, Block.PLANKS, 4)], world);
    expect(openChapter(r.world, T)?.id).toBe(2);
    expect(r.world.counts).toEqual([]);
  });
});

describe('XP, finds, crafts and levels (Phase 8 AC2.2)', () => {
  it('a completed task gives its XP to every present player', () => {
    const a = me();
    const b: ProgressPlayer = { id: 'b', record: fresh() };
    const c: ProgressPlayer = { id: 'c', record: fresh() };
    const world: WorldProgress = { done: [], counts: [{ task: 1, count: 3 }] };
    const step = stepProgress(world, a, mine(Block.LOG), [a, b], T);
    expect(step.outcomes).toContainEqual({ kind: 'taskDone', task: 1, actor: 'me' });
    expect(step.records.map((r) => [r.id, r.record.xp])).toEqual([
      ['me', 10],
      ['b', 10],
    ]);
    expect(step.records.some((r) => r.id === c.id)).toBe(false);
  });

  it('a first find goes to the actor only, once, and only for listed ores', () => {
    const b: ProgressPlayer = { id: 'b', record: fresh() };
    const world = atChapter(2);
    const first = stepProgress(world, me(), mine(Block.COAL_ORE, Item.COAL), [me(), b], T);
    expect(first.outcomes).toContainEqual({
      kind: 'firstFind',
      player: 'me',
      block: Block.COAL_ORE,
    });
    expect(first.records).toHaveLength(1);
    const record = first.records[0].record;
    expect(record.xp).toBe(20);
    expect(record.found).toEqual([Block.COAL_ORE]);
    const again = stepProgress(
      first.progress,
      me(record),
      mine(Block.COAL_ORE, Item.COAL),
      [me(record)],
      T,
    );
    expect(again.records).toEqual([]);
    const stone = stepProgress(world, me(), mine(Block.STONE), [me()], T);
    expect(stone.outcomes.some((o) => o.kind === 'firstFind')).toBe(false);
  });

  it('a first craft gives XP to the actor once per recipe', () => {
    const b: ProgressPlayer = { id: 'b', record: fresh() };
    const step = stepProgress(atChapter(6), me(), craft(2, Item.STICK, 4), [me(), b], T);
    expect(step.records).toHaveLength(1);
    expect(step.records[0].record).toMatchObject({ xp: 5, crafted: [2] });
    const again = stepProgress(
      atChapter(6),
      me(step.records[0].record),
      craft(2, Item.STICK, 4),
      [b],
      T,
    );
    expect(again.records).toEqual([]);
  });

  it('levelUp lists exactly the recipes of that level; a task unlock reports unlocked', () => {
    const record = { ...fresh(), xp: 25 };
    const world: WorldProgress = { done: [], counts: [{ task: 1, count: 3 }] };
    const step = stepProgress(world, me(record), mine(Block.LOG), [me(record)], T);
    expect(step.outcomes).toContainEqual({
      kind: 'levelUp',
      player: 'me',
      level: 2,
      recipes: [5, 6, 7],
    });
    const coal: WorldProgress = { done: atChapter(3).done, counts: [{ task: 12, count: 2 }] };
    const unlock = stepProgress(coal, me(), mine(Block.COAL_ORE, Item.COAL), [me()], T);
    expect(unlock.outcomes).toContainEqual({ kind: 'unlocked', recipes: [20] });
    expect(recipesOfLevel(4, T)).toEqual([16, 18]);
  });

  it('two levels at once give two levelUps', () => {
    const tables = { ...T, levels: [0, 6, 12, 150, 240, 350, 480] };
    const record = { ...fresh(), xp: 5 };
    const world: WorldProgress = { done: [], counts: [{ task: 1, count: 3 }] };
    const step = stepProgress(world, me(record), mine(Block.LOG), [me(record)], tables);
    const levels = step.outcomes.flatMap((o) => (o.kind === 'levelUp' ? [o.level] : []));
    expect(levels).toEqual([2, 3]);
  });
});

describe('chapters and the book (Phase 8 AC2.3)', () => {
  it('the last task of a chapter completes it and opens the next', () => {
    const world: WorldProgress = { done: [1, 2, 3], counts: [] };
    const step = stepProgress(world, me(), place(Block.WORKBENCH), [me()], T);
    expect(step.outcomes).toContainEqual({ kind: 'chapterDone', chapter: 1 });
    expect(openChapter(step.progress, T)?.id).toBe(2);
  });

  it('the last chapter completes the book; events after that change nothing', () => {
    const almost: WorldProgress = {
      done: TASKS.filter((t) => t.id !== 20).map((t) => t.id),
      counts: [{ task: 20, count: 7 }],
    };
    const end = stepProgress(almost, me(), place(Block.STONE_BRICKS), [me()], T);
    expect(end.outcomes).toContainEqual({ kind: 'chapterDone', chapter: 5 });
    expect(openChapter(end.progress, T)).toBeNull();
    for (const event of [mine(Block.LOG), place(Block.STONE_BRICKS), pose(10), pose(100)]) {
      expect(stepProgress(end.progress, me(), event, [me()], T).progress).toBe(end.progress);
    }
  });

  it('unknown task ids in a save are ignored', () => {
    const world: WorldProgress = { done: [999], counts: [{ task: 998, count: 5 }] };
    expect(openChapter(world, T)?.id).toBe(1);
    const r = run([mine(Block.LOG)], world);
    expect(r.world.counts).toContainEqual({ task: 1, count: 1 });
  });
});

describe('purity (Phase 8 AC2.4, AC2.5)', () => {
  it('the pose step with no open reach task returns the same objects', () => {
    const world = frozen(atChapter(1));
    const player = frozen(me());
    const a = stepProgress(world, player, pose(10), [player], T);
    const b = stepProgress(world, player, pose(100), [player], T);
    expect(a.progress).toBe(world);
    expect(a.records).toBe(b.records);
    expect(a.outcomes).toBe(b.outcomes);
    // A reach task open but not reached: still the same state.
    const two = frozen(atChapter(2));
    expect(stepProgress(two, player, pose(50), [player], T).progress).toBe(two);
  });

  it('a whole run on frozen inputs never throws', () => {
    expect(() =>
      run([
        mine(Block.LOG, Block.LOG, 4),
        craft(1, Block.PLANKS, 8),
        craft(3, Block.WORKBENCH, 1),
        place(Block.WORKBENCH),
        pose(70),
      ]),
    ).not.toThrow();
  });
});

describe('levels and unlocks', () => {
  it('levelOf and nextLevelXp', () => {
    expect(levelOf(0, T)).toBe(1);
    expect(nextLevelXp(0, T)).toBe(30);
    expect(nextLevelXp(479, T)).toBe(480);
    expect(nextLevelXp(480, T)).toBeNull();
  });

  it('recipeUnlocked by level or task, and its text', () => {
    expect(recipeUnlocked(1, fresh(), EMPTY_PROGRESS, T)).toBe(true);
    expect(recipeUnlocked(7, fresh(), EMPTY_PROGRESS, T)).toBe(false);
    expect(recipeUnlocked(7, { ...fresh(), xp: 30 }, EMPTY_PROGRESS, T)).toBe(true);
    expect(recipeUnlocked(20, { ...fresh(), xp: 9999 }, EMPTY_PROGRESS, T)).toBe(false);
    expect(recipeUnlocked(20, fresh(), { done: [12], counts: [] }, T)).toBe(true);
    expect(unlockText(8, T)).toBe('Level 3');
    expect(unlockText(20, T)).toBe(`Task: ${getTask(12)?.label}`);
  });
});

describe('what a guest shows (Phase 8 plan 5.12)', () => {
  const rec = (xp: number, found: number[] = []): PlayerRecord => ({
    ...createPlayerRecord('gathering'),
    xp,
    found,
  });

  it('outcomesOfBook: tasks with their player, task unlocks, then completed chapters', () => {
    const before: WorldProgress = { done: [1, 2, 3], counts: [] };
    const after: WorldProgress = { done: [1, 2, 3, 4], counts: [] };
    expect(outcomesOfBook(before, after, [{ task: 4, by: 'Anna' }], T)).toEqual([
      { kind: 'taskDone', task: 4, actor: 'Anna', by: 'Anna' },
      { kind: 'chapterDone', chapter: 1 },
    ]);
    // The torch comes with task 12; an unknown task id is ignored.
    const torch = outcomesOfBook(
      EMPTY_PROGRESS,
      { done: [12], counts: [] },
      [
        { task: 12, by: 'Ben' },
        { task: 999, by: 'Ben' },
      ],
      T,
    );
    expect(torch).toEqual([
      { kind: 'taskDone', task: 12, actor: 'Ben', by: 'Ben' },
      { kind: 'unlocked', recipes: [20] },
    ]);
    // A replaced book (the test tool) shows nothing for chapters it does not complete.
    expect(outcomesOfBook(after, EMPTY_PROGRESS, [], T)).toEqual([]);
  });

  it('outcomesOfRecord: first finds, XP and every level passed', () => {
    expect(outcomesOfRecord(rec(20), rec(90, [Block.COAL_ORE]), 'me', T)).toEqual([
      { kind: 'firstFind', player: 'me', block: Block.COAL_ORE },
      { kind: 'xp', player: 'me', amount: 70 },
      { kind: 'levelUp', player: 'me', level: 2, recipes: [5, 6, 7] },
      { kind: 'levelUp', player: 'me', level: 3, recipes: [8, 9, 10, 11] },
    ]);
    expect(outcomesOfRecord(rec(20), rec(20), 'me', T)).toEqual([]);
    expect(outcomesOfRecord(rec(90), rec(10), 'me', T)).toEqual([]);
  });
});
