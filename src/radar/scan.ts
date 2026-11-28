// The radar scan: the nearest veins per ore kind around the feet, corrected by the loaded
// blocks, and the nearest places per place kind (Phase 8 part B2b).
import { CHUNK_SIZE, RADAR_COARSE_DIST, RADAR_EXACT_DIST, RADAR_LEVEL_DY } from '../game/config';
import { Block } from '../world/blocks';
import { isEmptyState } from '../world/blockState';
import { blockIndex, chunkKey } from '../world/chunk';
import type { World } from '../world/World';
import { ORE_CELL, VEIN_REACH } from '../world/generation/ores';
import type { RadarKind } from './kinds';
import type { PlaceIndex } from './places';
import { VeinIndex } from './veins';

/** The depth hint of a vein, relative to the player's feet (plan section 3). */
export type RadarHint = 'none' | { coarse: 'up' | 'level' | 'down' } | { exact: number };

export interface RadarEntry {
  /** The kind's key ("coal"). */
  kind: string;
  /** From the feet cell to the vein's nearest counting cell. */
  dx: number;
  dy: number;
  dz: number;
  /** 3D distance. */
  dist: number;
  hint: RadarHint;
}

/** Direction and distance to the nearest vein of a kind with none in range. */
export interface RadarBeyond {
  kind: string;
  dx: number;
  dz: number;
  dist: number;
}

export interface RadarScan {
  /** Per kind (in the order of `kinds`) the nearest veins in range, nearest first. */
  entries: RadarEntry[];
  /** For each kind with no vein in range: its nearest vein up to the far radius. */
  beyond: RadarBeyond[];
}

/** The block of a loaded chunk, or null where the chunk is not loaded (then the seed counts). */
export type BlockProbe = (x: number, y: number, z: number) => number | null;

/**
 * Whether a listed loot chest still counts (Phase 8 part B3b): its cell holds a chest and
 * the chest is not empty. Without a probe every listed chest counts.
 */
export type ChestProbe = (x: number, y: number, z: number) => boolean;

export interface ScanInput {
  index: VeinIndex;
  /** The feet cell (floored). */
  x: number;
  y: number;
  z: number;
  probe: BlockProbe;
  kinds: readonly RadarKind[];
  perKind: number;
  radius: number;
  farRadius: number;
  /**
   * The places of the world; place kinds in `kinds` give nothing without it, or where the
   * generator has none (versions 1 and 2).
   */
  places?: PlaceIndex | null;
  /** Places per place kind (default `perKind`) and their far radius (default `farRadius`). */
  placesPerKind?: number;
  placeFarRadius?: number;
  /** Hides emptied or broken loot chests (the Chest kind). */
  chests?: ChestProbe;
}

/** The hint of a vein at 3D distance `dist` and height difference `dy`. */
export function hintOf(dist: number, dy: number): RadarHint {
  if (dist > RADAR_COARSE_DIST) return 'none';
  if (dist > RADAR_EXACT_DIST) {
    if (dy > RADAR_LEVEL_DY) return { coarse: 'up' };
    if (dy < -RADAR_LEVEL_DY) return { coarse: 'down' };
    return { coarse: 'level' };
  }
  return { exact: dy };
}

/** The short label beside a symbol: "", "↑", "=", "↓", "5↓", "2↑", "=" (exact 0). */
export function hintLabel(hint: RadarHint): string {
  if (hint === 'none') return '';
  if ('coarse' in hint) return hint.coarse === 'up' ? '↑' : hint.coarse === 'down' ? '↓' : '=';
  if (hint.exact === 0) return '=';
  return `${Math.abs(hint.exact)}${hint.exact < 0 ? '↓' : '↑'}`;
}

// Scratch state of one scan: the best cell of the vein being looked at.
let bestD2 = 0;
let bestDx = 0;
let bestDy = 0;
let bestDz = 0;

/** Lexicographic order of (d², dy, dx, dz): the deterministic "nearer". */
function nearer(
  d2: number,
  dy: number,
  dx: number,
  dz: number,
  ed2: number,
  edy: number,
  edx: number,
  edz: number,
): boolean {
  if (d2 !== ed2) return d2 < ed2;
  if (dy !== edy) return dy < edy;
  if (dx !== edx) return dx < edx;
  return dz < edz;
}

