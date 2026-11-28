// Docs budget: sizes of the root and nested CLAUDE.md files and of the device test lists,
// and every repository path written in backticks in a CLAUDE.md or a device test list must
// exist.
// @ts-check
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The root CLAUDE.md fails above this many bytes and warns above `ROOT_WARN`. */
export const ROOT_LIMIT = 25000;
export const ROOT_WARN = 22500;
/** Every nested CLAUDE.md fails above this many bytes and warns above `NESTED_WARN`. */
export const NESTED_LIMIT = 8000;
export const NESTED_WARN = 7200;
/**
 * The device test lists (the second from Phase 8 part B3 on) are not loaded by themselves:
 * they only warn.
 */
export const DEVICE_TESTS = ['docs/device-tests.md', 'docs/device-tests-2.md'];
export const DEVICE_WARN = 25000;

/** Directories never searched for nested CLAUDE.md files. */
export const SKIP_DIRS = [
  'node_modules',
  'dist',
  'coverage',
  'test-results',
  'playwright-report',
  '.git',
];

/** Prefixes of repository paths that the link check looks at. */
export const PATH_PREFIXES = ['src/', 'e2e/', 'docs/', 'scripts/', '.github/'];

/** Files at the root that a backtick token may name without a folder. */
export const ROOT_FILES = [
  'CLAUDE.md',
  'README.md',
  'package.json',
  'package-lock.json',
  'index.html',
  'vite.config.ts',
  'playwright.config.ts',
  'tsconfig.json',
  'eslint.config.js',
  '.nvmrc',
];

/** Documented placeholders: a token containing one is a pattern, not a path. */
export const PLACEHOLDERS = ['phase-N-', '-Na-'];

/**
 * @typedef {{ path: string, bytes: number }} SizedFile
 * @typedef {{ level: 'error' | 'warning', file: string, message: string }} Finding
 * @typedef {{ file: string, path: string }} PathRef
 * @typedef {{ name: string, dir: boolean }} DirEntry
 */

/**
 * The limits of one file, or null if the budget does not cover it.
 * @param {string} path repository-relative, with `/`
 * @returns {{ fail: number | null, warn: number } | null}
 */
export function limitsFor(path) {
  if (path === 'CLAUDE.md') return { fail: ROOT_LIMIT, warn: ROOT_WARN };
  if (path.endsWith('/CLAUDE.md')) return { fail: NESTED_LIMIT, warn: NESTED_WARN };
  if (DEVICE_TESTS.includes(path)) return { fail: null, warn: DEVICE_WARN };
  return null;
}

/**
 * Size findings: an error above a fail limit, a warning above a warn limit.
 * @param {readonly SizedFile[]} files
 * @returns {Finding[]}
 */
export function checkSizes(files) {
  /** @type {Finding[]} */
  const findings = [];
  for (const file of files) {
    const limits = limitsFor(file.path);
    if (limits === null) continue;
    if (limits.fail !== null && file.bytes > limits.fail) {
      findings.push({
        level: 'error',
        file: file.path,
        message: `${file.bytes} bytes, above the limit of ${limits.fail}`,
      });
    } else if (file.bytes > limits.warn) {
      const what = limits.fail === null ? 'the limit' : `90 % of the limit of ${limits.fail}`;
      findings.push({
        level: 'warning',
        file: file.path,
        message: `${file.bytes} bytes, above ${what} (${limits.warn})`,
      });
    }
  }
  return findings;
}

/**
 * Whether a backtick token names a repository path the link check should look at.
 * @param {string} token
 */
