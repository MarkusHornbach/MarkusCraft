// The circle's task focus: a tracked "mine" task of a radar resource narrows it to that kind.
import { dropOf } from '../items/hardness';
import { Item } from '../items/items';
import type { Task } from '../progress/tables';
import { RADAR_KINDS, type RadarKind } from './kinds';

/**
 * The kind whose block drops the tracked task's `mine` target (through the drop table, with
 * the best pickaxe in hand), or null: the circle shows every kind.
 */
export function radarFocus(tracked: Task | null): RadarKind | null {
  if (!tracked || tracked.type !== 'mine') return null;
  return (
    RADAR_KINDS.find((k) => dropOf(k.block, Item.IRON_PICKAXE)?.item === tracked.target) ?? null
  );
}
