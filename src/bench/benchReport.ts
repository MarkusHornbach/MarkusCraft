// The result record of a performance test run: built from the measured numbers, turned
// into the text and the link of a GitHub issue, and read back from such a text. Pure;
// reading validates every field and never throws.
import {
  BENCH_FORMAT_VERSION,
  BENCH_ISSUE_URL_MAX,
  BENCH_LABEL,
  BENCH_REPOSITORY,
  BENCH_TEXT_MAX,
} from '../game/config';
import type { WindowStats } from './benchStats';
import {
  type WorkersVerdict,
  THROTTLED_TEXT,
  lightLetter,
  loadingLight,
  scenarioLight,
  workersText,
} from './verdict';

/** The numbers of one measured scenario, rounded as they are written. */
export interface ScenarioResult {
  id: string;
  /** Version of the scenario. */
  v: number;
  /** Render distance. */
  rd: number;
  ms: number;
  frames: number;
  fps: number;
  p99: number;
  max: number;
  long: number;
  cwAvg: number;
  cwMax: number;
  cwOver: number;
  lagAvg: number;
  lagMin: number;
  pendMax: number;
  /** Time from the stop until the chunks were idle (`fly`), else null. */
  catchUpMs: number | null;
  /** JavaScript heap at the end in MB, null where the browser does not tell. */
  heap: number | null;
  cut: boolean;
  fh: number[];
  ch: number[];
}

export interface BenchEnv {
  ua: string;
  gpu: string;
  /** Screen size in CSS pixels. */
  screenW: number;
  screenH: number;
  /** The device's pixel ratio and the one the game drew with. */
  dpr: number;
  pixelRatio: number;
  /** Canvas size in device pixels. */
  canvasW: number;
  canvasH: number;
  input: 'mouse' | 'touch';
  cores: number | null;
  /** Device memory in GB, as the browser rounds it. */
  memory: number | null;
  /** Estimated refresh rate of the display. */
  hz: number;
  /** Whether the screen wake lock was granted. */
  wake: boolean;
}

export interface BenchResult {
  format: number;
  suite: number;
  quick: boolean;
  commit: string;
  /** UTC, ISO 8601. */
  date: string;
  /** Time from loading a fresh world until all chunks were meshed, per block. */
  ready: { rd: number; ms: number }[];
  throttled: boolean;
  workers: WorkersVerdict;
  env: BenchEnv;
  frameEdges: number[];
  chunkEdges: number[];
  scenarios: ScenarioResult[];
}

export const ISSUE_MARKER = `<!-- markuscraft-perf v${BENCH_FORMAT_VERSION} -->`;
export const FULL_DATA_LINE = 'Full data: paste the copied result as a comment.';
const TITLE = 'Performance run';

/** Rounds to one decimal. */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Cuts a text of the environment to its longest length, without line breaks. */
export function cutText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, BENCH_TEXT_MAX);
}

/** The record of one scenario from the statistics of its window. */
export function scenarioResult(
  stats: WindowStats,
  info: {
    id: string;
    v: number;
    rd: number;
    catchUpMs: number | null;
    heap: number | null;
    cut: boolean;
  },
): ScenarioResult {
  return {
    id: info.id,
    v: info.v,
    rd: info.rd,
    ms: Math.round(stats.ms),
    frames: stats.frames,
    fps: stats.ms > 0 ? round1((stats.frames * 1000) / stats.ms) : 0,
    p99: round1(stats.p99),
    max: round1(stats.max),
    long: stats.long,
    cwAvg: round1(stats.cwAvg),
    cwMax: round1(stats.cwMax),
    cwOver: stats.cwOver,
    lagAvg: round1(stats.lagAvg),
    lagMin: stats.lagMin,
    pendMax: stats.pendMax,
    catchUpMs: info.catchUpMs === null ? null : Math.round(info.catchUpMs),
    heap: info.heap === null ? null : Math.round(info.heap),
    cut: info.cut,
    fh: [...stats.fh],
    ch: [...stats.ch],
  };
}

// --- JSON ------------------------------------------------------------------------------

