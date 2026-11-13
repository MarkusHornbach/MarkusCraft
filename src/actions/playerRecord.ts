// Player record: the per-player state that actions read and change, and that is saved.
import { INVENTORY_SLOTS } from '../game/config';
import { HOTBAR_BLOCKS } from '../world/blocks';

/** Creative as in Phase 1, or Gathering (limited items, timed breaking; from Part B). */
export type GameMode = 'creative' | 'gathering';
export const GAME_MODES: readonly GameMode[] = ['creative', 'gathering'];

/** Items of one kind in a slot. A block is the item with the same id. */
export interface ItemStack {
  item: number;
  count: number;
}

/** A break in progress (Gathering): the cell and the simulation time it started. */
export interface BreakingState {
  x: number;
  y: number;
  z: number;
  startMs: number;
}

/**
 * Everything about a player that actions validate against. Records are immutable:
 * `applyAction` returns a new one instead of changing the old.
 */
export interface PlayerRecord {
  /** `INVENTORY_SLOTS` entries; the first nine are the bar. */
  readonly slots: readonly (ItemStack | null)[];
  /** Selected bar slot, 0-based. */
  readonly selectedSlot: number;
  readonly breaking: BreakingState | null;
}

/** The record of a new player: in Creative the bar holds the nine Phase 1 blocks. */
export function createPlayerRecord(mode: GameMode): PlayerRecord {
  const slots: (ItemStack | null)[] = new Array<ItemStack | null>(INVENTORY_SLOTS).fill(null);
  if (mode === 'creative') {
    HOTBAR_BLOCKS.forEach((item, slot) => {
      slots[slot] = { item, count: 1 };
    });
  }
  return { slots, selectedSlot: 0, breaking: null };
}
