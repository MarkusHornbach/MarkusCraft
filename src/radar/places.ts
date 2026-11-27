// The places side of the radar (Phase 8 part B2b): mine shafts and cave entrances per region.
import { PLACE_INDEX_REGIONS, PLACE_REGION } from '../game/config';
import { getTerrain, type Place, type TerrainSource } from '../world/generation/terrain';
import type { WorldGen } from '../world/generation/worldOptions';

const NONE: readonly Place[] = [];

function regionKey(rx: number, rz: number): number {
  return (rx & 0xffff) * 0x10000 + (rz & 0xffff);
}

/**
 * The places of one seed and generator per `PLACE_REGION` square, from the generator's
 * `placesIn`. Places are permanent: a mined frame still marks its shaft, so the world never
 * corrects them. A bounded cache (oldest dropped); it never changes results.
 */
export class PlaceIndex {
  readonly seed: number;
  readonly gen: WorldGen;
  private readonly terrain: TerrainSource;
  private readonly regions = new Map<number, readonly Place[]>();
  /** Regions worked out since the index was made (tests: the cache works). */
  built = 0;

  constructor(seed: number, gen: WorldGen) {
    this.seed = seed >>> 0;
    this.gen = gen;
    this.terrain = getTerrain(seed, gen);
  }

  /** False for generators without places (1 and 2): the radar shows no place kind. */
  get hasPlaces(): boolean {
    return this.terrain.placesIn !== undefined;
  }

  /** The places whose cell lies in region (rx, rz). */
  region(rx: number, rz: number): readonly Place[] {
    const placesIn = this.terrain.placesIn;
    if (!placesIn) return NONE;
    const key = regionKey(rx, rz);
    let places = this.regions.get(key);
    if (places) return places;
    if (this.regions.size >= PLACE_INDEX_REGIONS) {
      for (const oldest of this.regions.keys()) {
        this.regions.delete(oldest);
        break;
      }
    }
    this.built++;
    const out: Place[] = [];
    const x0 = rx * PLACE_REGION;
    const z0 = rz * PLACE_REGION;
    placesIn.call(this.terrain, x0, z0, x0 + PLACE_REGION - 1, z0 + PLACE_REGION - 1, out);
    places = out.length > 0 ? out : NONE;
    this.regions.set(key, places);
    return places;
  }

  /** Calls `visit` for every place within `radius` columns (a square) of (x, z). */
  near(x: number, z: number, radius: number, visit: (place: Place) => void): void {
    if (!this.hasPlaces) return;
    const r0x = Math.floor((x - radius) / PLACE_REGION);
    const r1x = Math.floor((x + radius) / PLACE_REGION);
    const r0z = Math.floor((z - radius) / PLACE_REGION);
    const r1z = Math.floor((z + radius) / PLACE_REGION);
    for (let rz = r0z; rz <= r1z; rz++) {
      for (let rx = r0x; rx <= r1x; rx++) {
        for (const place of this.region(rx, rz)) visit(place);
      }
    }
  }
}
