import { describe, expect, it } from 'vitest';
import { CHUNK_VOLUME, INVENTORY_SLOTS, SAVE_FORMAT_VERSION } from '../game/config';
import { isItem } from '../items/items';
import { sampleMeta } from '../testing/sampleWorld';
import { mulberry32, randInt } from '../util/rng';
import {
  type WorldEdits,
  decodeChunk,
  decodeMeta,
  decodeWorld,
  encodeChunk,
  encodeChunks,
  encodeMeta,
  isWorldId,
  listEntries,
  makeWorldId,
  metaGen,
  nextWorldName,
  normalizeName,
  seedFromText,
} from './saveFormat';

/** A JSON round trip: what any store or network would do to a record. */
function throughJson<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe('save format', () => {
  it('keeps a world with 50 000 edits in 200 chunks, a full inventory and a pose (Phase 3 AC3.1)', () => {
    const rng = mulberry32(5);
    const edits: WorldEdits = new Map();
    for (let c = 0; c < 200; c++) {
      const chunk = new Map<number, number>();
      while (chunk.size < 250) chunk.set(randInt(rng, CHUNK_VOLUME), randInt(rng, 15));
      edits.set(`${c - 100},${(c * 7) % 31}`, chunk);
    }
    const slots = Array.from({ length: INVENTORY_SLOTS }, (_, i) => ({
      item: i < 30 ? 1 + (i % 14) : 256 + i,
      count: 1 + ((i * 13) % 99),
    }));
    const meta = sampleMeta({
      id: makeWorldId(1_700_000_000_000, 123, 456),
      name: 'Bärenhöhle 🐻 und mehr …',
      seed: 4294967295,
      mode: 'gathering',
      time: 0.999,
      pose: { x: -12345.678, y: 80.25, z: 9876.5, yaw: -3.1, pitch: 1.5 },
      moveMode: 'fly',
      player: {
        slots,
        selectedSlot: 8,
        breaking: { x: -3, y: 70, z: 12, startMs: 4321.5 },
        xp: 0,
        found: [],
        crafted: [],
        track: 0,
      },
    });
    const decoded = decodeWorld(
      throughJson(encodeMeta(meta)),
      throughJson(encodeChunks(meta.id, edits)) as unknown[],
    );
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.meta).toEqual(meta);
    expect(decoded.value.edits.size).toBe(200);
    let count = 0;
    for (const [key, chunk] of edits) {
      const other = decoded.value.edits.get(key);
      expect(other?.size).toBe(chunk.size);
      for (const [index, id] of chunk) {
        if (other?.get(index) !== id) throw new Error(`edit lost in chunk ${key}`);
        count++;
      }
    }
    expect(count).toBe(50_000);
  });

  it('encodes copies: changing the record does not change the world', () => {
    const meta = sampleMeta();
    const record = encodeMeta(meta) as { pose: { x: number }; player: { slots: unknown[] } };
    record.pose.x = 99;
    record.player.slots[0] = null;
    expect(meta.pose.x).toBe(0.5);
    expect(meta.player.slots[0]).not.toBeNull();
  });

  it('rejects missing and mistyped fields without throwing (Phase 3 AC3.2)', () => {
    const good = encodeMeta(sampleMeta());
    expect(decodeMeta(throughJson(good)).ok).toBe(true);
    for (const key of Object.keys(good)) {
      const missing: Record<string, unknown> = { ...good };
      delete missing[key];
      expect(decodeMeta(missing), `without ${key}`).toEqual({ ok: false, error: 'damaged' });
      for (const wrong of [null, 'x', -1, 1.5, NaN, Infinity, [], {}, true]) {
        // A few of these happen to be valid for a field (a name "x", a time 0.5 …).
        const patched = decodeMeta({ ...good, [key]: wrong });
        if (patched.ok) {
          expect((patched.value as unknown as Record<string, unknown>)[key]).toEqual(wrong);
        }
      }
    }
    const bad: [string, unknown][] = [
      ['name', 'x'.repeat(25)],
      ['name', ''],
      ['name', '  padded '],
      ['name', 'line\nbreak'],
      ['name', 7],
      ['id', ''],
      ['id', 'has space'],
      ['id', 'x'.repeat(65)],
      ['seed', -1],
      ['seed', 4294967296],
      ['seed', 1.5],
      ['seed', NaN],
      ['mode', 'survival'],
      ['generatorVersion', 0],
      ['formatVersion', 0],
      ['createdMs', Infinity],
      ['playedMs', NaN],
      ['time', 1],
      ['time', -0.1],
      ['time', Infinity],
      ['moveMode', 'swim'],
      ['pose', { x: 0, y: 0, z: 0, yaw: 0 }],
      ['pose', { x: NaN, y: 0, z: 0, yaw: 0, pitch: 0 }],
      ['pose', { x: 0, y: Infinity, z: 0, yaw: 0, pitch: 0 }],
      ['pose', { x: 0, y: 0, z: 0, yaw: 4, pitch: 0 }],
      ['pose', { x: 0, y: 0, z: 0, yaw: 0, pitch: 2 }],
      ['player', { slots: [], selectedSlot: 0, breaking: null }],
      ['player', { ...(good.player as object), selectedSlot: 9 }],
      ['player', { ...(good.player as object), breaking: { x: 0, y: 0, z: 0 } }],
      ['player', { ...(good.player as object), breaking: undefined }],
    ];
    for (const [key, value] of bad) {
      expect(decodeMeta({ ...good, [key]: value }), `${key} = ${JSON.stringify(value)}`).toEqual({
        ok: false,
        error: 'damaged',
      });
    }
    const slotCases: unknown[] = [
      { item: 0, count: 1 },
      { item: 1, count: 0 },
      { item: 1, count: 100 },
      { item: 1.5, count: 1 },
      { item: 1 },
      'stone',
      7,
    ];
    for (const slot of slotCases) {
      const slots = [...sampleMeta().player.slots] as unknown[];
      slots[20] = slot;
      const record = { ...good, player: { slots, selectedSlot: 0, breaking: null } };
      expect(decodeMeta(record).ok, JSON.stringify(slot)).toBe(false);
    }
    for (const value of [null, undefined, 3, 'world', [], [good]]) {
      expect(decodeMeta(value)).toEqual({ ok: false, error: 'damaged' });
    }
  });

  it('reports a higher format or generator version as newer (Phase 3 AC3.2)', () => {
    const good = encodeMeta(sampleMeta());
    expect(decodeMeta({ ...good, formatVersion: SAVE_FORMAT_VERSION + 1 })).toEqual({
      ok: false,
      error: 'newer',
    });
    // A newer format is reported even if the rest no longer makes sense to this version.
    expect(decodeMeta({ id: 'w1', formatVersion: 7, shape: 'unknown' })).toEqual({
      ok: false,
      error: 'newer',
    });
    expect(decodeMeta({ ...good, generatorVersion: 3 })).toEqual({ ok: false, error: 'newer' });
  });

  it('validates chunk records (Phase 3 AC3.2)', () => {
    const edits = new Map([
      [0, 3],
      [CHUNK_VOLUME - 1, 14],
      [777, 0],
    ]);
    const record = encodeChunk('w1', -3, 12, edits);
    expect(record).toEqual({
      key: 'w1|-3,12',
      worldId: 'w1',
      cx: -3,
      cz: 12,
      edits: [0, 3, CHUNK_VOLUME - 1, 14, 777, 0],
    });
    expect(decodeChunk(throughJson(record))).toEqual({
      ok: true,
      value: { worldId: 'w1', cx: -3, cz: 12, edits },
    });
    const bad: unknown[] = [
      null,
      [],
      { ...record, edits: [0] },
      { ...record, edits: [0, 3, 0, 4] },
      { ...record, edits: [-1, 3] },
      { ...record, edits: [CHUNK_VOLUME, 3] },
      { ...record, edits: [0, 256] },
      { ...record, edits: [0, 1.5] },
      { ...record, edits: [0, NaN] },
      { ...record, edits: 'none' },
      { ...record, cx: 0.5 },
      { ...record, cz: Infinity },
      { ...record, key: 'w1|0,0' },
      { ...record, worldId: 5 },
      { ...record, edits: undefined },
    ];
    for (const value of bad) expect(decodeChunk(value).ok, JSON.stringify(value)).toBe(false);
    // A chunk of another world makes the world damaged.
    const meta = encodeMeta(sampleMeta());
    expect(decodeWorld(meta, [encodeChunk('w2', 0, 0, edits)])).toEqual({
      ok: false,
      error: 'damaged',
    });
    expect(decodeWorld(meta, [{ ...record, edits: [0] }]).ok).toBe(false);
    expect(decodeWorld(meta, [record]).ok).toBe(true);
  });

  it('survives 10 000 seeded random values (Phase 3 AC3.2)', () => {
    const rng = mulberry32(99);
    const good = encodeMeta(sampleMeta());
    const chunk = encodeChunk('w1', 0, 0, new Map([[1, 2]]));
    const atoms: unknown[] = [
      0,
      1,
      -1,
      0.5,
      NaN,
      Infinity,
      2 ** 53,
      '',
      'w1',
      'creative',
      null,
      undefined,
      true,
      [],
      {},
    ];
    const random = (depth: number): unknown => {
      const pick = randInt(rng, depth > 2 ? atoms.length : atoms.length + 8);
      if (pick < atoms.length) return atoms[pick];
      if (pick < atoms.length + 2) {
        return Array.from({ length: randInt(rng, 5) }, () => random(depth + 1));
      }
      // Mostly a valid record with some fields replaced: that reaches the deep checks.
      const base: Record<string, unknown> =
        pick % 2 === 0 ? { ...good } : (throughJson(chunk) as Record<string, unknown>);
      const keys = Object.keys(base);
      const changes = randInt(rng, 3);
      for (let i = 0; i < changes; i++) base[keys[randInt(rng, keys.length)]] = random(depth + 1);
      return base;
    };
    let accepted = 0;
    for (let i = 0; i < 10_000; i++) {
      const value = random(0);
      const meta = decodeMeta(value);
      const decodedChunk = decodeChunk(value);
      expect(typeof meta.ok).toBe('boolean');
      expect(typeof decodedChunk.ok).toBe('boolean');
      if (meta.ok) {
        accepted++;
        // Whatever is accepted is a clean record that encodes to itself.
        expect(decodeMeta(throughJson(encodeMeta(meta.value)))).toEqual(meta);
      }
    }
    expect(accepted).toBeGreaterThan(0);
    expect(accepted).toBeLessThan(9000);
  });

  it('survives objects that throw when read', () => {
    const hostile = new Proxy(
      {},
      {
        get: () => {
          throw new Error('boom');
        },
      },
    );
    expect(decodeMeta(hostile)).toEqual({ ok: false, error: 'damaged' });
    expect(decodeChunk(hostile)).toEqual({ ok: false, error: 'damaged' });
    expect(listEntries([hostile], ['x'])).toEqual([{ status: 'damaged', id: 'x', name: null }]);
  });
});

