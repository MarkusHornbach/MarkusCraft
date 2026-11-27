// The world's edits and block states split into snapshot parts for a joining guest and
// joined again, and an order-independent hash of a world's edits and states (equal hashes
// on all players: equal blocks and contents).
import { SNAPSHOT_PART_BYTES } from '../game/config';
import { decodeState, encodeSlots, type WorldEdits } from '../save/saveFormat';
import type { BlockState, WorldStates } from '../world/blockState';
import { chunkKey } from '../world/chunk';
import { type SnapshotChunk, type SnapshotState, encodeMessage } from './protocol';

/**
 * Characters of a snapshot message besides its chunks:
 * `{"t":"snapshot","part":N,"chunks":[],"states":[]}`.
 */
function envelopeLength(part: number): number {
  return `{"t":"snapshot","part":${part},"chunks":[],"states":[]}`.length;
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

/** One snapshot part: edits by chunk and block states. */
export interface SnapshotPart {
  chunks: SnapshotChunk[];
  states: SnapshotState[];
}

/**
 * The edits and states as snapshot parts, each at most `maxBytes` characters as a
 * `snapshot` message. Edits come first (as `splitEdits`), then the states, which join the
 * last part while they fit; a state is never split across parts. Nothing gives no parts.
 */
export function splitSnapshot(
  edits: WorldEdits,
  states: WorldStates,
  maxBytes = SNAPSHOT_PART_BYTES,
): SnapshotPart[] {
  const parts: SnapshotPart[] = splitEdits(edits, maxBytes).map((chunks) => ({
    chunks,
    states: [],
  }));
  const lengthOf = (part: SnapshotPart, index: number): number =>
    encodeMessage({ t: 'snapshot', part: index, ...part }).length;
  let length = parts.length > 0 ? lengthOf(parts[parts.length - 1], parts.length - 1) : 0;
  for (const [key, chunk] of states) {
    const [cx, cz] = key.split(',').map(Number);
    for (const [index, state] of chunk) {
      const entry: SnapshotState = [cx, cz, index, state.kind, encodeSlots(state)];
      const size = JSON.stringify(entry).length;
      const last = parts[parts.length - 1];
      if (last && length + size + 1 <= maxBytes) {
        last.states.push(entry);
        length += size + (last.states.length > 1 ? 1 : 0);
        continue;
      }
      const part: SnapshotPart = { chunks: [], states: [entry] };
      parts.push(part);
      length = lengthOf(part, parts.length - 1);
    }
  }
  return parts;
}

/** The states of all parts; a state the format does not accept is left out. */
export function joinStates(parts: readonly (readonly SnapshotState[])[]): WorldStates {
  const states: WorldStates = new Map();
  for (const part of parts) {
    for (const [cx, cz, index, kind, slots] of part) {
      const state = decodeState(kind, slots);
      if (!state) continue;
      const key = chunkKey(cx, cz);
      let chunk = states.get(key);
      if (!chunk) {
        chunk = new Map();
        states.set(key, chunk);
      }
      chunk.set(index, state);
    }
  }
  return states;
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

/** A hash of one state: its kind and every filled slot, in slot order. */
function stateHash(state: BlockState): number {
  let h = state.kind === 'chest' ? 1 : 2;
  state.slots.forEach((stack, slot) => {
    if (stack) h = mix(h, slot, stack.item, stack.count);
  });
  return h;
}

/**
 * A hash of all edits and block states that does not depend on their order. A state
 * stored explicitly (an empty chest) counts, as the snapshot sends it.
 */
export function worldHash(edits: WorldEdits, states: WorldStates = new Map()): number {
  let sum = 0;
  for (const [key, chunk] of edits) {
    const [cx, cz] = key.split(',').map(Number);
    for (const [index, id] of chunk) sum = (sum + mix(cx, cz, index, id)) >>> 0;
  }
  for (const [key, chunk] of states) {
    const [cx, cz] = key.split(',').map(Number);
    // Another salt in the first word keeps a state apart from an edit of the same cell.
    for (const [index, state] of chunk) {
      sum = (sum + mix(cx ^ 0x5bd1e995, cz, index, stateHash(state))) >>> 0;
    }
  }
  return sum;
}
