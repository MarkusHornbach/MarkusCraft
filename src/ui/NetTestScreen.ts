// The network test (Phase 6 part A): checks the home network before the game depends on
// it. Registers with the signaling server, lists the other devices testing now, and
// measures one direct connection: candidate pair, round trip and throughput.
import {
  NET_TEST_CODE_LENGTH,
  NET_TEST_RUN_TIMEOUT_MS,
  ROOM_LIST_REFRESH_MS,
} from '../game/config';
import type { NetConfig } from '../game/netConfig';
import {
  type CandidatePair,
  NetTestRun,
  browserName,
  type VerdictInput,
  codeFromBytes,
  pairText,
  resultText,
  selectedPair,
  testCodeOf,
  testPeerId,
  verdict,
} from '../net/netTest';
import { type Connection, type Network, SignalError, type Signaling } from '../net/transport';
import { button, element } from './activate';

export const NET_UNAVAILABLE_TEXT = 'Multiplayer is not available in this build.';
/** How often a new code is tried when the id is taken. */
const CODE_ATTEMPTS = 5;
/** The statistics are read this often until the candidate pair is known. */
const STATS_POLL_MS = 500;

export interface NetTestScreenOptions {
  build: string;
  config: NetConfig;
  /** Loads the network (the `peerjs` chunk) for these ICE servers. */
  load: (iceServers: { urls: string }[]) => Promise<Network>;
  randomBytes: (count: number) => Uint8Array;
  onBack: () => void;
}

/** What the test API reports while the screen is open (`getState().net.test`). */
export interface NetTestState {
  state: 'unavailable' | 'connecting' | 'unreachable' | 'ready' | 'testing' | 'done' | 'failed';
  code: string | null;
  signaling: VerdictInput['signal'] | 'off';
  discovery: VerdictInput['discovery'];
  /** Test codes of the other devices testing now. */
  others: string[];
  useStun: boolean;
  /** ICE servers the current test uses. */
  iceServers: number;
  /** The candidate pair in use, e.g. "host → host (IP 192.168.*.*)". */
  candidate: string | null;
  rttMs: number | null;
  mbPerS: number | null;
  remoteBrowser: string | null;
  verdict: string;
}

interface InfoRow {
  value: HTMLElement;
}

export class NetTestScreen {
  readonly element: HTMLElement;
  private readonly options: NetTestScreenOptions;
  /** "Chrome 140 on Android": what the other device is told about this one. */
  private readonly browser = browserName(navigator.userAgent);
  private readonly unavailable: HTMLElement;
  private readonly body: HTMLElement;
  private readonly rows: Record<
    'multiplayer' | 'signalHost' | 'ice' | 'signaling' | 'discovery' | 'code',
    InfoRow
  >;
  private readonly othersList: HTMLElement;
  private readonly results: Record<'pair' | 'rtt' | 'throughput' | 'remote', InfoRow>;
  private readonly verdictLine: HTMLElement;
  private readonly stunButton: HTMLButtonElement;
  private readonly status: HTMLElement;
  private useStun = true;
  private visible = false;
  /** Counts the starts: callbacks of an older start do nothing. */
  private generation = 0;
  private network: Network | null = null;
  private signaling: Signaling | null = null;
  private code: string | null = null;
  private signal: NetTestState['signaling'] = 'off';
  private discovery: VerdictInput['discovery'] = null;
  private others: string[] = [];
  private connectState: VerdictInput['connect'] = null;
  private connection: Connection | null = null;
  private run: NetTestRun | null = null;
  private pair: CandidatePair | null = null;
  private listTimer = 0;
  private runTimer = 0;
  private statsTimer = 0;