/**
 * A version 1 record as the current version writes it: the same fields, no guests, a
 * fresh task book and a player at 0 XP (format 4).
 */
function migrated(text: string): string {
  const old = JSON.parse(text) as Record<string, unknown>;
  return JSON.stringify({
    ...old,
    formatVersion: SAVE_FORMAT_VERSION,
    player: { ...(old.player as object), xp: 0, found: [], crafted: [] },
    guests: [],
    progress: { done: [], counts: [] },
  });
}

describe('worlds of earlier versions', () => {
  // Written by the game as of Phase 3 part A (format version 1), before Gathering existed.
  const PART_A_META =
    '{"id":"wparta-fixture1","name":"Part A world","seed":1337,"mode":"creative","generatorVersion":1,"formatVersion":1,"createdMs":1780000000000,"playedMs":1780000360000,"time":0.31,"pose":{"x":8.5,"y":71,"z":-3.25,"yaw":0.5,"pitch":-0.25},"moveMode":"fly","player":{"slots":[{"item":1,"count":1},{"item":2,"count":1},{"item":3,"count":1},{"item":4,"count":1},{"item":5,"count":1},{"item":6,"count":1},{"item":7,"count":1},{"item":8,"count":1},{"item":9,"count":1},null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],"selectedSlot":7,"breaking":null}}';
  const PART_A_CHUNK =
    '{"key":"wparta-fixture1|0,-1","worldId":"wparta-fixture1","cx":0,"cz":-1,"edits":[100,8,2000,0]}';

  it('loads a world saved by Part A as a Creative world with the Phase 1 bar (Phase 3 AC6.9)', () => {
    const decoded = decodeWorld(JSON.parse(PART_A_META), [JSON.parse(PART_A_CHUNK)]);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const { meta, edits } = decoded.value;
    expect(meta.mode).toBe('creative');
    expect(meta.name).toBe('Part A world');
    expect(meta.seed).toBe(1337);
    expect(meta.moveMode).toBe('fly');
    expect(meta.pose).toEqual({ x: 8.5, y: 71, z: -3.25, yaw: 0.5, pitch: -0.25 });
    expect(meta.player.selectedSlot).toBe(7);
    expect(meta.player.slots.slice(0, 9)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((item) => ({ item, count: 1 })),
    );
    expect(meta.player.slots.slice(9).every((slot) => slot === null)).toBe(true);
    expect(meta.player.slots.every((slot) => slot === null || isItem(slot.item))).toBe(true);
    expect([...(edits.get('0,-1') ?? [])]).toEqual([
      [100, 8],
      [2000, 0],
    ]);
    // Saving it again writes the same record, migrated to the current version (Phase 6 part C, Phase 7 AC1.2).
    expect(JSON.stringify(encodeMeta(meta))).toBe(migrated(PART_A_META));
  });
});

