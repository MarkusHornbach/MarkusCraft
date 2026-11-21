// A guest of a room: joins, receives the world, sends its actions and pose, applies what
// the host reports, keeps the time of day in step, reconnects after a lost connection.
import type { Action } from '../actions/actions';
import type { ActionResult, BlockChange } from '../actions/apply';
import type { PlayerRecord } from '../actions/playerRecord';
import type { Session, SessionListener } from '../actions/Session';
import {
  DAY_LENGTH_SECONDS,
  HEARTBEAT_TIMEOUT_MS,
  JOIN_TIMEOUT_MS,
  PING_INTERVAL_MS,
  POSE_SEND_HZ,
  RECONNECT_INTERVAL_MS,
  RECONNECT_WINDOW_MS,
} from '../game/config';
import type { WorldEdits } from '../save/saveFormat';
import { wrapTime } from '../world/dayNight';
import type { PeerEvent } from './HostSession';
import { RemoteRoster } from './interpolation';
import {
  type GuestMessage,
  type HostMessage,
  type JoinReject,
  type NetPose,
  type SnapshotChunk,
  type Welcome,
  decodeHostMessage,
  encodeMessage,
} from './protocol';
import { guestPeerId, roomOfAnyBuild, roomPeerId } from './roomCode';
import { joinParts } from './snapshot';
import { type Connection, type Network, SignalError, type Signaling } from './transport';

export type ClientStatus = 'offline' | 'connecting' | 'syncing' | 'online' | 'reconnecting';

/** Why joining failed. `build` also covers a listed room of another build. */
export type JoinFailure = JoinReject | 'unreachable' | 'not-found' | 'terrain' | 'timeout';

export class JoinError extends Error {
  readonly reason: JoinFailure;
  constructor(reason: JoinFailure) {
    super(reason);
    this.reason = reason;
  }
}

/** How a joined room ended: the host closed it, the host was lost, or this guest left. */
export type EndReason = 'closed' | 'lost' | 'left';

/** The world a guest plays in: blocks the host reports are set here. */
export interface GuestWorld {
  setBlock(x: number, y: number, z: number, id: number): boolean;
}

export interface ClientListener extends SessionListener {
  /**
   * The world arrived: on joining, and again after a reconnect (`rejoin`). Returns the
   * world that the host's blocks are set in from now on.
   */
  onWorld(welcome: Welcome, edits: WorldEdits, rejoin: boolean): GuestWorld;
  onPeer(event: PeerEvent): void;
  onStatus(status: ClientStatus): void;
  /** The room is over for this guest (not called while joining fails). */
  onEnd(reason: EndReason): void;
}

export interface ClientOptions {
  network: Network;
  build: string;
  key: string;
  name: string;
  code: string;
  randomBytes: (count: number) => ArrayLike<number>;
  clock: () => number;
  /** The terrain checksum this device computes for a seed and generator version. */
  checksum: (seed: number, generatorVersion: number) => number;
  listener: ClientListener;
}

/** A join or rejoin in flight: its connection and what has arrived so far. */
interface Attempt {
  conn: Connection;
  welcome: Welcome | null;
  parts: SnapshotChunk[][];
  resolve: () => void;
  reject: (error: JoinError) => void;
}

export class ClientSession implements Session {
  readonly roster = new RemoteRoster();
  status: ClientStatus = 'offline';
  /** The player id the host gave this guest, and its name in the room. */
  selfId: number | null = null;
  selfName: string | null = null;
  selfSlot = 0;
  /** The last round trip of a ping, or null before the first pong. */
  rttMs: number | null = null;
  private readonly o: ClientOptions;
  private signaling: Signaling | null = null;
  private conn: Connection | null = null;
  private attempt: Attempt | null = null;
  private world: GuestWorld | null = null;
  private current: PlayerRecord | null = null;
  private seq = 0;
  private readonly pending = new Map<number, Action>();
  private joinStartMs = 0;
  private lastHeardMs = 0;
  private lastPingMs = -Infinity;
  private reconnectStartMs = 0;
  private nextAttemptMs = 0;
  private attempting = false;
  private time = 0;
  private timeAtMs = 0;
  private frozenTime = false;
  private lastPose: NetPose | null = null;
  private lastFly = false;
  private lastPoseMs = -Infinity;
  private pendingTeleport = false;
  /** The host's last answer, also to messages no `submit` sent (tests of the host). */
  lastResult: { seq: number; ok: boolean; reason: string | null } | null = null;
  /** Poses sent so far (tests count them). */
  posesSent = 0;

