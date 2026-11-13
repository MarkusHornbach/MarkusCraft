// Player physics: one fixed step of movement with axis-by-axis block collision.
import {
  AIR_ACCEL,
  FLY_ACCEL,
  FLY_SPEED,
  FLY_SPRINT_SPEED,
  GRAVITY,
  GROUND_ACCEL,
  JUMP_SPEED,
  MAX_FALL_SPEED,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  SPRINT_SPEED,
  SWIM_ACCEL,
  SWIM_EXIT_SPEED,
  SWIM_RISE_SPEED,
  SWIM_SINK_SPEED,
  SWIM_SPEED,
  SWIM_VERTICAL_ACCEL,
  VOID_Y,
  WALK_SPEED,
} from '../game/config';
import type { PlayerState } from './player';

export interface MoveInput {
  /** -1 (back) … 1 (forward). */
  forward: number;
  /** -1 (left) … 1 (right). */
  strafe: number;
  jump: boolean;
  sprint: boolean;
  /** Fly down. */
  descend: boolean;
}

export const NO_INPUT: MoveInput = {
  forward: 0,
  strafe: 0,
  jump: false,
  sprint: false,
  descend: false,
};

/** What physics needs to know about the world, at integer block coordinates. */
export interface PhysicsWorld {
  isSolidAt(x: number, y: number, z: number): boolean;
  isWaterAt(x: number, y: number, z: number): boolean;
}

const HALF = PLAYER_WIDTH / 2;
/** Tolerance for box edges that sit exactly on a block boundary. */
const EPS = 1e-6;

/** Moves `current` towards `target` by at most `maxDelta`. */
function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

function anySolid(
  world: PhysicsWorld,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
): boolean {
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (world.isSolidAt(x, y, z)) return true;
      }
    }
  }
  return false;
}

/**
 * Moves the box along Y by `d`. Only block layers the box newly enters are tested, so a
 * player who is already inside solid cells (e.g. terrain that just loaded around them)
 * is neither ejected nor able to go deeper. Returns true if the move was blocked.
 */
function moveY(p: PlayerState, d: number, world: PhysicsWorld): boolean {
  if (d === 0) return false;
  const x0 = Math.floor(p.x - HALF + EPS);
  const x1 = Math.floor(p.x + HALF - EPS);
  const z0 = Math.floor(p.z - HALF + EPS);
  const z1 = Math.floor(p.z + HALF - EPS);
  if (d < 0) {
    const last = Math.floor(p.y + d + EPS);
    for (let iy = Math.floor(p.y + EPS) - 1; iy >= last; iy--) {
      if (anySolid(world, x0, x1, iy, iy, z0, z1)) {
        p.y = iy + 1;
        return true;
      }
    }
  } else {
    const top = p.y + PLAYER_HEIGHT;
    const last = Math.floor(top + d - EPS);
    for (let iy = Math.floor(top - EPS) + 1; iy <= last; iy++) {
      if (anySolid(world, x0, x1, iy, iy, z0, z1)) {
        p.y = iy - PLAYER_HEIGHT;
        return true;
      }
    }
  }
  p.y += d;
  return false;
}

function moveX(p: PlayerState, d: number, world: PhysicsWorld): boolean {
  if (d === 0) return false;
  const y0 = Math.floor(p.y + EPS);
  const y1 = Math.floor(p.y + PLAYER_HEIGHT - EPS);
  const z0 = Math.floor(p.z - HALF + EPS);
  const z1 = Math.floor(p.z + HALF - EPS);
  if (d < 0) {
    const edge = p.x - HALF;
    const last = Math.floor(edge + d + EPS);
    for (let ix = Math.floor(edge + EPS) - 1; ix >= last; ix--) {
      if (anySolid(world, ix, ix, y0, y1, z0, z1)) {
        p.x = ix + 1 + HALF;
        return true;
      }
    }
  } else {
    const edge = p.x + HALF;
    const last = Math.floor(edge + d - EPS);
    for (let ix = Math.floor(edge - EPS) + 1; ix <= last; ix++) {
      if (anySolid(world, ix, ix, y0, y1, z0, z1)) {
        p.x = ix - HALF;
        return true;
      }
    }
  }
  p.x += d;
  return false;
}

function moveZ(p: PlayerState, d: number, world: PhysicsWorld): boolean {
  if (d === 0) return false;
  const y0 = Math.floor(p.y + EPS);
  const y1 = Math.floor(p.y + PLAYER_HEIGHT - EPS);
  const x0 = Math.floor(p.x - HALF + EPS);
  const x1 = Math.floor(p.x + HALF - EPS);
  if (d < 0) {
    const edge = p.z - HALF;
    const last = Math.floor(edge + d + EPS);
    for (let iz = Math.floor(edge + EPS) - 1; iz >= last; iz--) {
      if (anySolid(world, x0, x1, y0, y1, iz, iz)) {
        p.z = iz + 1 + HALF;
        return true;
      }
    }
  } else {
    const edge = p.z + HALF;
    const last = Math.floor(edge + d - EPS);
    for (let iz = Math.floor(edge - EPS) + 1; iz <= last; iz++) {
      if (anySolid(world, x0, x1, y0, y1, iz, iz)) {
        p.z = iz - HALF;
        return true;
      }
    }
  }
  p.z += d;
  return false;
}

