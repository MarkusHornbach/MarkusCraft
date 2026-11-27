// Save format 4: the task book and the record's progress fields (Phase 8 AC4.1–AC4.3).
import { describe, expect, it } from 'vitest';
import { SAVE_FORMAT_VERSION } from '../game/config';
import { sampleMeta } from '../testing/sampleWorld';
import { mulberry32, randInt } from '../util/rng';
import { type WorldMeta, decodeMeta, encodeMeta } from './saveFormat';

function throughJson<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function adventure(): WorldMeta {
  const meta = sampleMeta({ mode: 'gathering' });
  const guest = {
    key: 'a'.repeat(32),
    name: 'Anna',
    record: { ...meta.player, xp: 90, found: [12], crafted: [1, 2] },
    pose: { ...meta.pose },
    moveMode: 'walk' as const,
    lastSeenMs: 1_700_000_000_000,
  };
  return {
    ...meta,
    player: { ...meta.player, xp: 163, found: [12, 13], crafted: [1, 3, 2] },
    progress: { done: [1, 2, 3, 4, 5], counts: [{ task: 6, count: 3 }] },
    guests: [guest],
  };
}

// Literal records of the three older formats, Gathering, with items (no progress fields).
const SLOTS = `[{"item":262,"count":1},{"item":5,"count":7},{"item":256,"count":12}${',null'.repeat(33)}]`;
const PLAYER = `{"slots":${SLOTS},"selectedSlot":1,"breaking":null}`;
const COMMON = `"seed":4242,"mode":"gathering","createdMs":1790000000000,"playedMs":1790000480000,"time":0.62,"pose":{"x":-12.5,"y":63,"z":40.75,"yaw":2.5,"pitch":0.4},"moveMode":"walk","player":${PLAYER}`;
const FORMAT_1 = `{"id":"wf1","name":"Old 1","generatorVersion":1,"formatVersion":1,${COMMON}}`;
const FORMAT_2 = `{"id":"wf2","name":"Old 2","generatorVersion":1,"formatVersion":2,${COMMON},"guests":[{"key":"${'b'.repeat(32)}","name":"Ben","record":${PLAYER},"pose":{"x":1,"y":60,"z":2,"yaw":0,"pitch":0},"moveMode":"walk","lastSeenMs":1790000000000}]}`;
const FORMAT_3 = `{"id":"wf3","name":"Old 3","generatorVersion":2,"options":{"terrain":"balanced","trees":"few"},"formatVersion":3,${COMMON},"guests":[]}`;

describe('format 4 (Phase 8 AC4.1)', () => {
  it('round trip of progress and the record fields, guests included', () => {
    const meta = adventure();
    const decoded = decodeMeta(throughJson(encodeMeta(meta)));
    expect(decoded).toEqual({ ok: true, value: meta });
  });

  it('a Creative world stores an empty book', () => {
    const record = encodeMeta(sampleMeta());
    expect(record.progress).toEqual({ done: [], counts: [], book: 1 });
    expect(record.formatVersion).toBe(SAVE_FORMAT_VERSION);
  });
});

describe('old worlds (Phase 8 AC4.2)', () => {
  for (const [label, text] of [
    ['format 1', FORMAT_1],
    ['format 2', FORMAT_2],
    ['format 3', FORMAT_3],
  ] as const) {
    it(`a ${label} Gathering world loads with a fresh book, level 1 and its inventory`, () => {
      const decoded = decodeMeta(JSON.parse(text));
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) return;
      const meta = decoded.value;
      expect(meta.mode).toBe('gathering');
      expect(meta.progress).toEqual({ done: [], counts: [] });
      expect(meta.player.xp).toBe(0);
      expect(meta.player.found).toEqual([]);
      expect(meta.player.crafted).toEqual([]);
      expect(meta.player.slots[0]).toEqual({ item: 262, count: 1 });
      expect(meta.player.slots[2]).toEqual({ item: 256, count: 12 });
      for (const guest of meta.guests) expect(guest.record.xp).toBe(0);
      const written = encodeMeta(meta);
      expect(written.formatVersion).toBe(SAVE_FORMAT_VERSION);
      expect(decodeMeta(throughJson(written))).toEqual(decoded);
    });
  }

  it('the guest of a format 2 world is migrated too', () => {
    const decoded = decodeMeta(JSON.parse(FORMAT_2));
    expect(decoded.ok && decoded.value.guests.map((g) => g.name)).toEqual(['Ben']);
  });
});

