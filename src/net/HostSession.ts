// The host of a room: its players with their records and poses, every action validated
// with `applyAction` against the acting player, the relay of blocks and poses, and the
// time of day. Pure: a later Node host can run it with any `Connection`.
import { type Action, decodeAction } from '../actions/actions';
import { type BlockChange, applyAction, heldItem } from '../actions/apply';
import {
  EMPTY_PROGRESS,
  type ProgressOutcome,
  type WorldProgress,
  stepProgress,
} from '../progress/progress';
import { type ProgressEvent, eventsOf } from '../progress/events';
import { type GameMode, type PlayerRecord, createPlayerRecord } from '../actions/playerRecord';
import { LOCAL_PLAYER_ID, type Session, type SessionListener } from '../actions/Session';
import {
  ACTION_RATE_LIMIT,
  ACTION_RATE_WINDOW_MS,
  DAY_LENGTH_SECONDS,
  DUPLICATE_STALE_MS,
  HEARTBEAT_TIMEOUT_MS,
  JOIN_TIMEOUT_MS,
  MAX_PROTOCOL_ERRORS,
  NET_MAX_PLAYERS,
  NET_QUEUE_HIGH_WATER,
  POSE_SEND_HZ,
  START_POSE_RADIUS,
} from '../game/config';
import { BLOCK_SOLID, Block } from '../world/blocks';
import { type BlockState, type StateChange, emptyChest } from '../world/blockState';
import { wrapTime } from '../world/dayNight';
import { breakTimeMs } from '../items/hardness';
import { lookForKey } from '../player/looks';
import type { MoveMode } from '../player/player';
import { type GuestEntry, limitGuests } from '../save/saveFormat';
import type { World } from '../world/World';
import { optionsOf } from '../world/generation/worldOptions';
import { FarReader } from './authority';
import { BreakClock, breakDueMs } from './breakTiming';
import { RemoteRoster } from './interpolation';
import {
  type GuestMessage,
  type HostMessage,
  type LeftReason,
  type NetPose,
  type PlayerInfo,
  type RelayedPose,
  type TaskDoneBy,
  decodeGuestMessage,
  encodeMessage,
  compactPose,
  validPose,
} from './protocol';
import { normalizePlayerName, uniqueName } from './roomCode';
import { splitSnapshot } from './snapshot';
import type { Connection } from './transport';

const NO_EVENTS: readonly ProgressEvent[] = Object.freeze([]);

/** Something that happened to the other players, for notices and the player list. */
export type PeerEvent =
  | { kind: 'joined'; id: number; name: string; slot: number }
  | { kind: 'left'; id: number; name: string; reason: LeftReason }
  | { kind: 'profile'; id: number; name: string; look: number };

/** The flags of a player's pose: flying, and holding break on a block. */
export interface PoseFlags {
  fly: boolean;
  busy: boolean;
}

export interface HostListener extends SessionListener {
  onPeer(event: PeerEvent): void;
}

export interface HostOptions {
  build: string;
  world: World;
  mode: GameMode;
  worldName: string;
  /** Terrain checksum of the world's seed and generator (computed by the caller). */
  checksum: number;
  hostName: string;
  hostKey: string;
  hostRecord: PlayerRecord;
  /** The host's own player, read whenever its pose matters. */
  hostPose: () => NetPose;
  /** The look of the host's figure (1–8); from the key if not given. */
  hostLook?: number;
  /** Whether the host's player flies and holds break; read like its pose. */
  hostFlags?: () => PoseFlags;
  time: number;
  frozen: boolean;
  /**
   * Milliseconds of a steady clock (wall-clock time in the browser). It is the action
   * clock of every player while the room is open, the host's own too.
   */
  clock: () => number;
  /**
   * The clock the host's own screen measures break progress on (its simulation time);
   * `clock` if not given. Records the host's player sees carry its times (`BreakClock`).
   */
  localClock?: () => number;
  /**
   * Milliseconds since 1970, for the `lastSeenMs` of saved guests; `clock` if not given
   * (only the order of the times matters).
   */
  wallClock?: () => number;
  /** The guests the world remembers: a returning guest gets its items and place back. */
  guests?: readonly GuestEntry[];
  /**
   * The world's task book when the room opens; empty if not given. From then on the host
   * owns it (Phase 8 part A2) and reports every change through `onProgress`.
   */
  progress?: WorldProgress;
  listener: HostListener;
}

