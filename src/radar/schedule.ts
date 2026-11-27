// When the radar scans and draws, counted in simulation steps so tests stay deterministic.
import { RADAR_DRAW_STEPS, RADAR_SCAN_STEPS, RADAR_TURN_DEG } from '../game/config';
import type { RadarScan } from './scan';

const TURN = (RADAR_TURN_DEG * Math.PI) / 180;

/** The smallest angle between two yaws (radians). */
export function yawDifference(a: number, b: number): number {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

/**
 * The scan side: something changed (`invalidate`) and at most one scan per
 * `RADAR_SCAN_STEPS` steps. Standing still with nothing changed scans nothing.
 */
export class ScanPacer {
  private dirty = true;
  private last = -Infinity;
  /** Scans since the world was loaded. */
  count = 0;

  invalidate(): void {
    this.dirty = true;
  }

  due(step: number): boolean {
    return this.dirty && step - this.last >= RADAR_SCAN_STEPS;
  }

  done(step: number): void {
    this.dirty = false;
    this.last = step;
    this.count++;
  }

  reset(): void {
    this.dirty = true;
    this.last = -Infinity;
    this.count = 0;
  }
}

/**
 * The draw side of one surface (circle or map): after a changed scan, or a turn of at least
 * `RADAR_TURN_DEG` since the last draw, at most once every `RADAR_DRAW_STEPS` steps.
 */
export class DrawPacer {
  private pending = true;
  private yaw: number | null = null;
  private last = -Infinity;
  /** Draws since the world was loaded. */
  count = 0;

  /** The result changed, or the surface was shown again: draw at the next chance. */
  invalidate(): void {
    this.pending = true;
  }

  due(step: number, yaw: number): boolean {
    if (step - this.last < RADAR_DRAW_STEPS) return false;
    return this.pending || this.yaw === null || yawDifference(yaw, this.yaw) >= TURN;
  }

  done(step: number, yaw: number): void {
    this.pending = false;
    this.yaw = yaw;
    this.last = step;
    this.count++;
  }

  reset(): void {
    this.pending = true;
    this.yaw = null;
    this.last = -Infinity;
    this.count = 0;
  }
}

/** Whether two scans show the same thing (then nothing needs a redraw). */
export function sameScan(a: RadarScan | null, b: RadarScan | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The F3 row: "4 coal · 2 iron · scan 0.6 ms · draw 0.1 ms". */
export function radarDebugText(
  scan: RadarScan | null,
  kinds: readonly string[],
  scanMs: number,
  drawMs: number,
): string {
  const counts = kinds.map((k) => `${scan?.entries.filter((e) => e.kind === k).length ?? 0} ${k}`);
  return [...counts, `scan ${scanMs.toFixed(1)} ms`, `draw ${drawMs.toFixed(1)} ms`].join(' · ');
}
