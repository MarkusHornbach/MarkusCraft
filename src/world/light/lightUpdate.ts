// Update of stored light after one block changed: remove what no longer holds, then let
// light flow in again. Works on the stored light of the 3 × 3 chunks around the edit.
import { CHUNK_SIZE, LIGHT_MAX, WORLD_HEIGHT } from '../../game/config';
import {
  BLOCK_LIGHT,
  type ChunkLookup,
  type LightTables,
  chunksSeeingCell,
  stepLight,
} from './lightRules';

// Cells are addressed as in `lightChunk`: X | Z << 6 | y << 12 with X, Z ∈ 0..47 and the
// edited chunk in the middle. A change reaches at most 14 cells, so it stays inside.
const WIDTH = CHUNK_SIZE * 3;
const Z_SHIFT = 6;
const Y_SHIFT = 12;
const CELL_MASK = (1 << 20) - 1;

const blocks: Uint8Array[] = [];
const lights: Uint8Array[] = [];
/** 1 for every cell whose light was written during the running update. */
const touched = new Uint8Array(WORLD_HEIGHT << Y_SHIFT);
const before = new Uint8Array(WORLD_HEIGHT << Y_SHIFT);
let touchedCells = new Int32Array(1 << 12);
let touchedCount = 0;
let removals = new Int32Array(1 << 12);
let removalCount = 0;
let adds = new Int32Array(1 << 12);
let addCount = 0;
let reseeds = new Int32Array(64);
let reseedCount = 0;

let shift = 0;
let sky = false;
let opacity: Uint8Array = BLOCK_LIGHT.opacity;
let emission: Uint8Array = BLOCK_LIGHT.emission;

function grown(list: Int32Array): Int32Array<ArrayBuffer> {
  const bigger = new Int32Array(list.length * 2);
  bigger.set(list);
  return bigger;
}

function chunkOf(X: number, Z: number): number {
  return (X >> 4) + (Z >> 4) * 3;
}

function indexOf(X: number, y: number, Z: number): number {
  return (X & 15) | ((Z & 15) << 4) | (y << 8);
}

function inside(X: number, y: number, Z: number): boolean {
  return X >= 0 && X < WIDTH && Z >= 0 && Z < WIDTH && y >= 0 && y < WORLD_HEIGHT;
}

function level(X: number, y: number, Z: number): number {
  return (lights[chunkOf(X, Z)][indexOf(X, y, Z)] >> shift) & 15;
}

function setLevel(X: number, y: number, Z: number, value: number): void {
  const light = lights[chunkOf(X, Z)];
  const index = indexOf(X, y, Z);
  const cell = X | (Z << Z_SHIFT) | (y << Y_SHIFT);
  if (touched[cell] === 0) {
    touched[cell] = 1;
    before[cell] = light[index];
    if (touchedCount === touchedCells.length) touchedCells = grown(touchedCells);
    touchedCells[touchedCount++] = cell;
  }
  light[index] = (light[index] & ~(15 << shift)) | (value << shift);
}

function queueAdd(X: number, y: number, Z: number): void {
  if (addCount === adds.length) adds = grown(adds);
  adds[addCount++] = X | (Z << Z_SHIFT) | (y << Y_SHIFT);
}

/**
 * A cell that lost its light looks at a neighbour: light that came from the cell goes
 * too; anything else is a source from which light may flow back.
 */
function removeFrom(X: number, y: number, Z: number, lost: number, down: boolean): void {
  if (!inside(X, y, Z)) return;
  const value = level(X, y, Z);
  if (value === 0) return;
  // Light that came from the lost cell is weaker than it was; only full sky light
  // straight below full sky light came from it without getting weaker.
  if (value < lost || (down && sky && lost === LIGHT_MAX)) {
    setLevel(X, y, Z, 0);
    if (removalCount === removals.length) removals = grown(removals);
    const cell = X | (Z << Z_SHIFT) | (y << Y_SHIFT);
    removals[removalCount++] = cell | (value << 20);
    if (!sky && emission[blocks[chunkOf(X, Z)][indexOf(X, y, Z)]] > 0) {
      if (reseedCount === reseeds.length) reseeds = grown(reseeds);
      reseeds[reseedCount++] = cell;
    }
  } else {
    queueAdd(X, y, Z);
  }
}

function addTo(X: number, y: number, Z: number, from: number, down: boolean): void {
  if (!inside(X, y, Z)) return;
  const arrives = stepLight(from, opacity[blocks[chunkOf(X, Z)][indexOf(X, y, Z)]], down && sky);
  if (arrives > level(X, y, Z)) {
    setLevel(X, y, Z, arrives);
    queueAdd(X, y, Z);
  }
}

