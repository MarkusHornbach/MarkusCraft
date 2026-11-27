// Tunnels, chambers and ravines of generator 3: the carve mask, a pure function of seed and heights.
//
// Space is divided into cave regions. A region's hash decides its tunnels, each a chain of
// capsules from a start point; a ravine region's hash decides a ravine. Every shape is
// rasterized once per region into column spans (x, z, y0, y1), checked against the rules
// (water, soil, ravines; decided from the noise heights only, so a tunnel is kept or
// dropped as a whole) and cached. A chunk's mask is the union of the spans of every region
// whose reach touches it, so both sides of a border agree and the order never matters.
import {
  BEDROCK_SAFE_Y,
  CAVE_ENTRANCE_MAX_Y,
  CAVE_ENTRANCE_SHARE,
  CAVE_RADIUS_MAX,
  CAVE_RADIUS_MIN,
  CAVE_REACH,
  CAVE_REGION,
  CAVE_TARGET_MAX_Y,
  CAVE_TARGET_MIN_Y,
  CAVE_TUNNELS_MAX,
  CHUNK_SIZE,
  RAVINE_CHANCE,
  RAVINE_REGION,
  SEA_LEVEL,
  WORLD_HEIGHT,
} from '../../game/config';
import { hash2, hash32, mulberry32, type Rng } from '../../util/rng';
import { ColumnCache } from './columnCache';
import { BEACH_ABOVE, DIRT_DEPTH, MIN_SURFACE } from './terrainRules';

/** The noise heights of a terrain (the uncarved ground), as the rules see them. */
export interface HeightSource {
  heightAt(x: number, z: number): number;
}

export type CaveKind = 'entrance' | 'deep' | 'ravine';

/** One carved shape: a tunnel with its chambers, or a ravine. */
export interface CaveShape {
  kind: CaveKind;
  /** Entrance: the mouth (the start column, one above its surface); else the start. */
  startX: number;
  startY: number;
  startZ: number;
  /** Centre of the end (the last chamber of a tunnel, the far end of a ravine). */
  endX: number;
  endY: number;
  endZ: number;
  /** Bounding box of the spans (columns). */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** (x, z, y0, y1) per span, `count` spans. */
  spans: Int32Array;
  count: number;
}

/** Horizontal length of one tunnel segment. */
const SEG = 3;
/** Most random turn of a tunnel per segment (radians). */
const TURN = 0.7;
/** Most a tunnel turns back towards its region per segment when it leaves the inner box. */
const STEER = 0.6;
/** Entrances descend this much per block along (at most 1, so they are walkable both ways). */
const SLOPE_MIN = 0.4;
const SLOPE_MAX = 0.55;
/** Deep tunnels wander between these heights. */
const DEEP_MIN_Y = 10;
const DEEP_MAX_Y = 36;
/** Flatter below the axis than above: the floor of a tunnel is wide. */
const FLOOR_FACTOR = 0.75;
/** No carved cell within this many columns (and up to this far below) of a water column. */
const WATER_CLEARANCE = 2;
const SALT_CAVE = 0xca7e;
const SALT_RAVINE = 0x5a71;
const REGION_CACHE = 96;
const MASK_CACHE = 512;
/** Ravines: path length, top width and floor height ranges. */
const RAVINE_MIN_LENGTH = 40;
const RAVINE_MAX_LENGTH = 80;
const RAVINE_MIN_WIDTH = 3;
const RAVINE_MAX_WIDTH = 7;
const RAVINE_MIN_FLOOR = 14;
const RAVINE_MAX_FLOOR = 24;
/** Ravine ends rise this much per block along (at most 1). */
const RAVINE_SLOPE = 0.7;
/** A ravine reaches at most this far from its start (half its length plus its width). */
const RAVINE_REACH = RAVINE_MAX_LENGTH;
/** Words per chunk mask: 16 × 16 columns of 128 bits. */
export const MASK_WORDS = (CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT) / 32;
const WORDS_PER_COLUMN = WORLD_HEIGHT / 32;

