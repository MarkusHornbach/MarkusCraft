// Phase 3 AC10.3: from an empty inventory to an iron pickaxe with valid actions only.
import { describe, expect, it } from 'vitest';
import {
  GENERATOR_VERSION,
  IRON_MAX_Y,
  PLAYER_EYE_HEIGHT,
  SEA_LEVEL,
  WALK_SPEED,
  WORLD_HEIGHT,
} from '../game/config';
import { breakTimeMs } from '../items/hardness';
import { countItems } from '../items/inventory';
import { Item, itemLabel } from '../items/items';
import { RECIPES } from '../items/recipes';
import { BLOCK_SOLID, Block } from '../world/blocks';
import { findSpawn } from '../world/generation/spawn';
import { getTerrain } from '../world/generation/terrain';
import { World } from '../world/World';
import type { Action } from './actions';
import type { ActionResult } from './apply';
import { createPlayerRecord } from './playerRecord';
import { LocalSession } from './Session';

type Cell = readonly [number, number, number];

const SEED = 1337;
/** Chunks generated around the start point: 9 × 9. */
const RADIUS = 4;

/**
 * A player who only ever submits actions. Walking is not an action: the script moves the
 * pose itself, but only into cells that are free, and it breaks only blocks that lie open
 * (one of their six neighbours is not solid), as a player who has to see a block would.
 */
class Script {
  readonly world = new World(SEED, GENERATOR_VERSION);
  readonly session: LocalSession;
  readonly log: string[] = [];
  pose: { x: number; y: number; z: number };
  nowMs = 0;
  breakMs = 0;
  walked = 0;
  actions = 0;
  /** Cells the script has dug out, the latest last. */
  readonly dug: Cell[] = [];

  constructor() {
    const spawn = findSpawn(getTerrain(SEED));
    const cx = Math.floor(spawn.x / 16);
    const cz = Math.floor(spawn.z / 16);
    for (let dz = -RADIUS; dz <= RADIUS; dz++) {
      for (let dx = -RADIUS; dx <= RADIUS; dx++) this.world.generate(cx + dx, cz + dz);
    }
    this.pose = { x: spawn.x + 0.5, y: spawn.y, z: spawn.z + 0.5 };
    this.session = new LocalSession(
      { world: this.world, mode: 'gathering', pose: () => this.pose, nowMs: () => this.nowMs },
      createPlayerRecord('gathering'),
      {
        onBlocks: () => {},
        onPlayer: () => {},
        onResult: (action, result) => this.onResult(action, result),
      },
    );
  }

  /** Every action of the script must be accepted. */
  private onResult(action: Action, result: ActionResult): void {
    this.actions++;
    if (!result.ok) throw new Error(`${JSON.stringify(action)} was refused: ${result.reason}`);
  }

  get cell(): Cell {
    return [Math.floor(this.pose.x), Math.floor(this.pose.y), Math.floor(this.pose.z)];
  }

  block([x, y, z]: Cell): number {
    return this.world.getBlock(x, y, z);
  }

  solid(cell: Cell): boolean {
    return BLOCK_SOLID[this.block(cell)] === 1;
  }

  count(item: number): number {
    return countItems(this.session.record.slots, item);
  }

  /** Moves the player into a cell; feet and head must be free there. */
  moveTo([x, y, z]: Cell): void {
    expect(this.solid([x, y, z]), `feet at ${x},${y},${z}`).toBe(false);
    expect(this.solid([x, y + 1, z]), `head at ${x},${y + 1},${z}`).toBe(false);
    this.walked += Math.hypot(x + 0.5 - this.pose.x, z + 0.5 - this.pose.z);
    this.pose = { x: x + 0.5, y, z: z + 0.5 };
  }

  /** Puts the item into the hand: selects its bar slot, moving it into the bar if needed. */
  hold(item: number): void {
    const { slots, selectedSlot } = this.session.record;
    if (slots[selectedSlot]?.item === item) return;
    let slot = slots.findIndex((stack) => stack?.item === item);
    expect(slot, `${itemLabel(item)} in the inventory`).toBeGreaterThanOrEqual(0);
    if (slot >= 9) {
      this.session.submit({ kind: 'moveStack', from: slot, to: 8 });
      slot = 8;
    }
    this.session.submit({ kind: 'selectSlot', slot });
  }

  /** The best tool the player owns for a block, or nothing. */
  private toolFor(block: number): number | null {
    const picks = [Item.IRON_PICKAXE, Item.STONE_PICKAXE, Item.WOODEN_PICKAXE];
    const rock: number[] = [Block.STONE, Block.COAL_ORE, Block.IRON_ORE];
    if (!rock.includes(block)) return null;
    return picks.find((item) => this.count(item) > 0) ?? null;
  }

