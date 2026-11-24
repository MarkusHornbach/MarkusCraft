// The multiplayer protocol (Phase 6 part B): message types, encoding and a validating
// decoder for each direction. Decoding never throws.
import { type Action, COORD_LIMIT, decodeAction } from '../actions/actions';
import type { Notice, RejectReason } from '../actions/apply';
import { GAME_MODES, type GameMode, type PlayerRecord } from '../actions/playerRecord';
import {
  CHUNK_VOLUME,
  MAX_MESSAGE_BYTES,
  MAX_PITCH,
  NET_MAX_PLAYERS,
  PLAYER_NAME_MAX,
  POSE_LIMIT_XZ,
  POSE_MAX_Y,
  POSE_MIN_Y,
  WORLD_HEIGHT,
  WORLD_NAME_MAX,
} from '../game/config';
import { LOOK_COUNT } from '../player/looks';
import type { MoveMode } from '../player/player';
import type { WorldProgress } from '../progress/progress';
import { decodePlayer, decodeProgress, encodePlayer } from '../save/saveFormat';
import { type WorldOptions, decodeWorldOptions } from '../world/generation/worldOptions';
import { isPlayerKey } from './roomCode';

/** Position of a player's feet centre and where it looks. */
export interface NetPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

/**
 * A player as the others know it. `id` is given by the host; `slot` is the colour (0–3);
 * `look` the figure's look (1–8, Part D).
 */
export interface PlayerInfo {
  id: number;
  name: string;
  slot: number;
  look: number;
  host: boolean;
  pose: NetPose;
}

export type JoinReject = 'full' | 'build' | 'duplicate' | 'closed';
export type LeftReason = 'leave' | 'lost';

/** One chunk's edits in a snapshot part: chunk coordinates and pairs (index, id, …). */
export type SnapshotChunk = [cx: number, cz: number, pairs: number[]];

export interface RoomInfo {
  hostName: string;
  worldName: string;
  mode: GameMode;
  players: number;
  max: number;
}

export interface Welcome {
  t: 'welcome';
  id: number;
  slot: number;
  /** The guest's name as the room uses it (perhaps with a suffix). */
  name: string;
  worldName: string;
  seed: number;
  generatorVersion: number;
  /** The world options of generator 2, null for generator 1 (Phase 7 part A). */
  options: WorldOptions | null;
  mode: GameMode;
  checksum: number;
  time: number;
  frozen: boolean;
  /** The other players. */
  players: PlayerInfo[];
  record: PlayerRecord;
  pose: NetPose;
  /** Walking or flying at the start (a returning guest as it left; Part C). */
  moveMode: MoveMode;
  /** Number of snapshot parts that follow. */
  parts: number;
  /** The world's task book (Phase 8 part A2; empty in Creative). */
  progress: WorldProgress;
}

/** A task the last change finished, and the name of the player whose action did it. */
export interface TaskDoneBy {
  task: number;
  by: string;
}

/**
 * A pose as relayed: with the player's id, whether it jumped there, flies, and holds break
 * on a block (Part D).
 */
export interface RelayedPose extends NetPose {
  id: number;
  tp: boolean;
  fly: boolean;
  busy: boolean;
}

export type GuestMessage =
  | { t: 'info' }
  | { t: 'hello'; build: string; key: string; name: string; look: number }
  | { t: 'action'; seq: number; action: Action }
  | ({ t: 'pose'; tp: boolean; fly: boolean; busy: boolean } & NetPose)
  | { t: 'profile'; name: string; look: number }
  /** `rtt`: the guest's last round trip (Part E), shown on the host's debug overlay. */
  | { t: 'ping'; ts: number; rtt?: number }
  | { t: 'bye' };

export type ResultMessage =
  | { t: 'result'; seq: number; ok: true; notices: Notice[] }
  | { t: 'result'; seq: number; ok: false; reason: RejectReason };

export type HostMessage =
  | ({ t: 'info' } & RoomInfo)
  | { t: 'reject'; reason: JoinReject }
  | Welcome
  | { t: 'snapshot'; part: number; chunks: SnapshotChunk[] }
  | { t: 'ready' }
  | ResultMessage
  | { t: 'record'; record: PlayerRecord }
  /** The world's task book changed (Phase 8 part A2), with the tasks that change finished. */
  | { t: 'progress'; progress: WorldProgress; done: TaskDoneBy[] }
  | { t: 'blocks'; by: number; changes: number[] }
  | { t: 'poses'; poses: RelayedPose[] }
  | { t: 'joined'; id: number; name: string; slot: number; look: number }
  | { t: 'profile'; id: number; name: string; look: number }
  | { t: 'left'; id: number; reason: LeftReason }
  | { t: 'pong'; ts: number; time: number; frozen: boolean }
  | { t: 'bye' };

