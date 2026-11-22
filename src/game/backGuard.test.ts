// Tests of the back guard's pairing of the controller's B with the browser's Back.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackGuard } from './backGuard';
import { BACK_PAIR_FRAME_MS, BACK_PAIR_MS } from './config';

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

  /** `count` frames of `ms` each: the clock moves on, then the frame ends. */
  function frames(count: number, ms: number): void {
    for (let i = 0; i < count; i++) {
      clock += ms;
      guard.update();
    }
  }

  it('pairs a Back within BACK_PAIR_MS of B on a fast device', () => {
    guard.notePadBack();
    frames(8, 16);
    clock += BACK_PAIR_MS - 1 - 8 * 16;
    browser.pop();
    expect(backs).toBe(0);
  });

  it('acts on a Back that comes BACK_PAIR_MS of 60 fps frames after B', () => {
    guard.notePadBack();
    frames(9, 50 / 3);
    browser.pop();
    expect(backs).toBe(1);
  });

  it('pairs a Back after slow frames as long as it comes before the end of the next frame', () => {
    guard.notePadBack();
    // The frame of the B poll ends after 400 ms of drawing; the Back comes then.
    frames(1, 400);
    browser.pop();
    expect(backs).toBe(0);
    // Also when the Back waited for the next slow frame too, before that one ended.
    guard.notePadBack();
    frames(1, 400);
    clock += 400;
    browser.pop();
    expect(backs).toBe(0);
  });

  it('pairs a Back that ordinary frames delay after a slow frame (CI runs #168, #180, #185)', () => {
    guard.notePadBack();
    // The B frame, a frame held up 600 ms, then a fast one before the popstate.
    frames(1, 5);
    frames(1, 600);
    frames(1, 40);
    clock += 20;
    browser.pop();
    expect(backs).toBe(0);
  });

  it('counts each frame at most BACK_PAIR_FRAME_MS, so slow frames end the window too', () => {
    guard.notePadBack();
    frames(BACK_PAIR_MS / BACK_PAIR_FRAME_MS - 1, 400);
    browser.pop();
    expect(backs).toBe(0);
    guard.notePadBack();
    frames(BACK_PAIR_MS / BACK_PAIR_FRAME_MS, 400);
    browser.pop();
    expect(backs).toBe(1);
  });

  it('pairs only the B press it follows: a later B starts the window again', () => {
    guard.notePadBack();
    frames(20, 16);
    guard.notePadBack();
    clock += 10;
    browser.pop();
    expect(backs).toBe(0);
  });
});
