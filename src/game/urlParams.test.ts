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
      touch: false,
      timeFromUrl: false,
      save: false,
      world: 'Test',
      mode: 'creative',
      testGen: { version: 1 },
      progress: 'all',
      bench: 'off',
      join: null,
      name: null,
      look: null,
      previewGl: true,
    });
  });
  it('reads all parameters', () => {
    expect(
      parseParams(
        '?seed=42&time=0.75&freeze=1&test=1&touch=1&save=1&world=%20Second%20&join=ab-cd%20ef&name=Ann&look=3&previewgl=0',
        random,
      ),
    ).toEqual({
      seed: 42,
      seedFromUrl: true,
      time: 0.75,
      freeze: true,
      test: true,
      touch: true,
      timeFromUrl: true,
      save: true,
      world: 'Second',
      mode: 'creative',
      testGen: { version: 1 },
      progress: 'all',
      bench: 'off',
      join: 'ABCDEF',
      name: 'Ann',
      look: 3,
      previewGl: false,
    });
  });
  it('Phase 7 5.8: terrain and trees choose generator 2 for the test world', () => {
    expect(parseParams('?test=1', random).testGen).toEqual({ version: 1 });
    // Phase 8: the book of an Adventure test world.
    expect(parseParams('?test=1&progress=fresh', random).progress).toBe('fresh');
    expect(parseParams('?test=1&progress=other', random).progress).toBe('all');
    expect(parseParams('?test=1&terrain=flat&trees=many', random).testGen).toEqual({
      version: 2,
      options: { terrain: 'flat', trees: 'many' },
    });
    // A missing one takes its default.
    expect(parseParams('?terrain=hilly', random).testGen).toEqual({
      version: 2,
      options: { terrain: 'hilly', trees: 'few' },
    });
    expect(parseParams('?trees=none', random).testGen).toEqual({
      version: 2,
      options: { terrain: 'balanced', trees: 'none' },
    });
    // An invalid value is ignored.
    expect(parseParams('?terrain=islands&trees=many', random).testGen).toEqual({
      version: 2,
      options: { terrain: 'balanced', trees: 'many' },
    });
    expect(parseParams('?terrain=Flat&trees=', random).testGen).toEqual({ version: 1 });
  });
  it('Phase 6 AC7.3: an invalid join code counts as none', () => {
    expect(parseParams('?join=ABC', random).join).toBeNull();
    expect(parseParams('?join=abcdef', random).join).toBe('ABCDEF');
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
    expect(parseParams('?freeze=0&test=yes&touch=true', random)).toMatchObject({
      freeze: false,
      test: false,
      touch: false,
    });
  });

  it('Phase 4P: bench opens the performance test, but never in test mode', () => {
    const bench = (search: string): string => parseParams(search, () => 1).bench;
    expect(bench('')).toBe('off');
    expect(bench('?bench=1')).toBe('full');
    expect(bench('?bench=quick')).toBe('quick');
    expect(bench('?bench=sample')).toBe('sample');
    expect(bench('?bench=0')).toBe('off');
    expect(bench('?bench=yes')).toBe('off');
    expect(bench('?bench=1&test=1')).toBe('off');
    expect(bench('?test=1&bench=quick')).toBe('off');
  });

  it('look= is a choice 0–8 or nothing (Phase 6 part D)', () => {
    const look = (v: string): number | null => parseParams(`?look=${v}`, () => 1).look;
    expect(look('0')).toBe(0);
    expect(look('8')).toBe(8);
    for (const v of ['9', '-1', '2.5', 'x', '', '12']) expect(look(v)).toBeNull();
  });
});
