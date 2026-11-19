// The network test (Phase 6 part A): its peer ids, its messages, one run over a connection
// (20 pings, then 1 MB), the candidate pair from the browser's statistics, and the texts.
import {
  NET_TEST_BYTES,
  NET_TEST_CODE_LENGTH,
  NET_TEST_MESSAGE_BYTES,
  NET_TEST_PINGS,
  ROOM_CODE_ALPHABET,
} from '../game/config';
import type { Connection, StatsEntry } from './transport';

// --- ids -----------------------------------------------------------------------------

/** Every id of one build starts with this, so different builds never see each other. */
export function peerPrefix(build: string): string {
  return `mc-${build}-`;
}

/** A code of `length` characters of the room alphabet from random bytes (one per character). */
export function codeFromBytes(bytes: ArrayLike<number>, length: number): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ROOM_CODE_ALPHABET[(bytes[i] ?? 0) % ROOM_CODE_ALPHABET.length];
  }
  return code;
}

/** The network test's id of a device: `mc-<build>-t-<code>`. */
export function testPeerId(build: string, code: string): string {
  return `${peerPrefix(build)}t-${code}`;
}

/** The test code in a network test id of this build, or null for any other id. */
export function testCodeOf(id: string, build: string): string | null {
  const prefix = `${peerPrefix(build)}t-`;
  if (!id.startsWith(prefix)) return null;
  const code = id.slice(prefix.length);
  if (code.length !== NET_TEST_CODE_LENGTH) return null;
  for (const c of code) if (!ROOM_CODE_ALPHABET.includes(c)) return null;
  return code;
}

// --- messages ------------------------------------------------------------------------

export type TestMessage =
  | { t: 'nt-hello'; browser: string }
  | { t: 'nt-ping'; n: number; ts: number }
  | { t: 'nt-pong'; n: number; ts: number }
  | { t: 'nt-data'; n: number; d: string }
  | { t: 'nt-ack'; bytes: number }
  | { t: 'nt-result'; rttMs: number; mbPerS: number }
  | { t: 'nt-fail'; reason: string };

const BROWSER_MAX = 80;

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Parses and validates one message of the network test; null for anything else. */
export function decodeTestMessage(text: string): TestMessage | null {
  if (text.length > NET_TEST_MESSAGE_BYTES + 64) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const m = value as Record<string, unknown>;
  switch (m.t) {
    case 'nt-hello':
      return typeof m.browser === 'string' && m.browser.length <= BROWSER_MAX
        ? { t: m.t, browser: m.browser }
        : null;
    case 'nt-ping':
    case 'nt-pong':
      return isInt(m.n) && isFiniteNumber(m.ts) ? { t: m.t, n: m.n, ts: m.ts } : null;
    case 'nt-data':
      return isInt(m.n) && typeof m.d === 'string' ? { t: m.t, n: m.n, d: m.d } : null;
    case 'nt-ack':
      return isInt(m.bytes) ? { t: m.t, bytes: m.bytes } : null;
    case 'nt-result':
      return isFiniteNumber(m.rttMs) && isFiniteNumber(m.mbPerS) && m.rttMs >= 0 && m.mbPerS >= 0
        ? { t: m.t, rttMs: m.rttMs, mbPerS: m.mbPerS }
        : null;
    case 'nt-fail':
      return typeof m.reason === 'string' && m.reason.length <= BROWSER_MAX
        ? { t: m.t, reason: m.reason }
        : null;
    default:
      return null;
  }
}

/** The middle value; the mean of the two middle values for an even count. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Megabytes (of 1 048 576 bytes) per second. */
export function throughput(bytes: number, ms: number): number {
  return bytes / NET_TEST_BYTES / (Math.max(ms, 0.001) / 1000);
}

// --- one run -------------------------------------------------------------------------

export type RunPhase = 'hello' | 'ping' | 'data' | 'done' | 'failed';

