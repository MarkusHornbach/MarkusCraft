// A fake controller for browser tests: replaces `navigator.getGamepads` with pads held in
// `window.__fakePads`, and waits after every change until the game has polled twice.
import type { Page } from '@playwright/test';

/** Button indices of the standard mapping. */
export const BUTTON = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  SELECT: 8,
  START: 9,
  LS: 10,
  RS: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
} as const;

interface FakeButton {
  pressed: boolean;
  touched: boolean;
  value: number;
}

interface FakePad {
  id: string;
  index: number;
  connected: boolean;
  mapping: string;
  timestamp: number;
  buttons: FakeButton[];
  axes: number[];
}

/** One change to the fake pads, applied in the page. */
type FakeOp =
  | { kind: 'connect'; index: number; mapping: string; id: string; holding: number[] }
  | { kind: 'disconnect'; index: number }
  | { kind: 'button'; index: number; button: number; value: number }
  | { kind: 'stick'; index: number; offset: number; x: number; y: number };

declare global {
  interface Window {
    __fakePads?: (FakePad | null)[];
    /** Applies a change and returns the game's poll count at that moment. */
    __fakePadOp?: (op: FakeOp) => number;
  }
}

/** Runs in the page before its scripts: the browser's pads are replaced by the fakes. */
function installFake(): void {
  if (window.__fakePads) return;
  const pads: (FakePad | null)[] = [null, null, null, null];
  window.__fakePads = pads;
  Object.defineProperty(Navigator.prototype, 'getGamepads', {
    configurable: true,
    value: () => pads.map((pad) => (pad && pad.connected ? pad : null)),
  });
  const announce = (type: string, pad: FakePad): void => {
    const event = new Event(type);
    Object.defineProperty(event, 'gamepad', { value: pad });
    window.dispatchEvent(event);
  };
  const padAt = (index: number): FakePad => {
    const pad = pads[index];
    if (!pad) throw new Error(`no pad at ${index}`);
    return pad;
  };
  window.__fakePadOp = (op) => {
    if (op.kind === 'connect') {
      const pad: FakePad = {
        id: op.id,
        index: op.index,
        connected: true,
        mapping: op.mapping,
        timestamp: performance.now(),
        buttons: Array.from({ length: 17 }, (_, i) => {
          const down = op.holding.includes(i);
          return { pressed: down, touched: down, value: down ? 1 : 0 };
        }),
        axes: [0, 0, 0, 0],
      };
      pads[op.index] = pad;
      announce('gamepadconnected', pad);
    } else if (op.kind === 'disconnect') {
      const pad = padAt(op.index);
      pad.connected = false;
      pads[op.index] = null;
      announce('gamepaddisconnected', pad);
    } else if (op.kind === 'button') {
      const pad = padAt(op.index);
      pad.buttons[op.button] = { pressed: op.value >= 0.5, touched: op.value > 0, value: op.value };
      pad.timestamp = performance.now();
    } else {
      const pad = padAt(op.index);
      pad.axes[op.offset] = op.x;
      pad.axes[op.offset + 1] = op.y;
      pad.timestamp = performance.now();
    }
    return window.__mc ? window.__mc.getState().pad.polls : 0;
  };
}

/** Must be called before `page.goto`. */
export async function installFakePads(page: Page): Promise<void> {
  await page.addInitScript(installFake);
}

export interface PadOptions {
  index?: number;
  /** `standard` (default) or another mapping, e.g. '' for an unsupported pad. */
  mapping?: string;
  id?: string;
}

export class Pad {
  readonly index: number;
  private readonly mapping: string;
  private readonly id: string;

  constructor(
    private readonly page: Page,
    options: PadOptions = {},
  ) {
    this.index = options.index ?? 0;
    this.mapping = options.mapping ?? 'standard';
    this.id = options.id ?? 'Test controller';
  }

