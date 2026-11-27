// The world options' strings, labels and validation (Phase 7 part A).
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_GEN,
  DEFAULT_WORLD_OPTIONS,
  TERRAIN_SHAPES,
  TREE_DENSITIES,
  decodeWorldOptions,
  describeWorldGen,
  debugWorldGen,
  isKnownGeneratorVersion,
  optionsOf,
  sameWorldGen,
  worldGenKey,
  worldGenOf,
} from './worldOptions';

describe('world options', () => {
  it('keep their stored strings for ever (append-only, Phase 7 5.1)', () => {
    expect(TERRAIN_SHAPES).toEqual(['flat', 'balanced', 'hilly']);
    expect(TREE_DENSITIES).toEqual(['none', 'few', 'normal', 'many']);
    expect(DEFAULT_WORLD_OPTIONS).toEqual({ terrain: 'balanced', trees: 'few' });
  });

  it('decode valid options and never fill in a default', () => {
    expect(decodeWorldOptions({ terrain: 'flat', trees: 'many' })).toEqual({
      ok: true,
      options: { terrain: 'flat', trees: 'many' },
    });
    // Extra fields are dropped, not kept.
    const decoded = decodeWorldOptions({ terrain: 'hilly', trees: 'none', extra: 1 });
    expect(decoded).toEqual({ ok: true, options: { terrain: 'hilly', trees: 'none' } });
  });

  it('call unknown strings newer and anything malformed damaged', () => {
    expect(decodeWorldOptions({ terrain: 'islands', trees: 'few' })).toEqual({
      ok: false,
      error: 'newer',
    });
    expect(decodeWorldOptions({ terrain: 'flat', trees: 'jungle' })).toEqual({
      ok: false,
      error: 'newer',
    });
    for (const bad of [
      null,
      undefined,
      1,
      'flat',
      [],
      ['flat', 'few'],
      {},
      { terrain: 'flat' },
      { trees: 'few' },
      { terrain: 1, trees: 'few' },
      { terrain: 'flat', trees: null },
      { terrain: '', trees: 'few' },
      { terrain: 'x'.repeat(33), trees: 'few' },
    ]) {
      expect(decodeWorldOptions(bad), JSON.stringify(bad)).toEqual({ ok: false, error: 'damaged' });
    }
  });

  it('pair generator versions with options', () => {
    expect(isKnownGeneratorVersion(1)).toBe(true);
    expect(isKnownGeneratorVersion(2)).toBe(true);
    expect(isKnownGeneratorVersion(3)).toBe(true);
    expect(isKnownGeneratorVersion(4)).toBe(false);
    const options = { terrain: 'flat', trees: 'many' } as const;
    expect(worldGenOf(1, null)).toEqual(CLASSIC_GEN);
    expect(worldGenOf(1, options)).toBeNull();
    expect(worldGenOf(2, options)).toEqual({ version: 2, options });
    expect(worldGenOf(2, null)).toBeNull();
    expect(worldGenOf(3, options)).toEqual({ version: 3, options });
    expect(worldGenOf(3, null)).toBeNull();
    expect(worldGenOf(4, options)).toBeNull();
    expect(optionsOf(CLASSIC_GEN)).toBeNull();
    expect(optionsOf({ version: 2, options })).toEqual(options);
    expect(sameWorldGen(CLASSIC_GEN, { version: 1 })).toBe(true);
    expect(sameWorldGen(CLASSIC_GEN, { version: 2, options })).toBe(false);
    expect(sameWorldGen({ version: 2, options }, { version: 2, options: { ...options } })).toBe(
      true,
    );
    expect(
      sameWorldGen({ version: 2, options }, { version: 2, options: { ...options, trees: 'few' } }),
    ).toBe(false);
    // Phase 8B2a AC1.6: generator 3 takes the same options, but is another generator.
    expect(sameWorldGen({ version: 3, options }, { version: 3, options: { ...options } })).toBe(
      true,
    );
    expect(sameWorldGen({ version: 2, options }, { version: 3, options })).toBe(false);
    expect(worldGenKey({ version: 3, options })).toBe('3:flat:many');
    expect(worldGenKey({ version: 2, options })).toBe('2:flat:many');
    expect(optionsOf({ version: 3, options })).toEqual(options);
  });

  it('are described for the world list and the overlay', () => {
    expect(describeWorldGen(CLASSIC_GEN)).toBe('Classic');
    expect(describeWorldGen({ version: 2, options: DEFAULT_WORLD_OPTIONS })).toBe(
      'Balanced · Few trees',
    );
    expect(describeWorldGen({ version: 2, options: { terrain: 'flat', trees: 'many' } })).toBe(
      'Flat · Many trees',
    );
    expect(debugWorldGen(CLASSIC_GEN)).toBe('Generator 1');
    expect(debugWorldGen({ version: 2, options: DEFAULT_WORLD_OPTIONS })).toBe(
      'Generator 2 · balanced · few',
    );
    // Phase 8B2a AC1.6
    expect(describeWorldGen({ version: 3, options: DEFAULT_WORLD_OPTIONS })).toBe(
      'Balanced · Few trees · Caves',
    );
    expect(debugWorldGen({ version: 3, options: DEFAULT_WORLD_OPTIONS })).toBe(
      'Generator 3 · balanced · few',
    );
  });
});