/** True if the centre of the player's box is inside a water block. */
export function isInWater(p: PlayerState, world: PhysicsWorld): boolean {
  return world.isWaterAt(Math.floor(p.x), Math.floor(p.y + PLAYER_HEIGHT / 2), Math.floor(p.z));
}

/** Advances the player by one fixed time step `dt` (seconds). */
export function stepPlayer(
  p: PlayerState,
  input: MoveInput,
  world: PhysicsWorld,
  dt: number,
): void {
  p.inWater = isInWater(p, world);
  const swimming = p.mode === 'walk' && p.inWater;

  // Wish direction on the horizontal plane, from yaw. Diagonals are not faster.
  const sin = Math.sin(p.yaw);
  const cos = Math.cos(p.yaw);
  let wishX = -sin * input.forward + cos * input.strafe;
  let wishZ = -cos * input.forward - sin * input.strafe;
  const wishLength = Math.hypot(wishX, wishZ);
  if (wishLength > 1) {
    wishX /= wishLength;
    wishZ /= wishLength;
  }

  if (p.mode === 'fly') {
    const speed = input.sprint ? FLY_SPRINT_SPEED : FLY_SPEED;
    const vertical = (input.jump ? 1 : 0) - (input.descend ? 1 : 0);
    p.vx = approach(p.vx, wishX * speed, FLY_ACCEL * dt);
    p.vz = approach(p.vz, wishZ * speed, FLY_ACCEL * dt);
    p.vy = approach(p.vy, vertical * speed, FLY_ACCEL * dt);
  } else if (swimming) {
    p.vx = approach(p.vx, wishX * SWIM_SPEED, SWIM_ACCEL * dt);
    p.vz = approach(p.vz, wishZ * SWIM_SPEED, SWIM_ACCEL * dt);
    const target = input.jump ? SWIM_RISE_SPEED : -SWIM_SINK_SPEED;
    p.vy = approach(p.vy, target, SWIM_VERTICAL_ACCEL * dt);
  } else {
    const speed = input.sprint ? SPRINT_SPEED : WALK_SPEED;
    const accel = p.onGround ? GROUND_ACCEL : AIR_ACCEL;
    p.vx = approach(p.vx, wishX * speed, accel * dt);
    p.vz = approach(p.vz, wishZ * speed, accel * dt);
    if (input.jump && p.onGround) p.vy = JUMP_SPEED;
    p.vy = Math.max(p.vy - GRAVITY * dt, -MAX_FALL_SPEED);
  }

  // Climbing out: jumping against a bank while the feet are still in the water.
  if (p.mode === 'walk' && input.jump && p.againstWall) {
    const feetInWater = world.isWaterAt(Math.floor(p.x), Math.floor(p.y + EPS), Math.floor(p.z));
    if (feetInWater) p.vy = Math.max(p.vy, SWIM_EXIT_SPEED);
  }

  // Resolve Y first so standing on the ground is settled before sliding along walls.
  const dy = p.vy * dt;
  const blockedY = moveY(p, dy, world);
  p.onGround = blockedY && dy < 0;
  if (blockedY) p.vy = 0;

  const blockedX = moveX(p, p.vx * dt, world);
  if (blockedX) p.vx = 0;
  const blockedZ = moveZ(p, p.vz * dt, world);
  if (blockedZ) p.vz = 0;
  p.againstWall = blockedX || blockedZ;
}

/**
 * Safety net: a player who fell out of the world is put back to the spawn point.
 * Returns true if that happened.
 */
export function respawnIfFallen(
  p: PlayerState,
  spawn: { x: number; y: number; z: number },
): boolean {
  if (p.y >= VOID_Y) return false;
  p.x = spawn.x;
  p.y = spawn.y;
  p.z = spawn.z;
  p.vx = 0;
  p.vy = 0;
  p.vz = 0;
  return true;
}

/** True if the player's box overlaps the unit cube of block (bx, by, bz). */
export function playerIntersectsBlock(
  p: { x: number; y: number; z: number },
  bx: number,
  by: number,
  bz: number,
): boolean {
  return (
    p.x + HALF > bx + EPS &&
    p.x - HALF < bx + 1 - EPS &&
    p.y + PLAYER_HEIGHT > by + EPS &&
    p.y < by + 1 - EPS &&
    p.z + HALF > bz + EPS &&
    p.z - HALF < bz + 1 - EPS
  );
}
