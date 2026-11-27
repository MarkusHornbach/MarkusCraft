// Phase 8B1 AC1.7: the cost of a radar scan in Node (warm and cold index, loaded world).
import { describe, it } from 'vitest';
import { CHUNK_SIZE, RADAR_CIRCLE_PER_KIND, RADAR_FAR_RADIUS, RADAR_RADIUS } from '../game/config';
import { findSpawn } from '../world/generation/spawn';
import { getTerrain } from '../world/generation/terrain';
import { World } from '../world/World';
import { expectFasterThan } from '../testing/timing';
import { RADAR_KINDS } from './kinds';
import { scanRadar, worldProbe, type ScanInput } from './scan';
import { VeinIndex } from './veins';

const GEN = { version: 2, options: { terrain: 'balanced', trees: 'few' } } as const;

describe('radar scan cost', () => {
  it('Phase 8B1 AC1.7 a scan around the spawn stays cheap', () => {
    const spawn = findSpawn(getTerrain(1337, GEN));
    const world = new World(1337, GEN);
    const r = Math.ceil(64 / CHUNK_SIZE);
    const scx = Math.floor(spawn.x / CHUNK_SIZE);
    const scz = Math.floor(spawn.z / CHUNK_SIZE);
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) world.generate(scx + dx, scz + dz);
    const make = (index: VeinIndex): ScanInput => ({
      index,
      x: Math.floor(spawn.x),
      y: Math.floor(spawn.y),
      z: Math.floor(spawn.z),
      probe: worldProbe(world),
      kinds: RADAR_KINDS,
      perKind: RADAR_CIRCLE_PER_KIND,
      radius: RADAR_RADIUS,
      farRadius: RADAR_FAR_RADIUS,
    });
    const warmIndex = new VeinIndex(1337, GEN);
    const time = (index: VeinIndex): number => {
      const start = performance.now();
      scanRadar(make(index));
      return performance.now() - start;
    };
    for (let i = 0; i < 20; i++) {
      time(warmIndex);
      time(new VeinIndex(1337, GEN));
    }
    const warm: number[] = [];
    const cold: number[] = [];
    for (let round = 0; round < 30; round++) {
      warm.push(time(warmIndex));
      cold.push(time(new VeinIndex(1337, GEN)));
    }
    const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[xs.length >> 1];
    console.log(
      `radar scan: warm best ${Math.min(...warm).toFixed(2)} ms, median ${median(warm).toFixed(2)} ms; cold best ${Math.min(...cold).toFixed(2)} ms, median ${median(cold).toFixed(2)} ms`,
    );
    expectFasterThan(Math.min(...warm), WARM_LIMIT_MS);
    expectFasterThan(Math.min(...cold), COLD_LIMIT_MS);
  });
});

/** At least three times the measured median (numbers in docs/phase-8b1-report.md). */
const WARM_LIMIT_MS = 10;
const COLD_LIMIT_MS = 80;
