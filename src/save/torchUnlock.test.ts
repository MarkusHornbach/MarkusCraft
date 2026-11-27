// Existing format-5 worlds after the torch's unlock moved to task 11 (Fix Adventure 1 AC1.3).
import { describe, expect, it } from 'vitest';
import { SAVE_FORMAT_VERSION } from '../game/config';
import { type WorldProgress, recipeUnlocked, unlockText } from '../progress/progress';
import { sampleMeta } from '../testing/sampleWorld';
import { type WorldMeta, decodeMeta, encodeMeta } from './saveFormat';

const TORCH = 20;
const CHAPTERS_1_2 = [1, 2, 3, 4, 5, 6, 7, 8];

function world(done: number[], crafted: number[]): WorldMeta {
  const meta = sampleMeta({ mode: 'gathering' });
  const progress: WorldProgress = { done, counts: [] };
  return { ...meta, player: { ...meta.player, xp: 200, crafted }, progress };
}

/** Stored as format 5 by the real encoder, read back as a load would. */
function load(meta: WorldMeta): WorldMeta {
  const stored = JSON.parse(JSON.stringify(encodeMeta(meta))) as unknown;
  const decoded = decodeMeta(stored);
  if (!decoded.ok) throw new Error(`world damaged: ${decoded.error}`);
  return decoded.value;
}

describe('existing worlds keep or gain the torch (Fix Adventure 1 AC1.3)', () => {
  const cases: [string, WorldMeta, boolean][] = [
    ['chapter 3, task 11 done', world([...CHAPTERS_1_2, 11], [11]), true],
    ['task 12 done, task 11 not, torch crafted', world([...CHAPTERS_1_2, 12], [TORCH]), true],
    ['task 12 done, task 11 not, never crafted', world([...CHAPTERS_1_2, 12], []), false],
    ['chapter 4 open', world([...CHAPTERS_1_2, 9, 10, 11, 12], []), true],
  ];

  it.each(cases)('Fix Adventure 1 AC1.3: %s', (_name, meta, unlocked) => {
    expect(SAVE_FORMAT_VERSION).toBe(6);
    expect(encodeMeta(meta).formatVersion).toBe(6);
    const loaded = load(meta);
    expect(loaded).toEqual(meta);
    expect(recipeUnlocked(TORCH, loaded.player, loaded.progress)).toBe(unlocked);
  });

  it('Fix Adventure 1 AC1.3: a locked torch names "Make 16 coal"', () => {
    expect(unlockText(TORCH)).toBe('Task: Make 16 coal');
  });
});
