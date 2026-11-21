import { describe, expect, it } from 'vitest';
import { createPlayerRecord } from '../actions/playerRecord';
import { MAX_MESSAGE_BYTES } from '../game/config';
import { mulberry32 } from '../util/rng';
import {
  compactPose,
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
  { t: 'hello', build: 'abc1234', key: KEY, name: 'Anna', look: 3 },
  { t: 'action', seq: 7, action: { kind: 'place', x: 1, y: 2, z: 3, slot: 4 } },
  { t: 'pose', ...POSE, tp: true, fly: false, busy: false },
  { t: 'pose', ...POSE, tp: false, fly: true, busy: true },
  { t: 'profile', name: 'Anna B', look: 8 },
  { t: 'ping', ts: 1234.5 },
  { t: 'ping', ts: 1234.5, rtt: 12.5 },
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
    players: [{ id: 1, name: 'Ben', slot: 0, look: 1, host: true, pose: POSE }],
    record: { ...RECORD, breaking: { x: 1, y: 2, z: 3, startMs: 40 } },
    pose: POSE,
    moveMode: 'fly',
    parts: 3,
  },
  { t: 'snapshot', part: 0, chunks: [[-1, 2, [0, 1, 32767, 19]]] },
  { t: 'ready' },
  { t: 'result', seq: 3, ok: true, notices: [{ item: 3, count: 1 }] },
  { t: 'result', seq: 4, ok: false, reason: 'reach' },
  { t: 'result', seq: 5, ok: false, reason: 'rate' },
  { t: 'record', record: RECORD },
  { t: 'blocks', by: 1, changes: [1, 2, 3, 0, -5, 127, 9, 19] },
  { t: 'poses', poses: [{ id: 2, ...POSE, tp: false, fly: true, busy: false }] },
  { t: 'joined', id: 3, name: 'Cleo', slot: 2, look: 5 },
  { t: 'profile', id: 3, name: 'Cleo (2)', look: 2 },
  { t: 'left', id: 3, reason: 'lost' },
  { t: 'pong', ts: 1234.5, time: 0.75, frozen: false },
  { t: 'bye' },
];

describe('compactPose (Phase 6 AC14.6)', () => {
  it('cuts positions to millimetres and angles to a tenth of a milliradian', () => {
    expect(
      compactPose({ x: 1.23456789, y: -57.0004, z: 300.0006, yaw: 3.14159265, pitch: -0.12344 }),
    ).toEqual({ x: 1.235, y: -57, z: 300.001, yaw: 3.1416, pitch: -0.1234 });
  });
});

describe('protocol (Phase 6 AC3.1, AC12.1)', () => {
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
    expect(bad('{"t":"ping","ts":1,"rtt":-1}')).toBe(true);
    expect(bad('{"t":"ping","ts":1,"rtt":"5"}')).toBe(true);
    expect(bad('{"t":"ping","ts":1,"rtt":1e9}')).toBe(true);
    expect(bad('{"t":"ping","ts":NaN}')).toBe(true);
    expect(bad('{"t":"ping","ts":1e999}')).toBe(true);
    expect(bad(JSON.stringify({ t: 'ping', ts: Number.NaN }))).toBe(true);
    expect(bad(JSON.stringify({ t: 'pose', ...POSE, x: Infinity, tp: false }))).toBe(true);
    expect(bad(JSON.stringify({ t: 'pose', ...POSE, y: 1e13, tp: false }))).toBe(true);
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

  it('Phase 6 AC12.1: refuses invalid looks, flags and profiles', () => {
    const hello = { t: 'hello', build: 'b', key: KEY, name: 'a' };
    for (const look of [0, 9, 2.5, -1, '3', null]) {
      expect(bad(JSON.stringify({ ...hello, look }))).toBe(true);
      expect(bad(JSON.stringify({ t: 'profile', name: 'a', look }))).toBe(true);
      expect(bad(JSON.stringify({ t: 'joined', id: 1, name: 'n', slot: 0, look }), false)).toBe(
        true,
      );
      expect(bad(JSON.stringify({ t: 'profile', id: 1, name: 'n', look }), false)).toBe(true);
    }
    expect(bad(JSON.stringify(hello))).toBe(true);
    for (const flag of [1, 'true', null]) {
      expect(bad(JSON.stringify({ t: 'pose', ...POSE, tp: false, fly: false, busy: flag }))).toBe(
        true,
      );
      expect(bad(JSON.stringify({ t: 'pose', ...POSE, tp: false, fly: flag, busy: false }))).toBe(
        true,
      );
      const relayed = { id: 2, ...POSE, tp: false, fly: false, busy: false };
      expect(bad(JSON.stringify({ t: 'poses', poses: [{ ...relayed, busy: flag }] }), false)).toBe(
        true,
      );
      expect(bad(JSON.stringify({ t: 'poses', poses: [{ ...relayed, fly: flag }] }), false)).toBe(
        true,
      );
    }
    // Relayed flags that are false are left out of the text and decode as false (AC14.6).
    const compact = encodeMessage({
      t: 'poses',
      poses: [{ id: 2, ...POSE, tp: false, fly: true, busy: false }],
    });
    expect(compact).not.toContain('"tp"');
    expect(compact).not.toContain('"busy"');
    expect(decodeHostMessage(compact)).toEqual({
      ok: true,
      message: { t: 'poses', poses: [{ id: 2, ...POSE, tp: false, fly: true, busy: false }] },
    });
    // Names: a string of at most 64 characters from a guest; 1–24 from the host.
    for (const name of [42, null, 'x'.repeat(65)]) {
      expect(bad(JSON.stringify({ t: 'profile', name, look: 1 }))).toBe(true);
    }
    for (const name of ['', 'x'.repeat(25), 7]) {
      expect(bad(JSON.stringify({ t: 'profile', id: 1, name, look: 1 }), false)).toBe(true);
    }
    const welcomePlayer = { id: 1, name: 'Ben', slot: 0, host: true, pose: POSE };
    const welcome = HOST.find((m) => m.t === 'welcome');
    expect(bad(JSON.stringify({ ...welcome, players: [welcomePlayer] }), false)).toBe(true);
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
      '"profile"',
      '"look"',
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
