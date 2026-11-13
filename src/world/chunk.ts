// Chunk data layout and coordinate helpers.
import { CHUNK_SIZE, CHUNK_VOLUME } from '../game/config';

export interface Chunk {
  readonly cx: number;
  readonly cz: number;
  /** Block ids, index `x + z*16 + y*256` (see `blockIndex`). */
  readonly blocks: Uint8Array;
  /** True once a mesh for the current block data has been handed to the renderer. */
  meshed: boolean;
}

const LAYER = CHUNK_SIZE * CHUNK_SIZE;

/** Index of a block inside a chunk's array, from chunk-local coordinates. */
export function blockIndex(lx: number, y: number, lz: number): number {
  return lx + lz * CHUNK_SIZE + y * LAYER;
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

/** Chunk coordinate containing a world block coordinate (correct for negatives). */
export function toChunkCoord(v: number): number {
  return Math.floor(v / CHUNK_SIZE);
}

/** Chunk-local coordinate 0..15 of a world block coordinate (correct for negatives). */
export function toLocalCoord(v: number): number {
  return ((v % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
}

export function createChunk(cx: number, cz: number, blocks?: Uint8Array): Chunk {
  const data = blocks ?? new Uint8Array(CHUNK_VOLUME);
  if (data.length !== CHUNK_VOLUME) throw new Error('Chunk data has the wrong size');
  return { cx, cz, blocks: data, meshed: false };
}
