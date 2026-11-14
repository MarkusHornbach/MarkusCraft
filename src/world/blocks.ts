// Block registry: a data table describing every block, plus fast lookup arrays.
import { HOTBAR_SLOTS } from '../game/config';

/** Texture tiles. The painters live in `render/textures/tiles.ts`, keyed by these ids. */
export const Tile = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  LOG_END: 5,
  LOG_BARK: 6,
  LEAVES: 7,
  PLANKS: 8,
  BRICKS: 9,
  GLASS: 10,
  WATER: 11,
  BEDROCK: 12,
  COAL_ORE: 13,
  IRON_ORE: 14,
  CLAY: 15,
  WORKBENCH_TOP: 16,
  WORKBENCH_SIDE: 17,
  FURNACE_SIDE: 18,
  FURNACE_TOP: 19,
  STONE_BRICKS: 20,
  IRON_BLOCK: 21,
} as const;
export type TileId = (typeof Tile)[keyof typeof Tile];
export const TILE_COUNT = Object.keys(Tile).length;
export const TILE_NAMES: readonly string[] = Object.keys(Tile).map((k) => k.toLowerCase());

/**
 * Block ids are written into save files: the table is append-only. An id is never reused
 * or renumbered (pinned by a unit test).
 */
export const Block = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  LOG: 5,
  LEAVES: 6,
  PLANKS: 7,
  BRICKS: 8,
  GLASS: 9,
  WATER: 10,
  BEDROCK: 11,
  COAL_ORE: 12,
  IRON_ORE: 13,
  CLAY: 14,
  WORKBENCH: 15,
  FURNACE: 16,
  STONE_BRICKS: 17,
  IRON_BLOCK: 18,
} as const;
export type BlockId = (typeof Block)[keyof typeof Block];

export type RenderKind = 'none' | 'opaque' | 'cutout' | 'translucent';

export interface BlockTiles {
  top: TileId;
  side: TileId;
  bottom: TileId;
}

export interface BlockDef {
  id: number;
  /** Lower-case key, stable for code and tests. */
  name: string;
  /** Name shown in the user interface. */
  label: string;
  /** Solid blocks collide with the player and can be targeted. */
  solid: boolean;
  render: RenderKind;
  /** Null only for blocks that are never drawn. */
  tiles: BlockTiles | null;
  /** Hotbar slot 1..9, or null if the block cannot be placed by the player. */
  slot: number | null;
  breakable: boolean;
  /** Replaceable cells (air, water) can receive a placed block. */
  replaceable: boolean;
  /** Whether the block darkens neighbouring faces through ambient occlusion. */
  castsAo: boolean;
  /** Cutout blocks only: hide faces between two blocks of this kind (glass panes merge). */
  mergesFaces: boolean;
}

function uniform(tile: TileId): BlockTiles {
  return { top: tile, side: tile, bottom: tile };
}

function solidBlock(
  id: number,
  name: string,
  label: string,
  tiles: BlockTiles,
  slot: number | null,
  render: RenderKind = 'opaque',
  castsAo = true,
  mergesFaces = false,
): BlockDef {
  return {
    id,
    name,
    label,
    solid: true,
    render,
    tiles,
    slot,
    breakable: true,
    replaceable: false,
    castsAo,
    mergesFaces,
  };
}