  /** Breaks a block that lies open: `startBreak`, its break time, `break`. */
  breakBlock(cell: Cell): void {
    const [x, y, z] = cell;
    const block = this.block(cell);
    const open = [
      [x + 1, y, z],
      [x - 1, y, z],
      [x, y + 1, z],
      [x, y - 1, z],
      [x, y, z + 1],
      [x, y, z - 1],
    ].some(([nx, ny, nz]) => !this.solid([nx, ny, nz]));
    expect(open, `block at ${x},${y},${z} lies open`).toBe(true);
    const tool = this.toolFor(block);
    if (tool !== null) this.hold(tool);
    const held = this.session.record.slots[this.session.record.selectedSlot]?.item ?? null;
    const time = breakTimeMs(block, held) ?? 0;
    this.session.submit({ kind: 'startBreak', x, y, z });
    this.nowMs += time;
    this.breakMs += time;
    this.session.submit({ kind: 'break', x, y, z });
    // No water flowed in: the script digs on dry land.
    expect(this.block(cell)).toBe(Block.AIR);
    this.dug.push(cell);
  }

  /**
   * Digs a way to a cell and steps into it: down first, then sideways (two cells high),
   * then up. Going up stands for stacking blocks under the feet, which is not simulated.
   */
  digTo(target: Cell): void {
    for (let guard = 0; guard < 500; guard++) {
      const [x, y, z] = this.cell;
      let next: Cell;
      let needed: Cell[];
      if (y > target[1]) {
        next = [x, y - 1, z];
        needed = [next];
      } else if (x !== target[0] || z !== target[2]) {
        next =
          x !== target[0]
            ? [x + Math.sign(target[0] - x), y, z]
            : [x, y, z + Math.sign(target[2] - z)];
        needed = [[next[0], y + 1, next[2]], next];
      } else if (y < target[1]) {
        next = [x, y + 1, z];
        needed = [[x, y + 2, z]];
      } else {
        return;
      }
      for (const cell of needed) if (this.solid(cell)) this.breakBlock(cell);
      this.moveTo(next);
    }
    throw new Error('the way is too long');
  }

  place(cell: Cell, item: number): void {
    this.hold(item);
    const [x, y, z] = cell;
    this.session.submit({ kind: 'place', x, y, z, slot: this.session.record.selectedSlot });
  }

  craft(name: string, times = 1): void {
    const recipe = RECIPES.find((r) => r.name === name);
    if (!recipe) throw new Error(`no recipe ${name}`);
    for (let i = 0; i < times; i++) this.session.submit({ kind: 'craft', recipe: recipe.id });
  }

  /** Height of the ground of a column: the highest block that is no tree and no air. */
  groundY(x: number, z: number): number {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      const id = this.world.getBlock(x, y, z);
      if (id !== Block.AIR && id !== Block.LEAVES && id !== Block.LOG) return y;
    }
    return -1;
  }

  note(text: string): void {
    this.log.push(`${(this.nowMs / 1000).toFixed(1).padStart(6)} s  ${text}`);
  }
}

/** Columns around a centre, nearest first. */
function columnsAround(cx: number, cz: number, radius: number): [number, number][] {
  const columns: [number, number][] = [];
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) columns.push([cx + dx, cz + dz]);
  }
  return columns.sort(
    (a, b) => Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b[0] - cx, b[1] - cz),
  );
}

