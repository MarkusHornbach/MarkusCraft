// Timed breaking over the network (Phase 6 part C): when the host decides a `break` that
// arrives a little early, and the translation of a record's break start from the host's
// clock to the clock of the player's own screen. Pure.
import type { Action } from '../actions/actions';
import type { PlayerRecord } from '../actions/playerRecord';
import { BREAK_TOLERANCE_MS, NET_BREAK_GRACE_MS } from '../game/config';

/**
 * When the host decides a `break` of the given record: `null` at once (in time, or so
 * early that `applyAction` refuses it as `early`), otherwise the host clock's time at
 * which it is due. Wi-Fi jitter shortens the time between `startBreak` and `break` by a
 * few hundred milliseconds; a `break` early by at most `graceMs` is held, not refused.
 * `requiredMs` is the block's break time with the held item, or null if it has none.
 */
export function breakDueMs(
  record: PlayerRecord,
  action: Action,
  requiredMs: number | null,
  nowMs: number,
  graceMs: number = NET_BREAK_GRACE_MS,
): number | null {
  if (action.kind !== 'break' || requiredMs === null) return null;
  const started = record.breaking;
  if (!started || started.x !== action.x || started.y !== action.y || started.z !== action.z) {
    return null;
  }
  const due = started.startMs + requiredMs - BREAK_TOLERANCE_MS;
  if (nowMs >= due || due - nowMs > graceMs) return null;
  return due;
}

/**
 * A player's screen measures break progress on its own clock, the host on its own. The
 * record that comes back after a `startBreak` carries the host's start time; this
 * replaces it with the screen's time at which the `startBreak` was submitted, so the
 * screen's progress works as in single-player.
 */
export class BreakClock {
  private started: { x: number; y: number; z: number; localMs: number } | null = null;

  /** An action is being submitted at the screen's time `localMs`. */
  noteSubmit(action: Action, localMs: number): void {
    if (action.kind === 'startBreak') {
      this.started = { x: action.x, y: action.y, z: action.z, localMs };
    }
  }

  /** The record as the screen sees it. */
  view(record: PlayerRecord): PlayerRecord {
    const b = record.breaking;
    const s = this.started;
    if (!b || !s || b.x !== s.x || b.y !== s.y || b.z !== s.z) return record;
    if (b.startMs === s.localMs) return record;
    return { ...record, breaking: { ...b, startMs: s.localMs } };
  }
}
