// FocusManager: the controller's focus on the topmost open screen. The focus is virtual (a
// class and a frame drawn over the element, never DOM focus); moving it is generic over the
// elements of a screen, which takes part with at most `data-pad-default`, `data-pad-back`
// and `padpress` / `padrelease` listeners.
import { PAD_SCROLL_PX_PER_S } from '../game/config';
import { type Direction, type FocusRect, nearestFocus, nextFocus } from '../input/focusMove';
import { PadButton, type PadFrame } from '../input/padMapping';
import { type PadHint, PadHints } from './PadHints';

/** What the controller can focus. Text fields never: one could open the on-screen keyboard. */
const FOCUSABLE = 'button, input[type=range], input[type=checkbox], [data-pad-focus]';

/** Space between the element and the frame drawn around it, in pixels. */
const FRAME_GAP = 3;

export interface FocusManagerOptions {
  /** The element that holds the frame and the hint bar (positioned). */
  host: HTMLElement;
  /** The topmost open screen, or null while the game is played. */
  screen: () => HTMLElement | null;
  /** Start was pressed on a screen. */
  onStart: () => void;
}

function isRange(element: Element | null): element is HTMLInputElement {
  return element instanceof HTMLInputElement && element.type === 'range';
}

/** Whether an element can take the focus now: enabled, shown, with a size. */
export function isFocusable(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement) || !element.isConnected) return false;
  if ('disabled' in element && element.disabled === true) return false;
  if (element.closest('[hidden], [data-pad-skip]')) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** The scroll container of an element below `root`, or `root` itself. */
