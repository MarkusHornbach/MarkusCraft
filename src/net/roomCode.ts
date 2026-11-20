// Room codes, peer ids of rooms and guests, player names and player keys (Phase 6 part B).
import { PLAYER_NAME_MAX, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../game/config';
import { codeFromBytes, peerPrefix } from './netTest';

/** A room code from random bytes (one per character). */
export function makeRoomCode(bytes: ArrayLike<number>): string {
  return codeFromBytes(bytes, ROOM_CODE_LENGTH);
}

/**
 * A code as a player typed it: upper-cased, spaces and hyphens removed. Null if anything
 * else is left than six characters of the alphabet.
 */
export function normalizeRoomCode(text: string): string | null {
  const code = text.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const c of code) if (!ROOM_CODE_ALPHABET.includes(c)) return null;
  return code;
}

/** The host's peer id: `mc-<build>-r-<CODE>`. */
export function roomPeerId(build: string, code: string): string {
  return `${peerPrefix(build)}r-${code}`;
}

/** The room code in a room id of this build, or null for any other id. */
export function roomCodeOf(id: string, build: string): string | null {
  const prefix = `${peerPrefix(build)}r-`;
  if (!id.startsWith(prefix)) return null;
  return normalizeRoomCode(id.slice(prefix.length)) === id.slice(prefix.length)
    ? id.slice(prefix.length)
    : null;
}

/** The build of a room id of any build (`mc-<build>-r-<CODE>`), with its code; or null. */
export function roomOfAnyBuild(id: string): { build: string; code: string } | null {
  const match = /^mc-([A-Za-z0-9]{1,40})-r-([A-Z0-9]+)$/.exec(id);
  if (!match) return null;
  const code = normalizeRoomCode(match[2]);
  return code === match[2] ? { build: match[1], code } : null;
}

/** A guest's peer id: `mc-<build>-g-<hex>`, from random bytes. */
export function guestPeerId(build: string, bytes: ArrayLike<number>): string {
  return `${peerPrefix(build)}g-${toHex(bytes)}`;
}

function toHex(bytes: ArrayLike<number>): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += (bytes[i] & 0xff).toString(16).padStart(2, '0');
  return hex;
}

/** A player key from 16 random bytes: 32 lower-case hex characters. */
export function playerKeyFromBytes(bytes: ArrayLike<number>): string {
  return toHex(Array.from({ length: 16 }, (_, i) => bytes[i] ?? 0));
}

export function isPlayerKey(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
}

/**
 * A player name as it is used: control characters removed, trimmed, cut to 16
 * characters. Empty names become `Player <4 digits>` with the digits given.
 */
export function normalizePlayerName(text: string, digits: number): string {
  const clean = Array.from(text.replace(/\p{Cc}/gu, '').trim())
    .slice(0, PLAYER_NAME_MAX)
    .join('')
    .trim();
  if (clean.length > 0) return clean;
  return `Player ${String(Math.abs(Math.floor(digits)) % 10000).padStart(4, '0')}`;
}

/** The name, or with the first free suffix " (2)", " (3)", … if it is taken. */
export function uniqueName(name: string, taken: readonly string[]): string {
  const used = new Set(taken);
  if (!used.has(name)) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} (${n})`;
    if (!used.has(candidate)) return candidate;
  }
}
