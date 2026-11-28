// The goal bot on generator 3 (Phase 8 part B2a AC3.5): a file of its own, so it runs beside
// the generator 2 run instead of after it.
import { describe, expect, it } from 'vitest';
import { TASKS } from '../progress/tables';
import { Block } from '../world/blocks';
import { runBot } from './Bot';

describe('goal bot on generator 3', () => {
  it('Phase 8B2a AC3.5 finishes the book on generator 3 (seed 1337 balanced/few)', () => {
    const run = runBot(1337, { version: 3, options: { terrain: 'balanced', trees: 'few' } });
    expect(run.error).toBeNull();
    expect(run.completed).toBe(true);
    expect(run.tasks.map((t) => t.id).sort((a, b) => a - b)).toEqual(
      TASKS.map((t) => t.id).sort((a, b) => a - b),
    );
    expect(run.allUnlocked).toBe(true);
    expect(run.lightErrors).toBe(0);
    expect(run.darkBreaks.filter((d) => d.task > 11)).toEqual([]);
    expect(run.radarUnlocked).toBe(true);
    for (const check of run.radar) expect(check.radar).toEqual(check.bruteForce);
    // Phase 8B2b AC5.3: at the start of task 16 the radar's nearest shaft and cave equal a
    // brute-force search of `placesIn` over the far radius; the shaft's top is a frame log.
    expect(run.places.map((c) => [c.task, c.kind])).toEqual([
      [16, 'shaft'],
      [16, 'cave'],
    ]);
    for (const check of run.places) {
      expect(check.bruteForce, check.kind).not.toBeNull();
      expect(check.radar, check.kind).toEqual(check.bruteForce);
    }
    expect([Block.PLANKS, Block.LOG]).toContain(run.places[0].block);
    expect(run.places[1].block).toBe(Block.AIR);
  });
});