  constructor(options: ClientOptions) {
    this.o = options;
  }

  get code(): string {
    return this.o.code;
  }

  get record(): PlayerRecord {
    if (!this.current) throw new Error('not joined');
    return this.current;
  }

  get frozen(): boolean {
    return this.frozenTime;
  }

  // --- joining ---------------------------------------------------------------------------

  /** Joins the room; resolves once the world arrived, rejects with a `JoinError`. */
  async join(): Promise<void> {
    this.setStatus('connecting');
    this.joinStartMs = this.o.clock();
    try {
      const signaling = this.o.network.signaling();
      this.signaling = signaling;
      try {
        await signaling.open(guestPeerId(this.o.build, this.o.randomBytes(8)));
      } catch {
        throw new JoinError('unreachable');
      }
      const conn = await this.connect(signaling);
      this.setStatus('syncing');
      await this.hello(conn);
    } catch (error) {
      this.dispose();
      this.setStatus('offline');
      throw error instanceof JoinError ? error : new JoinError('unreachable');
    }
  }

  private async connect(signaling: Signaling): Promise<Connection> {
    try {
      return await signaling.connect(roomPeerId(this.o.build, this.o.code));
    } catch (error) {
      const reason = error instanceof SignalError ? error.reason : 'unreachable';
      if (reason === 'not-found') throw new JoinError(await this.notFoundReason());
      throw new JoinError(reason === 'timeout' ? 'timeout' : 'unreachable');
    }
  }

  /** A code that is not found may be a room of another build: then the version message. */
  private async notFoundReason(): Promise<JoinFailure> {
    try {
      const list = await this.o.network.directory.list();
      if (!list.ok) return 'not-found';
      const other = list.ids.some((id) => {
        const room = roomOfAnyBuild(id);
        return room !== null && room.code === this.o.code && room.build !== this.o.build;
      });
      return other ? 'build' : 'not-found';
    } catch {
      return 'not-found';
    }
  }