describe('a world saved by Part B (Phase 3 AC10.6)', () => {
  // Written by the game as of Phase 3 part B: a Gathering world with items in its slots.
  const PART_B_META =
    '{"id":"wpartb-fixture1","name":"Part B world","seed":4242,"mode":"gathering","generatorVersion":1,"formatVersion":1,"createdMs":1790000000000,"playedMs":1790000480000,"time":0.62,"pose":{"x":-12.5,"y":63,"z":40.75,"yaw":2.5,"pitch":0.4},"moveMode":"walk","player":{"slots":[{"item":2,"count":99},{"item":5,"count":7},{"item":256,"count":12},null,{"item":13,"count":3},null,null,null,{"item":14,"count":20},{"item":2,"count":41},null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,{"item":3,"count":64}],"selectedSlot":2,"breaking":null}}';
  const PART_B_CHUNK =
    '{"key":"wpartb-fixture1|-1,2","worldId":"wpartb-fixture1","cx":-1,"cz":2,"edits":[31000,0,31001,7,5,12]}';

  it('loads unchanged', () => {
    const decoded = decodeWorld(JSON.parse(PART_B_META), [JSON.parse(PART_B_CHUNK)]);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const { meta, edits } = decoded.value;
    expect(meta.mode).toBe('gathering');
    expect(meta.name).toBe('Part B world');
    expect(meta.seed).toBe(4242);
    expect(meta.moveMode).toBe('walk');
    expect(meta.player.selectedSlot).toBe(2);
    expect(meta.player.slots[0]).toEqual({ item: 2, count: 99 });
    expect(meta.player.slots[2]).toEqual({ item: 256, count: 12 });
    expect(meta.player.slots[35]).toEqual({ item: 3, count: 64 });
    expect(meta.player.slots.filter((slot) => slot !== null).length).toBe(7);
    // Every stored item still means the same item.
    expect(meta.player.slots.every((slot) => slot === null || isItem(slot.item))).toBe(true);
    expect([...(edits.get('-1,2') ?? [])]).toEqual([
      [31000, 0],
      [31001, 7],
      [5, 12],
    ]);
    // Saving it again writes the same record, migrated to the current version (Phase 6 part C, Phase 7 AC1.2).
    expect(JSON.stringify(encodeMeta(meta))).toBe(migrated(PART_B_META));
  });
});

