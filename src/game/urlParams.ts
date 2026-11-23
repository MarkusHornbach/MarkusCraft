// URL parameters that make a session reproducible (seed, time of day, test mode).
import { isLookChoice } from '../player/looks';
import type { GameMode } from '../actions/playerRecord';
import { normalizeRoomCode } from '../net/roomCode';
import { normalizeName } from '../save/saveFormat';
import {
  CLASSIC_GEN,
  DEFAULT_WORLD_OPTIONS,
  type WorldGen,
  isTerrainShape,
  isTreeDensity,
} from '../world/generation/worldOptions';
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
  /**
   * With `test`: the generator of a world the page creates. Version 1 unless `terrain` or
   * `trees` names a valid value; then version 2, a missing option taking its default.
   */
  testGen: WorldGen;
  /**
   * With `test`: the task book of an Adventure world the page creates (Phase 8). `all`
   * (default): every task done and the maximum level; `fresh`: the book at its start.
   */
  progress: 'all' | 'fresh';
  /**
   * The performance test (never with `test`): `full` and `quick` open its start page
   * with that suite, `sample` shows the result screen with a built-in result.
   */
  bench: 'off' | 'full' | 'quick' | 'sample';
  /** A room code to join (`join=`), normalised; null if none or invalid. */
  join: string | null;
  /** A player name for multiplayer (`name=`); null keeps the stored one. */
  name: string | null;
  /** A choice of look (`look=`, 0–8, Part D); null keeps the stored one. */
  look: number | null;
  /** False with `previewgl=0`: the preview of "Your player" gets no WebGL (tests). */
  previewGl: boolean;
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

  const test = query.get('test') === '1';
  const benchText = query.get('bench');
  const bench =
    benchText === '1'
      ? 'full'
      : benchText === 'quick' || benchText === 'sample'
        ? benchText
        : 'off';

  return {
    seed,
    seedFromUrl,
    time,
    freeze: query.get('freeze') === '1',
    test,
    touch: query.get('touch') === '1',
    timeFromUrl: Number.isFinite(parsedTime),
    save: query.get('save') === '1',
    world: normalizeName(query.get('world') ?? '', 'Test'),
    mode: query.get('mode') === 'gathering' ? 'gathering' : 'creative',
    testGen: testGenParam(query.get('terrain'), query.get('trees')),
    progress: query.get('progress') === 'fresh' ? 'fresh' : 'all',
    bench: test ? 'off' : bench,
    join: normalizeRoomCode(query.get('join') ?? ''),
    name: query.get('name'),
    look: lookParam(query.get('look')),
    previewGl: query.get('previewgl') !== '0',
  };
}

function lookParam(text: string | null): number | null {
  if (text === null || !/^\d$/.test(text.trim())) return null;
  const look = Number(text);
  return isLookChoice(look) ? look : null;
}

/** `terrain=` and `trees=` (Phase 7 part A); invalid values are ignored. */
function testGenParam(terrainText: string | null, treesText: string | null): WorldGen {
  const terrain = isTerrainShape(terrainText) ? terrainText : null;
  const trees = isTreeDensity(treesText) ? treesText : null;
  if (terrain === null && trees === null) return CLASSIC_GEN;
  return {
    version: 2,
    options: {
      terrain: terrain ?? DEFAULT_WORLD_OPTIONS.terrain,
      trees: trees ?? DEFAULT_WORLD_OPTIONS.trees,
    },
  };
}