/**
 * Finds the vein's nearest counting cell (into the `best…` scratch): a cell counts if the
 * probe shows the kind's block, or the probe knows nothing (null). False: none counts.
 */
function nearestCell(
  cells: Int32Array,
  from: number,
  to: number,
  block: number,
  input: ScanInput,
): boolean {
  let found = false;
  for (let c = from; c < to; c++) {
    const x = cells[c * 3];
    const y = cells[c * 3 + 1];
    const z = cells[c * 3 + 2];
    const seen = input.probe(x, y, z);
    if (seen !== null && seen !== block) continue;
    const dx = x - input.x;
    const dy = y - input.y;
    const dz = z - input.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (!found || nearer(d2, dy, dx, dz, bestD2, bestDy, bestDx, bestDz)) {
      found = true;
      bestD2 = d2;
      bestDx = dx;
      bestDy = dy;
      bestDz = dz;
    }
  }
  return found;
}

/** Up to `perKind` nearest of one kind, kept sorted in small typed arrays. */
class TopList {
  readonly d2: Float64Array;
  readonly dx: Int32Array;
  readonly dy: Int32Array;
  readonly dz: Int32Array;
  size = 0;

  constructor(readonly capacity: number) {
    this.d2 = new Float64Array(capacity);
    this.dx = new Int32Array(capacity);
    this.dy = new Int32Array(capacity);
    this.dz = new Int32Array(capacity);
  }

  offer(d2: number, dx: number, dy: number, dz: number): void {
    let i = this.size;
    if (i === this.capacity) {
      const last = i - 1;
      if (!nearer(d2, dy, dx, dz, this.d2[last], this.dy[last], this.dx[last], this.dz[last]))
        return;
      i = last;
    } else {
      this.size++;
    }
    while (
      i > 0 &&
      nearer(d2, dy, dx, dz, this.d2[i - 1], this.dy[i - 1], this.dx[i - 1], this.dz[i - 1])
    ) {
      this.d2[i] = this.d2[i - 1];
      this.dx[i] = this.dx[i - 1];
      this.dy[i] = this.dy[i - 1];
      this.dz[i] = this.dz[i - 1];
      i--;
    }
    this.d2[i] = d2;
    this.dx[i] = dx;
    this.dy[i] = dy;
    this.dz[i] = dz;
  }
}

/**
 * Walks the veins of `block` whose origin column lies within `reach` blocks (horizontally,
 * by columns) of the feet and offers each vein's nearest counting cell to `accept`.
 */
function eachVein(
  input: ScanInput,
  block: number,
  reach: number,
  accept: (horizontal2: number) => void,
): void {
  const { index } = input;
  const c0x = VeinIndex.cellOf(input.x - reach - VEIN_REACH);
  const c1x = VeinIndex.cellOf(input.x + reach + VEIN_REACH);
  const c0z = VeinIndex.cellOf(input.z - reach - VEIN_REACH);
  const c1z = VeinIndex.cellOf(input.z + reach + VEIN_REACH);
  for (let cz = c0z; cz <= c1z; cz++) {
    // Columns whose nearest point lies beyond the reach hold no vein that can count.
    const nz = Math.max(0, cz * ORE_CELL - input.z, input.z - (cz + 1) * ORE_CELL + 1);
    for (let cx = c0x; cx <= c1x; cx++) {
      const nx = Math.max(0, cx * ORE_CELL - input.x, input.x - (cx + 1) * ORE_CELL + 1);
      const gap = reach + VEIN_REACH;
      if (nx * nx + nz * nz > gap * gap) continue;
      const column = index.column(cx, cz);
      for (let v = 0; v < column.count; v++) {
        if (column.blocks[v] !== block) continue;
        if (!nearestCell(column.cells, column.starts[v], column.starts[v + 1], block, input))
          continue;
        accept(bestDx * bestDx + bestDz * bestDz);
      }
    }
  }
}

