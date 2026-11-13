// applyAction: validates one action against the world and the acting player. Pure.
import { PLAYER_EYE_HEIGHT, REACH, REACH_TOLERANCE, WORLD_HEIGHT } from '../game/config';
import { type BlockReader, breakResult } from '../player/interaction';
import { playerIntersectsBlock } from '../player/physics';
import { BLOCK_REPLACEABLE, isPlaceable } from '../world/blocks';
import type { Action } from './actions';
import type { GameMode, PlayerRecord } from './playerRecord';

/**
 * Why an action was refused. Short identifiers; the user interface maps them to texts.
 * `full`, `early`, `missing` (ingredients), `station` and `mode` are used from Part B on.
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

export type ActionResult =
  | {
      ok: true;
      /** Blocks to set, in order. */
      blocks: BlockChange[];
      /** The acting player's new record, or null if it did not change. */
      player: PlayerRecord | null;
      /** Messages for the acting player's screen (pickups, from Part B). */
      notices: string[];
    }
  | { ok: false; reason: RejectReason };

function reject(reason: RejectReason): ActionResult {
  return { ok: false, reason };
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
 * caller sets the blocks and stores the record. `nowMs` is the simulation time (used by
 * timed breaking from Part B on).
 */
export function applyAction(ctx: ActionContext, action: Action, _nowMs: number): ActionResult {
  switch (action.kind) {
    case 'selectSlot': {
      // Selecting another item cancels a running break.
      const player: PlayerRecord = { ...ctx.record, selectedSlot: action.slot, breaking: null };
      return { ok: true, blocks: [], player, notices: [] };
    }
    case 'break': {
      const { x, y, z } = action;
      const problem = checkCell(ctx, x, y, z);
      if (problem) return reject(problem);
      // A hole next to water fills with water (Phase 1 rule).
      const replacement = breakResult(ctx.world, x, y, z);
      if (replacement === null) return reject('unbreakable');
      return { ok: true, blocks: [{ x, y, z, id: replacement }], player: null, notices: [] };
    }
    case 'place': {
      const { x, y, z } = action;
      const problem = checkCell(ctx, x, y, z);
      if (problem) return reject(problem);
      const stack = ctx.record.slots[action.slot];
      if (!stack || stack.count < 1) return reject('missing');
      if (!isPlaceable(stack.item)) return reject('invalid');
      if (BLOCK_REPLACEABLE[ctx.world.getBlock(x, y, z)] !== 1) return reject('occupied');
      for (const player of ctx.players) {
        if (playerIntersectsBlock(player, x, y, z)) return reject('occupied');
      }
      return { ok: true, blocks: [{ x, y, z, id: stack.item }], player: null, notices: [] };
    }
  }
}
