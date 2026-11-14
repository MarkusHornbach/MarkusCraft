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
