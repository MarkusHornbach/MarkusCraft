// What the screens show of the book: Tasks tab, notices, F3 row, lock texts (Phase 8 5.7).
import { describe, expect, it } from 'vitest';
import { createPlayerRecord } from '../actions/playerRecord';
import { Block } from '../world/blocks';
import { EMPTY_PROGRESS, completeProgress, stepProgress } from './progress';
import { STARTING_TABLES as T } from '../testing/startingTables';
import { bookView, lockedText, noticeTexts, progressRow, trackedTask, trackerText } from './view';

const record = (xp: number) => ({ ...createPlayerRecord('gathering'), xp });

describe('bookView', () => {
  it('a fresh book', () => {
    expect(bookView(EMPTY_PROGRESS, record(0), T)).toEqual({
      level: 1,
      xpText: '0 / 30 XP',
      xpFraction: 0,
      nextText: 'Next level: Wooden axe, Wooden shovel, Stone pickaxe',
      finished: [],
      chapterTitle: 'Chapter 1 · First wood',
      tasks: [
        { id: 1, label: 'Mine 4 logs', status: '0 / 4', done: false },
        { id: 2, label: 'Make 8 planks', status: '0 / 8', done: false },
        { id: 3, label: 'Make a workbench', status: '0 / 1', done: false },
        { id: 4, label: 'Place a workbench', status: '0 / 1', done: false },
      ],
      footer: '4 more chapters',
    });
  });

  it('mid-book: folded chapters, counts, a reach task, the XP bar within the level', () => {
    const view = bookView(
      { done: [1, 2, 3, 4, 5, 6, 7, 8, 9], counts: [{ task: 11, count: 1 }] },
      record(120),
      T,
    );
    expect(view.finished).toEqual(['First wood', 'Tools']);
    expect(view.chapterTitle).toBe('Chapter 3 · Stone and fire');
    expect(view.tasks.map((t) => t.status)).toEqual(['✓', '0 / 1', '1 / 2', '0 / 3']);
    expect(view.xpText).toBe('120 / 150 XP');
    expect(view.xpFraction).toBeCloseTo(40 / 70, 6);
    expect(view.nextText).toBe('Next level: Stone bricks, Bricks');
    expect(view.footer).toBe('2 more chapters');
    const reach = bookView({ done: [1, 2, 3, 4], counts: [] }, record(50), T);
    expect(reach.tasks[3]).toEqual({
      id: 8,
      label: 'Climb to height 64',
      status: '–',
      done: false,
    });
  });

  it('the last chapter and the complete book at the maximum level', () => {
    const last = bookView(
      { done: [...Array(16).keys()].map((i) => i + 1), counts: [] },
      record(400),
      T,
    );
    expect(last.footer).toBeNull();
    const end = bookView(completeProgress(T), record(600), T);
    expect(end).toMatchObject({
      level: 7,
      xpText: 'Max level',
      xpFraction: 1,
      nextText: null,
      chapterTitle: null,
      tasks: [],
      footer: 'All tasks done.',
    });
    expect(end.finished).toHaveLength(5);
  });
});