/** The scalar columns of a scenario row; the two histograms follow them. */
const COLUMNS = [
  'id',
  'v',
  'rd',
  'ms',
  'frames',
  'fps',
  'p99',
  'max',
  'long',
  'cwAvg',
  'cwMax',
  'cwOver',
  'lagAvg',
  'lagMin',
  'pendMax',
  'catchUpMs',
  'heap',
  'cut',
] as const;

/** Compact JSON: scenarios are rows of numbers under one list of column names. */
export function resultToJson(result: BenchResult): string {
  const ids: string[] = [];
  for (const s of result.scenarios) if (!ids.includes(s.id)) ids.push(s.id);
  const rows = result.scenarios.map((s) => [
    ids.indexOf(s.id),
    s.v,
    s.rd,
    s.ms,
    s.frames,
    s.fps,
    s.p99,
    s.max,
    s.long,
    s.cwAvg,
    s.cwMax,
    s.cwOver,
    s.lagAvg,
    s.lagMin,
    s.pendMax,
    s.catchUpMs ?? -1,
    s.heap ?? -1,
    s.cut ? 1 : 0,
    ...s.fh,
    ...s.ch,
  ]);
  const env = result.env;
  return JSON.stringify({
    f: result.format,
    suite: result.suite,
    quick: result.quick ? 1 : 0,
    commit: result.commit,
    date: result.date,
    ready: result.ready.flatMap((r) => [r.rd, r.ms]),
    thr: result.throttled ? 1 : 0,
    ww: result.workers,
    env: {
      ua: env.ua,
      gpu: env.gpu,
      scr: [env.screenW, env.screenH],
      dpr: env.dpr,
      pr: env.pixelRatio,
      cv: [env.canvasW, env.canvasH],
      in: env.input,
      cores: env.cores ?? -1,
      mem: env.memory ?? -1,
      hz: env.hz,
      wake: env.wake ? 1 : 0,
    },
    fe: result.frameEdges,
    ce: result.chunkEdges,
    ids,
    cols: COLUMNS,
    rows,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isCount(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value);
}

function isFlag(value: unknown): value is 0 | 1 {
  return value === 0 || value === 1;
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= BENCH_TEXT_MAX;
}

function numberList(value: unknown, check: (v: unknown) => boolean): number[] | null {
  if (!Array.isArray(value) || !value.every(check)) return null;
  return value as number[];
}

/** A number that stands for "none" as -1. */
function optional(value: unknown): number | null | undefined {
  if (value === -1) return null;
  return isNumber(value) ? value : undefined;
}

const WORKERS: readonly string[] = ['recommended', 'borderline', 'not needed', 'mouse', 'quick'];

function envFromJson(raw: unknown): BenchEnv | null {
  if (!isRecord(raw)) return null;
  const scr = numberList(raw.scr, isNumber);
  const cv = numberList(raw.cv, isNumber);
  const cores = optional(raw.cores);
  const memory = optional(raw.mem);
  if (!isText(raw.ua) || !isText(raw.gpu) || !scr || scr.length !== 2) return null;
  if (!cv || cv.length !== 2 || !isNumber(raw.dpr) || !isNumber(raw.pr)) return null;
  if (raw.in !== 'mouse' && raw.in !== 'touch') return null;
  if (cores === undefined || memory === undefined || !isNumber(raw.hz)) return null;
  if (!isFlag(raw.wake)) return null;
  return {
    ua: raw.ua,
    gpu: raw.gpu,
    screenW: scr[0],
    screenH: scr[1],
    dpr: raw.dpr,
    pixelRatio: raw.pr,
    canvasW: cv[0],
    canvasH: cv[1],
    input: raw.in,
    cores,
    memory,
    hz: raw.hz,
    wake: raw.wake === 1,
  };
}

/** The validated record of a JSON value, or null. */
function resultFromJson(raw: unknown): BenchResult | null {
  if (!isRecord(raw) || raw.f !== BENCH_FORMAT_VERSION) return null;
  if (!isCount(raw.suite) || !isFlag(raw.quick) || !isFlag(raw.thr)) return null;
  if (typeof raw.commit !== 'string' || !/^[0-9a-z]{1,12}$/.test(raw.commit)) return null;
  if (typeof raw.date !== 'string') return null;
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(raw.date)) return null;
  if (typeof raw.ww !== 'string' || !WORKERS.includes(raw.ww)) return null;
  const env = envFromJson(raw.env);
  const readyList = numberList(raw.ready, isCount);
  const frameEdges = numberList(raw.fe, isNumber);
  const chunkEdges = numberList(raw.ce, isNumber);
  if (!env || !readyList || readyList.length % 2 !== 0 || !frameEdges || !chunkEdges) return null;
  const ids = raw.ids;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string' && /^[a-z]{1,16}$/.test(id)))
    return null;
  const cols = raw.cols;
  if (!Array.isArray(cols) || cols.length !== COLUMNS.length) return null;
  if (!COLUMNS.every((name, i) => cols[i] === name)) return null;
  if (!Array.isArray(raw.rows) || raw.rows.length > 64) return null;
  const width = COLUMNS.length + frameEdges.length + 1 + chunkEdges.length + 1;
  const scenarios: ScenarioResult[] = [];
  for (const row of raw.rows as unknown[]) {
    const r = numberList(row, (v) => v === -1 || isNumber(v));
    if (!r || r.length !== width) return null;
    const catchUpMs = optional(r[15]);
    const heap = optional(r[16]);
    const histograms = r.slice(COLUMNS.length);
    if (!isCount(r[0]) || r[0] >= ids.length || !isFlag(r[17])) return null;
    if (catchUpMs === undefined || heap === undefined) return null;
    // Only the two optional columns may hold -1.
    if (r.some((v, i) => v === -1 && i !== 15 && i !== 16)) return null;
    if (![r[1], r[2], r[4], r[8], r[11], r[14]].every(isCount) || !histograms.every(isCount))
      return null;
    scenarios.push({
      id: ids[r[0]] as string,
      v: r[1],
      rd: r[2],
      ms: r[3],
      frames: r[4],
      fps: r[5],
      p99: r[6],
      max: r[7],
      long: r[8],
      cwAvg: r[9],
      cwMax: r[10],
      cwOver: r[11],
      lagAvg: r[12],
      lagMin: r[13],
      pendMax: r[14],
      catchUpMs,
      heap,
      cut: r[17] === 1,
      fh: histograms.slice(0, frameEdges.length + 1),
      ch: histograms.slice(frameEdges.length + 1),
    });
  }
  const ready: { rd: number; ms: number }[] = [];
  for (let i = 0; i < readyList.length; i += 2) {
    ready.push({ rd: readyList[i], ms: readyList[i + 1] });
  }
  return {
    format: BENCH_FORMAT_VERSION,
    suite: raw.suite,
    quick: raw.quick === 1,
    commit: raw.commit,
    date: raw.date,
    ready,
    throttled: raw.thr === 1,
    workers: raw.ww as WorkersVerdict,
    env,
    frameEdges,
    chunkEdges,
    scenarios,
  };
}

/**
 * Reads the record back from an issue text (or any text that holds the marker and the
 * JSON block after it). Returns null for anything that is not a complete, valid record.
 */
export function parseIssueBody(text: unknown): BenchResult | null {
  if (typeof text !== 'string') return null;
  const at = text.indexOf(ISSUE_MARKER);
  if (at < 0) return null;
  const block = /```json\s*\n([\s\S]*?)\n\s*```/.exec(text.slice(at + ISSUE_MARKER.length));
  if (!block) return null;
  try {
    return resultFromJson(JSON.parse(block[1]));
  } catch {
    return null;
  }
}

// --- text ------------------------------------------------------------------------------

export const TABLE_HEADER: readonly string[] = [
  'Scenario',
  'Distance',
  'Light',
  'FPS',
  'p99 ms',
  'Longest ms',
  'Long frames',
  'Chunk work max ms',
  'Loading',
];

function seconds(ms: number): string {
  return `${round1(ms / 1000)} s`;
}

/** The cells of a scenario's row, as the result screen and the issue show them. */
export function tableRow(s: ScenarioResult): string[] {
  // Loading: the average distance to the nearest missing mesh, and the catch-up time.
  const loading =
    loadingLight(s) === null
      ? '–'
      : `${s.lagAvg} chunks${s.catchUpMs === null ? '' : `, ${seconds(s.catchUpMs)}`}`;
  return [
    s.id,
    String(s.rd),
    lightLetter(scenarioLight(s)) + (s.cut ? ' (cut off)' : ''),
    String(s.fps),
    String(s.p99),
    String(s.max),
    String(s.long),
    String(s.cwMax),
    loading,
  ];
}

/** "1.2 s at render distance 5, 3.4 s at 8". */
export function readyText(result: BenchResult): string {
  if (result.ready.length === 0) return 'Time until ready: not measured';
  const parts = result.ready.map(
    (r, i) => `${seconds(r.ms)} at ${i === 0 ? 'render distance ' : ''}${r.rd}`,
  );
  return `Time until ready: ${parts.join(', ')}`;
}

/** The lines of the environment, for people. */
export function envLines(result: BenchResult): string[] {
  const env = result.env;
  const memory = env.memory === null ? 'memory unknown' : `${env.memory} GB`;
  const cores = env.cores === null ? 'cores unknown' : `${env.cores} cores`;
  return [
    `Build ${result.commit}, suite ${result.suite}${result.quick ? ' (quick)' : ''}, ${result.date}`,
    `Browser: ${env.ua}`,
    `GPU: ${env.gpu}`,
    `Screen: ${env.screenW}×${env.screenH}, pixel ratio ${env.dpr}, drawn at ${env.pixelRatio} ` +
      `(${env.canvasW}×${env.canvasH})`,
    `Input: ${env.input}, ${cores}, ${memory}, ${env.hz} Hz, ` +
      `wake lock ${env.wake ? 'yes' : 'no'}`,
  ];
}

export function issueTitle(result: BenchResult): string {
  const env = result.env;
  return (
    `${TITLE}${result.quick ? ' (quick)' : ''}: ${env.input}, ` +
    `${env.screenW}×${env.screenH}, build ${result.commit}`
  );
}

/**
 * The text of the issue: verdict and notes, the table, the environment, then the marker
 * and the whole record as JSON. Without `withJson` the JSON gives way to a line that
 * asks for it as a comment.
 */
export function issueText(result: BenchResult, withJson = true): string {
  const lines: string[] = [`**${workersText(result.workers)}**`, ''];
  if (result.throttled) lines.push(THROTTLED_TEXT, '');
  lines.push(readyText(result), '');
  lines.push(`|${TABLE_HEADER.join('|')}|`, `|${TABLE_HEADER.map(() => '-').join('|')}|`);
  for (const s of result.scenarios) lines.push(`|${tableRow(s).join('|')}|`);
  lines.push('');
  for (const line of envLines(result)) lines.push(`- ${line}`);
  lines.push('');
  if (withJson) lines.push(ISSUE_MARKER, '```json', resultToJson(result), '```');
  else lines.push(FULL_DATA_LINE);
  return lines.join('\n');
}

/**
 * Percent-encoding of a query value. Commas, colons, slashes and `@` are allowed in a
 * query as they are; leaving them saves a third of the length of the JSON.
 */
function encodeQuery(text: string): string {
  return encodeURIComponent(text).replace(/%(2C|3A|2F|40)/g, (_, code: string) =>
    String.fromCharCode(parseInt(code, 16)),
  );
}

function urlWithBody(result: BenchResult, body: string): string {
  return (
    `https://github.com/${BENCH_REPOSITORY}/issues/new?title=${encodeQuery(issueTitle(result))}` +
    `&labels=${encodeQuery(BENCH_LABEL)}&body=${encodeQuery(body)}`
  );
}

/**
 * The link that opens a pre-filled issue. A result too long for a link goes without its
 * JSON; one that is still too long keeps only the verdict.
 */
export function issueUrl(result: BenchResult): string {
  const full = urlWithBody(result, issueText(result));
  if (full.length <= BENCH_ISSUE_URL_MAX) return full;
  const short = urlWithBody(result, issueText(result, false));
  if (short.length <= BENCH_ISSUE_URL_MAX) return short;
  return urlWithBody(result, `**${workersText(result.workers)}**\n\n${FULL_DATA_LINE}`);
}
