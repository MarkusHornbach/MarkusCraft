// The goal bot finishes the book on seed 1337, balanced terrain, few trees (Phase 8 AC6.2).
import { describe, expect, it } from 'vitest';
import { TASKS } from '../progress/tables';
import { runBot } from './Bot';

describe('goal bot (Phase 8 AC6.2)', () => {
  it('finishes the book on seed 1337 balanced/few with valid actions only', () => {
    const run = runBot(1337, { version: 2, options: { terrain: 'balanced', trees: 'few' } });
    expect(run.error).toBeNull();
    expect(run.completed).toBe(true);
    expect(run.tasks.map((t) => t.id).sort((a, b) => a - b)).toEqual(TASKS.map((t) => t.id));
    expect(run.allUnlocked).toBe(true);
    expect(run.levelUps.map((l) => l.level)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(run.lightErrors).toBe(0);
    expect(run.actions).toBeGreaterThan(100);
  });
});
