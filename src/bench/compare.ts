// Comparison of several performance test runs as one text table: a row per scenario and
// render distance, a column per run. Pure; `scripts/perfRuns.ts` prints it.
import type { BenchResult, ScenarioResult } from './benchReport';
import { lightLetter, scenarioLight, workersText } from './verdict';

export interface NamedRun {
  /** What the column is called, e.g. the issue number. */
  name: string;
  result: BenchResult;
}

/** "G 60 fps, p99 17.2" – the light, frames per second and the 99th percentile. */
function cell(s: ScenarioResult | undefined): string {
  if (!s) return '–';
  return `${lightLetter(scenarioLight(s))} ${s.fps} fps, p99 ${s.p99}${s.cut ? ', cut' : ''}`;
}

/** The scenarios of a run by "id@distance#occurrence", in order. */
function keyed(result: BenchResult): Map<string, ScenarioResult> {
  const map = new Map<string, ScenarioResult>();
  const seen = new Map<string, number>();
  for (const s of result.scenarios) {
    const base = `${s.id} v${s.v} @${s.rd}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    map.set(n === 1 ? base : `${base} (${n})`, s);
  }
  return map;
}

function line(cells: readonly string[], widths: readonly number[]): string {
  return cells
    .map((text, i) => text.padEnd(widths[i]))
    .join('  ')
    .trimEnd();
}

/**
 * The table as lines of text. Scenarios are matched by id, version and render distance:
 * numbers of different scenario versions never share a row.
 */
export function comparisonTable(runs: readonly NamedRun[]): string {
  const maps = runs.map((run) => keyed(run.result));
  const keys: string[] = [];
  for (const map of maps) for (const key of map.keys()) if (!keys.includes(key)) keys.push(key);
  const rows: string[][] = [['', ...runs.map((run) => run.name)]];
  const fact = (label: string, of: (result: BenchResult) => string): void => {
    rows.push([label, ...runs.map((run) => of(run.result))]);
  };
  fact('build', (r) => `${r.commit}, suite ${r.suite}${r.quick ? ' (quick)' : ''}`);
  fact('date', (r) => r.date.slice(0, 10));
  fact('device', (r) => `${r.env.input}, ${r.env.screenW}×${r.env.screenH}, ${r.env.hz} Hz`);
  fact('ready', (r) => r.ready.map((x) => `${x.rd}: ${(x.ms / 1000).toFixed(1)} s`).join(', '));
  for (const key of keys) rows.push([key, ...maps.map((map) => cell(map.get(key)))]);
  fact('workers', (r) => workersText(r.workers).replace(/^.*: /, ''));
  fact('throttled', (r) => (r.throttled ? 'yes' : 'no'));
  const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => row[i].length)));
  return rows.map((row) => line(row, widths)).join('\n');
}
