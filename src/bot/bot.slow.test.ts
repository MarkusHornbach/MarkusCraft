// The goal bot finishes the book on seed 1337, balanced terrain, few trees (Phase 8 AC6.2).
import { describe, expect, it } from 'vitest';
import { TASKS } from '../progress/tables';
import { runBot } from './Bot';

describe('goal bot (Phase 8 AC6.2)', () => {
  it('finishes the book on seed 1337 balanced/few with valid actions only', () => {
    const run = runBot(1337, { version: 2, options: { terrain: 'balanced', trees: 'few' } });
    expect(run.error).toBeNull();
    expect(run.completed).toBe(true);
    expect(run.tasks.map((t) => t.id).sort((a, b) => a - b)).toEqual(
      TASKS.map((t) => t.id).sort((a, b) => a - b),
    );
    expect(run.allUnlocked).toBe(true);
    expect(run.levelUps.map((l) => l.level)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(run.lightErrors).toBe(0);
    expect(run.actions).toBeGreaterThan(100);
    // Fix Adventure 1 AC2.3: dark breaks are reported until the torch is unlocked (task 11),
    // never after it. How many there are before it is a report, not a failure.
    expect(run.darkBreaks.filter((d) => d.task > 11)).toEqual([]);
    // Phase 8B1 AC2.4: the radar is unlocked at the end; at the start of tasks 12 and 16
    // its nearest vein is the nearest ore block of a brute-force scan (same cell).
    expect(run.radarUnlocked).toBe(true);
    expect(run.radarAtMs).not.toBeNull();
    expect(run.radar.map((c) => [c.task, c.kind])).toEqual([
      [12, 'coal'],
      [16, 'iron'],
    ]);
    for (const check of run.radar) {
      expect(check.bruteForce).not.toBeNull();
      expect(check.radar).toEqual(check.bruteForce);
    }
  });
});
