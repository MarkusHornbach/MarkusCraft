// Places in the radar scan (Phase 8B2b AC5.2): nearest per place kind, far radius, the focus
// rule, and generators 1 and 2 without places.
import { describe, expect, it } from 'vitest';
import {
  RADAR_CIRCLE_PLACES,
  RADAR_FAR_RADIUS,
  RADAR_MAP_PER_KIND,
  RADAR_MAP_PLACES,
  RADAR_PLACE_FAR_RADIUS,
  RADAR_RADIUS,
} from '../game/config';
import { getTerrain, type Place } from '../world/generation/terrain';
import type { TerrainV3 } from '../world/generation/terrainV3';
import type { WorldGen } from '../world/generation/worldOptions';
import { circleKinds, circleScan, mapKinds } from './focus';
import { ORE_RADAR_KINDS, PLACE_RADAR_KINDS, RADAR_KINDS, radarKindByKey } from './kinds';
import { PlaceIndex } from './places';
import { scanRadar, type BlockProbe, type RadarScan, type ScanInput } from './scan';
import { VeinIndex } from './veins';

const GEN3: WorldGen = { version: 3, options: { terrain: 'balanced', trees: 'few' } };
const NO_WORLD: BlockProbe = () => null;

function input(
  seed: number,
  gen: WorldGen,
  at: [number, number, number],
  places: PlaceIndex | null,
): ScanInput {
  return {
    index: new VeinIndex(seed, gen),
    x: at[0],
    y: at[1],
    z: at[2],
    probe: NO_WORLD,
    kinds: RADAR_KINDS,
    perKind: RADAR_MAP_PER_KIND,
    radius: RADAR_RADIUS,
    farRadius: RADAR_FAR_RADIUS,
    places,
    placesPerKind: RADAR_MAP_PLACES,
    placeFarRadius: RADAR_PLACE_FAR_RADIUS,
  };
}

/** A stand-in index holding the given places. */
function fakeIndex(places: Place[]): PlaceIndex {
  return {
    hasPlaces: true,
    near: (_x: number, _z: number, _r: number, visit: (p: Place) => void) => places.forEach(visit),
  } as unknown as PlaceIndex;
}

/** Brute force: the places of a kind around `at`, sorted like the scan (d², dy, dx, dz). */
function bruteForce(terrain: TerrainV3, at: [number, number, number], kind: string) {
  const r = RADAR_PLACE_FAR_RADIUS;
  const all: Place[] = [];
  terrain.placesIn(at[0] - r, at[2] - r, at[0] + r, at[2] + r, all);
  return all
    .filter((p) => p.kind === kind)
    .map((p) => {
      const dx = p.x - at[0];
      const dy = p.y - at[1];
      const dz = p.z - at[2];
      return { dx, dy, dz, d2: dx * dx + dy * dy + dz * dz };
    })
    .sort((a, b) => a.d2 - b.d2 || a.dy - b.dy || a.dx - b.dx || a.dz - b.dz);
}

