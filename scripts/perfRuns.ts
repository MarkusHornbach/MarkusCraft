// Dev tool: compares performance test runs. Reads issue bodies from the files of a
// folder and prints one table: a row per scenario and render distance, a column per run.
// A file is a saved issue as the GitHub tools return it (JSON with a `body`), or the
// plain text of an issue or of "Copy result".
// Run: npx vite-node scripts/perfRuns.ts <folder>
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { type BenchResult, parseIssueBody } from '../src/bench/benchReport';
import { type NamedRun, comparisonTable } from '../src/bench/compare';

/** The record in a file: in the `body` of a JSON issue, or in the text itself. */
function readRun(text: string): BenchResult | null {
  try {
    const issue: unknown = JSON.parse(text);
    if (typeof issue === 'object' && issue !== null && 'body' in issue) {
      return parseIssueBody(issue.body);
    }
  } catch {
    // Not JSON: plain text.
  }
  return parseIssueBody(text);
}

const folder = process.argv[2];
if (!folder) {
  console.error('Usage: npx vite-node scripts/perfRuns.ts <folder with saved issues>');
  process.exit(1);
}
const runs: NamedRun[] = [];
const skipped: string[] = [];
for (const name of readdirSync(folder).sort()) {
  let result: BenchResult | null = null;
  try {
    result = readRun(readFileSync(join(folder, name), 'utf8'));
  } catch {
    // A folder or an unreadable file.
  }
  if (result) runs.push({ name: name.replace(/\.(json|md|txt)$/, ''), result });
  else skipped.push(name);
}
if (runs.length > 0) console.log(comparisonTable(runs));
else console.log('No performance run found.');
for (const name of skipped) console.log(`Skipped (no valid result): ${name}`);
