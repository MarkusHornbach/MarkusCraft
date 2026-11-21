// How another player's figure moves (Phase 6 part D): from the drawn pose, the frame time,
// `fly`, `busy` and the block changes the player caused to the angles of head, body and
// limbs. One step per rendered frame per figure; a step allocates nothing.
import {
  FIGURE_BODY_TURN,
  FIGURE_HEAD_YAW_MAX,
  FIGURE_LEG_SWING,
  FIGURE_MAX_FRAME_MS,
  FIGURE_SETTLE_MS,
  FIGURE_SPEED_SMOOTH_MS,
  FIGURE_STAND_SPEED,
  FIGURE_STRIDE,
  FIGURE_SWING_ANGLE,
  FIGURE_SWING_MS,
  SNAP_DISTANCE,
  WALK_SPEED,
} from '../game/config';

/** What a figure receives for one frame. */
export interface MotionInput {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  nowMs: number;
  fly: boolean;
  busy: boolean;
  /** How many block changes the player caused so far (only its growth matters). */
  edits: number;
}

/** The angles to draw, in radians. Limb angles: positive swings the limb forward. */
export interface FigureAngles {
  bodyYaw: number;
  /** The head's yaw relative to the body. */
  headYaw: number;
  headPitch: number;
  leftArm: number;
  rightArm: number;
  leftLeg: number;
  rightLeg: number;
}

export function createAngles(): FigureAngles {
  return { bodyYaw: 0, headYaw: 0, headPitch: 0, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 };
}

const TAU = Math.PI * 2;

/** An angle in (−π, π]. */
export function wrapAngle(a: number): number {
  let r = a % TAU;
  if (r > Math.PI) r -= TAU;
  if (r <= -Math.PI) r += TAU;
  return r;
}

/** The state of one figure's motion. */
export class FigureMotion {
  private started = false;
  private lastMs = 0;
  private lastX = 0;
  private lastZ = 0;
  /** Smoothed horizontal velocity, blocks per second. */
  private vx = 0;
  private vz = 0;
  /** Current leg amplitude and step phase. */
  private amplitude = 0;
  private phase = 0;
  private bodyYaw = 0;
  /** Start of the running swing, or null. */
  private swingStartMs: number | null = null;
  private seenEdits = 0;

  /** One frame: writes the angles into `out`. */
  step(input: MotionInput, out: FigureAngles): void {
    if (!this.started) {
      this.started = true;
      this.lastMs = input.nowMs;
      this.lastX = input.x;
      this.lastZ = input.z;
      this.bodyYaw = input.yaw;
      this.seenEdits = input.edits;
    }
    const dtMs = Math.min(FIGURE_MAX_FRAME_MS, Math.max(0, input.nowMs - this.lastMs));
    this.lastMs = input.nowMs;
    const dx = input.x - this.lastX;
    const dz = input.z - this.lastZ;
    this.lastX = input.x;
    this.lastZ = input.z;
    const snapped = dx * dx + dz * dz > SNAP_DISTANCE * SNAP_DISTANCE;

    // Walking speed and direction, smoothed over a few frames.
    if (dtMs > 0) {
      const rawX = snapped ? 0 : (dx * 1000) / dtMs;
      const rawZ = snapped ? 0 : (dz * 1000) / dtMs;
      const k = 1 - Math.exp(-dtMs / FIGURE_SPEED_SMOOTH_MS);
      this.vx += (rawX - this.vx) * k;
      this.vz += (rawZ - this.vz) * k;
      if (snapped) this.vx = this.vz = 0;
    }
    let speed = Math.hypot(this.vx, this.vz);
    if (speed < FIGURE_STAND_SPEED) speed = 0;

    // Legs: the amplitude follows the speed (capped at walking speed) at a bounded rate,
    // so the limbs settle within `FIGURE_SETTLE_MS`; the phase follows the distance.
    const target = input.fly ? 0 : FIGURE_LEG_SWING * Math.min(1, speed / WALK_SPEED);
    const rate = (FIGURE_LEG_SWING / FIGURE_SETTLE_MS) * dtMs;
    if (input.fly) this.amplitude = 0;
    else if (this.amplitude < target) this.amplitude = Math.min(target, this.amplitude + rate);
    else this.amplitude = Math.max(target, this.amplitude - rate);
    if (!input.fly && !snapped) {
      this.phase = (this.phase + (TAU * speed * dtMs) / 1000 / FIGURE_STRIDE) % TAU;
    }
    const swing = this.amplitude * Math.sin(this.phase);
    // `+ 0` turns −0 into 0.
    out.leftLeg = swing + 0;
    out.rightLeg = -swing + 0;
    out.leftArm = -swing / 2 + 0;
    out.rightArm = swing / 2 + 0;

    // Body: towards the walking direction (backwards: away from it), then never more
    // than `FIGURE_HEAD_YAW_MAX` from the head.
    if (speed > 0 && !input.fly) {
      let towards = Math.atan2(-this.vx, -this.vz);
      if (Math.abs(wrapAngle(towards - input.yaw)) > Math.PI / 2) towards += Math.PI;
      const diff = wrapAngle(towards - this.bodyYaw);
      const turn = (FIGURE_BODY_TURN * dtMs) / 1000;
      this.bodyYaw = wrapAngle(this.bodyYaw + Math.max(-turn, Math.min(turn, diff)));
    }
    let head = wrapAngle(input.yaw - this.bodyYaw);
    if (head > FIGURE_HEAD_YAW_MAX) {
      this.bodyYaw = wrapAngle(input.yaw - FIGURE_HEAD_YAW_MAX);
      head = FIGURE_HEAD_YAW_MAX;
    } else if (head < -FIGURE_HEAD_YAW_MAX) {
      this.bodyYaw = wrapAngle(input.yaw + FIGURE_HEAD_YAW_MAX);
      head = -FIGURE_HEAD_YAW_MAX;
    }
    out.bodyYaw = this.bodyYaw;
    out.headYaw = head;
    out.headPitch = input.pitch;

    // Swing of the right arm: all the time while busy; once per block change otherwise.
    const now = input.nowMs;
    if (this.swingStartMs !== null && now - this.swingStartMs >= FIGURE_SWING_MS) {
      this.swingStartMs = input.busy ? this.swingStartMs + FIGURE_SWING_MS : null;
      // A long pause: start the cycle afresh.
      if (this.swingStartMs !== null && now - this.swingStartMs >= FIGURE_SWING_MS) {
        this.swingStartMs = now;
      }
    }
    const newEdit = input.edits !== this.seenEdits;
    this.seenEdits = input.edits;
    if (this.swingStartMs === null && (input.busy || newEdit)) this.swingStartMs = now;
    if (this.swingStartMs !== null) {
      const t = (now - this.swingStartMs) / FIGURE_SWING_MS;
      // Up in front, then down past the hip: the angle changes sign twice per swing.
      out.rightArm = FIGURE_SWING_ANGLE * Math.sin(TAU * t);
    }
  }
}
