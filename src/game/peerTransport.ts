// Signaling, connections and the room directory with the `peerjs` client. Loaded with a
// dynamic import the first time multiplayer is used, so single-player never fetches it.
import { type DataConnection, Peer, type PeerError } from 'peerjs';
import {
  type Connection,
  type DirectoryList,
  type Network,
  type RoomDirectory,
  SignalError,
  type SignalState,
  type Signaling,
  type StatsEntry,
} from '../net/transport';
import { ICE_TIMEOUT_MS, PEERJS_KEY, SIGNAL_TIMEOUT_MS } from './config';
import { type NetConfig, type SignalServer, discoveryUrl } from './netConfig';

/** After losing the signaling server, a registered peer tries again this often. */
const RECONNECT_MS = 5_000;
/** The directory gives up after this long. */
const DIRECTORY_TIMEOUT_MS = 5_000;

class PeerConnection implements Connection {
  readonly remoteId: string;
  onMessage: ((text: string) => void) | null = null;
  onClose: (() => void) | null = null;
  private readonly dc: DataConnection;
  private readonly forget: () => void;
  private closed = false;

  constructor(dc: DataConnection, forget: () => void) {
    this.dc = dc;
    this.forget = forget;
    this.remoteId = dc.peer;
    dc.on('data', (data) => {
      if (typeof data === 'string' && !this.closed) this.onMessage?.(data);
    });
    dc.on('close', () => this.finish());
    dc.on('error', () => this.close());
  }

  get open(): boolean {
    return !this.closed && this.dc.open;
  }

  send(text: string): void {
    if (this.open) void this.dc.send(text);
  }

  close(): void {
    if (this.closed) return;
    this.dc.close();
    this.finish();
  }

  bufferedAmount(): number {
    return this.dc.dataChannel?.bufferedAmount ?? 0;
  }

  async stats(): Promise<StatsEntry[] | null> {
    const pc = this.dc.peerConnection;
    if (!pc) return null;
    try {
      const report = await pc.getStats();
      const entries: StatsEntry[] = [];
      report.forEach((entry: Record<string, unknown>) => entries.push({ ...entry }));
      return entries;
    } catch {
      return null;
    }
  }

  private finish(): void {
    if (this.closed) return;
    this.closed = true;
    this.forget();
    this.onClose?.();
  }
}

class PeerSignaling implements Signaling {
  id: string | null = null;
  state: SignalState = 'off';
  onConnection: ((connection: Connection) => void) | null = null;
  onStateChange: ((state: SignalState) => void) | null = null;
  private readonly config: NetConfig;
  private readonly server: SignalServer;
  private peer: Peer | null = null;
  private reconnectTimer = 0;
  private readonly connections = new Set<PeerConnection>();
  /** Connections being made, by remote id: a `peer-unavailable` error ends them. */
  private readonly pending = new Map<string, (reason: SignalError) => void>();

  constructor(config: NetConfig, server: SignalServer) {
    this.config = config;
    this.server = server;
  }

