// applyAction: validates one action against the world and the acting player. Pure.
import {
  BREAK_TOLERANCE_MS,
  CHEST_SLOTS,
  HOTBAR_SLOTS,
  INVENTORY_SLOTS,
  PLAYER_EYE_HEIGHT,
  REACH,
  REACH_TOLERANCE,
  WORLD_HEIGHT,
} from '../game/config';
import { breakTimeMs, dropOf } from '../items/hardness';
import { type BlockReader, breakResult } from '../player/interaction';
import { playerIntersectsBlock } from '../player/physics';
import {
  type Slots,
  addItems,
  addItemsInOrder,
  emptySlot,
  fitsAll,
  moveStack,
  removeItems,
  setSlot,
  transferStack,
} from '../items/inventory';
import { getItemDef } from '../items/items';
import { getRecipe, stationsNear, takeIngredients } from '../items/recipes';
import { type WorldProgress, openChapter, recipeUnlocked } from '../progress/progress';
import { getTask } from '../progress/tables';
import {
  BLOCK_NEEDS_SUPPORT,
  BLOCK_REPLACEABLE,
  BLOCK_SOLID,
  Block,
  isSupport,
} from '../world/blocks';
import {
  type ChestState,
  type StateChange,
  type StateReader,
  emptyChest,
  isEmptyState,
} from '../world/blockState';
import type { Action } from './actions';
import { type GameMode, type ItemStack, type PlayerRecord, TRACK_HIDDEN } from './playerRecord';

/**
 * Why an action was refused. Short identifiers; the user interface maps them to texts.
 * `missing` also stands for an empty slot and for ingredients a recipe is short of;
 * `station` for a recipe whose workbench or furnace is not within reach; `support` for a
 * block that needs a solid cube below it (the torch); `rate` for a guest that sent too
 * many actions within a second (the host's rule, Phase 6 part C; no text on screen);
 * `locked` for a recipe the player has not unlocked yet (Phase 8); `notEmpty` for a chest
 * that Creative may not break while it holds items (Phase 8 part B3a).
 */
export type RejectReason =
  | 'reach'
  | 'unbreakable'
  | 'occupied'
  | 'full'
  | 'early'
  | 'missing'
  | 'station'
  | 'locked'
  | 'support'
  | 'mode'
  | 'rate'
  | 'notEmpty'
  | 'invalid';

export interface BlockChange {
  x: number;
  y: number;
  z: number;
  id: number;
}

/** Position of a player's feet centre; the collision box is derived from it. */
export interface PlayerPose {
  x: number;
  y: number;
  z: number;
}

/** Read access to everything an action is validated against. */
export interface ActionContext {
  world: BlockReader;
  mode: GameMode;
  /** The acting player. */
  pose: PlayerPose;
  record: PlayerRecord;
  /** All players in the world (one today): a block cannot be placed into any of them. */
  players: readonly PlayerPose[];
  /** The world's task book; with the record it decides which recipes are unlocked. */
  progress: WorldProgress;
  /**
   * Block states (a chest's slots, Phase 8 part B3a). The sessions always pass it; without
   * it every chest reads as empty (tests of actions that never meet a chest).
   */
  states?: StateReader;
}

/** A pickup: `count` items of one kind went into the inventory. */
export interface Notice {
  item: number;
  count: number;
}

export type ActionResult =
  | {
      ok: true;
      /** Blocks to set, in order. */
      blocks: BlockChange[];
      /** The acting player's new record, or null if it did not change. */
      player: PlayerRecord | null;
      /** Items the acting player picked up; the screen shows them ("+1 Stone"). */
      notices: Notice[];
      /** Block states to set after the blocks; absent if none changed (Phase 8 part B3a). */
      states?: StateChange[];
    }
  | { ok: false; reason: RejectReason };

function reject(reason: RejectReason): ActionResult {
  return { ok: false, reason };
}

