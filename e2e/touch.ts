// Touch helpers: several fingers at once through the DevTools protocol.
import type { CDPSession, Page } from '@playwright/test';
import { type OpenOptions, openGame } from './game';

/** Context options for touch tests: a touch screen on a mobile device. */
export const TOUCH_DEVICE = { hasTouch: true, isMobile: true } as const;

/**
 * Emulated fingers. A press or a move sends the full set of touch points and Chromium
 * derives which finger changed by comparing with the previous set; a lift names the finger.
 */
export class Fingers {
  private readonly points = new Map<number, { x: number; y: number }>();
  private session: CDPSession | null = null;

  constructor(private readonly page: Page) {}

  async touchDown(id: number, x: number, y: number): Promise<void> {
    this.points.set(id, { x, y });
    await this.send('touchStart');
  }

  /** Moves a finger in a straight line; `steps` intermediate positions are reported. */
  async touchMove(id: number, x: number, y: number, steps = 1): Promise<void> {
    const from = this.points.get(id);
    if (!from) throw new Error(`finger ${id} is not down`);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this.points.set(id, { x: from.x + (x - from.x) * t, y: from.y + (y - from.y) * t });
      await this.send('touchMove');
    }
  }

  async touchUp(id: number): Promise<void> {
    const point = this.points.get(id);
    if (!point) throw new Error(`finger ${id} is not down`);
    this.points.delete(id);
    // `touchEnd` names the fingers that lift; the others stay down.
    await this.send('touchEnd', [{ id, ...point }]);
  }

  /** A short touch without movement. */
  async tap(id: number, x: number, y: number): Promise<void> {
    await this.touchDown(id, x, y);
    await this.touchUp(id);
  }

  private async send(
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    lifted?: { id: number; x: number; y: number }[],
  ): Promise<void> {
    if (!this.session) {
      this.session = await this.page.context().newCDPSession(this.page);
      await this.page.addInitScript(watchFingers);
      await this.page.evaluate(watchFingers);
    }
    const touchPoints = [...this.points].map(([id, p]) => ({ id, x: p.x, y: p.y }));
    await this.session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: lifted ?? touchPoints,
    });
    // Chromium hands touch moves to the page with its next frame, after the call above
    // returned. Wait until the page has seen exactly these fingers at these positions.
    await this.page.waitForFunction((expected) => {
      const seen = [...(window.__fingers?.values() ?? [])];
      return (
        seen.length === expected.length &&
        expected.every((e) =>
          seen.some((p) => Math.abs(p.x - e.x) <= 1 && Math.abs(p.y - e.y) <= 1),
        )
      );
    }, touchPoints);
  }
}

declare global {
  interface Window {
    /** Positions of the fingers the page currently sees, by pointer id (tests only). */
    __fingers?: Map<number, { x: number; y: number }>;
  }
}

/** Runs in the page: records where the page sees fingers. */
function watchFingers(): void {
  if (window.__fingers) return;
  const fingers = new Map<number, { x: number; y: number }>();
  window.__fingers = fingers;
  const set = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const remove = (e: PointerEvent): void => {
    fingers.delete(e.pointerId);
  };
  window.addEventListener('pointerdown', set, true);
  window.addEventListener('pointermove', set, true);
  window.addEventListener('pointerup', remove, true);
  window.addEventListener('pointercancel', remove, true);
}

/** Opens the game in test mode with forced touch mode and waits until ready. */
export async function openTouchGame(page: Page, options: OpenOptions = {}): Promise<Fingers> {
  await openGame(page, { ...options, touch: true });
  return new Fingers(page);
}

/** Centre of an element in viewport coordinates. */
export async function centerOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} is not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Makes the page a browser without fullscreen for pages (as on an iPhone). Since Phase 3
 * a tap on a play button enters fullscreen, and a headless window in fullscreen cannot be
 * resized. Tests of the fullscreen rule itself use their own fake (fullscreen.spec.ts).
 */
export async function withoutFullscreen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      configurable: true,
      value: undefined,
    });
  });
}
