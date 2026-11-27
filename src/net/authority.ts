// Blocks for the host's decisions anywhere in the world: the loaded chunk if there is one,
// otherwise the chunk generated on the side plus the recorded edits, in a small cache
// without light or meshes (plan 5.6; completed in Part C).
import { AUTHORITY_CACHE_CHUNKS, WORLD_HEIGHT } from '../game/config';
import { Block } from '../world/blocks';
import { blockIndex, chunkKey, toChunkCoord, toLocalCoord } from '../world/chunk';
import { generateChunk } from '../world/generation/terrain';
import type { BlockState } from '../world/blockState';
import type { World } from '../world/World';

export class FarReader {
  private readonly world: World;
  private readonly max: number;
  /** Chunk key → blocks; a Map keeps insertion order, which serves as recency. */
  private readonly cache = new Map<string, Uint8Array>();

  constructor(world: World, max: number = AUTHORITY_CACHE_CHUNKS) {
    this.world = world;
    this.max = max;
  }

  /** Chunks generated on the side right now. */
  get cached(): number {
    return this.cache.size;
  }

  getBlock(x: number, y: number, z: number): number {
    if (y >= WORLD_HEIGHT) return Block.AIR;
    if (y < 0) return Block.BEDROCK;
    const cx = toChunkCoord(x);
    const cz = toChunkCoord(z);
    const index = blockIndex(toLocalCoord(x), y, toLocalCoord(z));
    const loaded = this.world.getChunk(cx, cz);
    if (loaded) return loaded.blocks[index];
    return this.side(cx, cz)[index];
  }

  /**
   * The state of a cell (a chest's slots) by the block this reader sees there: stored in
   * the world, else the initial one; null for a block without state (Phase 8 part B3a).
   */
  getState(x: number, y: number, z: number): BlockState | null {
    return this.world.stateFor(this.getBlock(x, y, z), x, y, z);
  }

  /** A block was set in the world: a cached copy of its chunk follows. */
  noteEdit(x: number, y: number, z: number, id: number): void {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const blocks = this.cache.get(chunkKey(toChunkCoord(x), toChunkCoord(z)));
    if (blocks) blocks[blockIndex(toLocalCoord(x), y, toLocalCoord(z))] = id;
  }

  private side(cx: number, cz: number): Uint8Array {
    const key = chunkKey(cx, cz);
    let blocks = this.cache.get(key);
    if (blocks) {
      // Most recently used goes to the end.
      this.cache.delete(key);
      this.cache.set(key, blocks);
      return blocks;
    }
    blocks = generateChunk(this.world.seed, cx, cz, this.world.gen);
    const edits = this.world.edits.get(key);
    if (edits) for (const [index, id] of edits) blocks[index] = id;
    this.cache.set(key, blocks);
    while (this.cache.size > this.max) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
    return blocks;
  }
}