describe('places in the scan', () => {
  it('Phase 8B2b AC5.2 gives the nearest 4 per place kind in range, or beyond up to 192, like brute force', () => {
    let entries = 0;
    let beyonds = 0;
    for (const seed of [1, 42, 1337, 2024]) {
      const terrain = getTerrain(seed, GEN3) as TerrainV3;
      const spawn = terrain.spawnPoint();
      const index = new PlaceIndex(seed, GEN3);
      for (const [ox, oz] of [
        [0, 0],
        [70, -40],
        [-150, 90],
      ]) {
        const at: [number, number, number] = [spawn.x + ox, spawn.y, spawn.z + oz];
        const scan = scanRadar(input(seed, GEN3, at, index));
        for (const kind of PLACE_RADAR_KINDS) {
          const expected = bruteForce(terrain, at, kind.key);
          const inRange = expected.filter((p) => p.dx * p.dx + p.dz * p.dz <= RADAR_RADIUS ** 2);
          const got = scan.entries.filter((e) => e.kind === kind.key);
          expect(got.map((e) => [e.dx, e.dy, e.dz])).toEqual(
            inRange.slice(0, RADAR_MAP_PLACES).map((p) => [p.dx, p.dy, p.dz]),
          );
          entries += got.length;
          const beyond = scan.beyond.find((b) => b.kind === kind.key);
          const far = expected.filter((p) => p.d2 <= RADAR_PLACE_FAR_RADIUS ** 2);
          if (inRange.length > 0 || far.length === 0) {
            expect(beyond).toBeUndefined();
          } else {
            beyonds++;
            expect(beyond).toEqual({
              kind: kind.key,
              dx: far[0].dx,
              dz: far[0].dz,
              dist: Math.sqrt(far[0].d2),
            });
          }
        }
      }
    }
    expect(entries).toBeGreaterThan(5);
    expect(beyonds).toBeGreaterThan(0);
  });

  it('Phase 8B2b AC5.2 points beyond only up to 192 and orders ties deterministically', () => {
    const shaft = radarKindByKey('shaft');
    if (!shaft) throw new Error('no shaft kind');
    const base = { ...input(1337, GEN3, [0, 60, 0], null), kinds: [shaft] };
    const scanWith = (places: Place[]): RadarScan =>
      scanRadar({ ...base, places: fakeIndex(places) });
    // 150 horizontal, 3D 150.1: beyond.
    expect(scanWith([{ kind: 'shaft', x: 150, y: 64, z: 0 }]).beyond).toHaveLength(1);
    // 3D over 192: nothing at all.
    const none = scanWith([{ kind: 'shaft', x: 190, y: 100, z: 0 }]);
    expect(none).toEqual({ entries: [], beyond: [] });
    // Equal distance: lower dy first, then dx, then dz.
    const tie = scanWith([
      { kind: 'shaft', x: 0, y: 70, z: 0 },
      { kind: 'shaft', x: 10, y: 60, z: 0 },
      { kind: 'shaft', x: -10, y: 60, z: 0 },
      { kind: 'shaft', x: 0, y: 60, z: -10 },
      { kind: 'shaft', x: 0, y: 50, z: 0 },
    ]);
    expect(tie.entries.map((e) => [e.dx, e.dy, e.dz])).toEqual([
      [0, -10, 0],
      [-10, 0, 0],
      [0, 0, -10],
      [10, 0, 0],
    ]);
    // A place of another kind is not this kind's.
    expect(scanWith([{ kind: 'cave', x: 3, y: 60, z: 0 }])).toEqual({ entries: [], beyond: [] });
  });

  it('Phase 8B2b AC5.2 generators 1 and 2 give no place entries and the B1 result unchanged', () => {
    for (const gen of [
      { version: 1 },
      { version: 2, options: { terrain: 'balanced', trees: 'few' } },
    ] as WorldGen[]) {
      const at: [number, number, number] = [5, 60, -7];
      const withPlaces = scanRadar(input(1337, gen, at, new PlaceIndex(1337, gen)));
      const b1 = scanRadar({ ...input(1337, gen, at, null), kinds: ORE_RADAR_KINDS });
      expect(withPlaces).toEqual(b1);
      expect(withPlaces.entries.some((e) => e.kind === 'shaft' || e.kind === 'cave')).toBe(false);
    }
  });

  it('Phase 8B2b AC5.2 a focus narrows the ore kinds only; the circle keeps 2 places per kind', () => {
    const iron = radarKindByKey('iron');
    if (!iron) throw new Error('no iron kind');
    expect(circleKinds(iron, true).map((k) => k.key)).toEqual(['iron', 'shaft', 'cave']);
    expect(circleKinds(null, true).map((k) => k.key)).toEqual(['coal', 'iron', 'shaft', 'cave']);
    expect(circleKinds(iron, false).map((k) => k.key)).toEqual(['iron']);
    expect(circleKinds(null, false).map((k) => k.key)).toEqual(['coal', 'iron']);
    expect(mapKinds(false)).toEqual(ORE_RADAR_KINDS);
    expect(mapKinds(true)).toEqual(RADAR_KINDS);
    const entry = (kind: string, dist: number) => ({
      kind,
      dx: dist,
      dy: 0,
      dz: 0,
      dist,
      hint: 'none' as const,
    });
    const scan: RadarScan = {
      entries: [
        ...[1, 2, 3, 4, 5].map((d) => entry('coal', d)),
        ...[1, 2, 3, 4].map((d) => entry('iron', d)),
        ...[6, 7, 8, 9].map((d) => entry('cave', d)),
      ],
      beyond: [{ kind: 'shaft', dx: 100, dz: 0, dist: 100 }],
    };
    const shown = circleScan(scan, circleKinds(iron, true));
    expect(shown.entries.filter((e) => e.kind === 'coal')).toHaveLength(0);
    expect(shown.entries.filter((e) => e.kind === 'iron')).toHaveLength(4);
    expect(shown.entries.filter((e) => e.kind === 'cave').map((e) => e.dist)).toEqual([6, 7]);
    expect(RADAR_CIRCLE_PLACES).toBe(2);
    expect(shown.beyond).toEqual(scan.beyond);
    expect(circleScan(scan, circleKinds(null, false)).beyond).toEqual([]);
  });
});
