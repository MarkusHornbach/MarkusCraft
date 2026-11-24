// Save format 5: the tracked task of player records (Polish 2 AC2.1).
import { describe, expect, it } from 'vitest';
import { SAVE_FORMAT_VERSION } from '../game/config';
import { sampleMeta } from '../testing/sampleWorld';
import { type WorldMeta, decodeMeta, decodePlayer, encodeMeta, encodePlayer } from './saveFormat';

function throughJson<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function tracking(): WorldMeta {
  const meta = sampleMeta({ mode: 'gathering' });
  return {
    ...meta,
    player: { ...meta.player, xp: 40, track: 3 },
    progress: { done: [1], counts: [{ task: 2, count: 12 }] },
    guests: [
      {
        key: 'a'.repeat(32),
        name: 'Anna',
        record: { ...meta.player, track: -1 },
        pose: { ...meta.pose },
        moveMode: 'walk',
        lastSeenMs: 1_700_000_000_000,
      },
    ],
  };
}

/** The stored form of `tracking()` as format 4 wrote it: no `track` anywhere. */
function asFormat4(): Record<string, unknown> {
  const record = encodeMeta(tracking());
  const strip = (player: unknown) => {
    const { track: _t, ...rest } = player as Record<string, unknown>;
    return rest;
  };
  const guests = (record.guests as Record<string, unknown>[]).map((g) => ({
    ...g,
    record: strip(g.record),
  }));
  return { ...record, formatVersion: 4, player: strip(record.player), guests };
}

describe('format 5 (Polish 2 AC2.1)', () => {
  it('Polish 2 AC2.1: round trip of track, the guests too', () => {
    const meta = tracking();
    const record = encodeMeta(meta);
    expect(SAVE_FORMAT_VERSION).toBe(5);
    expect(record.formatVersion).toBe(5);
    expect((record.player as { track: number }).track).toBe(3);
    expect(decodeMeta(throughJson(record))).toEqual({ ok: true, value: meta });
  });

  it('Polish 2 AC2.1: a format 4 world loads with track 0 and is written back as 5', () => {
    const decoded = decodeMeta(throughJson(asFormat4()));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.player.track).toBe(0);
    expect(decoded.value.player.xp).toBe(40);
    expect(decoded.value.guests.map((g) => g.record.track)).toEqual([0]);
    expect(decoded.value.progress).toEqual(tracking().progress);
    const written = encodeMeta(decoded.value);
    expect(written.formatVersion).toBe(5);
    expect((written.player as { track: number }).track).toBe(0);
  });

  it('Polish 2 AC2.1: formats 1–3 load with track 0', () => {
    for (const formatVersion of [1, 2, 3]) {
      const { progress: _p, options: _o, ...old } = asFormat4();
      const meta = sampleMeta({ mode: 'gathering' });
      const record = {
        ...old,
        formatVersion,
        generatorVersion: 1,
        player: { slots: encodePlayer(meta.player).slots, selectedSlot: 0, breaking: null },
        guests: [],
      };
      const decoded = decodeMeta(throughJson(record));
      expect(decoded.ok && decoded.value.player.track).toBe(0);
    }
  });

  it('Polish 2 AC2.1: an unknown task id that is a valid number loads', () => {
    const meta = { ...tracking(), player: { ...tracking().player, track: 65_535 } };
    expect(decodeMeta(throughJson(encodeMeta(meta)))).toEqual({ ok: true, value: meta });
  });

  const good = encodeMeta(tracking());
  const bad: [string, unknown][] = [
    ['a fraction', 1.5],
    ['−2', -2],
    ['65 536', 65_536],
    ['a string', '3'],
    ['missing', undefined],
  ];
  for (const [label, track] of bad) {
    it(`Polish 2 AC2.1: damaged: track ${label}`, () => {
      const record = { ...good, player: { ...(good.player as object), track } };
      expect(decodeMeta(throughJson(record))).toEqual({ ok: false, error: 'damaged' });
      // A network record is refused the same way.
      expect(decodePlayer(throughJson({ ...(good.player as object), track }))).toBeNull();
    });
  }

  it('a guest entry with a bad track is dropped; the world stays whole', () => {
    const guests = (good.guests as Record<string, unknown>[]).map((g) => ({
      ...g,
      record: { ...(g.record as object), track: -2 },
    }));
    const decoded = decodeMeta(throughJson({ ...good, guests }));
    expect(decoded.ok && decoded.value.guests).toEqual([]);
  });
});
