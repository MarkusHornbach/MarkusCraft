// Multiplayer in the browser: opens a room or joins one through the PeerJS network,
// drives the host or guest session from frames and a timer, keeps the notices, the screen
// wake lock and the state the test API reports. `Game` supplies the world and the player.
import type { Action } from '../actions/actions';
import type { PlayerRecord } from '../actions/playerRecord';
import type { Session, SessionListener } from '../actions/Session';
import {
  INFO_TIMEOUT_MS,
  NET_MAX_PLAYERS,
  NET_NOTICE_MS,
  NET_NOTICES_MAX,
  ROOM_CODE_ATTEMPTS,
} from './config';
import type { ClientSession, EndReason, JoinFailure } from '../net/ClientSession';
import type { HostSession, PeerEvent } from '../net/HostSession';
import type { NetPose, RoomInfo, Welcome } from '../net/protocol';
import { makeRoomCode, normalizeRoomCode, roomCodeOf, roomPeerId } from '../net/roomCode';
import type { GuestEntry, WorldEdits } from '../save/saveFormat';
import { type Network, SignalError, type Signaling } from '../net/transport';
import type { TrafficMeter, TrafficRates } from '../net/traffic';
import type { World } from '../world/World';
import { terrainChecksum } from '../world/generation/terrain';
import { type PlayerIdentity, loadIdentity, saveIdentity } from './playerIdentity';
import { isLookChoice, resolveLook } from '../player/looks';

/** Texts of everything that can go wrong when joining, as the world menu shows them. */
export const JOIN_TEXT: Record<JoinFailure | 'unavailable', string> = {
  'not-found': 'Room not found',
  full: 'Room is full',
  build: 'Different game version. Reload the page on both devices.',
  unreachable: 'Could not reach the connection service. Is this device on the home network?',
  duplicate: 'You are already in this world in another tab.',
  closed: 'The host closed the world.',
  terrain: "This browser generates the world differently from the host's. Try another browser.",
  timeout: 'The host did not answer.',
  unavailable: 'Multiplayer is not available in this build.',
};

export const TEXT_HOST_CLOSED = 'The host closed the world.';
export const TEXT_HOST_LOST = 'Lost the connection to the host.';
export const TEXT_RECONNECTING = 'Connection lost. Reconnecting…';
export const TEXT_RECONNECTED = 'Connected again';

/** The guest's goodbye and the host's are given this long before the connections close. */
const CLOSE_DELAY_MS = 300;
/** Frames do this work too; the timer keeps a hidden page answering. */
const TIMER_MS = 250;

/** What multiplayer needs from the game. */
export interface MultiplayerGame {
  /** The open world, its name and the player's record; null name: no world is open. */
  world(): World;
  worldName(): string | null;
  mode(): 'creative' | 'gathering';
  record(): PlayerRecord;
  pose(): NetPose;
  flying(): boolean;
  /** The player holds break on a block (the others' figure swings its arm). */
  busy(): boolean;
  /** The clock the game measures break progress on (its simulation time). */
  actionClock(): number;
  /** The guests the open world remembers, and where they go when its room closes. */
  guests(): readonly GuestEntry[];
  keepGuests(guests: GuestEntry[]): void;
  /** The guests in the room changed (joined, left, played): the world's record is unsaved. */
  guestsChanged(): void;
  time(): number;
  frozen(): boolean;
  /** The game's listener: blocks, record and answers of its own player. */
  listener: SessionListener;
  /** A guest's world arrived: open it (never saved) and return it. */
  openGuestWorld(welcome: Welcome, edits: WorldEdits, rejoin: boolean): World;
  /** The session `Game` hands its actions to; null: a local session with this record. */
  useSession(session: Session | null, record: PlayerRecord): void;
  /** A guest's room ended: back to the world list with the text. */
  guestEnded(text: string): void;
  /** The role changed (menus, pause behaviour). */
  roleChanged(): void;
  /** The network of this build (loads `peerjs`), or throws when there is none. */
  loadNetwork(): Promise<Network>;
  build: string;
  available: boolean;
}