describe('worlds with torches (Phase 4 AC6.9)', () => {
  // Written by the game as of Phase 4 part A (format version 1, no torch yet).
  const LIGHT_META =
    '{"id":"wp4a-fixture01","name":"Light world","seed":1337,"mode":"gathering","generatorVersion":1,"formatVersion":1,"createdMs":1800000000000,"playedMs":1800000900000,"time":0.8,"pose":{"x":3.5,"y":52,"z":-7.5,"yaw":1.25,"pitch":-0.5},"moveMode":"walk","player":{"slots":[{"item":265,"count":1},{"item":257,"count":6},{"item":256,"count":4},null,null,null,null,null,null,{"item":3,"count":80},null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],"selectedSlot":0,"breaking":null}}';
  const LIGHT_CHUNK =
    '{"key":"wp4a-fixture01|0,-1","worldId":"wp4a-fixture01","cx":0,"cz":-1,"edits":[12850,0,13106,0,13362,9]}';

  it('loads a world saved by Phase 4 part A unchanged', () => {
    const decoded = decodeWorld(JSON.parse(LIGHT_META), [JSON.parse(LIGHT_CHUNK)]);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.meta.player.slots[0]).toEqual({ item: 265, count: 1 });
    expect([...(decoded.value.edits.get('0,-1') ?? [])]).toEqual([
      [12850, 0],
      [13106, 0],
      [13362, 9],
    ]);
    expect(JSON.stringify(encodeMeta(decoded.value.meta))).toBe(migrated(LIGHT_META));
  });

  it('keeps torches in the world and in the inventory through encode and decode', () => {
    const meta = sampleMeta({ mode: 'gathering' });
    const slots = [...meta.player.slots];
    slots[0] = { item: 19, count: 37 };
    const withTorch = { ...meta, player: { ...meta.player, slots } };
    const edits: WorldEdits = new Map([
      [
        '2,-3',
        new Map([
          [100, 19],
          [356, 19],
          [99, 0],
        ]),
      ],
    ]);
    const decoded = decodeWorld(
      throughJson(encodeMeta(withTorch)),
      encodeChunks(withTorch.id, edits).map(throughJson),
    );
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.meta).toEqual(withTorch);
    expect([...(decoded.value.edits.get('2,-3') ?? [])]).toEqual([
      [100, 19],
      [356, 19],
      [99, 0],
    ]);
  });
});