export type Decoded<T> = { ok: true; message: T } | { ok: false; error: string };

/**
 * A pose with its numbers cut to what a figure shows: millimetres and a tenth of a
 * milliradian. The relayed poses are most of a room's traffic (AC14.6).
 */
export function compactPose(p: NetPose): NetPose {
  return {
    x: Math.round(p.x * 1000) / 1000,
    y: Math.round(p.y * 1000) / 1000,
    z: Math.round(p.z * 1000) / 1000,
    yaw: Math.round(p.yaw * 10_000) / 10_000,
    pitch: Math.round(p.pitch * 10_000) / 10_000,
  };
}

/** Text of a message. Records travel in the save format's encoding. */
export function encodeMessage(message: GuestMessage | HostMessage): string {
  if (message.t === 'welcome') {
    return JSON.stringify({ ...message, record: encodePlayer(message.record) });
  }
  if (message.t === 'record')
    return JSON.stringify({ t: 'record', record: encodePlayer(message.record) });
  if (message.t === 'poses') {
    // Most of a room's traffic: flags that are false are left out (AC14.6).
    return JSON.stringify({
      t: 'poses',
      poses: message.poses.map(({ tp, fly, busy, ...rest }) => ({
        ...rest,
        ...(tp ? { tp } : {}),
        ...(fly ? { fly } : {}),
        ...(busy ? { busy } : {}),
      })),
    });
  }
  return JSON.stringify(message);
}

// --- field checks ----------------------------------------------------------------------

class Invalid extends Error {}

function fail(why: string): never {
  throw new Invalid(why);
}

type Fields = Record<string, unknown>;

function int(m: Fields, key: string, min: number, max: number): number {
  const v = m[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) fail(key);
  return v;
}

/** A boolean that is false when left out. */
function flag(m: Fields, key: string): boolean {
  return m[key] === undefined ? false : bool(m, key);
}

function num(m: Fields, key: string, min: number, max: number): number {
  const v = m[key];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(key);
  return v;
}

function bool(m: Fields, key: string): boolean {
  const v = m[key];
  if (typeof v !== 'boolean') fail(key);
  return v;
}

function str(m: Fields, key: string, maxLength: number, minLength = 0): string {
  const v = m[key];
  if (typeof v !== 'string' || v.length > maxLength || v.length < minLength) fail(key);
  return v;
}

/** World options as the save validates them; null for generator 1. */
function worldOptions(value: unknown): WorldOptions | null {
  if (value === null) return null;
  const decoded = decodeWorldOptions(value);
  if (!decoded.ok) fail('options');
  return decoded.options;
}

function obj(value: unknown, what: string): Fields {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(what);
  return value as Fields;
}

function arr(m: Fields, key: string, maxLength: number): unknown[] {
  const v = m[key];
  if (!Array.isArray(v) || v.length > maxLength) fail(key);
  return v;
}

function mode(m: Fields): GameMode {
  const found = GAME_MODES.find((g) => g === m.mode);
  if (!found) fail('mode');
  return found;
}

/** Names may carry a suffix (" (2)") on top of their 16 characters. */
const NAME_LENGTH = PLAYER_NAME_MAX + 8;
const BUILD_LENGTH = 40;
const ID_MAX = 0x7fffffff;
const TIME_MAX = 8.64e15;
/** A round trip longer than a minute is no round trip. */
const RTT_MAX = 60_000;

/**
 * A pose: finite numbers. Whether it lies inside the world is the host's rule
 * (`validPose`), which drops a pose outside without counting it as a protocol error.
 */
function pose(m: Fields): NetPose {
  return {
    x: num(m, 'x', -1e12, 1e12),
    y: num(m, 'y', -1e12, 1e12),
    z: num(m, 'z', -1e12, 1e12),
    yaw: num(m, 'yaw', -1e6, 1e6),
    pitch: num(m, 'pitch', -1e6, 1e6),
  };
}

/** The host's bounds for poses; pitch is clamped rather than refused. */
export function validPose(p: NetPose): NetPose | null {
  if (Math.abs(p.x) > POSE_LIMIT_XZ || Math.abs(p.z) > POSE_LIMIT_XZ) return null;
  if (p.y < POSE_MIN_Y || p.y > POSE_MAX_Y) return null;
  return { ...p, pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p.pitch)) };
}

function look(m: Fields): number {
  return int(m, 'look', 1, LOOK_COUNT);
}

