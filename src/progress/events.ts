// Progress events: what one accepted action, or the player's position, means for the book.
import { type ActionContext, type ActionResult, heldItem } from '../actions/apply';
import type { Action, ChestMoveAction, QuickMoveAction } from '../actions/actions';
import { dropOf } from '../items/hardness';
import { getRecipe } from '../items/recipes';

/**
 * Extension point for later parts (`eat`, `kill`, `open`, …): one union member here and
 * one `case` in `advance` (`progress.ts`).
 */
export type ProgressEvent =
  | { kind: 'mine'; block: number; item: number; count: number }
  | { kind: 'craft'; recipe: number; item: number; count: number }
  | { kind: 'place'; block: number }
  | { kind: 'store'; item: number; count: number }
  | { kind: 'pose'; y: number };

const NONE: readonly ProgressEvent[] = Object.freeze([]);

/**
 * The progress events of one action. `ctxBefore` is the context the action was decided in
 * (the world before its blocks were set). Refused actions and other kinds give none; a
 * break gives the broken block's drop only (not a carried torch, not a block without a
 * yield).
 */
export function eventsOf(
  action: Action,
  result: ActionResult,
  ctxBefore: ActionContext,
): readonly ProgressEvent[] {
  if (!result.ok) return NONE;
  switch (action.kind) {
    case 'break': {
      if (ctxBefore.mode !== 'gathering') return NONE;
      const block = ctxBefore.world.getBlock(action.x, action.y, action.z);
      const drop = dropOf(block, heldItem(ctxBefore.record));
      return drop ? [{ kind: 'mine', block, item: drop.item, count: drop.count }] : NONE;
    }
    case 'craft': {
      const recipe = getRecipe(action.recipe);
      if (!recipe) return NONE;
      return [
        { kind: 'craft', recipe: recipe.id, item: recipe.result.item, count: recipe.result.count },
      ];
    }
    case 'place': {
      const block = result.blocks[0]?.id;
      return block === undefined ? NONE : [{ kind: 'place', block }];
    }
    case 'chestMove':
    case 'quickMove': {
      // Only items that leave the player's slots for the chest count; taking out never
      // subtracts, and moves inside the chest are no stores.
      if (ctxBefore.mode !== 'gathering') return NONE;
      const intoChest =
        action.kind === 'chestMove' ? !action.fromChest && action.toChest : !action.fromChest;
      if (!intoChest) return NONE;
      const count = storedCount(action, result, ctxBefore);
      return count > 0 ? [{ kind: 'store', item: action.item, count }] : NONE;
    }
    default:
      return NONE;
  }
}

/** How many of the action's item the chest gained: its count after minus its count before. */
function storedCount(
  action: ChestMoveAction | QuickMoveAction,
  result: ActionResult & { ok: true },
  ctxBefore: ActionContext,
): number {
  const { x, y, z, item } = action;
  const after = result.states?.find((c) => c.x === x && c.y === y && c.z === z)?.state;
  if (!after) return 0;
  const before = ctxBefore.states?.getState(x, y, z) ?? null;
  return countIn(after.slots, item) - (before ? countIn(before.slots, item) : 0);
}

function countIn(slots: readonly ({ item: number; count: number } | null)[], item: number): number {
  let total = 0;
  for (const slot of slots) if (slot && slot.item === item) total += slot.count;
  return total;
}
