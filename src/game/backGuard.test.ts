// Tests of the back guard's pairing of the controller's B with the browser's Back.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackGuard } from './backGuard';
import { BACK_PAIR_MS } from './config';

/** A window with one `popstate` listener and a history that counts entries. */
function fakeBrowser() {
  let onPop: (() => void) | null = null;
  vi.stubGlobal('window', {
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'popstate') onPop = listener;
    },
    location: { href: 'http://localhost/' },
    setTimeout: () => 0,
  });
  vi.stubGlobal('history', { pushState: () => {}, back: () => {} });
  return {
    pop: () => onPop?.(),
  };
}

describe('BackGuard', () => {
  let clock = 0;
  let backs = 0;
  let browser: ReturnType<typeof fakeBrowser>;
  let guard: BackGuard;

  beforeEach(() => {
    clock = 1000;
    backs = 0;
    browser = fakeBrowser();
    guard = new BackGuard(
      () => backs++,
      () => true,
      () => clock,
    );
    guard.update();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('acts on a Back without a B press', () => {
    browser.pop();
    expect(backs).toBe(1);
  });

  it('pairs a Back within BACK_PAIR_MS of B on a fast device', () => {
    guard.notePadBack();
    for (let frame = 0; frame < 5; frame++) guard.update();
    clock += BACK_PAIR_MS - 1;
    browser.pop();
    expect(backs).toBe(0);
  });

  it('pairs a Back after slow frames as long as it comes before the end of the next frame', () => {
    guard.notePadBack();
    // The frame of the B poll ends after 400 ms of drawing; the Back comes then.
    clock += 400;
    guard.update();
    browser.pop();
    expect(backs).toBe(0);
    // Also when the Back waited for the next slow frame too, before that one ended.
    guard.notePadBack();
    clock += 400;
    guard.update();
    clock += 400;
    browser.pop();
    expect(backs).toBe(0);
  });

  it('acts on a Back that comes two frames and BACK_PAIR_MS after B', () => {
    guard.notePadBack();
    guard.update();
    guard.update();
    clock += BACK_PAIR_MS;
    browser.pop();
    expect(backs).toBe(1);
  });
});
