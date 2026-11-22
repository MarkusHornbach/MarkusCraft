// Unit tests of the `changes` job's decision: which runs need the full suite.
import { describe, expect, it } from 'vitest';
import { decideFull, isDocsOnly, parseFileList } from './changes.mjs';

describe('isDocsOnly', () => {
  it('is true when every file ends in .md, anywhere in the tree', () => {
    expect(isDocsOnly(['docs/ci-1-plan.md', 'CLAUDE.md', 'README.md'])).toBe(true);
  });

  it('is false for a mixed list', () => {
    expect(isDocsOnly(['docs/ci-1-report.md', '.github/workflows/ci.yml'])).toBe(false);
  });

  it('is false for an empty or unreadable list', () => {
    expect(isDocsOnly([])).toBe(false);
    expect(isDocsOnly(null)).toBe(false);
  });

  it('looks at the extension, not at a folder or a name containing md', () => {
    expect(isDocsOnly(['docs/notes.mdx'])).toBe(false);
    expect(isDocsOnly(['md/file.ts'])).toBe(false);
  });
});

describe('decideFull', () => {
  const main = 'refs/heads/main';
  const branch = 'refs/heads/ccr-branch';

  it('runs everything on a push to main, docs-only or not', () => {
    expect(decideFull({ event: 'push', ref: main, files: null })).toBe(true);
    expect(decideFull({ event: 'push', ref: main, files: ['README.md'] })).toBe(true);
  });

  it('runs only the fast checks on a push to another branch', () => {
    expect(decideFull({ event: 'push', ref: branch, files: null })).toBe(false);
    expect(decideFull({ event: 'push', ref: branch, files: ['src/main.ts'] })).toBe(false);
  });

  it('skips the browser tests of a docs-only pull request', () => {
    const files = ['docs/ci-1-report.md', 'CLAUDE.md'];
    expect(decideFull({ event: 'pull_request', ref: 'refs/pull/7/merge', files })).toBe(false);
  });

  it('runs everything for a pull request with any other file', () => {
    const files = ['docs/ci-1-report.md', 'scripts/ci/changes.mjs'];
    expect(decideFull({ event: 'pull_request', ref: 'refs/pull/7/merge', files })).toBe(true);
  });

  it('runs everything for a pull request whose list is empty or unreadable', () => {
    expect(decideFull({ event: 'pull_request', ref: 'refs/pull/7/merge', files: [] })).toBe(true);
    expect(decideFull({ event: 'pull_request', ref: 'refs/pull/7/merge', files: null })).toBe(true);
  });

  it('runs everything for an event the workflow does not expect', () => {
    expect(decideFull({ event: 'workflow_dispatch', ref: branch, files: null })).toBe(true);
  });
});

describe('parseFileList', () => {
  it('splits the output of git diff and drops blank lines', () => {
    expect(parseFileList('CLAUDE.md\n docs/a.md \n\n')).toEqual(['CLAUDE.md', 'docs/a.md']);
    expect(parseFileList('')).toEqual([]);
  });
});