/** Grows a span list without allocating per span. */
class SpanBuilder {
  spans = new Int32Array(1024);
  count = 0;
  minX = Infinity;
  maxX = -Infinity;
  minZ = Infinity;
  maxZ = -Infinity;

  push(x: number, z: number, y0: number, y1: number): void {
    if (this.count * 4 + 4 > this.spans.length) {
      const next = new Int32Array(this.spans.length * 2);
      next.set(this.spans);
      this.spans = next;
    }
    const o = this.count * 4;
    this.spans[o] = x;
    this.spans[o + 1] = z;
    this.spans[o + 2] = y0;
    this.spans[o + 3] = y1;
    this.count++;
    if (x < this.minX) this.minX = x;
    if (x > this.maxX) this.maxX = x;
    if (z < this.minZ) this.minZ = z;
    if (z > this.maxZ) this.maxZ = z;
  }

  reset(): void {
    this.count = 0;
    this.minX = Infinity;
    this.maxX = -Infinity;
    this.minZ = Infinity;
    this.maxZ = -Infinity;
  }
}

/**
 * Adds the cells of a capsule from (ax, ay, az) to (bx, by, bz) as column spans: a cell is
 * inside when its centre lies within `r` of the segment, the vertical distance counted
 * against `rDown` below the axis and `rUp` above it. A chamber is a capsule of length 0.
 */
export function rasterCapsule(
  out: { push(x: number, z: number, y0: number, y1: number): void },
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  r: number,
  rDown: number,
  rUp: number,
): void {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len2 = dx * dx + dy * dy + dz * dz;
  const x0 = Math.floor(Math.min(ax, bx) - r);
  const x1 = Math.ceil(Math.max(ax, bx) + r);
  const z0 = Math.floor(Math.min(az, bz) - r);
  const z1 = Math.ceil(Math.max(az, bz) + r);
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - rDown));
  const y1 = Math.min(WORLD_HEIGHT - 1, Math.ceil(Math.max(ay, by) + rUp));
  const r2 = r * r;
  const down = r / rDown;
  const up = r / rUp;
  const hLen2 = dx * dx + dz * dz;
  for (let z = z0; z <= z1; z++) {
    const pz = z + 0.5;
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      // The horizontal distance to the segment bounds the 3D one: skip columns beyond it.
      let th = hLen2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / hLen2 : 0;
      th = th < 0 ? 0 : th > 1 ? 1 : th;
      const hx = px - (ax + dx * th);
      const hz = pz - (az + dz * th);
      if (hx * hx + hz * hz > r2) continue;
      let first = -1;
      let last = -1;
      for (let y = y0; y <= y1; y++) {
        const py = y + 0.5;
        let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - (ax + dx * t);
        let ey = py - (ay + dy * t);
        const ez = pz - (az + dz * t);
        ey *= ey < 0 ? down : up;
        if (ex * ex + ey * ey + ez * ez <= r2) {
          if (first < 0) first = y;
          last = y;
        } else if (first >= 0) break;
      }
      if (first >= 0) out.push(x, z, first, last);
    }
  }
}

function regionKey(rx: number, rz: number): number {
  return (rx + 0x8000) * 0x10000 + (rz + 0x8000);
}

function snapshot(
  builder: SpanBuilder,
  shape: Omit<CaveShape, 'spans' | 'count' | 'minX' | 'maxX' | 'minZ' | 'maxZ'>,
): CaveShape {
  return {
    ...shape,
    minX: builder.minX,
    maxX: builder.maxX,
    minZ: builder.minZ,
    maxZ: builder.maxZ,
    spans: builder.spans.slice(0, builder.count * 4),
    count: builder.count,
  };
}

/**
 * The caves of one seed over a height source: tunnels, chambers and ravines as shapes per
 * region, and the carve mask per chunk. Holds caches only; results never depend on them.
 */