describe('malformed progress (Phase 8 AC4.3)', () => {
  const good = encodeMeta(adventure());
  const withPlayer = (fields: Record<string, unknown>): unknown => ({
    ...good,
    player: { ...(good.player as object), ...fields },
  });
  const withProgress = (progress: unknown): unknown => ({ ...good, progress });

  const variants: [string, unknown][] = [
    ['no progress', { ...good, progress: undefined }],
    ['progress not an object', withProgress([1, 2])],
    ['done not a list', withProgress({ done: 3, counts: [] })],
    ['a task id twice', withProgress({ done: [1, 1], counts: [] })],
    ['a task id 0', withProgress({ done: [0], counts: [] })],
    ['a count of 0', withProgress({ done: [], counts: [{ task: 6, count: 0 }] })],
    [
      'two counts of one task',
      withProgress({
        done: [],
        counts: [
          { task: 6, count: 1 },
          { task: 6, count: 2 },
        ],
      }),
    ],
    [
      'too many done',
      withProgress({ done: Array.from({ length: 1025 }, (_, i) => i + 1), counts: [] }),
    ],
    ['negative xp', withPlayer({ xp: -1 })],
    ['xp above the limit', withPlayer({ xp: 1_000_000_001 })],
    ['a found block twice', withPlayer({ found: [12, 12] })],
    ['crafted not a list', withPlayer({ crafted: 'all' })],
  ];

  for (const [label, record] of variants) {
    it(`damaged: ${label}`, () => {
      expect(decodeMeta(throughJson(record))).toEqual({ ok: false, error: 'damaged' });
    });
  }

  it('a guest entry with bad progress fields is dropped, the world loads', () => {
    const guests = (good.guests as Record<string, unknown>[]).map((g) => ({
      ...g,
      record: { ...(g.record as object), xp: 'lots' },
    }));
    const decoded = decodeMeta(throughJson({ ...good, guests }));
    expect(decoded.ok && decoded.value.guests).toEqual([]);
  });

  it('unknown task, block and recipe ids load', () => {
    const record = {
      ...(withPlayer({ found: [200, 65535], crafted: [999] }) as object),
      progress: { done: [500], counts: [{ task: 777, count: 5 }], book: 1 },
    };
    const decoded = decodeMeta(throughJson(record));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.progress.done).toEqual([500]);
    expect(decoded.value.player.crafted).toEqual([999]);
  });

  it('fuzzed progress fields never throw and what loads encodes to itself', () => {
    const rng = mulberry32(84);
    const atoms: unknown[] = [
      null,
      0,
      1,
      -1,
      7,
      1.5,
      65536,
      1e9,
      'x',
      true,
      [],
      {},
      [1, 2],
      { task: 1 },
    ];
    const random = (depth: number): unknown => {
      const pick = randInt(rng, depth > 1 ? atoms.length : atoms.length + 3);
      if (pick < atoms.length) return atoms[pick];
      if (pick === atoms.length)
        return Array.from({ length: randInt(rng, 4) }, () => random(depth + 1));
      return { task: random(depth + 1), count: random(depth + 1) };
    };
    let accepted = 0;
    for (let i = 0; i < 5000; i++) {
      const record =
        randInt(rng, 2) === 0
          ? withProgress({ done: random(0), counts: random(0) })
          : withPlayer({ [['xp', 'found', 'crafted'][randInt(rng, 3)]]: random(0) });
      const decoded = decodeMeta(throughJson(record));
      if (decoded.ok) {
        accepted++;
        expect(decodeMeta(throughJson(encodeMeta(decoded.value)))).toEqual(decoded);
      }
    }
    expect(accepted).toBeGreaterThan(0);
    expect(accepted).toBeLessThan(5000);
  });
});
