// Guards the performance test's core: no browser, no clock, no randomness of its own.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('src/bench is pure (Phase 4P AC1.9)', () => {
  const files = readdirSync('src/bench').filter(
    (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
  );

  it('has the modules of the plan', () => {
    expect(files.sort()).toEqual([
      'BenchRunner.ts',
      'benchReport.ts',
      'benchStats.ts',
      'compare.ts',
      'sampleResult.ts',
      'scenarios.ts',
      'verdict.ts',
    ]);
  });

  it('imports neither three nor the shell, and uses no DOM, clock or random numbers', () => {
    const forbidden =
      /from '(three|[^']*\/(render|ui|input)\/[^']*)'|\b(window|document|navigator|localStorage|performance)\.[A-Za-z]|Math\.random|Date\.now|new Date\b/;
    for (const name of files) {
      const source = readFileSync(join('src/bench', name), 'utf8');
      expect(forbidden.exec(source)?.[0] ?? null, name).toBeNull();
      // Of `game/` only the constants.
      const game = [...source.matchAll(/from '\.\.\/game\/([^']+)'/g)].map((m) => m[1]);
      expect(game.filter((module) => module !== 'config')).toEqual([]);
    }
  });
});
