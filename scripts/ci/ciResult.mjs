// CI job `CI result`: the one required check, green only if every job that had to run passed.
// @ts-check
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Jobs that run only when `changes` says `full`. */
export const FULL_JOBS = ['build', 'e2e-game', 'e2e-mp', 'report'];

/** Jobs that run on every push and pull request. */
export const ALWAYS_JOBS = ['changes', 'checks'];

/**
 * @typedef {{ result?: string, outputs?: Record<string, string> }} NeedResult
 * @typedef {Record<string, NeedResult | undefined>} Needs
 */

/**
 * The verdict from the `needs` context. Every job that had to run must have succeeded; when
 * the run is not full, the browser jobs must have been skipped. Anything failed, cancelled,
 * missing or unexpected is a problem, named with its job.
 * @param {Needs} needs
 * @returns {{ ok: boolean, full: boolean | null, problems: string[] }}
 */
export function ciVerdict(needs) {
  /** @type {string[]} */
  const problems = [];
  for (const job of ALWAYS_JOBS) {
    const result = needs[job]?.result;
    if (result !== 'success') problems.push(`${job}: ${result ?? 'missing'}`);
  }
  const flag = needs.changes?.outputs?.full;
  /** @type {boolean | null} */
  const full = flag === 'true' ? true : flag === 'false' ? false : null;
  if (full === null) {
    problems.push(`changes: no decision (full = ${flag ?? 'missing'})`);
  } else {
    for (const job of FULL_JOBS) {
      const result = needs[job]?.result ?? 'missing';
      if (full && result !== 'success') {
        const why = result === 'skipped' ? 'skipped although the full suite was due' : result;
        problems.push(`${job}: ${why}`);
      }
      if (!full && result !== 'skipped') {
        problems.push(`${job}: ${result} although only the fast checks were due`);
      }
    }
  }
  return { ok: problems.length === 0, full, problems };
}

/**
 * Names of the run's jobs that failed, were cancelled or timed out, from the REST API's job
 * list (so a matrix job is named with its shard, e.g. "e2e-game (2/4)").
 * @param {readonly { name: string, conclusion: string | null }[]} jobs
 * @param {string} self the name of the job asking, left out
 */
export function jobsAtFault(jobs, self) {
  const bad = new Set(['failure', 'cancelled', 'timed_out']);
  return jobs
    .filter((job) => job.name !== self && job.conclusion !== null && bad.has(job.conclusion))
    .map((job) => `${job.name}: ${job.conclusion}`);
}

/**
 * The run's jobs from the API, or null without a token or on any error: the verdict never
 * depends on this, it only adds the shard's name.
 * @returns {Promise<{ name: string, conclusion: string | null }[] | null>}
 */
async function fetchJobs() {
  const { GITHUB_TOKEN, GITHUB_API_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT } =
    process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !GITHUB_RUN_ID) return null;
  const api = GITHUB_API_URL ?? 'https://api.github.com';
  const url = `${api}/repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/attempts/${GITHUB_RUN_ATTEMPT ?? '1'}/jobs?per_page=100`;
  try {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${GITHUB_TOKEN}`, accept: 'application/vnd.github+json' },
    });
    if (!response.ok) return null;
    const body = /** @type {{ jobs?: { name: string, conclusion: string | null }[] }} */ (
      await response.json()
    );
    return body.jobs ?? null;
  } catch {
    return null;
  }
}

async function main() {
  /** @type {Needs} */
  const needs = JSON.parse(process.env.NEEDS ?? '{}');
  const verdict = ciVerdict(needs);
  const lines = [
    `## CI result: ${verdict.ok ? 'passed' : 'failed'}`,
    '',
    `Full suite: ${verdict.full === null ? 'unknown' : verdict.full ? 'yes' : 'no'}`,
    '',
    '| Job | Result |',
    '| --- | --- |',
    ...[...ALWAYS_JOBS, ...FULL_JOBS].map((job) => `| ${job} | ${needs[job]?.result ?? '–'} |`),
  ];
  if (!verdict.ok) {
    lines.push('', '**Problems:**', ...verdict.problems.map((problem) => `- ${problem}`));
    const jobs = await fetchJobs();
    const named = jobs === null ? [] : jobsAtFault(jobs, 'CI result');
    if (named.length > 0) lines.push('', '**Jobs at fault:**', ...named.map((n) => `- ${n}`));
  }
  const text = lines.join('\n');
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
  if (!verdict.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