/** Brings one channel up to date after the block of cell (X, y, Z) changed. */
function updateChannel(X: number, y: number, Z: number): void {
  removalCount = 0;
  addCount = 0;
  reseedCount = 0;
  const old = level(X, y, Z);
  if (old > 0) setLevel(X, y, Z, 0);
  removals[removalCount++] = X | (Z << Z_SHIFT) | (y << Y_SHIFT) | (old << 20);
  for (let head = 0; head < removalCount; head++) {
    const entry = removals[head];
    const cell = entry & CELL_MASK;
    const lost = entry >>> 20;
    const cx = cell & 63;
    const cz = (cell >> Z_SHIFT) & 63;
    const cy = cell >> Y_SHIFT;
    removeFrom(cx, cy - 1, cz, lost, true);
    removeFrom(cx, cy + 1, cz, lost, false);
    removeFrom(cx - 1, cy, cz, lost, false);
    removeFrom(cx + 1, cy, cz, lost, false);
    removeFrom(cx, cy, cz - 1, lost, false);
    removeFrom(cx, cy, cz + 1, lost, false);
  }

  // The sources that are no cells of the stored light: the sky above the world, and the
  // blocks that emit (the edited one, and emitters that were swept away above).
  const own = blocks[chunkOf(X, Z)][indexOf(X, y, Z)];
  if (sky) {
    if (y === WORLD_HEIGHT - 1) {
      const arrives = stepLight(LIGHT_MAX, opacity[own], true);
      if (arrives > 0) {
        setLevel(X, y, Z, arrives);
        queueAdd(X, y, Z);
      }
    }
  } else {
    if (emission[own] > 0) {
      setLevel(X, y, Z, emission[own]);
      queueAdd(X, y, Z);
    }
    for (let i = 0; i < reseedCount; i++) {
      const cell = reseeds[i];
      const cx = cell & 63;
      const cz = (cell >> Z_SHIFT) & 63;
      const cy = cell >> Y_SHIFT;
      setLevel(cx, cy, cz, emission[blocks[chunkOf(cx, cz)][indexOf(cx, cy, cz)]]);
      queueAdd(cx, cy, cz);
    }
  }

  for (let head = 0; head < addCount; head++) {
    const cell = adds[head];
    const cx = cell & 63;
    const cz = (cell >> Z_SHIFT) & 63;
    const cy = cell >> Y_SHIFT;
    const from = level(cx, cy, cz);
    if (from <= 1) continue;
    addTo(cx, cy - 1, cz, from, true);
    addTo(cx, cy + 1, cz, from, false);
    addTo(cx - 1, cy, cz, from, false);
    addTo(cx + 1, cy, cz, from, false);
    addTo(cx, cy, cz - 1, from, false);
    addTo(cx, cy, cz + 1, from, false);
  }
}

/** Whether replacing one block by another can change any light. */
export function changesLight(
  oldBlock: number,
  newBlock: number,
  tables: LightTables = BLOCK_LIGHT,
): boolean {
  return (
    tables.opacity[oldBlock] !== tables.opacity[newBlock] ||
    tables.emission[oldBlock] !== tables.emission[newBlock]
  );
}

/**
 * Corrects the stored light of nine lit chunks after the block of cell (lx, y, lz) of the
 * middle chunk was replaced. `blocksAt` already has the new block; `lightAt` gives the
 * light arrays, which are changed in place. All nine chunks must exist and be lit.
 *
 * Returns the chunks whose mesh is out of date, as bits `gx + 3 * gz` (gx, gz ∈ 0..2,
 * the middle chunk is 1, 1): those in which a light value changed, and their neighbours
 * where the changed cell lies on the border.
 */
export function updateLight(
  blocksAt: ChunkLookup,
  lightAt: ChunkLookup,
  lx: number,
  y: number,
  lz: number,
  oldBlock: number,
  tables: LightTables = BLOCK_LIGHT,
): number {
  for (let gz = 0; gz < 3; gz++) {
    for (let gx = 0; gx < 3; gx++) {
      const block = blocksAt(gx - 1, gz - 1);
      const light = lightAt(gx - 1, gz - 1);
      if (!block || !light) throw new Error('updateLight needs nine lit chunks');
      blocks[gx + gz * 3] = block;
      lights[gx + gz * 3] = light;
    }
  }
  const X = CHUNK_SIZE + lx;
  const Z = CHUNK_SIZE + lz;
  if (!changesLight(oldBlock, blocks[4][indexOf(X, y, Z)], tables)) return 0;
  opacity = tables.opacity;
  emission = tables.emission;
  touchedCount = 0;
  sky = true;
  shift = 4;
  updateChannel(X, y, Z);
  sky = false;
  shift = 0;
  updateChannel(X, y, Z);

  let mask = 0;
  for (let i = 0; i < touchedCount; i++) {
    const cell = touchedCells[i];
    touched[cell] = 0;
    const cx = cell & 63;
    const cz = (cell >> Z_SHIFT) & 63;
    if (lights[chunkOf(cx, cz)][indexOf(cx, cell >> Y_SHIFT, cz)] === before[cell]) continue;
    mask |= chunksSeeingCell(cx >> 4, cz >> 4, cx & 15, cz & 15);
  }
  return mask;
}

/**
 * The same answer as `updateLight` gives, for two versions of one chunk's light: which of
 * the 3 × 3 chunks around it (it is 1, 1) read a cell that differs. 0 if they are equal.
 */
export function lightDifference(a: Uint8Array, b: Uint8Array): number {
  let mask = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) mask |= chunksSeeingCell(1, 1, i & 15, (i >> 4) & 15);
  }
  return mask;
}