/** One player of the room; the host's own player has no connection. */
interface Member {
  id: number;
  name: string;
  slot: number;
  look: number;
  key: string;
  conn: Connection | null;
  record: PlayerRecord;
  pose: NetPose;
  /** Flying and holding break, relayed with the pose. */
  fly: boolean;
  busy: boolean;
  moveMode: MoveMode;
  /** Raised with every new pose; the version of the last teleport. */
  poseVersion: number;
  tpVersion: number;
  /** Pose versions of the other players this member was sent. */
  sent: Map<number, number>;
  /** Messages not handed to the channel yet: they keep their order behind the snapshot. */
  queue: string[];
  lastHeardMs: number;
  /** The round trip the guest last reported in its ping (the debug overlay). */
  rttMs: number | null;
  errors: number;
  /** Actions of the current second (the rate limit) and when that second began. */
  rateCount: number;
  rateStartMs: number;
  /**
   * A `break` that arrived a little early, held until `dueMs`, with the member's later
   * actions behind it (they keep their order).
   */
  held: { dueMs: number; queue: { action: Action; seq: number }[] } | null;
  /** The chest this player has open (Phase 8 part B3a), or null. */
  open: Cell | null;
}

/** A block's cell. */
interface Cell {
  x: number;
  y: number;
  z: number;
}

function sameCell(a: Cell | null, b: Cell | null): boolean {
  return a !== null && b !== null && a.x === b.x && a.y === b.y && a.z === b.z;
}

/**
 * The slots of a chest message: those that differ between two states, as triples (slot,
 * item, count; count 0 empties).
 */
export function changedSlots(before: BlockState, after: BlockState): number[] {
  const out: number[] = [];
  after.slots.forEach((stack, slot) => {
    const old = before.slots[slot] ?? null;
    if (old?.item === stack?.item && old?.count === stack?.count) return;
    out.push(slot, stack?.item ?? 0, stack?.count ?? 0);
  });
  return out;
}

/** A connection that has not said `hello` (yet): a room-list query or a joining guest. */
interface Stranger {
  sinceMs: number;
  errors: number;
}

/** The pose of a player that stands in a free cell on solid ground near `near`, or `near`. */
export function startPoseNear(
  reader: { getBlock(x: number, y: number, z: number): number },
  near: NetPose,
): NetPose {
  const bx = Math.floor(near.x);
  const by = Math.floor(near.y);
  const bz = Math.floor(near.z);
  const free = (x: number, y: number, z: number): boolean => reader.getBlock(x, y, z) === Block.AIR;
  for (let r = 1; r <= START_POSE_RADIUS; r++) {
    for (const dy of [0, -1, 1, -2, 2]) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = bx + dx;
          const y = by + dy;
          const z = bz + dz;
          if (!free(x, y, z) || !free(x, y + 1, z)) continue;
          if (BLOCK_SOLID[reader.getBlock(x, y - 1, z)] !== 1) continue;
          return { x: x + 0.5, y, z: z + 0.5, yaw: near.yaw, pitch: 0 };
        }
      }
    }
  }
  return { ...near };
}

/** A saved pose as a pose of the protocol. */
function wrapPose(p: { x: number; y: number; z: number; yaw: number; pitch: number }): NetPose {
  return { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch };
}

function samePose(a: NetPose, b: NetPose): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z && a.yaw === b.yaw && a.pitch === b.pitch;
}

export class HostSession {
  readonly roster = new RemoteRoster();
  readonly reader: FarReader;
  private readonly o: HostOptions;
  private readonly members = new Map<number, Member>();
  private readonly byConn = new Map<Connection, Member>();
  private readonly strangers = new Map<Connection, Stranger>();
  /**
   * Guests who are not in the room, by player key: those the world remembers and those
   * who left. A returning guest gets its record and place back.
   */
  private readonly departed = new Map<string, GuestEntry>();
  private readonly self: Member;
  private nextId = 2;
  private lastRelayMs = -Infinity;
  private baseTime: number;
  private baseMs: number;
  private frozenTime: boolean;
  private closed = false;
  /** The world's task book, shared by everyone in the room (Adventure). */
  private book: WorldProgress;
  /** The host's own door into the room: the `Session` that `Game` hands actions to. */
  readonly local: HostLocalSession;

  constructor(options: HostOptions) {
    this.o = options;
    this.reader = new FarReader(options.world);
    const now = options.clock();
    this.baseTime = options.time;
    this.baseMs = now;
    this.frozenTime = options.frozen;
    this.book = options.progress ?? EMPTY_PROGRESS;
    for (const guest of options.guests ?? []) {
      // The host's own key is the host, never one of its guests.
      if (guest.key !== options.hostKey) this.departed.set(guest.key, guest);
    }
    this.self = {
      id: 1,
      name: normalizePlayerName(options.hostName, parseInt(options.hostKey.slice(0, 4), 16) || 0),
      slot: 0,
      look: options.hostLook ?? lookForKey(options.hostKey),
      key: options.hostKey,
      conn: null,
      // A break measured on the single-player clock means nothing on the room's clock.
      record: { ...options.hostRecord, breaking: null },
      pose: options.hostPose(),
      fly: false,
      busy: false,
      moveMode: 'walk',
      poseVersion: 1,
      tpVersion: 1,
      sent: new Map(),
      queue: [],
      lastHeardMs: now,
      rttMs: null,
      errors: 0,
      rateCount: 0,
      rateStartMs: now,
      held: null,
      open: null,
    };
    this.members.set(1, this.self);
    this.local = new HostLocalSession(this);
  }

