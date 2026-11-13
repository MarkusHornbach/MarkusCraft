// Guards the single pipeline: blocks are only set by the action layer (plan 5.2).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Files that may call `setBlock`, with the number of calls each may contain.
 * - `src/actions/Session.ts`: the local session applies the result of `applyAction`.
 * - `src/game/Game.ts`: the test API's direct `setBlock` tool, nothing else.
 * The world loader needs no call: `World.loadEdits` writes its own edit log.
 * Do not extend this list for game or UI code; build an action and submit it instead.
 */
const ALLOWED: Record<string, number> = {
  'src/actions/Session.ts': 1,
  'src/game/Game.ts': 1,
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

describe('single pipeline (Phase 3 AC2.6)', () => {
  it('counts calls, not definitions', () => {
    expect(countSetBlockCalls('world.setBlock(1, 2, 3, 4);')).toBe(1);
    expect(countSetBlockCalls('this.host.world.setBlock (x, y, z, id)')).toBe(1);
    expect(countSetBlockCalls('  setBlock(x: number): boolean {')).toBe(0);
    expect(countSetBlockCalls('setBlock: (x, y, z, id) => this.testSetBlock(x, y, z, id),')).toBe(
      0,
    );
  });

  it('World.setBlock is called only by the session and the test API', () => {
    const found: Record<string, number> = {};
    for (const file of sourceFiles('src')) {
      const count = countSetBlockCalls(readFileSync(file, 'utf8'));
      if (count > 0) found[file.split('\\').join('/')] = count;
    }
    expect(found).toEqual(ALLOWED);
  });
});
