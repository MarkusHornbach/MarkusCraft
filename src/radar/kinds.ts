// What the radar shows: one row per kind; ores (a new ore is one row here and one in
// ORE_KINDS) and places (Phase 8 part B2b: mine shafts, cave entrances; B3b: loot chests).
import { Block } from '../world/blocks';
import { ORE_KINDS, type OreKind } from '../world/generation/ores';

/** Symbols differ by shape, so colour is never the only difference. */
export type RadarShape = 'dot' | 'diamond' | 'square' | 'triangle' | 'chest';

/** Ores come from `VeinIndex`, places from `PlaceIndex`. */
export type RadarCategory = 'ore' | 'place';

export interface RadarKind {
  /** Stable key, used by the test API and the screens. */
  readonly key: string;
  readonly category: RadarCategory;
  /** The ore block of an ore kind; -1 for a place kind. */
  readonly block: number;
  readonly label: string;
  readonly shape: RadarShape;
  /** Fill and rim colour as 0xRRGGBB. */
  readonly colour: number;
  readonly rim: number;
}

export const RADAR_KINDS: readonly RadarKind[] = [
  {
    key: 'coal',
    category: 'ore',
    block: Block.COAL_ORE,
    label: 'Coal',
    shape: 'dot',
    colour: 0x2a2a2a,
    rim: 0xe0e0e0,
  },
  {
    key: 'iron',
    category: 'ore',
    block: Block.IRON_ORE,
    label: 'Iron',
    shape: 'diamond',
    colour: 0xd9a46c,
    rim: 0x3b2614,
  },
  {
    key: 'shaft',
    category: 'place',
    block: -1,
    label: 'Shaft',
    shape: 'square',
    colour: 0xc8a070,
    rim: 0x2a1a0c,
  },
  {
    key: 'cave',
    category: 'place',
    block: -1,
    label: 'Cave',
    shape: 'triangle',
    colour: 0xd0d4da,
    rim: 0x1c2026,
  },
  {
    // Generator 4's loot chests while they hold items (Phase 8 part B3b): a filled amber
    // square with a dark band, unlike the shaft's hollow square.
    key: 'chest',
    category: 'place',
    block: -1,
    label: 'Chest',
    shape: 'chest',
    colour: 0xf0a020,
    rim: 0x2a1600,
  },
];

export const ORE_RADAR_KINDS: readonly RadarKind[] = RADAR_KINDS.filter(
  (k) => k.category === 'ore',
);
export const PLACE_RADAR_KINDS: readonly RadarKind[] = RADAR_KINDS.filter(
  (k) => k.category === 'place',
);

/** The generator's row of a radar kind (its veins, height range and order). */
export function oreKindOf(kind: RadarKind): OreKind {
  const ore = ORE_KINDS.find((o) => o.block === kind.block);
  if (!ore) throw new Error(`No ore kind for radar kind ${kind.key}`);
  return ore;
}

export function radarKindByKey(key: string): RadarKind | undefined {
  return RADAR_KINDS.find((k) => k.key === key);
}
