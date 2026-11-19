// Phase 6 part A: the transport between two browsers and the network test screen.
import type { Server } from 'node:http';
import { type Page } from '@playwright/test';
import { PeerServer } from 'peer';
import { createWorld, openMenu } from './game';
import { expect, netQuery, openNetTest, test, untilNetTest } from './multiplayer';

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

test('Phase 6 AC2.1: two devices find each other and the test connects directly', async ({
  players,
}) => {
  test.setTimeout(120_000);
  const a = await players.open();
  const b = await players.open();
  await openNetTest(a.page, netQuery());
  await openNetTest(b.page, netQuery());
  const stateA = await untilNetTest(a.page, (s) => s.code !== null && s.signaling === 'open');
  const stateB = await untilNetTest(b.page, (s) => s.code !== null && s.signaling === 'open');
  await untilNetTest(a.page, (s) => s.others.includes(stateB.code ?? ''), 10_000);
  await untilNetTest(b.page, (s) => s.others.includes(stateA.code ?? ''), 10_000);
  await a.page.locator(`.net-other[data-code="${stateB.code}"] .net-connect-button`).click();
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
  await createWorld(page, { name: 'Alone' });
  await page.waitForFunction(() => window.__mc.isReady());
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__mc.getState().player.z < -2);
  await page.keyboard.up('KeyW');
  const origin = new URL(page.url()).origin;
  expect(requests.length).toBeGreaterThan(0);
  for (const url of requests) {
    if (url.startsWith('data:') || url.startsWith('blob:')) continue;
    expect(new URL(url).origin, url).toBe(origin);
    expect(url).not.toContain('peerTransport');
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
  const server = await new Promise<Server>((resolve) => {
    PeerServer({ host: '127.0.0.1', port: 9002, path: '/', allow_discovery: false }, (s) =>
      resolve(s as Server),
    );
  });
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
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
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
