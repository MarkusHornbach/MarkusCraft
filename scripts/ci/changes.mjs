// CI job `changes`: decides whether a run needs the full suite (build, browser shards, report).
// @ts-check
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * True when the list names at least one file and every file ends in `.md`. An empty or
 * unreadable list (null) is not docs-only: when in doubt, the browser tests run.
 * @param {readonly string[] | null} files
 */
export function isDocsOnly(files) {
  return files !== null && files.length > 0 && files.every((file) => file.endsWith('.md'));
}

/**
 * Whether the run needs the full suite. A push to `main` always does; a pull request does
 * unless it changes only Markdown; any other push runs only the fast checks.
 * @param {{ event: string, ref: string, files: readonly string[] | null }} run
 */
export function decideFull({ event, ref, files }) {
  if (event === 'pull_request') return !isDocsOnly(files);
  if (event === 'push') return ref === 'refs/heads/main';
  // An event this workflow does not expect: run everything rather than miss a test.
  return true;
}

/**
 * The lines of `git diff --name-only`, without blanks.
 * @param {string} text
 */
export function parseFileList(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/**
 * The files a pull request changes. The checkout is the merge commit, so its first parent is
 * the base branch the pull request would merge into. Null if git cannot answer.
 * @returns {string[] | null}
 */
function pullRequestFiles() {
  try {
    const out = execFileSync('git', ['diff', '--name-only', 'HEAD^1', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    return parseFileList(out);
  } catch {
    return null;
  }
}

function main() {
  const event = process.env.GITHUB_EVENT_NAME ?? '';
  const ref = process.env.GITHUB_REF ?? '';
  const files = event === 'pull_request' ? pullRequestFiles() : null;
  const full = decideFull({ event, ref, files });
  const listed = files === null ? 'not read' : `${files.length} changed file(s)`;
  console.log(`event ${event}, ref ${ref}, ${listed}: full = ${full}`);
  if (files !== null) for (const file of files) console.log(`  ${file}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `full=${full}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
