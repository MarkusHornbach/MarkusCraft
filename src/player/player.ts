// Player state: position, velocity, orientation and movement mode. Plain data.
import { MAX_PITCH, PLAYER_EYE_HEIGHT } from '../game/config';
import { clamp } from '../util/math';

export type MoveMode = 'walk' | 'fly';

export interface PlayerState {
  /** Centre of the feet: the collision box extends ±0.3 in x/z and 1.8 upwards. */
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Radians. 0 looks towards -Z (north); positive turns left (counter-clockwise from above). */
  yaw: number;
  /** Radians. Positive looks up; clamped to ±89°. */
  pitch: number;
  mode: MoveMode;
  onGround: boolean;
  inWater: boolean;
  /** True if horizontal movement was blocked by a solid block in the last step. */
  againstWall: boolean;
}

export function createPlayer(x: number, y: number, z: number): PlayerState {
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    pitch: 0,
    mode: 'walk',
    onGround: false,
    inWater: false,
    againstWall: false,
  };
}

/** Applies a look delta in radians; pitch is clamped, yaw wraps into (-π, π]. */
export function applyLook(player: PlayerState, dYaw: number, dPitch: number): void {
  let yaw = (player.yaw + dYaw) % (Math.PI * 2);
  if (yaw > Math.PI) yaw -= Math.PI * 2;
  if (yaw <= -Math.PI) yaw += Math.PI * 2;
  player.yaw = yaw;
  player.pitch = clamp(player.pitch + dPitch, -MAX_PITCH, MAX_PITCH);
}

/** Unit view direction from yaw and pitch. */
export function viewDirection(yaw: number, pitch: number): [number, number, number] {
  const c = Math.cos(pitch);
  return [-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c];
}

export function eyeY(player: PlayerState): number {
  return player.y + PLAYER_EYE_HEIGHT;
}