  get mode(): GameMode {
    return this.o.mode;
  }

  get selfId(): number {
    return this.self.id;
  }

  get hostRecord(): PlayerRecord {
    return this.self.record;
  }

  get playerCount(): number {
    return this.members.size;
  }

  get frozen(): boolean {
    return this.frozenTime;
  }

  /** The world's task book as last changed. */
  get progress(): WorldProgress {
    return this.book;
  }

  /** Everyone in the room, the host first. */
  players(): (PlayerInfo & PoseFlags)[] {
    this.refreshHostPose();
    return [...this.members.values()].map((m) => ({
      id: m.id,
      name: m.name,
      slot: m.slot,
      look: m.look,
      host: m === this.self,
      pose: { ...m.pose },
      fly: m.fly,
      busy: m.busy,
    }));
  }

  /** The guests' round trips as they last reported them, by player id (debug overlay). */
  roundTrips(): { id: number; name: string; rttMs: number | null }[] {
    return [...this.members.values()]
      .filter((m) => m !== this.self)
      .map((m) => ({ id: m.id, name: m.name, rttMs: m.rttMs }));
  }

  /**
   * The host's own name or look changed: every guest learns it (`profile`). The name gets
   * a suffix if a guest has it.
   */
  setHostProfile(name: string, look: number): void {
    if (this.closed) return;
    this.applyProfile(this.self, name, look);
  }

  private applyProfile(member: Member, wanted: string, look: number): void {
    const taken = [...this.members.values()].filter((m) => m !== member).map((m) => m.name);
    const digits = parseInt(member.key.slice(0, 4), 16) || 0;
    const name = uniqueName(normalizePlayerName(wanted, digits), taken);
    member.name = name;
    member.look = look;
    if (member !== this.self) this.roster.setProfile(member.id, name, look);
    // Also to the sender: it learns the name the room uses.
    for (const other of this.members.values()) {
      if (other.conn) this.send(other, { t: 'profile', id: member.id, name, look });
    }
    this.o.listener.onPeer({ kind: 'profile', id: member.id, name, look });
  }

  /**
   * The guests the world keeps: everyone who is in the room now or was before, newest first, at most `GUESTS_MAX`. Records carry no break in progress.
   */
  guestEntries(): GuestEntry[] {
    const now = this.wallNow();
    const present = [...this.members.values()]
      .filter((m) => m !== this.self)
      .map((m) => this.entryOf(m, now));
    return limitGuests([...this.departed.values(), ...present]);
  }

