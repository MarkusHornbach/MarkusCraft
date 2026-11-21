import { describe, expect, it } from 'vitest';
import { comparisonTable } from './compare';
import { SAMPLE_RESULT } from './sampleResult';

describe('comparisonTable (Phase 4P AC4.1)', () => {
  it('prints a row per scenario and render distance and a column per run', () => {
    const other = {
      ...SAMPLE_RESULT,
      commit: 'abc1234',
      quick: true,
      throttled: false,
      workers: 'quick' as const,
      date: '2026-02-03T08:00:00.000Z',
      // An older suite without the building scenario, and a newer version of flying.
      scenarios: SAMPLE_RESULT.scenarios
        .filter((s) => s.id !== 'edit')
        .map((s) => (s.id === 'fly' ? { ...s, v: 2, cut: true } : { ...s, fps: 30, p99: 40 })),
    };
    const table = comparisonTable([
      { name: '#12', result: SAMPLE_RESULT },
      { name: 'phone.json', result: other },
    ]);
    const lines = table.split('\n');
    expect(lines[0]).toMatch(/^\s+#12\s+phone\.json$/);
    expect(lines[1]).toMatch(/^build\s+sample, suite 3\s+abc1234, suite 3 \(quick\)$/);
    expect(lines[2]).toMatch(/^date\s+2026-01-01\s+2026-02-03$/);
    expect(lines[3]).toMatch(/^device\s+touch, 800×360, 60 Hz\s+touch, 800×360, 60 Hz$/);
    expect(lines[4]).toMatch(/^ready\s+5: 2\.4 s, 8: 6\.1 s, 5: 2\.5 s\s+5: 2\.4 s/);
    expect(table).toMatch(/\nstand v1 @5\s+G 60 fps, p99 17\.2\s+Y 30 fps, p99 40\n/);
    expect(table).toMatch(/\nstand v1 @5 \(2\)\s+G 47 fps, p99 26\.3\s+Y 30 fps, p99 40\n/);
    // Different versions of a scenario do not share a row.
    expect(table).toMatch(/\nfly v1 @5\s+Y 57\.2 fps, p99 30\.4\s+–\n/);
    expect(table).toMatch(/\nfly v2 @5\s+–\s+R 57\.2 fps, p99 30\.4, cut\n/);
    expect(table).toMatch(/\nedit v1 @8\s+Y 58\.5 fps, p99 31\.8\s+–\n/);
    expect(table).toMatch(/\nworkers\s+borderline\s+not a measurement\n/);
    expect(table).toMatch(/\nthrottled\s+yes\s+no$/);
    expect(comparisonTable([])).toBe('\nbuild\ndate\ndevice\nready\nworkers\nthrottled');
  });
});
