// An in-memory network with a fake clock and seeded delays: for unit tests and, later, the
// performance test's simulated guests. Nothing happens until the clock is advanced.
import { type Rng, mulberry32 } from '../util/rng';
import {
  type Connection,
  type DirectoryList,
  type RoomDirectory,
  SignalError,
  type SignalState,
  type Signaling,
  type StatsEntry,
} from './transport';

export interface MemoryNetworkOptions {
  /** Seed of the delays. */
  seed?: number;
  /** Every message, connection and answer takes between these many milliseconds. */
  minDelayMs?: number;
  maxDelayMs?: number;
  /** Whether the directory lists ids (PeerJS `allow_discovery`). */
  discovery?: boolean;
}

interface Scheduled {
  at: number;
  order: number;
  run: () => void;
}

export class MemoryNetwork {
  /** The fake clock in milliseconds. */
  nowMs = 0;
  /** While false, opening ids and listing fail as if the server could not be reached. */
  reachable = true;
  discovery: boolean;
  private readonly rng: Rng;
  private readonly minDelay: number;
  private readonly maxDelay: number;
  private readonly events: Scheduled[] = [];
  private order = 0;
  /** Registered ids and their signaling. */
  readonly peers = new Map<string, MemorySignaling>();

  constructor(options: MemoryNetworkOptions = {}) {
    this.rng = mulberry32(options.seed ?? 1);
    this.minDelay = options.minDelayMs ?? 0;
    this.maxDelay = Math.max(this.minDelay, options.maxDelayMs ?? this.minDelay);
    this.discovery = options.discovery ?? true;
  }

  /** A new peer on this network (not registered until `open`). */
  signaling(): MemorySignaling {
    return new MemorySignaling(this);
  }

  directory(): RoomDirectory {
    return {
      list: () =>
        new Promise<DirectoryList>((resolve) => {
          this.after(this.delay(), () => {
            if (!this.reachable) resolve({ ok: false, reason: 'unreachable' });
            else if (!this.discovery) resolve({ ok: false, reason: 'off' });
            else resolve({ ok: true, ids: [...this.peers.keys()] });
          });
        }),
    };
  }

  /** One delay drawn from the seeded range. */
  delay(): number {
    return this.minDelay + (this.maxDelay - this.minDelay) * this.rng();
  }

  /** Runs `run` at `nowMs + ms`; events at the same time run in the order they were added. */
  after(ms: number, run: () => void): void {
    this.at(this.nowMs + ms, run);
  }

  at(time: number, run: () => void): void {
    this.events.push({ at: Math.max(time, this.nowMs), order: this.order++, run });
  }

  /** Moves the clock forward, running every event that falls due on the way. */
  advance(ms: number): void {
    const end = this.nowMs + ms;
    for (;;) {
      const next = this.nextEvent(end);
      if (!next) break;
      this.nowMs = next.at;
      next.run();
    }
    this.nowMs = end;
  }

  /** Number of events not run yet. */
  get pending(): number {
    return this.events.length;
  }

  private nextEvent(end: number): Scheduled | null {
    let best = -1;
    for (let i = 0; i < this.events.length; i++) {
      const e = this.events[i];
      if (e.at > end) continue;
      const b = best >= 0 ? this.events[best] : null;
      if (!b || e.at < b.at || (e.at === b.at && e.order < b.order)) best = i;
    }
    if (best < 0) return null;
    return this.events.splice(best, 1)[0];
  }
}

export class MemoryConnection implements Connection {
  readonly remoteId: string;
  open = true;
  onMessage: ((text: string) => void) | null = null;
  onClose: (() => void) | null = null;
  /** The other end; set right after both ends exist. */
  peer: MemoryConnection | null = null;
  /** Called once when this end closes (the signaling forgets it). */
  closed: (() => void) | null = null;
  private readonly network: MemoryNetwork;
  /** Delivery time of the last message sent from this end: later ones never overtake it. */
  private lastAt = 0;
  private inFlight = 0;

  constructor(network: MemoryNetwork, remoteId: string) {
    this.network = network;
    this.remoteId = remoteId;
  }

  send(text: string): void {
    if (!this.open) return;
    const peer = this.peer;
    this.inFlight += text.length;
    this.schedule(() => {
      this.inFlight -= text.length;
      if (peer?.open) peer.onMessage?.(text);
    });
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    const peer = this.peer;
    this.schedule(() => peer?.closeHere());
    this.closed?.();
    this.onClose?.();
  }

  /** The other end closed: this end learns it now. */
  closeHere(): void {
    if (!this.open) return;
    this.open = false;
    this.closed?.();
    this.onClose?.();
  }

  bufferedAmount(): number {
    return this.inFlight;
  }

  stats(): Promise<StatsEntry[] | null> {
    return Promise.resolve(null);
  }

  private schedule(run: () => void): void {
    const at = Math.max(this.network.nowMs + this.network.delay(), this.lastAt);
    this.lastAt = at;
    this.network.at(at, run);
  }
}

export class MemorySignaling implements Signaling {
  id: string | null = null;
  state: SignalState = 'off';
  onConnection: ((connection: Connection) => void) | null = null;
  onStateChange: ((state: SignalState) => void) | null = null;
  private readonly network: MemoryNetwork;
  private readonly connections = new Set<MemoryConnection>();

  constructor(network: MemoryNetwork) {
    this.network = network;
  }

  open(id: string): Promise<void> {
    this.state = 'connecting';
    return new Promise<void>((resolve, reject) => {
      this.network.after(this.network.delay(), () => {
        if (!this.network.reachable) {
          this.state = 'lost';
          reject(new SignalError('unreachable'));
        } else if (this.network.peers.has(id)) {
          this.state = 'off';
          reject(new SignalError('taken'));
        } else {
          this.network.peers.set(id, this);
          this.id = id;
          this.state = 'open';
          resolve();
        }
      });
    });
  }

  connect(remoteId: string): Promise<Connection> {
    return new Promise<Connection>((resolve, reject) => {
      this.network.after(this.network.delay(), () => {
        const remote = this.network.peers.get(remoteId);
        if (!this.id || !remote || remote === this) {
          reject(new SignalError('not-found'));
          return;
        }
        const mine = new MemoryConnection(this.network, remoteId);
        const theirs = new MemoryConnection(this.network, this.id);
        mine.peer = theirs;
        theirs.peer = mine;
        this.track(mine);
        remote.track(theirs);
        remote.onConnection?.(theirs);
        resolve(mine);
      });
    });
  }

  close(): void {
    if (this.id && this.network.peers.get(this.id) === this) this.network.peers.delete(this.id);
    this.id = null;
    this.state = 'off';
    for (const connection of [...this.connections]) connection.close();
  }

  /** Simulates losing the signaling server (existing connections stay). */
  lose(): void {
    if (this.id && this.network.peers.get(this.id) === this) this.network.peers.delete(this.id);
    this.state = 'lost';
    this.onStateChange?.('lost');
  }

  private track(connection: MemoryConnection): void {
    this.connections.add(connection);
    connection.closed = () => this.connections.delete(connection);
  }
}
