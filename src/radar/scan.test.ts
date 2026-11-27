// The radar scan: world correction, selection, hints, beyond range (Phase 8B1 AC1.2–AC1.4).
import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, RADAR_FAR_RADIUS, RADAR_RADIUS } from '../game/config';
import { Block } from '../world/blocks';
import { World } from '../world/World';
import { ORE_RADAR_KINDS, RADAR_KINDS, radarKindByKey } from './kinds';
import { hintLabel, hintOf, scanRadar, worldProbe, type BlockProbe, type ScanInput } from './scan';
import { VEIN_INDEX_COLUMNS, VeinIndex } from './veins';

const GEN = { version: 2, options: { terrain: 'balanced', trees: 'few' } } as const;
const COAL = RADAR_KINDS[0];
const IRON = RADAR_KINDS[1];
const NO_WORLD: BlockProbe = () => null;

function input(
  index: VeinIndex,
  at: [number, number, number],
  probe: BlockProbe,
  perKind = 4,
): ScanInput {
  return {
    index,
    x: at[0],
    y: at[1],
    z: at[2],
    probe,
    kinds: RADAR_KINDS,
    perKind,
    radius: RADAR_RADIUS,
    farRadius: RADAR_FAR_RADIUS,
  };
}

/** Every counting cell of the vein whose nearest cell is (dx, dy, dz) from `at`. */
function veinOf(
  index: VeinIndex,
  at: [number, number, number],
  d: { dx: number; dy: number; dz: number },
): number[][] {
  const x = at[0] + d.dx;
  const y = at[1] + d.dy;
  const z = at[2] + d.dz;
  for (let cz = VeinIndex.cellOf(z - 2); cz <= VeinIndex.cellOf(z + 2); cz++) {
    for (let cx = VeinIndex.cellOf(x - 2); cx <= VeinIndex.cellOf(x + 2); cx++) {
      const column = index.column(cx, cz);
      for (let v = 0; v < column.count; v++) {
        const cells: number[][] = [];
        for (let c = column.starts[v]; c < column.starts[v + 1]; c++) {
          cells.push([column.cells[c * 3], column.cells[c * 3 + 1], column.cells[c * 3 + 2]]);
        }
        if (cells.some(([a, b, e]) => a === x && b === y && e === z)) return cells;
      }
    }
  }
  throw new Error('vein not found');
}

function loadAround(world: World, x: number, z: number, r: number): void {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cz = Math.floor(z / CHUNK_SIZE);
  for (let dz = -r; dz <= r; dz++)
    for (let dx = -r; dx <= r; dx++) world.generate(cx + dx, cz + dz);
}