function playerInfo(value: unknown): PlayerInfo {
  const m = obj(value, 'player');
  return {
    id: int(m, 'id', 0, ID_MAX),
    name: str(m, 'name', NAME_LENGTH, 1),
    slot: int(m, 'slot', 0, NET_MAX_PLAYERS - 1),
    look: look(m),
    host: bool(m, 'host'),
    pose: pose(obj(m.pose, 'pose')),
  };
}

function record(value: unknown): PlayerRecord {
  const decoded = decodePlayer(value);
  if (!decoded) fail('record');
  return decoded;
}

function progress(value: unknown): WorldProgress {
  const decoded = decodeProgress(value);
  if (!decoded) fail('progress');
  return decoded;
}

/** At most every task of a book (the save format's limit of a done list). */
const TASKS_MAX = 1024;

function parse(text: unknown): Fields {
  if (typeof text !== 'string') fail('not text');
  if (text.length > MAX_MESSAGE_BYTES) fail('too long');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail('not JSON');
  }
  return obj(value, 'not an object');
}

function run<T>(decode: () => T): Decoded<T> {
  try {
    return { ok: true, message: decode() };
  } catch (error) {
    return { ok: false, error: error instanceof Invalid ? error.message : 'unreadable' };
  }
}

const REJECT_REASONS: readonly RejectReason[] = [
  'reach',
  'unbreakable',
  'occupied',
  'full',
  'early',
  'missing',
  'station',
  'support',
  'mode',
  'rate',
  'locked',
  'invalid',
];

// --- decoders --------------------------------------------------------------------------

/** A message that a guest sent to the host. */
export function decodeGuestMessage(text: unknown): Decoded<GuestMessage> {
  return run<GuestMessage>(() => {
    const m = parse(text);
    switch (m.t) {
      case 'info':
        return { t: 'info' };
      case 'bye':
        return { t: 'bye' };
      case 'hello': {
        const key = m.key;
        if (!isPlayerKey(key)) fail('key');
        return {
          t: 'hello',
          build: str(m, 'build', BUILD_LENGTH, 1),
          key,
          name: str(m, 'name', 64),
          look: look(m),
        };
      }
      case 'profile':
        return { t: 'profile', name: str(m, 'name', 64), look: look(m) };
      case 'action': {
        const action = decodeAction(m.action);
        if (!action.ok) fail(`action: ${action.error}`);
        return { t: 'action', seq: int(m, 'seq', 0, ID_MAX), action: action.action };
      }
      case 'pose':
        return {
          t: 'pose',
          ...pose(m),
          tp: bool(m, 'tp'),
          fly: bool(m, 'fly'),
          busy: bool(m, 'busy'),
        };
      case 'ping':
        return {
          t: 'ping',
          ts: num(m, 'ts', -TIME_MAX, TIME_MAX),
          ...(m.rtt === undefined ? {} : { rtt: num(m, 'rtt', 0, RTT_MAX) }),
        };
      default:
        return fail('unknown type');
    }
  });
}