/** The block table, indexed by block id. Later phases append rows; ids never change. */
export const BLOCKS: readonly BlockDef[] = [
  {
    id: Block.AIR,
    name: 'air',
    label: 'Air',
    solid: false,
    render: 'none',
    tiles: null,
    slot: null,
    breakable: false,
    replaceable: true,
    castsAo: false,
    mergesFaces: false,
  },
  solidBlock(
    Block.GRASS,
    'grass',
    'Grass',
    { top: Tile.GRASS_TOP, side: Tile.GRASS_SIDE, bottom: Tile.DIRT },
    1,
  ),
  solidBlock(Block.DIRT, 'dirt', 'Dirt', uniform(Tile.DIRT), 2),
  solidBlock(Block.STONE, 'stone', 'Stone', uniform(Tile.STONE), 3),
  solidBlock(Block.SAND, 'sand', 'Sand', uniform(Tile.SAND), 4),
  solidBlock(
    Block.LOG,
    'log',
    'Log',
    { top: Tile.LOG_END, side: Tile.LOG_BARK, bottom: Tile.LOG_END },
    5,
  ),
  solidBlock(Block.LEAVES, 'leaves', 'Leaves', uniform(Tile.LEAVES), 6, 'cutout', true),
  solidBlock(Block.PLANKS, 'planks', 'Planks', uniform(Tile.PLANKS), 7),
  solidBlock(Block.BRICKS, 'bricks', 'Bricks', uniform(Tile.BRICKS), 8),
  solidBlock(Block.GLASS, 'glass', 'Glass', uniform(Tile.GLASS), 9, 'cutout', false, true),
  {
    id: Block.WATER,
    name: 'water',
    label: 'Water',
    solid: false,
    render: 'translucent',
    tiles: uniform(Tile.WATER),
    slot: null,
    breakable: false,
    replaceable: true,
    castsAo: false,
    mergesFaces: false,
  },
  {
    ...solidBlock(Block.BEDROCK, 'bedrock', 'Bedrock', uniform(Tile.BEDROCK), null),
    breakable: false,
  },
  solidBlock(Block.COAL_ORE, 'coal_ore', 'Coal ore', uniform(Tile.COAL_ORE), null),
  solidBlock(Block.IRON_ORE, 'iron_ore', 'Iron ore', uniform(Tile.IRON_ORE), null),
  solidBlock(Block.CLAY, 'clay', 'Clay', uniform(Tile.CLAY), null),
  solidBlock(
    Block.WORKBENCH,
    'workbench',
    'Workbench',
    { top: Tile.WORKBENCH_TOP, side: Tile.WORKBENCH_SIDE, bottom: Tile.PLANKS },
    null,
  ),
  solidBlock(
    Block.FURNACE,
    'furnace',
    'Furnace',
    { top: Tile.FURNACE_TOP, side: Tile.FURNACE_SIDE, bottom: Tile.FURNACE_TOP },
    null,
  ),
  solidBlock(Block.STONE_BRICKS, 'stone_bricks', 'Stone bricks', uniform(Tile.STONE_BRICKS), null),
  solidBlock(Block.IRON_BLOCK, 'iron_block', 'Iron block', uniform(Tile.IRON_BLOCK), null),
];

export const RENDER_NONE = 0;
export const RENDER_OPAQUE = 1;
export const RENDER_CUTOUT = 2;
export const RENDER_TRANSLUCENT = 3;
const RENDER_CODES: Record<RenderKind, number> = {
  none: RENDER_NONE,
  opaque: RENDER_OPAQUE,
  cutout: RENDER_CUTOUT,
  translucent: RENDER_TRANSLUCENT,
};

// Flat lookup arrays for hot paths (meshing, physics). Unknown ids behave like air.
export const BLOCK_SOLID = new Uint8Array(256);
export const BLOCK_RENDER = new Uint8Array(256);
export const BLOCK_CASTS_AO = new Uint8Array(256);
export const BLOCK_MERGES_FACES = new Uint8Array(256);
export const BLOCK_REPLACEABLE = new Uint8Array(256).fill(1);
export const BLOCK_TILE_TOP = new Uint8Array(256);
export const BLOCK_TILE_SIDE = new Uint8Array(256);
export const BLOCK_TILE_BOTTOM = new Uint8Array(256);
for (const def of BLOCKS) {
  BLOCK_SOLID[def.id] = def.solid ? 1 : 0;
  BLOCK_RENDER[def.id] = RENDER_CODES[def.render];
  BLOCK_CASTS_AO[def.id] = def.castsAo ? 1 : 0;
  BLOCK_MERGES_FACES[def.id] = def.mergesFaces ? 1 : 0;
  BLOCK_REPLACEABLE[def.id] = def.replaceable ? 1 : 0;
  if (def.tiles) {
    BLOCK_TILE_TOP[def.id] = def.tiles.top;
    BLOCK_TILE_SIDE[def.id] = def.tiles.side;
    BLOCK_TILE_BOTTOM[def.id] = def.tiles.bottom;
  }
}

/** Block ids of the hotbar, index 0 = slot 1. */
export const HOTBAR_BLOCKS: readonly number[] = Array.from({ length: HOTBAR_SLOTS }, (_, i) => {
  const def = BLOCKS.find((b) => b.slot === i + 1);
  if (!def) throw new Error(`No block assigned to hotbar slot ${i + 1}`);
  return def.id;
});

export function getBlockDef(id: number): BlockDef {
  return BLOCKS[id] ?? BLOCKS[Block.AIR];
}

export function isSolid(id: number): boolean {
  return BLOCK_SOLID[id] === 1;
}

/** Blocks a player can hold and place: every solid block that can also be broken again. */
export function isPlaceable(id: number): boolean {
  const def = BLOCKS[id];
  return def !== undefined && def.solid && def.breakable;
}
