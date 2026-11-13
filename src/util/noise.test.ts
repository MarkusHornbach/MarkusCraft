import { describe, expect, it } from 'vitest';
import { GRAD_X, GRAD_Y, createNoise2D, fbm2D } from './noise';
import { mulberry32 } from './rng';

describe('simplex noise', () => {
  it('uses a literal gradient table equal to the sin/cos values (Phase 3 AC1.1)', () => {
    expect(GRAD_X.length).toBe(12);
    expect(GRAD_Y.length).toBe(12);
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      expect(Math.abs(GRAD_X[i] - Math.cos(angle))).toBeLessThan(1e-7);
      expect(Math.abs(GRAD_Y[i] - Math.sin(angle))).toBeLessThan(1e-7);
    }
  });

  it('stays in [-1, 1] with a mean near 0 over 100 000 samples (AC3.2)', () => {
    const noise = createNoise2D(1337);
    const rng = mulberry32(99);
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      const v = noise((rng() - 0.5) * 2000, (rng() - 0.5) * 2000);
      min = Math.min(min, v);
      max = Math.max(max, v);
      sum += v;
    }
    expect(min).toBeGreaterThanOrEqual(-1);
    expect(max).toBeLessThanOrEqual(1);
    // The range is actually used, not just respected.
    expect(min).toBeLessThan(-0.8);
    expect(max).toBeGreaterThan(0.8);
    expect(Math.abs(sum / n)).toBeLessThan(0.1);
  });

  it('is continuous: samples 0.01 apart differ by less than 0.1 (AC3.2)', () => {
    const noise = createNoise2D(7);
    const rng = mulberry32(3);
    for (let i = 0; i < 20_000; i++) {
      const x = (rng() - 0.5) * 500;
      const y = (rng() - 0.5) * 500;
      expect(Math.abs(noise(x + 0.01, y) - noise(x, y))).toBeLessThan(0.1);
      expect(Math.abs(noise(x, y + 0.01) - noise(x, y))).toBeLessThan(0.1);
    }
  });

  it('is deterministic per seed and differs between seeds', () => {
    const a = createNoise2D(1);
    const b = createNoise2D(1);
    const c = createNoise2D(2);
    let differs = false;
    for (let i = 0; i < 50; i++) {
      expect(a(i * 0.37, i * 0.11)).toBe(b(i * 0.37, i * 0.11));
      if (a(i * 0.37, i * 0.11) !== c(i * 0.37, i * 0.11)) differs = true;
    }
    expect(differs).toBe(true);
  });
});

describe('fbm2D', () => {
  it('stays in [-1, 1] and has a mean near 0', () => {
    const noise = createNoise2D(11);
    const rng = mulberry32(5);
    let sum = 0;
    const n = 50_000;
    for (let i = 0; i < n; i++) {
      const v = fbm2D(noise, (rng() - 0.5) * 3000, (rng() - 0.5) * 3000, 5);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
      sum += v;
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.1);
  });
  it('adds detail with more octaves', () => {
    const noise = createNoise2D(11);
    expect(fbm2D(noise, 3.3, 4.4, 1)).not.toBe(fbm2D(noise, 3.3, 4.4, 4));
  });
});