/** The radar's scan: per kind the `perKind` nearest veins in range, and `beyond` for the rest. */
export function scanRadar(input: ScanInput): RadarScan {
  const entries: RadarEntry[] = [];
  const beyond: RadarBeyond[] = [];
  const r2 = input.radius * input.radius;
  const far2 = input.farRadius * input.farRadius;
  for (const kind of input.kinds) {
    if (kind.category === 'place') {
      scanPlaces(input, kind, entries, beyond);
      continue;
    }
    const top = new TopList(input.perKind);
    eachVein(input, kind.block, input.radius, (h2) => {
      if (h2 <= r2) top.offer(bestD2, bestDx, bestDy, bestDz);
    });
    for (let i = 0; i < top.size; i++) {
      const dist = Math.sqrt(top.d2[i]);
      entries.push({
        kind: kind.key,
        dx: top.dx[i],
        dy: top.dy[i],
        dz: top.dz[i],
        dist,
        hint: hintOf(dist, top.dy[i]),
      });
    }
    if (top.size > 0) continue;
    const nearest = new TopList(1);
    eachVein(input, kind.block, input.farRadius, () => {
      if (bestD2 <= far2) nearest.offer(bestD2, bestDx, bestDy, bestDz);
    });
    if (nearest.size > 0) {
      beyond.push({
        kind: kind.key,
        dx: nearest.dx[0],
        dz: nearest.dz[0],
        dist: Math.sqrt(nearest.d2[0]),
      });
    }
  }
  return { entries, beyond };
}

/**
 * One place kind: the nearest places whose horizontal distance is at most the radius, by
 * 3D distance from the feet cell (the same order as veins); with none in range, `beyond`
 * for the nearest up to the place far radius. Places are permanent, except chests, which
 * count only while the chest probe says so.
 */
function scanPlaces(
  input: ScanInput,
  kind: RadarKind,
  entries: RadarEntry[],
  beyond: RadarBeyond[],
): void {
  const places = input.places;
  if (!places?.hasPlaces) return;
  const r2 = input.radius * input.radius;
  const farRadius = input.placeFarRadius ?? input.farRadius;
  const far2 = farRadius * farRadius;
  const top = new TopList(input.placesPerKind ?? input.perKind);
  const nearest = new TopList(1);
  places.near(input.x, input.z, farRadius, (place) => {
    if (place.kind !== kind.key) return;
    if (place.kind === 'chest' && input.chests && !input.chests(place.x, place.y, place.z)) {
      return;
    }
    const dx = place.x - input.x;
    const dy = place.y - input.y;
    const dz = place.z - input.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (dx * dx + dz * dz <= r2) top.offer(d2, dx, dy, dz);
    else if (d2 <= far2) nearest.offer(d2, dx, dy, dz);
  });
  for (let i = 0; i < top.size; i++) {
    const dist = Math.sqrt(top.d2[i]);
    entries.push({
      kind: kind.key,
      dx: top.dx[i],
      dy: top.dy[i],
      dz: top.dz[i],
      dist,
      hint: hintOf(dist, top.dy[i]),
    });
  }
  if (top.size === 0 && nearest.size > 0) {
    beyond.push({
      kind: kind.key,
      dx: nearest.dx[0],
      dz: nearest.dz[0],
      dist: Math.sqrt(nearest.d2[0]),
    });
  }
}

/**
 * The chest probe of a world: the cell's block (a loaded chunk's, else its edit; no edit
 * means the generated chest is there) is a chest, and its state (stored, else the derived
 * loot) holds an item. Guests hold the whole world's edits and states, so they agree.
 */
export function worldChestProbe(world: World): ChestProbe {
  return (x, y, z) => {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    let block: number = Block.CHEST;
    if (world.getChunk(cx, cz)) block = world.getBlock(x, y, z);
    else {
      const edit = world.edits
        .get(chunkKey(cx, cz))
        ?.get(blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE));
      if (edit !== undefined) block = edit;
    }
    if (block !== Block.CHEST) return false;
    const state = world.stateFor(Block.CHEST, x, y, z);
    return state !== null && !isEmptyState(state);
  };
}

/** The probe of a world: its block where the chunk is loaded, else null (the seed decides). */
export function worldProbe(world: World): BlockProbe {
  return (x, y, z) => {
    const chunk = world.getChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    return chunk ? world.getBlock(x, y, z) : null;
  };
}
