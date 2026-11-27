// The bot's table and the balance targets (Phase 8 plan 5.10).
import { describe, expect, it } from 'vitest';
import { TASKS } from '../progress/tables';
import type { BotRun } from './Bot';
import { buildReport, darkBreakRows, formatDarkBreaks, formatReport, median } from './report';
import { Block } from '../world/blocks';

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
    darkBreaks: [],
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

describe('dark-break report (Fix Adventure 1 AC2.4)', () => {
  it('median and maximum per task, all blocks and ores; tasks without any are left out', () => {
    const a = {
      ...run(2),
      darkBreaks: [
        { task: 6, block: Block.STONE, count: 50 },
        { task: 6, block: Block.COAL_ORE, count: 2 },
      ],
    };
    const b = { ...run(2), darkBreaks: [{ task: 6, block: Block.STONE, count: 10 }] };
    const c = run(2);
    const rows = darkBreakRows([a, b, c]);
    expect(rows).toEqual([
      {
        task: 6,
        label: '6 Mine 64 stone',
        all: { median: 10, max: 52 },
        ores: { median: 0, max: 2 },
      },
    ]);
    const text = formatDarkBreaks(rows, 3);
    expect(text).toContain('| 6 Mine 64 stone | 10 | 52 | 0 | 2 |');
    expect(formatDarkBreaks([], 3)).toContain('(none)');
  });
});
