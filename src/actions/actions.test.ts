import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../util/rng';
import { type Action, COORD_LIMIT, decodeAction } from './actions';

const SAMPLES: Action[] = [
  { kind: 'selectSlot', slot: 0 },
  { kind: 'selectSlot', slot: 8 },
  { kind: 'break', x: 0, y: 0, z: 0 },
  { kind: 'break', x: -17, y: 127, z: 123456 },
  { kind: 'place', x: 5, y: 64, z: -9, slot: 3 },
  { kind: 'place', x: -COORD_LIMIT, y: 1, z: COORD_LIMIT, slot: 8 },
  { kind: 'startBreak', x: -4, y: 60, z: 9 },
  { kind: 'moveStack', from: 0, to: 35 },
  { kind: 'moveStack', from: 12, to: 3 },
  { kind: 'discard', slot: 35 },
  { kind: 'setBarSlot', slot: 8, item: 14 },
];

describe('decodeAction', () => {
  it('lets every action kind survive JSON unchanged (Phase 3 AC2.1)', () => {
    expect(new Set(SAMPLES.map((a) => a.kind))).toEqual(
      new Set(['selectSlot', 'break', 'place', 'startBreak', 'moveStack', 'discard', 'setBarSlot']),
    );
    for (const action of SAMPLES) {
      const decoded = decodeAction(JSON.parse(JSON.stringify(action)));
      expect(decoded).toEqual({ ok: true, action });
      // A fresh object, not the input.
      if (decoded.ok) expect(decoded.action).not.toBe(action);
    }
  });

  it('rejects malformed values without throwing (Phase 3 AC2.2)', () => {
    const bad: unknown[] = [
      undefined,
      null,
      0,
      'break',
      true,
      [],
      [{ kind: 'selectSlot', slot: 1 }],
      {},
      { kind: 'fly' },
      { kind: 7 },
      { kind: 'toString', slot: 1 },
      { kind: 'selectSlot' },
      { kind: 'selectSlot', slot: '1' },
      { kind: 'selectSlot', slot: 9 },
      { kind: 'selectSlot', slot: -1 },
      { kind: 'selectSlot', slot: 1.5 },
      { kind: 'selectSlot', slot: NaN },
      { kind: 'selectSlot', slot: 1, extra: 0 },
      { kind: 'break', x: 1, y: 2 },
      { kind: 'break', x: 1, y: 2, z: '3' },
      { kind: 'break', x: 1.5, y: 2, z: 3 },
      { kind: 'break', x: 1, y: NaN, z: 3 },
      { kind: 'break', x: Infinity, y: 2, z: 3 },
      { kind: 'break', x: 1, y: 2, z: -Infinity },
      { kind: 'break', x: COORD_LIMIT + 1, y: 2, z: 3 },
      { kind: 'break', x: 1, y: 2, z: 3, slot: 1 },
      { kind: 'break', x: null, y: 2, z: 3 },
      { kind: 'place', x: 1, y: 2, z: 3 },
      { kind: 'place', x: 1, y: 2, z: 3, slot: 9 },
      { kind: 'place', x: 1, y: 2, z: 3, slot: 0, id: 3 },
      { kind: 'place', x: [1], y: 2, z: 3, slot: 0 },
      { kind: 'startBreak', x: 1, y: 2 },
      { kind: 'startBreak', x: 1, y: 2.5, z: 3 },
      { kind: 'startBreak', x: 1, y: 2, z: 3, startMs: 0 },
      { kind: 'moveStack', from: 0 },
      { kind: 'moveStack', from: 0, to: 36 },
      { kind: 'moveStack', from: -1, to: 2 },
      { kind: 'moveStack', from: 0.5, to: 2 },
      { kind: 'moveStack', from: 0, to: 2, slot: 1 },
      { kind: 'discard' },
      { kind: 'discard', slot: 36 },
      { kind: 'discard', slot: '3' },
      { kind: 'setBarSlot', slot: 9, item: 3 },
      { kind: 'setBarSlot', slot: 0, item: 0 },
      { kind: 'setBarSlot', slot: 0, item: 70000 },
      { kind: 'setBarSlot', slot: 0, item: 3.5 },
      { kind: 'setBarSlot', slot: 0 },
    ];
    for (const value of bad) {
      const decoded = decodeAction(value);
      expect(decoded.ok, JSON.stringify(value)).toBe(false);
      if (!decoded.ok) expect(decoded.error.length).toBeGreaterThan(0);
    }
    // Objects that throw when read.
    const hostile = new Proxy(
      {},
      {
        get: () => {
          throw new Error('boom');
        },
        ownKeys: () => {
          throw new Error('boom');
        },
      },
    );
    expect(decodeAction(hostile).ok).toBe(false);
    const getter = { kind: 'selectSlot' };
    Object.defineProperty(getter, 'slot', {
      enumerable: true,
      get: () => {
        throw new Error('boom');
      },
    });
    expect(decodeAction(getter).ok).toBe(false);
  });

  it('survives 10 000 seeded random values (Phase 3 AC2.2)', () => {
    const rng = mulberry32(2024);
    const atoms: unknown[] = [
      0,
      1,
      8,
      9,
      -1,
      0.5,
      NaN,
      Infinity,
      -Infinity,
      2 ** 40,
      '',
      'break',
      'place',
      'selectSlot',
      'moveStack',
      'startBreak',
      'discard',
      'setBarSlot',
      35,
      null,
      undefined,
      true,
      [],
      {},
    ];
    const keys = [
      'kind',
      'x',
      'y',
      'z',
      'slot',
      'from',
      'to',
      'item',
      'extra',
      '__proto__',
      'constructor',
    ];
    const random = (depth: number): unknown => {
      const pick = randInt(rng, depth > 2 ? atoms.length : atoms.length + 6);
      if (pick < atoms.length) return atoms[pick];
      if (pick === atoms.length)
        return Array.from({ length: randInt(rng, 4) }, () => random(depth + 1));
      const object: Record<string, unknown> = {};
      const count = randInt(rng, 6);
      for (let i = 0; i < count; i++) object[keys[randInt(rng, keys.length)]] = random(depth + 1);
      return object;
    };
    let accepted = 0;
    for (let i = 0; i < 10_000; i++) {
      const value = random(0);
      const decoded = decodeAction(value);
      if (!decoded.ok) continue;
      accepted++;
      // Whatever is accepted is a clean action that decodes to itself again.
      expect(decodeAction(JSON.parse(JSON.stringify(decoded.action)))).toEqual(decoded);
    }
    // Random objects hardly ever form a valid action, but the generator can produce one.
    expect(accepted).toBeLessThan(500);
  });
});