describe('scanRadar', () => {
  const at: [number, number, number] = [8, 40, 8];

  it('Phase 8B1 AC1.3 returns the nearest N per kind in range, in a deterministic order', () => {
    const index = new VeinIndex(1337, GEN);
    const scan = scanRadar(input(index, at, NO_WORLD, 4));
    const many = scanRadar(input(index, at, NO_WORLD, 50));
    for (const kind of ORE_RADAR_KINDS) {
      const few = scan.entries.filter((e) => e.kind === kind.key);
      const all = many.entries.filter((e) => e.kind === kind.key);
      expect(few.length).toBe(4);
      expect(all.length).toBeGreaterThan(4);
      expect(few).toEqual(all.slice(0, 4));
      for (let i = 1; i < all.length; i++) {
        const a = all[i - 1];
        const b = all[i];
        expect(a.dist < b.dist || (a.dist === b.dist && a.dy <= b.dy)).toBe(true);
      }
      for (const e of all) {
        expect(e.dx * e.dx + e.dz * e.dz).toBeLessThanOrEqual(RADAR_RADIUS * RADAR_RADIUS);
        expect(e.dist).toBeCloseTo(Math.hypot(e.dx, e.dy, e.dz), 9);
        expect(e.hint).toEqual(hintOf(e.dist, e.dy));
      }
    }
    // Kinds come in the order given; a smaller list of kinds gives only those.
    expect(scan.entries.map((e) => e.kind)).toEqual([
      ...Array(4).fill('coal'),
      ...Array(4).fill('iron'),
    ]);
    const ironOnly = scanRadar({ ...input(index, at, NO_WORLD), kinds: [IRON] });
    expect(ironOnly.entries).toEqual(scan.entries.filter((e) => e.kind === 'iron'));
    // The same input gives the same result, from a cold and a warm index.
    expect(scanRadar(input(new VeinIndex(1337, GEN), at, NO_WORLD))).toEqual(scan);
  });

  it('Phase 8B1 AC1.3 hints follow the table at the borders', () => {
    expect(hintOf(24.01, -5)).toBe('none');
    expect(hintOf(24, -5)).toEqual({ coarse: 'down' });
    expect(hintOf(24, 5)).toEqual({ coarse: 'up' });
    expect(hintOf(12.01, 3)).toEqual({ coarse: 'level' });
    expect(hintOf(12.01, -3)).toEqual({ coarse: 'level' });
    expect(hintOf(12.01, -4)).toEqual({ coarse: 'down' });
    expect(hintOf(12, 4)).toEqual({ exact: 4 });
    expect(hintOf(3, 0)).toEqual({ exact: 0 });
    expect(hintLabel('none')).toBe('');
    expect(hintLabel({ coarse: 'up' })).toBe('↑');
    expect(hintLabel({ coarse: 'level' })).toBe('=');
    expect(hintLabel({ coarse: 'down' })).toBe('↓');
    expect(hintLabel({ exact: -5 })).toBe('5↓');
    expect(hintLabel({ exact: 2 })).toBe('2↑');
    expect(hintLabel({ exact: 0 })).toBe('=');
  });

  it('Phase 8B1 AC1.2 corrects the prediction by the loaded blocks', () => {
    const world = new World(1337, GEN);
    loadAround(world, at[0], at[2], 4);
    const index = new VeinIndex(1337, GEN);
    const probe = worldProbe(world);
    // Loaded and untouched: the same as the seed alone.
    const before = scanRadar(input(index, at, probe));
    expect(before).toEqual(scanRadar(input(index, at, NO_WORLD)));
    const nearest = before.entries[0];
    const cells = veinOf(index, at, nearest);
    for (const [x, y, z] of cells) expect(world.getBlock(x, y, z)).toBe(COAL.block);

    // Breaking the nearest cell leaves the vein's other cells counting.
    if (cells.length > 1) {
      const [x, y, z] =
        cells.find(
          ([a, b, c]) =>
            a === at[0] + nearest.dx && b === at[1] + nearest.dy && c === at[2] + nearest.dz,
        ) ?? cells[0];
      world.setBlock(x, y, z, Block.AIR);
      const after = scanRadar(input(index, at, probe));
      const rest = cells.filter(([a, b, c]) => a !== x || b !== y || c !== z);
      const best = Math.min(
        ...rest.map(([a, b, c]) => Math.hypot(a - at[0], b - at[1], c - at[2])),
      );
      const same = after.entries.find((e) => e.kind === 'coal' && Math.abs(e.dist - best) < 1e-9);
      expect(same).toBeDefined();
      expect(
        after.entries.some(
          (e) =>
            e.kind === 'coal' && e.dx === nearest.dx && e.dy === nearest.dy && e.dz === nearest.dz,
        ),
      ).toBe(false);
    }
    // Breaking all of it removes the vein; the next nearest moves up.
    for (const [x, y, z] of cells) world.setBlock(x, y, z, Block.AIR);
    const mined = scanRadar(input(index, at, probe));
    const coalBefore = before.entries.filter((e) => e.kind === 'coal');
    const coalAfter = mined.entries.filter((e) => e.kind === 'coal');
    expect(coalAfter[0]).toEqual(coalBefore[1]);
    expect(coalAfter.length).toBe(4);

    // An ore block placed where no vein lies is never shown.
    const fake: [number, number, number] = [at[0] + 1, at[1] - 1, at[2]];
    world.setBlock(fake[0], fake[1], fake[2], Block.COAL_ORE);
    const withFake = scanRadar(input(index, at, probe));
    expect(withFake.entries.some((e) => e.dx === 1 && e.dy === -1 && e.dz === 0)).toBe(false);

    // With the chunk unloaded its cells fall back to the prediction.
    const [x, , z] = cells[0];
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const fromSeed = cells.every(
      ([a, , c]) => Math.floor(a / CHUNK_SIZE) === cx && Math.floor(c / CHUNK_SIZE) === cz,
    );
    world.removeChunk(cx, cz);
    if (fromSeed) expect(scanRadar(input(index, at, probe)).entries[0]).toEqual(nearest);
    expect(world.verifyLight()).toBe(0);
  });

  it('Phase 8B1 AC1.4 points beyond range, or nowhere within the far radius', () => {
    const index = new VeinIndex(1337, GEN);
    // Coal everywhere is replaced by air: no coal within the radius, but some further out.
    const near: BlockProbe = (x, _y, z) => {
      const h = Math.hypot(x - at[0], z - at[2]);
      return h <= RADAR_RADIUS + 4 ? Block.AIR : null;
    };
    const scan = scanRadar(input(index, at, near));
    expect(scan.entries).toEqual([]);
    expect(scan.beyond.map((b) => b.kind)).toEqual(['coal', 'iron']);
    for (const b of scan.beyond) {
      expect(Math.hypot(b.dx, b.dz)).toBeGreaterThan(RADAR_RADIUS);
      expect(b.dist).toBeLessThanOrEqual(RADAR_FAR_RADIUS);
    }
    // Nothing counts anywhere: null.
    const none = scanRadar(input(index, at, () => Block.AIR));
    expect(none).toEqual({ entries: [], beyond: [] });
    // A kind with veins in range has no beyond entry.
    expect(scanRadar(input(index, at, NO_WORLD)).beyond).toEqual([]);
  });

  it('keeps the index bounded and reuses columns', () => {
    const index = new VeinIndex(42, GEN);
    scanRadar(input(index, at, NO_WORLD));
    const built = index.built;
    scanRadar(input(index, at, NO_WORLD));
    expect(index.built).toBe(built);
    for (let i = 0; i < 60; i++) index.column(i * 50, 0);
    for (let x = 0; x < 50; x++) for (let z = 0; z < 50; z++) index.column(x, z);
    expect(index.cachedColumns).toBeLessThanOrEqual(VEIN_INDEX_COLUMNS);
    expect(radarKindByKey('iron')).toBe(IRON);
    expect(radarKindByKey('gold')).toBeUndefined();
  });
});
