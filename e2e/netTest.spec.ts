// Phase 6 part A: the transport between two browsers and the network test screen.
import type { Server } from 'node:http';
import { type Page } from '@playwright/test';
import { PeerServer } from 'peer';
import { createWorld, openMenu } from './game';
import { BUTTON, Pad, focusOn, installFakePads } from './gamepad';
import {
  type Player,
  type Players,
  expect,
  netQuery,
  openNetTest,
  test,
  untilNetTest,
} from './multiplayer';

/** Starts a PeerJS server of the test's own on `port`; resolves with a function that stops it. */
async function ownServer(port: number, discovery: boolean): Promise<() => Promise<void>> {
  const server = await new Promise<Server>((resolve) => {
    PeerServer({ host: '127.0.0.1', port, path: '/', allow_discovery: discovery }, (s) =>
      resolve(s as Server),
    );
  });
  return async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  };
}

/** Opens the page's PeerJS network in the page and registers `id` (kept on `window`). */
async function registerPeer(page: Page, id: string): Promise<void> {
  await page.evaluate(async (peerId) => {
    const network = await window.__mc.netNetwork();
    if (!network) throw new Error('no network');
    const signaling = network.signaling();
    const w = window as unknown as Record<string, unknown>;
    const received: string[] = [];
    w.__received = received;
    w.__signaling = signaling;
    w.__network = network;
    signaling.onConnection = (connection) => {
      w.__connection = connection;
      connection.onMessage = (text) => received.push(text);
    };
    await signaling.open(peerId);
  }, id);
}

test('Phase 6 AC1.3: two contexts exchange messages through the local server', async ({
  players,
}) => {
  test.setTimeout(120_000);
  const a = await players.open();
  const b = await players.open();
  const suffix = String(Math.floor(Math.random() * 1e6));
  await a.page.goto(`/${netQuery({ test: '1', seed: '1337' })}`);
  await b.page.goto(`/${netQuery({ test: '1', seed: '1337' })}`);
  for (const p of [a.page, b.page]) await p.waitForFunction(() => window.__mc !== undefined);
  const build = await a.page.evaluate(() => window.__mc.getState().net.build);
  const idA = `mc-${build}-x-a${suffix}`;
  const idB = `mc-${build}-x-b${suffix}`;
  await registerPeer(a.page, idA);
  await registerPeer(b.page, idB);
  const started = Date.now();
  await a.page.evaluate(async (remote) => {
    const w = window as unknown as Record<string, unknown>;
    const signaling = w.__signaling as import('../src/net/transport').Signaling;
    const connection = await signaling.connect(remote);
    const received = w.__received as string[];
    connection.onMessage = (text) => received.push(text);
    w.__connection = connection;
    connection.send('hello from a');
  }, idB);
  await expect
    .poll(() => b.page.evaluate(() => (window as unknown as { __received: string[] }).__received))
    .toEqual(['hello from a']);
  await b.page.evaluate(() => {
    const w = window as unknown as Record<string, { send(t: string): void }>;
    w.__connection.send('hello from b');
  });
  await expect
    .poll(() => a.page.evaluate(() => (window as unknown as { __received: string[] }).__received))
    .toEqual(['hello from b']);
  expect(Date.now() - started).toBeLessThan(10_000);
  const list = await a.page.evaluate(async () => {
    const w = window as unknown as Record<string, import('../src/net/transport').Network>;
    return w.__network.directory.list();
  });
  expect(list.ok).toBe(true);
  if (list.ok) expect(list.ids).toEqual(expect.arrayContaining([idA, idB]));
});

/** Opens the network test on both pages and waits until each lists the other; codes. */
async function listEachOther(a: Player, b: Player, query = netQuery()): Promise<[string, string]> {
  await openNetTest(a.page, query);
  await openNetTest(b.page, query);
  const codeA = (await untilNetTest(a.page, (s) => s.code !== null && s.signaling === 'open')).code;
  const codeB = (await untilNetTest(b.page, (s) => s.code !== null && s.signaling === 'open')).code;
  if (!codeA || !codeB) throw new Error('no test codes');
  const started = Date.now();
  await untilNetTest(a.page, (s) => s.others.includes(codeB), 10_000);
  await untilNetTest(b.page, (s) => s.others.includes(codeA), 10_000);
  expect(Date.now() - started).toBeLessThan(10_000);
  return [codeA, codeB];
}

test('Phase 6 AC2.1, AC2.5, AC2.7: the test connects directly; result text; reference', async ({
  players,
}) => {
  test.setTimeout(120_000);
  // A server of its own: devices of tests running alongside must not show in the reference.
  const stop = await ownServer(9003, true);
  try {
    await connectAndCheck(players);
  } finally {
    await stop();
  }
});

