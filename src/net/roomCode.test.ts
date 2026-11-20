import { describe, expect, it } from 'vitest';
import { ROOM_CODE_ALPHABET } from '../game/config';
import { mulberry32 } from '../util/rng';
import {
  guestPeerId,
  isPlayerKey,
  makeRoomCode,
  normalizePlayerName,
  normalizeRoomCode,
  playerKeyFromBytes,
  roomCodeOf,
  roomOfAnyBuild,
  roomPeerId,
  uniqueName,
} from './roomCode';

function bytes(rng: () => number, n: number): number[] {
  return Array.from({ length: n }, () => Math.floor(rng() * 256));
}

describe('room codes (Phase 6 AC3.3)', () => {
  it('1 000 generated codes have six characters of the alphabet', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const code = makeRoomCode(bytes(rng, 6));
      expect(code).toHaveLength(6);
      for (const c of code) expect(ROOM_CODE_ALPHABET).toContain(c);
      expect(normalizeRoomCode(code)).toBe(code);
    }
  });

  it('normalises lower case, spaces and hyphens; refuses anything else', () => {
    expect(normalizeRoomCode('abc def')).toBe('ABCDEF');
    expect(normalizeRoomCode(' ab-cd-ef ')).toBe('ABCDEF');
    expect(normalizeRoomCode('ABCDE')).toBeNull();
    expect(normalizeRoomCode('ABCDEFG')).toBeNull();
    expect(normalizeRoomCode('ABCDE0')).toBeNull();
    expect(normalizeRoomCode('ABCDEI')).toBeNull();
    expect(normalizeRoomCode('ABC.EF')).toBeNull();
    expect(normalizeRoomCode('')).toBeNull();
  });

  it('peer ids carry the build prefix; another build is no room', () => {
    const id = roomPeerId('abc1234', 'ABCDEF');
    expect(id).toBe('mc-abc1234-r-ABCDEF');
    expect(roomCodeOf(id, 'abc1234')).toBe('ABCDEF');
    expect(roomCodeOf(id, 'def5678')).toBeNull();
    expect(roomCodeOf('mc-abc1234-t-ABCD', 'abc1234')).toBeNull();
    expect(roomCodeOf('mc-abc1234-r-abcdef', 'abc1234')).toBeNull();
    expect(roomOfAnyBuild(id)).toEqual({ build: 'abc1234', code: 'ABCDEF' });
    expect(roomOfAnyBuild('mc-abc1234-g-00ff')).toBeNull();
    expect(guestPeerId('dev', [0, 255, 16])).toBe('mc-dev-g-00ff10');
  });
});

describe('names and player keys (Phase 6 AC3.4)', () => {
  it('trims, strips control characters, cuts to 16, falls back to a default', () => {
    expect(normalizePlayerName('  Anna  ', 1)).toBe('Anna');
    expect(normalizePlayerName('An\u0000n\u0007a', 1)).toBe('Anna');
    expect(normalizePlayerName('abcdefghijklmnopqrstuvwxyz', 1)).toBe('abcdefghijklmnop');
    expect(normalizePlayerName(' \t ', 42)).toBe('Player 0042');
    expect(normalizePlayerName('', 123456)).toBe('Player 3456');
  });

  it('a taken name gets a suffix', () => {
    expect(uniqueName('Anna', ['Ben'])).toBe('Anna');
    expect(uniqueName('Anna', ['Anna'])).toBe('Anna (2)');
    expect(uniqueName('Anna', ['Anna', 'Anna (2)'])).toBe('Anna (3)');
  });

  it('player keys are 32 hex characters', () => {
    const key = playerKeyFromBytes(bytes(mulberry32(3), 16));
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(isPlayerKey(key)).toBe(true);
    expect(isPlayerKey(key.toUpperCase())).toBe(false);
    expect(isPlayerKey(key.slice(1))).toBe(false);
    expect(isPlayerKey(`${key}0`)).toBe(false);
    expect(isPlayerKey(42)).toBe(false);
  });
});
