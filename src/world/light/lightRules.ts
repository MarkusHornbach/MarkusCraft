// Light rules: levels, packing of the two channels into one byte, and the step rule.
import { CHUNK_SIZE, LIGHT_MAX } from '../../game/config';
import { BLOCK_EMISSION, BLOCK_OPACITY } from '../blocks';

/** Per block id: how much light a block swallows and how much it gives off. */
export interface LightTables {
  readonly opacity: Uint8Array;
  readonly emission: Uint8Array;
}

/** The tables of the real block table. Tests pass their own to try out emitters. */
export const BLOCK_LIGHT: LightTables = { opacity: BLOCK_OPACITY, emission: BLOCK_EMISSION };

/** Light of a cell above the world, and of a chunk nothing is known about: open sky. */
export const LIGHT_OPEN_SKY = LIGHT_MAX << 4;

/** One byte per cell: sky light in the high four bits, block light in the low four. */
export function packLight(sky: number, block: number): number {
  return (sky << 4) | block;
}

export function skyOf(light: number): number {
  return light >> 4;
}

export function blockOf(light: number): number {
  return light & 15;
}

/**
 * The step rule: the level with which light of `level` arrives in a neighbouring cell of
 * the given opacity. Every step costs one level plus the opacity of the cell entered, so
 * nothing enters an opaque cell. The one exception: full sky light going straight down
 * into a cell of opacity 0 stays full, which is what makes an open column bright.
 */
export function stepLight(level: number, opacity: number, skyStraightDown: boolean): number {
  if (skyStraightDown && level === LIGHT_MAX && opacity === 0) return LIGHT_MAX;
  const arrives = level - 1 - opacity;
  return arrives > 0 ? arrives : 0;
}

/** Block data (or light) of the chunk at offset (dx, dz) ∈ {-1, 0, 1}², or null. */
export type ChunkLookup = (dx: number, dz: number) => Uint8Array | null;

/**
 * Which chunks of a 3 × 3 group see a cell of the group: the cell's own chunk, plus the
 * neighbours whose mesh reads it because it lies on a chunk border (diagonal ones too).
 * `gx`, `gz` ∈ 0..2 name the cell's chunk, `lx`, `lz` its place inside. The answer has bit
 * `gx + 3 * gz` set for every such chunk.
 */
export function chunksSeeingCell(gx: number, gz: number, lx: number, lz: number): number {
  const x0 = lx === 0 && gx > 0 ? gx - 1 : gx;
  const x1 = lx === CHUNK_SIZE - 1 && gx < 2 ? gx + 1 : gx;
  const z0 = lz === 0 && gz > 0 ? gz - 1 : gz;
  const z1 = lz === CHUNK_SIZE - 1 && gz < 2 ? gz + 1 : gz;
  let mask = 0;
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) mask |= 1 << (x + 3 * z);
  return mask;
}
