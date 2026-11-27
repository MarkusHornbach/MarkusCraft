// The circle's task focus (Phase 8B1 AC1.5) and the Map tab's pure helpers.
import { describe, expect, it } from 'vitest';
import { Block } from '../world/blocks';
import { TASKS } from '../progress/tables';
import { radarFocus } from './focus';
import { RADAR_KINDS } from './kinds';
import {
  hintText,
  legendText,
  mapColour,
  MAP_UNKNOWN,
  shadeColour,
  surfaceShade,
  topBlockOf,
} from './map';
import { CHUNK_VOLUME, SEA_LEVEL } from '../game/config';

function task(id: number) {
  const t = TASKS.find((x) => x.id === id);
  if (!t) throw new Error(`no task ${id}`);
  return t;
}

describe('radarFocus', () => {
  it('Phase 8B1 AC1.5 follows a tracked mine task of a radar resource', () => {
    expect(radarFocus(task(12))?.key).toBe('coal');
    expect(radarFocus(task(16))?.key).toBe('iron');
    expect(radarFocus(task(1))).toBeNull();
    expect(radarFocus(task(6))).toBeNull();
    expect(radarFocus(task(11))).toBeNull();
    expect(radarFocus(task(8))).toBeNull();
    expect(radarFocus(null)).toBeNull();
  });
});

describe('map helpers', () => {
  it('colours top blocks, shades by height and finds the top block', () => {
    expect(mapColour(Block.WATER)).not.toBe(mapColour(Block.SAND));
    expect(mapColour(Block.GRASS)).not.toBe(mapColour(Block.STONE));
    expect(mapColour(Block.TORCH)).toBe(MAP_UNKNOWN);
    expect(surfaceShade(SEA_LEVEL + 30)).toBeGreaterThan(surfaceShade(SEA_LEVEL));
    expect(surfaceShade(0)).toBeGreaterThanOrEqual(0.55);
    expect(shadeColour(0x808080, 2)).toBe(0xffffff);
    expect(shadeColour(0x804020, 0.5)).toBe(0x402010);
    const blocks = new Uint8Array(CHUNK_VOLUME);
    expect(topBlockOf(blocks, 3, 4)).toBe(-1);
    blocks[3 + 4 * 16 + 70 * 256] = Block.LEAVES;
    blocks[3 + 4 * 16 + 60 * 256] = Block.GRASS;
    expect(topBlockOf(blocks, 3, 4)).toBe(Block.LEAVES | (70 << 8));
  });

  it('writes the legend texts', () => {
    const [coal, iron] = RADAR_KINDS;
    const entry = { kind: 'coal', dx: 3, dy: -2, dz: 6, dist: 7.02, hint: { exact: -2 } } as const;
    expect(legendText(coal, entry, null, 96)).toBe('Coal · 7 blocks · 2 below');
    expect(legendText(iron, null, { kind: 'iron', dx: 70, dz: 1, dist: 70.3 }, 96)).toBe(
      'Iron · 70 blocks · far',
    );
    expect(legendText(iron, null, null, 96)).toBe('Iron · none within 96');
    expect(hintText('none')).toBe('far');
    expect(hintText({ coarse: 'up' })).toBe('above');
    expect(hintText({ coarse: 'down' })).toBe('below');
    expect(hintText({ coarse: 'level' })).toBe('level');
    expect(hintText({ exact: 0 })).toBe('level');
    expect(hintText({ exact: 3 })).toBe('3 above');
    expect(legendText(coal, { ...entry, dist: 1, hint: { exact: 0 } }, null, 96)).toBe(
      'Coal · 1 block · level',
    );
  });
});
