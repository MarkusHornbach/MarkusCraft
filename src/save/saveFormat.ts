// Save format: a world as plain records (one for the world, one per edited chunk).
// Encoding and decoding are pure; decoding validates every field and never throws.
import { COORD_LIMIT } from '../actions/actions';
import {
  GAME_MODES,
  type GameMode,
  type ItemStack,
  type PlayerRecord,
} from '../actions/playerRecord';
import {
  CHUNK_VOLUME,
  DEFAULT_WORLD_NAME,
  GUESTS_MAX,
  HOTBAR_SLOTS,
  INVENTORY_SLOTS,
  MAX_PITCH,
  SAVE_FORMAT_VERSION,
  STACK_SIZE,
  WORLD_HEIGHT,
  WORLD_NAME_MAX,
} from '../game/config';
import type { MoveMode } from '../player/player';
import { chunkKey } from '../world/chunk';
import { type WorldGen, worldGenOf } from '../world/generation/worldOptions';

export interface SavedPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

/**
 * A player who played in this world as a guest (format version 2): kept by the host so
 * that the player finds its items and its place again. `key` is the guest's player key.
 */
export interface GuestEntry {
  key: string;
  name: string;
  record: PlayerRecord;
  pose: SavedPose;
  moveMode: MoveMode;
  /** Wall-clock time (milliseconds since 1970) the host last heard of the guest. */
  lastSeenMs: number;
}

/** Everything about a world except its edited blocks. */
export interface WorldMeta {
  id: string;
  name: string;
  seed: number;
  mode: GameMode;
  generatorVersion: number;
  formatVersion: number;
  /** Wall-clock times (milliseconds since 1970) of creation and of the last save. */
  createdMs: number;
  playedMs: number;
  /** Time of day, 0..1. */
  time: number;
  pose: SavedPose;
  moveMode: MoveMode;
  player: PlayerRecord;
  /** Guests of the world, at most `GUESTS_MAX` (empty for worlds never opened to others). */
  guests: GuestEntry[];
}

/** The generator of a decoded world. Decoding guarantees that version and options fit. */
export function metaGen(meta: WorldMeta): WorldGen {
  const gen = worldGenOf(meta.generatorVersion, null);
  if (!gen) throw new Error(`World ${meta.id} has an unknown generator`);
  return gen;
}

/** Edits of all chunks of a world: chunk key → (block index → block id), as in `World`. */
export type WorldEdits = Map<string, Map<number, number>>;

/** Stored form of one chunk's edits. `edits` holds pairs: block index, block id, … */
export interface ChunkRecord {
  /** Primary key: world id and chunk coordinates. */
  key: string;
  worldId: string;
  cx: number;
  cz: number;
  edits: number[];
}

export type DecodeError = 'damaged' | 'newer';
export type Decoded<T> = { ok: true; value: T } | { ok: false; error: DecodeError };

const damaged: Decoded<never> = { ok: false, error: 'damaged' };

// --- names, seeds, ids -------------------------------------------------------------

/**
 * A world name as it is stored: control characters removed, trimmed, cut to 24
 * characters; the fallback if nothing is left.
 */
export function normalizeName(text: string, fallback: string = DEFAULT_WORLD_NAME): string {
  const clean = Array.from(text.replace(/\p{Cc}/gu, '').trim())
    .slice(0, WORLD_NAME_MAX)
    .join('')
    .trim();
  return clean.length > 0 ? clean : fallback;
}

/** "My world", then "My world 2", "My world 3", …: the first name not taken yet. */
export function nextWorldName(taken: readonly string[]): string {
  const used = new Set(taken);
  if (!used.has(DEFAULT_WORLD_NAME)) return DEFAULT_WORLD_NAME;
  for (let n = 2; ; n++) {
    const name = `${DEFAULT_WORLD_NAME} ${n}`;
    if (!used.has(name)) return name;
  }
}

/**
 * The seed a player typed: digits are used as the number, any other text is hashed
 * (32-bit FNV-1a over its characters), and empty text gives null (the caller draws a
 * random seed). The same text always gives the same seed.
 */
