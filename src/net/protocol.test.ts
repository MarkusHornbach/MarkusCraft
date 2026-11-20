import { describe, expect, it } from 'vitest';
import { createPlayerRecord } from '../actions/playerRecord';
import { MAX_MESSAGE_BYTES } from '../game/config';
import { mulberry32 } from '../util/rng';
import {
  type GuestMessage,
  type HostMessage,
  decodeGuestMessage,
  decodeHostMessage,
  encodeMessage,
} from './protocol';

const KEY = '0123456789abcdef0123456789abcdef';
const POSE = { x: 1.5, y: 70, z: -3.25, yaw: 0.5, pitch: -0.25 };
const RECORD = { ...createPlayerRecord('creative'), selectedSlot: 3 };

const GUEST: GuestMessage[] = [
  { t: 'info' },
  { t: 'hello', build: 'abc1234', key: KEY, name: 'Anna' },
  { t: 'action', seq: 7, action: { kind: 'place', x: 1, y: 2, z: 3, slot: 4 } },
  { t: 'pose', ...POSE, tp: true },
  { t: 'ping', ts: 1234.5 },
  { t: 'bye' },
];

const HOST: HostMessage[] = [
  { t: 'info', hostName: 'Ben', worldName: 'My world', mode: 'creative', players: 2, max: 4 },
  { t: 'reject', reason: 'duplicate' },
  {
    t: 'welcome',
    id: 2,
    slot: 1,
    name: 'Anna (2)',
    worldName: 'My world',
    seed: 4000000000,
    generatorVersion: 1,
    mode: 'gathering',
    checksum: 123456789,
    time: 0.25,
    frozen: true,
    players: [{ id: 1, name: 'Ben', slot: 0, host: true, pose: POSE }],
    record: { ...RECORD, breaking: { x: 1, y: 2, z: 3, startMs: 40 } },
    pose: POSE,
    parts: 3,
  },
  { t: 'snapshot', part: 0, chunks: [[-1, 2, [0, 1, 32767, 19]]] },
  { t: 'ready' },
  { t: 'result', seq: 3, ok: true, notices: [{ item: 3, count: 1 }] },
  { t: 'result', seq: 4, ok: false, reason: 'reach' },
  { t: 'record', record: RECORD },
  { t: 'blocks', by: 1, changes: [1, 2, 3, 0, -5, 127, 9, 19] },
  { t: 'poses', poses: [{ id: 2, ...POSE, tp: false }] },
  { t: 'joined', id: 3, name: 'Cleo', slot: 2 },
  { t: 'left', id: 3, reason: 'lost' },
  { t: 'pong', ts: 1234.5, time: 0.75, frozen: false },
  { t: 'bye' },
];

describe('protocol (Phase 6 AC3.1)', () => {
  it('every guest message survives encode → decode', () => {
    for (const message of GUEST) {
      expect(decodeGuestMessage(encodeMessage(message))).toEqual({ ok: true, message });
    }
  });

  it('every host message survives encode → decode', () => {
    for (const message of HOST) {
      expect(decodeHostMessage(encodeMessage(message))).toEqual({ ok: true, message });
    }
  });
});

