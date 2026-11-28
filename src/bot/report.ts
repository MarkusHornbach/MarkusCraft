// The goal bot's table: estimated player minutes per task, chapter and level-up over many
// runs, and the balance targets of plan 5.10. Pure.
import { CHAPTERS, DARK_BLOCKS, TASKS } from '../progress/tables';
import { findSpawn } from '../world/generation/spawn';
import { type Place, getTerrain } from '../world/generation/terrain';
import type { WorldGen } from '../world/generation/worldOptions';
import { type BotRun, RADAR_CHECK_TASKS, playerMinutes } from './Bot';

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
  // The loot run's trips are rows of their own, never part of the total.
  const total = row(
    'Total',
    done.map((r) => playerMinutes(r.totalMs - tripMs(r))),
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

/**
 * The radar section (Phase 8 part B1): when the radar unlocks (estimated player minutes,
 * median and maximum) and, at the start of each checked task, the median distance and
 * height difference to the nearest vein of its kind; and whether the radar agreed with the
 * brute force in every run.
 */
export function formatRadar(runs: readonly BotRun[]): string {
  const minutes = runs
    .filter((r) => r.radarAtMs !== null)
    .map((r) => playerMinutes(r.radarAtMs ?? 0));
  const round = (n: number) => Math.round(n * 10) / 10;
  const lines = [
    `Radar (${runs.length} runs)`,
    '',
    `Unlocked in ${minutes.length} runs: median ${round(median(minutes))} min, max ${round(minutes.length > 0 ? Math.max(...minutes) : 0)} min`,
    '',
    '| At the start of | Kind | Runs | Distance: median | dy: median | Agrees with brute force |',
    '| --- | --- | ---: | ---: | ---: | --- |',
  ];
  for (const task of RADAR_CHECK_TASKS) {
    const checks = runs.flatMap((r) => r.radar.filter((c) => c.task === task));
    const found = checks.filter((c) => c.radar !== null);
    const label = TASKS.find((t) => t.id === task)?.label ?? `#${task}`;
    const agree = checks.every((c) => JSON.stringify(c.radar) === JSON.stringify(c.bruteForce));
    lines.push(
      `| ${task} ${label} | ${checks[0]?.kind ?? '–'} | ${checks.length} | ${round(median(found.map((c) => c.radar?.dist ?? 0)))} | ${median(found.map((c) => c.radar?.dy ?? 0))} | ${agree ? 'yes' : 'NO'} |`,
    );
  }
  return lines.join('\n');
}

/** The horizontal distance from a world's spawn to its nearest place of each kind. */
export interface SpawnPlaces {
  shaft: number | null;
  cave: number | null;
}

/** Nearest shaft and cave entrance from the spawn, up to `radius` (Phase 8 part B2b). */
export function spawnPlaces(seed: number, gen: WorldGen, radius: number): SpawnPlaces {
  const terrain = getTerrain(seed, gen);
  const spawn = findSpawn(terrain);
  const places: Place[] = [];
  terrain.placesIn?.(
    spawn.x - radius,
    spawn.z - radius,
    spawn.x + radius,
    spawn.z + radius,
    places,
  );
  const nearest = (kind: Place['kind']): number | null => {
    let best: number | null = null;
    for (const p of places) {
      if (p.kind !== kind) continue;
      const d = Math.hypot(p.x - spawn.x, p.z - spawn.z);
      if (d <= radius && (best === null || d < best)) best = d;
    }
    return best;
  };
  return { shaft: nearest('shaft'), cave: nearest('cave') };
}

/**
 * The places part of the "Radar" section: the median horizontal distance from the spawn to
 * the nearest shaft and cave entrance, and whether the radar agreed with the brute force at
 * the start of task 16.
 */
export function formatPlaces(runs: readonly BotRun[], spawns: readonly SpawnPlaces[]): string {
  const round = (n: number) => Math.round(n * 10) / 10;
  const lines = [
    `Places (${spawns.length} worlds)`,
    '',
    '| Kind | Worlds with one within 192 | From the spawn: median | max | Task 16: radar = brute force |',
    '| --- | ---: | ---: | ---: | --- |',
  ];
  for (const kind of ['shaft', 'cave'] as const) {
    const found = spawns.map((s) => s[kind]).filter((d): d is number => d !== null);
    const checks = runs.flatMap((r) => r.places.filter((c) => c.kind === kind));
    const agree = checks.every((c) => JSON.stringify(c.radar) === JSON.stringify(c.bruteForce));
    lines.push(
      `| ${kind} | ${found.length} | ${round(median(found))} | ${round(found.length > 0 ? Math.max(...found) : 0)} | ${checks.length === 0 ? '–' : agree ? `yes (${checks.length})` : 'NO'} |`,
    );
  }
  return lines.join('\n');
}

/** Bot time of a run's loot trips (Phase 8 part B3b). */
export function tripMs(run: BotRun): number {
  return run.trips.reduce((sum, t) => sum + t.ms, 0);
}

/**
 * Limits of the loot run against the plain run (Phase 8 part B3b, plan 6.7), in estimated
 * player minutes of the medians, trips left out.
 */
export const LOOT_LIMITS = {
  totalShorter: 1.5,
  chapterShorter: 1.0,
  chainTasks: [11, 12, 16, 17] as readonly number[],
  chainWithin: 0.3,
} as const;

export interface LootComparison {
  checks: { text: string; ok: boolean }[];
  markdown: string;
}

/**
 * The loot run against a run without loot on the same worlds (the plain run, or the control
 * run with the same trips and nothing taken): limits, trips, accidental loots.
 */
export function compareLoot(
  plain: readonly BotRun[],
  loot: readonly BotRun[],
  against = 'the plain run',
): LootComparison {
  const a = buildReport(plain);
  const b = buildReport(loot);
  const f = (n: number): string => n.toFixed(1);
  const checks: { text: string; ok: boolean }[] = [];
  const totalSaved = a.total.median - b.total.median;
  checks.push({
    text: `total ${f(totalSaved)} min shorter ≤ ${LOOT_LIMITS.totalShorter}`,
    ok: totalSaved <= LOOT_LIMITS.totalShorter,
  });
  const rows: string[] = [];
  a.chapters.forEach((c, i) => {
    const saved = c.median - b.chapters[i].median;
    rows.push(`| ${c.label} | ${f(c.median)} | ${f(b.chapters[i].median)} | ${f(saved)} |`);
    checks.push({
      text: `chapter "${c.label}" ${f(saved)} min shorter ≤ ${LOOT_LIMITS.chapterShorter}`,
      ok: saved <= LOOT_LIMITS.chapterShorter,
    });
  });
  rows.push(`| Total | ${f(a.total.median)} | ${f(b.total.median)} | ${f(totalSaved)} |`);
  const taskRows: string[] = [];
  for (const id of LOOT_LIMITS.chainTasks) {
    const i = TASKS.findIndex((t) => t.id === id);
    if (i < 0) continue;
    const diff = a.tasks[i].median - b.tasks[i].median;
    taskRows.push(
      `| ${a.tasks[i].label} | ${f(a.tasks[i].median)} | ${f(b.tasks[i].median)} | ${f(diff)} |`,
    );
    checks.push({
      text: `task "${a.tasks[i].label}" within ${LOOT_LIMITS.chainWithin} min (${f(diff)})`,
      ok: Math.abs(diff) <= LOOT_LIMITS.chainWithin,
    });
  }
  const complete = [...plain, ...loot].every((r) => r.completed && r.lightErrors === 0);
  checks.push({
    text: `all ${plain.length + loot.length} runs complete, light errors 0`,
    ok: complete,
  });
  for (const report of [a, b]) {
    const label = report === a ? 'without loot' : 'loot';
    checks.push({
      text: `${label} run: total ${f(report.total.median)} min within ${TARGETS.totalMin}–${TARGETS.totalMax}`,
      ok: report.total.median >= TARGETS.totalMin && report.total.median <= TARGETS.totalMax,
    });
  }
  const tripRows = ['Loot trip 1', 'Loot trip 2'].map((label) => {
    const trips = loot.flatMap((r) => r.trips.filter((t) => t.label === label));
    const found = trips.filter((t) => t.distance !== null);
    const minutes = found.map((t) => playerMinutes(t.ms));
    const distances = found.map((t) => t.distance ?? 0);
    return `| ${label} | ${found.length} of ${trips.length} | ${f(median(minutes))} | ${f(minutes.length > 0 ? Math.max(...minutes) : 0)} | ${f(median(distances))} |`;
  });
  const accidental = (runs: readonly BotRun[]): string =>
    `${runs.reduce((n, r) => n + r.accidentalLoots, 0)} in ${runs.filter((r) => r.accidentalLoots > 0).length} runs`;
  const markdown = [
    `Loot run against ${against} (${plain.length} worlds each; trips left out)`,
    '',
    '| Chapter | Without (min) | Loot (min) | Shorter by |',
    '| --- | ---: | ---: | ---: |',
    ...rows,
    '',
    '| Task (coal and iron chain) | Without | Loot | Shorter by |',
    '| --- | ---: | ---: | ---: |',
    ...taskRows,
    '',
    '| Trip | Chest found | Median (min) | Max (min) | Median distance |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...tripRows,
    '',
    `Accidental loots (a chest in the bot's way): without ${accidental(plain)}, loot ${accidental(loot)}`,
    '',
    ...checks.map((c) => `- [${c.ok ? 'x' : ' '}] ${c.text}`),
  ].join('\n');
  return { checks, markdown };
}
