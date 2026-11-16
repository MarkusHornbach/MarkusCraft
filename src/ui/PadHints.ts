// The hint bar at the bottom of a screen while the controller is in use: "[A] Select [B] Back".
import { type GlyphName, drawGlyph } from './padGlyphs';

export interface PadHint {
  glyphs: readonly GlyphName[];
  text: string;
}

export class PadHints {
  private readonly element: HTMLElement;
  /** What the bar shows, so it is rebuilt only when that changes. */
  private shown = '';

  constructor(private readonly host: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'pad-hints';
    this.element.setAttribute('aria-hidden', 'true');
  }

  /** The top edge of the bar in page pixels, or null while it is not shown. */
  get top(): number | null {
    return this.element.isConnected ? this.element.getBoundingClientRect().top : null;
  }

  /** Shows these hints; null takes the bar out of the document. */
  show(hints: readonly PadHint[] | null): void {
    const key = hints ? hints.map((h) => `${h.glyphs.join('+')}:${h.text}`).join('|') : '';
    if (key === this.shown) return;
    this.shown = key;
    if (!hints) {
      this.element.remove();
      return;
    }
    this.element.replaceChildren();
    for (const hint of hints) {
      const item = document.createElement('span');
      item.className = 'pad-hint';
      for (const glyph of hint.glyphs) item.appendChild(drawGlyph(glyph, 22));
      const text = document.createElement('span');
      text.className = 'pad-hint-text';
      text.textContent = hint.text;
      item.appendChild(text);
      this.element.appendChild(item);
    }
    if (!this.element.isConnected) this.host.appendChild(this.element);
  }
}
