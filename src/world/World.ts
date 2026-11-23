// World: the set of loaded chunks, block access in world coordinates, and the edit log.
import { CHUNK_SIZE, WORLD_HEIGHT } from '../game/config';
import { BLOCK_SOLID, Block } from './blocks';
import { type Chunk, blockIndex, chunkKey, createChunk, toChunkCoord, toLocalCoord } from './chunk';
import { generateChunk } from './generation/terrain';
import { CLASSIC_GEN, type WorldGen } from './generation/worldOptions';
import { checkChunkLight } from './light/lightCheck';
import { lightChunk } from './light/lightChunk';
import { BLOCK_LIGHT, LIGHT_OPEN_SKY, type LightTables } from './light/lightRules';
import { changesLight, lightDifference, updateLight } from './light/lightUpdate';

/**
 * Told about every chunk whose mesh is out of date because light changed: a light value
 * in it or in a border cell its mesh reads. `lit` is false if the chunk lost its light
 * altogether and has to be lit again before it can be meshed.
 */
export type LightListener = (cx: number, cz: number, lit: boolean) => void;

export class World {
  readonly seed: number;
  /** The terrain generator (version and options) this world was created with. */
  readonly gen: WorldGen;
  private readonly chunks = new Map<string, Chunk>();
  /**
   * Player edits per chunk (block index → block id). Kept when a chunk unloads and
   * re-applied when it is generated again. This map is what saving writes.
   */
  readonly edits: Map<string, Map<number, number>>;
  // One-entry cache: consecutive block reads usually hit the same chunk.
  private lastChunk: Chunk | null = null;
  /** Opacity and emission per block id. Tests swap in tables with emitters. */
  lightTables: LightTables = BLOCK_LIGHT;
  /** Set by the chunk manager, which remeshes what light changed. */
  onLightChange: LightListener | null = null;

  /** `edits` are the saved edits of a loaded world; the world takes the map over. */
  constructor(
    seed: number,
    gen: WorldGen = CLASSIC_GEN,
    edits: Map<string, Map<number, number>> = new Map(),
  ) {
    this.seed = seed >>> 0;
    this.gen = gen;
    this.edits = edits;
  }

