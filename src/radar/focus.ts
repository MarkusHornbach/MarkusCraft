// What the circle and the map show: the task focus (a tracked "mine" task of an ore narrows
// the circle to that kind), the place kinds and the circle's limits per kind.
import { dropOf } from '../items/hardness';
import { Item } from '../items/items';
import type { Task } from '../progress/tables';
import { RADAR_CIRCLE_PER_KIND, RADAR_CIRCLE_PLACES } from '../game/config';
import { ORE_RADAR_KINDS, PLACE_RADAR_KINDS, RADAR_KINDS, type RadarKind } from './kinds';
import type { RadarScan } from './scan';

/**
 * The kind whose block drops the tracked task's `mine` target (through the drop table, with
 * the best pickaxe in hand), or null: the circle shows every kind. It narrows the ore kinds
 * only; places always show (a shaft or an entrance leads to both ores).
 */
export function radarFocus(tracked: Task | null): RadarKind | null {
  if (!tracked || tracked.type !== 'mine') return null;
  return (
    ORE_RADAR_KINDS.find((k) => dropOf(k.block, Item.IRON_PICKAXE)?.item === tracked.target) ?? null
  );
}

/**
 * The kinds the circle shows: the focus (an ore kind) or every ore kind, then the place
 * kinds where the world has places.
 */
export function circleKinds(
  focus: RadarKind | null,
  hasPlaces: boolean,
  hasChests = false,
): readonly RadarKind[] {
  const ores = focus ? [focus] : ORE_RADAR_KINDS;
  return hasPlaces ? [...ores, ...placeKinds(hasChests)] : ores;
}

/**
 * The kinds the Map tab and its legend show: every ore kind, and the places if any (the
 * chest only where the generator puts loot chests, version 4).
 */
export function mapKinds(hasPlaces: boolean, hasChests = false): readonly RadarKind[] {
  if (!hasPlaces) return ORE_RADAR_KINDS;
  return hasChests ? RADAR_KINDS : WITHOUT_CHESTS;
}

const WITHOUT_CHESTS: readonly RadarKind[] = RADAR_KINDS.filter((k) => k.key !== 'chest');
const PLACES_WITHOUT_CHESTS: readonly RadarKind[] = PLACE_RADAR_KINDS.filter(
  (k) => k.key !== 'chest',
);

function placeKinds(hasChests: boolean): readonly RadarKind[] {
  return hasChests ? PLACE_RADAR_KINDS : PLACES_WITHOUT_CHESTS;
}

/**
 * The circle's part of a full scan: the entries of `kinds`, at most `RADAR_CIRCLE_PER_KIND`
 * per ore kind and `RADAR_CIRCLE_PLACES` per place kind (the scan is sorted per kind), and
 * their rim arrows.
 */
export function circleScan(scan: RadarScan, kinds: readonly RadarKind[]): RadarScan {
  const limits = new Map(
    kinds.map((k) => [k.key, k.category === 'place' ? RADAR_CIRCLE_PLACES : RADAR_CIRCLE_PER_KIND]),
  );
  const counts = new Map<string, number>();
  const entries = scan.entries.filter((e) => {
    const limit = limits.get(e.kind);
    if (limit === undefined) return false;
    const n = counts.get(e.kind) ?? 0;
    counts.set(e.kind, n + 1);
    return n < limit;
  });
  return { entries, beyond: scan.beyond.filter((b) => limits.has(b.kind)) };
}
