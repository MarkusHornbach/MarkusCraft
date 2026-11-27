// The resources the radar shows: one row per kind (a new ore is one row here and one in ORE_KINDS).
import { Block } from '../world/blocks';
import { ORE_KINDS, type OreKind } from '../world/generation/ores';

/** Symbols differ by shape, so colour is never the only difference. */
export type RadarShape = 'dot' | 'diamond';

export interface RadarKind {
  /** Stable key, used by the test API and the screens. */
  readonly key: string;
  /** The ore block of the kind. */
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
    block: Block.COAL_ORE,
    label: 'Coal',
    shape: 'dot',
    colour: 0x2a2a2a,
    rim: 0xe0e0e0,
  },
  {
    key: 'iron',
    block: Block.IRON_ORE,
    label: 'Iron',
    shape: 'diamond',
    colour: 0xd9a46c,
    rim: 0x3b2614,
  },
];

/** The generator's row of a radar kind (its veins, height range and order). */
export function oreKindOf(kind: RadarKind): OreKind {
  const ore = ORE_KINDS.find((o) => o.block === kind.block);
  if (!ore) throw new Error(`No ore kind for radar kind ${kind.key}`);
  return ore;
}

export function radarKindByKey(key: string): RadarKind | undefined {
  return RADAR_KINDS.find((k) => k.key === key);
}
