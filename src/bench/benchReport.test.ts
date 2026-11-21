import { describe, expect, it } from 'vitest';
import {
  BENCH_CHUNK_EDGES,
  BENCH_FORMAT_VERSION,
  BENCH_FRAME_EDGES,
  BENCH_ISSUE_URL_MAX,
} from '../game/config';
import { mulberry32, randInt } from '../util/rng';
import {
  type BenchResult,
  type ScenarioResult,
  FULL_DATA_LINE,
  ISSUE_MARKER,
  cutText,
  issueText,
  issueTitle,
  issueUrl,
  parseIssueBody,
  readyText,
  resultToJson,
  round1,
  scenarioResult,
  tableRow,
} from './benchReport';
import { BenchStats } from './benchStats';
import { SAMPLE_RESULT } from './sampleResult';

/** The body a browser hands to GitHub from the link. */
function bodyOf(url: string): string {
  return new URL(url).searchParams.get('body') ?? '';
}

/** A scenario with every number as wide as it can plausibly get. */
function widestScenario(id: string, rd: number): ScenarioResult {
  return {
    id,
    v: 12,
    rd,
    ms: 60_000,
    frames: 14_400,
    fps: 240.5,
    p99: 250.5,
    max: 9999.9,
    long: 14_400,
    cwAvg: 100.5,
    cwMax: 9999.9,
    cwOver: 14_400,
    lagAvg: 8.5,
    lagMin: 9,
    pendMax: 289,
    catchUpMs: 120_000,
    heap: 4096,
    cut: true,
    fh: BENCH_FRAME_EDGES.map(() => 1600).concat(1600),
    ch: BENCH_CHUNK_EDGES.map(() => 1309).concat(1310),
  };
}

function worstCase(scenarios: number): BenchResult {
  // Browser and GPU names as they come: blanks, brackets, semicolons, and worse.
  const ua = cutText(
    'Mozilla/5.0 (Linux; Android 14; SM-A546B Build/UP1A.231005.007; wv) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.135 Mobile Safari/537.36 ' +
      '[ünïcödé "quoted" & more] <tags> #hash %percent +plus =equals ?query ' +
      'x'.repeat(80),
  );
  const gpu = cutText(
    'ANGLE (Qualcomm, Adreno (TM) 740, OpenGL ES 3.2 V@0762.10 (GIT@2c3bd6b, I5b4c1e9a6e, ' +
      '1699000000) (Date:11/03/23)) | Vulkan 1.3.128 "driver" & <more> ' +
      'y'.repeat(120),
  );
  const ids = ['stand', 'walk', 'fly', 'edit', 'torches'];
  return {
    ...SAMPLE_RESULT,
    commit: 'abcdef1',
    date: '2026-12-31T23:59:59.999Z',
    ready: [
      { rd: 5, ms: 120_000 },
      { rd: 8, ms: 120_000 },
      { rd: 5, ms: 120_000 },
    ],
    env: {
      ...SAMPLE_RESULT.env,
      ua,
      gpu,
      screenW: 3840,
      screenH: 2160,
      dpr: 2.625,
      pixelRatio: 1.5,
      canvasW: 5760,
      canvasH: 3240,
      cores: 128,
      memory: 0.25,
      hz: 240,
    },
    scenarios: Array.from({ length: scenarios }, (_, i) =>
      widestScenario(ids[i % ids.length], i % 2 ? 8 : 5),
    ),
  };
}

describe('the result record', () => {
  it('rounds the numbers of a window as they are written', () => {
    const stats = new BenchStats();
    stats.record(16.66, 1.234, 3, 4);
    stats.record(16.71, 2.345, 5, 5);
    stats.record(40.04, 31.11, 9, 2);
    const s = scenarioResult(stats.summary(), {
      id: 'fly',
      v: 1,
      rd: 5,
      catchUpMs: 1234.56,
      heap: 47.6,
      cut: false,
    });
    expect(s).toMatchObject({
      id: 'fly',
      v: 1,
      rd: 5,
      ms: 73,
      frames: 3,
      fps: 40.9,
      p99: 40,
      max: 40,
      long: 1,
      cwAvg: 11.6,
      cwMax: 31.1,
      cwOver: 1,
      lagAvg: 3.7,
      lagMin: 2,
      pendMax: 9,
      catchUpMs: 1235,
      heap: 48,
      cut: false,
    });
    expect(round1(0.05)).toBe(0.1);
    const none = scenarioResult(new BenchStats().summary(), {
      id: 'stand',
      v: 1,
      rd: 2,
      catchUpMs: null,
      heap: null,
      cut: true,
    });
    expect(none).toMatchObject({ fps: 0, catchUpMs: null, heap: null, cut: true });
  });

  it('cuts browser and GPU names to 200 characters on one line', () => {
    expect(cutText(`  a\n b\t${'c'.repeat(300)}`)).toBe(`a b ${'c'.repeat(196)}`);
  });
});

