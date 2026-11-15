import { describe, expect, it } from 'vitest';
import { applyAction } from '../../actions/apply';
import type { Action } from '../../actions/actions';
import { createPlayerRecord } from '../../actions/playerRecord';
import { CHUNK_SIZE } from '../../game/config';
import { artificialGroup } from '../../testing/lightScenes';
import { COUNT, SIZE, boxOf, firstWrongCell, worldOf } from '../../testing/lightEdits';
import { TIMING_ENFORCED } from '../../testing/timing';
import { mulberry32, randInt } from '../../util/rng';
import { BLOCK_NEEDS_SUPPORT, Block, isSupport } from '../blocks';

describe('light after torch edits through the action layer', () => {
  it('Phase 4 AC6.8: 1 000 seeded actions with real torches keep the light equal to the slow check', () => {
    const world = worldOf(artificialGroup(91, COUNT, true));
    const box = boxOf(world);
    const rng = mulberry32(4401);
    const record = createPlayerRecord('creative');
    const slots = [...record.slots];
    slots[0] = { item: Block.TORCH, count: 1 };
    slots[1] = { item: Block.STONE, count: 1 };
    slots[2] = { item: Block.GLASS, count: 1 };
    const count = TIMING_ENFORCED ? 1000 : 250;
    const outcomes = new Map<string, number>();
    const tally = (key: string): void => void outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
    const torches: [number, number, number][] = [];
    for (let i = 0; i < count; i++) {
      // The middle chunk and its borders; the player hovers next to the cell. Some breaks
      // aim at the block under a torch placed before.
      let x = 2 * CHUNK_SIZE - 2 + randInt(rng, CHUNK_SIZE + 4);
      let z = 2 * CHUNK_SIZE - 2 + randInt(rng, CHUNK_SIZE + 4);
      let y = randInt(rng, 14);
      let roll = rng();
      if (roll < 0.1 && torches.length > 0) {
        [x, y, z] = torches[randInt(rng, torches.length)];
        y -= 1;
        roll = 0;
      }
      const action: Action =
        roll < 0.3
          ? { kind: 'break', x, y, z }
          : { kind: 'place', x, y, z, slot: roll < 0.75 ? 0 : roll < 0.9 ? 1 : 2 };
      const pose = { x: x + 0.5, y: y + 1, z: z + 0.5 };
      const result = applyAction(
        { world, mode: 'creative', pose, record: { ...record, slots }, players: [] },
        action,
        i,
      );
      tally(`${action.kind} ${result.ok ? 'ok' : result.reason}`);
      if (!result.ok) continue;
      if (result.blocks.length === 2) tally('carried');
      if (action.kind === 'place' && action.slot === 0) torches.push([x, y, z]);
      for (const change of result.blocks) {
        expect(world.setBlock(change.x, change.y, change.z, change.id)).toBe(true);
        box[change.x + change.z * SIZE + change.y * SIZE * SIZE] = change.id;
      }
      const wrong = firstWrongCell(world, box, 40);
      if (wrong) throw new Error(`action ${i} (${JSON.stringify(action)}): ${wrong}`);
    }
    expect(firstWrongCell(world, box)).toBeNull();
    // Every torch in the world stands on a solid cube.
    for (let x = 0; x < SIZE; x++) {
      for (let z = 0; z < SIZE; z++) {
        for (let y = 1; y < 20; y++) {
          if (BLOCK_NEEDS_SUPPORT[world.getBlock(x, y, z)] === 1) {
            expect(isSupport(world.getBlock(x, y - 1, z)), `${x} ${y} ${z}`).toBe(true);
          }
        }
      }
    }
    const scale = count / 1000;
    expect(outcomes.get('place ok') ?? 0).toBeGreaterThan(100 * scale);
    expect(outcomes.get('place support') ?? 0).toBeGreaterThan(20 * scale);
    expect(outcomes.get('carried') ?? 0).toBeGreaterThan(3 * scale);
  });
});
