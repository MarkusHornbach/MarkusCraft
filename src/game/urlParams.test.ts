import { describe, expect, it } from 'vitest';
import { parseParams } from './urlParams';

describe('parseParams', () => {
  const random = () => 123456;
  it('uses defaults without parameters', () => {
    expect(parseParams('', random)).toEqual({
      seed: 123456,
      seedFromUrl: false,
      time: 0.1,
      freeze: false,
      test: false,
    });
  });
  it('reads all parameters', () => {
    expect(parseParams('?seed=42&time=0.75&freeze=1&test=1', random)).toEqual({
      seed: 42,
      seedFromUrl: true,
      time: 0.75,
      freeze: true,
      test: true,
    });
  });
  it('normalises seeds to unsigned 32-bit and ignores invalid input', () => {
    expect(parseParams('?seed=-1', random).seed).toBe(4294967295);
    expect(parseParams('?seed=4294967297', random).seed).toBe(1);
    expect(parseParams('?seed=abc', random)).toMatchObject({ seed: 123456, seedFromUrl: false });
    expect(parseParams('?seed=1.5', random).seedFromUrl).toBe(false);
    expect(parseParams('?seed=', random).seedFromUrl).toBe(false);
  });
  it('wraps the time into [0, 1) and ignores invalid input', () => {
    expect(parseParams('?time=1.25', random).time).toBeCloseTo(0.25);
    expect(parseParams('?time=-0.25', random).time).toBeCloseTo(0.75);
    expect(parseParams('?time=noon', random).time).toBe(0.1);
    expect(parseParams('?time=', random).time).toBe(0.1);
    expect(parseParams('?freeze=0&test=yes', random)).toMatchObject({ freeze: false, test: false });
  });
});
