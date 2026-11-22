// Unit tests of the docs budget: size limits, the warning band, the link check, the output.
import { describe, expect, it } from 'vitest';
import {
  checkLinks,
  checkSizes,
  exitCodeFor,
  findClaudeFiles,
  findPathRefs,
  formatFinding,
  summaryLine,
} from './docsBudget.mjs';

describe('checkSizes', () => {
  const one = (path: string, bytes: number) => checkSizes([{ path, bytes }]);

  it('lets the root pass at 25 000 bytes and fails it at 25 001', () => {
    expect(one('CLAUDE.md', 25000).map((f) => f.level)).toEqual(['warning']);
    expect(one('CLAUDE.md', 25001)).toEqual([
      { level: 'error', file: 'CLAUDE.md', message: '25001 bytes, above the limit of 25000' },
    ]);
  });

  it('is silent on the root at 22 500 bytes and warns at 22 501', () => {
    expect(one('CLAUDE.md', 22500)).toEqual([]);
    expect(one('CLAUDE.md', 22501)).toEqual([
      {
        level: 'warning',
        file: 'CLAUDE.md',
        message: '22501 bytes, above 90 % of the limit of 25000 (22500)',
      },
    ]);
  });

  it('holds a nested file to 8 000 bytes and warns above 7 200', () => {
    expect(one('src/net/CLAUDE.md', 7200)).toEqual([]);
    expect(one('src/net/CLAUDE.md', 7201).map((f) => f.level)).toEqual(['warning']);
    expect(one('src/net/CLAUDE.md', 8000).map((f) => f.level)).toEqual(['warning']);
    expect(one('src/net/CLAUDE.md', 8001).map((f) => f.level)).toEqual(['error']);
  });

  it('only warns about the device test list, above 25 000 bytes', () => {
    expect(one('docs/device-tests.md', 25000)).toEqual([]);
    expect(one('docs/device-tests.md', 25001).map((f) => f.level)).toEqual(['warning']);
    expect(one('docs/device-tests.md', 500000).map((f) => f.level)).toEqual(['warning']);
  });

  it('ignores files the budget does not cover', () => {
    expect(one('docs/architecture.md', 900000)).toEqual([]);
    expect(one('docs/CLAUDE.mdx', 900000)).toEqual([]);
  });
});

describe('findPathRefs', () => {
  it('finds paths in backticks and strips a :line suffix', () => {
    const text = 'See `src/net/protocol.ts:42` and `docs/phase-4-plan.md`, and `CLAUDE.md`.';
    expect(findPathRefs(text)).toEqual([
      'src/net/protocol.ts',
      'docs/phase-4-plan.md',
      'CLAUDE.md',
    ]);
  });

  it('strips a :line:column suffix too', () => {
    expect(findPathRefs('`e2e/game.ts:3:7`')).toEqual(['e2e/game.ts']);
  });

  it('skips tokens that are no repository paths', () => {
    const text =
      '`world/` `ui.css` `summary.md` `npm run check` `https://example.org/x` `Game.ts` `0.5`';
    expect(findPathRefs(text)).toEqual([]);
  });

  it('skips patterns and the documented placeholders', () => {
    const text = [
      '`docs/phase-N-report.md`',
      '`docs/phase-Na-report.md`',
      '`-Na-`',
      '`src/**/*.test.ts`',
      '`e2e/<name>.spec.ts`',
      '`docs/{a,b}.md`',
      '`docs/phase-…`',
      '`src/a b.ts`',
    ].join(' ');
    expect(findPathRefs(text)).toEqual([]);
  });

  it('accepts every known prefix and root files', () => {
    const text =
      '`src/a.ts` `e2e/b.ts` `docs/c.md` `scripts/d.mjs` `.github/workflows/ci.yml` `package.json` `README.md`';
    expect(findPathRefs(text)).toHaveLength(7);
  });

  it('lists a path once and ignores fenced code blocks', () => {
    const text = '`src/a.ts` and `src/a.ts`\n```\n`src/fenced.ts`\n```\n';
    expect(findPathRefs(text)).toEqual(['src/a.ts']);
  });
});

describe('checkLinks', () => {
  it('fails a missing path and names the file it is written in', () => {
    const exists = (path: string) => path === 'src/a.ts';
    const refs = [
      { file: 'CLAUDE.md', path: 'src/a.ts' },
      { file: 'src/net/CLAUDE.md', path: 'src/gone.ts' },
    ];
    expect(checkLinks(refs, exists)).toEqual([
      { level: 'error', file: 'src/net/CLAUDE.md', message: '`src/gone.ts` does not exist' },
    ]);
  });
});

describe('findClaudeFiles', () => {
  const tree: Record<string, { name: string; dir: boolean }[]> = {
    '': [
      { name: 'src', dir: true },
      { name: 'node_modules', dir: true },
      { name: 'CLAUDE.md', dir: false },
      { name: '.git', dir: true },
      { name: 'dist', dir: true },
    ],
    src: [
      { name: 'net', dir: true },
      { name: 'CLAUDE.mdx', dir: false },
    ],
    'src/net': [{ name: 'CLAUDE.md', dir: false }],
    node_modules: [{ name: 'CLAUDE.md', dir: false }],
    '.git': [{ name: 'CLAUDE.md', dir: false }],
    dist: [{ name: 'CLAUDE.md', dir: false }],
  };

  it('finds the root and nested files and skips the build and tool folders', () => {
    const readDir = (dir: string) => tree[dir] ?? [];
    expect(findClaudeFiles(readDir)).toEqual(['CLAUDE.md', 'src/net/CLAUDE.md']);
  });
});

describe('output', () => {
  const error = { level: 'error' as const, file: 'CLAUDE.md', message: 'too big' };
  const warning = { level: 'warning' as const, file: 'docs/device-tests.md', message: 'big' };

  it('writes job annotations under GitHub Actions', () => {
    expect(formatFinding(error, true)).toBe('::error file=CLAUDE.md::too big');
    expect(formatFinding(warning, true)).toBe('::warning file=docs/device-tests.md::big');
  });

  it('writes plain lines otherwise', () => {
    expect(formatFinding(error, false)).toBe('error: CLAUDE.md: too big');
    expect(formatFinding(warning, false)).toBe('warning: docs/device-tests.md: big');
  });

  it('exits with 1 on an error and 0 with warnings only', () => {
    expect(exitCodeFor([warning, error])).toBe(1);
    expect(exitCodeFor([warning])).toBe(0);
    expect(exitCodeFor([])).toBe(0);
  });

  it('names every file with its size and limit in one summary line', () => {
    const files = [
      { path: 'CLAUDE.md', bytes: 20000 },
      { path: 'src/net/CLAUDE.md', bytes: 7000 },
      { path: 'docs/device-tests.md', bytes: 21000 },
    ];
    expect(summaryLine(files)).toBe(
      'docs budget: CLAUDE.md 20000/25000, src/net/CLAUDE.md 7000/8000, docs/device-tests.md 21000/25000',
    );
  });
});