  private entryOf(member: Member, lastSeenMs: number): GuestEntry {
    const p = member.pose;
    return {
      key: member.key,
      name: member.name,
      record: { ...member.record, breaking: null },
      pose: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch },
      moveMode: member.moveMode,
      lastSeenMs,
    };
  }

  private wallNow(): number {
    return (this.o.wallClock ?? this.o.clock)();
  }

  // --- time of day ---------------------------------------------------------------------

  /** The room's time of day: it advances with the clock, frames or not. */
  timeOfDay(nowMs: number = this.o.clock()): number {
    if (this.frozenTime) return this.baseTime;
    return wrapTime(this.baseTime + (nowMs - this.baseMs) / 1000 / DAY_LENGTH_SECONDS);
  }

  setTime(time: number, nowMs: number = this.o.clock()): void {
    this.baseTime = wrapTime(time);
    this.baseMs = nowMs;
  }

  // --- connections ---------------------------------------------------------------------

  /** A connection another peer opened to the room. */
  accept(conn: Connection): void {
    if (this.closed) {
      conn.close();
      return;
    }
    this.strangers.set(conn, { sinceMs: this.o.clock(), errors: 0 });
    conn.onMessage = (text) => this.receive(conn, text);
    conn.onClose = () => {
      this.strangers.delete(conn);
      const member = this.byConn.get(conn);
      if (member) this.remove(member, 'lost');
    };
  }

  /**
   * Work of a frame or a timer: relays changed poses, hands queued messages to the
   * channels, drops silent guests. Late or missing calls only delay these.
   */
  update(nowMs: number = this.o.clock()): void {
    this.releaseHeld(nowMs);
    this.relay(nowMs);
    for (const member of this.members.values()) {
      if (member.conn) this.flush(member);
    }
    for (const member of [...this.members.values()]) {
      if (member.conn && nowMs - member.lastHeardMs > HEARTBEAT_TIMEOUT_MS) {
        member.conn.close();
        this.remove(member, 'lost');
      }
    }
    // Room-list queries and refused guests close themselves; anything left is closed here.
    for (const [conn, stranger] of [...this.strangers]) {
      if (nowMs - stranger.sinceMs > JOIN_TIMEOUT_MS) {
        this.strangers.delete(conn);
        conn.close();
      }
    }
  }

  /** The host's player jumped (a teleport): the others snap to the new pose. */
  noteHostTeleport(): void {
    this.refreshHostPose();
    this.self.poseVersion++;
    this.self.tpVersion = this.self.poseVersion;
  }

  /**
   * Blocks the host's page set past the action layer (the test API): every guest gets
   * them like a host edit.
   */
  broadcastBlocks(changes: readonly BlockChange[]): void {
    for (const c of changes) this.reader.noteEdit(c.x, c.y, c.z, c.id);
    this.sendBlocks(changes);
  }

  /**
   * Closes the room: every guest gets `bye`. The caller closes the connections a moment
   * later (the signaling), so that the goodbye can still leave.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    const now = this.wallNow();
    for (const member of this.members.values()) {
      if (member.conn) {
        this.send(member, { t: 'bye' });
        this.byConn.delete(member.conn);
      }
    }
    for (const member of [...this.members.values()]) {
      if (member === this.self) continue;
      this.departed.set(member.key, this.entryOf(member, now));
      this.members.delete(member.id);
    }
    this.roster.clear();
  }

  get isClosed(): boolean {
    return this.closed;
  }

  // --- incoming --------------------------------------------------------------------------

  private receive(conn: Connection, text: string): void {
    if (this.closed) return;
    const now = this.o.clock();
    const decoded = decodeGuestMessage(text);
    const member = this.byConn.get(conn);
    if (!decoded.ok) {
      const holder = member ?? this.strangers.get(conn);
      if (!holder) return;
      holder.errors++;
      if (holder.errors >= MAX_PROTOCOL_ERRORS) {
        conn.close();
        this.strangers.delete(conn);
        if (member) this.remove(member, 'lost');
      }
      return;
    }
    const message = decoded.message;
    if (!member) {
      this.receiveStranger(conn, message, now);
      return;
    }
    member.lastHeardMs = now;
    // A host without frames relays and decides held breaks from its message handlers.
    this.releaseHeld(now);
    this.relay(now);
    switch (message.t) {
      case 'action':
        if (this.overRate(member, now)) {
          this.send(member, { t: 'result', seq: message.seq, ok: false, reason: 'rate' });
        } else {
          this.act(member, message.action, message.seq);
        }
        break;
      case 'pose':
        if (this.o.mode === 'creative') member.moveMode = message.fly ? 'fly' : 'walk';
        this.receivePose(member, message, message.tp, message, now);
        break;
      case 'profile':
        // A change of name or look counts like an action; beyond the limit it is dropped.
        if (!this.overRate(member, now)) this.applyProfile(member, message.name, message.look);
        break;
      case 'ping':
        if (message.rtt !== undefined) member.rttMs = message.rtt;
        this.send(member, {
          t: 'pong',
          ts: message.ts,
          time: this.timeOfDay(now),
          frozen: this.frozenTime,
        });
        break;
      case 'bye':
        // Removed before closing: the close would report the guest as lost.
        this.remove(member, 'leave');
        conn.close();
        break;
      default:
        // `info` and `hello` belong before joining.
        member.errors++;
        if (member.errors >= MAX_PROTOCOL_ERRORS) {
          conn.close();
          this.remove(member, 'lost');
        }
    }
  }

  private receiveStranger(conn: Connection, message: GuestMessage, now: number): void {
    const stranger = this.strangers.get(conn);
    if (!stranger) return;
    if (message.t === 'info') {
      // The asking guest closes the connection when it has the answer.
      this.sendNow(conn, {
        t: 'info',
        hostName: this.self.name,
        worldName: this.o.worldName,
        mode: this.o.mode,
        players: this.members.size,
        max: NET_MAX_PLAYERS,
      });
      return;
    }
    if (message.t !== 'hello') {
      stranger.errors++;
      if (stranger.errors >= MAX_PROTOCOL_ERRORS) {
        this.strangers.delete(conn);
        conn.close();
      }
      return;
    }
    if (message.build !== this.o.build) {
      this.sendNow(conn, { t: 'reject', reason: 'build' });
      return;
    }
    for (const other of this.members.values()) {
      if (other.key !== message.key) continue;
      // A guest whose old connection went silent comes back (its reconnect may be quicker
      // than the heartbeat); a live second tab of the same device is refused.
      if (other === this.self || now - other.lastHeardMs < DUPLICATE_STALE_MS) {
        this.sendNow(conn, { t: 'reject', reason: 'duplicate' });
        return;
      }
      other.conn?.close();
      this.remove(other, 'lost');
    }
    if (this.members.size >= NET_MAX_PLAYERS) {
      this.sendNow(conn, { t: 'reject', reason: 'full' });
      return;
    }
    this.strangers.delete(conn);
    this.admit(conn, message.key, message.name, message.look, now);
  }

  private admit(conn: Connection, key: string, wanted: string, look: number, now: number): void {
    const taken = [...this.members.values()].map((m) => m.name);
    const digits = parseInt(key.slice(0, 4), 16);
    const name = uniqueName(normalizePlayerName(wanted, digits), taken);
    const slots = new Set([...this.members.values()].map((m) => m.slot));
    let slot = 0;
    while (slots.has(slot)) slot++;
    this.refreshHostPose();
    // A returning guest comes back where it left, with its items; a new one next to the host.
    const known = this.departed.get(key);
    this.departed.delete(key);
    const pose = known ? wrapPose(known.pose) : startPoseNear(this.reader, this.self.pose);
    const record = known ? known.record : createPlayerRecord(this.o.mode);
    const moveMode: MoveMode = known && this.o.mode === 'creative' ? known.moveMode : 'walk';
    const member: Member = {
      id: this.nextId++,
      name,
      slot,
      look,
      key,
      conn,
      record,
      pose,
      fly: moveMode === 'fly',
      busy: false,
      moveMode,
      poseVersion: 1,
      tpVersion: 1,
      sent: new Map(),
      queue: [],
      lastHeardMs: now,
      rttMs: null,
      errors: 0,
      rateCount: 0,
      rateStartMs: now,
      held: null,
      open: null,
    };
    const others: PlayerInfo[] = [...this.members.values()].map((m) => ({
      id: m.id,
      name: m.name,
      slot: m.slot,
      look: m.look,
      host: m === this.self,
      pose: { ...m.pose },
    }));
    // The guest knows these poses from `welcome`: the relay starts after them.
    for (const m of this.members.values()) member.sent.set(m.id, m.poseVersion);
    this.members.set(member.id, member);
    this.byConn.set(conn, member);
    const parts = splitSnapshot(this.o.world.edits, this.o.world.states);
    // Welcome, parts and `ready` are queued in one go: no later `blocks` can overtake them.
    this.send(member, {
      t: 'welcome',
      id: member.id,
      slot,
      name,
      worldName: this.o.worldName,
      seed: this.o.world.seed,
      generatorVersion: this.o.world.generatorVersion,
      options: optionsOf(this.o.world.gen),
      mode: this.o.mode,
      checksum: this.o.checksum,
      time: this.timeOfDay(now),
      frozen: this.frozenTime,
      players: others,
      record,
      pose,
      moveMode,
      parts: parts.length,
      progress: this.book,
    });
    parts.forEach(({ chunks, states }, part) =>
      this.send(member, { t: 'snapshot', part, chunks, states }),
    );
    this.send(member, { t: 'ready' });
    for (const other of this.members.values()) {
      if (other !== member && other.conn)
        this.send(other, { t: 'joined', id: member.id, name, slot, look });
    }
    this.roster.add(member.id, name, slot, look, false, pose, now);
    this.roster.setFlags(member.id, member.fly, false);
    this.o.listener.onPeer({ kind: 'joined', id: member.id, name, slot });
  }

  private remove(member: Member, reason: LeftReason): void {
    if (this.members.get(member.id) !== member || member === this.self) return;
    // A player who leaves has nothing open any more; the others at its chest learn it.
    const open = member.open;
    member.open = null;
    this.members.delete(member.id);
    if (open) this.sendViewers(open);
    if (member.conn) this.byConn.delete(member.conn);
    // A guest that comes back gets its items and its place again (saved with the world).
    this.departed.set(member.key, this.entryOf(member, this.wallNow()));
    for (const other of this.members.values()) {
      if (other.conn) this.send(other, { t: 'left', id: member.id, reason });
    }
    this.roster.remove(member.id);
    this.o.listener.onPeer({ kind: 'left', id: member.id, name: member.name, reason });
  }

  // --- actions ---------------------------------------------------------------------------

  /** A guest's action beyond `ACTION_RATE_LIMIT` within one second is refused. */
  private overRate(member: Member, now: number): boolean {
    if (now - member.rateStartMs >= ACTION_RATE_WINDOW_MS) {
      member.rateStartMs = now;
      member.rateCount = 0;
    }
    member.rateCount++;
    return member.rateCount > ACTION_RATE_LIMIT;
  }

  /**
   * One action of a player, in order: behind a held `break`, held itself if it is a
   * little early, or decided at once.
   */
  private act(member: Member, action: Action, seq: number): void {
    if (member.held) {
      member.held.queue.push({ action, seq });
      return;
    }
    if (this.o.mode === 'gathering' && action.kind === 'break') {
      const block = this.reader.getBlock(action.x, action.y, action.z);
      const required = breakTimeMs(block, heldItem(member.record));
      const due = breakDueMs(member.record, action, required, this.o.clock());
      if (due !== null) {
        member.held = { dueMs: due, queue: [{ action, seq }] };
        return;
      }
    }
    this.decide(member, action, seq);
  }

  /** Held actions whose `break` is due now are decided, in order. */
  private releaseHeld(now: number): void {
    for (const member of this.members.values()) {
      const held = member.held;
      if (!held || now < held.dueMs) continue;
      member.held = null;
      // A later `break` in the queue may be held again; what follows it waits behind it.
      for (const item of held.queue) this.act(member, item.action, item.seq);
    }
  }

  /** Validates and applies one action of a player; answers the sender, tells everyone. */
  private decide(member: Member, action: Action, seq: number): void {
    this.refreshHostPose();
    const poses = [...this.members.values()].map((m) => m.pose);
    const ctx = {
      world: this.reader,
      mode: this.o.mode,
      pose: member.pose,
      record: member.record,
      players: poses,
      progress: this.book,
      states: this.reader,
    };
    const result = applyAction(ctx, action, this.o.clock());
    // Events read the world before the action's blocks are set.
    const events = this.o.mode === 'gathering' ? eventsOf(action, result, ctx) : NO_EVENTS;
    const changed = new Set<Member>();
    if (result.ok) {
      for (const c of result.blocks) {
        this.o.world.setBlock(c.x, c.y, c.z, c.id);
        this.reader.noteEdit(c.x, c.y, c.z, c.id);
      }
      if (result.blocks.length > 0) {
        if (member !== this.self) this.roster.noteEdit(member.id);
        this.sendBlocks(result.blocks, member.id);
        this.o.listener.onBlocks(result.blocks);
      }
      // States after the blocks, and the guests learn them before any record.
      if (result.states) this.applyStates(result.states);
      if (action.kind === 'openChest')
        this.setOpen(member, { x: action.x, y: action.y, z: action.z });
      if (action.kind === 'closeChest') this.setOpen(member, null);
      if (result.player) {
        member.record = result.player;
        changed.add(member);
      }
    }
    this.runProgress(member, events, changed);
    if (member === this.self) {
      this.o.listener.onResult(action, result);
    } else if (result.ok) {
      this.send(member, { t: 'result', seq, ok: true, notices: result.notices });
    } else {
      this.send(member, { t: 'result', seq, ok: false, reason: result.reason });
    }
  }

  // --- chests (Phase 8 part B3a) -------------------------------------------------------

  /**
   * Sets an action's states in the world and tells every guest the changed slots (`chest`)
   * or that a chest is gone; the viewers of a gone chest have nothing open any more.
   */
  private applyStates(changes: readonly StateChange[]): void {
    const messages: HostMessage[] = [];
    for (const c of changes) {
      // What the guests hold now: the stored state, or the initial (empty) one.
      const before = this.o.world.storedState(c.x, c.y, c.z) ?? emptyChest();
      this.o.world.setState(c.x, c.y, c.z, c.state);
      messages.push(
        c.state
          ? { t: 'chest', x: c.x, y: c.y, z: c.z, slots: changedSlots(before, c.state) }
          : { t: 'chest', x: c.x, y: c.y, z: c.z, gone: true },
      );
    }
    for (const member of this.members.values()) {
      if (!member.conn) continue;
      for (const message of messages) this.send(member, message);
    }
    this.o.listener.onStates?.(changes);
    for (const c of changes) if (c.state === null) this.closeChestAt(c);
  }

  /** The chest a player has open: the viewers of the old and the new chest learn it. */
  private setOpen(member: Member, cell: Cell | null): void {
    const old = member.open;
    if (sameCell(old, cell) || (old === null && cell === null)) return;
    member.open = cell;
    if (old) this.sendViewers(old);
    if (cell) this.sendViewers(cell);
  }

  /** A chest was broken: nobody has it open; its viewers get an empty list. */
  private closeChestAt(cell: Cell): void {
    const viewers = [...this.members.values()].filter((m) => sameCell(m.open, cell));
    for (const member of viewers) {
      member.open = null;
      this.tellViewers(member, cell, []);
    }
  }

  /** Every player who has the chest open learns who has it open. */
  private sendViewers(cell: Cell): void {
    const viewers = [...this.members.values()].filter((m) => sameCell(m.open, cell));
    const ids = viewers.map((m) => m.id);
    for (const member of viewers) this.tellViewers(member, cell, ids);
  }

  private tellViewers(member: Member, cell: Cell, ids: number[]): void {
    const { x, y, z } = cell;
    if (member === this.self) this.o.listener.onViewers?.({ x, y, z, ids });
    else this.send(member, { t: 'viewers', x, y, z, ids });
  }

  /** Who has the chest in a cell open (tests and the F3 overlay). */
  viewersOf(x: number, y: number, z: number): number[] {
    const cell = { x, y, z };
    return [...this.members.values()].filter((m) => sameCell(m.open, cell)).map((m) => m.id);
  }

  // --- progress (Phase 8 part A2) ------------------------------------------------------

  /** The id of a member in the progress step: the host's own player is the local one. */
  private progressId(member: Member): string {
    return member === this.self ? LOCAL_PLAYER_ID : String(member.id);
  }

  private memberOfProgressId(id: string): Member | undefined {
    return id === LOCAL_PLAYER_ID ? this.self : this.members.get(Number(id));
  }

  /**
   * Runs a player's events through the progress step with everyone in the room present,
   * then reports what changed: records (`changed` holds those changed before), the book.
   */
  private runProgress(
    actor: Member,
    events: readonly ProgressEvent[],
    changed: Set<Member> = new Set(),
  ): void {
    const outcomes: ProgressOutcome[] = [];
    const before = this.book;
    for (const event of events) {
      const present = [...this.members.values()].map((m) => ({
        id: this.progressId(m),
        record: m.record,
      }));
      const step = stepProgress(
        this.book,
        { id: this.progressId(actor), record: actor.record },
        event,
        present,
      );
      if (step.progress === this.book && step.records.length === 0) continue;
      this.book = step.progress;
      for (const { id, record } of step.records) {
        const member = this.memberOfProgressId(id);
        if (!member) continue;
        member.record = record;
        changed.add(member);
      }
      // Rooms name the player who finished a task.
      for (const o of step.outcomes) {
        outcomes.push(o.kind === 'taskDone' ? { ...o, by: actor.name } : o);
      }
    }
    // The host's own record first: its screen reads it when the book is reported.
    if (changed.has(this.self)) this.o.listener.onPlayer(this.local.view(this.self.record));
    if (this.book !== before || outcomes.length > 0) {
      this.o.listener.onProgress?.(this.book, outcomes);
    }
    // At most one `progress` per action; the guests' records follow (their notices: the
    // task first, then their level).
    if (this.book !== before) {
      const done: TaskDoneBy[] = [];
      for (const o of outcomes) {
        if (o.kind === 'taskDone') done.push({ task: o.task, by: actor.name });
      }
      this.broadcastProgress(done);
    }
    for (const member of changed) {
      if (member !== this.self) this.send(member, { t: 'record', record: member.record });
    }
  }

  /** The feet Y of the host's own player, once per simulation step (reach tasks). */
  noteHostPose(y: number): void {
    if (this.closed || this.o.mode !== 'gathering') return;
    this.runProgress(this.self, [{ kind: 'pose', y }]);
  }

  /**
   * Test tool (`setProgress`): replaces the world's task book past the action layer;
   * everyone learns it.
   */
  replaceBook(progress: WorldProgress): void {
    this.book = progress;
    this.o.listener.onProgress?.(progress, []);
    this.broadcastProgress([]);
  }

  private broadcastProgress(done: TaskDoneBy[]): void {
    for (const member of this.members.values()) {
      if (member.conn) this.send(member, { t: 'progress', progress: this.book, done });
    }
  }

  /** The host's own action, from its local door. */
  actLocal(action: Action): void {
    this.releaseHeld(this.o.clock());
    this.act(this.self, action, 0);
  }

  /** The clock of the host's own screen. */
  localNow(): number {
    return (this.o.localClock ?? this.o.clock)();
  }

  /** The host's own action could not even be decoded. */
  reportInvalid(action: Action): void {
    this.o.listener.onResult(action, { ok: false, reason: 'invalid' });
  }

  /**
   * Test tool: a guest's record and a way to replace it past the action layer (the
   * guest gets it as from an action); null for an id that is no guest.
   */
  guestRecordDoor(
    id: number,
  ): { record: PlayerRecord; replaceRecord(record: PlayerRecord): void } | null {
    const member = this.members.get(id);
    if (!member || member === this.self) return null;
    return {
      record: member.record,
      replaceRecord: (record) => {
        member.record = record;
        this.send(member, { t: 'record', record });
      },
    };
  }

  /** Test tool: the host's record past the action layer. */
  replaceHostRecord(record: PlayerRecord): void {
    this.self.record = record;
    this.o.listener.onPlayer(this.local.view(record));
  }

  private sendBlocks(changes: readonly BlockChange[], by: number = this.self.id): void {
    if (changes.length === 0) return;
    const flat: number[] = [];
    for (const c of changes) flat.push(c.x, c.y, c.z, c.id);
    for (const member of this.members.values()) {
      if (member.conn) this.send(member, { t: 'blocks', by, changes: flat });
    }
  }

  // --- poses -----------------------------------------------------------------------------

  private receivePose(
    member: Member,
    raw: NetPose,
    teleport: boolean,
    flags: PoseFlags,
    now: number,
  ): void {
    const pose = validPose(raw);
    if (!pose) return;
    const p: NetPose = { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw, pitch: pose.pitch };
    const sameFlags = flags.fly === member.fly && flags.busy === member.busy;
    if (samePose(p, member.pose) && sameFlags && !teleport) return;
    member.pose = p;
    member.fly = flags.fly;
    member.busy = flags.busy;
    member.poseVersion++;
    if (teleport) member.tpVersion = member.poseVersion;
    this.roster.push(member.id, p, now, teleport);
    this.roster.setFlags(member.id, flags.fly, flags.busy);
    // The reach tasks of the book read the feet; nothing happens unless one is open.
    if (this.o.mode === 'gathering') this.runProgress(member, [{ kind: 'pose', y: p.y }]);
    // A host without frames relays from here.
    this.relay(now);
  }

  private refreshHostPose(): void {
    const pose = this.o.hostPose();
    const flags = this.o.hostFlags?.() ?? { fly: false, busy: false };
    const self = this.self;
    if (samePose(pose, self.pose) && flags.fly === self.fly && flags.busy === self.busy) return;
    self.pose = { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw, pitch: pose.pitch };
    self.fly = flags.fly;
    self.busy = flags.busy;
    self.poseVersion++;
  }

  /** Changed poses to every guest, at most `POSE_SEND_HZ` times a second, never back. */
  private relay(now: number): void {
    if (now - this.lastRelayMs < 1000 / POSE_SEND_HZ) return;
    this.lastRelayMs = now;
    this.refreshHostPose();
    for (const to of this.members.values()) {
      if (!to.conn) continue;
      const poses: RelayedPose[] = [];
      for (const from of this.members.values()) {
        if (from === to) continue;
        const sent = to.sent.get(from.id) ?? 0;
        if (from.poseVersion <= sent) continue;
        poses.push({
          id: from.id,
          ...compactPose(from.pose),
          tp: from.tpVersion > sent,
          fly: from.fly,
          busy: from.busy,
        });
        to.sent.set(from.id, from.poseVersion);
      }
      if (poses.length > 0) this.send(to, { t: 'poses', poses });
    }
  }

  // --- sending ---------------------------------------------------------------------------

  private send(member: Member, message: HostMessage): void {
    if (!member.conn) return;
    member.queue.push(encodeMessage(message));
    this.flush(member);
  }

  /** A message to a connection that is no member (an answer, a refusal). */
  private sendNow(conn: Connection, message: HostMessage): void {
    conn.send(encodeMessage(message));
  }

  private flush(member: Member): void {
    const conn = member.conn;
    if (!conn || !conn.open) return;
    while (member.queue.length > 0 && conn.bufferedAmount() < NET_QUEUE_HIGH_WATER) {
      const text = member.queue.shift();
      if (text !== undefined) conn.send(text);
    }
  }
}

