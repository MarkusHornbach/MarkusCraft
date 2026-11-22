// Several players in one test: each in its own browser context, every page with the
// console checks of `fixtures.ts`. All of them talk to the local PeerJS server.
import {
  type Browser,
  type BrowserContext,
  type Page,
  test as base,
  expect,
} from '@playwright/test';
import { ALLOWED_CONSOLE } from './fixtures';
import { openMenu } from './game';

/** The local signaling server that Playwright starts (`scripts/signalServer.mjs`). */
export const SIGNAL_URL = 'http://127.0.0.1:9000/';

/** URL parameters of a multiplayer page: the local server, no STUN, plus `extra`. */
export function netQuery(extra: Record<string, string> = {}): string {
  const query = new URLSearchParams({ signal: SIGNAL_URL, stun: 'none', ...extra });
  return `?${query.toString()}`;
}

export interface PlayerOptions {
  viewport?: { width: number; height: number };
  /** Touch device (`hasTouch`, `isMobile`). */
  touch?: boolean;
  permissions?: string[];
  /** Console messages this page may log (each needs a reason at the call). */
  allowConsole?: RegExp[];
}

export interface Player {
  context: BrowserContext;
  page: Page;
}

export class Players {
  private readonly all: { player: Player; problems: string[] }[] = [];

  constructor(private readonly browser: Browser) {}

  async open(options: PlayerOptions = {}): Promise<Player> {
    const context = await this.browser.newContext({
      viewport: options.viewport ?? { width: 960, height: 540 },
      ...(options.touch ? { hasTouch: true, isMobile: true } : {}),
      permissions: options.permissions ?? [],
    });
    const page = await context.newPage();
    const problems: string[] = [];
    const allowed = [...ALLOWED_CONSOLE, ...(options.allowConsole ?? [])];
    page.on('console', (msg) => {
      const type = msg.type();
      if (type !== 'error' && type !== 'warning') return;
      if (allowed.some((re) => re.test(msg.text()))) return;
      problems.push(`[console.${type}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => problems.push(`[pageerror] ${err.message}`));
    const player = { context, page };
    this.all.push({ player, problems });
    return player;
  }

  problems(): string[] {
    return this.all.flatMap((p, i) => p.problems.map((text) => `player ${i + 1}: ${text}`));
  }

  async close(): Promise<void> {
    for (const { player } of this.all) await player.context.close();
  }
}

/** `players.open()` makes a player; at the end every page must have logged nothing. */
export const test = base.extend<{ players: Players }>({
  players: async ({ browser }, use) => {
    const players = new Players(browser);
    await use(players);
    const problems = players.problems();
    await players.close();
    expect(problems, 'no page may log errors or warnings').toEqual([]);
  },
});

export { expect };

/** Opens the world menu with `query`, then the settings page, then the network test. */
export async function openNetTest(page: Page, query: string): Promise<void> {
  await openMenu(page, query);
  await page.locator('.world-settings-button:visible, .world-form-settings-button:visible').click();
  await page.locator('.pause-screen .net-test-button').click();
  await page.locator('.net-test-screen:not(.hidden)').waitFor();
}

export type NetTest = NonNullable<Awaited<ReturnType<typeof netState>>>;

/** `getState().net.test` of a page. */
export function netState(page: Page) {
  return page.evaluate(() => window.__mc.getState().net.test);
}

/** Waits until the network test of `page` satisfies `check`; returns its state. */
export async function untilNetTest(
  page: Page,
  check: (state: NetTest) => boolean,
  timeout = 20_000,
): Promise<NetTest> {
  let last: NetTest | null = null;
  try {
    await expect
      .poll(
        async () => {
          last = await netState(page);
          return last !== null && check(last);
        },
        { timeout, intervals: [100] },
      )
      .toBe(true);
  } catch (error) {
    // The state the wait ended on says where a run stopped (CI run #168 gave no clue).
    if (error instanceof Error)
      error.message += `\nLast network test state: ${JSON.stringify(last)}`;
    throw error;
  }
  if (!last) throw new Error('the network test is not open');
  return last;
}

/** URL parameters of a multiplayer test page: test mode, seed 1337, noon, frozen clock. */
export function testQuery(extra: Record<string, string> = {}): string {
  return netQuery({ test: '1', seed: '1337', time: '0.25', freeze: '1', ...extra });
}

/** A player in test mode on the local server; waits until its world is ready. */
export async function openTestPlayer(
  players: Players,
  options: PlayerOptions & { query?: Record<string, string> } = {},
): Promise<Player> {
  const player = await players.open(options);
  await player.page.goto(`/${testQuery(options.query)}`);
  await player.page.waitForFunction(
    () => window.__mc !== undefined && window.__mc.isReady(),
    null,
    {
      timeout: 60_000,
    },
  );
  return player;
}

/** Opens the page's world to others; returns the room code. */
export function hostRoom(
  page: Page,
  options: { code?: string; build?: string } = {},
): Promise<string> {
  return page.evaluate((o) => window.__mc.net.host(o), options);
}

/** Joins a room and waits until the guest's world is ready. */
export async function joinRoom(
  page: Page,
  code: string,
  options: { name?: string; checksum?: number; build?: string } = {},
): Promise<void> {
  await page.evaluate(([c, o]) => window.__mc.net.join(c, o), [code, options] as const);
  await page.waitForFunction(() => window.__mc.isReady(), null, { timeout: 60_000 });
}

/** Joins and returns the error text instead of throwing. */
export function joinError(
  page: Page,
  code: string,
  options: { checksum?: number; build?: string } = {},
): Promise<string | null> {
  return page.evaluate(
    ([c, o]) =>
      window.__mc.net.join(c, o).then(
        () => null,
        (e: Error) => e.message,
      ),
    [code, options] as const,
  );
}

/** `getState().net` of a page. */
export function netOf(page: Page) {
  return page.evaluate(() => window.__mc.getState().net);
}

/** Waits until `check` holds for the page's `getState().net`. */
export async function untilNet(
  page: Page,
  check: (net: Awaited<ReturnType<typeof netOf>>) => boolean,
  timeout = 15_000,
): Promise<void> {
  await expect.poll(async () => check(await netOf(page)), { timeout, intervals: [100] }).toBe(true);
}

/**
 * Advances a test-mode page by `steps` simulation steps no faster than real time (60 per
 * second). A room's host measures a guest's break on its own clock (Phase 6 part C), so a
 * guest that steps faster than time passes sends its `break` too early.
 */
export async function stepPaced(page: Page, steps: number): Promise<void> {
  await page.evaluate(async (n) => {
    const start = performance.now();
    let done = 0;
    while (done < n) {
      await new Promise((resolve) => setTimeout(resolve, 16));
      const due = Math.min(n, Math.floor(((performance.now() - start) * 60) / 1000));
      if (due > done) {
        window.__mc.step(due - done);
        done = due;
      }
    }
  }, steps);
}
