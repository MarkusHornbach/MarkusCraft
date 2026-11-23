// The goal bot: plays an Adventure world through a LocalSession with valid actions only,
// one generic skill per task type, and keeps a rough clock of how long it took (plan 5.10).
import type { Action } from '../actions/actions';
import type { ActionResult } from '../actions/apply';
import { createPlayerRecord } from '../actions/playerRecord';
import { LocalSession } from '../actions/Session';
import { PLAYER_EYE_HEIGHT, REACH, WORLD_HEIGHT } from '../game/config';
import { breakTimeMs, dropOf, toolClassOf } from '../items/hardness';
import { countItems, fits } from '../items/inventory';
import { Item, getItemDef, itemLabel, toolOf } from '../items/items';
import { RECIPES, type Recipe, STATION_BLOCKS, stationsNear } from '../items/recipes';
import { type ProgressOutcome, levelOf, openChapter, recipeUnlocked } from '../progress/progress';
import { BOT_TIME, NATURAL_BLOCKS, TASKS, type Task } from '../progress/tables';
import { BLOCK_SOLID, Block, isSupport } from '../world/blocks';
import { findSpawn } from '../world/generation/spawn';
import { getTerrain } from '../world/generation/terrain';
import type { WorldGen } from '../world/generation/worldOptions';
import { World } from '../world/World';

export type Cell = readonly [number, number, number];

/** When a task was finished, and what the bot did up to then. */
export interface TaskTime {
  id: number;
  label: string;
  chapter: number;
  /** Bot time from the previous task's end to this one's (ms). */
  ms: number;
  /** Bot time since the start when it was done (ms). */
  atMs: number;
}

export interface BotRun {
  seed: number;
  gen: WorldGen;
  completed: boolean;
  /** Why the run stopped early, with the task and position. */
  error: string | null;
  tasks: TaskTime[];
  levelUps: { level: number; atMs: number }[];
  totalMs: number;
  actions: number;
  broken: number;
  /** Every recipe unlocked at the end. */
  allUnlocked: boolean;
  /** Cells whose stored light differs from the reference at the end (must be 0). */
  lightErrors: number;
}

/** Blocks a pillar is built of, in the order the bot uses them. */
const PILLAR_BLOCKS: readonly number[] = [Block.DIRT, Block.GRASS, Block.STONE, Block.SAND];
/** Items the bot throws away when it needs room, least useful first. */
const JUNK: readonly number[] = [Block.LEAVES, Block.CLAY, Block.GRASS, Block.DIRT, Block.SAND];
/** How far the bot looks for a block it needs (blocks, horizontally). */
const SEARCH_RADIUS = 64;
const STEP_GUARD = 4000;
/** A run stops after this much bot time: something went wrong. */
const MAX_BOT_MS = 3 * 60 * 60 * 1000;

const TOOL_ITEMS: readonly number[] = [
  Item.IRON_PICKAXE,
  Item.STONE_PICKAXE,
  Item.WOODEN_PICKAXE,
  Item.IRON_AXE,
  Item.STONE_AXE,
  Item.WOODEN_AXE,
  Item.IRON_SHOVEL,
  Item.STONE_SHOVEL,
  Item.WOODEN_SHOVEL,
];

class BotError extends Error {}

export class Bot {
  readonly world: World;
  readonly session: LocalSession;
  pose: { x: number; y: number; z: number };
  clockMs = 0;
  actions = 0;
  broken = 0;
  readonly tasks: TaskTime[] = [];
  readonly levelUps: { level: number; atMs: number }[] = [];
  private lastDoneMs = 0;
  private lastResult: ActionResult | null = null;
  /** Stations the bot placed and has not taken back yet. */
  private readonly placedStations: Cell[] = [];

