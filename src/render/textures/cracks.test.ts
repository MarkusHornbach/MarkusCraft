import { describe, expect, it } from 'vitest';
import { CRACK_SIZE, CRACK_STAGES, crackPixels, paintCracks } from './cracks';

describe('crack overlay', () => {
  it('has five stages of 32 × 32 pixels and paints the same pixels every time', () => {
    expect(CRACK_STAGES).toBe(5);
    for (let stage = 0; stage < CRACK_STAGES; stage++) {
      const px = paintCracks(stage);
      expect(px.length).toBe(CRACK_SIZE * CRACK_SIZE * 4);
      expect([...px]).toEqual([...paintCracks(stage)]);
    }
  });

  it('grows from stage to stage: every stage contains the one before and adds to it', () => {
    let before: Uint8ClampedArray | null = null;
    const counts: number[] = [];
    for (let stage = 0; stage < CRACK_STAGES; stage++) {
      const px = paintCracks(stage);
      counts.push(crackPixels(px));
      if (before) {
        for (let i = 3; i < px.length; i += 4) {
          // A crack pixel never disappears again.
          if (before[i] > 200) expect(px[i]).toBe(before[i]);
        }
        expect(counts[stage]).toBeGreaterThan(counts[stage - 1] * 1.2);
      }
      before = px;
    }
    expect(counts[0]).toBeGreaterThanOrEqual(15);
    const total = CRACK_SIZE * CRACK_SIZE;
    expect(counts[CRACK_STAGES - 1] / total).toBeGreaterThan(0.1);
    expect(counts[CRACK_STAGES - 1] / total).toBeLessThan(0.45);
  });

  it('draws dark lines with a faint light edge and leaves most of the block clear', () => {
    const px = paintCracks(CRACK_STAGES - 1);
    let clear = 0;
    let light = 0;
    for (let i = 0; i < px.length; i += 4) {
      const alpha = px[i + 3];
      if (alpha === 0) clear++;
      else if (alpha > 200) expect(px[i] + px[i + 1] + px[i + 2]).toBe(0);
      else {
        light++;
        expect(px[i]).toBe(255);
      }
    }
    expect(light).toBeGreaterThan(20);
    expect(clear / (CRACK_SIZE * CRACK_SIZE)).toBeGreaterThan(0.4);
  });

  it('clamps stages outside the range', () => {
    expect([...paintCracks(-3)]).toEqual([...paintCracks(0)]);
    expect([...paintCracks(99)]).toEqual([...paintCracks(CRACK_STAGES - 1)]);
  });
});
