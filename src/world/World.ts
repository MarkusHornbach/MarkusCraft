// World: the set of loaded chunks, block access in world coordinates, and the edit log.
import { CHUNK_SIZE, WORLD_HEIGHT } from '../game/config';
import { BLOCK_SOLID, Block } from './blocks';
import { type Chunk, blockIndex, chunkKey, createChunk, toChunkCoord, toLocalCoord } from './chunk';
import { generateChunk } from './generation/terrain';

export class World {
  readonly seed: number;
  private readonly chunks = new Map<string, Chunk>();
  /**
   * Player edits per chunk (block index → block id). Kept when a chunk unloads and
   * re-applied when it is generated again. This map is the future input of saving.
   */
  readonly edits = new Map<string, Map<number, number>>();
  // One-entry cache: consecutive block reads usually hit the same chunk.
  private lastChunk: Chunk | null = null;

  constructor(seed: number) {
    this.seed = seed >>> 0;
  }

  get chunkCount(): number {
    return this.chunks.size;
  }

  allChunks(): IterableIterator<Chunk> {
    return this.chunks.values();
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    const last = this.lastChunk;
    if (last && last.cx === cx && last.cz === cz) return last;
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (chunk) this.lastChunk = chunk;
    return chunk;
  }

  hasChunk(cx: number, cz: number): boolean {
    return this.getChunk(cx, cz) !== undefined;
  }

  /** Generates the chunk (terrain plus recorded edits) and adds it to the world. */
  generate(cx: number, cz: number): Chunk {
    const existing = this.getChunk(cx, cz);
    if (existing) return existing;
    const chunk = createChunk(cx, cz, generateChunk(this.seed, cx, cz));
    const edits = this.edits.get(chunkKey(cx, cz));
    if (edits) for (const [index, id] of edits) chunk.blocks[index] = id;
    this.chunks.set(chunkKey(cx, cz), chunk);
    return chunk;
  }

  /** Adds externally created chunk data (used by tests to build small worlds). */
  addChunk(chunk: Chunk): void {
    this.chunks.set(chunkKey(chunk.cx, chunk.cz), chunk);
    this.lastChunk = null;
  }

  removeChunk(cx: number, cz: number): void {
    this.chunks.delete(chunkKey(cx, cz));
    this.lastChunk = null;
  }

  /**
   * Block id at world coordinates, for rendering and game logic: air above the world,
   * bedrock below it, and air in chunks that are not loaded.
   */
  getBlock(x: number, y: number, z: number): number {
    if (y >= WORLD_HEIGHT) return Block.AIR;
    if (y < 0) return Block.BEDROCK;
    const chunk = this.getChunk(toChunkCoord(x), toChunkCoord(z));
    if (!chunk) return Block.AIR;
    return chunk.blocks[blockIndex(toLocalCoord(x), y, toLocalCoord(z))];
  }

  /**
   * Solidity for physics. Unloaded chunks count as solid so the player can never fall
   * through terrain that has not been generated yet.
   */
  isSolidAt(x: number, y: number, z: number): boolean {
    if (y >= WORLD_HEIGHT) return false;
    if (y < 0) return true;
    const chunk = this.getChunk(toChunkCoord(x), toChunkCoord(z));
    if (!chunk) return true;
    return BLOCK_SOLID[chunk.blocks[blockIndex(toLocalCoord(x), y, toLocalCoord(z))]] === 1;
  }

  isWaterAt(x: number, y: number, z: number): boolean {
    return this.getBlock(x, y, z) === Block.WATER;
  }

  /**
   * Sets a block and records the edit. Works for unloaded chunks too (the edit is applied
   * when the chunk is generated). Returns false outside the vertical range.
   */
  setBlock(x: number, y: number, z: number, id: number): boolean {
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const cx = toChunkCoord(x);
    const cz = toChunkCoord(z);
    const index = blockIndex(toLocalCoord(x), y, toLocalCoord(z));
    const key = chunkKey(cx, cz);
    let edits = this.edits.get(key);
    if (!edits) {
      edits = new Map();
      this.edits.set(key, edits);
    }
    edits.set(index, id);
    const chunk = this.getChunk(cx, cz);
    if (chunk) chunk.blocks[index] = id;
    return true;
  }

  /** Y of the highest block in the column that is neither air nor leaves, or -1. */
  surfaceY(x: number, z: number): number {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      const id = this.getBlock(x, y, z);
      if (id !== Block.AIR && id !== Block.LEAVES) return y;
    }
    return -1;
  }
}

/**
 * Chunks whose mesh depends on block (x, z): its own chunk, plus the neighbours when the
 * block lies on a chunk border (including diagonal ones, which ambient occlusion reads).
 */
export function chunksAffectedByEdit(x: number, z: number): { cx: number; cz: number }[] {
  const cx = toChunkCoord(x);
  const cz = toChunkCoord(z);
  const lx = toLocalCoord(x);
  const lz = toLocalCoord(z);
  const dxs = lx === 0 ? [0, -1] : lx === CHUNK_SIZE - 1 ? [0, 1] : [0];
  const dzs = lz === 0 ? [0, -1] : lz === CHUNK_SIZE - 1 ? [0, 1] : [0];
  const result: { cx: number; cz: number }[] = [];
  for (const dz of dzs) for (const dx of dxs) result.push({ cx: cx + dx, cz: cz + dz });
  return result;
}
