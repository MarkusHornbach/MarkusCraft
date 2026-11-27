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
  {
    t: 'action',
    seq: 8,
    action: {
      kind: 'chestMove',
      x: 1,
      y: 2,
      z: 3,
      from: 4,
      fromChest: true,
      to: 35,
      toChest: false,
      item: 3,
    },
  },
  {
    t: 'action',
    seq: 9,
    action: { kind: 'quickMove', x: 1, y: 2, z: 3, slot: 0, fromChest: false, item: 7 },
  },
  { t: 'action', seq: 10, action: { kind: 'takeAll', x: 1, y: 2, z: 3 } },
  { t: 'action', seq: 11, action: { kind: 'openChest', x: 1, y: 2, z: 3 } },
  { t: 'action', seq: 12, action: { kind: 'closeChest' } },
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
    generatorVersion: 2,
    options: { terrain: 'flat', trees: 'many' },
    mode: 'gathering',
    checksum: 123456789,
    time: 0.25,
    frozen: true,
    players: [{ id: 1, name: 'Ben', slot: 0, look: 1, host: true, pose: POSE }],
    record: { ...RECORD, breaking: { x: 1, y: 2, z: 3, startMs: 40 } },
    pose: POSE,
    moveMode: 'fly',
    parts: 3,
    progress: { done: [1, 2], counts: [{ task: 3, count: 7 }] },
  },
  { t: 'snapshot', part: 0, chunks: [[-1, 2, [0, 1, 32767, 19]]], states: [] },
  {
    t: 'snapshot',
    part: 1,
    chunks: [],
    states: [
      [-1, 2, 300, 'chest', [0, 3, 64, 26, 9999, 1]],
      [4, 4, 0, 'chest', []],
    ],
  },
  { t: 'chest', x: -4, y: 70, z: 9, slots: [0, 3, 12, 5, 0, 0] },
  { t: 'chest', x: -4, y: 70, z: 9, slots: [] },
  { t: 'chest', x: -4, y: 70, z: 9, gone: true },
  { t: 'viewers', x: -4, y: 70, z: 9, ids: [1, 3] },
  { t: 'viewers', x: -4, y: 70, z: 9, ids: [] },
  { t: 'result', seq: 9, ok: false, reason: 'notEmpty' },
  { t: 'ready' },
  { t: 'result', seq: 3, ok: true, notices: [{ item: 3, count: 1 }] },
  { t: 'result', seq: 4, ok: false, reason: 'reach' },
  { t: 'result', seq: 5, ok: false, reason: 'rate' },
  { t: 'result', seq: 6, ok: false, reason: 'locked' },
  { t: 'record', record: { ...RECORD, xp: 120, found: [16], crafted: [1, 4] } },
  {
    t: 'progress',
    progress: { done: [1, 2, 3], counts: [{ task: 4, count: 2 }] },
    done: [{ task: 3, by: 'Anna (2)' }],
  },
  { t: 'progress', progress: { done: [], counts: [] }, done: [] },
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

  it('Phase 7 AC5.3: welcome carries the world options, validated like the save', () => {
    const welcome = HOST.find((m) => m.t === 'welcome');
    const decode = (options: unknown) => decodeHostMessage(JSON.stringify({ ...welcome, options }));
    const classic = decode(null);
    expect(classic.ok && classic.message.t === 'welcome' && classic.message.options).toBeNull();
    for (const options of [
      undefined,
      {},
      'flat',
      { terrain: 'flat' },
      { terrain: 'islands', trees: 'few' },
      { terrain: 'flat', trees: 3 },
    ]) {
      expect(decode(options).ok, JSON.stringify(options)).toBe(false);
    }
  });

  it('Phase 8 AC8.3: refuses malformed progress messages and welcome.progress', () => {
    const book = { done: [1], counts: [{ task: 2, count: 3 }] };
    const message = (progress: unknown, done: unknown = []): string =>
      JSON.stringify({ t: 'progress', progress, done });
    expect(bad(message(book, [{ task: 1, by: 'Anna' }]), false)).toBe(false);
    const badBooks: unknown[] = [
      undefined,
      null,
      [],
      { done: [1] },
      { done: [1, 1], counts: [] },
      { done: [0], counts: [] },
      { done: [1.5], counts: [] },
      { done: ['1'], counts: [] },
      { done: [], counts: [{ task: 2, count: 0 }] },
      { done: [], counts: [{ task: 2, count: 1_000_001 }] },
      {
        done: [],
        counts: [
          { task: 2, count: 1 },
          { task: 2, count: 2 },
        ],
      },
      { done: [], counts: [{ task: 70_000, count: 1 }] },
      { done: Array.from({ length: 1025 }, (_, i) => i + 1), counts: [] },
    ];
    for (const progress of badBooks) expect(bad(message(progress), false)).toBe(true);
    const badDone: unknown[] = [
      null,
      {},
      [{ task: 1 }],
      [{ task: 0, by: 'Anna' }],
      [{ task: 1, by: '' }],
      [{ task: 1, by: 'n'.repeat(40) }],
      [{ task: 1, by: 5 }],
      [null],
      Array.from({ length: 1025 }, () => ({ task: 1, by: 'A' })),
    ];
    for (const done of badDone) expect(bad(message(book, done), false)).toBe(true);
    expect(bad(JSON.stringify({ t: 'progress', progress: book }), false)).toBe(true);
    const welcome = HOST.find((m) => m.t === 'welcome');
    const withBook = (progress: unknown) => JSON.stringify({ ...welcome, progress });
    expect(bad(withBook(book), false)).toBe(false);
    for (const progress of badBooks) expect(bad(withBook(progress), false)).toBe(true);
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

  it('Phase 8B3a AC3.4: refuses malformed chest messages', () => {
    const chest = (fields: Record<string, unknown>): boolean =>
      bad(JSON.stringify({ t: 'chest', x: 1, y: 70, z: 2, ...fields }), false);
    expect(chest({ slots: [0, 3, 1] })).toBe(false);
    expect(chest({})).toBe(true);
    expect(chest({ slots: [0, 3] })).toBe(true);
    expect(chest({ slots: [27, 3, 1] })).toBe(true);
    expect(chest({ slots: [-1, 3, 1] })).toBe(true);
    expect(chest({ slots: [0, 3, 1, 0, 4, 1] })).toBe(true);
    expect(chest({ slots: [0, 0, 1] })).toBe(true);
    expect(chest({ slots: [0, 3, 0] })).toBe(true);
    expect(chest({ slots: [0, 3, 100] })).toBe(true);
    expect(chest({ slots: [0, 65536, 1] })).toBe(true);
    expect(chest({ slots: [0, 3, 1.5] })).toBe(true);
    expect(chest({ slots: 'all' })).toBe(true);
    expect(chest({ gone: false })).toBe(true);
    expect(chest({ gone: true, slots: [] })).toBe(true);
    expect(chest({ y: 128, slots: [] })).toBe(true);
    expect(chest({ x: 2 ** 31, slots: [] })).toBe(true);
    expect(chest({ slots: new Array(28 * 3).fill(1) })).toBe(true);
  });

  it('Phase 8B3a AC3.4: refuses malformed viewers messages', () => {
    const viewers = (fields: Record<string, unknown>): boolean =>
      bad(JSON.stringify({ t: 'viewers', x: 1, y: 70, z: 2, ids: [1], ...fields }), false);
    expect(viewers({})).toBe(false);
    expect(viewers({ ids: [1, 1] })).toBe(true);
    expect(viewers({ ids: [1, 2, 3, 4, 5] })).toBe(true);
    expect(viewers({ ids: [-1] })).toBe(true);
    expect(viewers({ ids: [1.5] })).toBe(true);
    expect(viewers({ ids: ['1'] })).toBe(true);
    expect(viewers({ ids: null })).toBe(true);
    expect(viewers({ ids: undefined })).toBe(true);
    expect(viewers({ x: '1' })).toBe(true);
    expect(viewers({ y: -1 })).toBe(true);
    expect(viewers({ z: Number.NaN })).toBe(true);
    expect(viewers({ y: 1.5 })).toBe(true);
  });

  it('Phase 8B3a AC3.4: refuses malformed snapshot states', () => {
    const snapshot = (states: unknown): boolean =>
      bad(JSON.stringify({ t: 'snapshot', part: 0, chunks: [], states }), false);
    expect(snapshot([[0, 0, 5, 'chest', [0, 3, 1]]])).toBe(false);
    expect(bad(JSON.stringify({ t: 'snapshot', part: 0, chunks: [] }), false)).toBe(true);
    expect(snapshot('x')).toBe(true);
    expect(snapshot([[0, 0, 5, 'chest']])).toBe(true);
    expect(snapshot([[0, 0, -1, 'chest', []]])).toBe(true);
    expect(snapshot([[0, 0, 32768, 'chest', []]])).toBe(true);
    expect(snapshot([[0.5, 0, 5, 'chest', []]])).toBe(true);
    expect(snapshot([[2 ** 30, 0, 5, 'chest', []]])).toBe(true);
    expect(snapshot([[0, 0, 5, 'furnace', []]])).toBe(true);
    expect(snapshot([[0, 0, 5, 'chest', [27, 3, 1]]])).toBe(true);
    expect(snapshot([[0, 0, 5, 'chest', [0, 3, 0]]])).toBe(true);
    expect(snapshot([[0, 0, 5, 'chest', [0, 3, 1, 0, 3, 1]]])).toBe(true);
    expect(snapshot([[0, 0, 5, 'chest', [0, 0, 1]]])).toBe(true);
  });

  it('Phase 8B3a AC3.4: refuses malformed chest actions', () => {
    const action = (a: Record<string, unknown>): boolean =>
      bad(JSON.stringify({ t: 'action', seq: 1, action: a }));
    const move = {
      kind: 'chestMove',
      x: 1,
      y: 2,
      z: 3,
      from: 0,
      fromChest: true,
      to: 1,
      toChest: false,
      item: 3,
    };
    expect(action(move)).toBe(false);
    expect(action({ ...move, fromChest: 'yes' })).toBe(true);
    expect(action({ ...move, toChest: 0 })).toBe(true);
    expect(action({ ...move, from: 36 })).toBe(true);
    expect(action({ ...move, to: -1 })).toBe(true);
    expect(action({ ...move, item: 0 })).toBe(true);
    expect(action({ ...move, item: 65536 })).toBe(true);
    expect(action({ ...move, extra: 1 })).toBe(true);
    const quick = { kind: 'quickMove', x: 1, y: 2, z: 3, slot: 0, fromChest: true, item: 3 };
    expect(action(quick)).toBe(false);
    expect(action({ ...quick, slot: 1.5 })).toBe(true);
    expect(action({ ...quick, fromChest: undefined })).toBe(true);
    expect(action({ kind: 'takeAll', x: 1, y: 2 })).toBe(true);
    expect(action({ kind: 'openChest', x: 1, y: 2, z: 'z' })).toBe(true);
    expect(action({ kind: 'closeChest', slot: 1 })).toBe(true);
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
      '"progress"',
      '"done"',
      '"counts"',
      '"chest"',
      '"viewers"',
      '"states"',
      '"slots"',
      '"gone"',
      '"ids"',
      '"snapshot"',
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
