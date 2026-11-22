// CI timing tools: the `report` job's summary from the shards' Playwright JSON; with
// --assign, spec lists per shard (longest spec first onto the least loaded shard) for
// e2e/shards.json; with --files, the specs one shard job runs.
// @ts-check
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Shards per project in `ci.yml`. */
export const SHARD_COUNTS = { game: 4, multiplayer: 3 };

/** Spec files of the `multiplayer` project (the same pattern as playwright.config.ts). */
const MULTIPLAYER = /^mp[A-Z]\w*\.spec\.ts$/;

/** How many of the slowest tests the summary lists. */
const SLOWEST = 20;

/**
 * @typedef {{ duration?: number, shardIndex?: number }} JsonResult
 * @typedef {{ projectName?: string, status?: string, results?: JsonResult[] }} JsonTest
 * @typedef {{ title?: string, file?: string, tests?: JsonTest[] }} JsonSpec
 * @typedef {{ title?: string, file?: string, specs?: JsonSpec[], suites?: JsonSuite[] }} JsonSuite
 * @typedef {{ suites?: JsonSuite[], stats?: { duration?: number } }} JsonReport
 * @typedef {{ project: string, file: string, title: string, durationMs: number,
 *   status: string, shard: number | null }} TestTime
 */

/**
 * One entry per test and project, with the time of all its attempts. `shard` names the shard
 * of a report merged from one shard's blob alone; otherwise the shard comes from the JSON,
 * where it carries one (Playwright 1.63's merged JSON does not).
 * @param {JsonReport} report
 * @param {number | null} [shard]
 * @returns {TestTime[]}
 */
export function collectTests(report, shard = null) {
  /** @type {TestTime[]} */
  const tests = [];
  /**
   * @param {JsonSuite} suite
   * @param {string[]} path describe titles below the file
   * @param {boolean} isFile
   */
  const walk = (suite, path, isFile) => {
    const inner = isFile ? path : [...path, suite.title ?? ''];
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const results = test.results ?? [];
        const last = results[results.length - 1];
        tests.push({
          project: test.projectName ?? '',
          file: spec.file ?? suite.file ?? '',
          title: [...inner, spec.title ?? ''].join(' › '),
          durationMs: results.reduce((sum, result) => sum + (result.duration ?? 0), 0),
          status: test.status ?? 'unknown',
          shard: shard ?? (typeof last?.shardIndex === 'number' ? last.shardIndex : null),
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, inner, false);
  };
  for (const fileSuite of report.suites ?? []) walk(fileSuite, [], true);
  return tests;
}

/**
 * Sums per key, in the order keys first appear.
 * @template T
 * @param {readonly TestTime[]} tests
 * @param {(test: TestTime) => T} keyOf
 * @returns {Map<T, { count: number, ms: number }>}
 */
function groupBy(tests, keyOf) {
  /** @type {Map<T, { count: number, ms: number }>} */
  const groups = new Map();
  for (const test of tests) {
    const key = keyOf(test);
    const group = groups.get(key) ?? { count: 0, ms: 0 };
    group.count += 1;
    group.ms += test.durationMs;
    groups.set(key, group);
  }
  return groups;
}

/** @param {number} ms */
function seconds(ms) {
  return `${Math.round(ms / 1000)}`;
}

/** @param {number} ms */
function minutes(ms) {
  return `${(ms / 60_000).toFixed(1)} min`;
}

/**
 * The Markdown summary: totals per project, test time per shard (where the JSON names the
 * shard), every spec longest first, the slowest tests and the tests that failed.
 * @param {readonly TestTime[]} tests
 * @returns {string}
 */
export function summarize(tests) {
  const projects = [...new Set(tests.map((test) => test.project))].sort();
  /** @param {string} project @param {string} status */
  const count = (project, status) =>
    tests.filter((test) => test.project === project && test.status === status).length;
  const lines = ['## Browser test timings', ''];
  lines.push('| Project | Tests | Passed | Failed | Flaky | Skipped | Test time |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const project of projects) {
    const own = tests.filter((test) => test.project === project);
    const ms = own.reduce((sum, test) => sum + test.durationMs, 0);
    lines.push(
      `| ${project} | ${own.length} | ${count(project, 'expected')} | ` +
        `${count(project, 'unexpected')} | ${count(project, 'flaky')} | ` +
        `${count(project, 'skipped')} | ${minutes(ms)} |`,
    );
  }

  const sharded = tests.filter((test) => test.shard !== null);
  if (sharded.length > 0) {
    lines.push('', '### Test time per shard', '');
    lines.push('| Project | Shard | Tests | Test time |', '| --- | ---: | ---: | ---: |');
    const shards = [...groupBy(sharded, (test) => `${test.project}\u0000${test.shard}`)];
    shards.sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }));
    for (const [key, group] of shards) {
      const [project, shard] = key.split('\u0000');
      lines.push(`| ${project} | ${shard} | ${group.count} | ${minutes(group.ms)} |`);
    }
  }

  lines.push('', '### Specs, longest first', '');
  lines.push('| Project | Spec | Tests | Seconds |', '| --- | --- | ---: | ---: |');
  const specs = [...groupBy(tests, (test) => `${test.project}\u0000${test.file}`)];
  specs.sort(([a, x], [b, y]) => y.ms - x.ms || a.localeCompare(b));
  for (const [key, group] of specs) {
    const [project, file] = key.split('\u0000');
    lines.push(`| ${project} | ${file} | ${group.count} | ${seconds(group.ms)} |`);
  }

  lines.push('', `### The ${SLOWEST} slowest tests`, '');
  lines.push('| Seconds | Project | Spec | Test |', '| ---: | --- | --- | --- |');
  const slowest = [...tests].sort((a, b) => b.durationMs - a.durationMs).slice(0, SLOWEST);
  for (const test of slowest) {
    lines.push(`| ${seconds(test.durationMs)} | ${test.project} | ${test.file} | ${test.title} |`);
  }

  const failed = tests.filter((test) => test.status === 'unexpected' || test.status === 'flaky');
  if (failed.length > 0) {
    lines.push('', '### Failed or flaky tests', '');
    lines.push('| Project | Shard | Spec | Test | Status |', '| --- | ---: | --- | --- | --- |');
    for (const test of failed) {
      lines.push(
        `| ${test.project} | ${test.shard ?? '–'} | ${test.file} | ${test.title} | ${test.status} |`,
      );
    }
  }
  return lines.join('\n') + '\n';
}

