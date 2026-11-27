// The radar's agreement check (Phase 8 part B1 AC1.1, B2a AC3.4): predicted ore cells of
// `VeinIndex` against `generateChunk`'s ores in the 3 × 3 chunks around a chunk.
import { CHUNK_SIZE } from '../game/config';
import { RADAR_KINDS } from '../radar/kinds';
import { VeinIndex } from '../radar/veins';
import { generateChunk } from '../world/generation/terrain';
import type { WorldGen } from '../world/generation/worldOptions';

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export interface Disagreement {
  kind: string;
  /** Cells the radar predicts that hold no such ore. */
  extra: string[];
  /** Ore cells the radar does not predict. */
  missing: string[];
  /** Ore cells compared. */
  compared: number;
}

/** Compares prediction and generation per radar kind around chunk (scx, scz). */
export function radarAgreement(
  seed: number,
  gen: WorldGen,
  index: VeinIndex,
  scx: number,
  scz: number,
): Disagreement[] {
  const x0 = (scx - 1) * CHUNK_SIZE;
  const z0 = (scz - 1) * CHUNK_SIZE;
  const x1 = (scx + 2) * CHUNK_SIZE - 1;
  const z1 = (scz + 2) * CHUNK_SIZE - 1;
  const chunks: [number, number, Uint8Array][] = [];
  for (let cz = scz - 1; cz <= scz + 1; cz++) {
    for (let cx = scx - 1; cx <= scx + 1; cx++)
      chunks.push([cx, cz, generateChunk(seed, cx, cz, gen)]);
  }
  return RADAR_KINDS.map((kind) => {
    const actual = new Set<string>();
    for (const [cx, cz, blocks] of chunks) {
      for (let i = 0; i < blocks.length; i++) {
        if (blocks[i] !== kind.block) continue;
        const lx = i % CHUNK_SIZE;
        const lz = Math.floor(i / CHUNK_SIZE) % CHUNK_SIZE;
        const y = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE));
        actual.add(key(cx * CHUNK_SIZE + lx, y, cz * CHUNK_SIZE + lz));
      }
    }
    const predicted = new Set<string>();
    for (let cz = VeinIndex.cellOf(z0 - 2); cz <= VeinIndex.cellOf(z1 + 2); cz++) {
      for (let cx = VeinIndex.cellOf(x0 - 2); cx <= VeinIndex.cellOf(x1 + 2); cx++) {
        const column = index.column(cx, cz);
        for (let v = 0; v < column.count; v++) {
          if (column.blocks[v] !== kind.block) continue;
          for (let c = column.starts[v]; c < column.starts[v + 1]; c++) {
            const x = column.cells[c * 3];
            const z = column.cells[c * 3 + 2];
            if (x < x0 || x > x1 || z < z0 || z > z1) continue;
            predicted.add(key(x, column.cells[c * 3 + 1], z));
          }
        }
      }
    }
    return {
      kind: kind.key,
      extra: [...predicted].filter((k) => !actual.has(k)),
      missing: [...actual].filter((k) => !predicted.has(k)),
      compared: actual.size,
    };
  });
}
