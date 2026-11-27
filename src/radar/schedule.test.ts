// The scan and draw rules of the radar (Phase 8B1 AC3.4, in Node).
import { describe, expect, it } from 'vitest';
import { RADAR_DRAW_STEPS, RADAR_SCAN_STEPS } from '../game/config';
import { DrawPacer, ScanPacer, radarDebugText, sameScan, yawDifference } from './schedule';

describe('radar pacing', () => {
  it('scans only after a change, at most once per RADAR_SCAN_STEPS', () => {
    const scan = new ScanPacer();
    expect(scan.due(0)).toBe(true);
    scan.done(0);
    for (let s = 1; s < 200; s++) expect(scan.due(s)).toBe(false);
    scan.invalidate();
    expect(scan.due(200)).toBe(true);
    scan.done(200);
    scan.invalidate();
    expect(scan.due(200 + RADAR_SCAN_STEPS - 1)).toBe(false);
    expect(scan.due(200 + RADAR_SCAN_STEPS)).toBe(true);
    expect(scan.count).toBe(2);
    scan.reset();
    expect(scan.count).toBe(0);
    expect(scan.due(0)).toBe(true);
  });

  it('draws after a change or a turn of 2°, at most once per RADAR_DRAW_STEPS', () => {
    const draw = new DrawPacer();
    const deg = Math.PI / 180;
    expect(draw.due(0, 0)).toBe(true);
    draw.done(0, 0);
    // Standing still: nothing.
    for (let s = 1; s <= 120; s++) expect(draw.due(s, 0)).toBe(false);
    // Turning 1° per step for 120 steps: at most 30 draws.
    let draws = 0;
    for (let s = 121; s <= 240; s++) {
      const yaw = (s - 120) * deg;
      if (draw.due(s, yaw)) {
        draw.done(s, yaw);
        draws++;
      }
    }
    expect(draws).toBeGreaterThan(0);
    expect(draws).toBeLessThanOrEqual(120 / RADAR_DRAW_STEPS);
    draw.invalidate();
    expect(draw.due(240 + RADAR_DRAW_STEPS, 120 * deg)).toBe(true);
    expect(yawDifference(0.1, 2 * Math.PI + 0.1)).toBeCloseTo(0, 9);
    expect(yawDifference(-3, 3)).toBeCloseTo(2 * Math.PI - 6, 9);
    draw.reset();
    expect(draw.count).toBe(0);
  });

  it('compares scans and writes the F3 row', () => {
    const a = {
      entries: [{ kind: 'coal', dx: 1, dy: 0, dz: 0, dist: 1, hint: { exact: 0 } }],
      beyond: [],
    };
    expect(sameScan(a, JSON.parse(JSON.stringify(a)))).toBe(true);
    expect(sameScan(a, null)).toBe(false);
    expect(radarDebugText(a, ['coal', 'iron'], 0.61, 0.08)).toBe(
      '1 coal · 0 iron · scan 0.6 ms · draw 0.1 ms',
    );
  });
});