  /** Sends `hello` on a new connection and waits for the world. */
  private hello(conn: Connection): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const attempt: Attempt = { conn, welcome: null, parts: [], resolve, reject };
      this.attempt = attempt;
      this.conn = conn;
      conn.onMessage = (text) => this.receive(conn, text);
      conn.onClose = () => this.connectionClosed(conn);
      this.lastHeardMs = this.o.clock();
      this.send({ t: 'hello', build: this.o.build, key: this.o.key, name: this.o.name });
    });
  }

  private failAttempt(error: JoinError): void {
    const attempt = this.attempt;
    if (!attempt) return;
    this.attempt = null;
    attempt.conn.onClose = null;
    attempt.conn.close();
    if (this.conn === attempt.conn) this.conn = null;
    attempt.reject(error);
  }

  // --- the session ---------------------------------------------------------------------

  submit(action: Action): void {
    if (this.status !== 'online' || !this.conn) {
      // Nothing is sent while the host is away; the screen shows nothing for it.
      this.o.listener.onResult(action, { ok: false, reason: 'invalid' });
      return;
    }
    const seq = ++this.seq;
    this.pending.set(seq, action);
    this.send({ t: 'action', seq, action });
  }

  /** Test tool: any text to the host, past the encoder. */
  sendRaw(text: string): void {
    this.conn?.send(text);
  }

  /**
   * The own pose and whether the player flies; sent at most `POSE_SEND_HZ` times a second
   * and only when it changed.
   */
  setPose(pose: NetPose, nowMs: number, teleport = false, fly = false): void {
    if (teleport) this.pendingTeleport = true;
    if (this.status !== 'online') return;
    const last = this.lastPose;
    const changed =
      !last ||
      last.x !== pose.x ||
      last.y !== pose.y ||
      last.z !== pose.z ||
      last.yaw !== pose.yaw ||
      last.pitch !== pose.pitch ||
      this.lastFly !== fly;
    if (!changed && !this.pendingTeleport) return;
    if (nowMs - this.lastPoseMs < 1000 / POSE_SEND_HZ - 0.5) return;
    this.lastPose = { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw, pitch: pose.pitch };
    this.lastFly = fly;
    this.lastPoseMs = nowMs;
    this.send({ t: 'pose', ...this.lastPose, tp: this.pendingTeleport, fly });
    this.pendingTeleport = false;
    this.posesSent++;
  }

  /** The room's time of day, advancing locally between pongs. */
  timeOfDay(nowMs: number = this.o.clock()): number {
    if (this.frozenTime) return this.time;
    return wrapTime(this.time + (nowMs - this.timeAtMs) / 1000 / DAY_LENGTH_SECONDS);
  }

  /** Pings, the heartbeat, the join timeout and reconnecting; called by frames and a timer. */
  update(nowMs: number = this.o.clock()): void {
    if (this.status === 'connecting' || this.status === 'syncing') {
      if (nowMs - this.joinStartMs > JOIN_TIMEOUT_MS) this.failAttempt(new JoinError('timeout'));
      return;
    }
    if (this.status === 'online') {
      if (nowMs - this.lastHeardMs > HEARTBEAT_TIMEOUT_MS) {
        this.lose();
        return;
      }
      if (nowMs - this.lastPingMs >= PING_INTERVAL_MS) {
        this.lastPingMs = nowMs;
        this.send({ t: 'ping', ts: nowMs });
      }
      return;
    }
    if (this.status === 'reconnecting') {
      if (nowMs - this.reconnectStartMs > RECONNECT_WINDOW_MS) {
        this.end('lost');
        return;
      }
      // An attempt that hangs is given up when the next one is due.
      if (this.attempt && nowMs >= this.nextAttemptMs) this.failAttempt(new JoinError('timeout'));
      if (!this.attempting && !this.attempt && nowMs >= this.nextAttemptMs) {
        this.nextAttemptMs = nowMs + RECONNECT_INTERVAL_MS;
        void this.retry();
      }
    }
  }

  /** "Leave world": says goodbye; `dispose` closes the connection a moment later. */
  leave(): void {
    if (this.status === 'offline') return;
    if (this.conn?.open) this.send({ t: 'bye' });
    this.attempt = null;
    this.setStatus('offline');
    this.roster.clear();
  }

  /** Closes the connection and the signaling; nothing more is reported. */
  dispose(): void {
    const conn = this.conn;
    this.conn = null;
    if (conn) {
      conn.onClose = null;
      conn.onMessage = null;
      conn.close();
    }
    this.signaling?.close();
    this.signaling = null;
  }

  /** Test tool: the transport dies without a goodbye (a crash, the network gone). */
  dropConnection(): void {
    this.signaling?.close();
  }

  // --- incoming --------------------------------------------------------------------------

  private receive(conn: Connection, text: string): void {
    if (conn !== this.conn) return;
    const now = this.o.clock();
    this.lastHeardMs = now;
    const decoded = decodeHostMessage(text);
    // A host of the same build sends nothing invalid; anything else is ignored.
    if (!decoded.ok) return;
    const m = decoded.message;
    const attempt = this.attempt;
    if (attempt) {
      this.receiveJoining(attempt, m, now);
      return;
    }
    switch (m.t) {
      case 'result': {
        this.lastResult = { seq: m.seq, ok: m.ok, reason: m.ok ? null : m.reason };
        const action = this.pending.get(m.seq);
        if (!action) return;
        this.pending.delete(m.seq);
        const result: ActionResult = m.ok
          ? { ok: true, blocks: [], player: null, notices: m.notices }
          : { ok: false, reason: m.reason };
        this.o.listener.onResult(action, result);
        break;
      }
      case 'record':
        this.current = m.record;
        this.o.listener.onPlayer(m.record);
        break;
      case 'blocks': {
        const changes: BlockChange[] = [];
        for (let i = 0; i < m.changes.length; i += 4) {
          changes.push({
            x: m.changes[i],
            y: m.changes[i + 1],
            z: m.changes[i + 2],
            id: m.changes[i + 3],
          });
        }
        for (const c of changes) this.world?.setBlock(c.x, c.y, c.z, c.id);
        this.o.listener.onBlocks(changes);
        break;
      }
      case 'poses':
        for (const p of m.poses) {
          if (p.id !== this.selfId) this.roster.push(p.id, p, now, p.tp);
        }
        break;
      case 'joined':
        this.roster.add(m.id, m.name, m.slot, false, null, now);
        this.o.listener.onPeer({ kind: 'joined', id: m.id, name: m.name, slot: m.slot });
        break;
      case 'left': {
        const gone = this.roster.remove(m.id);
        if (gone)
          this.o.listener.onPeer({ kind: 'left', id: m.id, name: gone.name, reason: m.reason });
        break;
      }
      case 'pong':
        this.rttMs = now - m.ts;
        this.adoptTime(m.time, m.frozen, now);
        break;
      case 'bye':
        this.end('closed');
        break;
      default:
        break;
    }
  }

  private receiveJoining(attempt: Attempt, m: HostMessage, now: number): void {
    switch (m.t) {
      case 'reject':
        this.failAttempt(new JoinError(m.reason));
        return;
      case 'welcome':
        if (this.o.checksum(m.seed, m.generatorVersion) !== m.checksum) {
          this.send({ t: 'bye' });
          this.failAttempt(new JoinError('terrain'));
          return;
        }
        attempt.welcome = m;
        return;
      case 'snapshot':
        if (attempt.welcome) attempt.parts.push(m.chunks);
        return;
      case 'ready': {
        const welcome = attempt.welcome;
        if (!welcome) return;
        this.attempt = null;
        const rejoin = this.selfId !== null;
        this.selfId = welcome.id;
        this.selfName = welcome.name;
        this.selfSlot = welcome.slot;
        this.current = welcome.record;
        this.pending.clear();
        this.roster.clear();
        for (const p of welcome.players) this.roster.add(p.id, p.name, p.slot, p.host, p.pose, now);
        this.adoptTime(welcome.time, welcome.frozen, now);
        this.lastPose = null;
        this.lastPingMs = -Infinity;
        this.world = this.o.listener.onWorld(welcome, joinParts(attempt.parts), rejoin);
        this.setStatus('online');
        attempt.resolve();
        return;
      }
      case 'bye':
        this.failAttempt(new JoinError('closed'));
        return;
      default:
        return;
    }
  }

  private adoptTime(time: number, frozen: boolean, now: number): void {
    this.time = time;
    this.timeAtMs = now;
    this.frozenTime = frozen;
  }

  // --- losing the host -------------------------------------------------------------------

  private connectionClosed(conn: Connection): void {
    if (conn !== this.conn) return;
    this.conn = null;
    if (this.attempt?.conn === conn) {
      this.failAttempt(new JoinError(this.status === 'reconnecting' ? 'timeout' : 'closed'));
      return;
    }
    if (this.status === 'online') this.lose();
  }

  /** The host went silent or the connection broke: retry the room for a while. */
  private lose(): void {
    const conn = this.conn;
    this.conn = null;
    if (conn) {
      conn.onClose = null;
      conn.close();
    }
    const now = this.o.clock();
    this.reconnectStartMs = now;
    this.nextAttemptMs = now;
    this.setStatus('reconnecting');
  }

  private async retry(): Promise<void> {
    this.attempting = true;
    try {
      let signaling = this.signaling;
      if (!signaling || signaling.state !== 'open') {
        signaling?.close();
        signaling = this.o.network.signaling();
        this.signaling = signaling;
        await signaling.open(guestPeerId(this.o.build, this.o.randomBytes(8)));
      }
      const conn = await signaling.connect(roomPeerId(this.o.build, this.o.code));
      if (this.status !== 'reconnecting') {
        conn.close();
        return;
      }
      this.attempting = false;
      await this.hello(conn);
    } catch {
      // The next attempt is due after `RECONNECT_INTERVAL_MS`.
    } finally {
      this.attempting = false;
    }
  }

  private end(reason: EndReason): void {
    if (this.status === 'offline') return;
    this.attempt = null;
    this.dispose();
    this.roster.clear();
    this.setStatus('offline');
    this.o.listener.onEnd(reason);
  }

  private send(message: GuestMessage): void {
    this.conn?.send(encodeMessage(message));
  }

  private setStatus(status: ClientStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.o.listener.onStatus(status);
  }
}
