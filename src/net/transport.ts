// The network seen by the game: connections that carry text, signaling that sets them
// up, and the directory of ids the signaling server knows. PeerJS and memory implement it.

/** One entry of the browser's connection statistics, as plain data (see `selectedPair`). */
export type StatsEntry = Readonly<Record<string, unknown>>;

/** A reliable, ordered channel to one other peer that carries text messages. */
export interface Connection {
  /** The id of the peer at the other end. */
  readonly remoteId: string;
  /** True from the moment it can send until it closed. */
  readonly open: boolean;
  /** Sends one message; does nothing once closed. */
  send(text: string): void;
  /** Closes both ends; `onClose` runs here at once and at the other end later. */
  close(): void;
  /** Bytes queued but not sent yet (the host keeps order with its own queue, Part B). */
  bufferedAmount(): number;
  /** The connection statistics of the browser, or null where there are none (memory). */
  stats(): Promise<StatsEntry[] | null>;
  onMessage: ((text: string) => void) | null;
  onClose: (() => void) | null;
}

/** Why opening an id or connecting to one failed. */
export type SignalFailure =
  /** The signaling server could not be reached (or did not answer in time). */
  | 'unreachable'
  /** Another peer holds the id. */
  | 'taken'
  /** No peer with that id is registered. */
  | 'not-found'
  /** The peer exists but no data channel opened in time (ICE failed). */
  | 'timeout';

export class SignalError extends Error {
  readonly reason: SignalFailure;
  constructor(reason: SignalFailure, message?: string) {
    super(message ?? reason);
    this.reason = reason;
  }
}

/** The state of the connection to the signaling server. */
export type SignalState = 'off' | 'connecting' | 'open' | 'lost';

/** Registers this peer under an id and makes connections to other ids. */
export interface Signaling {
  /** The id this peer is registered under, or null before `open` succeeded. */
  readonly id: string | null;
  readonly state: SignalState;
  /** Registers the id; rejects with a `SignalError` (`unreachable`, `taken`). */
  open(id: string): Promise<void>;
  /** Connects to another id; rejects with a `SignalError` (`not-found`, `timeout`, …). */
  connect(remoteId: string): Promise<Connection>;
  /** Called with every connection another peer opened to this one, once it is open. */
  onConnection: ((connection: Connection) => void) | null;
  /** Called when `state` changes after `open` (the server was lost or came back). */
  onStateChange: ((state: SignalState) => void) | null;
  /** Leaves the server and closes every connection made through it. */
  close(): void;
}

/** The ids the signaling server lists, or why it lists none. */
export type DirectoryList =
  { ok: true; ids: string[] } | { ok: false; reason: 'off' | 'unreachable' };

/** The signaling server's list of registered ids (PeerJS discovery). */
export interface RoomDirectory {
  list(): Promise<DirectoryList>;
}

/** A signaling server with its directory: PeerJS in the browser, memory in tests. */
export interface Network {
  /** A new, unregistered peer. */
  signaling(): Signaling;
  readonly directory: RoomDirectory;
}
