// The goal bot's table: estimated player minutes per task, chapter and level-up over many
// runs, and the balance targets of plan 5.10. Pure.
import { CHAPTERS, DARK_BLOCKS, TASKS } from '../progress/tables';
import { type BotRun, playerMinutes } from './Bot';

/** Balance targets (plan 5.10), in estimated player minutes (median over the runs). */
export const TARGETS = {
  totalMin: 30,
  totalMax: 45,
  taskMax: 5,
  chapterMax: 12,
  levelGapMax: 8,
} as const;

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface Row {
  label: string;
  median: number;
  max: number;
}

export interface BotReport {
  runs: number;
  failed: string[];
  tasks: Row[];
  chapters: Row[];
  total: Row;
  /** Minutes at which each level was reached. */
  levels: Row[];
  /** Largest gap between two level-ups (median over runs, minutes). */
  levelGap: Row;
  actions: Row;
  broken: Row;
  /** Each target with whether it holds. */
  checks: { text: string; ok: boolean }[];
}

function row(label: string, values: readonly number[]): Row {
  return { label, median: median(values), max: values.length > 0 ? Math.max(...values) : 0 };
}

export function buildReport(runs: readonly BotRun[]): BotReport {
  const done = runs.filter((r) => r.completed);
  const failed = runs.filter((r) => !r.completed).map((r) => `seed ${r.seed}: ${r.error}`);
  const minutesOf = (run: BotRun, id: number): number =>
    playerMinutes(run.tasks.find((t) => t.id === id)?.ms ?? 0);
  const tasks = TASKS.map((t) =>
    row(
      `${t.id} ${t.label}`,
      done.map((r) => minutesOf(r, t.id)),
    ),
  );
  const chapters = CHAPTERS.map((c) =>
    row(
      `${c.id} ${c.title}`,
      done.map((r) =>
        TASKS.filter((t) => t.chapter === c.id).reduce((sum, t) => sum + minutesOf(r, t.id), 0),
      ),
    ),
  );
  const total = row(
    'Total',
    done.map((r) => playerMinutes(r.totalMs)),
  );
  const levelNumbers = [...new Set(done.flatMap((r) => r.levelUps.map((l) => l.level)))].sort(
    (a, b) => a - b,
  );
  const levels = levelNumbers.map((level) =>
    row(
      `Level ${level}`,
      done.map((r) => playerMinutes(r.levelUps.find((l) => l.level === level)?.atMs ?? 0)),
    ),
  );
  const gaps = done.map((r) => {
    const times = [0, ...r.levelUps.map((l) => l.atMs)];
    let gap = 0;
    for (let i = 1; i < times.length; i++) gap = Math.max(gap, times[i] - times[i - 1]);
    return playerMinutes(gap);
  });
  const levelGap = row('Largest gap between level-ups', gaps);
  const checks = [
    {
      text: `total ${total.median.toFixed(1)} min within ${TARGETS.totalMin}–${TARGETS.totalMax}`,
      ok: total.median >= TARGETS.totalMin && total.median <= TARGETS.totalMax,
    },
    ...tasks.map((t) => ({
      text: `task "${t.label}" ${t.median.toFixed(1)} min ≤ ${TARGETS.taskMax}`,
      ok: t.median <= TARGETS.taskMax,
    })),
    ...chapters.map((c) => ({
      text: `chapter "${c.label}" ${c.median.toFixed(1)} min ≤ ${TARGETS.chapterMax}`,
      ok: c.median <= TARGETS.chapterMax,
    })),
    {
      text: `largest level gap ${levelGap.median.toFixed(1)} min ≤ ${TARGETS.levelGapMax}`,
      ok: levelGap.median <= TARGETS.levelGapMax,
    },
    { text: `all ${runs.length} runs complete`, ok: failed.length === 0 },
  ];
  return {
    runs: runs.length,
    failed,
    tasks,
    chapters,
    total,
    levels,
    levelGap,
    actions: row(
      'Actions',
      done.map((r) => r.actions),
    ),
    broken: row(
      'Blocks broken',
      done.map((r) => r.broken),
    ),
    checks,
  };
}

/** The report as Markdown tables (for the script's output and the phase report). */
export function formatReport(report: BotReport): string {
  const minutes = (r: Row): string =>
    `| ${r.label} | ${r.median.toFixed(1)} | ${r.max.toFixed(1)} |`;
  const head = '| What | Median (min) | Max (min) |\n| --- | ---: | ---: |';
  return [
    `Runs: ${report.runs}, failed: ${report.failed.length}`,
    ...report.failed.map((f) => `- ${f}`),
    '',
    head,
    ...report.tasks.map(minutes),
    '',
    head,
    ...report.chapters.map(minutes),
    minutes(report.total),
    '',
    head,
    ...report.levels.map(minutes),
    minutes(report.levelGap),
    '',
    `Actions: median ${report.actions.median.toFixed(0)}, max ${report.actions.max}; ` +
      `blocks broken: median ${report.broken.median.toFixed(0)}, max ${report.broken.max}`,
    '',
    ...report.checks.map((c) => `- [${c.ok ? 'x' : ' '}] ${c.text}`),
  ].join('\n');
}

/** Dark breaks of one task over the runs: all blocks, and only those of `DARK_BLOCKS`. */
export interface DarkRow {
  task: number;
  label: string;
  all: { median: number; max: number };
  ores: { median: number; max: number };
}

/**
 * The dark-break report (Fix Adventure 1): per task with any dark break in any run, the
 * median and maximum over all runs. A report only: it never makes a run fail.
 */
export function darkBreakRows(
  runs: readonly BotRun[],
  darkBlocks: readonly number[] = DARK_BLOCKS,
): DarkRow[] {
  const rows: DarkRow[] = [];
  for (const task of TASKS) {
    const all = runs.map((r) =>
      r.darkBreaks.filter((d) => d.task === task.id).reduce((n, d) => n + d.count, 0),
    );
    if (all.every((n) => n === 0)) continue;
    const ores = runs.map((r) =>
      r.darkBreaks
        .filter((d) => d.task === task.id && darkBlocks.includes(d.block))
        .reduce((n, d) => n + d.count, 0),
    );
    const stat = (values: number[]) => ({ median: median(values), max: Math.max(...values) });
    rows.push({
      task: task.id,
      label: `${task.id} ${task.label}`,
      all: stat(all),
      ores: stat(ores),
    });
  }
  return rows;
}

/** The dark-break table as Markdown. */
export function formatDarkBreaks(rows: readonly DarkRow[], runs: number): string {
  return [
    `Dark breaks before a light source (${runs} runs; report only, never a failure)`,
    '',
    '| Task | All: median | All: max | Ores: median | Ores: max |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...rows.map(
      (r) => `| ${r.label} | ${r.all.median} | ${r.all.max} | ${r.ores.median} | ${r.ores.max} |`,
    ),
    ...(rows.length === 0 ? ['| (none) | | | | |'] : []),
  ].join('\n');
}