/** The answer to an action that only rearranged the player's items. */
function changed(record: PlayerRecord, slots: PlayerRecord['slots']): ActionResult {
  // Other items in the hand: a break in progress starts over.
  return { ok: true, blocks: [], player: { ...record, slots, breaking: null }, notices: [] };
}

/** The item in the selected bar slot, or null for an empty hand. */
export function heldItem(record: PlayerRecord): number | null {
  return record.slots[record.selectedSlot]?.item ?? null;
}

/** Rules shared by all block actions: inside the height range and within reach. */
function checkCell(ctx: ActionContext, x: number, y: number, z: number): RejectReason | null {
  if (y < 0 || y >= WORLD_HEIGHT) return 'invalid';
  const dx = x + 0.5 - ctx.pose.x;
  const dy = y + 0.5 - (ctx.pose.y + PLAYER_EYE_HEIGHT);
  const dz = z + 0.5 - ctx.pose.z;
  const limit = REACH + REACH_TOLERANCE;
  if (dx * dx + dy * dy + dz * dz > limit * limit) return 'reach';
  return null;
}

/** The chest in a cell: the cell's rules, then the block; or why there is none. */
function chestAt(ctx: ActionContext, x: number, y: number, z: number): ChestState | RejectReason {
  const problem = checkCell(ctx, x, y, z);
  if (problem) return problem;
  if (ctx.world.getBlock(x, y, z) !== Block.CHEST) return 'invalid';
  const state = ctx.states ? ctx.states.getState(x, y, z) : emptyChest();
  return state && state.kind === 'chest' ? state : 'invalid';
}

/** Whether a slot index exists on its side: a chest's 27, or the player's (Creative: the bar). */
function slotExists(ctx: ActionContext, slot: number, chest: boolean): boolean {
  if (chest) return slot < CHEST_SLOTS;
  return slot < (ctx.mode === 'creative' ? HOTBAR_SLOTS : INVENTORY_SLOTS);
}

/** Where a quick move puts items into a player: the 27 inventory slots, then the bar. */
const ADVENTURE_ORDER: readonly number[] = [
  ...Array.from({ length: INVENTORY_SLOTS - HOTBAR_SLOTS }, (_, i) => HOTBAR_SLOTS + i),
  ...Array.from({ length: HOTBAR_SLOTS }, (_, i) => i),
];
const BAR_ORDER: readonly number[] = Array.from({ length: HOTBAR_SLOTS }, (_, i) => i);
const CHEST_ORDER: readonly number[] = Array.from({ length: CHEST_SLOTS }, (_, i) => i);

function playerOrder(mode: GameMode): readonly number[] {
  return mode === 'creative' ? BAR_ORDER : ADVENTURE_ORDER;
}

/**
 * The answer to an accepted chest action: the chest's new slots (stored explicitly, also
 * when empty) and the player's, if they changed. Other items in the hand: a break in
 * progress starts over.
 */
function chestChanged(
  ctx: ActionContext,
  x: number,
  y: number,
  z: number,
  chest: Slots,
  player: Slots | null,
): ActionResult {
  return {
    ok: true,
    blocks: [],
    player: player ? { ...ctx.record, slots: player, breaking: null } : null,
    notices: [],
    states: [{ x, y, z, state: { kind: 'chest', slots: chest } }],
  };
}

/** The filled slots of a chest in a cell (none for any other block). */
function contentsAt(
  ctx: ActionContext,
  block: number,
  x: number,
  y: number,
  z: number,
): ItemStack[] {
  if (block !== Block.CHEST || !ctx.states) return [];
  const state = ctx.states.getState(x, y, z);
  if (!state) return [];
  return state.slots.filter((slot): slot is ItemStack => slot !== null);
}

/** Adds a pickup to the notices, one per item kind. */
function noteItem(notices: Notice[], item: number, count: number): void {
  const known = notices.find((n) => n.item === item);
  if (known) known.count += count;
  else notices.push({ item, count });
}