  constructor(parent: HTMLElement, options: NetTestScreenOptions) {
    this.options = options;
    this.element = element('div', 'net-test-screen hidden');
    const panel = element('div', 'net-test-panel');
    this.element.appendChild(panel);
    panel.appendChild(element('h1', 'net-test-title', 'Network test'));

    const info = element('dl', 'net-info');
    const row = (list: HTMLElement, label: string, name: string): InfoRow => {
      list.appendChild(element('dt', 'net-label', label));
      const value = element('dd', `net-value net-${name}`, '–');
      list.appendChild(value);
      return { value };
    };
    const buildRow = row(info, 'Build', 'build');
    buildRow.value.textContent = options.build;
    this.rows = {
      multiplayer: row(info, 'Multiplayer', 'multiplayer'),
      signalHost: row(info, 'Signaling host', 'signal-host'),
      ice: row(info, 'ICE servers', 'ice'),
      signaling: row(info, 'Signaling', 'signaling'),
      discovery: row(info, 'Discovery', 'discovery'),
      code: row(info, 'Your test code', 'code'),
    };
    panel.appendChild(info);

    this.unavailable = element('div', 'net-unavailable', NET_UNAVAILABLE_TEXT);
    this.unavailable.setAttribute('role', 'status');
    panel.appendChild(this.unavailable);

    this.body = element('div', 'net-body');
    const othersSection = element('section', 'net-section');
    othersSection.appendChild(element('h2', 'pause-heading', 'Others testing now'));
    this.othersList = element('div', 'net-others');
    othersSection.appendChild(this.othersList);
    this.body.appendChild(othersSection);

    const resultSection = element('section', 'net-section');
    resultSection.appendChild(element('h2', 'pause-heading', 'Connection'));
    const resultList = element('dl', 'net-info');
    this.results = {
      pair: row(resultList, 'Candidate pair', 'pair'),
      rtt: row(resultList, 'Round trip', 'rtt'),
      throughput: row(resultList, 'Throughput', 'throughput'),
      remote: row(resultList, 'Other device', 'remote'),
    };
    resultSection.appendChild(resultList);
    this.verdictLine = element('div', 'net-verdict');
    this.verdictLine.setAttribute('role', 'status');
    resultSection.appendChild(this.verdictLine);
    this.body.appendChild(resultSection);
    panel.appendChild(this.body);

    const buttons = element('div', 'world-buttons net-buttons');
    this.stunButton = button('menu-button net-stun-button', '');
    this.stunButton.setAttribute('role', 'switch');
    this.stunButton.addEventListener('click', () => {
      this.useStun = !this.useStun;
      this.restart();
    });
    const copy = button('menu-button net-copy-button', 'Copy result');
    copy.addEventListener('click', () => this.copy());
    const back = button('menu-button net-back-button', 'Back');
    back.dataset.padDefault = '';
    back.dataset.padBack = '';
    back.addEventListener('click', () => options.onBack());
    buttons.append(this.stunButton, copy, back);
    panel.appendChild(buttons);
    this.status = element('div', 'net-status');
    this.status.setAttribute('role', 'status');
    panel.appendChild(this.status);
    parent.appendChild(this.element);
    this.render();
  }

  /** Shows the screen and starts the test. */
  open(): void {
    this.visible = true;
    this.element.classList.remove('hidden');
    this.status.textContent = '';
    this.start();
  }

  /** Hides the screen and leaves the signaling server. */
  close(): void {
    this.visible = false;
    this.element.classList.add('hidden');
    this.stop();
  }

  get isOpen(): boolean {
    return this.visible;
  }

  get state(): NetTestState {
    const run = this.run?.view ?? null;
    let state: NetTestState['state'];
    if (!this.options.config.signal) state = 'unavailable';
    else if (this.signal === 'unreachable') state = 'unreachable';
    else if (run?.phase === 'done') state = 'done';
    else if (
      run?.phase === 'failed' ||
      this.connectState === 'timeout' ||
      this.connectState === 'not-found' ||
      this.connectState === 'closed'
    ) {
      state = 'failed';
    } else if (run || this.connectState === 'connecting') state = 'testing';
    else if (this.signal === 'open') state = 'ready';
    else state = 'connecting';
    return {
      state,
      code: this.code,
      signaling: this.signal,
      discovery: this.discovery,
      others: [...this.others],
      useStun: this.useStun,
      iceServers: this.iceServers().length,
      candidate: this.pair ? pairText(this.pair) : null,
      rttMs: run?.rttMs ?? null,
      mbPerS: run?.mbPerS ?? null,
      remoteBrowser: run?.remoteBrowser ?? null,
      verdict: this.verdictText(),
    };
  }

  private iceServers(): { urls: string }[] {
    return this.useStun ? this.options.config.iceServers : [];
  }

  private restart(): void {
    this.stop();
    this.start();
  }

  private start(): void {
    const generation = ++this.generation;
    this.render();
    if (!this.options.config.signal) return;
    this.signal = 'connecting';
    this.render();
    void this.options.load(this.iceServers()).then(
      (network) => {
        if (generation !== this.generation) return;
        this.network = network;
        void this.register(generation, CODE_ATTEMPTS);
      },
      () => {
        if (generation !== this.generation) return;
        this.signal = 'unreachable';
        this.render();
      },
    );
  }

