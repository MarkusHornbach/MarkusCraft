// The host of a room: its players with their records and poses, every action validated
// with `applyAction` against the acting player, the relay of blocks and poses, and the
// time of day. Pure: a later Node host can run it with any `Connection`.
import { type Action, decodeAction } from '../actions/actions';
import { type BlockChange, applyAction } from '../actions/apply';
import { type GameMode, type PlayerRecord, createPlayerRecord } from '../actions/playerRecord';
import type { Session, SessionListener } from '../actions/Session';
import {
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
import { wrapTime } from '../world/dayNight';
import type { World } from '../world/World';
import { FarReader } from './authority';
import { RemoteRoster } from './interpolation';
import {
  type GuestMessage,
  type HostMessage,
  type LeftReason,
  type NetPose,
  type PlayerInfo,
  type RelayedPose,
  decodeGuestMessage,
  encodeMessage,
  validPose,
} from './protocol';
import { normalizePlayerName, uniqueName } from './roomCode';
import { splitEdits } from './snapshot';
import type { Connection } from './transport';

/** Something that happened to the other players, for notices and the player list. */
export type PeerEvent =
  | { kind: 'joined'; id: number; name: string; slot: number }
  | { kind: 'left'; id: number; name: string; reason: LeftReason };

export interface HostListener extends SessionListener {
  onPeer(event: PeerEvent): void;
}

export interface HostOptions {
  build: string;
  world: World;
  mode: GameMode;
  worldName: string;
  /** Terrain checksum of the world's seed and generator version (computed by the caller). */
  checksum: number;
  hostName: string;
  hostKey: string;
  hostRecord: PlayerRecord;
  /** The host's own player, read whenever its pose matters. */
  hostPose: () => NetPose;
  time: number;
  frozen: boolean;
  /** Milliseconds of a steady clock (wall-clock time in the browser). */
  clock: () => number;
  listener: HostListener;
}

/** One player of the room; the host's own player has no connection. */
interface Member {
  id: number;
  name: string;
  slot: number;
  key: string;
  conn: Connection | null;
  record: PlayerRecord;
  pose: NetPose;
  /** Raised with every new pose; the version of the last teleport. */
  poseVersion: number;
  tpVersion: number;
  /** Pose versions of the other players this member was sent. */
  sent: Map<number, number>;
  /** Messages not handed to the channel yet: they keep their order behind the snapshot. */
  queue: string[];
  lastHeardMs: number;
  errors: number;
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
  /** Records of guests who left, by player key: a returning guest gets its record back. */
  private readonly departed = new Map<string, PlayerRecord>();
  private readonly self: Member;
  private nextId = 2;
  private lastRelayMs = -Infinity;
  private baseTime: number;
  private baseMs: number;
  private frozenTime: boolean;
  private closed = false;
  /** The host's own door into the room: the `Session` that `Game` hands actions to. */
  readonly local: HostLocalSession;

  constructor(options: HostOptions) {
    this.o = options;
    this.reader = new FarReader(options.world);
    const now = options.clock();
    this.baseTime = options.time;
    this.baseMs = now;
    this.frozenTime = options.frozen;
    this.self = {
      id: 1,
      name: normalizePlayerName(options.hostName, parseInt(options.hostKey.slice(0, 4), 16) || 0),
      slot: 0,
      key: options.hostKey,
      conn: null,
      // A break measured on the single-player clock means nothing on the room's clock.
      record: { ...options.hostRecord, breaking: null },
      pose: options.hostPose(),
      poseVersion: 1,
      tpVersion: 1,
      sent: new Map(),
      queue: [],
      lastHeardMs: now,
      errors: 0,
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

  /** Everyone in the room, the host first. */
  players(): { id: number; name: string; slot: number; host: boolean; pose: NetPose }[] {
    this.refreshHostPose();
    return [...this.members.values()].map((m) => ({
      id: m.id,
      name: m.name,
      slot: m.slot,
      host: m === this.self,
      pose: { ...m.pose },
    }));
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
    for (const member of this.members.values()) {
      if (member.conn) {
        this.send(member, { t: 'bye' });
        this.byConn.delete(member.conn);
      }
    }
    for (const member of [...this.members.values()]) {
      if (member !== this.self) this.members.delete(member.id);
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
    // A host without frames relays from its message handlers (at most every 50 ms).
    this.relay(now);
    switch (message.t) {
      case 'action':
        this.act(member, message.action, message.seq);
        break;
      case 'pose':
        this.receivePose(member, message, message.tp, now);
        break;
      case 'ping':
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
    this.admit(conn, message.key, message.name, now);
  }

  private admit(conn: Connection, key: string, wanted: string, now: number): void {
    const taken = [...this.members.values()].map((m) => m.name);
    const digits = parseInt(key.slice(0, 4), 16);
    const name = uniqueName(normalizePlayerName(wanted, digits), taken);
    const slots = new Set([...this.members.values()].map((m) => m.slot));
    let slot = 0;
    while (slots.has(slot)) slot++;
    this.refreshHostPose();
    const pose = startPoseNear(this.reader, this.self.pose);
    const record = this.departed.get(key) ?? createPlayerRecord(this.o.mode);
    this.departed.delete(key);
    const member: Member = {
      id: this.nextId++,
      name,
      slot,
      key,
      conn,
      record,
      pose,
      poseVersion: 1,
      tpVersion: 1,
      sent: new Map(),
      queue: [],
      lastHeardMs: now,
      errors: 0,
    };
    const others: PlayerInfo[] = [...this.members.values()].map((m) => ({
      id: m.id,
      name: m.name,
      slot: m.slot,
      host: m === this.self,
      pose: { ...m.pose },
    }));
    // The guest knows these poses from `welcome`: the relay starts after them.
    for (const m of this.members.values()) member.sent.set(m.id, m.poseVersion);
    this.members.set(member.id, member);
    this.byConn.set(conn, member);
    const parts = splitEdits(this.o.world.edits);
    // Welcome, parts and `ready` are queued in one go: no later `blocks` can overtake them.
    this.send(member, {
      t: 'welcome',
      id: member.id,
      slot,
      name,
      worldName: this.o.worldName,
      seed: this.o.world.seed,
      generatorVersion: this.o.world.generatorVersion,
      mode: this.o.mode,
      checksum: this.o.checksum,
      time: this.timeOfDay(now),
      frozen: this.frozenTime,
      players: others,
      record,
      pose,
      parts: parts.length,
    });
    parts.forEach((chunks, part) => this.send(member, { t: 'snapshot', part, chunks }));
    this.send(member, { t: 'ready' });
    for (const other of this.members.values()) {
      if (other !== member && other.conn)
        this.send(other, { t: 'joined', id: member.id, name, slot });
    }
    this.roster.add(member.id, name, slot, false, pose, now);
    this.o.listener.onPeer({ kind: 'joined', id: member.id, name, slot });
  }

  private remove(member: Member, reason: LeftReason): void {
    if (this.members.get(member.id) !== member || member === this.self) return;
    this.members.delete(member.id);
    if (member.conn) this.byConn.delete(member.conn);
    // Kept while the room is open: a guest that comes back gets its items again.
    this.departed.set(member.key, { ...member.record, breaking: null });
    for (const other of this.members.values()) {
      if (other.conn) this.send(other, { t: 'left', id: member.id, reason });
    }
    this.roster.remove(member.id);
    this.o.listener.onPeer({ kind: 'left', id: member.id, name: member.name, reason });
  }

  // --- actions ---------------------------------------------------------------------------

  /** Validates and applies one action of a player; answers the sender, tells everyone. */
  private act(member: Member, action: Action, seq: number): void {
    this.refreshHostPose();
    const poses = [...this.members.values()].map((m) => m.pose);
    const result = applyAction(
      {
        world: this.reader,
        mode: this.o.mode,
        pose: member.pose,
        record: member.record,
        players: poses,
      },
      action,
      this.o.clock(),
    );
    if (result.ok) {
      for (const c of result.blocks) {
        this.o.world.setBlock(c.x, c.y, c.z, c.id);
        this.reader.noteEdit(c.x, c.y, c.z, c.id);
      }
      if (result.blocks.length > 0) {
        this.sendBlocks(result.blocks, member.id);
        this.o.listener.onBlocks(result.blocks);
      }
      if (result.player) {
        member.record = result.player;
        if (member === this.self) this.o.listener.onPlayer(result.player);
        else this.send(member, { t: 'record', record: result.player });
      }
    }
    if (member === this.self) {
      this.o.listener.onResult(action, result);
    } else if (result.ok) {
      this.send(member, { t: 'result', seq, ok: true, notices: result.notices });
    } else {
      this.send(member, { t: 'result', seq, ok: false, reason: result.reason });
    }
  }

  /** The host's own action, from its local door. */
  actLocal(action: Action): void {
    this.act(this.self, action, 0);
  }

  /** The host's own action could not even be decoded. */
  reportInvalid(action: Action): void {
    this.o.listener.onResult(action, { ok: false, reason: 'invalid' });
  }

  /** Test tool: the host's record past the action layer. */
  replaceHostRecord(record: PlayerRecord): void {
    this.self.record = record;
    this.o.listener.onPlayer(record);
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

  private receivePose(member: Member, raw: NetPose, teleport: boolean, now: number): void {
    const pose = validPose(raw);
    if (!pose) return;
    const p: NetPose = { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw, pitch: pose.pitch };
    if (samePose(p, member.pose) && !teleport) return;
    member.pose = p;
    member.poseVersion++;
    if (teleport) member.tpVersion = member.poseVersion;
    this.roster.push(member.id, p, now, teleport);
    // A host without frames relays from here.
    this.relay(now);
  }

  private refreshHostPose(): void {
    const pose = this.o.hostPose();
    if (samePose(pose, this.self.pose)) return;
    this.self.pose = { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw, pitch: pose.pitch };
    this.self.poseVersion++;
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
        poses.push({ id: from.id, ...from.pose, tp: from.tpVersion > sent });
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

  constructor(host: HostSession) {
    this.host = host;
  }

  get record(): PlayerRecord {
    return this.host.hostRecord;
  }

  submit(action: Action): void {
    const decoded = decodeAction(action);
    if (!decoded.ok) {
      this.host.reportInvalid(action);
      return;
    }
    this.host.actLocal(decoded.action);
  }

  /** Test tool (`give`, `clearInventory`). */
  replaceRecord(record: PlayerRecord): void {
    this.host.replaceHostRecord(record);
  }
}