export interface HostOptions {
  /** A fixed room code (tests). */
  code?: string;
  /** Another build id (tests of the version check). */
  build?: string;
}

export interface JoinOptions {
  name?: string;
  /** A forced terrain checksum (tests of the mismatch). */
  checksum?: number;
  build?: string;
}

/** What the debug overlay shows about the room (Phase 6 part E). */
export interface NetDebug {
  role: 'host' | 'guest';
  status: string;
  roomCode: string | null;
  players: number;
  /** The guest's round trip to the host; on the host, each guest's own report. */
  rtt: { name: string; rttMs: number | null }[];
  /** How each connection runs ("direct (host → host)"), or empty before the first look. */
  links: string[];
  signal: string;
  rates: TrafficRates;
}

/** The connections' statistics are read this often (they are asynchronous). */
const STATS_INTERVAL_MS = 2000;

/** One row of the room list. */
export interface RoomRow extends RoomInfo {
  code: string;
}

export type RoomList =
  { ok: true; rooms: RoomRow[] } | { ok: false; reason: 'off' | 'unreachable' | 'unavailable' };

export interface NetPlayerState {
  id: number;
  name: string;
  slot: number;
  /** The figure's look (1–8). */
  look: number;
  self: boolean;
  host: boolean;
  fly: boolean;
  busy: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export class Multiplayer {
  role: 'off' | 'host' | 'guest' = 'off';
  host: HostSession | null = null;
  client: ClientSession | null = null;
  roomCode: string | null = null;
  lastError: string | null = null;
  identity: PlayerIdentity;
  private readonly game: MultiplayerGame;
  private signaling: Signaling | null = null;
  /** The room list's own registration, kept while the world menu asks again and again. */
  private lister: Signaling | null = null;
  private notices: { text: string; untilMs: number }[] = [];
  private timer = 0;
  private wake: WakeLockSentinel | null = null;
  private wakeWanted = false;
  /** Set by a test: the guest's next teleport is reported as such. */
  private teleported = false;
  /** The traffic of the room's connections, and how they run. */
  private meter: TrafficMeter | null = null;
  private links: string[] = [];
  private lastStatsMs = -Infinity;

  constructor(game: MultiplayerGame) {
    this.game = game;
    this.identity = loadIdentity();
    document.addEventListener('visibilitychange', () => {
      // The browser drops a wake lock when the page is hidden: ask again when it is back.
      if (document.visibilityState === 'visible' && this.wakeWanted) this.requestWake();
    });
  }

  get active(): boolean {
    return this.role !== 'off';
  }

  /** The session of the role, or null while off. */
  get session(): (Session & { replaceRecord?: (record: PlayerRecord) => void }) | null {
    return this.host?.local ?? this.client ?? null;
  }

  setName(name: string): void {
    this.identity = { ...this.identity, name: name.slice(0, 64) };
    saveIdentity(this.identity);
  }

  /** The look this device's figure has (1–8): the chosen one, or the key's. */
  get look(): number {
    return resolveLook(this.identity.look, this.identity.key);
  }

  /** A new choice of look (0 Automatic, 1–8); the others see it at once. */
  setLook(choice: number): void {
    if (!isLookChoice(choice)) return;
    this.identity = { ...this.identity, look: choice };
    saveIdentity(this.identity);
    this.sendProfile();
  }

  /** The name field was left or Enter pressed: the others learn the name. */
  commitName(): void {
    this.sendProfile();
  }

  private sendProfile(): void {
    if (this.host) this.host.setHostProfile(this.identity.name, this.look);
    else if (this.client?.status === 'online') {
      this.client.setProfile(this.identity.name, this.look);
    }
  }

  // --- notices -----------------------------------------------------------------------

  notice(text: string): void {
    this.notices.push({ text, untilMs: performance.now() + NET_NOTICE_MS });
    while (this.notices.length > NET_NOTICES_MAX) this.notices.shift();
  }

  /** The notices that are still shown. */
  currentNotices(): string[] {
    const now = performance.now();
    this.notices = this.notices.filter((n) => n.untilMs > now);
    return this.notices.map((n) => n.text);
  }

  private onPeer(event: PeerEvent): void {
    if (this.host) this.game.guestsChanged();
    if (event.kind === 'profile') {
      // The player list shows the new name and look.
      this.game.roleChanged();
      return;
    }
    this.notice(event.kind === 'joined' ? `${event.name} joined` : `${event.name} left`);
  }

  // --- hosting -------------------------------------------------------------------------

  /** Opens the open world to others; resolves with the room code. */
  async openRoom(options: HostOptions = {}): Promise<string> {
    if (this.role !== 'off') throw new Error('Already in a room');
    const worldName = this.game.worldName();
    if (worldName === null) throw new Error('No world is open');
    if (!this.game.available) throw new Error(JOIN_TEXT.unavailable);
    const sessions = await loadSessions();
    const meter = new sessions.TrafficMeter(() => performance.now());
    const network = sessions.countedNetwork(await this.game.loadNetwork(), meter);
    const build = options.build ?? this.game.build;
    const signaling = network.signaling();
    let code: string | null = null;
    for (let attempt = 0; attempt < ROOM_CODE_ATTEMPTS && code === null; attempt++) {
      const candidate =
        (options.code !== undefined ? normalizeRoomCode(options.code) : null) ??
        makeRoomCode(crypto.getRandomValues(new Uint8Array(6)));
      try {
        await signaling.open(roomPeerId(build, candidate));
        code = candidate;
      } catch (error) {
        if (!(error instanceof SignalError) || error.reason !== 'taken' || options.code) {
          signaling.close();
          throw new Error(JOIN_TEXT.unreachable, { cause: error });
        }
      }
    }
    if (code === null) {
      signaling.close();
      throw new Error(JOIN_TEXT.unreachable);
    }
    const world = this.game.world();
    // From now on this device is known by its key: it is kept.
    saveIdentity(this.identity);
    const { HostSession } = sessions;
    const host = new HostSession({
      build,
      world,
      mode: this.game.mode(),
      worldName,
      checksum: terrainChecksum(world.seed, world.generatorVersion),
      hostName: this.identity.name,
      hostKey: this.identity.key,
      hostRecord: this.game.record(),
      hostPose: () => this.game.pose(),
      hostLook: this.look,
      hostFlags: () => ({ fly: this.game.flying(), busy: this.game.busy() }),
      time: this.game.time(),
      frozen: this.game.frozen(),
      clock: () => performance.now(),
      localClock: () => this.game.actionClock(),
      wallClock: () => Date.now(),
      guests: this.game.guests(),
      listener: { ...this.wrap(this.game.listener), onPeer: (e) => this.onPeer(e) },
    });
    signaling.onConnection = (conn) => host.accept(conn);
    this.signaling = signaling;
    this.host = host;
    this.useMeter(meter);
    this.roomCode = code;
    this.role = 'host';
    this.lastError = null;
    this.game.useSession(host.local, host.hostRecord);
    this.start();
    return code;
  }

  // --- joining -------------------------------------------------------------------------

  /** Joins a room; resolves when the world is open, rejects with the text of the reason. */
  async join(codeText: string, options: JoinOptions = {}): Promise<void> {
    if (this.role !== 'off') throw new Error('Already in a room');
    const code = normalizeRoomCode(codeText);
    if (!code) {
      this.lastError = JOIN_TEXT['not-found'];
      throw new Error(this.lastError);
    }
    if (!this.game.available) {
      this.lastError = JOIN_TEXT.unavailable;
      throw new Error(this.lastError);
    }
    if (options.name !== undefined) this.setName(options.name);
    let network: Network;
    let sessions: Sessions;
    let meter: TrafficMeter;
    try {
      sessions = await loadSessions();
      meter = new sessions.TrafficMeter(() => performance.now());
      network = sessions.countedNetwork(await this.game.loadNetwork(), meter);
    } catch (error) {
      this.lastError = JOIN_TEXT.unreachable;
      throw new Error(this.lastError, { cause: error });
    }
    const { ClientSession, JoinError } = sessions;
    // The host keeps this guest's items under the key: it must survive a reload.
    saveIdentity(this.identity);
    const client = new ClientSession({
      network,
      build: options.build ?? this.game.build,
      key: this.identity.key,
      name: this.identity.name,
      look: this.look,
      code,
      randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
      clock: () => performance.now(),
      actionClock: () => this.game.actionClock(),
      checksum: (seed, version) => options.checksum ?? terrainChecksum(seed, version),
      listener: {
        ...this.wrap(this.game.listener),
        onWorld: (welcome, edits, rejoin) => {
          const world = this.game.openGuestWorld(welcome, edits, rejoin);
          this.game.useSession(client, welcome.record);
          return world;
        },
        onPeer: (e) => this.onPeer(e),
        onStatus: (status) => {
          if (this.client !== client) return;
          if (status === 'reconnecting') this.notice(TEXT_RECONNECTING);
          this.game.roleChanged();
        },
        onEnd: (reason) => this.guestEnded(client, reason),
      },
    });
    this.client = client;
    this.useMeter(meter);
    this.role = 'guest';
    this.roomCode = code;
    this.lastError = null;
    this.game.roleChanged();
    try {
      await client.join();
    } catch (error) {
      if (this.client === client) {
        this.client = null;
        this.role = 'off';
        this.roomCode = null;
        this.game.roleChanged();
      }
      const reason = error instanceof JoinError ? error.reason : 'unreachable';
      this.lastError = JOIN_TEXT[reason];
      throw new Error(this.lastError, { cause: error });
    }
    this.start();
  }

  private guestEnded(client: ClientSession, reason: EndReason): void {
    if (this.client !== client) return;
    this.stop();
    this.lastError = reason === 'closed' ? TEXT_HOST_CLOSED : TEXT_HOST_LOST;
    this.game.guestEnded(this.lastError);
  }

  /** Leaves or closes the room. The player keeps playing (host) or the world is gone (guest). */
  leave(): void {
    if (this.role === 'host' && this.host) {
      const host = this.host;
      host.close();
      // The guests who were in the room stay in the world's record.
      this.game.keepGuests(host.guestEntries());
      const signaling = this.signaling;
      window.setTimeout(() => signaling?.close(), CLOSE_DELAY_MS);
      this.game.useSession(null, host.hostRecord);
    } else if (this.role === 'guest' && this.client) {
      const client = this.client;
      client.leave();
      window.setTimeout(() => client.dispose(), CLOSE_DELAY_MS);
    }
    this.stop();
  }

  /** Test tool: the guest's transport dies without a goodbye. */
  dropConnection(): void {
    this.client?.dropConnection();
  }

  /** Test tool: any text to the host. */
  sendRaw(message: unknown): void {
    this.client?.sendRaw(typeof message === 'string' ? message : JSON.stringify(message));
  }

  /** The game teleported its player. */
  noteTeleport(): void {
    this.host?.noteHostTeleport();
    this.teleported = true;
  }

  /** The time of day of the room, or null while off. */
  timeOfDay(nowMs: number): number | null {
    if (this.host) return this.host.timeOfDay(nowMs);
    if (this.client && this.client.status !== 'offline') return this.client.timeOfDay(nowMs);
    return null;
  }

  setTime(time: number): void {
    this.host?.setTime(time);
  }

  /** The work of a frame: the session, and the guest's pose. */
  frame(nowMs: number): void {
    this.pollStats(nowMs);
    this.host?.update(nowMs);
    // Guests play without the host's steps (a test, a paused host): their records and poses
    // are part of the world's record.
    if (this.host && this.host.playerCount > 1) this.game.guestsChanged();
    const client = this.client;
    if (!client) return;
    client.update(nowMs);
    // The update may have ended the room (the host was lost).
    if (this.client !== client) return;
    client.setPose(this.game.pose(), nowMs, this.teleported, this.game.flying(), this.game.busy());
    this.teleported = false;
  }

  // --- room list -----------------------------------------------------------------------

  /** The open rooms of this build at home, with their details. */
  async rooms(): Promise<RoomList> {
    if (!this.game.available) return { ok: false, reason: 'unavailable' };
    let network: Network;
    try {
      network = await this.game.loadNetwork();
    } catch {
      return { ok: false, reason: 'unreachable' };
    }
    const list = await network.directory.list();
    if (!list.ok) return list;
    const codes = list.ids
      .map((id) => roomCodeOf(id, this.game.build))
      .filter((code): code is string => code !== null && code !== this.roomCode);
    if (codes.length === 0) return { ok: true, rooms: [] };
    let signaling = this.lister;
    if (!signaling || signaling.state !== 'open') {
      signaling?.close();
      signaling = network.signaling();
      this.lister = signaling;
      try {
        await signaling.open(
          `mc-${this.game.build}-l-${hex(crypto.getRandomValues(new Uint8Array(6)))}`,
        );
      } catch {
        signaling.close();
        if (this.lister === signaling) this.lister = null;
        return { ok: false, reason: 'unreachable' };
      }
    }
    const { decodeHostMessage, encodeMessage } = await loadSessions();
    const rows = await Promise.all(
      codes.map((code) => this.roomInfo(signaling, code, decodeHostMessage, encodeMessage)),
    );
    return { ok: true, rooms: rows.filter((row): row is RoomRow => row !== null) };
  }

  private async roomInfo(
    signaling: Signaling,
    code: string,
    decodeHostMessage: Sessions['decodeHostMessage'],
    encodeMessage: Sessions['encodeMessage'],
  ): Promise<RoomRow | null> {
    const timeout = new Promise<null>((resolve) =>
      window.setTimeout(() => resolve(null), INFO_TIMEOUT_MS),
    );
    const ask = (async (): Promise<RoomRow | null> => {
      const conn = await signaling.connect(roomPeerId(this.game.build, code));
      return new Promise<RoomRow | null>((resolve) => {
        conn.onMessage = (text) => {
          const decoded = decodeHostMessage(text);
          // Closing reports the close at once: the answer must be taken first.
          conn.onClose = null;
          conn.close();
          if (!decoded.ok || decoded.message.t !== 'info') resolve(null);
          else {
            const { hostName, worldName, mode, players, max } = decoded.message;
            resolve({
              code,
              hostName,
              worldName,
              mode,
              players,
              max: Math.min(max, NET_MAX_PLAYERS),
            });
          }
        };
        conn.onClose = () => resolve(null);
        conn.send(encodeMessage({ t: 'info' }));
      });
    })().catch(() => null);
    return Promise.race([ask, timeout]);
  }

  /** The world menu is gone: its registration for the room list is given up. */
  closeRoomList(): void {
    this.lister?.close();
    this.lister = null;
  }

  // --- state ---------------------------------------------------------------------------

  /** Everyone in the room as the player list shows them (the own player included). */
  players(ownPose: NetPose): NetPlayerState[] {
    if (this.host) {
      return this.host.players().map((p) => ({
        id: p.id,
        name: p.name,
        slot: p.slot,
        look: p.look,
        self: p.host,
        host: p.host,
        fly: p.fly,
        busy: p.busy,
        ...(p.host ? ownPose : p.pose),
      }));
    }
    const client = this.client;
    if (!client || client.selfId === null || client.status === 'offline') return [];
    const others = client.roster.list().map((p) => ({
      id: p.id,
      name: p.name,
      slot: p.slot,
      look: p.look,
      self: false,
      host: p.host,
      fly: p.fly,
      busy: p.busy,
      ...(p.poses.latest ?? { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }),
    }));
    const self = {
      id: client.selfId,
      name: client.selfName ?? '',
      slot: client.selfSlot,
      look: client.selfLook,
      self: true,
      host: false,
      fly: this.game.flying(),
      busy: this.game.busy(),
      ...ownPose,
    };
    return [self, ...others].sort((a, b) => a.id - b.id);
  }

  /** The room as the debug overlay shows it, or null while off. */
  debugInfo(nowMs: number): NetDebug | null {
    const meter = this.meter;
    if (this.role === 'off' || !meter) return null;
    const host = this.host;
    const client = this.client;
    let rtt: NetDebug['rtt'] = [];
    let players = 0;
    let signal = 'off';
    if (host) {
      rtt = host.roundTrips().map((g) => ({ name: g.name, rttMs: g.rttMs }));
      players = host.playerCount;
      signal = this.signaling?.state ?? 'off';
    } else if (client) {
      rtt = [{ name: 'host', rttMs: client.rttMs }];
      players = client.status === 'online' ? client.roster.list().length + 1 : 0;
      signal = client.signalState;
    }
    return {
      role: this.role,
      status: this.status,
      roomCode: this.roomCode,
      players,
      rtt,
      links: this.links,
      signal,
      rates: meter.rates(nowMs),
    };
  }

  private useMeter(meter: TrafficMeter): void {
    this.meter = meter;
    this.links = [];
    this.lastStatsMs = -Infinity;
  }

  /** Reads how the connections run, every `STATS_INTERVAL_MS` (asynchronous). */
  private pollStats(nowMs: number): void {
    const meter = this.meter;
    if (!meter || nowMs - this.lastStatsMs < STATS_INTERVAL_MS) return;
    this.lastStatsMs = nowMs;
    const connections = meter.connections();
    void Promise.all([loadSessions(), ...connections.map((c) => c.stats().catch(() => null))]).then(
      ([sessions, ...all]) => {
        if (this.meter !== meter) return;
        this.links = all.map((entries) => {
          const pair = entries ? sessions.selectedPair(entries) : null;
          return pair ? sessions.linkKind(pair) : 'unknown';
        });
      },
    );
  }

  get status(): 'offline' | 'connecting' | 'syncing' | 'online' | 'reconnecting' {
    if (this.host) return 'online';
    return this.client?.status ?? 'offline';
  }

  get selfId(): number | null {
    if (this.host) return this.host.selfId;
    return this.client?.selfId ?? null;
  }

  // --- helpers -------------------------------------------------------------------------

  /** The game's listener, guarded so a stale session reports nothing. */
  private wrap(listener: SessionListener): SessionListener {
    return {
      onBlocks: (changes) => listener.onBlocks(changes),
      onPlayer: (record) => listener.onPlayer(record),
      onResult: (action: Action, result) => listener.onResult(action, result),
    };
  }

  private start(): void {
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.frame(performance.now()), TIMER_MS);
    this.wakeWanted = true;
    this.requestWake();
    this.game.roleChanged();
  }