describe('texts', () => {
  it('the F3 row', () => {
    expect(progressRow({ done: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], counts: [] }, record(160), T)).toBe(
      'Chapter 3 · Task 2/4 done · Level 4 · 160/240 XP',
    );
    expect(progressRow(completeProgress(T), record(480), T)).toBe('Book complete · Level 7 · Max');
  });

  it('lock texts', () => {
    expect(lockedText(8, T)).toBe('Locked: Level 3');
    expect(lockedText(20, T)).toBe('Locked: Mine 3 coal');
  });

  it('notices of a step, in order, only the own level-ups and finds', () => {
    const me = { id: 'me', record: record(140) };
    const other = { id: 'other', record: record(0) };
    const world = {
      done: [...Array(15).keys()].map((i) => i + 1),
      counts: [{ task: 16, count: 2 }],
    };
    const step = stepProgress(
      world,
      me,
      { kind: 'mine', block: Block.IRON_ORE, item: Block.IRON_ORE, count: 1 },
      [me, other],
      T,
    );
    expect(noticeTexts(step.outcomes, 'me', T)).toEqual([
      'Task done: Mine 3 iron ore · +25 XP',
      'Chapter done: Into the dark',
      'First find: Iron ore · +40 XP',
      'Level 4 · Unlocked: Stone bricks, Bricks',
    ]);
    expect(noticeTexts(step.outcomes, 'other', T)).toEqual([
      'Task done: Mine 3 iron ore · +25 XP',
      'Chapter done: Into the dark',
    ]);
    // In a room the task names its player (Phase 8 plan 5.12).
    const named = step.outcomes.map((o) => (o.kind === 'taskDone' ? { ...o, by: 'Anna' } : o));
    expect(noticeTexts(named, 'other', T)[0]).toBe('Task done: Mine 3 iron ore (Anna) · +25 XP');
    const coal = stepProgress(
      { done: [...Array(11).keys()].map((i) => i + 1), counts: [{ task: 12, count: 2 }] },
      me,
      { kind: 'mine', block: Block.COAL_ORE, item: 256, count: 1 },
      [me],
      T,
    );
    expect(noticeTexts(coal.outcomes, 'me', T)).toContain('Unlocked: Torch');
    const craft = stepProgress(
      EMPTY_PROGRESS,
      me,
      { kind: 'craft', recipe: 2, item: 257, count: 4 },
      [me],
      T,
    );
    expect(noticeTexts(craft.outcomes, 'me', T)).toEqual([]);
  });
});

describe('trackedTask (Polish 2 AC1.2)', () => {
  const tracking = (track: number) => ({ ...createPlayerRecord('gathering'), track });
  const shown = (track: number, done: number[]) =>
    trackedTask(tracking(track), { done, counts: [] }, T)?.id ?? null;

  it('Polish 2 AC1.2: automatic shows the first open task of the open chapter', () => {
    expect(shown(0, [])).toBe(1);
    expect(shown(0, [1, 3])).toBe(2);
  });

  it('Polish 2 AC1.2: a chosen open task is shown', () => {
    expect(shown(3, [])).toBe(3);
    expect(shown(2, [1])).toBe(2);
  });

  it('Polish 2 AC1.2: when the chosen task is done the next open task after it shows', () => {
    expect(shown(2, [2])).toBe(3);
    expect(shown(2, [2, 3])).toBe(4);
    // Wrapping around to the first open task of the chapter.
    expect(shown(4, [4])).toBe(1);
    expect(shown(4, [1, 4])).toBe(2);
  });

  it('Polish 2 AC1.2: a new chapter shows its first open task', () => {
    expect(shown(4, [1, 2, 3, 4])).toBe(5);
    expect(shown(0, [1, 2, 3, 4, 5])).toBe(6);
    // An id this build does not know counts as a chosen task that is gone.
    expect(shown(999, [1, 2, 3, 4])).toBe(5);
  });

  it('Polish 2 AC1.2: hidden and a complete book show nothing', () => {
    expect(shown(-1, [])).toBeNull();
    expect(trackedTask(tracking(0), completeProgress(T), T)).toBeNull();
    expect(trackedTask(tracking(20), completeProgress(T), T)).toBeNull();
  });

  it('the line: label, two spaces, count or a dash', () => {
    const progress = { done: [1, 2, 3, 4, 5, 6, 7], counts: [] };
    const mine = trackedTask(tracking(0), { done: [], counts: [{ task: 1, count: 3 }] }, T);
    expect(mine && trackerText(mine, { done: [], counts: [{ task: 1, count: 3 }] })).toBe(
      'Mine 4 logs  3 / 4',
    );
    const climb = trackedTask(tracking(0), progress, T);
    expect(climb && trackerText(climb, progress)).toBe('Climb to height 64  –');
  });
});
