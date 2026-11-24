// Test helper (unit tests only): a host and guests over the memory transport with a fake
// clock, each guest with its own world built from what the host sent.
import type { Action } from '../actions/actions';
import type { ActionResult, BlockChange } from '../actions/apply';
import type { GameMode, PlayerRecord } from '../actions/playerRecord';
import { createPlayerRecord } from '../actions/playerRecord';
import { findSpawn } from '../world/generation/spawn';
import { getTerrain, terrainChecksum } from '../world/generation/terrain';
import { World } from '../world/World';
import { CLASSIC_GEN, type WorldGen, worldGenOf } from '../world/generation/worldOptions';
import { ClientSession, type ClientStatus, type EndReason } from '../net/ClientSession';
import { HostSession, type PeerEvent } from '../net/HostSession';
import { MemoryNetwork, type MemorySignaling } from '../net/memoryTransport';
import type { NetPose, Welcome } from '../net/protocol';
import type { GuestEntry } from '../save/saveFormat';
import { playerKeyFromBytes, roomPeerId } from '../net/roomCode';
import { lookForKey } from '../player/looks';
import { worldHash } from '../net/snapshot';
import { EMPTY_PROGRESS, type ProgressOutcome, type WorldProgress } from '../progress/progress';

export const BUILD = 'test123';
export const CODE = 'ABCDEF';

/** Runs all promise callbacks that are due (the sessions' `await`s). */
export function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export interface Answer {
  action: Action;
  result: ActionResult;
}

export interface RigGuest {
  client: ClientSession;
  world: World | null;
  answers: Answer[];
  blocks: BlockChange[][];
  peers: PeerEvent[];
  statuses: ClientStatus[];
  ends: EndReason[];
  worlds: number;
  key: string;
  /** The last welcome the guest got. */
  welcome: Welcome | null;
  /** The book and the outcomes the guest's screen was told (Adventure). */
  progress: WorldProgress;
  outcomes: ProgressOutcome[];
}

export interface RigOptions {
  seed?: number;
  mode?: GameMode;
  minDelayMs?: number;
  maxDelayMs?: number;
  netSeed?: number;
  frozen?: boolean;
  time?: number;
  /** Guests the world remembers (its saved record). */
  guests?: GuestEntry[];
  /** The host world's generator (version 1 if left out). */
  gen?: WorldGen;
  /** The generator of the checksum the host sends, if it is to differ (a forged welcome). */
  checksumGen?: WorldGen;
  /** The world's task book when the room opens (Adventure). */
  progress?: WorldProgress;
  /** The host's record when the room opens; a fresh one if left out. */
  hostRecord?: PlayerRecord;
}

/** The fake wall clock of a rig: milliseconds since 1970 at its start, plus the fake time. */
export const RIG_EPOCH_MS = 1_800_000_000_000;

export class Rig {
  readonly net: MemoryNetwork;
  readonly world: World;
  readonly host: HostSession;
  readonly hostSignaling: MemorySignaling;
  hostPose: NetPose;
  /** The host's player flies or holds break (read like its pose). */
  hostFlags = { fly: false, busy: false };
  readonly hostAnswers: Answer[] = [];
  readonly hostPeers: PeerEvent[] = [];
  hostRecord: PlayerRecord;
  /** The book and the outcomes the host's screen was told (Adventure). */
  hostProgress: WorldProgress;
  readonly hostOutcomes: ProgressOutcome[] = [];
  readonly guests: RigGuest[] = [];
  private keyCounter = 1;
  private idCounter = 0;

  constructor(options: RigOptions = {}) {
    const seed = options.seed ?? 1337;
    const mode = options.mode ?? 'creative';
    this.net = new MemoryNetwork({
      seed: options.netSeed ?? 1,
      minDelayMs: options.minDelayMs ?? 5,
      maxDelayMs: options.maxDelayMs ?? 20,
    });
    const gen = options.gen ?? CLASSIC_GEN;
    this.world = new World(seed, gen);
    const spawn = findSpawn(getTerrain(seed, gen));
    for (let cz = -2; cz <= 2; cz++) {
      for (let cx = -2; cx <= 2; cx++) this.world.generate(cx, cz);
    }
    this.hostPose = { x: spawn.x + 0.5, y: spawn.y, z: spawn.z + 0.5, yaw: 0, pitch: 0 };
    this.hostRecord = options.hostRecord ?? createPlayerRecord(mode);
    this.hostProgress = options.progress ?? EMPTY_PROGRESS;
    this.host = new HostSession({
      build: BUILD,
      world: this.world,
      mode,
      worldName: 'Shared',
      checksum: terrainChecksum(seed, options.checksumGen ?? gen),
      hostName: 'Hosta',
      hostKey: playerKeyFromBytes([0xff]),
      hostRecord: this.hostRecord,
      hostPose: () => this.hostPose,
      hostLook: 4,
      hostFlags: () => this.hostFlags,
      time: options.time ?? 0.25,
      frozen: options.frozen ?? false,
      clock: () => this.net.nowMs,
      wallClock: () => RIG_EPOCH_MS + this.net.nowMs,
      guests: options.guests,
      progress: options.progress,
      listener: {
        onBlocks: () => {},
        onPlayer: (record) => {
          this.hostRecord = record;
        },
        onResult: (action, result) => this.hostAnswers.push({ action, result }),
        onProgress: (progress, outcomes) => {
          this.hostProgress = progress;
          this.hostOutcomes.push(...outcomes);
        },
        onPeer: (event) => this.hostPeers.push(event),
      },
    });
    this.hostSignaling = this.net.signaling();
    this.hostSignaling.onConnection = (conn) => this.host.accept(conn);
  }

