// Phase 8B1 AC1.7: the cost of a radar scan in Node (warm and cold index, loaded world).
import { describe, it } from 'vitest';
import { CHUNK_SIZE, RADAR_CIRCLE_PER_KIND, RADAR_FAR_RADIUS, RADAR_RADIUS } from '../game/config';
import { findSpawn } from '../world/generation/spawn';
import { getTerrain } from '../world/generation/terrain';
import { World } from '../world/World';
import type { WorldGen } from '../world/generation/worldOptions';
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

/** Warm and cold best times of a scan around the spawn of a world of `gen`. */
function scanTimes(gen: WorldGen): { warm: number; cold: number } {
  const spawn = findSpawn(getTerrain(1337, gen));
  const world = new World(1337, gen);
  const r = Math.ceil(64 / CHUNK_SIZE);
  const scx = Math.floor(spawn.x / CHUNK_SIZE);
  const scz = Math.floor(spawn.z / CHUNK_SIZE);
  for (let dz = -r; dz <= r; dz++)
    for (let dx = -r; dx <= r; dx++) world.generate(scx + dx, scz + dz);
  const scan = (index: VeinIndex): number => {
    const start = performance.now();
    scanRadar({
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
    return performance.now() - start;
  };
  const warmIndex = new VeinIndex(1337, gen);
  let warm = Infinity;
  let cold = Infinity;
  for (let i = 0; i < 10; i++) {
    scan(warmIndex);
    scan(new VeinIndex(1337, gen));
  }
  for (let i = 0; i < 30; i++) {
    warm = Math.min(warm, scan(warmIndex));
    cold = Math.min(cold, scan(new VeinIndex(1337, gen)));
  }
  return { warm, cold };
}

describe('radar scan cost on generator 3', () => {
  it('Phase 8B2a AC2.4 a scan costs at most 1.5 × (cold) and 1.3 × (warm) generator 2', () => {
    const options = { terrain: 'balanced', trees: 'few' } as const;
    // Each side measured twice, in turn; the best of each counts.
    let two = { warm: Infinity, cold: Infinity };
    let three = { warm: Infinity, cold: Infinity };
    for (let round = 0; round < 2; round++) {
      const a = scanTimes({ version: 2, options });
      const b = scanTimes({ version: 3, options });
      two = { warm: Math.min(two.warm, a.warm), cold: Math.min(two.cold, a.cold) };
      three = { warm: Math.min(three.warm, b.warm), cold: Math.min(three.cold, b.cold) };
    }
    console.log(
      `radar scan generator 2 → 3: warm ${two.warm.toFixed(2)} → ${three.warm.toFixed(2)} ms, cold ${two.cold.toFixed(2)} → ${three.cold.toFixed(2)} ms`,
    );
    expectFasterThan(three.cold, two.cold * 1.5);
    expectFasterThan(three.warm, two.warm * 1.3);
  });
});

/** At least three times the measured median (numbers in docs/phase-8b1-report.md). */
const WARM_LIMIT_MS = 10;
const COLD_LIMIT_MS = 80;
