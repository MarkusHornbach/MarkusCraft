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
 * The state of a cell that has none stored: the hook for contents derived from the seed
 * and the position (generated loot, a later part). Today every chest starts empty and
 * `source` is not read. Null for a block without state.
 */
export function initialState(
  block: number,
  x: number,
  y: number,
  z: number,
  source: TerrainSource | null,
): BlockState | null {
  void x;
  void y;
  void z;
  void source;
  return stateKindOf(block) === 'chest' ? EMPTY_CHEST : null;
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

/** Reads the state of a cell: stored, else the initial one; null for a block without state. */
export interface StateReader {
  getState(x: number, y: number, z: number): BlockState | null;
}