  open(id: string): Promise<void> {
    this.close();
    this.state = 'connecting';
    const peer = new Peer(id, {
      host: this.server.host,
      port: this.server.port,
      path: this.server.path,
      secure: this.server.secure,
      key: PEERJS_KEY,
      config: { iceServers: this.config.iceServers },
      debug: 0,
    });
    this.peer = peer;
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = window.setTimeout(
        () => fail(new SignalError('unreachable')),
        SIGNAL_TIMEOUT_MS,
      );
      const fail = (error: SignalError): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (this.peer === peer) {
          this.peer = null;
          this.state = error.reason === 'unreachable' ? 'lost' : 'off';
        }
        peer.destroy();
        reject(error);
      };
      peer.on('open', () => {
        if (this.peer !== peer) return;
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          this.id = id;
          this.setState('open', false);
          resolve();
        } else {
          this.setState('open', true);
        }
      });
      peer.on('error', (error: PeerError<string>) => {
        if (this.peer !== peer) return;
        if (error.type === 'peer-unavailable') {
          this.failPending(error.message);
          return;
        }
        if (!settled) {
          fail(new SignalError(error.type === 'unavailable-id' ? 'taken' : 'unreachable'));
        }
      });
      peer.on('disconnected', () => {
        if (this.peer !== peer || !settled) return;
        this.setState('lost', true);
        this.scheduleReconnect(peer);
      });
      peer.on('connection', (dc) => {
        if (this.peer !== peer) return;
        dc.on('open', () => {
          if (this.peer !== peer) {
            dc.close();
            return;
          }
          this.onConnection?.(this.track(dc));
        });
      });
    });
  }

  connect(remoteId: string): Promise<Connection> {
    const peer = this.peer;
    if (!peer || !this.id) return Promise.reject(new SignalError('unreachable'));
    return new Promise<Connection>((resolve, reject) => {
      const dc = peer.connect(remoteId, { reliable: true, serialization: 'raw' });
      let settled = false;
      const finish = (error: SignalError | null): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (this.pending.get(remoteId) === fail) this.pending.delete(remoteId);
        if (error) {
          dc.close();
          reject(error);
        } else {
          resolve(this.track(dc));
        }
      };
      const fail = (error: SignalError): void => finish(error);
      const timer = window.setTimeout(() => fail(new SignalError('timeout')), ICE_TIMEOUT_MS);
      this.pending.set(remoteId, fail);
      dc.on('open', () => finish(null));
      dc.on('error', () => fail(new SignalError('timeout')));
      dc.on('close', () => fail(new SignalError('timeout')));
    });
  }

  close(): void {
    window.clearTimeout(this.reconnectTimer);
    for (const connection of [...this.connections]) connection.close();
    for (const fail of [...this.pending.values()]) fail(new SignalError('unreachable'));
    const peer = this.peer;
    this.peer = null;
    this.id = null;
    this.state = 'off';
    peer?.destroy();
  }

  private track(dc: DataConnection): PeerConnection {
    const connection: PeerConnection = new PeerConnection(dc, () =>
      this.connections.delete(connection),
    );
    this.connections.add(connection);
    return connection;
  }

  /** `peer-unavailable` names the id in its message ("Could not connect to peer <id>"). */
  private failPending(message: string): void {
    for (const [remoteId, fail] of [...this.pending]) {
      if (message.includes(remoteId)) fail(new SignalError('not-found'));
    }
  }

  private setState(state: SignalState, report: boolean): void {
    if (this.state === state) return;
    this.state = state;
    if (report) this.onStateChange?.(state);
  }

  private scheduleReconnect(peer: Peer): void {
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => {
      if (this.peer !== peer || peer.destroyed) return;
      if (peer.disconnected) {
        peer.reconnect();
        this.scheduleReconnect(peer);
      }
    }, RECONNECT_MS);
  }
}

class PeerDirectory implements RoomDirectory {
  private readonly url: string;

  constructor(server: SignalServer) {
    this.url = discoveryUrl(server, PEERJS_KEY);
  }

  async list(): Promise<DirectoryList> {
    const abort = new AbortController();
    const timer = window.setTimeout(() => abort.abort(), DIRECTORY_TIMEOUT_MS);
    try {
      const response = await fetch(this.url, { signal: abort.signal, cache: 'no-store' });
      if (response.status === 401) return { ok: false, reason: 'off' };
      if (!response.ok) return { ok: false, reason: 'unreachable' };
      const body: unknown = await response.json();
      if (!Array.isArray(body)) return { ok: false, reason: 'unreachable' };
      return { ok: true, ids: body.filter((id): id is string => typeof id === 'string') };
    } catch {
      return { ok: false, reason: 'unreachable' };
    } finally {
      window.clearTimeout(timer);
    }
  }
}

/** The PeerJS network of a configuration with a signaling server. */
export function createPeerNetwork(config: NetConfig, server: SignalServer): Network {
  return {
    signaling: () => new PeerSignaling(config, server),
    directory: new PeerDirectory(server),
  };
}
