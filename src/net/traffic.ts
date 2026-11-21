// Messages and bytes a peer sends and receives, counted on its connections, as rates over
// the last seconds (the debug overlay, Phase 6 part E). Pure: time comes in as `nowMs`.
import type { Connection, Network, Signaling, StatsEntry } from './transport';

/** Rates are averaged over this long. */
export const TRAFFIC_WINDOW_MS = 2000;

export interface TrafficRates {
  /** Messages per second. */
  inMsgs: number;
  outMsgs: number;
  /** Bytes per second (UTF-16 code units of the text, which is ASCII for this protocol). */
  inBytes: number;
  outBytes: number;
}

/** Totals since the meter was made, and the rates of the last window. */
export class TrafficMeter {
  /** Totals since the meter was made. */
  inMsgs = 0;
  outMsgs = 0;
  inBytes = 0;
  outBytes = 0;
  private readonly clock: () => number;
  /** Events of the window: time, +bytes for incoming and −bytes for outgoing messages. */
  private times: number[] = [];
  private sizes: number[] = [];
  /** The connections counted now, for their statistics (candidate pair). */
  private readonly open = new Set<Connection>();

  constructor(clock: () => number) {
    this.clock = clock;
  }

  note(direction: 'in' | 'out', bytes: number): void {
    const now = this.clock();
    if (direction === 'in') {
      this.inMsgs++;
      this.inBytes += bytes;
    } else {
      this.outMsgs++;
      this.outBytes += bytes;
    }
    this.prune(now);
    this.times.push(now);
    this.sizes.push(direction === 'in' ? bytes : -bytes);
  }

  /** Per second over the last `TRAFFIC_WINDOW_MS`. */
  rates(nowMs: number = this.clock()): TrafficRates {
    this.prune(nowMs);
    const rates = { inMsgs: 0, outMsgs: 0, inBytes: 0, outBytes: 0 };
    for (const size of this.sizes) {
      if (size >= 0) {
        rates.inMsgs++;
        rates.inBytes += size;
      } else {
        rates.outMsgs++;
        rates.outBytes -= size;
      }
    }
    const seconds = TRAFFIC_WINDOW_MS / 1000;
    return {
      inMsgs: rates.inMsgs / seconds,
      outMsgs: rates.outMsgs / seconds,
      inBytes: rates.inBytes / seconds,
      outBytes: rates.outBytes / seconds,
    };
  }

  /** The connections that are open now. */
  connections(): Connection[] {
    return [...this.open].filter((c) => c.open);
  }

  /** A connection whose messages count from now on. */
  wrap(inner: Connection): Connection {
    const counted = new CountedConnection(inner, this);
    this.open.add(counted);
    return counted;
  }

  forget(connection: Connection): void {
    this.open.delete(connection);
  }

  private prune(now: number): void {
    let drop = 0;
    while (drop < this.times.length && this.times[drop] <= now - TRAFFIC_WINDOW_MS) drop++;
    if (drop > 0) {
      this.times = this.times.slice(drop);
      this.sizes = this.sizes.slice(drop);
    }
  }
}

class CountedConnection implements Connection {
  private readonly inner: Connection;
  private readonly meter: TrafficMeter;
  onMessage: ((text: string) => void) | null = null;
  onClose: (() => void) | null = null;

  constructor(inner: Connection, meter: TrafficMeter) {
    this.inner = inner;
    this.meter = meter;
    inner.onMessage = (text) => {
      meter.note('in', text.length);
      this.onMessage?.(text);
    };
    inner.onClose = () => {
      meter.forget(this);
      this.onClose?.();
    };
  }

  get remoteId(): string {
    return this.inner.remoteId;
  }

  get open(): boolean {
    return this.inner.open;
  }

  send(text: string): void {
    if (!this.inner.open) return;
    this.meter.note('out', text.length);
    this.inner.send(text);
  }

  close(): void {
    this.meter.forget(this);
    this.inner.close();
  }

  bufferedAmount(): number {
    return this.inner.bufferedAmount();
  }

  stats(): Promise<StatsEntry[] | null> {
    return this.inner.stats();
  }
}

/** A signaling whose connections, made or accepted, are counted by `meter`. */
function countedSignaling(inner: Signaling, meter: TrafficMeter): Signaling {
  const outer: Signaling = {
    get id() {
      return inner.id;
    },
    get state() {
      return inner.state;
    },
    open: (id) => inner.open(id),
    connect: async (remoteId) => meter.wrap(await inner.connect(remoteId)),
    onConnection: null,
    onStateChange: null,
    close: () => inner.close(),
  };
  inner.onConnection = (connection) => outer.onConnection?.(meter.wrap(connection));
  inner.onStateChange = (state) => outer.onStateChange?.(state);
  return outer;
}

/** The network with every connection of its signalings counted by `meter`. */
export function countedNetwork(network: Network, meter: TrafficMeter): Network {
  return {
    signaling: () => countedSignaling(network.signaling(), meter),
    directory: network.directory,
  };
}
