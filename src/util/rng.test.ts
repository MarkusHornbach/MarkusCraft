import { describe, expect, it } from 'vitest';
import { deriveSeed, hash2, hash2Float, hash32, mulberry32, randInt } from './rng';

function sequence(seed: number, n: number): number[] {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => rng());
}

describe('mulberry32', () => {
  it('gives identical sequences for the same seed (AC3.1)', () => {
    expect(sequence(1337, 100)).toEqual(sequence(1337, 100));
  });
  it('gives different sequences for different seeds (AC3.1)', () => {
    expect(sequence(1, 20)).not.toEqual(sequence(2, 20));
  });
  it('stays in [0, 1) and is roughly uniform', () => {
    const values = sequence(42, 20000);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });
  it('randInt stays in range', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = randInt(rng, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
  });
});

describe('hashes', () => {
  it('are deterministic and return unsigned 32-bit integers', () => {
    expect(hash32(123)).toBe(hash32(123));
    expect(hash2(1, -5, 9)).toBe(hash2(1, -5, 9));
    for (const v of [hash32(0), hash32(-1), hash2(9, -100, 100)]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });
  it('depend on every argument', () => {
    const base = hash2(1, 2, 3);
    expect(hash2(2, 2, 3)).not.toBe(base);
    expect(hash2(1, 3, 3)).not.toBe(base);
    expect(hash2(1, 2, 4)).not.toBe(base);
    expect(hash2(1, 3, 2)).not.toBe(base);
  });
  it('hash2Float is uniform over a grid', () => {
    let sum = 0;
    let below = 0;
    const n = 200;
    for (let x = -n / 2; x < n / 2; x++) {
      for (let z = -n / 2; z < n / 2; z++) {
        const v = hash2Float(5, x, z);
        sum += v;
        if (v < 0.1) below++;
      }
    }
    expect(sum / (n * n)).toBeCloseTo(0.5, 1);
    expect(below / (n * n)).toBeGreaterThan(0.09);
    expect(below / (n * n)).toBeLessThan(0.11);
  });
  it('deriveSeed separates salts', () => {
    expect(deriveSeed(1, 0)).not.toBe(deriveSeed(1, 1));
    expect(deriveSeed(1, 0)).toBe(deriveSeed(1, 0));
  });
});