  private stop(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
    this.host = null;
    this.client = null;
    this.signaling = null;
    this.meter = null;
    this.links = [];
    this.role = 'off';
    this.roomCode = null;
    this.wakeWanted = false;
    const wake = this.wake;
    this.wake = null;
    if (wake) void wake.release().catch(() => {});
    this.game.roleChanged();
  }

  /** Keeps the screen on while networked, where the browser can; failures are ignored. */
  private requestWake(): void {
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLock }).wakeLock;
    if (!wakeLock || this.wake) return;
    try {
      wakeLock.request('screen').then(
        (sentinel) => {
          if (!this.wakeWanted) {
            void sentinel.release().catch(() => {});
            return;
          }
          this.wake = sentinel;
          sentinel.addEventListener?.('release', () => {
            if (this.wake === sentinel) this.wake = null;
          });
        },
        () => {},
      );
    } catch {
      // Some browsers throw instead of rejecting.
    }
  }
}

/** The session code, in a chunk of its own: single-player never loads it. */
async function loadSessions() {
  const [host, client, protocol, traffic, netTest] = await Promise.all([
    import('../net/HostSession'),
    import('../net/ClientSession'),
    import('../net/protocol'),
    import('../net/traffic'),
    import('../net/netTest'),
  ]);
  return {
    HostSession: host.HostSession,
    ClientSession: client.ClientSession,
    JoinError: client.JoinError,
    decodeHostMessage: protocol.decodeHostMessage,
    encodeMessage: protocol.encodeMessage,
    TrafficMeter: traffic.TrafficMeter,
    countedNetwork: traffic.countedNetwork,
    selectedPair: netTest.selectedPair,
    linkKind: netTest.linkKind,
  };
}

type Sessions = Awaited<ReturnType<typeof loadSessions>>;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