  private async register(generation: number, attempts: number): Promise<void> {
    const network = this.network;
    if (!network) return;
    const code = codeFromBytes(
      this.options.randomBytes(NET_TEST_CODE_LENGTH),
      NET_TEST_CODE_LENGTH,
    );
    const signaling = network.signaling();
    this.signaling = signaling;
    this.code = code;
    signaling.onConnection = (connection) => {
      if (generation === this.generation) this.incoming(connection);
      else connection.close();
    };
    signaling.onStateChange = (state) => {
      if (generation !== this.generation) return;
      this.signal = state === 'open' ? 'open' : state === 'lost' ? 'lost' : this.signal;
      this.render();
    };
    this.render();
    try {
      await signaling.open(testPeerId(this.options.build, code));
    } catch (error) {
      if (generation !== this.generation) return;
      signaling.close();
      if (error instanceof SignalError && error.reason === 'taken' && attempts > 1) {
        void this.register(generation, attempts - 1);
        return;
      }
      this.signaling = null;
      this.signal = 'unreachable';
      this.render();
      return;
    }
    if (generation !== this.generation) {
      signaling.close();
      return;
    }
    this.signal = 'open';
    this.render();
    void this.refreshList(generation);
  }

  private async refreshList(generation: number): Promise<void> {
    const network = this.network;
    if (!network || generation !== this.generation) return;
    const list = await network.directory.list();
    if (generation !== this.generation) return;
    if (list.ok) {
      this.discovery = 'on';
      const codes = list.ids
        .map((id) => testCodeOf(id, this.options.build))
        .filter((code): code is string => code !== null && code !== this.code);
      this.others = [...new Set(codes)].sort();
    } else {
      this.discovery = list.reason;
      this.others = [];
    }
    this.render();
    this.listTimer = window.setTimeout(
      () => void this.refreshList(generation),
      ROOM_LIST_REFRESH_MS,
    );
  }

  private stop(): void {
    this.generation++;
    window.clearTimeout(this.listTimer);
    this.endConnection();
    this.signaling?.close();
    this.signaling = null;
    this.network = null;
    this.code = null;
    this.signal = 'off';
    this.discovery = null;
    this.others = [];
    this.connectState = null;
  }

  private endConnection(): void {
    window.clearTimeout(this.runTimer);
    window.clearTimeout(this.statsTimer);
    const connection = this.connection;
    this.connection = null;
    if (connection) {
      connection.onClose = null;
      connection.close();
    }
    this.run = null;
    this.pair = null;
  }

  /** "Connect" next to another device. */
  private async connectTo(code: string): Promise<void> {
    const signaling = this.signaling;
    if (!signaling || this.connectState === 'connecting') return;
    const generation = this.generation;
    this.endConnection();
    this.connectState = 'connecting';
    this.render();
    try {
      const connection = await signaling.connect(testPeerId(this.options.build, code));
      if (generation !== this.generation) {
        connection.close();
        return;
      }
      this.begin(connection, true);
    } catch (error) {
      if (generation !== this.generation) return;
      const reason = error instanceof SignalError ? error.reason : 'timeout';
      this.connectState = reason === 'not-found' ? 'not-found' : 'timeout';
      this.render();
    }
  }

  /** Another device connected to this one. A test in progress is not interrupted. */
  private incoming(connection: Connection): void {
    const phase = this.run?.view.phase;
    if (
      this.connectState === 'connecting' ||
      phase === 'hello' ||
      phase === 'ping' ||
      phase === 'data'
    ) {
      connection.close();
      return;
    }
    this.endConnection();
    this.begin(connection, false);
  }

  private begin(connection: Connection, initiator: boolean): void {
    this.connection = connection;
    this.connectState = 'open';
    const run = new NetTestRun(connection, {
      initiator,
      browser: this.browser,
      onChange: () => {
        if (run.view.phase === 'done') void this.readStats(connection);
        this.render();
      },
    });
    this.run = run;
    connection.onMessage = (text) => run.receive(text, performance.now());
    connection.onClose = () => {
      if (this.connection !== connection) return;
      const phase = run.view.phase;
      if (phase !== 'done' && phase !== 'failed') this.connectState = 'closed';
      this.render();
    };
    this.runTimer = window.setTimeout(() => run.fail('timeout'), NET_TEST_RUN_TIMEOUT_MS);
    run.start();
    this.pollStats(connection);
    this.render();
  }