/**
 * Decides whether `action` is allowed and what it changes. Changes nothing itself: the
 * caller sets the blocks and stores the record. `nowMs` is the simulation time, which
 * timed breaking is measured on.
 */
export function applyAction(ctx: ActionContext, action: Action, nowMs: number): ActionResult {
  switch (action.kind) {
    case 'selectSlot': {
      // Selecting another item cancels a running break.
      const player: PlayerRecord = { ...ctx.record, selectedSlot: action.slot, breaking: null };
      return { ok: true, blocks: [], player, notices: [] };
    }
    case 'startBreak': {
      // Creative breaks at once and has nothing to start.
      if (ctx.mode !== 'gathering') return reject('mode');
      const { x, y, z } = action;
      const problem = checkCell(ctx, x, y, z);
      if (problem) return reject(problem);
      const block = ctx.world.getBlock(x, y, z);
      if (breakTimeMs(block) === null) return reject('unbreakable');
      // Nothing may get lost: a block whose item has no room is not broken at all. A block
      // that yields nothing without the right tool breaks whatever the inventory holds.
      const drop = dropOf(block, heldItem(ctx.record));
      // A chest's contents come out with it: all of it fits, or the break does not start.
      const out = [...(drop ? [drop] : []), ...contentsAt(ctx, block, x, y, z)];
      if (!fitsAll(ctx.record.slots, out)) return reject('full');
      const player: PlayerRecord = { ...ctx.record, breaking: { x, y, z, startMs: nowMs } };
      return { ok: true, blocks: [], player, notices: [] };
    }
    case 'break': {
      const { x, y, z } = action;
      const problem = checkCell(ctx, x, y, z);
      if (problem) return reject(problem);
      // A hole next to water fills with water (Phase 1 rule).
      const replacement = breakResult(ctx.world, x, y, z);
      if (replacement === null) return reject('unbreakable');
      const block = ctx.world.getBlock(x, y, z);
      const contents = contentsAt(ctx, block, x, y, z);
      // A chest's state goes with its block.
      const states: StateChange[] | undefined =
        block === Block.CHEST ? [{ x, y, z, state: null }] : undefined;
      const blocks: BlockChange[] = [{ x, y, z, id: replacement }];
      // A block standing on this one (a torch) comes off with it, after it.
      const above = y + 1 < WORLD_HEIGHT ? ctx.world.getBlock(x, y + 1, z) : 0;
      const carried = BLOCK_NEEDS_SUPPORT[above] === 1;
      if (carried) {
        blocks.push({ x, y: y + 1, z, id: breakResult(ctx.world, x, y + 1, z) ?? 0 });
      }
      if (ctx.mode === 'creative') {
        // Nothing may get lost, and Creative has no room to put a chest's items.
        if (contents.length > 0) return reject('notEmpty');
        return { ok: true, blocks, player: null, notices: [], ...(states ? { states } : {}) };
      }
      // Gathering: the same cell as the last `startBreak` (selecting another slot or
      // rearranging items cleared it), and held for the block's break time.
      const started = ctx.record.breaking;
      if (!started || started.x !== x || started.y !== y || started.z !== z) return reject('early');
      // The tool in the hand decides the time and whether the block yields its item.
      const held = heldItem(ctx.record);
      const required = breakTimeMs(block, held) ?? 0;
      if (nowMs - started.startMs < required - BREAK_TOLERANCE_MS) return reject('early');
      const drop = dropOf(block, held);
      let slots = ctx.record.slots;
      const notices: Notice[] = [];
      // The block's item and a chest's contents: all of them, or the block stays.
      for (const stack of [...(drop ? [drop] : []), ...contents]) {
        const added = addItems(slots, stack.item, stack.count);
        if (added.left > 0) return reject('full');
        slots = added.slots;
        noteItem(notices, stack.item, stack.count);
      }
      // The carried block goes into the inventory if it fits; otherwise it is lost. It
      // never stops the break.
      const carriedDrop = carried ? dropOf(above) : null;
      if (carriedDrop) {
        const added = addItems(slots, carriedDrop.item, carriedDrop.count);
        if (added.left === 0) {
          slots = added.slots;
          notices.push({ item: carriedDrop.item, count: carriedDrop.count });
        }
      }
      const player: PlayerRecord = { ...ctx.record, slots, breaking: null };
      return { ok: true, blocks, player, notices, ...(states ? { states } : {}) };
    }
    case 'place': {
      const { x, y, z } = action;
      const problem = checkCell(ctx, x, y, z);
      if (problem) return reject(problem);
      const stack = ctx.record.slots[action.slot];
      if (!stack || stack.count < 1) return reject('missing');
      const block = getItemDef(stack.item)?.block ?? null;
      if (block === null) return reject('invalid');
      if (BLOCK_REPLACEABLE[ctx.world.getBlock(x, y, z)] !== 1) return reject('occupied');
      if (BLOCK_NEEDS_SUPPORT[block] === 1 && !isSupport(ctx.world.getBlock(x, y - 1, z))) {
        return reject('support');
      }
      // Only blocks the player collides with are kept out of the cells players stand in.
      if (BLOCK_SOLID[block] === 1) {
        for (const player of ctx.players) {
          if (playerIntersectsBlock(player, x, y, z)) return reject('occupied');
        }
      }
      // Creative blocks are never used up; in Gathering one item leaves the slot.
      let player: PlayerRecord | null = null;
      if (ctx.mode === 'gathering') {
        const slots = removeItems(ctx.record.slots, action.slot, 1);
        if (!slots) return reject('missing');
        player = { ...ctx.record, slots, breaking: null };
      }
      const placed: BlockChange[] = [{ x, y, z, id: block }];
      // A placed chest stores its empty state explicitly (a later generator never fills it).
      if (block === Block.CHEST) {
        return {
          ok: true,
          blocks: placed,
          player,
          notices: [],
          states: [{ x, y, z, state: emptyChest() }],
        };
      }
      return { ok: true, blocks: placed, player, notices: [] };
    }
    case 'moveStack': {
      const { from, to } = action;
      if (from === to) return reject('invalid');
      if (!ctx.record.slots[from]) return reject('missing');
      // Creative counts mean nothing, so equal blocks swap instead of adding up.
      const slots = moveStack(ctx.record.slots, from, to, ctx.mode === 'gathering');
      return changed(ctx.record, slots);
    }
    case 'discard': {
      if (!ctx.record.slots[action.slot]) return reject('missing');
      return changed(ctx.record, emptySlot(ctx.record.slots, action.slot));
    }
    case 'setBarSlot': {
      if (ctx.mode !== 'creative') return reject('mode');
      if ((getItemDef(action.item)?.block ?? null) === null) return reject('invalid');
      const slots = setSlot(ctx.record.slots, action.slot, { item: action.item, count: 1 });
      return changed(ctx.record, slots);
    }
    case 'craft': {
      // Creative has every block already and counts mean nothing there.
      if (ctx.mode !== 'gathering') return reject('mode');
      const recipe = getRecipe(action.recipe);
      if (!recipe) return reject('invalid');
      if (!recipeUnlocked(recipe.id, ctx.record, ctx.progress)) return reject('locked');
      if (recipe.station && !stationsNear(ctx.world, ctx.pose)[recipe.station]) {
        return reject('station');
      }
      const taken = takeIngredients(ctx.record.slots, recipe);
      if (!taken) return reject('missing');
      // Nothing may get lost: the whole result must fit, or nothing is made.
      const added = addItems(taken, recipe.result.item, recipe.result.count);
      if (added.left > 0) return reject('full');
      return changed(ctx.record, added.slots);
    }
    case 'track': {
      // Creative has no task book.
      if (ctx.mode !== 'gathering') return reject('mode');
      if (action.task !== TRACK_HIDDEN && !trackable(action.task, ctx.progress)) {
        return reject('invalid');
      }
      // Only the choice changes; a break in progress goes on.
      const player: PlayerRecord = { ...ctx.record, track: action.task };
      return { ok: true, blocks: [], player, notices: [] };
    }
    case 'chestMove': {
      const { x, y, z, from, fromChest, to, toChest } = action;
      const chest = chestAt(ctx, x, y, z);
      if (typeof chest === 'string') return reject(chest);
      if (!slotExists(ctx, from, fromChest) || !slotExists(ctx, to, toChest)) {
        return reject('invalid');
      }
      if (fromChest === toChest && from === to) return reject('invalid');
      const source = fromChest ? chest.slots : ctx.record.slots;
      // Another player may have taken the stack the screen showed.
      if (source[from]?.item !== action.item) return reject('missing');
      // Creative counts mean nothing, so equal items swap instead of adding up.
      const merge = ctx.mode === 'gathering';
      if (fromChest && toChest) {
        return chestChanged(ctx, x, y, z, moveStack(chest.slots, from, to, merge), null);
      }
      if (!fromChest && !toChest) {
        const player = moveStack(ctx.record.slots, from, to, merge);
        return chestChanged(ctx, x, y, z, chest.slots, player);
      }
      const target = toChest ? chest.slots : ctx.record.slots;
      const moved = transferStack(source, from, target, to, merge);
      return fromChest
        ? chestChanged(ctx, x, y, z, moved.source, moved.target)
        : chestChanged(ctx, x, y, z, moved.target, moved.source);
    }
    case 'quickMove': {
      const { x, y, z, slot, fromChest } = action;
      const chest = chestAt(ctx, x, y, z);
      if (typeof chest === 'string') return reject(chest);
      if (!slotExists(ctx, slot, fromChest)) return reject('invalid');
      const source = fromChest ? chest.slots : ctx.record.slots;
      const stack = source[slot];
      if (!stack || stack.item !== action.item) return reject('missing');
      const target = fromChest ? ctx.record.slots : chest.slots;
      const order = fromChest ? playerOrder(ctx.mode) : CHEST_ORDER;
      const added = addItemsInOrder(target, stack.item, stack.count, order);
      if (added.left === stack.count) return reject('full');
      // What does not fit stays where it was.
      const rest = added.left > 0 ? { item: stack.item, count: added.left } : null;
      const left = setSlot(source, slot, rest);
      return fromChest
        ? chestChanged(ctx, x, y, z, left, added.slots)
        : chestChanged(ctx, x, y, z, added.slots, left);
    }
    case 'takeAll': {
      const { x, y, z } = action;
      const chest = chestAt(ctx, x, y, z);
      if (typeof chest === 'string') return reject(chest);
      if (isEmptyState(chest)) return reject('missing');
      let player = ctx.record.slots;
      let slots: Slots = chest.slots;
      let moved = false;
      const order = playerOrder(ctx.mode);
      for (let i = 0; i < CHEST_SLOTS; i++) {
        const stack = slots[i];
        if (!stack) continue;
        const added = addItemsInOrder(player, stack.item, stack.count, order);
        if (added.left === stack.count) continue;
        moved = true;
        player = added.slots;
        slots = setSlot(slots, i, added.left > 0 ? { item: stack.item, count: added.left } : null);
      }
      if (!moved) return reject('full');
      return chestChanged(ctx, x, y, z, slots, player);
    }
    case 'openChest': {
      const chest = chestAt(ctx, action.x, action.y, action.z);
      if (typeof chest === 'string') return reject(chest);
      return { ok: true, blocks: [], player: null, notices: [] };
    }
    case 'closeChest':
      return { ok: true, blocks: [], player: null, notices: [] };
  }
}

/** Whether a task can be chosen for the tracker: a task of the open chapter, not done. */
function trackable(id: number, progress: WorldProgress): boolean {
  const task = getTask(id);
  const chapter = openChapter(progress);
  return (
    task !== undefined &&
    chapter !== null &&
    task.chapter === chapter.id &&
    !progress.done.includes(id)
  );
}