export function isPathToken(token) {
  if (/[<>*…{ ]/.test(token)) return false;
  if (PLACEHOLDERS.some((placeholder) => token.includes(placeholder))) return false;
  if (ROOT_FILES.includes(token)) return true;
  return PATH_PREFIXES.some((prefix) => token.startsWith(prefix));
}

/**
 * The repository paths written in backticks in a Markdown text, without `:line` suffixes.
 * Fenced code blocks are left out (their backticks are no inline code).
 * @param {string} text
 * @returns {string[]}
 */
export function findPathRefs(text) {
  const prose = text.replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, '');
  /** @type {string[]} */
  const refs = [];
  for (const match of prose.matchAll(/`([^`\n]+)`/g)) {
    const token = match[1].trim().replace(/:\d+(?::\d+)?$/, '');
    if (isPathToken(token) && !refs.includes(token)) refs.push(token);
  }
  return refs;
}

/**
 * An error for every reference whose path does not exist.
 * @param {readonly PathRef[]} refs
 * @param {(path: string) => boolean} exists
 * @returns {Finding[]}
 */
export function checkLinks(refs, exists) {
  return refs
    .filter((ref) => !exists(ref.path))
    .map((ref) => ({
      level: /** @type {const} */ ('error'),
      file: ref.file,
      message: `\`${ref.path}\` does not exist`,
    }));
}

/**
 * One output line: a GitHub Actions annotation in CI, a plain line otherwise.
 * @param {Finding} finding
 * @param {boolean} ci
 */
export function formatFinding(finding, ci) {
  if (ci) return `::${finding.level} file=${finding.file}::${finding.message}`;
  return `${finding.level}: ${finding.file}: ${finding.message}`;
}

/**
 * Exit code of a run: 1 on any error, 0 with warnings only.
 * @param {readonly Finding[]} findings
 */
export function exitCodeFor(findings) {
  return findings.some((finding) => finding.level === 'error') ? 1 : 0;
}

/**
 * Every CLAUDE.md below the root, the root's own first, skipping `SKIP_DIRS`.
 * @param {(dir: string) => DirEntry[]} readDir lists a repository-relative folder ('' is the root)
 * @returns {string[]}
 */
export function findClaudeFiles(readDir) {
  /** @type {string[]} */
  const found = [];
  /** @param {string} dir */
  const walk = (dir) => {
    const entries = [...readDir(dir)].sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = dir === '' ? entry.name : `${dir}/${entry.name}`;
      if (entry.dir) {
        if (!SKIP_DIRS.includes(entry.name)) walk(path);
      } else if (entry.name === 'CLAUDE.md') {
        found.push(path);
      }
    }
  };
  walk('');
  return found.sort((a, b) =>
    a === 'CLAUDE.md' ? -1 : b === 'CLAUDE.md' ? 1 : a.localeCompare(b),
  );
}

/**
 * The summary line: every checked file with its size and limit.
 * @param {readonly SizedFile[]} files
 */
export function summaryLine(files) {
  const parts = files.map((file) => {
    const limits = limitsFor(file.path);
    const limit = limits === null ? '' : `/${limits.fail ?? limits.warn}`;
    return `${file.path} ${file.bytes}${limit}`;
  });
  return `docs budget: ${parts.join(', ')}`;
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  /** @param {string} dir */
  const readDir = (dir) =>
    readdirSync(join(root, dir), { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      dir: entry.isDirectory(),
    }));
  const claudeFiles = findClaudeFiles(readDir);
  const sized = [...claudeFiles, ...DEVICE_TESTS]
    .filter((path) => existsSync(join(root, path)))
    .map((path) => ({ path, bytes: statSync(join(root, path)).size }));
  const linked = [...claudeFiles, ...DEVICE_TESTS.filter((path) => existsSync(join(root, path)))];
  /** @type {PathRef[]} */
  const refs = linked.flatMap((file) =>
    findPathRefs(readFileSync(join(root, file), 'utf8')).map((path) => ({ file, path })),
  );
  const findings = [
    ...checkSizes(sized),
    ...checkLinks(refs, (path) => existsSync(join(root, path))),
  ];
  const ci = process.env.GITHUB_ACTIONS === 'true';
  for (const finding of findings) console.log(formatFinding(finding, ci));
  console.log(summaryLine(sized));
  process.exitCode = exitCodeFor(findings);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
