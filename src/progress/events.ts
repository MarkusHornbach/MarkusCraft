// Progress events: what one accepted action, or the player's position, means for the book.
import { type ActionContext, type ActionResult, heldItem } from '../actions/apply';
import type { Action } from '../actions/actions';
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
    default:
      return NONE;
  }
}