  constructor(
    readonly seed: number,
    readonly gen: WorldGen,
  ) {
    this.world = new World(seed, gen);
    const spawn = findSpawn(getTerrain(seed, gen));
    const cx = Math.floor(spawn.x / 16);
    const cz = Math.floor(spawn.z / 16);
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) this.world.generate(cx + dx, cz + dz);
    }
    // Light around the start, so that the light invariant is checked where the bot digs.
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) this.world.light(cx + dx, cz + dz);
    }
    this.pose = { x: spawn.x + 0.5, y: spawn.y, z: spawn.z + 0.5 };
    const world = this.world;
    const reader = {
      // The bot knows the world: chunks appear as it looks at them.
      getBlock: (x: number, y: number, z: number): number => this.block([x, y, z]),
      // Only the session sets blocks (the pipeline rule): it gets the world's own method.
      setBlock: world.setBlock.bind(world),
    };
    this.session = new LocalSession(
      { world: reader, mode: 'gathering', pose: () => this.pose, nowMs: () => this.clockMs },
      createPlayerRecord('gathering'),
      {
        onBlocks: () => {},
        onPlayer: () => {},
        onResult: (_action, result) => {
          this.actions++;
          this.lastResult = result;
        },
        onProgress: (_progress, outcomes) => this.onOutcomes(outcomes),
      },
    );
  }

  private onOutcomes(outcomes: readonly ProgressOutcome[]): void {
    for (const outcome of outcomes) {
      if (outcome.kind === 'taskDone') {
        const task = TASKS.find((t) => t.id === outcome.task);
        this.tasks.push({
          id: outcome.task,
          label: task?.label ?? '',
          chapter: task?.chapter ?? 0,
          ms: this.clockMs - this.lastDoneMs,
          atMs: this.clockMs,
        });
        this.lastDoneMs = this.clockMs;
      } else if (outcome.kind === 'levelUp') {
        this.levelUps.push({ level: outcome.level, atMs: this.clockMs });
      }
    }
  }

  // --- the world -----------------------------------------------------------------------

  block([x, y, z]: Cell): number {
    if (y < 0) return Block.BEDROCK;
    if (y >= WORLD_HEIGHT) return Block.AIR;
    const cx = Math.floor(x / 16);
    const cz = Math.floor(z / 16);
    if (!this.world.hasChunk(cx, cz)) this.world.generate(cx, cz);
    return this.world.getBlock(x, y, z);
  }

  solid(cell: Cell): boolean {
    return BLOCK_SOLID[this.block(cell)] === 1;
  }

  get cell(): Cell {
    return [Math.floor(this.pose.x), Math.floor(this.pose.y), Math.floor(this.pose.z)];
  }

  count(item: number): number {
    return countItems(this.session.record.slots, item);
  }

  private open([x, y, z]: Cell): boolean {
    return (
      [
        [x + 1, y, z],
        [x - 1, y, z],
        [x, y + 1, z],
        [x, y - 1, z],
        [x, y, z + 1],
        [x, y, z - 1],
      ] as const
    ).some((c) => !this.solid(c));
  }

  private withinReach([x, y, z]: Cell): boolean {
    const dx = x + 0.5 - this.pose.x;
    const dy = y + 0.5 - (this.pose.y + PLAYER_EYE_HEIGHT);
    const dz = z + 0.5 - this.pose.z;
    return Math.hypot(dx, dy, dz) <= REACH - 0.5;
  }

  fail(text: string): never {
    const [x, y, z] = this.cell;
    throw new BotError(`${text} (at ${x},${y},${z}, ${(this.clockMs / 1000).toFixed(0)} s)`);
  }

  // --- actions -------------------------------------------------------------------------

  /** Every action must be accepted: a refusal ends the run. */
  private submit(action: Action): void {
    this.lastResult = null;
    this.session.submit(action);
    const result = this.lastResult as ActionResult | null;
    if (!result) this.fail(`no answer to ${JSON.stringify(action)}`);
    if (!result.ok) this.fail(`${JSON.stringify(action)} was refused: ${result.reason}`);
    if (this.clockMs > MAX_BOT_MS) this.fail('the run takes too long');
  }

  /** Walks into a cell: feet and head must be free. Falls to the floor afterwards. */
  private moveTo(cell: Cell, climbing = false): void {
    const [x, y, z] = cell;
    if (this.solid(cell) || this.solid([x, y + 1, z])) this.fail(`cell ${x},${y},${z} is not free`);
    const distance = Math.hypot(x + 0.5 - this.pose.x, y - this.pose.y, z + 0.5 - this.pose.z);
    this.clockMs += climbing
      ? (1000 / BOT_TIME.pillarSpeed) * distance
      : (1000 * distance * BOT_TIME.pathFactor) / BOT_TIME.walkSpeed;
    this.pose = { x: x + 0.5, y, z: z + 0.5 };
    this.session.notePose(y);
    if (!climbing) this.fall();
  }

  private fall(): void {
    const [x, start, z] = this.cell;
    let y = start;
    while (y > 0 && !this.solid([x, y - 1, z])) y--;
    if (y === start) return;
    this.pose = { x: x + 0.5, y, z: z + 0.5 };
    this.session.notePose(y);
  }

  /** Puts an item into the hand, moving it into the bar if needed. */
  hold(item: number): void {
    const { slots, selectedSlot } = this.session.record;
    if (slots[selectedSlot]?.item === item) return;
    let slot = slots.findIndex((stack) => stack?.item === item);
    if (slot < 0) this.fail(`no ${itemLabel(item)} to hold`);
    if (slot >= 9) {
      this.submit({ kind: 'moveStack', from: slot, to: 8 });
      slot = 8;
    }
    this.submit({ kind: 'selectSlot', slot });
  }

  /** The best owned tool for a block's class (fastest; for gated blocks one that yields). */
  private bestTool(block: number): number | null {
    const cls = toolClassOf(block);
    if (!cls) return null;
    let best: number | null = null;
    for (const item of TOOL_ITEMS) {
      const tool = toolOf(item);
      if (!tool || tool.class !== cls || this.count(item) === 0) continue;
      if (best === null || (toolOf(best)?.tier ?? 0) < tool.tier) best = item;
    }
    return best;
  }

  /**
   * Throws junk away until `count` of `item` fit. One stack of pillar blocks stays as long
   * as other junk can go.
   */
  private makeRoom(item: number, count = 1): void {
    for (const junk of JUNK) {
      if (fits(this.session.record.slots, item, count)) return;
      if (junk === item) continue;
      const slots = this.session.record.slots;
      const slot = slots.findIndex((s) => s?.item === junk);
      const pillar = PILLAR_BLOCKS.filter((b) => b !== junk).some((b) => this.count(b) > 0);
      if (junk === Block.DIRT && !pillar && slots.filter((s) => s?.item === junk).length < 2) {
        continue;
      }
      if (slot >= 0) this.submit({ kind: 'discard', slot });
    }
    // Several stacks of one junk item.
    for (let guard = 0; guard < 36 && !fits(this.session.record.slots, item, count); guard++) {
      const slot = this.session.record.slots.findIndex(
        (s) => s !== null && JUNK.includes(s.item) && s.item !== item,
      );
      if (slot < 0) this.fail(`no room for ${itemLabel(item)}`);
      this.submit({ kind: 'discard', slot });
    }
  }

  /** Breaks a block that lies open and is within reach, with the best tool owned. */
  breakBlock(cell: Cell): void {
    const block = this.block(cell);
    if (!this.open(cell)) this.fail(`block at ${cell.join(',')} does not lie open`);
    if (!this.withinReach(cell)) this.fail(`block at ${cell.join(',')} is out of reach`);
    const tool = this.bestTool(block);
    if (tool !== null) this.hold(tool);
    const held = this.session.record.slots[this.session.record.selectedSlot]?.item ?? null;
    const drop = dropOf(block, held);
    if (drop) this.makeRoom(drop.item, drop.count);
    const above = this.block([cell[0], cell[1] + 1, cell[2]]);
    if (above === Block.TORCH) this.makeRoom(Block.TORCH);
    const [x, y, z] = cell;
    this.submit({ kind: 'startBreak', x, y, z });
    this.clockMs += breakTimeMs(block, held) ?? 0;
    this.submit({ kind: 'break', x, y, z });
    this.broken++;
  }

  private clear(cell: Cell): void {
    if (this.solid(cell)) this.breakBlock(cell);
  }

  /** Places an item into a cell. */
  private placeAt(cell: Cell, item: number): void {
    this.hold(item);
    const [x, y, z] = cell;
    this.submit({ kind: 'place', x, y, z, slot: this.session.record.selectedSlot });
    this.clockMs += BOT_TIME.actionRepeatMs;
  }

  /** A free cell next to the player where `block` can stand; cleared if needed. */
  private placeCell(block: number): Cell {
    const here = this.placeCellNear();
    if (here) return here;
    // Somewhere awkward (in a tree, on a pillar): to open ground nearby first.
    const ground = this.standableNear((c) => this.neighbourFor(c) !== null);
    if (ground) {
      this.goTo(ground);
      const there = this.placeCellNear();
      if (there) return there;
    }
    // Underground, with every cell around used: a step into fresh rock, which can be dug.
    for (let attempt = 0; attempt < 4; attempt++) {
      const [x, y, z] = this.cell;
      const dir = (
        [
          [1, 0],
          [0, 1],
          [-1, 0],
          [0, -1],
        ] as const
      ).find(
        ([dx, dz]) =>
          this.solid([x + 2 * dx, y, z + 2 * dz]) && this.solid([x + 2 * dx, y - 1, z + 2 * dz]),
      );
      if (!dir) break;
      // Two steps: past what was placed next to the player into rock.
      this.goTo([x + 2 * dir[0], y, z + 2 * dir[1]]);
      const fresh = this.placeCellNear();
      if (fresh) return fresh;
    }
    return this.fail(`no place for ${itemLabel(block)}`);
  }

  /** A free cell next to `from` (feet level) with a solid cube below it, if any. */
  private neighbourFor([x, y, z]: Cell): Cell | null {
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const c: Cell = [x + dx, y, z + dz];
      if (this.block(c) === Block.AIR && isSupport(this.block([c[0], y - 1, c[2]]))) return c;
    }
    return null;
  }

  /** The nearest cell on the ground (no leaves, logs or water under it) that `ok` accepts. */
  private standableNear(ok: (c: Cell) => boolean, radius = 12): Cell | null {
    const [px, py, pz] = this.cell;
    let best: Cell | null = null;
    let bestCost = Infinity;
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = px + dx;
        const z = pz + dz;
        for (let y = Math.min(WORLD_HEIGHT - 3, py + 6); y > Math.max(1, py - 32); y--) {
          const below = this.block([x, y - 1, z]);
          if (!isSupport(below) || below === Block.LEAVES || below === Block.LOG) continue;
          if (this.solid([x, y, z]) || this.solid([x, y + 1, z])) continue;
          if (this.block([x, y, z]) === Block.WATER) continue;
          const cost = Math.hypot(dx, dz) + Math.abs(y - py) * 2;
          if (cost < bestCost && ok([x, y, z])) [best, bestCost] = [[x, y, z], cost];
          break;
        }
      }
    }
    return best;
  }

  private placeCellNear(): Cell | null {
    const [px, py, pz] = this.cell;
    const around: Cell[] = [];
    for (const dy of [0, 1, -1]) {
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
      ]) {
        around.push([px + dx, py + dy, pz + dz]);
      }
    }
    const fitsHere = (c: Cell): boolean =>
      !this.solid(c) &&
      this.block(c) !== Block.TORCH &&
      this.block(c) !== Block.WATER &&
      isSupport(this.block([c[0], c[1] - 1, c[2]])) &&
      this.withinReach(c);
    const free = around.find(fitsHere);
    if (free) return free;
    // Dig a side cell at the feet free; the block below it carries the new one.
    for (const c of around.slice(0, 4)) {
      if (this.solid(c) && isSupport(this.block([c[0], c[1] - 1, c[2]])) && this.open(c)) {
        this.breakBlock(c);
        if (fitsHere(c)) return c;
      }
    }
    return null;
  }

  // --- moving ----------------------------------------------------------------------------

  /** One block up: clear the head room, jump, place a block under the feet. */
  private pillarUp(): void {
    const [x, y, z] = this.cell;
    this.clear([x, y + 2, z]);
    let item = PILLAR_BLOCKS.find((b) => this.count(b) > 0);
    if (item === undefined) {
      this.obtain(Block.DIRT, 4);
      this.goTo([x, y, z]);
      item = PILLAR_BLOCKS.find((b) => this.count(b) > 0);
      if (item === undefined) this.fail('no blocks for a pillar');
    }
    this.moveTo([x, y + 1, z], true);
    this.placeAt([x, y, z], item);
  }

  /**
   * Walks and digs towards a cell, one step at a time: along the larger horizontal
   * distance first, down by a staircase, up by stepping on blocks or a pillar. Stops early
   * when `done` says so.
   */
  goTo(target: Cell, done: () => boolean = () => false): void {
    const [tx, ty, tz] = target;
    for (let guard = 0; guard < STEP_GUARD; guard++) {
      if (done()) return;
      const [x, y, z] = this.cell;
      if (x === tx && y === ty && z === tz) return;
      if (x !== tx || z !== tz) {
        const alongX = Math.abs(tx - x) >= Math.abs(tz - z);
        const nx = alongX ? x + Math.sign(tx - x) : x;
        const nz = alongX ? z : z + Math.sign(tz - z);
        if (ty < y) {
          // A staircase down.
          this.clear([nx, y + 1, nz]);
          this.clear([nx, y, nz]);
          this.clear([nx, y - 1, nz]);
          this.moveTo([nx, y - 1, nz]);
        } else if (
          this.solid([nx, y, nz]) &&
          !this.solid([nx, y + 1, nz]) &&
          !this.solid([nx, y + 2, nz]) &&
          !this.solid([x, y + 2, z])
        ) {
          // A step up the hill.
          this.moveTo([nx, y + 1, nz]);
        } else {
          this.clear([nx, y + 1, nz]);
          this.clear([nx, y, nz]);
          if (ty > y && this.solid([nx, y + 2, nz]) === false && this.solid([nx, y, nz])) {
            this.moveTo([nx, y + 1, nz]);
          } else {
            this.moveTo([nx, y, nz]);
          }
        }
      } else if (ty < y) {
        this.clear([x, y - 1, z]);
        this.moveTo([x, y - 1, z]);
      } else {
        this.pillarUp();
      }
    }
    this.fail(`no way to ${target.join(',')}`);
  }

  // --- skills ----------------------------------------------------------------------------

  /** The nearest natural block that yields `item` with the tools owned now. */
  private findSource(item: number): Cell | null {
    const [px, py, pz] = this.cell;
    const tools = [null, ...TOOL_ITEMS.filter((t) => this.count(t) > 0)];
    const yields = new Set(
      NATURAL_BLOCKS.filter((b) => tools.some((t) => dropOf(b, t)?.item === item)),
    );
    if (yields.size === 0) return null;
    let best: Cell | null = null;
    let bestCost = Infinity;
    for (let r = 0; r <= SEARCH_RADIUS; r++) {
      if (r > bestCost) break;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = px + dx;
          const z = pz + dz;
          for (let y = Math.max(1, py - 48); y < Math.min(WORLD_HEIGHT - 1, py + 48); y++) {
            const block = this.block([x, y, z]);
            if (!yields.has(block)) continue;
            // Digging down and climbing up cost more than walking.
            const cost = Math.hypot(dx, dz) + Math.abs(y - py) * (y < py ? 1.5 : 2);
            // Never under water: a hole there floods.
            if (cost < bestCost && this.block([x, y + 1, z]) !== Block.WATER) {
              best = [x, y, z];
              bestCost = cost;
            }
          }
        }
      }
    }
    return best;
  }

  /** Gets a tool that makes `block` yield, crafting one if needed. */
  private ensureYield(block: number): void {
    const tools = [null, ...TOOL_ITEMS.filter((t) => this.count(t) > 0)];
    if (tools.some((t) => dropOf(block, t) !== null)) return;
    const cls = toolClassOf(block);
    const options = TOOL_ITEMS.filter((item) => {
      const tool = toolOf(item);
      return tool?.class === cls && dropOf(block, item) !== null && this.recipeFor(item) !== null;
    }).sort((a, b) => (toolOf(a)?.tier ?? 0) - (toolOf(b)?.tier ?? 0));
    if (options.length === 0) this.fail(`no tool for ${itemLabel(block)}`);
    this.obtain(options[0], 1);
  }

  /** Mines one block that yields `item`. */
  mineOne(item: number): void {
    const before = this.count(item);
    // The first natural block that would yield it: get the tool for it first.
    const kinds = NATURAL_BLOCKS.filter((b) =>
      [null, ...TOOL_ITEMS].some((t) => dropOf(b, t)?.item === item),
    );
    if (kinds.length === 0) this.fail(`nothing yields ${itemLabel(item)}`);
    if (!kinds.some((b) => dropOf(b, this.bestTool(b)) !== null)) this.ensureYield(kinds[0]);
    const source = this.findSource(item);
    if (!source) this.fail(`no ${itemLabel(item)} within ${SEARCH_RADIUS} blocks`);
    const kind = this.block(source);
    this.goTo(source, () => this.withinReach(source) && this.open(source));
    if (this.block(source) !== kind) return;
    if (!this.withinReach(source) || !this.open(source)) return;
    this.breakBlock(source);
    if (this.count(item) <= before)
      this.fail(`breaking ${itemLabel(kind)} gave no ${itemLabel(item)}`);
  }

  /** The unlocked recipe that makes an item (hand and workbench before the furnace). */
  private recipeFor(item: number): Recipe | null {
    const record = this.session.record;
    const options = RECIPES.filter(
      (r) => r.result.item === item && recipeUnlocked(r.id, record, this.session.progress),
    );
    return options.find((r) => r.station !== 'furnace') ?? options[0] ?? null;
  }

  /** Natural blocks yield it with a tool the bot owns or can make. */
  private mineable(item: number): boolean {
    return NATURAL_BLOCKS.some((b) => {
      if (dropOf(b, this.bestTool(b))?.item === item) return true;
      return TOOL_ITEMS.some((t) => this.recipeFor(t) !== null && dropOf(b, t)?.item === item);
    });
  }

  /** Has at least `n` of an item: mined if nature yields it, otherwise crafted. */
  obtain(item: number, n: number): void {
    for (let guard = 0; this.count(item) < n; guard++) {
      if (guard > 400) this.fail(`cannot get ${n} ${itemLabel(item)}`);
      if (this.mineable(item)) {
        this.mineOne(item);
        continue;
      }
      const recipe = this.recipeFor(item);
      if (!recipe) this.fail(`no way to get ${itemLabel(item)}`);
      this.craftOnce(recipe);
    }
  }

  /** Makes a recipe once: its ingredients, its station, then the craft. */
  craftOnce(recipe: Recipe): void {
    for (const ingredient of recipe.ingredients) this.obtain(ingredient.item, ingredient.count);
    for (const ingredient of recipe.ingredients) {
      if (this.count(ingredient.item) < ingredient.count) {
        // Getting one ingredient used up another (planks for the workbench): again.
        this.obtain(ingredient.item, ingredient.count);
      }
    }
    // Making a station may use up an ingredient (planks of logs): get it again, then the
    // station is checked again (the way to the ingredient may have led away from it).
    for (let round = 0; round < 4; round++) {
      if (recipe.station) this.ensureStation(recipe.station);
      const short = recipe.ingredients.find((i) => this.count(i.item) < i.count);
      if (!short) break;
      if (round === 3) this.fail(`short of ${itemLabel(short.item)} for ${recipe.name}`);
      this.obtain(short.item, short.count);
    }
    this.makeRoom(recipe.result.item, recipe.result.count);
    this.submit({ kind: 'craft', recipe: recipe.id });
    this.clockMs += recipe.station === 'furnace' ? BOT_TIME.smeltMs : BOT_TIME.craftRepeatMs;
  }

  /** A workbench or furnace within reach: placed from the inventory or made first. */
  private ensureStation(station: 'workbench' | 'furnace'): void {
    if (stationsNear(this, this.pose)[station]) return;
    const block = STATION_BLOCKS[station];
    if (this.count(block) === 0) {
      // Take back a station left behind, else make a new one.
      const recipe = this.recipeFor(block);
      if (!recipe) this.fail(`no ${station}`);
      this.craftOnce(recipe);
    }
    const cell = this.placeCell(block);
    this.placeAt(cell, block);
    this.placedStations.push(cell);
  }

  /** Takes back the stations placed for crafting (they travel with the bot). */
  private collectStations(): void {
    while (this.placedStations.length > 0) {
      const cell = this.placedStations.pop() as Cell;
      const block = this.block(cell);
      if (block !== Block.WORKBENCH && block !== Block.FURNACE) continue;
      if (this.withinReach(cell) && this.open(cell)) this.breakBlock(cell);
    }
  }

  /** Places one block of an item next to the player. */
  placeOne(item: number): void {
    this.obtain(item, 1);
    const block = getItemDef(item)?.block ?? null;
    if (block === null) this.fail(`${itemLabel(item)} cannot be placed`);
    this.placeAt(this.placeCell(block), item);
  }

  /** A staircase down until the feet are at `y` or below. */
  digTo(y: number): void {
    for (let guard = 0; this.cell[1] > y; guard++) {
      if (guard > STEP_GUARD) this.fail(`cannot dig down to ${y}`);
      const [x, py, z] = this.cell;
      // The direction whose next step is dry.
      const dirs: [number, number][] = [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ];
      const dry = dirs.find(([dx, dz]) =>
        [py + 1, py, py - 1, py - 2].every((cy) => {
          const c: Cell = [x + dx, cy, z + dz];
          return (
            this.block(c) !== Block.WATER &&
            this.block([c[0], c[1] + 1, c[2]]) !== Block.WATER &&
            this.block([c[0] + 1, c[1], c[2]]) !== Block.WATER &&
            this.block([c[0] - 1, c[1], c[2]]) !== Block.WATER &&
            this.block([c[0], c[1], c[2] + 1]) !== Block.WATER &&
            this.block([c[0], c[1], c[2] - 1]) !== Block.WATER
          );
        }),
      );
      const [dx, dz] = dry ?? dirs[guard % 4];
      this.goTo([x + dx, py - 1, z + dz]);
    }
  }

  /** Up to feet `y`: walking up a hill nearby, else a pillar of blocks. */
  climbTo(y: number): void {
    const [px, py, pz] = this.cell;
    let hill: Cell | null = null;
    let bestCost = Infinity;
    for (let dz = -24; dz <= 24; dz++) {
      for (let dx = -24; dx <= 24; dx++) {
        const x = px + dx;
        const z = pz + dz;
        let top = -1;
        for (let cy = WORLD_HEIGHT - 2; cy > 0; cy--) {
          const id = this.block([x, cy, z]);
          if (id !== Block.AIR && id !== Block.LEAVES && id !== Block.LOG) {
            top = cy;
            break;
          }
        }
        if (top + 1 < y || this.block([x, top, z]) === Block.WATER) continue;
        const cost = Math.hypot(dx, dz) + Math.max(0, top + 1 - py) * 0.5;
        if (cost < bestCost) [hill, bestCost] = [[x, top + 1, z], cost];
      }
    }
    // A hill is worth it only if walking there beats a pillar.
    if (hill && bestCost < (y - py) * 2) this.goTo(hill, () => this.cell[1] >= y);
    for (let guard = 0; this.cell[1] < y; guard++) {
      if (guard > WORLD_HEIGHT) this.fail(`cannot climb to ${y}`);
      this.pillarUp();
    }
  }

  // --- the book ------------------------------------------------------------------------------

  private taskDone(task: Task): boolean {
    return this.session.progress.done.includes(task.id);
  }

  /** One task by its type's skill (plan 5.10). A new task type needs one new case here. */
  runTask(task: Task): void {
    for (let guard = 0; !this.taskDone(task); guard++) {
      if (guard > 200) this.fail(`task "${task.label}" does not finish`);
      switch (task.type) {
        case 'mine':
          this.mineOne(task.target);
          break;
        case 'craft': {
          const recipe = this.recipeFor(task.target);
          if (!recipe) this.fail(`"${task.label}": the recipe is locked`);
          this.craftOnce(recipe);
          break;
        }
        case 'place':
          this.placeOne(task.target);
          break;
        case 'reachBelow':
          this.digTo(task.target);
          break;
        case 'reachAbove':
          this.climbTo(task.target);
          break;
      }
    }
    this.collectStations();
  }

  /** Plays the open chapter's tasks in table order until the book is complete. */
  play(): void {
    for (let guard = 0; guard < 100; guard++) {
      const chapter = openChapter(this.session.progress);
      if (!chapter) return;
      const task = TASKS.find((t) => t.chapter === chapter.id && !this.taskDone(t));
      if (!task) return;
      try {
        this.runTask(task);
      } catch (e) {
        if (e instanceof BotError) throw new BotError(`"${task.label}": ${e.message}`);
        throw e;
      }
    }
  }

  /** Every recipe can be crafted by the player now. */
  allUnlocked(): boolean {
    const record = this.session.record;
    return RECIPES.every((r) => recipeUnlocked(r.id, record, this.session.progress));
  }

  get level(): number {
    return levelOf(this.session.record.xp);
  }

  // `stationsNear` reads blocks through this.
  getBlock(x: number, y: number, z: number): number {
    return this.block([x, y, z]);
  }
}

/** One run of the bot on a world (plan 5.10). Never throws: a failure is in `error`. */
export function runBot(seed: number, gen: WorldGen): BotRun {
  const bot = new Bot(seed, gen);
  let error: string | null = null;
  try {
    bot.play();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  return {
    seed,
    gen,
    completed: error === null && openChapter(bot.session.progress) === null,
    error,
    tasks: bot.tasks,
    levelUps: bot.levelUps,
    totalMs: bot.clockMs,
    actions: bot.actions,
    broken: bot.broken,
    allUnlocked: bot.allUnlocked(),
    lightErrors: bot.world.verifyLight(),
  };
}

/** Estimated player minutes for a bot time (plan 5.10). */
export function playerMinutes(botMs: number): number {
  return (botMs * BOT_TIME.humanFactor) / 60_000;
}
