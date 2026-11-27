// Pure helpers of the Map tab: the colours of the terrain background and the legend texts.
import { CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT } from '../game/config';
import { Block } from '../world/blocks';
import type { RadarKind } from './kinds';
import type { RadarBeyond, RadarEntry, RadarHint } from './scan';

/** Map colour per top block (0xRRGGBB), generated here; other blocks use `MAP_UNKNOWN`. */
export const MAP_COLOURS: ReadonlyMap<number, number> = new Map([
  [Block.WATER, 0x3b6fc4],
  [Block.SAND, 0xd8cc8c],
  [Block.GRASS, 0x5e9c3e],
  [Block.DIRT, 0x8a6240],
  [Block.STONE, 0x8c8c8c],
  [Block.LEAVES, 0x2f6e2a],
  [Block.LOG, 0x6b4a2a],
  [Block.CLAY, 0x9aa3b0],
  [Block.COAL_ORE, 0x5a5a5a],
  [Block.IRON_ORE, 0xa88466],
  [Block.PLANKS, 0xb08a52],
  [Block.BEDROCK, 0x333333],
]);
export const MAP_UNKNOWN = 0x9a9a9a;

/** The colour of a top block. */
export function mapColour(block: number): number {
  return MAP_COLOURS.get(block) ?? MAP_UNKNOWN;
}

/** Brightness factor of a column whose top lies at `y`: a simple relief, lighter with height. */
export function surfaceShade(y: number): number {
  const t = (y - SEA_LEVEL) / 48;
  return Math.max(0.55, Math.min(1.25, 0.9 + t * 0.35));
}

/** A colour (0xRRGGBB) times a factor, clamped. */
export function shadeColour(colour: number, factor: number): number {
  const r = Math.min(255, Math.round(((colour >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((colour >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((colour & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

/**
 * The top block of column (lx, lz) of a chunk's block data that is not air: its id in the
 * low byte and its height above (`id | y << 8`), or -1 for an empty column.
 */
export function topBlockOf(blocks: Uint8Array, lx: number, lz: number): number {
  const layer = CHUNK_SIZE * CHUNK_SIZE;
  const column = lx + lz * CHUNK_SIZE;
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
    const id = blocks[column + y * layer];
    if (id !== Block.AIR) return id | (y << 8);
  }
  return -1;
}

/** The legend's hint words: "2 below", "2 above", "level"; coarse "below"; none "far". */
export function hintText(hint: RadarHint): string {
  if (hint === 'none') return 'far';
  if ('coarse' in hint)
    return hint.coarse === 'up' ? 'above' : hint.coarse === 'down' ? 'below' : 'level';
  if (hint.exact === 0) return 'level';
  return `${Math.abs(hint.exact)} ${hint.exact < 0 ? 'below' : 'above'}`;
}

/**
 * A legend row: "Coal · 7 blocks · 2 below", "Iron · 70 blocks · far" (beyond the radius),
 * "Iron · none within 96".
 */
export function legendText(
  kind: RadarKind,
  nearest: RadarEntry | null,
  beyond: RadarBeyond | null,
  farRadius: number,
): string {
  if (nearest) return `${kind.label} · ${blocksText(nearest.dist)} · ${hintText(nearest.hint)}`;
  if (beyond) return `${kind.label} · ${blocksText(beyond.dist)} · far`;
  return `${kind.label} · none within ${farRadius}`;
}

function blocksText(dist: number): string {
  const n = Math.round(dist);
  return n === 1 ? '1 block' : `${n} blocks`;
}