function scrollerOf(element: HTMLElement, root: HTMLElement): HTMLElement {
  for (let node = element.parentElement; node && node !== root; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return root;
}

export class FocusManager {
  private readonly options: FocusManagerOptions;
  private readonly frameElement: HTMLElement;
  private readonly hints: PadHints;
  private active = false;
  /** The screen the focus is on, null while none is open or the controller is inactive. */
  private root: HTMLElement | null = null;
  private focused: HTMLElement | null = null;
  /** Where the focused element was last seen, to find its nearest neighbour if it goes. */
  private lastRect: FocusRect | null = null;
  /** The marked default of the view shown at the last update: a new one means a new view. */
  private lastDefault: HTMLElement | null = null;
  /**
   * Each screen's last focus, with the default of the view it was on: coming back to
   * another view of the same screen (the pause menu is also the settings page) starts on
   * that view's default instead.
   */
  private readonly memory = new WeakMap<
    HTMLElement,
    { element: HTMLElement; view: HTMLElement | null }
  >();
  /** The element A went down on; it is clicked when A comes up. */
  private pressed: HTMLElement | null = null;

  constructor(options: FocusManagerOptions) {
    this.options = options;
    this.frameElement = document.createElement('div');
    this.frameElement.className = 'pad-focus-frame';
    this.frameElement.setAttribute('aria-hidden', 'true');
    this.hints = new PadHints(options.host);
  }

  /** The frame and the hints show only while the controller is the active source. */
  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    // On the way back the screen is looked at afresh: memory first, then its default.
    this.root = null;
    if (!active) {
      this.pressed = null;
      this.update();
    }
  }

  /** A short description of the focused element (test API), or null. */
  get description(): string | null {
    const element = this.root ? this.focused : null;
    if (!element) return null;
    const aria = element.getAttribute('aria-label');
    if (aria) return aria;
    const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text) return text;
    return element.id || null;
  }

  /** Clicks the screen's back element (B, and the browser's Back). Returns whether one was. */
  back(): boolean {
    const root = this.options.screen();
    if (!root) return false;
    for (const element of root.querySelectorAll('[data-pad-back]')) {
      if (isFocusable(element)) {
        element.click();
        return true;
      }
    }
    return false;
  }

  /** One frame of the controller on a screen. */
  handle(frame: PadFrame, elapsedMs: number): void {
    this.update();
    const root = this.root;
    if (!root) return;
    const focused = this.focused;
    if (frame.nav) {
      if (focused && isRange(focused) && (frame.nav === 'left' || frame.nav === 'right')) {
        this.stepSlider(focused, frame.nav === 'right' ? 1 : -1);
      } else {
        this.move(frame.nav);
      }
    }
    if (frame.pressed.includes(PadButton.A) && this.focused) {
      this.pressed = this.focused;
      this.pressed.dispatchEvent(new CustomEvent('padpress'));
    }
    if (frame.released.includes(PadButton.A) && this.pressed) {
      const element = this.pressed;
      this.pressed = null;
      element.dispatchEvent(new CustomEvent('padrelease'));
      if (isFocusable(element)) element.click();
    }
    if (frame.pressed.includes(PadButton.B)) this.back();
    if (frame.pressed.includes(PadButton.START)) this.options.onStart();
    if (frame.scroll !== 0) {
      const scroller = this.focused ? scrollerOf(this.focused, root) : root;
      scroller.scrollTop += frame.scroll * PAD_SCROLL_PX_PER_S * (Math.min(elapsedMs, 250) / 1000);
    }
    this.update();
  }

  /**
   * Once per rendered frame: follows the open screen and its views, keeps the focus on a
   * usable element and the frame over it.
   */
  update(): void {
    const root = this.active ? this.options.screen() : null;
    if (!root) {
      this.root = null;
      this.setFocused(null);
      this.frameElement.remove();
      this.hints.show(null);
      return;
    }
    const marked = this.markedDefault(root);
    if (root !== this.root) {
      this.root = root;
      this.lastDefault = marked;
      const remembered = this.memory.get(root);
      const usable = remembered && remembered.view === marked && isFocusable(remembered.element);
      this.focus(usable ? remembered.element : this.defaultOf(root, marked));
    } else if (marked !== this.lastDefault) {
      // Another view of the screen (the "New world" form, the confirmation): its default.
      this.lastDefault = marked;
      this.focus(this.defaultOf(root, marked));
    } else if (!this.focused || !isFocusable(this.focused)) {
      this.focus(this.nearest(root) ?? this.defaultOf(root, marked));
    }
    this.place();
  }

  private markedDefault(root: HTMLElement): HTMLElement | null {
    for (const element of root.querySelectorAll<HTMLElement>('[data-pad-default]')) {
      if (isFocusable(element)) return element;
    }
    return null;
  }

  private defaultOf(root: HTMLElement, marked: HTMLElement | null): HTMLElement | null {
    return marked ?? this.focusables(root)[0] ?? null;
  }

  private focusables(root: HTMLElement): HTMLElement[] {
    return [...root.querySelectorAll(FOCUSABLE)].filter(isFocusable);
  }

  private nearest(root: HTMLElement): HTMLElement | null {
    const rect = this.lastRect;
    if (!rect) return null;
    const elements = this.focusables(root);
    const index = nearestFocus(
      elements.map((e) => e.getBoundingClientRect()),
      { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 },
    );
    return index >= 0 ? elements[index] : null;
  }

  private move(direction: Direction): void {
    const root = this.root;
    if (!root) return;
    const elements = this.focusables(root);
    const from = this.focused ? elements.indexOf(this.focused) : -1;
    if (from < 0) {
      this.focus(this.defaultOf(root, this.markedDefault(root)));
      return;
    }
    const to = nextFocus(
      elements.map((e) => e.getBoundingClientRect()),
      from,
      direction,
    );
    if (to >= 0) this.focus(elements[to]);
  }

  private stepSlider(input: HTMLInputElement, sign: 1 | -1): void {
    const step = Number(input.step) || 1;
    const min = Number(input.min);
    const max = Number(input.max);
    const value = Number(input.value);
    // Rounded to the step, so that ten steps of 0.1 give 1, not 0.9999999.
    const next = Math.round((value + sign * step) / step) * step;
    const clamped = Math.min(max, Math.max(min, Number(next.toFixed(6))));
    if (clamped === value) return;
    input.value = String(clamped);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  private focus(element: HTMLElement | null): void {
    this.setFocused(element);
    if (!element || !this.root) return;
    this.memory.set(this.root, { element, view: this.lastDefault });
    this.scrollToShow(element);
  }

  private setFocused(element: HTMLElement | null): void {
    if (element === this.focused) return;
    this.focused?.classList.remove('pad-focused');
    this.focused = element;
    element?.classList.add('pad-focused');
  }

  /** Scrolls the element's scroll container just far enough to show it. */
  private scrollToShow(element: HTMLElement): void {
    const root = this.root;
    if (!root) return;
    const scroller = scrollerOf(element, root);
    const box = scroller.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const margin = FRAME_GAP + 4;
    if (rect.top - margin < box.top) scroller.scrollTop -= box.top - rect.top + margin;
    else if (rect.bottom + margin > box.bottom) {
      scroller.scrollTop += rect.bottom + margin - box.bottom;
    }
  }

  /** Puts the frame over the focused element and the hint bar under the screen. */
  private place(): void {
    const element = this.focused;
    if (!element) {
      this.frameElement.remove();
      this.hints.show(null);
      return;
    }
    const host = this.options.host.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    this.lastRect = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    const style = this.frameElement.style;
    const left = `${rect.left - host.left - FRAME_GAP}px`;
    const top = `${rect.top - host.top - FRAME_GAP}px`;
    const width = `${rect.width + 2 * FRAME_GAP}px`;
    const height = `${rect.height + 2 * FRAME_GAP}px`;
    if (style.left !== left) style.left = left;
    if (style.top !== top) style.top = top;
    if (style.width !== width) style.width = width;
    if (style.height !== height) style.height = height;
    if (!this.frameElement.isConnected) this.options.host.appendChild(this.frameElement);
    this.hints.show(this.hintsFor(element));
  }

  private hintsFor(element: HTMLElement): PadHint[] {
    const hints: PadHint[] = [{ glyphs: ['A'], text: 'Select' }];
    const root = this.root;
    const back = root && [...root.querySelectorAll('[data-pad-back]')].some(isFocusable);
    if (back) hints.push({ glyphs: ['B'], text: 'Back' });
    if (isRange(element)) hints.push({ glyphs: ['dpad-horizontal'], text: 'Change' });
    return hints;
  }
}