describe('from nothing to an iron pickaxe (Phase 3 AC10.3)', () => {
  it('a scripted sequence of valid actions ends with an iron pickaxe', () => {
    const s = new Script();
    const [sx, , sz] = s.cell;
    expect(countItems(s.session.record.slots)).toBe(0);

    // 1. Wood: nine logs from the nearest trees. Three become planks, six become coal.
    const trunks = columnsAround(sx, sz, 56).filter(
      ([x, z]) => s.world.getBlock(x, s.groundY(x, z) + 1, z) === Block.LOG,
    );
    for (const [tx, tz] of trunks) {
      if (s.count(Block.LOG) >= 9) break;
      // Stand beside the trunk, on the ground.
      const side = columnsAround(tx, tz, 1).find(([x, z]) => {
        const y = s.groundY(x, z) + 1;
        const dry = s.world.getBlock(x, y - 1, z) !== Block.WATER;
        return (x !== tx || z !== tz) && dry && !s.solid([x, y, z]) && !s.solid([x, y + 1, z]);
      });
      if (!side) continue;
      s.moveTo([side[0], s.groundY(side[0], side[1]) + 1, side[1]]);
      for (let y = s.groundY(tx, tz) + 1; s.count(Block.LOG) < 9; y++) {
        if (s.world.getBlock(tx, y, tz) !== Block.LOG) break;
        // The top of a tall trunk may be out of reach from the ground.
        if (y + 0.5 - (s.pose.y + PLAYER_EYE_HEIGHT) > 5) break;
        s.breakBlock([tx, y, tz]);
      }
    }
    expect(s.count(Block.LOG)).toBe(9);
    s.note('9 logs by hand');

    // 2. Planks, sticks, a workbench; with it the wooden pickaxe.
    s.craft('planks', 3);
    s.craft('sticks', 2);
    s.craft('workbench');
    const [bx, by, bz] = s.cell;
    const beside = columnsAround(bx, bz, 2).find(
      ([x, z]) => (x !== bx || z !== bz) && s.groundY(x, z) === by - 1 && !s.solid([x, by, z]),
    );
    if (!beside) throw new Error('no place for the workbench');
    const bench: Cell = [beside[0], by, beside[1]];
    s.place(bench, Block.WORKBENCH);
    expect(s.block(bench)).toBe(Block.WORKBENCH);
    s.craft('wooden_pickaxe');
    expect(s.count(Item.WOODEN_PICKAXE)).toBe(1);
    s.breakBlock(bench);
    s.note('planks, sticks, workbench, wooden pickaxe; workbench taken along');

    // 3. Iron: the nearest ore under dry land, away from every lake.
    const dryLand = (x: number, z: number): boolean =>
      columnsAround(x, z, 6).every(([cx, cz]) => s.groundY(cx, cz) > SEA_LEVEL);
    let ore: Cell | null = null;
    for (const [x, z] of columnsAround(sx, sz, 40)) {
      if (!dryLand(x, z)) continue;
      for (let y = IRON_MAX_Y; y >= 4 && !ore; y--) {
        if (s.world.getBlock(x, y, z) === Block.IRON_ORE) ore = [x, y, z];
      }
      if (ore) break;
    }
    if (!ore) throw new Error('no iron ore near the start point');
    s.moveTo([ore[0], s.groundY(ore[0], ore[2]) + 1, ore[2]]);

    // 4. Down the shaft: soil by hand, then stone with the wooden pickaxe.
    while (s.count(Block.STONE) < 11) s.digTo([ore[0], s.cell[1] - 1, ore[2]]);
    expect(s.cell[1]).toBeGreaterThan(ore[1]);
    s.note(`11 stone with the wooden pickaxe, at y ${s.cell[1]}`);

    // 5. Stone pickaxe and furnace at the workbench, set up in the shaft above the head.
    const above = (dy: number): Cell => [s.cell[0], s.cell[1] + dy, s.cell[2]];
    s.place(above(2), Block.WORKBENCH);
    s.craft('stone_pickaxe');
    s.craft('furnace');
    expect(s.count(Item.STONE_PICKAXE)).toBe(1);
    s.place(above(3), Block.FURNACE);
    s.craft('coal', 3);
    expect(s.count(Item.COAL)).toBe(3);
    s.breakBlock(above(3));
    s.breakBlock(above(2));
    s.note('stone pickaxe, furnace, 3 coal from 6 logs; both stations taken along');

    // 6. Three iron ores: the first one below, the others the nearest ones around.
    s.digTo(ore);
    for (let found = 1; found < 3; found++) {
      const [x0, y0, z0] = s.cell;
      let best: Cell | null = null;
      let bestDistance = Infinity;
      for (let y = Math.max(4, y0 - 12); y <= Math.min(IRON_MAX_Y, y0 + 12); y++) {
        for (const [x, z] of columnsAround(x0, z0, 12)) {
          if (s.world.getBlock(x, y, z) !== Block.IRON_ORE) continue;
          const distance = Math.abs(x - x0) + Math.abs(y - y0) + Math.abs(z - z0);
          if (distance < bestDistance) [best, bestDistance] = [[x, y, z], distance];
        }
      }
      if (!best) throw new Error('no further iron ore');
      s.digTo(best);
    }
    expect(s.count(Block.IRON_ORE)).toBe(3);
    s.note(`3 iron ore with the stone pickaxe, at y ${s.cell[1]}`);

    // 7. Smelt and forge, with the stations set into the tunnel behind the player.
    const free = s.dug
      .filter(([x, y, z]) => {
        const [px, py, pz] = s.cell;
        const body = x === px && z === pz && (y === py || y === py + 1);
        return !body && !s.solid([x, y, z]);
      })
      .slice(-2);
    expect(free.length).toBe(2);
    s.place(free[0], Block.FURNACE);
    s.place(free[1], Block.WORKBENCH);
    s.craft('iron_ingot', 3);
    s.craft('iron_pickaxe');
    s.note('3 iron ingots, iron pickaxe');

    expect(s.count(Item.IRON_PICKAXE)).toBe(1);
    expect(s.count(Item.IRON_INGOT)).toBe(0);
    expect(s.count(Item.STICK)).toBe(2);

    // The path, for the report: break time is simulated exactly, walking is estimated.
    const walkMs = (s.walked / WALK_SPEED) * 1000;
    console.info(
      [
        ...s.log,
        `actions: ${s.actions}, breaking: ${(s.breakMs / 1000).toFixed(1)} s, ` +
          `walking ${s.walked.toFixed(0)} blocks: about ${(walkMs / 1000).toFixed(0)} s`,
      ].join('\n'),
    );
    expect(s.nowMs).toBe(s.breakMs);
    // A few minutes of holding the button, not an hour.
    expect(s.breakMs).toBeLessThan(5 * 60 * 1000);
  });
});
