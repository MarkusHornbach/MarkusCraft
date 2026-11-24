// Guests in the save (Phase 6 part C, format version 2).
import { describe, expect, it } from 'vitest';
import { createPlayerRecord } from '../actions/playerRecord';
import { GUESTS_MAX, SAVE_FORMAT_VERSION } from '../game/config';
import { sampleMeta } from '../testing/sampleWorld';
import { type GuestEntry, decodeMeta, decodeWorld, encodeMeta } from './saveFormat';

// Written by the game as of Phase 3 part A (format version 1).
const PART_A_META =
  '{"id":"wparta-fixture1","name":"Part A world","seed":1337,"mode":"creative","generatorVersion":1,"formatVersion":1,"createdMs":1780000000000,"playedMs":1780000360000,"time":0.31,"pose":{"x":8.5,"y":71,"z":-3.25,"yaw":0.5,"pitch":-0.25},"moveMode":"fly","player":{"slots":[{"item":1,"count":1},{"item":2,"count":1},{"item":3,"count":1},{"item":4,"count":1},{"item":5,"count":1},{"item":6,"count":1},{"item":7,"count":1},{"item":8,"count":1},{"item":9,"count":1},null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],"selectedSlot":7,"breaking":null}}';
// Written by the encoder of the last build before this part (Phase 5 to Phase 6 part B,
// format version 1): a Gathering world with tools, torches and coal.
const PHASE_5_META =
  '{"id":"wp5-fixture001","name":"Phase 5 world","seed":1337,"mode":"gathering","generatorVersion":1,"formatVersion":1,"createdMs":1810000000000,"playedMs":1810000720000,"time":0.45,"pose":{"x":10.5,"y":64,"z":-2.5,"yaw":-1.5,"pitch":0.2},"moveMode":"walk","player":{"slots":[{"item":265,"count":1},{"item":19,"count":14},{"item":4,"count":23},null,null,null,null,null,null,{"item":256,"count":5},null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],"selectedSlot":1,"breaking":null}}';

function guest(n: number, overrides: Partial<GuestEntry> = {}): GuestEntry {
  const record = createPlayerRecord('gathering');
  const slots = [...record.slots];
  slots[0] = { item: 4, count: n + 1 };
  return {
    key: n.toString(16).padStart(32, '0'),
    name: `Guest ${n}`,
    record: { ...record, slots, selectedSlot: n % 9 },
    pose: { x: n + 0.5, y: 60, z: -n - 0.25, yaw: 0.5, pitch: -0.1 },
    moveMode: 'walk',
    lastSeenMs: 1_800_000_000_000 + n * 1000,
    ...overrides,
  };
}

const roundTrip = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe('version 1 worlds (Phase 6 AC8.1)', () => {
  for (const [label, text] of [
    ['Phase 3 part A', PART_A_META],
    ['the last Phase 5 build', PHASE_5_META],
  ] as const) {
    it(`a world of ${label} decodes into the current version without guests, everything else unchanged`, () => {
      const stored = JSON.parse(text) as Record<string, unknown>;
      const decoded = decodeWorld(stored, []);
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) return;
      const { meta } = decoded.value;
      expect(SAVE_FORMAT_VERSION).toBe(5);
      expect(meta.formatVersion).toBe(5);
      expect(meta.options).toBeNull();
      expect(meta.guests).toEqual([]);
      // Format 4 (Phase 8): a fresh book and level 1.
      expect(meta.progress).toEqual({ done: [], counts: [] });
      const { formatVersion: _a, guests: _b, progress: _p, player, ...rest } = encodeMeta(meta);
      const { formatVersion: _c, player: oldPlayer, ...old } = stored;
      expect(rest).toEqual(old);
      expect(player).toEqual({
        ...(oldPlayer as object),
        xp: 0,
        found: [],
        crafted: [],
        track: 0,
      });
    });
  }

  it('a version 2 record without its list of guests is damaged', () => {
    const { guests: _g, ...record } = encodeMeta(sampleMeta());
    expect(decodeMeta(record)).toEqual({ ok: false, error: 'damaged' });
  });
});

describe('guests in the save (Phase 6 AC8.2)', () => {
  it('encode → decode keeps every guest', () => {
    const guests = [guest(1), guest(2, { moveMode: 'fly', name: 'Bo (2)' }), guest(3)];
    const decoded = decodeMeta(roundTrip(encodeMeta(sampleMeta({ guests }))));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    // Newest first.
    expect(decoded.value.guests).toEqual([...guests].reverse());
  });

  it('drops guests that do not check out without making the world damaged', () => {
    const good = guest(1);
    const record = encodeMeta(sampleMeta({ guests: [good] }));
    const bad: unknown[] = [
      null,
      5,
      { ...(roundTrip(good) as object), key: 'not-a-key' },
      { ...(roundTrip(good) as object), key: 'A'.repeat(32) },
      { ...(roundTrip(good) as object), name: 7 },
      { ...(roundTrip(good) as object), name: 'x'.repeat(65) },
      { ...(roundTrip(good) as object), record: { slots: [], selectedSlot: 0, breaking: null } },
      { ...(roundTrip(good) as object), pose: { x: 1, y: 2, z: 3, yaw: 9, pitch: 0 } },
      { ...(roundTrip(good) as object), pose: { x: Number.NaN, y: 2, z: 3, yaw: 0, pitch: 0 } },
      { ...(roundTrip(good) as object), moveMode: 'swim' },
      { ...(roundTrip(good) as object), lastSeenMs: -1 },
    ];
    const decoded = decodeMeta({ ...record, guests: [...(record.guests as unknown[]), ...bad] });
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.guests).toEqual([good]);
  });

  it(`keeps the newest ${GUESTS_MAX} guests, one per key`, () => {
    const many = Array.from({ length: 40 }, (_, i) => guest(i + 1));
    // An older entry of a key that is listed again does not count twice.
    const older = guest(40, { lastSeenMs: 5, name: 'Old name' });
    const encoded = encodeMeta(sampleMeta({ guests: [older, ...many] }));
    expect((encoded.guests as unknown[]).length).toBe(GUESTS_MAX);
    const decoded = decodeMeta(roundTrip(encoded));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.guests.map((g) => g.name)).toEqual(
      many
        .slice(-GUESTS_MAX)
        .reverse()
        .map((g) => g.name),
    );
    // More than the limit in a stored record (not written by the game) also loads.
    const loaded = decodeMeta(roundTrip({ ...encoded, guests: many }));
    expect(loaded.ok && loaded.value.guests.length).toBe(GUESTS_MAX);
  });
});
