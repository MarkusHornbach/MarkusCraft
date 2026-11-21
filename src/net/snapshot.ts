// The world's edits split into snapshot parts for a joining guest and joined again, and an
// order-independent hash of a world's edits (equal hashes on all players: equal worlds).
import { SNAPSHOT_PART_BYTES } from '../game/config';
import type { WorldEdits } from '../save/saveFormat';
import { chunkKey } from '../world/chunk';
import type { SnapshotChunk } from './protocol';

/** Characters of a snapshot message besides its chunks: `{"t":"snapshot","part":N,"chunks":[]}`. */
function envelopeLength(part: number): number {
  return `{"t":"snapshot","part":${part},"chunks":[]}`.length;
}

/**
 * The edits as the chunk lists of snapshot parts. Every part, encoded as a `snapshot`
 * message, is at most `maxBytes` characters long; a chunk with many edits is spread over
 * several parts. No edits give no parts.
 */
export function splitEdits(edits: WorldEdits, maxBytes = SNAPSHOT_PART_BYTES): SnapshotChunk[][] {
  const parts: SnapshotChunk[][] = [];
  let chunks: SnapshotChunk[] = [];
  let length = envelopeLength(0);
  const finish = (): void => {
    if (chunks.length === 0) return;
    parts.push(chunks);
    chunks = [];
    length = envelopeLength(parts.length);
  };
  for (const [key, chunkEdits] of edits) {
    if (chunkEdits.size === 0) continue;
    const [cx, cz] = key.split(',').map(Number);
    let current: SnapshotChunk | null = null;
    for (const [index, id] of chunkEdits) {
      const pair = `${index},${id}`;
      if (current) {
        // ",index,id" inside the current chunk's list.
        if (length + 1 + pair.length <= maxBytes) {
          current[2].push(index, id);
          length += 1 + pair.length;
          continue;
        }
        finish();
      }
      // A new entry `[cx,cz,[index,id]]`, after a comma if it is not the first.
      const entry = `[${cx},${cz},[${pair}]]`.length + (chunks.length > 0 ? 1 : 0);
      if (length + entry > maxBytes) finish();
      current = [cx, cz, [index, id]];
      chunks.push(current);
      length += `[${cx},${cz},[${pair}]]`.length + (chunks.length > 1 ? 1 : 0);
    }
  }
  finish();
  return parts;
}

/** The edits of all parts, in order: later pairs win (as `World.setBlock` would). */
export function joinParts(parts: readonly (readonly SnapshotChunk[])[]): WorldEdits {
  const edits: WorldEdits = new Map();
  for (const part of parts) {
    for (const [cx, cz, pairs] of part) {
      const key = chunkKey(cx, cz);
      let chunk = edits.get(key);
      if (!chunk) {
        chunk = new Map();
        edits.set(key, chunk);
      }
      for (let i = 0; i < pairs.length; i += 2) chunk.set(pairs[i], pairs[i + 1]);
    }
  }
  return edits;
}

/** 32-bit mix of one edit. */
function mix(a: number, b: number, c: number, d: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ b, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16) ^ c, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15) ^ d, 0x165667b1);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A hash of all edits that does not depend on their order. */
export function worldHash(edits: WorldEdits): number {
  let sum = 0;
  for (const [key, chunk] of edits) {
    const [cx, cz] = key.split(',').map(Number);
    for (const [index, id] of chunk) sum = (sum + mix(cx, cz, index, id)) >>> 0;
  }
  return sum;
}
