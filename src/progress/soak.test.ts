// 1 000 random actions in an Adventure world with the progress engine on (Phase 8 AC6.4).
import { describe, expect, it } from 'vitest';
import type { Action } from '../actions/actions';
import { type ActionResult, heldItem } from '../actions/apply';
import { type ItemStack, type PlayerRecord, createPlayerRecord } from '../actions/playerRecord';
import { LocalSession } from '../actions/Session';
import { dropOf } from '../items/hardness';
import { Item } from '../items/items';
import { getRecipe } from '../items/recipes';
import { mulberry32, randInt } from '../util/rng';
import { Block } from '../world/blocks';
import type { WorldProgress } from './progress';
import { CHAPTERS, FIRST_CRAFT_XP, FIRST_FIND_XP, LEVELS, TASKS } from './tables';

const FLOOR = [Block.LOG, Block.STONE, Block.COAL_ORE, Block.IRON_ORE, Block.DIRT, Block.SAND];

class Cells {
  readonly cells = new Map<string, number>();
  getBlock(x: number, y: number, z: number): number {
    const own = this.cells.get(`${x},${y},${z}`);
    if (own !== undefined) return own;
    if (y < 9) return Block.STONE;
    if (y > 9) return Block.AIR;
    return FLOOR[(((x * 7 + z * 13) % FLOOR.length) + FLOOR.length) % FLOOR.length];
  }
  setBlock(x: number, y: number, z: number, id: number): boolean {
    this.cells.set(`${x},${y},${z}`, id);
    return true;
  }
}

/** A second, plain implementation of the counting rules of plan 5.3. */
class Model {
  done = new Set<number>();
  counts = new Map<number, number>();
  xp = 0;
  found = new Set<number>();
  crafted = new Set<number>();

  private chapter(): number | null {
    for (const c of CHAPTERS) {
      if (TASKS.some((t) => t.chapter === c.id && !this.done.has(t.id))) return c.id;
    }
    return null;
  }

  private bump(match: (type: string, target: number) => number): void {
    const chapter = this.chapter();
    if (chapter === null) return;
    const open = TASKS.filter((t) => t.chapter === chapter && !this.done.has(t.id));
    for (const t of open) {
      const n = match(t.type, t.target);
      if (n === 0) continue;
      const count = Math.min(t.count, (this.counts.get(t.id) ?? 0) + n);
      if (count === t.count) {
        this.done.add(t.id);
        this.counts.delete(t.id);
        this.xp += t.xp;
      } else {
        this.counts.set(t.id, count);
      }
    }
  }

  mine(block: number, item: number): void {
    this.bump((type, target) => (type === 'mine' && target === item ? 1 : 0));
    const xp = FIRST_FIND_XP.get(block);
    if (xp !== undefined && !this.found.has(block)) {
      this.found.add(block);
      this.xp += xp;
    }
  }

  craft(recipe: number, item: number, count: number): void {
    this.bump((type, target) => (type === 'craft' && target === item ? count : 0));
    if (!this.crafted.has(recipe)) {
      this.crafted.add(recipe);
      this.xp += FIRST_CRAFT_XP;
    }
  }

  place(block: number): void {
    this.bump((type, target) => (type === 'place' && target === block ? 1 : 0));
  }

  pose(y: number): void {
    this.bump((type, target) =>
      (type === 'reachBelow' && y <= target) || (type === 'reachAbove' && y >= target) ? 1 : 0,
    );
  }

  level(): number {
    return LEVELS.filter((l) => this.xp >= l).length;
  }
}

function startRecord(): PlayerRecord {
  const record = createPlayerRecord('gathering');
  const slots: (ItemStack | null)[] = [...record.slots];
  const give: [number, number][] = [
    [Item.STONE_PICKAXE, 1],
    [Block.PLANKS, 64],
    [Block.LOG, 64],
    [Block.STONE, 64],
    [Block.WORKBENCH, 3],
    [Block.FURNACE, 3],
    [Block.TORCH, 64],
    [Block.STONE_BRICKS, 64],
    [Item.COAL, 64],
    [Item.STICK, 64],
    [Block.SAND, 64],
    [Block.IRON_ORE, 30],
  ];
  give.forEach(([item, count], i) => (slots[i] = { item, count }));
  return { ...record, slots };
}

