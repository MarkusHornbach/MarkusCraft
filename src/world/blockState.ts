// Block state: what a cell holds besides its block id (a chest's slots). Plain, immutable,
// JSON-safe values; the kinds belong to the save format (a new kind needs a new format).
import { CHEST_SLOTS } from '../game/config';
import { Block } from './blocks';
import type { TerrainSource } from './generation/terrain';

/** Items of one kind in a slot (the same shape as a player's `ItemStack`). */
export interface StateStack {
  readonly item: number;
  readonly count: number;
}

/** The contents of a chest: exactly `CHEST_SLOTS` slots, null for an empty one. */
export interface ChestState {
  readonly kind: 'chest';
  readonly slots: readonly (StateStack | null)[];
}

/** Every state a cell can carry. Later kinds (the furnace) join this union. */
export type BlockState = ChestState;
export type StateKind = BlockState['kind'];

/** The kinds this build knows, in the order of the save format. */
export const STATE_KINDS: readonly StateKind[] = ['chest'];

/** The kind of state the cells of a block carry; blocks without state are missing. */
export const STATE_KIND_OF_BLOCK: ReadonlyMap<number, StateKind> = new Map([
  [Block.CHEST, 'chest'],
]);

/** The kind of state a block's cells carry, or null. */
export function stateKindOf(block: number): StateKind | null {
  return STATE_KIND_OF_BLOCK.get(block) ?? null;
}

const EMPTY_CHEST: ChestState = Object.freeze({
  kind: 'chest',
  slots: Object.freeze(new Array<StateStack | null>(CHEST_SLOTS).fill(null)),
});

/** A chest with nothing in it. */
export function emptyChest(): ChestState {
  return EMPTY_CHEST;
}

/**
 * The state of a cell that has none stored: contents derived from the seed and the
 * position. A chest in a generator 4 shaft's chest cell reads its loot (`source.lootAt`,
 * Phase 8 part B3b); every other chest starts empty. Null for a block without state.
 */
export function initialState(
  block: number,
  x: number,
  y: number,
  z: number,
  source: TerrainSource | null,
): BlockState | null {
  if (stateKindOf(block) !== 'chest') return null;
  return source?.lootAt?.(x, y, z) ?? EMPTY_CHEST;
}

/** Whether a state holds no items. */
export function isEmptyState(state: BlockState): boolean {
  return state.slots.every((slot) => slot === null);
}

/** A cell's state with its position, as actions report it; `state` null removes it. */
export interface StateChange {
  x: number;
  y: number;
  z: number;
  state: BlockState | null;
}

/** States of every chunk: chunk key → (block index → state), as `World.states` keeps them. */
export type WorldStates = Map<string, Map<number, BlockState>>;

/** What the F3 row shows of a world's states: chests with items and the size of all. */
export interface StateSummary {
  /** States that hold at least one item. */
  filled: number;
  /** Characters of all states as JSON (the cost in saves and snapshots). */
  bytes: number;
}

export function summarizeStates(states: WorldStates): StateSummary {
  let filled = 0;
  let bytes = 0;
  for (const chunk of states.values()) {
    for (const state of chunk.values()) {
      if (!isEmptyState(state)) filled++;
      bytes += JSON.stringify(state).length;
    }
  }
  return { filled, bytes };
}

/** Reads the state of a cell: stored, else the initial one; null for a block without state. */
export interface StateReader {
  getState(x: number, y: number, z: number): BlockState | null;
}
