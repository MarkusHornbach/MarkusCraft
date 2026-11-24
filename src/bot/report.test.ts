// The bot's table and the balance targets (Phase 8 plan 5.10).
import { describe, expect, it } from 'vitest';
import { TASKS } from '../progress/tables';
import type { BotRun } from './Bot';
import { buildReport, formatReport, median } from './report';

/** A run whose tasks each took `minutes` of estimated player time (bot time / 2.5). */
function run(minutes: number, completed = true): BotRun {
  const ms = (minutes * 60_000) / 2.5;
  return {
    seed: 1,
    gen: { version: 1 },
    completed,
    error: completed ? null : 'stuck',
    tasks: TASKS.map((t, i) => ({
      id: t.id,
      label: t.label,
      chapter: t.chapter,
      ms,
      atMs: ms * (i + 1),
    })),
    levelUps: [2, 3, 4, 5, 6, 7].map((level, i) => ({ level, atMs: ms * 3 * (i + 1) })),
    totalMs: ms * TASKS.length,
    actions: 300,
    broken: 120,
    allUnlocked: completed,
    lightErrors: 0,
  };
}

describe('bot report', () => {
  it('median', () => {
    expect(median([])).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  it('two minutes per task: every target holds', () => {
    const report = buildReport([run(2), run(2), run(1.5)]);
    expect(report.total.median).toBeCloseTo(40, 6);
    expect(report.tasks[0].max).toBeCloseTo(2, 6);
    expect(report.levels.map((l) => l.label)).toEqual([
      'Level 2',
      'Level 3',
      'Level 4',
      'Level 5',
      'Level 6',
      'Level 7',
    ]);
    expect(report.levelGap.median).toBeCloseTo(6, 6);
    expect(report.checks.every((c) => c.ok)).toBe(true);
    expect(formatReport(report)).toContain('| Total | 40.0 | 40.0 |');
  });

  it('a slow book and a failed run break the targets', () => {
    const report = buildReport([run(6), run(6, false)]);
    expect(report.failed).toEqual(['seed 1: stuck']);
    const failing = report.checks.filter((c) => !c.ok).map((c) => c.text);
    expect(failing.some((t) => t.startsWith('total'))).toBe(true);
    expect(failing.some((t) => t.startsWith('task'))).toBe(true);
    expect(failing.some((t) => t.startsWith('chapter'))).toBe(true);
    expect(failing.some((t) => t.startsWith('largest level gap'))).toBe(true);
    expect(failing.some((t) => t.startsWith('all 2 runs'))).toBe(true);
    expect(formatReport(report)).toContain('- [ ] all 2 runs complete');
  });
});
