import { describe, expect, it } from 'vitest';
import { NET_TEST_BYTES, NET_TEST_MESSAGE_BYTES, ROOM_CODE_ALPHABET } from '../game/config';
import { MemoryNetwork } from './memoryTransport';
import {
  NetTestRun,
  VERDICT_DISCOVERY,
  VERDICT_ICE,
  VERDICT_OK,
  VERDICT_SIGNAL,
  browserName,
  codeFromBytes,
  dataMessage,
  decodeTestMessage,
  maskAddress,
  median,
  pairText,
  resultText,
  selectedPair,
  testCodeOf,
  testPeerId,
  throughput,
  verdict,
} from './netTest';
import type { Connection } from './transport';

async function connected(net: MemoryNetwork): Promise<[Connection, Connection]> {
  const a = net.signaling();
  const b = net.signaling();
  const opened = Promise.all([a.open('a'), b.open('b')]);
  net.advance(100);
  await opened;
  let incoming: Connection | null = null;
  b.onConnection = (c) => {
    incoming = c;
  };
  const outgoing = a.connect('b');
  net.advance(100);
  const conn = await outgoing;
  if (!incoming) throw new Error('no incoming connection');
  return [conn, incoming];
}

function startRuns(net: MemoryNetwork, a: Connection, b: Connection): [NetTestRun, NetTestRun] {
  const runA = new NetTestRun(a, { initiator: true, browser: 'A', onChange: () => {} });
  const runB = new NetTestRun(b, { initiator: false, browser: 'B', onChange: () => {} });
  a.onMessage = (text) => runA.receive(text, net.nowMs);
  b.onMessage = (text) => runB.receive(text, net.nowMs);
  runA.start();
  runB.start();
  return [runA, runB];
}

describe('network test ids', () => {
  it('makes codes from the alphabet and recognises only ids of its own build', () => {
    const code = codeFromBytes([0, 31, 32, 255], 4);
    expect(code).toHaveLength(4);
    for (const c of code) expect(ROOM_CODE_ALPHABET).toContain(c);
    expect(code[0]).toBe(code[2]);
    expect(codeFromBytes([], 2)).toBe('AA');
    const id = testPeerId('abc1234', 'K7QX');
    expect(id).toBe('mc-abc1234-t-K7QX');
    expect(testCodeOf(id, 'abc1234')).toBe('K7QX');
    expect(testCodeOf(id, 'dev')).toBeNull();
    expect(testCodeOf('mc-abc1234-r-K7QXAB', 'abc1234')).toBeNull();
    expect(testCodeOf('mc-abc1234-t-K7Q', 'abc1234')).toBeNull();
    expect(testCodeOf('mc-abc1234-t-K7Q0', 'abc1234')).toBeNull();
  });
});

describe('network test messages', () => {
  it('decodes valid messages and refuses everything else', () => {
    const valid = [
      { t: 'nt-hello', browser: 'Chrome 140 on Android' },
      { t: 'nt-ping', n: 3, ts: 12.5 },
      { t: 'nt-pong', n: 3, ts: 12.5 },
      { t: 'nt-data', n: 0, d: 'xx' },
      { t: 'nt-ack', bytes: 100 },
      { t: 'nt-result', rttMs: 2.5, mbPerS: 7 },
      { t: 'nt-fail', reason: 'timeout' },
    ];
    for (const message of valid) {
      expect(decodeTestMessage(JSON.stringify(message))).toEqual(message);
    }
    const invalid = [
      'not json',
      'null',
      '42',
      '{"t":"other"}',
      '{"t":"nt-hello","browser":5}',
      `{"t":"nt-hello","browser":"${'x'.repeat(81)}"}`,
      '{"t":"nt-ping","n":-1,"ts":1}',
      '{"t":"nt-ping","n":1.5,"ts":1}',
      '{"t":"nt-pong","n":1,"ts":"1"}',
      '{"t":"nt-data","n":1}',
      '{"t":"nt-ack","bytes":"9"}',
      '{"t":"nt-result","rttMs":-1,"mbPerS":1}',
      '{"t":"nt-result","rttMs":1,"mbPerS":null}',
      '{"t":"nt-fail"}',
      'x'.repeat(NET_TEST_MESSAGE_BYTES + 100),
    ];
    for (const text of invalid) expect(decodeTestMessage(text)).toBeNull();
    expect(dataMessage(63)).toHaveLength(NET_TEST_MESSAGE_BYTES);
    expect(decodeTestMessage(dataMessage(63))?.t).toBe('nt-data');
  });

  it('computes medians and throughput', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNaN();
    expect(throughput(NET_TEST_BYTES, 500)).toBeCloseTo(2);
    expect(Number.isFinite(throughput(NET_TEST_BYTES, 0))).toBe(true);
  });
});

