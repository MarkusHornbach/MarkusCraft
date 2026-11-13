// Guards hard rule 1: no third-party game names or binary assets in the repository.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter((file) => file.length > 0);

// The asset rule itself has to name what it forbids; nothing else may.
const NAME_ALLOWED = (file: string): boolean =>
  file === 'CLAUDE.md' || file === 'README.md' || file.startsWith('docs/');
// Built from parts so this test file does not contain the words itself.
const FORBIDDEN = new RegExp(['mine' + 'craft', 'mo' + 'jang'].join('|'), 'i');

const BINARY_ASSET =
  /\.(png|jpe?g|gif|webp|bmp|ico|svg|avif|mp3|ogg|wav|flac|m4a|mp4|webm|ttf|otf|woff2?|eot)$/i;

describe('repository hygiene (AC12.4)', () => {
  it('lists tracked files', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files).toContain('src/main.ts');
  });

  it('contains no protected names outside the asset rule', () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (FORBIDDEN.test(file)) offenders.push(file);
      if (NAME_ALLOWED(file) || BINARY_ASSET.test(file)) continue;
      if (FORBIDDEN.test(readFileSync(file, 'utf8'))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('contains no image, audio or font files except the e2e reference screenshots (Phase 2 AC3.6)', () => {
    const assets = files.filter((file) => BINARY_ASSET.test(file));
    const unexpected = assets.filter((file) => !/^e2e\/screenshots\/[a-z-]+\.png$/.test(file));
    expect(unexpected).toEqual([]);
    // Ten reference screenshots: nine from Phases 1 and 2, `rocky-hill` from Phase 3 step 1.
    expect(assets.length).toBe(10);
  });
});
