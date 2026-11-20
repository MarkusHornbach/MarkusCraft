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
  await expect
    .poll(
      async () => {
        last = await netState(page);
        return last !== null && check(last);
      },
      { timeout, intervals: [100] },
    )
    .toBe(true);
  if (!last) throw new Error('the network test is not open');
  return last;
}