export function seedFromText(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  // Seeds are unsigned 32-bit integers; larger numbers wrap.
  if (/^-?\d{1,15}$/.test(trimmed)) return Number(trimmed) >>> 0;
  let hash = 0x811c9dc5;
  for (let i = 0; i < trimmed.length; i++) {
    hash ^= trimmed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isWorldId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

/** A world id from two random 32-bit numbers and the creation time (given by the shell). */
export function makeWorldId(nowMs: number, randomA: number, randomB: number): string {
  const part = (n: number): string => (n >>> 0).toString(36);
  return `w${Math.floor(nowMs).toString(36)}-${part(randomA)}${part(randomB)}`;
}

export function chunkRecordKey(worldId: string, cx: number, cz: number): string {
  return `${worldId}|${chunkKey(cx, cz)}`;
}

// --- field checks ------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isFiniteIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

const TIME_LIMIT = 8.64e15; // the range of JavaScript dates

/** Reads a player record (save files and network messages); null if it does not check out. */
export function decodePlayer(value: unknown): PlayerRecord | null {
  if (!isObject(value)) return null;
  if (!Array.isArray(value.slots) || value.slots.length !== INVENTORY_SLOTS) return null;
  const slots: (ItemStack | null)[] = [];
  for (const slot of value.slots as unknown[]) {
    if (slot === null) {
      slots.push(null);
      continue;
    }
    if (!isObject(slot)) return null;
    if (!isInt(slot.item, 1, 0xffff) || !isInt(slot.count, 1, STACK_SIZE)) return null;
    slots.push({ item: slot.item, count: slot.count });
  }
  if (!isInt(value.selectedSlot, 0, HOTBAR_SLOTS - 1)) return null;
  let breaking: PlayerRecord['breaking'] = null;
  if (value.breaking !== null) {
    const b = value.breaking;
    if (!isObject(b)) return null;
    if (!isInt(b.x, -COORD_LIMIT, COORD_LIMIT) || !isInt(b.z, -COORD_LIMIT, COORD_LIMIT))
      return null;
    if (!isInt(b.y, 0, WORLD_HEIGHT - 1) || !isFiniteIn(b.startMs, 0, TIME_LIMIT)) return null;
    breaking = { x: b.x, y: b.y, z: b.z, startMs: b.startMs };
  }
  return { slots, selectedSlot: value.selectedSlot, breaking };
}

// --- world record ------------------------------------------------------------------

/** The plain record of a world, as it is stored. A copy: nothing is shared with `meta`. */
export function encodeMeta(meta: WorldMeta): Record<string, unknown> {
  return {
    id: meta.id,
    name: meta.name,
    seed: meta.seed,
    mode: meta.mode,
    generatorVersion: meta.generatorVersion,
    formatVersion: meta.formatVersion,
    createdMs: meta.createdMs,
    playedMs: meta.playedMs,
    time: meta.time,
    pose: { ...meta.pose },
    moveMode: meta.moveMode,
    player: encodePlayer(meta.player),
    guests: limitGuests(meta.guests).map(encodeGuest),
  };
}

function encodeGuest(guest: GuestEntry): Record<string, unknown> {
  return {
    key: guest.key,
    name: guest.name,
    record: encodePlayer(guest.record),
    pose: { ...guest.pose },
    moveMode: guest.moveMode,
    lastSeenMs: guest.lastSeenMs,
  };
}

/** The newest `GUESTS_MAX` guests, one per key, newest first. */
export function limitGuests(guests: readonly GuestEntry[]): GuestEntry[] {
  const byKey = new Map<string, GuestEntry>();
  for (const guest of guests) {
    const known = byKey.get(guest.key);
    if (!known || known.lastSeenMs < guest.lastSeenMs) byKey.set(guest.key, guest);
  }
  return [...byKey.values()].sort((a, b) => b.lastSeenMs - a.lastSeenMs).slice(0, GUESTS_MAX);
}

/** The plain form of a player record, as stored and as sent over the network. */
export function encodePlayer(player: PlayerRecord): Record<string, unknown> {
  return {
    slots: player.slots.map((slot) => (slot ? { item: slot.item, count: slot.count } : null)),
    selectedSlot: player.selectedSlot,
    breaking: player.breaking ? { ...player.breaking } : null,
  };
}

/**
 * Reads a stored world record. `newer` means it was saved by a later version of the game
 * and must not be opened; `damaged` covers everything else that does not check out.
 */
export function decodeMeta(value: unknown): Decoded<WorldMeta> {
  try {
    if (!isObject(value)) return damaged;
    if (!isWorldId(value.id)) return damaged;
    if (!isInt(value.formatVersion, 1, 0xffff)) return damaged;
    if (value.formatVersion > SAVE_FORMAT_VERSION) return { ok: false, error: 'newer' };
    if (!isInt(value.generatorVersion, 1, 0xffff)) return damaged;
    // Format 2 stores no options: only a generator that needs none can be read.
    if (worldGenOf(value.generatorVersion, null) === null) return { ok: false, error: 'newer' };
    if (typeof value.name !== 'string') return damaged;
    // A stored name is already normal; anything else was not written by the game.
    if (value.name.length === 0 || normalizeName(value.name, '') !== value.name) return damaged;
    if (!isInt(value.seed, 0, 0xffffffff)) return damaged;
    const mode = GAME_MODES.find((m) => m === value.mode);
    if (!mode) return damaged;
    if (!isFiniteIn(value.createdMs, 0, TIME_LIMIT)) return damaged;
    if (!isFiniteIn(value.playedMs, 0, TIME_LIMIT)) return damaged;
    if (!isFiniteIn(value.time, 0, 1) || value.time === 1) return damaged;
    const pose = decodePose(value.pose);
    if (!pose) return damaged;
    if (value.moveMode !== 'walk' && value.moveMode !== 'fly') return damaged;
    const player = decodePlayer(value.player);
    if (!player) return damaged;
    // Version 1 knew no guests. A guest entry that does not check out is dropped: it
    // never makes the world itself damaged.
    let guests: GuestEntry[] = [];
    if (value.formatVersion >= 2) {
      if (!Array.isArray(value.guests)) return damaged;
      guests = limitGuests(
        (value.guests as unknown[])
          .map(decodeGuest)
          .filter((guest): guest is GuestEntry => guest !== null),
      );
    }
    return {
      ok: true,
      value: {
        id: value.id,
        name: value.name,
        seed: value.seed,
        mode,
        generatorVersion: value.generatorVersion,
        // Read records are migrated: saving them again writes the current version.
        formatVersion: SAVE_FORMAT_VERSION,
        createdMs: value.createdMs,
        playedMs: value.playedMs,
        time: value.time,
        pose,
        moveMode: value.moveMode,
        player,
        guests,
      },
    };
  } catch {
    return damaged;
  }
}

function decodePose(value: unknown): SavedPose | null {
  if (!isObject(value)) return null;
  const { x, y, z, yaw, pitch } = value;
  if (!isFiniteIn(x, -COORD_LIMIT, COORD_LIMIT)) return null;
  if (!isFiniteIn(z, -COORD_LIMIT, COORD_LIMIT)) return null;
  if (!isFiniteIn(y, -1000, 100000)) return null;
  if (!isFiniteIn(yaw, -Math.PI, Math.PI)) return null;
  if (!isFiniteIn(pitch, -MAX_PITCH, MAX_PITCH)) return null;
  return { x, y, z, yaw, pitch };
}

const PLAYER_KEY_PATTERN = /^[0-9a-f]{32}$/;
const GUEST_NAME_MAX = 64;

function decodeGuest(value: unknown): GuestEntry | null {
  if (!isObject(value)) return null;
  if (typeof value.key !== 'string' || !PLAYER_KEY_PATTERN.test(value.key)) return null;
  if (typeof value.name !== 'string' || value.name.length > GUEST_NAME_MAX) return null;
  const record = decodePlayer(value.record);
  const pose = decodePose(value.pose);
  if (!record || !pose) return null;
  if (value.moveMode !== 'walk' && value.moveMode !== 'fly') return null;
  if (!isFiniteIn(value.lastSeenMs, 0, TIME_LIMIT)) return null;
  return {
    key: value.key,
    name: value.name,
    record,
    pose,
    moveMode: value.moveMode,
    lastSeenMs: value.lastSeenMs,
  };
}

// --- chunk records -----------------------------------------------------------------

export function encodeChunk(
  worldId: string,
  cx: number,
  cz: number,
  edits: ReadonlyMap<number, number>,
): ChunkRecord {
  const pairs = new Array<number>(edits.size * 2);
  let i = 0;
  for (const [index, id] of edits) {
    pairs[i++] = index;
    pairs[i++] = id;
  }
  return { key: chunkRecordKey(worldId, cx, cz), worldId, cx, cz, edits: pairs };
}

export interface DecodedChunk {
  worldId: string;
  cx: number;
  cz: number;
  edits: Map<number, number>;
}

const CHUNK_COORD_LIMIT = COORD_LIMIT >> 4;

export function decodeChunk(value: unknown): Decoded<DecodedChunk> {
  try {
    if (!isObject(value)) return damaged;
    if (!isWorldId(value.worldId)) return damaged;
    if (!isInt(value.cx, -CHUNK_COORD_LIMIT - 1, CHUNK_COORD_LIMIT)) return damaged;
    if (!isInt(value.cz, -CHUNK_COORD_LIMIT - 1, CHUNK_COORD_LIMIT)) return damaged;
    if (value.key !== chunkRecordKey(value.worldId, value.cx, value.cz)) return damaged;
    const pairs = value.edits;
    if (!Array.isArray(pairs) || pairs.length % 2 !== 0) return damaged;
    if (pairs.length > CHUNK_VOLUME * 2) return damaged;
    const edits = new Map<number, number>();
    for (let i = 0; i < pairs.length; i += 2) {
      const index: unknown = pairs[i];
      const id: unknown = pairs[i + 1];
      if (!isInt(index, 0, CHUNK_VOLUME - 1) || !isInt(id, 0, 255)) return damaged;
      edits.set(index, id);
    }
    // A block index listed twice was not written by the game.
    if (edits.size * 2 !== pairs.length) return damaged;
    return { ok: true, value: { worldId: value.worldId, cx: value.cx, cz: value.cz, edits } };
  } catch {
    return damaged;
  }
}

// --- whole worlds ------------------------------------------------------------------

/** Chunk records for the given chunks of `edits` (all chunks if `keys` is omitted). */
export function encodeChunks(
  worldId: string,
  edits: WorldEdits,
  keys: Iterable<string> = edits.keys(),
): ChunkRecord[] {
  const records: ChunkRecord[] = [];
  for (const key of keys) {
    const chunk = edits.get(key);
    if (!chunk) continue;
    const [cx, cz] = key.split(',').map(Number);
    records.push(encodeChunk(worldId, cx, cz, chunk));
  }
  return records;
}

export interface LoadedWorld {
  meta: WorldMeta;
  edits: WorldEdits;
}

/** Puts a stored world back together; one bad chunk record makes the world damaged. */
export function decodeWorld(meta: unknown, chunks: readonly unknown[]): Decoded<LoadedWorld> {
  const decodedMeta = decodeMeta(meta);
  if (!decodedMeta.ok) return decodedMeta;
  const edits: WorldEdits = new Map();
  for (const record of chunks) {
    const chunk = decodeChunk(record);
    if (!chunk.ok) return chunk;
    if (chunk.value.worldId !== decodedMeta.value.id) return damaged;
    edits.set(chunkKey(chunk.value.cx, chunk.value.cz), chunk.value.edits);
  }
  return { ok: true, value: { meta: decodedMeta.value, edits } };
}

/** One line of the world list. Worlds that cannot be opened are still listed. */
export type WorldListEntry =
  | { status: 'ok'; id: string; meta: WorldMeta }
  | { status: DecodeError; id: string; name: string | null };

/** The world list from the stored world records: playable worlds first, newest first. */
export function listEntries(records: readonly unknown[], ids: readonly string[]): WorldListEntry[] {
  const entries: WorldListEntry[] = [];
  records.forEach((record, i) => {
    const decoded = decodeMeta(record);
    if (decoded.ok) {
      entries.push({ status: 'ok', id: ids[i], meta: decoded.value });
      return;
    }
    let name: string | null = null;
    try {
      const raw = isObject(record) ? record.name : null;
      if (typeof raw === 'string') name = normalizeName(raw, '') || null;
    } catch {
      name = null;
    }
    entries.push({ status: decoded.error, id: ids[i], name });
  });
  const played = (entry: WorldListEntry): number =>
    entry.status === 'ok' ? entry.meta.playedMs : -1;
  // Stable: worlds that cannot be opened keep their stored order at the end.
  return entries.sort((a, b) => played(b) - played(a));
}