  /**
   * Connects the pad. A browser reports a pad only after a button was pressed on it, so by
   * default this also taps Select (unused) as that wake-up press; `holding` instead
   * connects it with these buttons already down (and no tap).
   */
  async connect(options: { holding?: number[]; wake?: boolean } = {}): Promise<void> {
    const holding = options.holding ?? [];
    await this.apply({
      kind: 'connect',
      index: this.index,
      mapping: this.mapping,
      id: this.id,
      holding,
    });
    if (options.holding === undefined && options.wake !== false) await this.tap(BUTTON.SELECT);
  }

  disconnect(): Promise<void> {
    return this.apply({ kind: 'disconnect', index: this.index });
  }

  /** Sets a button's value (1 = fully down). */
  trigger(button: number, value: number): Promise<void> {
    return this.apply({ kind: 'button', index: this.index, button, value });
  }

  press(button: number): Promise<void> {
    return this.trigger(button, 1);
  }

  release(button: number): Promise<void> {
    return this.trigger(button, 0);
  }

  /**
   * A short press: the button is down for exactly one poll, as a quick real tap. (Down for
   * two or more polls, a slow frame could make a held D-pad repeat, which it rightly does
   * after 400 ms.)
   */
  async tap(button: number): Promise<void> {
    const released = await this.page.evaluate(
      async ([index, b]) => {
        const op = window.__fakePadOp;
        if (!op) throw new Error('installFakePads was not called');
        const before = op({ kind: 'button', index, button: b, value: 1 });
        // Released in the first frame callback after the poll that saw the press.
        await new Promise<void>((done) => {
          const check = (): void => {
            if (window.__mc.getState().pad.polls > before) done();
            else requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        });
        return op({ kind: 'button', index, button: b, value: 0 });
      },
      [this.index, button],
    );
    await this.page.waitForFunction((n) => window.__mc.getState().pad.polls >= n, released + 2);
  }

  /** Puts a stick at (x, y), each −1..1; y grows downwards as on a real pad. */
  stick(which: 'left' | 'right', x: number, y: number): Promise<void> {
    return this.apply({ kind: 'stick', index: this.index, offset: which === 'left' ? 0 : 2, x, y });
  }

  /**
   * Puts a stick at (x, y) for exactly `count` polls, then back to the middle, all inside
   * the page. A stick set and reset by two calls from the test stays out for as long as the
   * round trips take, and a busy machine stretches that past a second; the right stick then
   * turns the player by more than half a turn.
   */
  async stickFor(which: 'left' | 'right', x: number, y: number, count: number): Promise<void> {
    const offset = which === 'left' ? 0 : 2;
    const centred = await this.page.evaluate(
      async ([index, off, sx, sy, n]) => {
        const op = window.__fakePadOp;
        if (!op) throw new Error('installFakePads was not called');
        const before = op({ kind: 'stick', index, offset: off, x: sx, y: sy });
        // Back to the middle in the first frame callback after the n-th poll that saw it.
        await new Promise<void>((done) => {
          const check = (): void => {
            if (window.__mc.getState().pad.polls >= before + n) done();
            else requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        });
        return op({ kind: 'stick', index, offset: off, x: 0, y: 0 });
      },
      [this.index, offset, x, y, count] as const,
    );
    await this.page.waitForFunction((n) => window.__mc.getState().pad.polls >= n, centred + 2);
  }

  /** Makes a change in the page, then waits until the game has polled at least twice more. */
  private async apply(op: FakeOp): Promise<void> {
    const before = await this.page.evaluate((o) => {
      if (!window.__fakePadOp) throw new Error('installFakePads was not called');
      return window.__fakePadOp(o);
    }, op);
    await this.page.waitForFunction((n) => window.__mc.getState().pad.polls >= n, before + 2);
  }
}

export function padPolls(page: Page): Promise<number> {
  return page.evaluate(() => window.__mc.getState().pad.polls);
}

/** Waits until the game has polled the pads `n` more times. */
export async function polls(page: Page, n: number): Promise<void> {
  const before = await padPolls(page);
  await page.waitForFunction((target) => window.__mc.getState().pad.polls >= target, before + n);
}