describe('names, seeds and ids (Phase 3 AC3.3)', () => {
  it('trims names, strips control characters, cuts to 24 and falls back when empty', () => {
    expect(normalizeName('  Castle  ')).toBe('Castle');
    expect(normalizeName('Ca\u0000st\tle\n')).toBe('Castle');
    expect(normalizeName('a'.repeat(40))).toBe('a'.repeat(24));
    // Cut by characters, not by UTF-16 units, and trimmed again after the cut.
    expect(normalizeName('🐻'.repeat(30))).toBe('🐻'.repeat(24));
    expect(normalizeName(`${'a'.repeat(23)} bcd`)).toBe('a'.repeat(23));
    expect(normalizeName('')).toBe('My world');
    expect(normalizeName('  \n\t ')).toBe('My world');
    expect(normalizeName('', 'Test')).toBe('Test');
    expect(normalizeName('Two  words')).toBe('Two  words');
  });

  it('proposes the first free default name', () => {
    expect(nextWorldName([])).toBe('My world');
    expect(nextWorldName(['Castle'])).toBe('My world');
    expect(nextWorldName(['My world'])).toBe('My world 2');
    expect(nextWorldName(['My world', 'My world 2', 'My world 4'])).toBe('My world 3');
  });

  it('maps digits to their value and other text to the same number every time', () => {
    expect(seedFromText('1337')).toBe(1337);
    expect(seedFromText(' 42 ')).toBe(42);
    expect(seedFromText('0')).toBe(0);
    expect(seedFromText('-1')).toBe(4294967295);
    expect(seedFromText('4294967297')).toBe(1);
    expect(seedFromText('')).toBeNull();
    expect(seedFromText('   ')).toBeNull();
    const text = seedFromText('Bärenhöhle');
    expect(text).toBe(seedFromText('Bärenhöhle'));
    expect(text).toBe(seedFromText('  Bärenhöhle '));
    expect(Number.isInteger(text) && (text as number) >= 0 && (text as number) <= 0xffffffff).toBe(
      true,
    );
    expect(seedFromText('castle')).not.toBe(seedFromText('Castle'));
    expect(seedFromText('1.5')).not.toBeNull();
    // Too long for an exact number: hashed like any other text.
    expect(seedFromText('12345678901234567890')).toBe(seedFromText('12345678901234567890'));
  });

  it('makes ids that pass the id check', () => {
    const id = makeWorldId(1_700_000_000_000, 0xffffffff, 0);
    expect(isWorldId(id)).toBe(true);
    expect(makeWorldId(1_700_000_000_000, 1, 2)).not.toBe(makeWorldId(1_700_000_000_000, 2, 1));
    expect(isWorldId('')).toBe(false);
    expect(isWorldId('a|b')).toBe(false);
    expect(isWorldId(5)).toBe(false);
  });
});

describe('listEntries', () => {
  it('lists playable worlds by last play and keeps the others at the end', () => {
    const old = encodeMeta(sampleMeta({ id: 'a', name: 'Old', playedMs: 1000 }));
    const recent = encodeMeta(sampleMeta({ id: 'b', name: 'Recent', playedMs: 3000 }));
    const middle = encodeMeta(sampleMeta({ id: 'c', name: 'Middle', playedMs: 2000 }));
    const broken = { id: 'd', name: 'Broken', seed: 'x' };
    const future = { ...old, id: 'e', name: 'Future', formatVersion: 99 };
    const entries = listEntries(
      [old, broken, recent, future, middle, 5],
      ['a', 'd', 'b', 'e', 'c', 'f'],
    );
    expect(entries.map((e) => [e.id, e.status])).toEqual([
      ['b', 'ok'],
      ['c', 'ok'],
      ['a', 'ok'],
      ['d', 'damaged'],
      ['e', 'newer'],
      ['f', 'damaged'],
    ]);
    expect(entries[3]).toEqual({ status: 'damaged', id: 'd', name: 'Broken' });
    expect(entries[4]).toEqual({ status: 'newer', id: 'e', name: 'Future' });
    expect(entries[5]).toEqual({ status: 'damaged', id: 'f', name: null });
  });
});

