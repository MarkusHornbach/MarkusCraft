// Inventory: pure operations on a player's item slots. Nothing here changes its input.
import type { ItemStack } from '../actions/playerRecord';
import { stackSizeOf } from './items';

export type Slots = readonly (ItemStack | null)[];

export interface AddResult {
  slots: Slots;
  /** How many items did not fit. */
  left: number;
}

/**
 * Adds `count` items: existing stacks of the item are filled first, then empty slots, in
 * slot order (the bar comes first). Never exceeds the stack size.
 */
export function addItems(slots: Slots, item: number, count: number): AddResult {
  const size = stackSizeOf(item);
  const next = slots.slice();
  let left = count;
  for (let i = 0; i < next.length && left > 0; i++) {
    const stack = next[i];
    if (!stack || stack.item !== item || stack.count >= size) continue;
    const moved = Math.min(left, size - stack.count);
    next[i] = { item, count: stack.count + moved };
    left -= moved;
  }
  for (let i = 0; i < next.length && left > 0; i++) {
    if (next[i]) continue;
    const moved = Math.min(left, size);
    next[i] = { item, count: moved };
    left -= moved;
  }
  return { slots: next, left };
}

/** Whether `count` items fit completely. */
export function fits(slots: Slots, item: number, count: number): boolean {
  const size = stackSizeOf(item);
  let room = 0;
  for (const stack of slots) {
    if (!stack) room += size;
    else if (stack.item === item) room += Math.max(0, size - stack.count);
    if (room >= count) return true;
  }
  return room >= count;
}

/** Takes `count` items out of a slot; null if the slot does not hold that many. */
export function removeItems(slots: Slots, slot: number, count: number): Slots | null {
  const stack = slots[slot];
  if (!stack || count < 1 || stack.count < count) return null;
  const next = slots.slice();
  next[slot] = stack.count === count ? null : { item: stack.item, count: stack.count - count };
  return next;
}

/**
 * Takes `count` items of one kind out of the inventory, wherever they lie; null if there
 * are not that many. The last slots are emptied first, so the bar keeps its stacks longest.
 */
export function takeItems(slots: Slots, item: number, count: number): Slots | null {
  if (count < 1) return null;
  const next = slots.slice();
  let left = count;
  for (let i = next.length - 1; i >= 0 && left > 0; i--) {
    const stack = next[i];
    if (!stack || stack.item !== item) continue;
    const taken = Math.min(left, stack.count);
    next[i] = taken === stack.count ? null : { item, count: stack.count - taken };
    left -= taken;
  }
  return left > 0 ? null : next;
}

/**
 * Moves the stack of slot `from` to slot `to`: into an empty slot it moves, onto the same
 * item it merges up to the stack size (the remainder stays behind), onto another item the
 * two swap. With `merge` false equal items swap as well (Creative, where counts mean
 * nothing).
 */
export function moveStack(slots: Slots, from: number, to: number, merge = true): Slots {
  const source = slots[from];
  if (!source || from === to || !(to in slots)) return slots;
  const target = slots[to];
  const next = slots.slice();
  if (merge && target && target.item === source.item) {
    const moved = Math.min(source.count, Math.max(0, stackSizeOf(source.item) - target.count));
    next[to] = { item: target.item, count: target.count + moved };
    next[from] = moved === source.count ? null : { item: source.item, count: source.count - moved };
    return next;
  }
  next[to] = source;
  next[from] = target;
  return next;
}

export function emptySlot(slots: Slots, slot: number): Slots {
  const next = slots.slice();
  next[slot] = null;
  return next;
}

/** Puts a stack into a slot, replacing what is there. */
export function setSlot(slots: Slots, slot: number, stack: ItemStack | null): Slots {
  const next = slots.slice();
  next[slot] = stack;
  return next;
}

/** Number of items in all slots, or of one item if `item` is given. */
export function countItems(slots: Slots, item?: number): number {
  let total = 0;
  for (const stack of slots) {
    if (stack && (item === undefined || stack.item === item)) total += stack.count;
  }
  return total;
}

export interface TransferResult {
  source: Slots;
  target: Slots;
}

/**
 * `moveStack` across two slot lists (a chest and a player, Phase 8 part B3a): the stack
 * of `source[from]` moves into an empty `target[to]`, merges onto the same item up to the
 * stack size (the remainder stays behind), or swaps with another item. With `merge` false
 * equal items swap as well (Creative).
 */
export function transferStack(
  source: Slots,
  from: number,
  target: Slots,
  to: number,
  merge = true,
): TransferResult {
  const moving = source[from];
  if (!moving || !(to in target)) return { source, target };
  const there = target[to];
  const nextSource = source.slice();
  const nextTarget = target.slice();
  if (merge && there && there.item === moving.item) {
    const moved = Math.min(moving.count, Math.max(0, stackSizeOf(moving.item) - there.count));
    nextTarget[to] = { item: there.item, count: there.count + moved };
    nextSource[from] =
      moved === moving.count ? null : { item: moving.item, count: moving.count - moved };
    return { source: nextSource, target: nextTarget };
  }
  nextTarget[to] = moving;
  nextSource[from] = there;
  return { source: nextSource, target: nextTarget };
}

/**
 * `addItems` over the slots named by `order`, in that order: stacks of the item first,
 * then empty slots (the quick move of a chest screen). Other slots are not touched.
 */
export function addItemsInOrder(
  slots: Slots,
  item: number,
  count: number,
  order: readonly number[],
): AddResult {
  const size = stackSizeOf(item);
  const next = slots.slice();
  let left = count;
  for (const i of order) {
    if (left <= 0) break;
    const stack = next[i];
    if (!stack || stack.item !== item || stack.count >= size) continue;
    const moved = Math.min(left, size - stack.count);
    next[i] = { item, count: stack.count + moved };
    left -= moved;
  }
  for (const i of order) {
    if (left <= 0) break;
    if (next[i] || !(i in next)) continue;
    const moved = Math.min(left, size);
    next[i] = { item, count: moved };
    left -= moved;
  }
  return { slots: next, left };
}

/** Whether all the stacks fit together (one combined check, as breaking a chest needs). */
export function fitsAll(slots: Slots, stacks: readonly ItemStack[]): boolean {
  let next = slots;
  for (const stack of stacks) {
    const added = addItems(next, stack.item, stack.count);
    if (added.left > 0) return false;
    next = added.slots;
  }
  return true;
}
