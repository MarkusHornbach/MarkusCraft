// Actions: every change to the world or to a player's items, as plain serialisable data.
import { HOTBAR_SLOTS, INVENTORY_SLOTS } from '../game/config';

/** Selects a bar slot (0-based). */
export interface SelectSlotAction {
  kind: 'selectSlot';
  slot: number;
}

/** Breaks the block in a cell. */
export interface BreakAction {
  kind: 'break';
  x: number;
  y: number;
  z: number;
}

/** Gathering: begins breaking the block in a cell; `break` follows when its time is up. */
export interface StartBreakAction {
  kind: 'startBreak';
  x: number;
  y: number;
  z: number;
}

/** Places the block held in a bar slot (0-based) into a cell. */
export interface PlaceAction {
  kind: 'place';
  x: number;
  y: number;
  z: number;
  slot: number;
}

/** Moves the stack of one inventory slot (0-based) to another: move, merge or swap. */
export interface MoveStackAction {
  kind: 'moveStack';
  from: number;
  to: number;
}

/** Empties an inventory slot (the bin). */
export interface DiscardAction {
  kind: 'discard';
  slot: number;
}

/** Creative only: puts a block into a bar slot (the palette). */
export interface SetBarSlotAction {
  kind: 'setBarSlot';
  slot: number;
  item: number;
}

/** Gathering: makes the result of a recipe (by its id) from the player's items, once. */
export interface CraftAction {
  kind: 'craft';
  recipe: number;
}

/**
 * Adventure: the task the HUD tracker shows (Polish 2): an open task of the open chapter,
 * or `-1` to hide the tracker. The screen decides what a press on a row means.
 */
export interface TrackAction {
  kind: 'track';
  task: number;
}

/**
 * Moves the stack of one slot to another, inside a chest, inside the player's slots or
 * between the two (Phase 8 part B3a). `item` is what the screen showed in `from`: if the
 * slot holds something else by now, the answer is `missing`.
 */
export interface ChestMoveAction {
  kind: 'chestMove';
  x: number;
  y: number;
  z: number;
  from: number;
  fromChest: boolean;
  to: number;
  toChest: boolean;
  item: number;
}

/** Moves a stack to the other side: onto stacks of its item first, then into free slots. */
export interface QuickMoveAction {
  kind: 'quickMove';
  x: number;
  y: number;
  z: number;
  slot: number;
  fromChest: boolean;
  item: number;
}

/** Moves every stack of a chest into the player's slots, by the quick move rule. */
export interface TakeAllAction {
  kind: 'takeAll';
  x: number;
  y: number;
  z: number;
}

/** The player opens the chest in a cell; changes nothing, the room learns who looks. */
export interface OpenChestAction {
  kind: 'openChest';
  x: number;
  y: number;
  z: number;
}

/** The player closes its chest. */
export interface CloseChestAction {
  kind: 'closeChest';
}

/** An action survives JSON unchanged. */
export type Action =
  | SelectSlotAction
  | BreakAction
  | PlaceAction
  | StartBreakAction
  | MoveStackAction
  | DiscardAction
  | SetBarSlotAction
  | CraftAction
  | TrackAction
  | ChestMoveAction
  | QuickMoveAction
  | TakeAllAction
  | OpenChestAction
  | CloseChestAction;
export type ActionKind = Action['kind'];

export type DecodeResult = { ok: true; action: Action } | { ok: false; error: string };

/** Coordinates are 32-bit integers, so every piece of arithmetic on them stays exact. */
export const COORD_LIMIT = 0x7fffffff;

type Check = (value: unknown) => boolean;

const isCoord: Check = (value) =>
  typeof value === 'number' && Number.isInteger(value) && Math.abs(value) <= COORD_LIMIT;
const isBarSlot: Check = (value) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < HOTBAR_SLOTS;
const isSlot: Check = (value) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < INVENTORY_SLOTS;
/** Whether the id names an item is a rule about the game and checked by `applyAction`. */
const isItemId: Check = (value) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 0xffff;

const isBool: Check = (value) => typeof value === 'boolean';

/** Whether the id names a recipe is checked by `applyAction`. */
const isRecipeId: Check = isItemId;

/** A task id or -1 (hide); whether the task is open is checked by `applyAction`. */
const isTrackTask: Check = (value) =>
  typeof value === 'number' && Number.isInteger(value) && value >= -1 && value <= 0xffff;

/** The fields of every kind, besides `kind` itself, with their checks. */
const FIELDS: Record<ActionKind, Record<string, Check>> = {
  selectSlot: { slot: isBarSlot },
  break: { x: isCoord, y: isCoord, z: isCoord },
  place: { x: isCoord, y: isCoord, z: isCoord, slot: isBarSlot },
  startBreak: { x: isCoord, y: isCoord, z: isCoord },
  moveStack: { from: isSlot, to: isSlot },
  discard: { slot: isSlot },
  setBarSlot: { slot: isBarSlot, item: isItemId },
  craft: { recipe: isRecipeId },
  track: { task: isTrackTask },
  // Chest slots are 0–26; which side may use which slot is a rule of `applyAction`.
  chestMove: {
    x: isCoord,
    y: isCoord,
    z: isCoord,
    from: isSlot,
    fromChest: isBool,
    to: isSlot,
    toChest: isBool,
    item: isItemId,
  },
  quickMove: {
    x: isCoord,
    y: isCoord,
    z: isCoord,
    slot: isSlot,
    fromChest: isBool,
    item: isItemId,
  },
  takeAll: { x: isCoord, y: isCoord, z: isCoord },
  openChest: { x: isCoord, y: isCoord, z: isCoord },
  closeChest: {},
};

function fail(error: string): DecodeResult {
  return { ok: false, error };
}

/**
 * Turns an arbitrary value (parsed JSON, a message from another device) into an action.
 * Checks the kind, the type and range of every field and rejects extra fields. Never
 * throws; the returned action is a fresh object with exactly the known fields.
 */
export function decodeAction(value: unknown): DecodeResult {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return fail('not an object');
    }
    const source = value as Record<string, unknown>;
    const kind = source.kind;
    if (typeof kind !== 'string' || !Object.hasOwn(FIELDS, kind)) return fail('unknown kind');
    const fields = FIELDS[kind as ActionKind];
    const keys = Object.keys(source);
    for (const key of keys) {
      if (key !== 'kind' && !Object.hasOwn(fields, key)) return fail(`unexpected field ${key}`);
    }
    const action: Record<string, unknown> = { kind };
    for (const name of Object.keys(fields)) {
      if (!Object.hasOwn(source, name)) return fail(`missing field ${name}`);
      const field = source[name];
      if (!fields[name](field)) return fail(`invalid field ${name}`);
      action[name] = field;
    }
    return { ok: true, action: action as unknown as Action };
  } catch {
    // Hostile objects (throwing getters, proxies) must not take the caller down.
    return fail('unreadable value');
  }
}
