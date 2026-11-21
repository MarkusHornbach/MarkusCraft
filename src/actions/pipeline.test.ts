// Guards the single pipeline: blocks are only set by the action layer (plan 5.2).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Files that may call `setBlock`, with the number of calls each may contain.
 * - `src/actions/Session.ts`: the local session applies the result of `applyAction`.
 * - `src/game/Game.ts`: the test API's direct `setBlock` tool, nothing else.
 * - `src/net/HostSession.ts`: the host applies the result of `applyAction` (Phase 6).
 * - `src/net/ClientSession.ts`: a guest applies the blocks the host reports.
 * The world loader needs no call: `World.loadEdits` writes its own edit log.
 * Do not extend this list for game or UI code; build an action and submit it instead.
 */
const ALLOWED: Record<string, number> = {
  'src/actions/Session.ts': 1,
  'src/game/Game.ts': 1,
  'src/net/HostSession.ts': 1,
  'src/net/ClientSession.ts': 1,
};

/** Calls of a method named `setBlock`; definitions (`setBlock(x: number, …`) do not count. */
export function countSetBlockCalls(source: string): number {
  const calls = source.match(/\.setBlock\s*\(/g) ?? [];
  return calls.length;
}

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) files.push(path);
  }
  return files;
}

/**
 * The player's items change the same way: only `applyAction` uses the functions that
 * build changed slots, and only the session stores a new record. The two exceptions are
 * the test API tools `give` and `clearInventory` in `Game.ts`.
 */
const INVENTORY_CALL =
  /\b(addItems|removeItems|takeItems|takeIngredients|moveStack|emptySlot|setSlot)\s*\(/g;
const INVENTORY_ALLOWED: Record<string, number> = {
  // `give` adds items for tests.
  'src/game/Game.ts': 1,
};
const REPLACE_RECORD_ALLOWED: Record<string, number> = {
  // `give` and `clearInventory`.
  'src/game/Game.ts': 2,
};

function countCalls(pattern: RegExp, skip: (file: string) => boolean): Record<string, number> {
  const found: Record<string, number> = {};
  for (const path of sourceFiles('src')) {
    const file = path.split('\\').join('/');
    if (skip(file)) continue;
    const count = (readFileSync(path, 'utf8').match(pattern) ?? []).length;
    if (count > 0) found[file] = count;
  }
  return found;
}

describe('single pipeline for items (Phase 3 plan 5.2)', () => {
  it('the inventory functions that change slots are called only by the action layer', () => {
    const found = countCalls(
      INVENTORY_CALL,
      (file) =>
        file.startsWith('src/actions/') ||
        file === 'src/items/inventory.ts' ||
        // The recipe table asks what would be left; it stores nothing.
        file === 'src/items/recipes.ts',
    );
    expect(found).toEqual(INVENTORY_ALLOWED);
  });

  it('a record is replaced past the session only by the test API', () => {
    const found = countCalls(/\.replaceRecord\s*\(/g, () => false);
    expect(found).toEqual(REPLACE_RECORD_ALLOWED);
  });

  it('the pattern finds calls and ignores definitions of other names', () => {
    expect('x = addItems(slots, 1, 2); moveStack (a, b, c)'.match(INVENTORY_CALL)?.length).toBe(2);
    expect('function countItems(slots) {} fits(slots, 1, 1)'.match(INVENTORY_CALL)).toBeNull();
  });
});

describe('single pipeline (Phase 3 AC2.6)', () => {
  it('counts calls, not definitions', () => {
    expect(countSetBlockCalls('world.setBlock(1, 2, 3, 4);')).toBe(1);
    expect(countSetBlockCalls('this.host.world.setBlock (x, y, z, id)')).toBe(1);
    expect(countSetBlockCalls('  setBlock(x: number): boolean {')).toBe(0);
    expect(countSetBlockCalls('setBlock: (x, y, z, id) => this.testSetBlock(x, y, z, id),')).toBe(
      0,
    );
  });

  it('World.setBlock is called only by the sessions and the test API', () => {
    const found: Record<string, number> = {};
    for (const path of sourceFiles('src')) {
      const file = path.split('\\').join('/');
      // Helpers of unit tests build their scenes directly, as the tests themselves do.
      if (file.startsWith('src/testing/')) continue;
      const count = countSetBlockCalls(readFileSync(path, 'utf8'));
      if (count > 0) found[file] = count;
    }
    expect(found).toEqual(ALLOWED);
  });

  it('Phase 4 AC2.9: stored light is written only by the world and its light functions', () => {
    // An assignment to a chunk's `light`, or a call of the functions that change it.
    const writes = /\.light\s*=[^=]|\b(updateLight|lightChunk)\s*\(/g;
    const found = countCalls(writes, (file) => file.startsWith('src/testing/'));
    expect(Object.keys(found).sort()).toEqual([
      'src/world/World.ts',
      'src/world/light/lightChunk.ts',
      'src/world/light/lightUpdate.ts',
    ]);
  });
});
