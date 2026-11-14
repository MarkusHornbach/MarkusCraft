// applyAction: validates one action against the world and the acting player. Pure.
import {
  BREAK_TOLERANCE_MS,
  PLAYER_EYE_HEIGHT,
  REACH,
  REACH_TOLERANCE,
  WORLD_HEIGHT,
} from '../game/config';
import { breakTimeMs, dropOf } from '../items/hardness';
import { type BlockReader, breakResult } from '../player/interaction';
import { playerIntersectsBlock } from '../player/physics';
import { addItems, emptySlot, fits, moveStack, removeItems, setSlot } from '../items/inventory';
import { getItemDef } from '../items/items';
import { getRecipe, stationsNear, takeIngredients } from '../items/recipes';
import { BLOCK_REPLACEABLE } from '../world/blocks';
import type { Action } from './actions';
import type { GameMode, PlayerRecord } from './playerRecord';

/**
 * Why an action was refused. Short identifiers; the user interface maps them to texts.
 * `missing` also stands for an empty slot and for ingredients a recipe is short of;
 * `station` for a recipe whose workbench or furnace is not within reach.
 */
export type RejectReason =
  | 'reach'
  | 'unbreakable'
  | 'occupied'
  | 'full'
  | 'early'
  | 'missing'
  | 'station'
  | 'mode'
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
      const drop = dropOf(ctx.world.getBlock(x, y, z));
      if (!drop) return reject('unbreakable');
      // Nothing may get lost: a block whose item has no room is not broken at all.
      if (!fits(ctx.record.slots, drop.item, drop.count)) return reject('full');
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
      const blocks: BlockChange[] = [{ x, y, z, id: replacement }];
      if (ctx.mode === 'creative') return { ok: true, blocks, player: null, notices: [] };
      // Gathering: the same cell as the last `startBreak` (selecting another slot or
      // rearranging items cleared it), and held for the block's break time.
      const started = ctx.record.breaking;
      if (!started || started.x !== x || started.y !== y || started.z !== z) return reject('early');
      const block = ctx.world.getBlock(x, y, z);
      const required = breakTimeMs(block) ?? 0;
      if (nowMs - started.startMs < required - BREAK_TOLERANCE_MS) return reject('early');
      const drop = dropOf(block);
      let slots = ctx.record.slots;
      const notices: Notice[] = [];
      if (drop) {
        const added = addItems(slots, drop.item, drop.count);
        if (added.left > 0) return reject('full');
        slots = added.slots;
        notices.push({ item: drop.item, count: drop.count });
      }
      return { ok: true, blocks, player: { ...ctx.record, slots, breaking: null }, notices };
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
      for (const player of ctx.players) {
        if (playerIntersectsBlock(player, x, y, z)) return reject('occupied');
      }
      // Creative blocks are never used up; in Gathering one item leaves the slot.
      let player: PlayerRecord | null = null;
      if (ctx.mode === 'gathering') {
        const slots = removeItems(ctx.record.slots, action.slot, 1);
        if (!slots) return reject('missing');
        player = { ...ctx.record, slots, breaking: null };
      }
      return { ok: true, blocks: [{ x, y, z, id: block }], player, notices: [] };
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
  }
}
