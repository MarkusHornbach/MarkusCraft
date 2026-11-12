// Block interaction rules: what breaking a block leaves behind, and where placing is allowed.
import { WORLD_HEIGHT } from '../game/config';
import { BLOCK_REPLACEABLE, Block, getBlockDef } from '../world/blocks';
import { playerIntersectsBlock } from './physics';
import type { PlayerState } from './player';

export interface BlockReader {
  getBlock(x: number, y: number, z: number): number;
}

/**
 * The block id that replaces a broken block, or null if it cannot be broken. A hole next
 * to (or under) water fills with water, so digging at the shore does not leave dry pits.
 */
export function breakResult(world: BlockReader, x: number, y: number, z: number): number | null {
  if (y < 0 || y >= WORLD_HEIGHT) return null;
  if (!getBlockDef(world.getBlock(x, y, z)).breakable) return null;
  const wet =
    world.getBlock(x + 1, y, z) === Block.WATER ||
    world.getBlock(x - 1, y, z) === Block.WATER ||
    world.getBlock(x, y, z + 1) === Block.WATER ||
    world.getBlock(x, y, z - 1) === Block.WATER ||
    world.getBlock(x, y + 1, z) === Block.WATER;
  return wet ? Block.WATER : Block.AIR;
}

/**
 * Whether a block may be placed into cell (x, y, z): inside the height range, into air or
 * water, and not where the player stands.
 */
export function canPlace(
  world: BlockReader,
  player: PlayerState,
  x: number,
  y: number,
  z: number,
): boolean {
  if (y < 0 || y >= WORLD_HEIGHT) return false;
  if (BLOCK_REPLACEABLE[world.getBlock(x, y, z)] !== 1) return false;
  return !playerIntersectsBlock(player, x, y, z);
}