  /** Version of the terrain generator this world was created with. */
  get generatorVersion(): number {
    return this.gen.version;
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
    const chunk = createChunk(cx, cz, generateChunk(this.seed, cx, cz, this.gen));
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
   * when the chunk is generated). The stored light is brought up to date and the chunks it
   * changed in are reported to `onLightChange`. Returns false outside the vertical range.
   */
  setBlock(x: number, y: number, z: number, id: number): boolean {
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const cx = toChunkCoord(x);
    const cz = toChunkCoord(z);
    const lx = toLocalCoord(x);
    const lz = toLocalCoord(z);
    const index = blockIndex(lx, y, lz);
    const key = chunkKey(cx, cz);
    let edits = this.edits.get(key);
    if (!edits) {
      edits = new Map();
      this.edits.set(key, edits);
    }
    edits.set(index, id);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) {
      // Light of chunks around it may depend on the block; it cannot be worked out now.
      this.relightAround(cx, cz);
      return true;
    }
    const old = chunk.blocks[index];
    chunk.blocks[index] = id;
    if (!changesLight(old, id, this.lightTables)) return true;
    if (!this.allLit(cx, cz)) {
      this.relightAround(cx, cz);
      return true;
    }
    const mask = updateLight(
      (dx, dz) => this.getChunk(cx + dx, cz + dz)?.blocks ?? null,
      (dx, dz) => this.getChunk(cx + dx, cz + dz)?.light ?? null,
      lx,
      y,
      lz,
      old,
      this.lightTables,
    );
    this.reportLight(cx, cz, mask);
    return true;
  }

  // --- light ---------------------------------------------------------------------------

  /** Whether the chunk and its eight neighbours are generated: then it can be lit. */
  canLight(cx: number, cz: number): boolean {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) if (!this.hasChunk(cx + dx, cz + dz)) return false;
    }
    return true;
  }

  /** Whether the chunk and its eight neighbours are lit: then it can be meshed. */
  allLit(cx: number, cz: number): boolean {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) if (!this.getChunk(cx + dx, cz + dz)?.light) return false;
    }
    return true;
  }

  /** The lighting job: works out the light of a chunk from scratch and stores it. */
  light(cx: number, cz: number): void {
    const chunk = this.getChunk(cx, cz);
    if (!chunk || !this.canLight(cx, cz)) throw new Error(`Chunk ${cx},${cz} cannot be lit yet`);
    chunk.light = this.lightFromScratch(cx, cz);
  }

  private lightFromScratch(cx: number, cz: number): Uint8Array {
    return lightChunk(
      (dx, dz) => this.getChunk(cx + dx, cz + dz)?.blocks ?? null,
      this.lightTables,
    );
  }

  /**
   * After an edit in chunk (cx, cz) that the quick update cannot handle because not all
   * nine chunks are lit: every lit chunk around is worked out again, or loses its light
   * if a chunk it depends on is missing.
   */
  private relightAround(cx: number, cz: number): void {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.getChunk(cx + dx, cz + dz);
        if (!chunk?.light) continue;
        if (this.canLight(chunk.cx, chunk.cz)) {
          const fresh = this.lightFromScratch(chunk.cx, chunk.cz);
          const mask = lightDifference(chunk.light, fresh);
          chunk.light = fresh;
          this.reportLight(chunk.cx, chunk.cz, mask);
        } else {
          chunk.light = null;
          this.onLightChange?.(chunk.cx, chunk.cz, false);
        }
      }
    }
  }

  /** Reports the chunks named by a mask of `updateLight`, around chunk (cx, cz). */
  private reportLight(cx: number, cz: number, mask: number): void {
    if (mask === 0 || !this.onLightChange) return;
    for (let g = 0; g < 9; g++) {
      if (mask & (1 << g)) this.onLightChange(cx + (g % 3) - 1, cz + Math.floor(g / 3) - 1, true);
    }
  }

  /**
   * Packed light (see `packLight`) of a cell: open sky above the world, nothing below it,
   * and null in a chunk that is not lit.
   */
  getLight(x: number, y: number, z: number): number | null {
    if (y >= WORLD_HEIGHT) return LIGHT_OPEN_SKY;
    if (y < 0) return 0;
    const light = this.getChunk(toChunkCoord(x), toChunkCoord(z))?.light;
    if (!light) return null;
    return light[blockIndex(toLocalCoord(x), y, toLocalCoord(z))];
  }

  get litCount(): number {
    let count = 0;
    for (const chunk of this.chunks.values()) if (chunk.light) count++;
    return count;
  }

  /** Blocks of a chunk as they are or would be: generated on the side if not loaded. */
  private blocksOf(cx: number, cz: number, cache: Map<string, Uint8Array>): Uint8Array {
    const loaded = this.getChunk(cx, cz);
    if (loaded) return loaded.blocks;
    const key = chunkKey(cx, cz);
    let blocks = cache.get(key);
    if (!blocks) {
      blocks = generateChunk(this.seed, cx, cz, this.gen);
      const edits = this.edits.get(key);
      if (edits) for (const [index, id] of edits) blocks[index] = id;
      cache.set(key, blocks);
    }
    return blocks;
  }

  /**
   * Light of a chunk for checksums: the stored light, or the light it would have if the
   * chunk is not lit. Loads nothing into the world.
   */
  lightOf(cx: number, cz: number): Uint8Array {
    const stored = this.getChunk(cx, cz)?.light;
    if (stored) return stored;
    const cache = new Map<string, Uint8Array>();
    return lightChunk((dx, dz) => this.blocksOf(cx + dx, cz + dz, cache), this.lightTables);
  }

  /**
   * The invariant of the light: counts the cells of all lit chunks whose stored light
   * differs from what the slow reference works out from the blocks. 0 is correct. Slow.
   */
  verifyLight(): number {
    const cache = new Map<string, Uint8Array>();
    let wrong = 0;
    for (const chunk of this.chunks.values()) {
      const light = chunk.light;
      if (!light) continue;
      const expected = checkChunkLight(
        (dx, dz) => this.blocksOf(chunk.cx + dx, chunk.cz + dz, cache),
        this.lightTables,
      );
      for (let i = 0; i < expected.length; i++) if (light[i] !== expected[i]) wrong++;
    }
    return wrong;
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