async function connectAndCheck(players: Players): Promise<void> {
  const a = await players.open({ permissions: ['clipboard-read', 'clipboard-write'] });
  const b = await players.open();
  try {
    await connectAndCheckPages(a, b);
  } finally {
    // Closed before the server, whose loss they would otherwise report.
    await a.page.close();
    await b.page.close();
  }
}

async function connectAndCheckPages(a: Player, b: Player): Promise<void> {
  const query = `?${new URLSearchParams({ signal: 'http://127.0.0.1:9003/', stun: 'none' })}`;
  const [, codeB] = await listEachOther(a, b, query);
  await a.page.locator(`.net-other[data-code="${codeB}"] .net-connect-button`).click();
  for (const page of [a.page, b.page]) {
    const done = await untilNetTest(
      page,
      (s) => s.state === 'done' && s.candidate !== null,
      30_000,
    );
    expect(done.candidate).toMatch(/^(host|srflx|prflx|relay) → /);
    expect(done.rttMs).toBeGreaterThan(0);
    expect(done.mbPerS).toBeGreaterThan(0);
    expect(done.verdict).toBe('Direct connection OK');
    await expect(page.locator('.net-verdict')).toHaveText('Direct connection OK');
  }

  // AC2.7: the reference, with everything that differs between runs masked.
  const masked = [
    '.net-build',
    '.net-code',
    '.net-other-code',
    '.net-pair',
    '.net-rtt',
    '.net-throughput',
    '.net-remote',
  ].map((selector) => a.page.locator(selector));
  // Text only, like the menu references (5 %); denser text, and CI's browser draws it with
  // another font than the cloud container, which moves every line a little.
  await expect(a.page).toHaveScreenshot('net-test.png', { mask: masked, maxDiffPixelRatio: 0.08 });

  // AC2.5: "Copy result" puts the numbers on the clipboard.
  await a.page.locator('.net-copy-button').click();
  await expect(a.page.locator('.net-status')).toHaveText('Copied');
  const text = await a.page.evaluate(() => navigator.clipboard.readText());
  const state = await untilNetTest(a.page, (s) => s.state === 'done');
  const build = await a.page.evaluate(() => window.__mc.getState().net.build);
  expect(text).toContain(`Build: ${build}`);
  expect(text).toContain(`Candidate pair: ${state.candidate}`);
  expect(text).toMatch(/Round trip: \d+\.\d ms/);
  expect(text).toMatch(/Throughput: \d+\.\d\d MB\/s/);
  expect(text).toContain('Other device: Chrome');
  expect(text).toContain('Verdict: Direct connection OK');
}

test('Phase 6 AC2.6: the controller connects; touch controls are finger-sized', async ({
  players,
}) => {
  test.setTimeout(120_000);
  const a = await players.open({ viewport: { width: 640, height: 360 }, touch: true });
  await installFakePads(a.page);
  const b = await players.open();
  const [, codeB] = await listEachOther(a, b);
  expect(await a.page.evaluate(() => window.__mc.getState().touch)).toBe(true);

  // Touch, 640 × 360: every control lies inside the view (scrolled to) and is 48 × 48.
  const controls = a.page.locator('.net-test-screen button:visible');
  expect(await controls.count()).toBeGreaterThanOrEqual(4);
  for (const control of await controls.all()) {
    await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox();
    const name = await control.textContent();
    if (!box) throw new Error(`no box: ${name}`);
    expect(box.width, name ?? '').toBeGreaterThanOrEqual(48);
    expect(box.height, name ?? '').toBeGreaterThanOrEqual(48);
    expect(box.x, name ?? '').toBeGreaterThanOrEqual(0);
    expect(box.y, name ?? '').toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, name ?? '').toBeLessThanOrEqual(640);
    expect(box.y + box.height, name ?? '').toBeLessThanOrEqual(360);
  }

  // The controller: the focus moves to "Connect", A connects.
  const pad = new Pad(a.page);
  await pad.connect();
  // The first press makes the controller the active source and shows the focus.
  await pad.tap(BUTTON.DOWN);
  await a.page.waitForFunction(() => window.__mc.getState().ui.focus !== undefined);
  const connect = `.net-other[data-code="${codeB}"] .net-connect-button`;
  await focusOn(a.page, pad, connect);
  expect((await a.page.evaluate(() => window.__mc.getState())).ui.focus).toBe(
    `Connect to ${codeB}`,
  );
  await pad.tap(BUTTON.A);
  for (const page of [a.page, b.page]) {
    await untilNetTest(page, (s) => s.state === 'done', 30_000);
  }
});

