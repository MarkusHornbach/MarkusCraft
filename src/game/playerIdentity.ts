// The player key, name and look of this device (per site), kept in local storage for
// multiplayer: the host keys a guest's items by the key; name and look are shown to others.
import { PLAYER_STORAGE_KEY } from './config';
import { isPlayerKey, playerKeyFromBytes } from '../net/roomCode';
import { LOOK_AUTOMATIC, isLookChoice } from '../player/looks';

export interface PlayerIdentity {
  key: string;
  name: string;
  /** The chosen look: 0 (Automatic, from the key) or a look id 1–8. */
  look: number;
}

/**
 * The identity in a stored text (pure). A record of Part B or C (`{ key, name }`) or one
 * with an invalid look has the look 0; without a valid key `newKey` makes one.
 */
export function parseIdentity(text: string | null, newKey: () => string): PlayerIdentity {
  let stored: unknown;
  try {
    stored = JSON.parse(text ?? 'null');
  } catch {
    stored = null;
  }
  const record =
    typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {};
  const key = isPlayerKey(record.key) ? record.key : newKey();
  const name = typeof record.name === 'string' ? record.name.slice(0, 64) : '';
  const look = isLookChoice(record.look) ? record.look : LOOK_AUTOMATIC;
  return { key, name, look };
}

function sameIdentity(a: PlayerIdentity, b: PlayerIdentity): boolean {
  return a.key === b.key && a.name === b.name && a.look === b.look;
}

function readStored(): string | null {
  try {
    return window.localStorage.getItem(PLAYER_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Reads the stored identity, or makes a new key. Nothing is stored here: single-player
 * leaves no trace; `saveIdentity` keeps it once a room is opened, joined, a name typed or
 * a look chosen.
 */
export function loadIdentity(): PlayerIdentity {
  return parseIdentity(readStored(), () =>
    playerKeyFromBytes(crypto.getRandomValues(new Uint8Array(16))),
  );
}

/** Stores the identity; a stored record that already says the same is left as it is. */
export function saveIdentity(identity: PlayerIdentity): void {
  const text = readStored();
  if (
    text !== null &&
    sameIdentity(
      parseIdentity(text, () => ''),
      identity,
    )
  )
    return;
  try {
    window.localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Without storage the key lives as long as the page; a reload counts as a new player.
  }
}