export interface RunView {
  phase: RunPhase;
  /** This end started the test ("Connect"). */
  initiator: boolean;
  remoteBrowser: string | null;
  /** Median round-trip time of the pings. */
  rttMs: number | null;
  mbPerS: number | null;
  /** Why the run failed, for the verdict line. */
  error: string | null;
}

/**
 * The network test over one open connection. The end that pressed "Connect" is the
 * initiator: after both said hello it pings 20 times, one after the other, then sends
 * 1 MB in 16 kB messages, and the other end acknowledges the bytes. The initiator sends
 * the numbers back, so both devices show the same ones. Time comes in with every call.
 */
export class NetTestRun {
  private readonly connection: Connection;
  private readonly browser: string;
  private readonly onChange: () => void;
  private state: RunView;
  private readonly rtts: number[] = [];
  private helloSent = false;
  private dataStart = 0;
  private received = 0;
  private receivedCount = 0;

  constructor(
    connection: Connection,
    options: { initiator: boolean; browser: string; onChange: () => void },
  ) {
    this.connection = connection;
    this.browser = options.browser.slice(0, BROWSER_MAX);
    this.onChange = options.onChange;
    this.state = {
      phase: 'hello',
      initiator: options.initiator,
      remoteBrowser: null,
      rttMs: null,
      mbPerS: null,
      error: null,
    };
  }

  get view(): RunView {
    return { ...this.state };
  }

  /** Says hello; call once the connection is open. */
  start(): void {
    this.sendHello();
  }

  receive(text: string, nowMs: number): void {
    const message = decodeTestMessage(text);
    if (!message || this.state.phase === 'done' || this.state.phase === 'failed') return;
    const initiator = this.state.initiator;
    switch (message.t) {
      case 'nt-hello':
        this.state.remoteBrowser = message.browser;
        this.sendHello();
        if (initiator && this.state.phase === 'hello') {
          this.state.phase = 'ping';
          this.ping(nowMs);
        }
        break;
      case 'nt-ping':
        if (!initiator) this.send({ t: 'nt-pong', n: message.n, ts: message.ts });
        break;
      case 'nt-pong':
        if (!initiator || this.state.phase !== 'ping' || message.n !== this.rtts.length) break;
        this.rtts.push(Math.max(0, nowMs - message.ts));
        if (this.rtts.length < NET_TEST_PINGS) {
          this.ping(nowMs);
        } else {
          this.state.rttMs = median(this.rtts);
          this.state.phase = 'data';
          this.sendData(nowMs);
        }
        break;
      case 'nt-data':
        if (initiator) break;
        this.received += text.length;
        this.receivedCount++;
        if (this.receivedCount === messageCount()) {
          this.send({ t: 'nt-ack', bytes: this.received });
        }
        break;
      case 'nt-ack':
        if (!initiator || this.state.phase !== 'data') break;
        this.state.mbPerS = throughput(message.bytes, nowMs - this.dataStart);
        this.state.phase = 'done';
        this.send({ t: 'nt-result', rttMs: this.state.rttMs ?? 0, mbPerS: this.state.mbPerS });
        break;
      case 'nt-result':
        if (initiator) break;
        this.state.rttMs = message.rttMs;
        this.state.mbPerS = message.mbPerS;
        this.state.phase = 'done';
        break;
      case 'nt-fail':
        this.state.phase = 'failed';
        this.state.error = message.reason;
        break;
    }
    this.onChange();
  }

  /** The run ends without numbers (timeout, closed connection); tells the other end. */
  fail(reason: string): void {
    if (this.state.phase === 'done' || this.state.phase === 'failed') return;
    this.state.phase = 'failed';
    this.state.error = reason;
    this.send({ t: 'nt-fail', reason });
    this.onChange();
  }

  private sendHello(): void {
    if (this.helloSent) return;
    this.helloSent = true;
    this.send({ t: 'nt-hello', browser: this.browser });
  }

