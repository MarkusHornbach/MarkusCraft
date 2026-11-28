// The goal bot's loot run on generator 4 (Phase 8 part B3b AC6.2): both trips find a chest,
// the book completes, the light invariant holds.
import { describe, expect, it } from 'vitest';
import { TASKS } from '../progress/tables';
import { runBot } from './Bot';

describe('goal bot loot run on generator 4', () => {
  it('Phase 8B3b AC6.2 finishes the book with --loot (seed 1337 balanced/few)', () => {
    const run = runBot(
      1337,
      { version: 4, options: { terrain: 'balanced', trees: 'few' } },
      { loot: true },
    );
    expect(run.error).toBeNull();
    expect(run.completed).toBe(true);
    expect(run.tasks.map((t) => t.id).sort((a, b) => a - b)).toEqual(
      TASKS.map((t) => t.id).sort((a, b) => a - b),
    );
    expect(run.allUnlocked).toBe(true);
    expect(run.lightErrors).toBe(0);
    expect(run.trips.map((t) => t.label)).toEqual(['Loot trip 1', 'Loot trip 2']);
    for (const trip of run.trips) {
      expect(trip.distance, trip.label).not.toBeNull();
      expect(trip.items.length, trip.label).toBeGreaterThan(0);
    }
  });
});