export class CaveCarver {
  readonly seed: number;
  private readonly source: HeightSource;
  /** Heights of recently asked columns: the rules ask each one many times. */
  private readonly heightCache = new ColumnCache(16384);
  private readonly tunnelRegions = new Map<number, CaveShape[]>();
  private readonly ravineRegions = new Map<number, CaveShape | null>();
  private readonly masks = new Map<number, Uint32Array | null>();
  private readonly builder = new SpanBuilder();
  private readonly ravineBuilder = new SpanBuilder();
  /** Per column: the lowest cell a carve may not reach because of water nearby. */
  private readonly waterFloors = new ColumnCache(8192);
  private readonly rowFloors = new ColumnCache(8192);
  private lastKey = NaN;
  private lastMask: Uint32Array | null = null;

  constructor(seed: number, heights: HeightSource) {
    this.seed = seed >>> 0;
    this.source = heights;
  }

  private readonly computeHeight = (x: number, z: number): number => this.source.heightAt(x, z);

  /** The noise height of column (x, z), through the cache. */
  private readonly heights: HeightSource = {
    heightAt: (x, z) => this.heightCache.get(x, z, this.computeHeight),
  };

  /** True if cell (x, y, z) is carved by a tunnel, a chamber or a ravine. */
  carved(x: number, y: number, z: number): boolean {
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const mask = this.mask(cx, cz);
    if (!mask) return false;
    const column = x - cx * CHUNK_SIZE + (z - cz * CHUNK_SIZE) * CHUNK_SIZE;
    return ((mask[column * WORDS_PER_COLUMN + (y >> 5)] >>> (y & 31)) & 1) === 1;
  }

  /** True if any cell of column (x, z) from `y0` to `y1` is carved. */
  carvedBetween(x: number, z: number, y0: number, y1: number): boolean {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const mask = this.mask(cx, cz);
    if (!mask) return false;
    const column = x - cx * CHUNK_SIZE + (z - cz * CHUNK_SIZE) * CHUNK_SIZE;
    const from = Math.max(0, y0);
    const to = Math.min(WORLD_HEIGHT - 1, y1);
    for (let y = from; y <= to; y++) {
      if ((mask[column * WORDS_PER_COLUMN + (y >> 5)] >>> (y & 31)) & 1) return true;
    }
    return false;
  }

  /**
   * The carve mask of chunk (cx, cz): bit `y & 31` of word `column · 4 + (y >> 5)`,
   * column = lx + lz · 16. Null when nothing in the chunk is carved.
   */
  mask(cx: number, cz: number): Uint32Array | null {
    const key = regionKey(cx, cz);
    if (key === this.lastKey) return this.lastMask;
    let mask = this.masks.get(key);
    if (mask === undefined) {
      mask = this.computeMask(cx, cz);
      if (this.masks.size >= MASK_CACHE) {
        for (const oldest of this.masks.keys()) {
          this.masks.delete(oldest);
          break;
        }
      }
      this.masks.set(key, mask);
    }
    this.lastKey = key;
    this.lastMask = mask;
    return mask;
  }

  /** Every kept shape whose bounding box touches the area (inclusive), tunnels first. */
  shapesIn(minX: number, minZ: number, maxX: number, maxZ: number): CaveShape[] {
    const result: CaveShape[] = [];
    const visit = (shape: CaveShape): void => {
      if (shape.maxX < minX || shape.minX > maxX || shape.maxZ < minZ || shape.minZ > maxZ) return;
      result.push(shape);
    };
    const rx0 = Math.floor((minX - CAVE_REACH) / CAVE_REGION);
    const rx1 = Math.floor((maxX + CAVE_REACH) / CAVE_REGION);
    const rz0 = Math.floor((minZ - CAVE_REACH) / CAVE_REGION);
    const rz1 = Math.floor((maxZ + CAVE_REACH) / CAVE_REGION);
    for (let rz = rz0; rz <= rz1; rz++) {
      for (let rx = rx0; rx <= rx1; rx++) for (const t of this.tunnelsOf(rx, rz)) visit(t);
    }
    const qx0 = Math.floor((minX - RAVINE_REACH) / RAVINE_REGION);
    const qx1 = Math.floor((maxX + RAVINE_REACH) / RAVINE_REGION);
    const qz0 = Math.floor((minZ - RAVINE_REACH) / RAVINE_REGION);
    const qz1 = Math.floor((maxZ + RAVINE_REACH) / RAVINE_REGION);
    for (let qz = qz0; qz <= qz1; qz++) {
      for (let qx = qx0; qx <= qx1; qx++) {
        const ravine = this.ravineOf(qx, qz);
        if (ravine) visit(ravine);
      }
    }
    return result;
  }