describe('format 3: the world options (Phase 7 part A)', () => {
  const v2 = (options: unknown): Record<string, unknown> => ({
    ...encodeMeta(sampleMeta()),
    generatorVersion: 2,
    options,
  });

  it('Phase 7 AC1.2: a format 2 record loads as generator 1 and is written back as the current format', () => {
    const { progress: _p, ...format3 } = encodeMeta(sampleMeta());
    const stored = { ...format3, formatVersion: 2 };
    expect('options' in stored).toBe(false);
    const decoded = decodeMeta(stored);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.options).toBeNull();
    expect(decoded.value.generatorVersion).toBe(1);
    expect(decoded.value.formatVersion).toBe(SAVE_FORMAT_VERSION);
    const { progress: _q, ...written } = encodeMeta(decoded.value);
    expect(written.formatVersion).toBe(SAVE_FORMAT_VERSION);
    expect('options' in written).toBe(false);
    expect({ ...written, formatVersion: 2 }).toEqual(stored);
  });

  it('keeps the options of a generator 2 world through encode and decode', () => {
    const meta = sampleMeta({ generatorVersion: 2, options: { terrain: 'flat', trees: 'many' } });
    const record = JSON.parse(JSON.stringify(encodeMeta(meta))) as Record<string, unknown>;
    expect(record.options).toEqual({ terrain: 'flat', trees: 'many' });
    expect(decodeMeta(record)).toEqual({ ok: true, value: meta });
    expect(metaGen(meta)).toEqual({ version: 2, options: { terrain: 'flat', trees: 'many' } });
    expect(metaGen(sampleMeta())).toEqual({ version: 1 });
  });

  it('Phase 7 AC5.2: missing options are damaged, unknown strings newer, options on generator 1 damaged', () => {
    expect(decodeMeta(v2(undefined))).toEqual({ ok: false, error: 'damaged' });
    const { options: _o, ...withoutOptions } = v2(null);
    expect(decodeMeta(withoutOptions)).toEqual({ ok: false, error: 'damaged' });
    expect(decodeMeta(v2(null))).toEqual({ ok: false, error: 'damaged' });
    expect(decodeMeta(v2({ terrain: 'islands', trees: 'few' }))).toEqual({
      ok: false,
      error: 'newer',
    });
    expect(decodeMeta(v2({ terrain: 'flat', trees: 'jungle' }))).toEqual({
      ok: false,
      error: 'newer',
    });
    const v1 = { ...encodeMeta(sampleMeta()), options: { terrain: 'flat', trees: 'few' } };
    expect(decodeMeta(v1)).toEqual({ ok: false, error: 'damaged' });
    expect(decodeMeta({ ...v1, options: null })).toEqual({ ok: false, error: 'damaged' });
    // An older format never had generator 2.
    expect(decodeMeta({ ...v2({ terrain: 'flat', trees: 'few' }), formatVersion: 2 })).toEqual({
      ok: false,
      error: 'damaged',
    });
  });

  it('Phase 7 AC5.2: fuzzed options never throw and never load as something else', () => {
    const rng = mulberry32(77);
    const values: unknown[] = [
      null,
      undefined,
      0,
      1.5,
      '',
      'flat',
      'few',
      'none',
      'x'.repeat(40),
      [],
      {},
      true,
    ];
    const pick = (): unknown => values[randInt(rng, values.length)];
    for (let i = 0; i < 2000; i++) {
      const options =
        randInt(rng, 4) === 0
          ? pick()
          : { terrain: pick(), trees: pick(), ...(randInt(rng, 2) ? { extra: pick() } : {}) };
      const result = decodeMeta(v2(options));
      if (result.ok) {
        const o = options as { terrain: unknown; trees: unknown };
        expect(result.value.options).toEqual({ terrain: o.terrain, trees: o.trees });
      } else {
        expect(['damaged', 'newer']).toContain(result.error);
      }
    }
  });
});
