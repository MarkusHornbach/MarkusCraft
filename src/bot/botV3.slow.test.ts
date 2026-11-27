// The goal bot on generator 3 (Phase 8 part B2a AC3.5): a file of its own, so it runs beside
// the generator 2 run instead of after it.
import { describe, expect, it } from 'vitest';
import { TASKS } from '../progress/tables';
import { runBot } from './Bot';

describe('goal bot on generator 3', () => {
  it('Phase 8B2a AC3.5 finishes the book on generator 3 (seed 1337 balanced/few)', () => {
    const run = runBot(1337, { version: 3, options: { terrain: 'balanced', trees: 'few' } });
    expect(run.error).toBeNull();
    expect(run.completed).toBe(true);
    expect(run.tasks.map((t) => t.id).sort((a, b) => a - b)).toEqual(TASKS.map((t) => t.id));
    expect(run.allUnlocked).toBe(true);
    expect(run.lightErrors).toBe(0);
    expect(run.darkBreaks.filter((d) => d.task > 11)).toEqual([]);
    expect(run.radarUnlocked).toBe(true);
    for (const check of run.radar) expect(check.radar).toEqual(check.bruteForce);
  });
});