  private computeMask(cx: number, cz: number): Uint32Array | null {
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const shapes = this.shapesIn(x0, z0, x0 + CHUNK_SIZE - 1, z0 + CHUNK_SIZE - 1);
    if (shapes.length === 0) return null;
    let mask: Uint32Array | null = null;
    for (const shape of shapes) {
      const spans = shape.spans;
      for (let s = 0; s < shape.count; s++) {
        const o = s * 4;
        const lx = spans[o] - x0;
        const lz = spans[o + 1] - z0;
        if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue;
        mask ??= new Uint32Array(MASK_WORDS);
        const base = (lx + lz * CHUNK_SIZE) * WORDS_PER_COLUMN;
        for (let y = spans[o + 2]; y <= spans[o + 3]; y++) {
          mask[base + (y >> 5)] |= 1 << (y & 31);
        }
      }
    }
    return mask;
  }

  /** The lowest cell of column (x, z) that water within the clearance forbids (or 255). */
  private waterFloor(x: number, z: number): number {
    return this.waterFloors.get(x, z, this.computeWaterFloor);
  }

  private readonly computeWaterFloor = (x: number, z: number): number => {
    let floor = 255;
    const c = WATER_CLEARANCE;
    for (let dz = -c; dz <= c; dz++) {
      const row = this.rowFloors.get(x, z + dz, this.computeRowFloor);
      if (row < floor) floor = row;
    }
    return floor;
  };

  /** `waterFloor` of one row: the water columns within the clearance along x only. */
  private readonly computeRowFloor = (x: number, z: number): number => {
    let floor = 255;
    const c = WATER_CLEARANCE;
    for (let dx = -c; dx <= c; dx++) {
      const h = this.heights.heightAt(x + dx, z);
      if (h <= SEA_LEVEL && h - c < floor) floor = h - c;
    }
    return floor;
  };

  /** Whether the spans in the builder keep the water rule (and, deep, stay in the stone). */
  private keepsRules(deep: boolean, from: number): boolean {
    const b = this.builder;
    const spans = b.spans;
    for (let s = from; s < b.count; s++) {
      const o = s * 4;
      const x = spans[o];
      const z = spans[o + 1];
      const y1 = spans[o + 3];
      // The lowest lake bed is MIN_SURFACE: nothing deeper can come near water.
      if (y1 >= MIN_SURFACE - WATER_CLEARANCE && y1 >= this.waterFloor(x, z)) return false;
      if (deep && y1 > this.heights.heightAt(x, z) - DIRT_DEPTH - 2) return false;
    }
    return true;
  }