  async open(): Promise<void> {
    await this.settle(this.hostSignaling.open(roomPeerId(BUILD, CODE)));
  }

  /** Runs the clock until `promise` settles (at most a minute of fake time). */
  async settle<T>(promise: Promise<T>): Promise<T> {
    let done = false;
    const watched = promise.finally(() => {
      done = true;
    });
    for (let t = 0; t < 60_000 && !done; t += 10) await this.run(10);
    return watched;
  }

  /** A guest that has not joined yet. */
  guest(
    options: {
      key?: string;
      name?: string;
      look?: number;
      build?: string;
      checksum?: number;
    } = {},
  ): RigGuest {
    const key = options.key ?? playerKeyFromBytes([this.keyCounter++]);
    const guest: RigGuest = {
      client: null as unknown as ClientSession,
      world: null,
      answers: [],
      blocks: [],
      peers: [],
      statuses: [],
      ends: [],
      worlds: 0,
      key,
      welcome: null,
      progress: EMPTY_PROGRESS,
      outcomes: [],
    };
    guest.client = new ClientSession({
      network: { signaling: () => this.net.signaling(), directory: this.net.directory() },
      build: options.build ?? BUILD,
      key,
      name: options.name ?? `Guest${this.keyCounter}`,
      look: options.look ?? lookForKey(key),
      code: CODE,
      randomBytes: (n) =>
        Array.from({ length: n }, (_, i) =>
          i === 0 ? ++this.idCounter : (key.charCodeAt(i) ?? 0),
        ),
      clock: () => this.net.nowMs,
      checksum: (seed, gen) => options.checksum ?? terrainChecksum(seed, gen),
      listener: {
        onWorld: (welcome, edits) => {
          guest.welcome = welcome;
          const gen = worldGenOf(welcome.generatorVersion, welcome.options);
          if (!gen) throw new Error('The welcome has no known generator');
          guest.world = new World(welcome.seed, gen, edits);
          // The chunks around the start, as the guest's chunk manager would load them.
          for (let cz = -2; cz <= 2; cz++) {
            for (let cx = -2; cx <= 2; cx++) guest.world.generate(cx, cz);
          }
          guest.worlds++;
          return guest.world;
        },
        onBlocks: (changes) => guest.blocks.push([...changes]),
        onPlayer: () => {},
        onResult: (action, result) => guest.answers.push({ action, result }),
        onProgress: (progress, outcomes) => {
          guest.progress = progress;
          guest.outcomes.push(...outcomes);
        },
        onPeer: (event) => guest.peers.push(event),
        onStatus: (status) => guest.statuses.push(status),
        onEnd: (reason) => guest.ends.push(reason),
      },
    });
    this.guests.push(guest);
    return guest;
  }

  /** Joins a guest and runs the clock until it settles; returns the error reason or null. */
  async join(guest: RigGuest, ms = 400): Promise<string | null> {
    let outcome: string | null | undefined;
    guest.client.join().then(
      () => {
        outcome = null;
      },
      (error: { reason?: string }) => {
        outcome = error.reason ?? 'error';
      },
    );
    for (let t = 0; t < ms && outcome === undefined; t += 10) await this.run(10);
    if (outcome === undefined) throw new Error('join did not settle');
    return outcome;
  }

  /** Advances the clock in steps of 10 ms, updating everyone, and lets promises run. */
  async run(ms: number, frames = true): Promise<void> {
    for (let left = ms; left > 0; left -= 10) {
      this.net.advance(Math.min(10, left));
      if (frames) this.host.update(this.net.nowMs);
      for (const g of this.guests) g.client.update(this.net.nowMs);
      await flush();
    }
  }

  hostHash(): number {
    return worldHash(this.world.edits);
  }

  guestHash(guest: RigGuest): number {
    return guest.world ? worldHash(guest.world.edits) : -1;
  }
}