describe('issue text and parser (Phase 4P AC1.7)', () => {
  it('a record survives record → issue text → parseIssueBody unchanged', () => {
    for (const result of [SAMPLE_RESULT, worstCase(9)]) {
      expect(parseIssueBody(issueText(result))).toEqual(result);
    }
    // No heap, no cores, no memory, a quick run in mouse mode without scenarios.
    const bare: BenchResult = {
      ...SAMPLE_RESULT,
      quick: true,
      throttled: false,
      workers: 'quick',
      ready: [],
      env: { ...SAMPLE_RESULT.env, input: 'mouse', cores: null, memory: null, wake: false },
      scenarios: SAMPLE_RESULT.scenarios.map((s) => ({ ...s, heap: null, cut: true })),
    };
    expect(parseIssueBody(issueText(bare))).toEqual(bare);
    expect(parseIssueBody(issueText({ ...bare, scenarios: [] }))?.scenarios).toEqual([]);
  });

  it('the text is made for people: verdict, notes, table, environment, then the data', () => {
    const text = issueText(SAMPLE_RESULT);
    const lines = text.split('\n');
    expect(lines[0]).toBe('**Web Workers (Part C): borderline**');
    expect(text).toContain('The device slowed down during the run');
    expect(text).toContain('Time until ready: 2.4 s at render distance 5, 6.1 s at 8, 2.5 s at 5');
    expect(text).toContain(
      '|Scenario|Distance|Light|FPS|p99 ms|Longest ms|Long frames|Chunk work max ms|Loading|',
    );
    expect(text).toContain('|fly|5|Y|57.2|30.4|61.3|22|34.2|3.1 chunks, 1.9 s|');
    expect(text).toContain('|stand|5|G|60|17.2|18.1|0|1.2|–|');
    expect(text).toContain('- Browser: Sample browser (not a real run)');
    expect(text).toContain('- Input: touch, 8 cores, 4 GB, 60 Hz, wake lock yes');
    // Two header lines and one row per scenario of the sample (13).
    expect(lines.filter((line) => line.startsWith('|')).length).toBe(15);
    expect(text.indexOf(ISSUE_MARKER)).toBeGreaterThan(text.indexOf('- GPU:'));
    expect(text.endsWith('\n```')).toBe(true);
    expect(tableRow({ ...SAMPLE_RESULT.scenarios[0], cut: true })[2]).toBe('R (cut off)');
    expect(readyText({ ...SAMPLE_RESULT, ready: [] })).toBe('Time until ready: not measured');
    const unknown = issueText({
      ...SAMPLE_RESULT,
      throttled: false,
      env: { ...SAMPLE_RESULT.env, cores: null, memory: null, wake: false },
    });
    expect(unknown).toContain('cores unknown, memory unknown, 60 Hz, wake lock no');
    expect(unknown).not.toContain('slowed down');
  });

  it('returns null for a text without the marker or without the block', () => {
    const text = issueText(SAMPLE_RESULT);
    expect(parseIssueBody(text.replace(ISSUE_MARKER, ''))).toBeNull();
    expect(parseIssueBody(issueText(SAMPLE_RESULT, false))).toBeNull();
    expect(parseIssueBody(`${ISSUE_MARKER}\nno block`)).toBeNull();
    expect(parseIssueBody(`${ISSUE_MARKER}\n\`\`\`json\n{broken\n\`\`\``)).toBeNull();
    expect(parseIssueBody('')).toBeNull();
    expect(parseIssueBody(null)).toBeNull();
    expect(parseIssueBody(42)).toBeNull();
    // A newer format is not guessed at.
    expect(
      parseIssueBody(
        text.replace(`"f":${BENCH_FORMAT_VERSION}`, `"f":${BENCH_FORMAT_VERSION + 1}`),
      ),
    ).toBeNull();
  });

  it('reads a text with other writing around it', () => {
    const text = `My phone, charger in.\n\n${issueText(SAMPLE_RESULT)}\n\nThanks!`;
    expect(parseIssueBody(text.replace(/\n/g, '\r\n'))).toEqual(SAMPLE_RESULT);
  });

  it('returns null, without throwing, for 200 seeded damaged texts', () => {
    const text = issueText(SAMPLE_RESULT);
    const json = resultToJson(SAMPLE_RESULT);
    const head = text.slice(0, text.indexOf(json));
    const rng = mulberry32(4711);
    // Values that are wrong for every field.
    const wrong: unknown[] = [-5, null, {}, true, 'x'.repeat(300), [1]];
    for (let i = 0; i < 200; i++) {
      let damaged: string;
      const kind = i % 4;
      if (kind === 0) {
        // Cut off somewhere, at the latest inside the closing fence.
        damaged = text.slice(0, randInt(rng, text.length - 1));
      } else {
        const data = JSON.parse(json) as Record<string, unknown>;
        const places: [Record<string, unknown> | unknown[], string | number][] = [];
        for (const key of Object.keys(data)) places.push([data, key]);
        const env = data.env as Record<string, unknown>;
        for (const key of Object.keys(env)) places.push([env, key]);
        const rows = data.rows as unknown[][];
        for (const row of rows) for (let c = 0; c < row.length; c++) places.push([row, c]);
        const [holder, key] = places[randInt(rng, places.length)];
        const target = holder as Record<string | number, unknown>;
        if (kind === 1 && !Array.isArray(holder)) delete target[key];
        else if (kind === 1) (holder as unknown[]).splice(key as number, 1);
        else if (kind === 2) target[key] = wrong[randInt(rng, wrong.length)];
        else data.f = [0, 2, '1', null][randInt(rng, 4)];
        damaged = `${head}${JSON.stringify(data)}\n\`\`\``;
      }
      expect(() => parseIssueBody(damaged), `text ${i}`).not.toThrow();
      expect(parseIssueBody(damaged), `text ${i}: ${damaged.slice(-300)}`).toBeNull();
    }
  });

  it('refuses single wrong fields', () => {
    const broken = (change: (data: Record<string, unknown>) => void): BenchResult | null => {
      const data = JSON.parse(resultToJson(SAMPLE_RESULT)) as Record<string, unknown>;
      change(data);
      return parseIssueBody(`${ISSUE_MARKER}\n\`\`\`json\n${JSON.stringify(data)}\n\`\`\``);
    };
    expect(broken(() => {})).toEqual(SAMPLE_RESULT);
    expect(broken((d) => (d.commit = 'not a commit!'))).toBeNull();
    expect(broken((d) => (d.date = 'yesterday'))).toBeNull();
    expect(broken((d) => (d.ww = 'maybe'))).toBeNull();
    expect(broken((d) => (d.ready = [5]))).toBeNull();
    expect(broken((d) => (d.ids = ['Stand']))).toBeNull();
    expect(broken((d) => (d.cols = [...(d.cols as string[])].reverse()))).toBeNull();
    expect(broken((d) => (d.rows = new Array(65).fill((d.rows as unknown[])[0])))).toBeNull();
    expect(broken((d) => ((d.rows as number[][])[0][0] = 9))).toBeNull();
    expect(broken((d) => ((d.rows as number[][])[0][2] = -1))).toBeNull();
    expect(broken((d) => ((d.rows as number[][])[0][4] = 1.5))).toBeNull();
    expect(broken((d) => ((d.env as Record<string, unknown>).in = 'pad'))).toBeNull();
    expect(broken((d) => ((d.env as Record<string, unknown>).scr = [1]))).toBeNull();
    expect(broken((d) => (d.env = []))).toBeNull();
  });
});