/** The host's own player as a `Session`: its actions take the same path as a guest's. */
export class HostLocalSession implements Session {
  private readonly host: HostSession;
  private readonly clock = new BreakClock();
  /** The host's record as its screen sees it: break start times on the screen's clock. */
  private shown: { raw: PlayerRecord; view: PlayerRecord } | null = null;

  constructor(host: HostSession) {
    this.host = host;
  }

  get record(): PlayerRecord {
    return this.view(this.host.hostRecord);
  }

  /** The record with the break start on the screen's clock (cached per record). */
  view(raw: PlayerRecord): PlayerRecord {
    if (this.shown?.raw !== raw) this.shown = { raw, view: this.clock.view(raw) };
    return this.shown.view;
  }

  submit(action: Action): void {
    const decoded = decodeAction(action);
    if (!decoded.ok) {
      this.host.reportInvalid(action);
      return;
    }
    this.clock.noteSubmit(decoded.action, this.host.localNow());
    this.host.actLocal(decoded.action);
  }

  /** Test tool (`give`, `clearInventory`). */
  replaceRecord(record: PlayerRecord): void {
    this.host.replaceHostRecord(record);
  }

  /** The player's feet Y, once per simulation step from `Game`: the reach tasks. */
  notePose(y: number): void {
    this.host.noteHostPose(y);
  }

  /** Test tool (`setProgress`): the world's task book past the action layer. */
  replaceProgress(progress: WorldProgress): void {
    this.host.replaceBook(progress);
  }
}
