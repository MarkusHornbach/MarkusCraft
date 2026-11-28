// Phase 8B2a AC2.1: generator 3's faces per chunk against generator 2's (the face budget).
import { describe, expect, it } from 'vitest';
import { CAVE_SEEDS, CAVE_SHAPES, carvedShare, facesPerChunk } from '../../testing/caveMeasure';

describe('cave cost: faces', () => {
  it('Phase 8B2a AC2.1 faces per chunk: median at most 1.5 ×, no preset above 2 × generator 2', () => {
    const ratios: number[] = [];
    const rows: string[] = [];
    for (const seed of CAVE_SEEDS) {
      for (const terrain of CAVE_SHAPES) {
        const options = { terrain, trees: 'few' } as const;
        const two = facesPerChunk(seed, { version: 2, options });
        const three = facesPerChunk(seed, { version: 3, options });
        ratios.push(three / two);
        rows.push(
          `${seed} ${terrain}: ${two.toFixed(0)} → ${three.toFixed(0)} (${(three / two).toFixed(2)} ×, carved ${(100 * carvedShare(seed, options)).toFixed(2)} %)`,
        );
      }
    }
    const sorted = [...ratios].sort((a, b) => a - b);
    const median = (sorted[5] + sorted[6]) / 2;
    console.log(
      `faces per chunk, generator 2 → 3:\n${rows.join('\n')}\nmedian ${median.toFixed(2)} ×`,
    );
    expect(median).toBeLessThanOrEqual(1.5);
    expect(sorted[sorted.length - 1]).toBeLessThanOrEqual(2);
  });

  it('Phase 8B3b AC1.5 faces per chunk of generator 4 equal generator 3 within 1 %', () => {
    const rows: string[] = [];
    for (const seed of CAVE_SEEDS) {
      for (const terrain of CAVE_SHAPES) {
        const options = { terrain, trees: 'few' } as const;
        const three = facesPerChunk(seed, { version: 3, options });
        const four = facesPerChunk(seed, { version: 4, options });
        rows.push(`${seed} ${terrain}: ${three.toFixed(0)} → ${four.toFixed(0)}`);
        expect(Math.abs(four / three - 1), `${seed} ${terrain}`).toBeLessThanOrEqual(0.01);
      }
    }
    console.log(`faces per chunk, generator 3 → 4:\n${rows.join('\n')}`);
  });
});