describe('the issue link (Phase 4P AC1.8)', () => {
  it('names the repository, the label and a title that starts with "Performance run:"', () => {
    const url = new URL(issueUrl(SAMPLE_RESULT));
    expect(url.origin + url.pathname).toBe(
      'https://github.com/MarkusHornbach/MarkusCraft/issues/new',
    );
    expect(url.searchParams.get('labels')).toBe('perf-run');
    expect(url.searchParams.get('title')).toBe('Performance run: touch, 800×360, build sample');
    expect(issueTitle({ ...SAMPLE_RESULT, quick: true })).toBe(
      'Performance run (quick): touch, 800×360, build sample',
    );
    expect(bodyOf(issueUrl(SAMPLE_RESULT))).toBe(issueText(SAMPLE_RESULT));
  });

  it('a worst-case result of eleven scenarios fits into 7 000 characters and parses back', () => {
    const result = worstCase(11);
    expect(result.env.ua.length).toBe(200);
    expect(result.env.gpu.length).toBe(200);
    const url = issueUrl(result);
    expect(url.length).toBeLessThanOrEqual(BENCH_ISSUE_URL_MAX);
    // What the browser sends is no longer than what was built.
    expect(new URL(url).href.length).toBeLessThanOrEqual(BENCH_ISSUE_URL_MAX);
    expect(parseIssueBody(bodyOf(url))).toEqual(result);
    expect(new URL(url).searchParams.get('labels')).toBe('perf-run');
    expect(new URL(url).searchParams.get('title')).toMatch(/^Performance run: /);
  });

  it('a result that cannot fit goes without its JSON', () => {
    const result = worstCase(30);
    const url = issueUrl(result);
    expect(url.length).toBeLessThanOrEqual(BENCH_ISSUE_URL_MAX);
    const body = bodyOf(url);
    expect(body).toBe(issueText(result, false));
    expect(body).toContain(FULL_DATA_LINE);
    expect(body).toContain('|Scenario|Distance|Light|');
    expect(body.split('\n').filter((line) => line.startsWith('|')).length).toBe(32);
    expect(body).not.toContain(ISSUE_MARKER);
    expect(body).not.toContain('```');
    // The copied text still carries everything.
    expect(parseIssueBody(issueText(result))).toEqual(result);
  });

  it('a result too long even for its table keeps the verdict', () => {
    const url = issueUrl(worstCase(64));
    expect(url.length).toBeLessThanOrEqual(BENCH_ISSUE_URL_MAX);
    expect(bodyOf(url)).toBe(`**Web Workers (Part C): borderline**\n\n${FULL_DATA_LINE}`);
  });
});