  private ping(nowMs: number): void {
    this.send({ t: 'nt-ping', n: this.rtts.length, ts: nowMs });
  }

  private sendData(nowMs: number): void {
    this.dataStart = nowMs;
    const count = messageCount();
    for (let n = 0; n < count; n++) this.connection.send(dataMessage(n));
  }

  private send(message: TestMessage): void {
    this.connection.send(JSON.stringify(message));
  }
}

function messageCount(): number {
  return Math.ceil(NET_TEST_BYTES / NET_TEST_MESSAGE_BYTES);
}

/** A data message of exactly `NET_TEST_MESSAGE_BYTES` characters. */
export function dataMessage(n: number): string {
  const head = `{"t":"nt-data","n":${n},"d":"`;
  return `${head}${'x'.repeat(NET_TEST_MESSAGE_BYTES - head.length - 2)}"}`;
}

// --- statistics ----------------------------------------------------------------------

export interface CandidatePair {
  /** `host`, `srflx`, `prflx` or `relay`. */
  localType: string;
  remoteType: string;
  /** The remote address is an mDNS name (`….local`), not an IP. */
  remoteMdns: boolean;
  /** The remote address cut to its first two parts. */
  remoteAddress: string;
}

function text(entry: StatsEntry | undefined, key: string): string {
  const value = entry?.[key];
  return typeof value === 'string' ? value : '';
}

/** The candidate pair in use, from the entries of `RTCPeerConnection.getStats()`. */
export function selectedPair(entries: readonly StatsEntry[]): CandidatePair | null {
  const byId = new Map<string, StatsEntry>();
  for (const entry of entries) byId.set(text(entry, 'id'), entry);
  let pair: StatsEntry | undefined;
  for (const entry of entries) {
    if (text(entry, 'type') !== 'transport') continue;
    const id = text(entry, 'selectedCandidatePairId');
    if (id) pair = byId.get(id);
  }
  pair ??= entries.find((e) => text(e, 'type') === 'candidate-pair' && e.selected === true);
  pair ??= entries.find(
    (e) => text(e, 'type') === 'candidate-pair' && e.nominated === true && e.state === 'succeeded',
  );
  if (!pair) return null;
  const local = byId.get(text(pair, 'localCandidateId'));
  const remote = byId.get(text(pair, 'remoteCandidateId'));
  if (!local || !remote) return null;
  const address = text(remote, 'address') || text(remote, 'ip');
  return {
    localType: text(local, 'candidateType') || 'unknown',
    remoteType: text(remote, 'candidateType') || 'unknown',
    remoteMdns: address.endsWith('.local'),
    remoteAddress: maskAddress(address),
  };
}