test('Phase 6 AC1.2: a build without a signaling server has no multiplayer', async ({
  players,
}) => {
  const { page } = await players.open();
  await openNetTest(page, '');
  const net = await page.evaluate(() => window.__mc.getState().net);
  expect(net.available).toBe(false);
  expect(net.role).toBe('off');
  expect(net.test?.state).toBe('unavailable');
  await expect(page.locator('.net-unavailable')).toHaveText(
    'Multiplayer is not available in this build.',
  );
  await expect(page.locator('.net-connect-button')).toHaveCount(0);
  expect(await page.evaluate(() => window.__mc.netNetwork())).toBeNull();
});

test('Phase 6 AC1.7: single-player requests nothing outside the page and never loads peerjs', async ({
  players,
}) => {
  test.setTimeout(120_000);
  const { page } = await players.open();
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  // A build that knows a server: still nothing is fetched until multiplayer is used.
  await openMenu(page, netQuery());
  await createWorld(page, { name: 'Alone', seed: '1337' });
  await page.waitForFunction(() => window.__mc.isReady());
  // Play: walk and jump until the player has moved, whatever stands in the way.
  const start = await page.evaluate(() => window.__mc.getState().player);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('Space');
  await page.waitForFunction(
    ([x, z]) => {
      const p = window.__mc.getState().player;
      return Math.hypot(p.x - x, p.z - z) > 0.5;
    },
    [start.x, start.z],
  );
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyW');
  const origin = new URL(page.url()).origin;
  expect(requests.length).toBeGreaterThan(0);
  for (const url of requests) {
    if (url.startsWith('data:') || url.startsWith('blob:')) continue;
    expect(new URL(url).origin, url).toBe(origin);
    expect(url).not.toContain('peerTransport');
    expect(url).not.toContain('NetTestScreen');
  }
});

test('Phase 6 AC2.2: an unreachable signaling server is reported and the game still works', async ({
  players,
}) => {
  test.setTimeout(120_000);
  const { page } = await players.open({
    // Chromium itself reports the refused WebSocket of the PeerJS client.
    allowConsole: [/WebSocket connection to 'ws:\/\/127\.0\.0\.1:9\/peerjs/],
  });
  const query = `?${new URLSearchParams({ signal: 'http://127.0.0.1:9/', stun: 'none' })}`;
  await openNetTest(page, query);
  const state = await untilNetTest(page, (s) => s.state === 'unreachable', 15_000);
  expect(state.verdict).toContain('Signaling server unreachable');
  await expect(page.locator('.net-signaling')).toHaveText('Unreachable');
  await page.locator('.net-back-button').click();
  await page.locator('.pause-screen .back-button').click();
  await page.locator('.world-menu:not(.hidden)').waitFor();
  await createWorld(page, { name: 'Still works' });
  expect((await page.evaluate(() => window.__mc.getState())).ui.screen).toBe('play');
});

test('Phase 6 AC2.3: a server without discovery says so and still shows the own code', async ({
  players,
}) => {
  test.setTimeout(120_000);
  const stop = await ownServer(9002, false);
  try {
    const { page } = await players.open({
      // Chromium itself reports the 401 of the switched-off discovery list.
      allowConsole: [/Failed to load resource: the server responded with a status of 401/],
    });
    const query = `?${new URLSearchParams({ signal: 'http://127.0.0.1:9002/', stun: 'none' })}`;
    await openNetTest(page, query);
    const state = await untilNetTest(page, (s) => s.discovery === 'off');
    expect(state.code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    expect(state.verdict).toContain('Discovery off');
    await expect(page.locator('.net-discovery')).toHaveText('Off');
    await expect(page.locator('.net-code')).toHaveText(state.code ?? '');
    await expect(page.locator('.net-verdict')).toContainText('Discovery off');
    // Closed before the server, which its retries would otherwise report as refused.
    await page.close();
  } finally {
    await stop();
  }
});

test('Phase 6 AC2.4: "Use STUN" off removes the ICE servers', async ({ players }) => {
  const { page } = await players.open();
  await openNetTest(page, netQuery({ stun: 'stun:127.0.0.1:3478,stun:127.0.0.1:3479' }));
  const on = await untilNetTest(page, (s) => s.signaling === 'open');
  expect(on.useStun).toBe(true);
  expect(on.iceServers).toBe(2);
  await expect(page.locator('.net-ice')).toContainText('stun:127.0.0.1:3478');
  await page.locator('.net-stun-button').click();
  const off = await untilNetTest(page, (s) => s.signaling === 'open' && !s.useStun);
  expect(off.iceServers).toBe(0);
  await expect(page.locator('.net-ice')).toHaveText('None (STUN off)');
  await expect(page.locator('.net-stun-button')).toHaveAttribute('aria-checked', 'false');
  // A new start: the test registered again, under a new code.
  expect(off.code).not.toBeNull();
});
