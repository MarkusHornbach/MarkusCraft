// Other players' poses as received, and the pose to draw at render time: buffered
// `INTERP_DELAY_MS` in the past, linear between two poses, yaw the short way round.
import { INTERP_DELAY_MS, SNAP_DISTANCE } from '../game/config';
import type { NetPose } from './protocol';

interface TimedPose extends NetPose {
  atMs: number;
  /** The player jumped here (teleport or a long way): no blending into this pose. */
  snap: boolean;
}

/** Poses kept per player: enough for the delay at 20 per second, with room for jitter. */
const KEEP = 16;

/** The angle `a` moved towards `b` by `f`, the short way round. */
export function lerpAngle(a: number, b: number, f: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  let r = a + d * f;
  if (r > Math.PI) r -= Math.PI * 2;
  if (r <= -Math.PI) r += Math.PI * 2;
  return r;
}

/** The received poses of one player. */
export class PoseBuffer {
  private readonly poses: TimedPose[] = [];

  /** A pose that arrived at `atMs`; `teleport` (or a jump beyond `SNAP_DISTANCE`) snaps. */
  push(pose: NetPose, atMs: number, teleport: boolean): void {
    const last = this.poses[this.poses.length - 1];
    const far =
      last !== undefined &&
      (pose.x - last.x) ** 2 + (pose.y - last.y) ** 2 + (pose.z - last.z) ** 2 >
        SNAP_DISTANCE * SNAP_DISTANCE;
    // Poses never go back in time, even if the clock was adjusted.
    const at = last ? Math.max(atMs, last.atMs) : atMs;
    this.poses.push({ ...pose, atMs: at, snap: teleport || far || last === undefined });
    if (this.poses.length > KEEP) this.poses.shift();
  }

  /** The newest pose received, or null. */
  get latest(): NetPose | null {
    const last = this.poses[this.poses.length - 1];
    return last ? strip(last) : null;
  }

  /** The pose to draw at `nowMs`, or null before the first pose. */
  sample(nowMs: number): NetPose | null {
    const poses = this.poses;
    if (poses.length === 0) return null;
    const t = nowMs - INTERP_DELAY_MS;
    if (t <= poses[0].atMs) return strip(poses[0]);
    for (let i = 1; i < poses.length; i++) {
      const b = poses[i];
      if (t > b.atMs) continue;
      const a = poses[i - 1];
      if (b.snap || b.atMs <= a.atMs) return strip(t >= b.atMs ? b : a);
      const f = (t - a.atMs) / (b.atMs - a.atMs);
      return {
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f,
        z: a.z + (b.z - a.z) * f,
        yaw: lerpAngle(a.yaw, b.yaw, f),
        pitch: a.pitch + (b.pitch - a.pitch) * f,
      };
    }
    // Starved: hold the last pose.
    return strip(poses[poses.length - 1]);
  }
}

function strip(p: TimedPose): NetPose {
  return { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch };
}

/** Another player as this device knows it. */
export interface RemotePlayer {
  id: number;
  name: string;
  slot: number;
  host: boolean;
  poses: PoseBuffer;
}

/** The other players of a room, with their pose buffers. */
export class RemoteRoster {
  private readonly players = new Map<number, RemotePlayer>();

  /** A player; without a pose it is not drawn until its first pose arrives. */
  add(
    id: number,
    name: string,
    slot: number,
    host: boolean,
    pose: NetPose | null,
    atMs: number,
  ): void {
    const poses = new PoseBuffer();
    if (pose) poses.push(pose, atMs, true);
    this.players.set(id, { id, name, slot, host, poses });
  }

  remove(id: number): RemotePlayer | null {
    const player = this.players.get(id) ?? null;
    this.players.delete(id);
    return player;
  }

  get(id: number): RemotePlayer | undefined {
    return this.players.get(id);
  }

  push(id: number, pose: NetPose, atMs: number, teleport: boolean): void {
    this.players.get(id)?.poses.push(pose, atMs, teleport);
  }

  clear(): void {
    this.players.clear();
  }

  list(): RemotePlayer[] {
    return [...this.players.values()].sort((a, b) => a.id - b.id);
  }
}