/** An address cut to its first two parts: `192.168.*.*`, `fd00:12:…`; mDNS names hidden. */
export function maskAddress(address: string): string {
  if (address === '') return 'unknown';
  if (address.endsWith('.local')) return 'mDNS name';
  if (address.includes(':')) {
    const parts = address.split(':').filter((p) => p !== '');
    return `${parts.slice(0, 2).join(':')}:…`;
  }
  const parts = address.split('.');
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.*.*` : 'unknown';
}

/** "host → host (IP 192.168.*.*)" or "host → host (mDNS name)". */
export function pairText(pair: CandidatePair): string {
  const remote = pair.remoteMdns ? 'mDNS name' : `IP ${pair.remoteAddress}`;
  return `${pair.localType} → ${pair.remoteType} (${remote})`;
}

// --- texts ---------------------------------------------------------------------------

/** A short name of the browser and system from a user agent: "Chrome 140 on Android". */
export function browserName(userAgent: string): string {
  const version = (pattern: RegExp): string => pattern.exec(userAgent)?.[1] ?? '';
  let browser = 'Browser';
  if (/Edg\//.test(userAgent)) browser = `Edge ${version(/Edg\/(\d+)/)}`;
  else if (/Firefox\//.test(userAgent)) browser = `Firefox ${version(/Firefox\/(\d+)/)}`;
  else if (/HeadlessChrome\//.test(userAgent)) {
    browser = `Chrome ${version(/HeadlessChrome\/(\d+)/)} (headless)`;
  } else if (/Chrome\//.test(userAgent)) browser = `Chrome ${version(/Chrome\/(\d+)/)}`;
  else if (/Safari\//.test(userAgent)) browser = `Safari ${version(/Version\/(\d+)/)}`.trim();
  let system = '';
  if (/Android/.test(userAgent)) system = 'Android';
  else if (/iPhone|iPad/.test(userAgent)) system = 'iOS';
  else if (/Windows/.test(userAgent)) system = 'Windows';
  else if (/CrOS/.test(userAgent)) system = 'ChromeOS';
  else if (/Mac OS X/.test(userAgent)) system = 'macOS';
  else if (/Linux/.test(userAgent)) system = 'Linux';
  return (system ? `${browser} on ${system}` : browser).slice(0, BROWSER_MAX);
}

/** What the signaling connection, the directory and the connection attempt came to. */
export interface VerdictInput {
  signal: 'connecting' | 'open' | 'unreachable' | 'lost';
  discovery: 'on' | 'off' | 'unreachable' | null;
  /** The last attempt to connect, or null if there was none. */
  connect: 'connecting' | 'open' | 'not-found' | 'timeout' | 'closed' | null;
  run: RunView | null;
}

export const VERDICT_OK = 'Direct connection OK';
export const VERDICT_SIGNAL = 'Signaling server unreachable. Is this device on the home network?';
export const VERDICT_SIGNAL_LOST = 'Lost the connection to the signaling server.';
export const VERDICT_ICE =
  'No ICE candidate pair within 15 s: the devices cannot reach each other.';
export const VERDICT_GONE = 'The other device is no longer testing.';
export const VERDICT_CLOSED = 'The connection closed before the test was done.';
export const VERDICT_DISCOVERY = 'Discovery off: other devices are not listed on this server.';

/** The one-line verdict of the network test, or '' while there is nothing to say yet. */
export function verdict(input: VerdictInput): string {
  if (input.signal === 'unreachable') return VERDICT_SIGNAL;
  if (input.run?.phase === 'done') return VERDICT_OK;
  if (input.run?.phase === 'failed') return `Test failed: ${input.run.error ?? 'unknown'}.`;
  if (input.connect === 'timeout') return VERDICT_ICE;
  if (input.connect === 'not-found') return VERDICT_GONE;
  if (input.connect === 'closed') return VERDICT_CLOSED;
  if (input.signal === 'lost') return VERDICT_SIGNAL_LOST;
  if (input.discovery === 'off') return VERDICT_DISCOVERY;
  return '';
}

export interface ResultFields {
  build: string;
  browser: string;
  remoteBrowser: string | null;
  stun: boolean;
  iceServers: number;
  pair: CandidatePair | null;
  rttMs: number | null;
  mbPerS: number | null;
  verdict: string;
}

/** The text "Copy result" puts on the clipboard, for the device tests. */
export function resultText(f: ResultFields): string {
  const lines = [
    'MarkusCraft network test',
    `Build: ${f.build}`,
    `This device: ${f.browser}`,
    `Other device: ${f.remoteBrowser ?? '–'}`,
    `STUN: ${f.stun ? `on (${f.iceServers} server${f.iceServers === 1 ? '' : 's'})` : 'off'}`,
    `Candidate pair: ${f.pair ? pairText(f.pair) : '–'}`,
    `Round trip: ${f.rttMs !== null ? `${f.rttMs.toFixed(1)} ms (median of ${NET_TEST_PINGS})` : '–'}`,
    `Throughput: ${f.mbPerS !== null ? `${f.mbPerS.toFixed(2)} MB/s (1 MB in 16 kB messages)` : '–'}`,
    `Verdict: ${f.verdict || '–'}`,
  ];
  return lines.join('\n');
}
