// The player key and name of this device (per site), kept in local storage for
// multiplayer: the host keys a guest's items by the key; the name is shown to others.
import { PLAYER_STORAGE_KEY } from './config';
import { isPlayerKey, playerKeyFromBytes } from '../net/roomCode';

export interface PlayerIdentity {
  key: string;
  name: string;
}

/** Reads the stored identity, creating and storing a key on first use. Never throws. */
export function loadIdentity(): PlayerIdentity {
  let stored: unknown;
  try {
    stored = JSON.parse(window.localStorage.getItem(PLAYER_STORAGE_KEY) ?? 'null');
  } catch {
    stored = null;
  }
  const record =
    typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {};
  const key = isPlayerKey(record.key)
    ? record.key
    : playerKeyFromBytes(crypto.getRandomValues(new Uint8Array(16)));
  const name = typeof record.name === 'string' ? record.name.slice(0, 64) : '';
  const identity = { key, name };
  if (record.key !== key) saveIdentity(identity);
  return identity;
}

export function saveIdentity(identity: PlayerIdentity): void {
  try {
    window.localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Without storage the key lives as long as the page; a reload counts as a new player.
  }
}
