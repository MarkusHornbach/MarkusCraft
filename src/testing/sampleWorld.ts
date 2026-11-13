// Test helper: a valid world record to start from.
import { createPlayerRecord } from '../actions/playerRecord';
import { SAVE_FORMAT_VERSION } from '../game/config';
import type { WorldMeta } from '../save/saveFormat';

export function sampleMeta(overrides: Partial<WorldMeta> = {}): WorldMeta {
  return {
    id: 'w1',
    name: 'My world',
    seed: 1337,
    mode: 'creative',
    generatorVersion: 1,
    formatVersion: SAVE_FORMAT_VERSION,
    createdMs: 1_700_000_000_000,
    playedMs: 1_700_000_100_000,
    time: 0.25,
    pose: { x: 0.5, y: 57, z: 4.5, yaw: 1, pitch: -0.5 },
    moveMode: 'walk',
    player: createPlayerRecord('creative'),
    ...overrides,
  };
}
