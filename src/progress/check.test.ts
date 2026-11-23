// The static check names the culprit of each broken table (Phase 8 AC1.2).
import { describe, expect, it } from 'vitest';
import { Item } from '../items/items';
import { checkTables } from './check';
import { PROGRESS_TABLES, type ProgressTables, type RecipeUnlock } from './tables';

function variant(change: Partial<ProgressTables>): ProgressTables {
  return { ...PROGRESS_TABLES, ...change };
}

function unlocks(edit: (list: RecipeUnlock[]) => RecipeUnlock[]): Partial<ProgressTables> {
  return { recipeUnlocks: edit([...PROGRESS_TABLES.recipeUnlocks]) };
}

function errorsOf(tables: ProgressTables): string[] {
  const result = checkTables(tables);
  expect(result.ok).toBe(false);
  return result.errors;
}

describe('static check (Phase 8 AC1.2)', () => {
  it('passes on the shipped tables with the planned XP per chapter', () => {
    const result = checkTables(PROGRESS_TABLES);
    expect(result.ok).toBe(true);
    expect(result.chapters.map((c) => c.xp)).toEqual([50, 125, 235, 380, 520]);
  });

  it('a recipe without unlock', () => {
    const errors = errorsOf(variant(unlocks((l) => l.filter((u) => u.recipe !== 17))));
    expect(errors).toContain('recipe 17 (glass) has no unlock');
  });

  it('a recipe with two unlocks', () => {
    const errors = errorsOf(variant(unlocks((l) => [...l, { recipe: 5, unlock: { level: 3 } }])));
    expect(errors).toContain('recipe 5 (wooden_axe) has 2 unlocks');
  });

  it('an unknown task in an unlock', () => {
    const errors = errorsOf(
      variant(
        unlocks((l) => l.map((u) => (u.recipe === 20 ? { recipe: 20, unlock: { task: 77 } } : u))),
      ),
    );
    expect(errors).toContain('recipe 20: unknown task 77');
  });

  it('a task whose item cannot be obtained before its chapter', () => {
    const tasks = PROGRESS_TABLES.tasks.map((t) =>
      t.id === 1
        ? { ...t, label: 'Make an iron pickaxe', type: 'craft' as const, target: Item.IRON_PICKAXE }
        : t,
    );
    const errors = errorsOf(variant({ tasks }));
    expect(errors).toEqual([
      'chapter 1 "First wood" cannot be finished: task 1 "Make an iron pickaxe"',
    ]);
  });

  it('a level table that falls', () => {
    const errors = errorsOf(variant({ levels: [0, 30, 80, 70, 240, 350, 480] }));
    expect(errors).toContain('level 4 does not rise above level 3');
  });

  it('a recipe only unlocked by a level the book never reaches', () => {
    const errors = errorsOf(variant({ levels: [0, 30, 80, 150, 240, 350, 5000] }));
    expect(errors).toEqual(['recipe 19 (iron_block) is never unlocked']);
  });

  it('more structural faults', () => {
    const tasks = [
      ...PROGRESS_TABLES.tasks,
      { ...PROGRESS_TABLES.tasks[0], id: 1 },
      { ...PROGRESS_TABLES.tasks[0], id: 30, chapter: 9 },
      { ...PROGRESS_TABLES.tasks[0], id: 31, type: 'place' as const, target: Item.STICK },
      { ...PROGRESS_TABLES.tasks[0], id: 32, type: 'reachBelow' as const, target: 500 },
      { ...PROGRESS_TABLES.tasks[0], id: 33, type: 'craft' as const, target: 9999, count: 0 },
    ];
    const errors = errorsOf(
      variant({
        tasks,
        chapters: [
          ...PROGRESS_TABLES.chapters,
          { id: 1, title: 'Again' },
          { id: 6, title: 'Empty' },
        ],
        levels: [5, 10],
        recipeUnlocks: [...PROGRESS_TABLES.recipeUnlocks, { recipe: 99, unlock: { level: 9 } }],
      }),
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        'chapter 1 is listed twice',
        'task 1 "Mine 4 logs": id is used twice',
        'task 30 "Mine 4 logs": unknown chapter 9',
        'task 31 "Mine 4 logs": unknown block 257',
        'task 32 "Mine 4 logs": bad height',
        'task 33 "Mine 4 logs": unknown item 9999',
        'task 33 "Mine 4 logs": bad count',
        'chapter 6 "Empty" has 0 tasks (1–6)',
        'level 1 must start at 0 XP',
        'unlock of unknown recipe 99',
        'recipe 99: unknown level 9',
      ]),
    );
  });
});