  /** Whether any span in the builder lies in (or next to) a ravine's footprint. */
  private touchesRavine(): boolean {
    const b = this.builder;
    if (b.count === 0) return false;
    const ravines: CaveShape[] = [];
    const qx0 = Math.floor((b.minX - 1 - RAVINE_REACH) / RAVINE_REGION);
    const qx1 = Math.floor((b.maxX + 1 + RAVINE_REACH) / RAVINE_REGION);
    const qz0 = Math.floor((b.minZ - 1 - RAVINE_REACH) / RAVINE_REGION);
    const qz1 = Math.floor((b.maxZ + 1 + RAVINE_REACH) / RAVINE_REGION);
    for (let qz = qz0; qz <= qz1; qz++) {
      for (let qx = qx0; qx <= qx1; qx++) {
        const r = this.ravineOf(qx, qz);
        if (!r) continue;
        if (r.maxX < b.minX - 1 || r.minX > b.maxX + 1) continue;
        if (r.maxZ < b.minZ - 1 || r.minZ > b.maxZ + 1) continue;
        ravines.push(r);
      }
    }
    if (ravines.length === 0) return false;
    const spans = b.spans;
    const count = b.count;
    for (const r of ravines) {
      for (let s = 0; s < count; s++) {
        const x = spans[s * 4];
        const z = spans[s * 4 + 1];
        if (x < r.minX - 1 || x > r.maxX + 1 || z < r.minZ - 1 || z > r.maxZ + 1) continue;
        for (let t = 0; t < r.count; t++) {
          if (Math.abs(r.spans[t * 4] - x) <= 1 && Math.abs(r.spans[t * 4 + 1] - z) <= 1) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /** The kept tunnels of cave region (rx, rz), worked out once and cached. */
  tunnelsOf(rx: number, rz: number): CaveShape[] {
    const key = regionKey(rx, rz);
    let tunnels = this.tunnelRegions.get(key);
    if (!tunnels) {
      tunnels = this.computeTunnels(rx, rz);
      if (this.tunnelRegions.size >= REGION_CACHE) {
        for (const oldest of this.tunnelRegions.keys()) {
          this.tunnelRegions.delete(oldest);
          break;
        }
      }
      this.tunnelRegions.set(key, tunnels);
    }
    return tunnels;
  }

  private computeTunnels(rx: number, rz: number): CaveShape[] {
    const regionHash = hash2(this.seed ^ SALT_CAVE, rx, rz);
    const count = regionHash % (CAVE_TUNNELS_MAX + 1);
    const tunnels: CaveShape[] = [];
    for (let i = 0; i < count; i++) {
      const rng = mulberry32(hash32(regionHash + Math.imul(i + 1, 0x9e3779b9)));
      const tunnel = this.buildTunnel(rx, rz, rng);
      if (tunnel) tunnels.push(tunnel);
    }
    return tunnels;
  }

  /** One tunnel of region (rx, rz) from its random stream, or null if it is dropped. */
  private buildTunnel(rx: number, rz: number, rng: Rng): CaveShape | null {
    const entrance = rng() < CAVE_ENTRANCE_SHARE;
    const sx = rx * CAVE_REGION + Math.floor(rng() * CAVE_REGION);
    const sz = rz * CAVE_REGION + Math.floor(rng() * CAVE_REGION);
    const r = CAVE_RADIUS_MIN + rng() * (CAVE_RADIUS_MAX - CAVE_RADIUS_MIN);
    let yaw = rng() * Math.PI * 2;
    const slope = SLOPE_MIN + rng() * (SLOPE_MAX - SLOPE_MIN);
    const target =
      CAVE_TARGET_MIN_Y + Math.floor(rng() * (CAVE_TARGET_MAX_Y - CAVE_TARGET_MIN_Y + 1));
    const flatSteps = 3 + Math.floor(rng() * 6);
    const deepSteps = 10 + Math.floor(rng() * 16);
    const startY = DEEP_MIN_Y + 2 + rng() * (DEEP_MAX_Y - DEEP_MIN_Y - 4);
    const chamberRadius = 3 + rng() * 2;
    const chamberUp = 2.5 + rng();
    const jointSalt = Math.floor(rng() * 0x7fffffff);

    let y: number;
    let mouthY = Math.floor(startY);
    if (entrance) {
      const h = this.heights.heightAt(sx, sz);
      if (h <= SEA_LEVEL + BEACH_ABOVE || h > CAVE_ENTRANCE_MAX_Y) return null;
      y = h + 1;
      mouthY = y;
    } else {
      y = startY;
    }
    const startX = sx + 0.5;
    const startZ = sz + 0.5;
    const rDown = r * FLOOR_FACTOR;
    const b = this.builder;
    b.reset();
    // The inner box: beyond it the tunnel turns back towards its region.
    const inner = CAVE_REACH - 2 * SEG - Math.ceil(CAVE_RADIUS_MAX) - 6;
    const lo = rx * CAVE_REGION - inner;
    const hiX = (rx + 1) * CAVE_REGION + inner;
    const loZ = rz * CAVE_REGION - inner;
    const hiZ = (rz + 1) * CAVE_REGION + inner;
    const cxr = (rx + 0.5) * CAVE_REGION;
    const czr = (rz + 0.5) * CAVE_REGION;
    let x = startX;
    let z = startZ;
    let flat = 0;
    const maxSteps = entrance ? 80 : deepSteps;
    for (let step = 0; step < maxSteps; step++) {
      yaw += (rng() - 0.5) * TURN;
      if (x < lo || x > hiX || z < loZ || z > hiZ) {
        // Turn back gradually, so the tunnel never folds onto itself.
        const want = Math.atan2(czr - z, cxr - x);
        let diff = want - yaw;
        diff -= Math.round(diff / (Math.PI * 2)) * Math.PI * 2;
        yaw += Math.max(-STEER, Math.min(STEER, diff));
      }
      const nx = x + Math.cos(yaw) * SEG;
      const nz = z + Math.sin(yaw) * SEG;
      let ny: number;
      if (entrance) {
        if (y > target) ny = Math.max(target, y - SEG * slope);
        else {
          ny = y;
          flat++;
        }
      } else {
        ny = y + (rng() - 0.5) * SEG * 0.8;
        ny = Math.max(DEEP_MIN_Y, Math.min(DEEP_MAX_Y, ny));
      }
      const before = b.count;
      rasterCapsule(b, x, y, z, nx, ny, nz, r, rDown, r);
      // Chambers at some joints of the level part (the hash of the joint decides).
      if ((!entrance || y <= target) && (hash32(jointSalt + step) & 7) === 0) {
        this.chamber(nx, ny, nz, r, chamberRadius * 0.8, chamberUp * 0.85);
      }
      // A tunnel that breaks a rule is dropped as a whole: stop as soon as it does.
      if (!this.keepsRules(!entrance, before)) return null;
      x = nx;
      y = ny;
      z = nz;
      if (entrance && flat >= flatSteps) break;
    }
    if (entrance && y > target) return null;
    const before = b.count;
    this.chamber(x, y, z, r, chamberRadius, chamberUp);
    if (!this.keepsRules(!entrance, before)) return null;
    this.clampBedrock(b);
    const ex = Math.floor(x);
    const ey = Math.floor(y);
    const ez = Math.floor(z);
    if (this.touchesRavine()) return null;
    return snapshot(b, {
      kind: entrance ? 'entrance' : 'deep',
      startX: sx,
      startY: mouthY,
      startZ: sz,
      endX: ex,
      endY: ey,
      endZ: ez,
    });
  }

  /** A chamber whose floor lies at the floor of a tunnel of radius `r` at (x, y, z). */
  private chamber(x: number, y: number, z: number, r: number, radius: number, up: number): void {
    const down = 1.6;
    const floor = y - r * FLOOR_FACTOR;
    rasterCapsule(this.builder, x, floor + down, z, x, floor + down, z, radius, down, up);
  }

  /** Never carve the bedrock or the cell above it. */
  private clampBedrock(b: SpanBuilder): void {
    for (let s = 0; s < b.count; s++) {
      const o = s * 4;
      if (b.spans[o + 2] < BEDROCK_SAFE_Y) b.spans[o + 2] = BEDROCK_SAFE_Y;
      // A span wholly below is left empty (y0 > y1) and sets no bit.
    }
  }

  /** The ravine of ravine region (qx, qz), or null (none, or dropped by a rule). */
  ravineOf(qx: number, qz: number): CaveShape | null {
    const key = regionKey(qx, qz);
    let ravine = this.ravineRegions.get(key);
    if (ravine === undefined) {
      ravine = this.computeRavine(qx, qz);
      this.ravineRegions.set(key, ravine);
    }
    return ravine;
  }

  private computeRavine(qx: number, qz: number): CaveShape | null {
    const regionHash = hash2(this.seed ^ SALT_RAVINE, qx, qz);
    const rng = mulberry32(regionHash);
    if (rng() >= RAVINE_CHANCE) return null;
    const margin = RAVINE_MAX_LENGTH / 2 + RAVINE_MAX_WIDTH;
    const span = RAVINE_REGION - 2 * margin;
    const sx = qx * RAVINE_REGION + margin + Math.floor(rng() * span);
    const sz = qz * RAVINE_REGION + margin + Math.floor(rng() * span);
    const length =
      RAVINE_MIN_LENGTH + Math.floor(rng() * (RAVINE_MAX_LENGTH - RAVINE_MIN_LENGTH + 1));
    const width = RAVINE_MIN_WIDTH + rng() * (RAVINE_MAX_WIDTH - RAVINE_MIN_WIDTH);
    const floorY = RAVINE_MIN_FLOOR + Math.floor(rng() * (RAVINE_MAX_FLOOR - RAVINE_MIN_FLOOR + 1));
    let yaw = rng() * Math.PI * 2;
    const turn = (rng() - 0.5) * 0.03;
    const h0 = this.heights.heightAt(sx, sz);
    if (h0 <= SEA_LEVEL + BEACH_ABOVE) return null;

    // The centre line: points one block apart from one end to the other, through the start.
    const n = length + 1;
    const px = new Float64Array(n);
    const pz = new Float64Array(n);
    const half = Math.floor(length / 2);
    px[half] = sx + 0.5;
    pz[half] = sz + 0.5;
    let fy = yaw;
    for (let i = half + 1; i < n; i++) {
      fy += turn;
      px[i] = px[i - 1] + Math.cos(fy);
      pz[i] = pz[i - 1] + Math.sin(fy);
    }
    yaw += Math.PI;
    for (let i = half - 1; i >= 0; i--) {
      yaw -= turn;
      px[i] = px[i + 1] + Math.cos(yaw);
      pz[i] = pz[i + 1] + Math.sin(yaw);
    }
    // The ends rise to the highest ground along the line.
    let top = 0;
    for (let i = 0; i < n; i++) {
      top = Math.max(top, this.heights.heightAt(Math.floor(px[i]), Math.floor(pz[i])));
    }

    const b = this.ravineBuilder;
    b.reset();
    const w = width / 2;
    const x0 = Math.floor(Math.min(...px) - w - 1);
    const x1 = Math.ceil(Math.max(...px) + w + 1);
    const z0 = Math.floor(Math.min(...pz) - w - 1);
    const z1 = Math.ceil(Math.max(...pz) + w + 1);
    // The nearest point of the line per column, splatted from the points.
    const gw = x1 - x0 + 1;
    const gd = z1 - z0 + 1;
    const best = new Float64Array(gw * gd).fill(Infinity);
    const nearest = new Int32Array(gw * gd);
    const reach = Math.ceil(w) + 1;
    for (let i = 0; i < n; i++) {
      const ix = Math.floor(px[i]);
      const iz = Math.floor(pz[i]);
      for (let z = iz - reach; z <= iz + reach; z++) {
        for (let x = ix - reach; x <= ix + reach; x++) {
          const dx = x + 0.5 - px[i];
          const dz = z + 0.5 - pz[i];
          const d2 = dx * dx + dz * dz;
          const g = x - x0 + (z - z0) * gw;
          if (d2 < best[g]) {
            best[g] = d2;
            nearest[g] = i;
          }
        }
      }
    }
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const g = x - x0 + (z - z0) * gw;
        const d = Math.sqrt(best[g]);
        if (d > w) continue;
        const bi = nearest[g];
        const fromEnd = Math.min(bi, n - 1 - bi);
        // A V-shaped floor: the walls narrow towards the bottom.
        const centreFloor = Math.max(floorY, top - fromEnd * RAVINE_SLOPE);
        const floor = Math.floor(centreFloor + (d / w) * (d / w) * 6);
        const h = this.heights.heightAt(x, z);
        if (floor > h) continue;
        b.push(x, z, floor, Math.min(WORLD_HEIGHT - 1, h + 1));
      }
    }
    this.clampBedrock(b);
    if (b.count === 0) return null;
    // Water anywhere near the ravine drops it as a whole.
    for (let s = 0; s < b.count; s++) {
      if (this.waterFloor(b.spans[s * 4], b.spans[s * 4 + 1]) < 255) return null;
    }
    return snapshot(b, {
      kind: 'ravine',
      startX: Math.floor(px[0]),
      startY: this.heights.heightAt(Math.floor(px[0]), Math.floor(pz[0])) + 1,
      startZ: Math.floor(pz[0]),
      endX: Math.floor(px[half]),
      endY: floorY,
      endZ: Math.floor(pz[half]),
    });
  }
}
