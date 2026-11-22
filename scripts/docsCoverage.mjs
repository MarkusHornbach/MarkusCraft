// Dev tool: lists every name in backticks and every bold bullet title of an old CLAUDE.md
// that appears in none of today's rule files (root and nested CLAUDE.md, architecture and
// testing docs). Usage: node scripts/docsCoverage.mjs <old CLAUDE.md>
// The old file comes from `git show <base>:CLAUDE.md`.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP_DIRS = ['node_modules', 'dist', 'coverage', 'test-results', 'playwright-report', '.git'];
const EXTRA_DOCS = ['docs/architecture.md', 'docs/testing.md'];

/** Names in backticks and bold bullet titles (`- **Title.**`, the trailing period dropped). */
function collectNames(text) {
  const names = new Set();
  for (const match of text.matchAll(/`([^`\n]+)`/g)) names.add(match[1].trim());
  for (const match of text.matchAll(/^\s*- \*\*([^*]+)\*\*/gm)) {
    names.add(match[1].trim().replace(/[.:]$/, ''));
  }
  return [...names].filter((name) => name !== '');
}

function claudeFiles(root, dir = '') {
  const files = [];
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = dir === '' ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.includes(entry.name)) files.push(...claudeFiles(root, path));
    } else if (entry.name === 'CLAUDE.md') {
      files.push(path);
    }
  }
  return files;
}

function main() {
  const oldPath = process.argv[2];
  if (!oldPath) {
    console.error('usage: node scripts/docsCoverage.mjs <old CLAUDE.md>');
    process.exitCode = 2;
    return;
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const sources = [...claudeFiles(root), ...EXTRA_DOCS].filter((path) =>
    existsSync(join(root, path)),
  );
  // Prettier may wrap a title or a long name over two lines: compare with single spaces.
  const flat = (text) => text.replace(/\s+/g, ' ');
  const corpus = flat(sources.map((path) => readFileSync(join(root, path), 'utf8')).join('\n'));
  const names = collectNames(readFileSync(oldPath, 'utf8'));
  const missing = names.filter((name) => !corpus.includes(flat(name)));
  console.log(`searched: ${sources.join(', ')}`);
  console.log(`${names.length} names in the old file, ${missing.length} not found:`);
  for (const name of missing) console.log(`  ${name}`);
}

main();