describe('a network test run', () => {
  it('measures the round trip and the throughput and shows them on both ends', async () => {
    const net = new MemoryNetwork({ seed: 5, minDelayMs: 4, maxDelayMs: 6 });
    const [a, b] = await connected(net);
    const [runA, runB] = startRuns(net, a, b);
    net.advance(5000);
    const viewA = runA.view;
    const viewB = runB.view;
    expect(viewA.phase).toBe('done');
    expect(viewB.phase).toBe('done');
    expect(viewA.remoteBrowser).toBe('B');
    expect(viewB.remoteBrowser).toBe('A');
    // One round trip is two deliveries of 4–6 ms.
    expect(viewA.rttMs).toBeGreaterThanOrEqual(8);
    expect(viewA.rttMs).toBeLessThanOrEqual(12);
    expect(viewA.mbPerS).toBeGreaterThan(0);
    expect(viewB.rttMs).toBe(viewA.rttMs);
    expect(viewB.mbPerS).toBe(viewA.mbPerS);
    // Messages after the end change nothing.
    runA.receive(JSON.stringify({ t: 'nt-fail', reason: 'late' }), net.nowMs);
    expect(runA.view.phase).toBe('done');
  });

  it('ignores messages that do not fit its role or step', async () => {
    const net = new MemoryNetwork({ minDelayMs: 1 });
    const [a, b] = await connected(net);
    const sentByB: string[] = [];
    const run = new NetTestRun(b, { initiator: false, browser: 'B', onChange: () => {} });
    a.onMessage = (text) => sentByB.push(text);
    run.receive(JSON.stringify({ t: 'nt-pong', n: 0, ts: 0 }), 0);
    run.receive(JSON.stringify({ t: 'nt-ack', bytes: 10 }), 0);
    run.receive('garbage', 0);
    expect(run.view.phase).toBe('hello');
    const initiator = new NetTestRun(a, { initiator: true, browser: 'A', onChange: () => {} });
    initiator.receive(JSON.stringify({ t: 'nt-ping', n: 0, ts: 0 }), 0);
    initiator.receive(dataMessage(0), 0);
    initiator.receive(JSON.stringify({ t: 'nt-result', rttMs: 1, mbPerS: 1 }), 0);
    initiator.receive(JSON.stringify({ t: 'nt-pong', n: 5, ts: 0 }), 0);
    expect(initiator.view.phase).toBe('hello');
    net.advance(10);
    expect(sentByB).toEqual([]);
  });

  it('fails on both ends and stays failed', async () => {
    const net = new MemoryNetwork({ minDelayMs: 1 });
    const [a, b] = await connected(net);
    const [runA, runB] = startRuns(net, a, b);
    runA.fail('timeout');
    runA.fail('again');
    net.advance(1);
    expect(runA.view).toMatchObject({ phase: 'failed', error: 'timeout' });
    expect(runB.view.phase).toBe('failed');
    expect(runB.view.error).toBe('timeout');
  });
});

describe('candidate pair', () => {
  const entries = [
    { id: 'T1', type: 'transport', selectedCandidatePairId: 'CP2' },
    { id: 'CP1', type: 'candidate-pair', localCandidateId: 'L1', remoteCandidateId: 'R1' },
    { id: 'CP2', type: 'candidate-pair', localCandidateId: 'L2', remoteCandidateId: 'R2' },
    { id: 'L1', type: 'local-candidate', candidateType: 'host', address: '10.0.0.2' },
    { id: 'L2', type: 'local-candidate', candidateType: 'srflx', address: '192.168.1.20' },
    { id: 'R1', type: 'remote-candidate', candidateType: 'host', address: 'abcd.local' },
    { id: 'R2', type: 'remote-candidate', candidateType: 'host', address: '192.168.1.33' },
  ];

  it('is the transport’s selected pair, with the address masked', () => {
    const pair = selectedPair(entries);
    expect(pair).toEqual({
      localType: 'srflx',
      remoteType: 'host',
      remoteMdns: false,
      remoteAddress: '192.168.*.*',
    });
    expect(pair && pairText(pair)).toBe('srflx → host (IP 192.168.*.*)');
  });

  it('falls back to a selected or nominated pair, and finds mDNS names', () => {
    const noTransport = entries
      .slice(1)
      .map((e) => (e.id === 'CP1' ? { ...e, selected: true } : e));
    const pair = selectedPair(noTransport);
    expect(pair).toMatchObject({ localType: 'host', remoteMdns: true, remoteAddress: 'mDNS name' });
    expect(pair && pairText(pair)).toBe('host → host (mDNS name)');
    const nominated = entries
      .slice(1)
      .map((e) => (e.id === 'CP2' ? { ...e, nominated: true, state: 'succeeded' } : e));
    expect(selectedPair(nominated)?.remoteAddress).toBe('192.168.*.*');
    expect(selectedPair(entries.slice(1))).toBeNull();
    expect(selectedPair([{ id: 'CP', type: 'candidate-pair', selected: true }])).toBeNull();
    const bare = [
      {
        id: 'CP',
        type: 'candidate-pair',
        selected: true,
        localCandidateId: 'L',
        remoteCandidateId: 'R',
      },
      { id: 'L', type: 'local-candidate' },
      { id: 'R', type: 'remote-candidate', ip: 'fd00:1:2::5' },
    ];
    expect(selectedPair(bare)).toEqual({
      localType: 'unknown',
      remoteType: 'unknown',
      remoteMdns: false,
      remoteAddress: 'fd00:1:…',
    });
  });

  it('masks addresses', () => {
    expect(maskAddress('192.168.178.20')).toBe('192.168.*.*');
    expect(maskAddress('')).toBe('unknown');
    expect(maskAddress('nonsense')).toBe('unknown');
    expect(maskAddress('x.local')).toBe('mDNS name');
  });
});

