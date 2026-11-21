// The simulated guests of the performance test's `players` scenario (Phase 6 part E): the
// page hosts a room over the memory transport, and three `ClientSession`s join it and play
// the scenario's guest script. Every message takes the real path (encode, relay, decode);
// time is the simulation's, so every device plays the same. Pure.
import type { BlockChange } from '../actions/apply';
import type { PlayerRecord } from '../actions/playerRecord';
import { BENCH_TIME, SIM_HZ } from '../game/config';
import { ClientSession } from '../net/ClientSession';
import { HostSession } from '../net/HostSession';
import { MemoryNetwork, type MemorySignaling } from '../net/memoryTransport';
import type { NetPose } from '../net/protocol';
import { playerKeyFromBytes, roomPeerId } from '../net/roomCode';
import { mulberry32 } from '../util/rng';
import type { World } from '../world/World';
import type { GuestScript } from './scenarios';

/** Build id and room code of the simulated room; nobody outside the page sees them. */
const SIM_BUILD = 'bench';
const SIM_CODE = 'BENCHX';
const STEP_MS = 1000 / SIM_HZ;

export interface SimRoomOptions {
  /** The page's world: the guests' edits are applied to it like any guest's. */
  world: World;
  hostPose: () => NetPose;
  hostRecord: PlayerRecord;
  script: GuestScript;
  /** The host set blocks for a guest: the page rebuilds the meshes. */
  onBlocks: (changes: readonly BlockChange[]) => void;
}

export class SimRoom {
  readonly host: HostSession;
  readonly guests: ClientSession[] = [];
  /** Actions the host refused (none in a correct script). */
  refused = 0;
  /** Actions the host accepted. */
  accepted = 0;
  /** The refused actions, for tests. */
  readonly refusals: { guest: number; action: unknown; reason: string }[] = [];
  private readonly net = new MemoryNetwork({ minDelayMs: 0, maxDelayMs: 0 });
  private readonly signaling: MemorySignaling;
  private readonly script: GuestScript;
  private joined = 0;
  private closed = false;

  constructor(options: SimRoomOptions) {
    this.script = options.script;
    const clock = (): number => this.net.nowMs;
    this.host = new HostSession({
      build: SIM_BUILD,
      world: options.world,
      mode: 'creative',
      worldName: 'Performance test',
      // Both sides compute nothing: the guests generate no terrain of their own.
      checksum: 0,
      hostName: 'You',
      hostKey: playerKeyFromBytes([0]),
      hostRecord: options.hostRecord,
      hostPose: options.hostPose,
      time: BENCH_TIME,
      frozen: true,
      clock,
      listener: {
        onBlocks: (changes) => options.onBlocks(changes),
        onPlayer: () => {},
        onResult: () => {},
        onPeer: () => {},
      },
    });
    this.signaling = this.net.signaling();
    this.signaling.onConnection = (conn) => this.host.accept(conn);
    const rng = mulberry32(1);
    const network = { signaling: () => this.net.signaling(), directory: this.net.directory() };
    options.script.looks.forEach((look, g) => {
      const client = new ClientSession({
        network,
        build: SIM_BUILD,
        key: playerKeyFromBytes([g + 1]),
        name: `Guest ${g + 1}`,
        look,
        code: SIM_CODE,
        randomBytes: (n) => Array.from({ length: n }, () => Math.floor(rng() * 256)),
        clock,
        checksum: () => 0,
        listener: {
          onWorld: () => ({ setBlock: () => true }),
          onBlocks: () => {},
          onPlayer: () => {},
          onResult: (action, result) => {
            if (result.ok) this.accepted++;
            else {
              this.refused++;
              this.refusals.push({ guest: g, action, reason: result.reason });
            }
          },
          onPeer: () => {},
          onStatus: () => {},
          onEnd: () => {},
        },
      });
      this.guests.push(client);
    });
    void this.signaling.open(roomPeerId(SIM_BUILD, SIM_CODE)).then(async () => {
      // One after the other, so the slots and ids follow the script's order.
      for (const client of this.guests) {
        if (this.closed) return;
        await client.join();
        this.joined++;
      }
    });
  }

  /** Every guest is in the room. */
  get ready(): boolean {
    return this.joined === this.guests.length;
  }

  /** The room's clock: what the figures are drawn by. */
  get nowMs(): number {
    return this.net.nowMs;
  }

  get roster(): HostSession['roster'] {
    return this.host.roster;
  }

  /** Work of a rendered frame: messages that are due (joining needs a few frames). */
  frame(): void {
    if (!this.closed) this.net.advance(0);
  }

  /** One simulation step: the guests move and act, then the room's clock moves on. */
  step(step: number, steps: number): void {
    if (this.closed || !this.ready) return;
    const now = this.net.nowMs;
    this.guests.forEach((client, g) => {
      const p = this.script.pose(g, step, steps);
      client.setPose(
        { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch },
        now,
        false,
        false,
        p.busy,
      );
      const action = this.script.action(g, step, steps);
      if (action) client.submit(action);
    });
    this.net.advance(STEP_MS);
    const after = this.net.nowMs;
    this.host.update(after);
    for (const client of this.guests) client.update(after);
  }

  /** Ends the room: the guests leave, the host closes. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const client of this.guests) {
      client.leave();
      client.dispose();
    }
    this.host.close();
    this.signaling.close();
    this.net.advance(0);
  }
}