  private pollStats(connection: Connection): void {
    void this.readStats(connection).then(() => {
      if (this.connection !== connection || this.pair) return;
      this.statsTimer = window.setTimeout(() => this.pollStats(connection), STATS_POLL_MS);
    });
  }

  private async readStats(connection: Connection): Promise<void> {
    const entries = await connection.stats();
    if (this.connection !== connection || !entries) return;
    const pair = selectedPair(entries);
    if (pair) {
      this.pair = pair;
      this.render();
    }
  }

  private verdictText(): string {
    if (!this.options.config.signal) return '';
    const signal = this.signal === 'off' ? 'connecting' : this.signal;
    return verdict({
      signal,
      discovery: this.discovery,
      connect: this.connectState,
      run: this.run?.view ?? null,
    });
  }

  private render(): void {
    const config = this.options.config;
    const available = config.signal !== null;
    this.unavailable.hidden = available;
    this.body.hidden = !available;
    this.stunButton.hidden = !available;
    const set = (row: InfoRow, text: string): void => {
      if (row.value.textContent !== text) row.value.textContent = text;
    };
    set(this.rows.multiplayer, available ? 'Available' : 'Not available in this build');
    set(this.rows.signalHost, config.signal?.host ?? '–');
    const ice = this.iceServers();
    set(
      this.rows.ice,
      ice.length > 0
        ? ice.map((s) => s.urls).join(', ')
        : this.useStun
          ? 'None'
          : 'None (STUN off)',
    );
    const signalText: Record<NetTestState['signaling'], string> = {
      off: '–',
      connecting: 'Connecting…',
      open: 'Connected',
      unreachable: 'Unreachable',
      lost: 'Lost, reconnecting…',
    };
    set(this.rows.signaling, available ? signalText[this.signal] : '–');
    const discoveryText = { on: 'On', off: 'Off', unreachable: 'Unreachable' };
    set(this.rows.discovery, this.discovery ? discoveryText[this.discovery] : '–');
    set(this.rows.code, this.code ?? '–');
    this.stunButton.textContent = `Use STUN: ${this.useStun ? 'on' : 'off'}`;
    this.stunButton.setAttribute('aria-checked', String(this.useStun));
    this.renderOthers();
    const run = this.run?.view ?? null;
    set(this.results.pair, this.pair ? pairText(this.pair) : '–');
    set(this.results.rtt, run?.rttMs != null ? `${run.rttMs.toFixed(1)} ms` : '–');
    set(this.results.throughput, run?.mbPerS != null ? `${run.mbPerS.toFixed(2)} MB/s` : '–');
    set(this.results.remote, run?.remoteBrowser ?? '–');
    const text = this.verdictText();
    if (this.verdictLine.textContent !== text) this.verdictLine.textContent = text;
    this.verdictLine.dataset.ok = String(run?.phase === 'done');
  }

  private renderOthers(): void {
    const key = `${this.discovery}|${this.others.join(',')}|${this.connectState === 'connecting'}`;
    if (this.othersList.dataset.key === key) return;
    this.othersList.dataset.key = key;
    const rows: HTMLElement[] = [];
    if (this.discovery === 'off') {
      rows.push(element('div', 'net-empty', 'Not listed: discovery is off on this server.'));
    } else if (this.others.length === 0) {
      rows.push(element('div', 'net-empty', 'Nobody else right now.'));
    }
    for (const code of this.others) {
      const row = element('div', 'net-other');
      row.dataset.code = code;
      row.appendChild(element('span', 'net-other-code', code));
      const connect = button('menu-button net-connect-button', 'Connect');
      connect.setAttribute('aria-label', `Connect to ${code}`);
      connect.disabled = this.connectState === 'connecting';
      connect.addEventListener('click', () => void this.connectTo(code));
      row.appendChild(connect);
      rows.push(row);
    }
    this.othersList.replaceChildren(...rows);
  }

  private copy(): void {
    const run = this.run?.view ?? null;
    const text = resultText({
      build: this.options.build,
      browser: this.browser,
      remoteBrowser: run?.remoteBrowser ?? null,
      stun: this.useStun,
      iceServers: this.iceServers().length,
      pair: this.pair,
      rttMs: run?.rttMs ?? null,
      mbPerS: run?.mbPerS ?? null,
      verdict: this.verdictText(),
    });
    const refused = (): void => {
      this.status.textContent = 'Copying is not allowed here.';
    };
    try {
      navigator.clipboard.writeText(text).then(() => {
        this.status.textContent = 'Copied';
      }, refused);
    } catch {
      refused();
    }
  }
}