describe('texts', () => {
  it('names browsers and systems', () => {
    const android =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
    expect(browserName(android)).toBe('Chrome 140 on Android');
    expect(
      browserName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/139.0 Safari/537.36 Edg/139.0'),
    ).toBe('Edge 139 on Windows');
    expect(
      browserName('Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0'),
    ).toBe('Firefox 130 on Linux');
    expect(
      browserName('Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/141.0.0.0 Safari/537.36'),
    ).toBe('Chrome 141 (headless) on Linux');
    expect(
      browserName('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Version/17.0 Mobile Safari/604.1'),
    ).toBe('Safari 17 on iOS');
    expect(
      browserName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.1 Safari/605'),
    ).toBe('Safari 17 on macOS');
    expect(browserName('Mozilla/5.0 (X11; CrOS x86_64) Chrome/120.0 Safari/537.36')).toBe(
      'Chrome 120 on ChromeOS',
    );
    expect(browserName('curl/8')).toBe('Browser');
  });

  it('gives one verdict, the most important first', () => {
    const done = {
      phase: 'done' as const,
      initiator: true,
      remoteBrowser: 'B',
      rttMs: 1,
      mbPerS: 1,
      error: null,
    };
    expect(verdict({ signal: 'unreachable', discovery: null, connect: null, run: null })).toBe(
      VERDICT_SIGNAL,
    );
    expect(verdict({ signal: 'open', discovery: 'off', connect: 'open', run: done })).toBe(
      VERDICT_OK,
    );
    expect(
      verdict({
        signal: 'open',
        discovery: 'on',
        connect: 'open',
        run: { ...done, phase: 'failed', error: 'timeout' },
      }),
    ).toBe('Test failed: timeout.');
    expect(verdict({ signal: 'open', discovery: 'on', connect: 'timeout', run: null })).toBe(
      VERDICT_ICE,
    );
    expect(verdict({ signal: 'open', discovery: 'on', connect: 'not-found', run: null })).toContain(
      'no longer',
    );
    expect(verdict({ signal: 'open', discovery: 'on', connect: 'closed', run: null })).toContain(
      'closed',
    );
    expect(verdict({ signal: 'lost', discovery: 'on', connect: null, run: null })).toContain(
      'Lost',
    );
    expect(verdict({ signal: 'open', discovery: 'off', connect: null, run: null })).toBe(
      VERDICT_DISCOVERY,
    );
    expect(verdict({ signal: 'connecting', discovery: null, connect: null, run: null })).toBe('');
  });

  it('writes the result text with all numbers', () => {
    const text = resultText({
      build: 'abc1234',
      browser: 'Chrome 140 on Windows',
      remoteBrowser: 'Chrome 140 on Android',
      stun: true,
      iceServers: 1,
      pair: {
        localType: 'host',
        remoteType: 'host',
        remoteMdns: false,
        remoteAddress: '192.168.*.*',
      },
      rttMs: 3.25,
      mbPerS: 4.5,
      verdict: VERDICT_OK,
    });
    expect(text).toContain('Build: abc1234');
    expect(text).toContain('Other device: Chrome 140 on Android');
    expect(text).toContain('STUN: on (1 server)');
    expect(text).toContain('host → host (IP 192.168.*.*)');
    expect(text).toContain('Round trip: 3.3 ms');
    expect(text).toContain('Throughput: 4.50 MB/s');
    const empty = resultText({
      build: 'dev',
      browser: 'B',
      remoteBrowser: null,
      stun: false,
      iceServers: 0,
      pair: null,
      rttMs: null,
      mbPerS: null,
      verdict: '',
    });
    expect(empty).toContain('STUN: off');
    expect(empty).toContain('Round trip: –');
    expect(
      resultText({
        ...JSON.parse('{}'),
        build: 'x',
        browser: 'y',
        remoteBrowser: null,
        stun: true,
        iceServers: 2,
        pair: null,
        rttMs: null,
        mbPerS: null,
        verdict: '',
      }),
    ).toContain('2 servers');
  });
});