/** A message that the host sent to a guest. */
export function decodeHostMessage(text: unknown): Decoded<HostMessage> {
  return run<HostMessage>(() => {
    const m = parse(text);
    switch (m.t) {
      case 'info':
        return {
          t: 'info',
          hostName: str(m, 'hostName', NAME_LENGTH, 1),
          worldName: str(m, 'worldName', WORLD_NAME_MAX, 1),
          mode: mode(m),
          players: int(m, 'players', 0, NET_MAX_PLAYERS),
          max: int(m, 'max', 1, NET_MAX_PLAYERS),
        };
      case 'reject': {
        const reason = (['full', 'build', 'duplicate', 'closed'] as const).find(
          (r) => r === m.reason,
        );
        if (!reason) fail('reason');
        return { t: 'reject', reason };
      }
      case 'welcome':
        return {
          t: 'welcome',
          id: int(m, 'id', 0, ID_MAX),
          slot: int(m, 'slot', 0, NET_MAX_PLAYERS - 1),
          name: str(m, 'name', NAME_LENGTH, 1),
          worldName: str(m, 'worldName', WORLD_NAME_MAX, 1),
          seed: int(m, 'seed', 0, 0xffffffff),
          generatorVersion: int(m, 'generatorVersion', 1, 0xffff),
          options: worldOptions(m.options),
          mode: mode(m),
          checksum: int(m, 'checksum', 0, 0xffffffff),
          time: num(m, 'time', 0, 1),
          frozen: bool(m, 'frozen'),
          players: arr(m, 'players', NET_MAX_PLAYERS).map(playerInfo),
          record: record(m.record),
          pose: pose(obj(m.pose, 'pose')),
          moveMode:
            m.moveMode === 'fly' ? 'fly' : m.moveMode === 'walk' ? 'walk' : fail('moveMode'),
          parts: int(m, 'parts', 0, ID_MAX),
          progress: progress(m.progress),
        };
      case 'snapshot': {
        const chunks = arr(m, 'chunks', MAX_MESSAGE_BYTES).map((value): SnapshotChunk => {
          if (!Array.isArray(value) || value.length !== 3) fail('chunk');
          const [cx, cz, pairs] = value as unknown[];
          const c = { cx, cz };
          const limit = COORD_LIMIT >> 4;
          const out: SnapshotChunk = [
            int(c, 'cx', -limit - 1, limit),
            int(c, 'cz', -limit - 1, limit),
            [],
          ];
          if (!Array.isArray(pairs) || pairs.length % 2 !== 0) fail('pairs');
          for (let i = 0; i < pairs.length; i += 2) {
            const p = { index: pairs[i] as unknown, id: pairs[i + 1] as unknown };
            out[2].push(int(p, 'index', 0, CHUNK_VOLUME - 1), int(p, 'id', 0, 255));
          }
          return out;
        });
        return { t: 'snapshot', part: int(m, 'part', 0, ID_MAX), chunks };
      }
      case 'ready':
        return { t: 'ready' };
      case 'result': {
        const seq = int(m, 'seq', 0, ID_MAX);
        if (bool(m, 'ok')) {
          const notices = arr(m, 'notices', 16).map((value) => {
            const n = obj(value, 'notice');
            return { item: int(n, 'item', 1, 0xffff), count: int(n, 'count', 1, 0xffff) };
          });
          return { t: 'result', seq, ok: true, notices };
        }
        const reason = REJECT_REASONS.find((r) => r === m.reason);
        if (!reason) fail('reason');
        return { t: 'result', seq, ok: false, reason };
      }
      case 'record':
        return { t: 'record', record: record(m.record) };
      case 'progress':
        return {
          t: 'progress',
          progress: progress(m.progress),
          done: arr(m, 'done', TASKS_MAX).map((value) => {
            const d = obj(value, 'done');
            return { task: int(d, 'task', 1, 0xffff), by: str(d, 'by', NAME_LENGTH, 1) };
          }),
        };
      case 'blocks': {
        const changes = arr(m, 'changes', MAX_MESSAGE_BYTES);
        if (changes.length % 4 !== 0 || changes.length === 0) fail('changes');
        const out: number[] = [];
        for (let i = 0; i < changes.length; i += 4) {
          const c = { x: changes[i], y: changes[i + 1], z: changes[i + 2], id: changes[i + 3] };
          out.push(
            int(c, 'x', -COORD_LIMIT, COORD_LIMIT),
            int(c, 'y', 0, WORLD_HEIGHT - 1),
            int(c, 'z', -COORD_LIMIT, COORD_LIMIT),
            int(c, 'id', 0, 255),
          );
        }
        return { t: 'blocks', by: int(m, 'by', 0, ID_MAX), changes: out };
      }
      case 'poses':
        return {
          t: 'poses',
          poses: arr(m, 'poses', NET_MAX_PLAYERS).map((value) => {
            const p = obj(value, 'pose');
            return {
              id: int(p, 'id', 0, ID_MAX),
              ...pose(p),
              tp: flag(p, 'tp'),
              fly: flag(p, 'fly'),
              busy: flag(p, 'busy'),
            };
          }),
        };
      case 'joined':
        return {
          t: 'joined',
          id: int(m, 'id', 0, ID_MAX),
          name: str(m, 'name', NAME_LENGTH, 1),
          slot: int(m, 'slot', 0, NET_MAX_PLAYERS - 1),
          look: look(m),
        };
      case 'profile':
        return {
          t: 'profile',
          id: int(m, 'id', 0, ID_MAX),
          name: str(m, 'name', NAME_LENGTH, 1),
          look: look(m),
        };
      case 'left': {
        const reason = (['leave', 'lost'] as const).find((r) => r === m.reason);
        if (!reason) fail('reason');
        return { t: 'left', id: int(m, 'id', 0, ID_MAX), reason };
      }
      case 'pong':
        return {
          t: 'pong',
          ts: num(m, 'ts', -TIME_MAX, TIME_MAX),
          time: num(m, 'time', 0, 1),
          frozen: bool(m, 'frozen'),
        };
      case 'bye':
        return { t: 'bye' };
      default:
        return fail('unknown type');
    }
  });
}