describe('soak with the progress engine (Phase 8 AC6.4)', () => {
  it('after every action the progress and XP equal an independent computation', () => {
    const rng = mulberry32(8008);
    const world = new Cells();
    // Out of the cells the run breaks and places in.
    world.setBlock(2, 11, 2, Block.WORKBENCH);
    world.setBlock(-2, 11, 2, Block.FURNACE);
    const pose = { x: 0.5, y: 10, z: 0.5 };
    let nowMs = 0;
    const view: { book: WorldProgress | null } = { book: null };
    const results: ActionResult[] = [];
    const session = new LocalSession(
      { world, mode: 'gathering', pose: () => pose, nowMs: () => nowMs },
      startRecord(),
      {
        onBlocks: () => {},
        onPlayer: () => {},
        onResult: (_a, r) => results.push(r),
        onProgress: (p) => (view.book = p),
      },
    );
    view.book = session.progress;
    const model = new Model();
    const reasons = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      const x = randInt(rng, 7) - 3;
      const z = randInt(rng, 7) - 3;
      const y = 8 + randInt(rng, 3);
      let action: Action;
      switch (randInt(rng, 10)) {
        case 0:
        case 7:
        case 8:
          // Started now; the break follows as the next action, mostly when it is due.
          session.submit({ kind: 'startBreak', x, y, z });
          nowMs += randInt(rng, 4) === 0 ? 10 : 6000;
          action = { kind: 'break', x, y, z };
          break;
        case 1: {
          // A break of the cell last started, mostly when it is due.
          const b = session.record.breaking;
          nowMs += randInt(rng, 4) === 0 ? 10 : 6000;
          action = b ? { kind: 'break', x: b.x, y: b.y, z: b.z } : { kind: 'break', x, y, z };
          break;
        }
        case 2:
          action = { kind: 'place', x, y: 10, z, slot: randInt(rng, 9) };
          break;
        case 3:
        case 4:
          action = { kind: 'craft', recipe: randInt(rng, 22) };
          break;
        case 5:
          // Mostly back to the pickaxe, so that stone and ores yield.
          action = { kind: 'selectSlot', slot: randInt(rng, 2) === 0 ? 0 : randInt(rng, 9) };
          break;
        case 6:
          // Room for what is made: the backpack is emptied now and then.
          action = { kind: 'discard', slot: 9 + randInt(rng, 27) };
          break;
        default:
          // The pickaxe stays in slot 0.
          action = { kind: 'moveStack', from: 1 + randInt(rng, 35), to: 1 + randInt(rng, 35) };
      }
      const before = session.record;
      const block = 'x' in action ? world.getBlock(action.x, action.y, action.z) : 0;
      session.submit(action);
      const result = results[results.length - 1];
      reasons.set(
        result.ok ? 'ok' : result.reason,
        (reasons.get(result.ok ? 'ok' : result.reason) ?? 0) + 1,
      );
      if (result.ok) {
        if (action.kind === 'break') {
          const drop = dropOf(block, heldItem(before));
          if (drop) model.mine(block, drop.item);
        } else if (action.kind === 'craft') {
          const recipe = getRecipe(action.recipe);
          if (recipe) model.craft(recipe.id, recipe.result.item, recipe.result.count);
        } else if (action.kind === 'place') {
          model.place(result.blocks[0].id);
        }
      }
      // The feet now and then high up or deep down.
      const feet = [10, 25, 70, 40][randInt(rng, 4)];
      session.notePose(feet);
      model.pose(feet);

      const book = view.book;
      if (!book) throw new Error('no progress');
      expect([...book.done].sort((a, b) => a - b)).toEqual([...model.done].sort((a, b) => a - b));
      expect(new Map(book.counts.map((c) => [c.task, c.count]))).toEqual(model.counts);
      expect(session.record.xp).toBe(model.xp);
      expect([...session.record.found].sort()).toEqual([...model.found].sort());
      expect([...session.record.crafted].sort()).toEqual([...model.crafted].sort());
      expect(session.progress).toBe(book);
    }
    // The run finished tasks and met locked recipes on the way (the tuned counts are large
    // for random actions: the comparison after every action is what this test is about).
    expect(model.done.size).toBeGreaterThanOrEqual(2);
    expect(reasons.get('locked') ?? 0).toBeGreaterThan(10);
    expect(model.xp).toBeGreaterThan(0);
  });
});
