// Phase 8B1 AC1.7: the cost of a radar scan in Node (warm and cold index, loaded world).
import { describe, it } from 'vitest';
import {
  CHUNK_SIZE,
  RADAR_CIRCLE_PER_KIND,
  RADAR_FAR_RADIUS,
  RADAR_MAP_PLACES,
  RADAR_PLACE_FAR_RADIUS,
  RADAR_RADIUS,
} from '../game/config';
import { findSpawn } from '../world/generation/spawn';
import { getTerrain } from '../world/generation/terrain';
import { World } from '../world/World';
import type { WorldGen } from '../world/generation/worldOptions';
import { TIMING_ENFORCED, expectFasterThan } from '../testing/timing';
import { ORE_RADAR_KINDS, RADAR_KINDS } from './kinds';
import { PlaceIndex } from './places';
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
      kinds: ORE_RADAR_KINDS,
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

/**
 * Warm and cold best times of a scan around the spawn of a world of `gen`; with `places`
 * the place kinds too (cold: a new place index as well).
 */
function scanTimes(gen: WorldGen, places = false): { warm: number; cold: number } {
  const spawn = findSpawn(getTerrain(1337, gen));
  const world = new World(1337, gen);
  const r = Math.ceil(64 / CHUNK_SIZE);
  const scx = Math.floor(spawn.x / CHUNK_SIZE);
  const scz = Math.floor(spawn.z / CHUNK_SIZE);
  for (let dz = -r; dz <= r; dz++)
    for (let dx = -r; dx <= r; dx++) world.generate(scx + dx, scz + dz);
  const scan = (index: VeinIndex, placeIndex: PlaceIndex | null): number => {
    const start = performance.now();
    scanRadar({
      index,
      x: Math.floor(spawn.x),
      y: Math.floor(spawn.y),
      z: Math.floor(spawn.z),
      probe: worldProbe(world),
      kinds: places ? RADAR_KINDS : ORE_RADAR_KINDS,
      perKind: RADAR_CIRCLE_PER_KIND,
      radius: RADAR_RADIUS,
      farRadius: RADAR_FAR_RADIUS,
      places: placeIndex,
      placesPerKind: RADAR_MAP_PLACES,
      placeFarRadius: RADAR_PLACE_FAR_RADIUS,
    });
    return performance.now() - start;
  };
  const fresh = (): PlaceIndex | null => (places ? new PlaceIndex(1337, gen) : null);
  const warmIndex = new VeinIndex(1337, gen);
  const warmPlaces = fresh();
  let warm = Infinity;
  let cold = Infinity;
  for (let i = 0; i < (TIMING_ENFORCED ? 10 : 0); i++) {
    scan(warmIndex, warmPlaces);
    scan(new VeinIndex(1337, gen), fresh());
  }
  for (let i = 0; i < (TIMING_ENFORCED ? 30 : 1); i++) {
    warm = Math.min(warm, scan(warmIndex, warmPlaces));
    cold = Math.min(cold, scan(new VeinIndex(1337, gen), fresh()));
  }
  return { warm, cold };
}

describe('radar scan cost on generator 3', () => {
  it('Phase 8B2a AC2.4 a scan costs at most 1.5 × (cold) and 1.3 × (warm) generator 2', () => {
    const options = { terrain: 'balanced', trees: 'few' } as const;
    // Each side measured twice, in turn; the best of each counts.
    let two = { warm: Infinity, cold: Infinity };
    let three = { warm: Infinity, cold: Infinity };
    for (let round = 0; round < (TIMING_ENFORCED ? 2 : 1); round++) {
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

describe('radar scan cost with places', () => {
  it('Phase 8B2b AC5.4 a scan with places costs at most 1.2 × the generator 3 scan of B2a (cold and warm)', () => {
    const gen: WorldGen = { version: 3, options: { terrain: 'balanced', trees: 'few' } };
    let ores = { warm: Infinity, cold: Infinity };
    let all = { warm: Infinity, cold: Infinity };
    for (let round = 0; round < (TIMING_ENFORCED ? 2 : 1); round++) {
      const a = scanTimes(gen, false);
      const b = scanTimes(gen, true);
      ores = { warm: Math.min(ores.warm, a.warm), cold: Math.min(ores.cold, a.cold) };
      all = { warm: Math.min(all.warm, b.warm), cold: Math.min(all.cold, b.cold) };
    }
    console.log(
      `radar scan generator 3, ores → with places: warm ${ores.warm.toFixed(2)} → ${all.warm.toFixed(2)} ms, cold ${ores.cold.toFixed(2)} → ${all.cold.toFixed(2)} ms`,
    );
    expectFasterThan(all.cold, ores.cold * 1.2);
    expectFasterThan(all.warm, ores.warm * 1.2);
  });
});

/** At least three times the measured median (numbers in docs/phase-8b1-report.md). */
const WARM_LIMIT_MS = 10;
const COLD_LIMIT_MS = 80;
