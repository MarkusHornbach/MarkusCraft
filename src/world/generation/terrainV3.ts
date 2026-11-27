// Generator version 3 (Phase 8 part B2a): version 2's terrain with tunnels, ravines and mine shafts.
import { CHUNK_SIZE, CHUNK_VOLUME } from '../../game/config';
import { placeOres } from './ores';
import { TerrainV2 } from './terrainV2';
import type { WorldOptions } from './worldOptions';

/**
 * Terrain of one seed and one set of world options with caves. The phases are version 2's
 * (base, clay, ores, trees) with the carving and the shafts between the ores and the trees.
 */
export class TerrainV3 extends TerrainV2 {
  constructor(seed: number, options: WorldOptions) {
    super(seed, options);
    this.hooks = true;
  }

  override generateChunk(cx: number, cz: number): Uint8Array {
    const blocks = new Uint8Array(CHUNK_VOLUME);
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const maxHeight = this.fillBase(blocks, cx, cz);
    placeOres(this.seed, blocks, x0, z0, maxHeight);
    this.placeTreesPhase(blocks, x0, z0);
    return blocks;
  }
}