describe('protocol decoder (Phase 6 AC3.2)', () => {
  const bad = (text: string, guest = true): boolean => {
    const result = guest ? decodeGuestMessage(text) : decodeHostMessage(text);
    return !result.ok;
  };

  it('refuses wrong types, NaN, infinities, fractions, long strings, unknown types', () => {
    expect(bad('{"t":"ping","ts":"1"}')).toBe(true);
    expect(bad('{"t":"ping","ts":NaN}')).toBe(true);
    expect(bad('{"t":"ping","ts":1e999}')).toBe(true);
    expect(bad(JSON.stringify({ t: 'ping', ts: Number.NaN }))).toBe(true);
    expect(bad(JSON.stringify({ t: 'pose', ...POSE, x: Infinity, tp: false }))).toBe(true);
    expect(bad(JSON.stringify({ t: 'pose', ...POSE, y: 9999, tp: false }))).toBe(true);
    expect(bad(JSON.stringify({ t: 'pose', ...POSE, tp: 1 }))).toBe(true);
    expect(bad(JSON.stringify({ t: 'hello', build: 'b', key: KEY, name: 'x'.repeat(65) }))).toBe(
      true,
    );
    expect(bad(JSON.stringify({ t: 'hello', build: 'b', key: 'XYZ', name: 'a' }))).toBe(true);
    expect(bad('{"t":"teleport"}')).toBe(true);
    expect(bad('{"t":"teleport"}', false)).toBe(true);
    expect(bad('[]')).toBe(true);
    expect(bad('null')).toBe(true);
    expect(bad('not json')).toBe(true);
    const blocks = (changes: unknown[]): string => JSON.stringify({ t: 'blocks', by: 1, changes });
    expect(bad(blocks([1.5, 2, 3, 4]), false)).toBe(true);
    expect(bad(blocks([1, 200, 3, 4]), false)).toBe(true);
    expect(bad(blocks([1, 2, 3]), false)).toBe(true);
    expect(bad(blocks([1, 2, 3, 256]), false)).toBe(true);
    expect(bad(JSON.stringify({ t: 'joined', id: 1, name: 'n'.repeat(40), slot: 0 }), false)).toBe(
      true,
    );
    expect(bad(JSON.stringify({ t: 'joined', id: 1, name: 'n', slot: 4 }), false)).toBe(true);
    expect(bad(JSON.stringify({ t: 'snapshot', part: 0, chunks: [[0, 0, [1]]] }), false)).toBe(
      true,
    );
    expect(bad(JSON.stringify({ t: 'pong', ts: 1, time: 1.5, frozen: false }), false)).toBe(true);
  });

  it('refuses oversized messages', () => {
    const name = 'a'.repeat(MAX_MESSAGE_BYTES);
    expect(bad(JSON.stringify({ t: 'hello', build: 'b', key: KEY, name }))).toBe(true);
    expect(bad(42 as unknown as string)).toBe(true);
  });

  it('refuses invalid actions and records', () => {
    expect(bad(JSON.stringify({ t: 'action', seq: 1, action: { kind: 'fly' } }))).toBe(true);
    expect(
      bad(JSON.stringify({ t: 'action', seq: 1, action: { kind: 'break', x: 1, y: 2 } })),
    ).toBe(true);
    expect(
      bad(JSON.stringify({ t: 'action', seq: -1, action: { kind: 'selectSlot', slot: 1 } })),
    ).toBe(true);
    expect(bad(JSON.stringify({ t: 'record', record: { slots: [] } }), false)).toBe(true);
    const record = { ...RECORD, selectedSlot: 12 };
    expect(bad(JSON.stringify({ t: 'record', record }), false)).toBe(true);
  });

  it('10 000 seeded random strings are refused without throwing', () => {
    const rng = mulberry32(99);
    const pieces = [
      '{',
      '}',
      '[',
      ']',
      '"t"',
      ':',
      ',',
      '"pose"',
      '"blocks"',
      '1',
      '-',
      'e9',
      'null',
      'true',
      '"',
      'x',
      '0.5',
      '"welcome"',
      '"action"',
    ];
    for (let i = 0; i < 10_000; i++) {
      let text = '';
      const length = Math.floor(rng() * 30);
      for (let j = 0; j < length; j++) {
        text +=
          rng() < 0.5
            ? pieces[Math.floor(rng() * pieces.length)]
            : String.fromCharCode(Math.floor(rng() * 128));
      }
      expect(() => decodeGuestMessage(text)).not.toThrow();
      expect(() => decodeHostMessage(text)).not.toThrow();
      // A random text that happens to be valid must at least decode to a known type.
      const g = decodeGuestMessage(text);
      if (g.ok) expect(['info', 'bye']).toContain(g.message.t);
    }
  });
});
