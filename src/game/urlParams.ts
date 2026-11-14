// URL parameters that make a session reproducible (seed, time of day, test mode).
import type { GameMode } from '../actions/playerRecord';
import { normalizeName } from '../save/saveFormat';
import { START_TIME_OF_DAY } from './config';

export interface GameParams {
  seed: number;
  /** True if the seed came from the URL rather than being random. */
  seedFromUrl: boolean;
  time: number;
  freeze: boolean;
  test: boolean;
  /** Forces touch mode: the touch controls are shown from the start. */
  touch: boolean;
  /** True if the URL names a time of day (it then applies to a newly created world). */
  timeFromUrl: boolean;
  /** With `test`: keep the world in IndexedDB instead of in memory. */
  save: boolean;
  /** With `save`: name of the world to open or create. */
  world: string;
  /** With `test`: game mode of a world the page creates (default Creative). */
  mode: GameMode;
}

/** Parses the query string. `randomSeed` supplies the seed when the URL has none. */
export function parseParams(search: string, randomSeed: () => number): GameParams {
  const query = new URLSearchParams(search);

  const seedText = query.get('seed');
  const parsedSeed = seedText !== null && /^-?\d+$/.test(seedText.trim()) ? Number(seedText) : NaN;
  const seedFromUrl = Number.isFinite(parsedSeed);
  // Seeds are unsigned 32-bit integers everywhere.
  const seed = (seedFromUrl ? parsedSeed : randomSeed()) >>> 0;

  const timeText = query.get('time');
  const parsedTime = timeText !== null && timeText.trim() !== '' ? Number(timeText) : NaN;
  const time = Number.isFinite(parsedTime) ? ((parsedTime % 1) + 1) % 1 : START_TIME_OF_DAY;

  return {
    seed,
    seedFromUrl,
    time,
    freeze: query.get('freeze') === '1',
    test: query.get('test') === '1',
    touch: query.get('touch') === '1',
    timeFromUrl: Number.isFinite(parsedTime),
    save: query.get('save') === '1',
    world: normalizeName(query.get('world') ?? '', 'Test'),
    mode: query.get('mode') === 'gathering' ? 'gathering' : 'creative',
  };
}