/**
 * Spec lists for `count` shards of one project: specs sorted by their time, longest first,
 * each onto the shard with the least time so far (the lower index on a tie).
 * @param {readonly TestTime[]} tests
 * @param {string} project
 * @param {number} count
 * @returns {string[][]}
 */
export function assignShards(tests, project, count) {
  const specs = [
    ...groupBy(
      tests.filter((test) => test.project === project),
      (test) => test.file,
    ),
  ].sort(([a, x], [b, y]) => y.ms - x.ms || a.localeCompare(b));
  /** @type {string[][]} */
  const files = Array.from({ length: count }, () => []);
  const load = new Array(count).fill(0);
  for (const [file, group] of specs) {
    let least = 0;
    for (let i = 1; i < count; i++) if (load[i] < load[least]) least = i;
    files[least].push(file);
    load[least] += group.ms;
  }
  return files.map((list) => list.sort());
}

/**
 * The command line's reports: `<n>=<path>` is the report of shard n alone, a plain path a
 * report whose shards are unknown (or carried in the JSON).
 * @param {readonly string[]} args
 * @returns {{ shard: number | null, path: string }[]}
 */
export function parseReportArgs(args) {
  return args.map((arg) => {
    const match = /^(\d+)=(.+)$/.exec(arg);
    return match ? { shard: Number(match[1]), path: match[2] } : { shard: null, path: arg };
  });
}

/**
 * The specs of one shard: its list in `shards.json`, without files that no longer exist,
 * and in the last shard also every spec of the project that the file does not name, so a
 * new spec is never lost. Throws if the shard would run nothing (Playwright would then run
 * the whole project).
 * @param {Record<string, string[][]>} shards
 * @param {string} project
 * @param {number} shard counted from 1
 * @param {readonly string[]} allSpecs every spec file of the project, relative to e2e/
 * @returns {string[]}
 */
export function shardFiles(shards, project, shard, allSpecs) {
  const lists = shards[project];
  if (!Array.isArray(lists) || shard < 1 || shard > lists.length) {
    throw new Error(`shards.json has no shard ${shard} of ${project}`);
  }
  const existing = new Set(allSpecs);
  const files = lists[shard - 1].filter((file) => existing.has(file));
  if (shard === lists.length) {
    const named = new Set(lists.flat());
    files.push(...allSpecs.filter((file) => !named.has(file)));
  }
  if (files.length === 0) throw new Error(`shard ${shard} of ${project} has no specs`);
  return [...new Set(files)].sort();
}

/**
 * The spec files of a project among the names of the e2e folder.
 * @param {readonly string[]} names
 * @param {string} project
 */
export function projectSpecs(names, project) {
  const specs = names.filter((name) => name.endsWith('.spec.ts'));
  return specs.filter((name) => MULTIPLAYER.test(name) === (project === 'multiplayer')).sort();
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--files') {
    // --files <project> <shard>: one path per line, `e2e/<spec>` (the folder anchors the
    // name, since Playwright reads each argument as a pattern on the path).
    const [, project, shard] = args;
    const shards = JSON.parse(readFileSync('e2e/shards.json', 'utf8'));
    const specs = projectSpecs(readdirSync('e2e'), project);
    for (const file of shardFiles(shards, project, Number(shard), specs)) {
      process.stdout.write(`e2e/${file}\n`);
    }
    return;
  }
  const assign = args[0] === '--assign';
  const reports = parseReportArgs(assign ? args.slice(1) : args);
  if (reports.length === 0) {
    console.error(
      'usage: node scripts/ci/timings.mjs [--assign] [<shard>=]<report.json>... | --files <project> <shard>',
    );
    process.exit(2);
  }
  const tests = reports.flatMap(({ shard, path }) =>
    collectTests(JSON.parse(readFileSync(path, 'utf8')), shard),
  );
  if (assign) {
    /** @type {Record<string, string[][]>} */
    const shards = {};
    for (const [project, count] of Object.entries(SHARD_COUNTS)) {
      shards[project] = assignShards(tests, project, count);
    }
    process.stdout.write(JSON.stringify(shards, null, 2) + '\n');
  } else {
    process.stdout.write(summarize(tests));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
