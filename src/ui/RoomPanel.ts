// The pause menu's part about playing together (Phase 6): "Open to others" in a world of
// one's own; while hosting the room code, "Copy join link", the players and "Close to
// others"; as a guest the room code and the players.
import { PLAYER_COLORS } from '../render/figureModel';
import { button, element } from './activate';
import { headIconCanvas } from './figureIcons';

export const TEXT_PHONE_HOST =
  'The world closes for everyone if this screen locks or you switch apps. A computer is the more reliable host.';

export interface RoomPanelPlayer {
  id: number;
  name: string;
  slot: number;
  /** The figure's look (1–8): its head icon is shown next to the swatch. */
  look: number;
  host: boolean;
  self: boolean;
}

export interface RoomPanelView {
  role: 'off' | 'host' | 'guest';
  code: string | null;
  players: RoomPanelPlayer[];
  /** Why "Open to others" is disabled, or null if it can be pressed. */
  disabledReason: string | null;
  /** Touch mode: the host sees the hint about locking the screen. */
  touch: boolean;
  /** A line under the buttons: "Opening…", an error, "Link copied". */
  message: string;
}

export interface RoomPanelOptions {
  onOpen: () => void;
  onClose: () => void;
  onCopyLink: () => void;
}

export class RoomPanel {
  readonly element: HTMLElement;
  private readonly options: RoomPanelOptions;
  private shown = '';

  constructor(options: RoomPanelOptions) {
    this.options = options;
    this.element = element('section', 'pause-section room-panel');
  }

  /** Shows the view; nothing is rebuilt while it stays the same (the focus stays put). */
  set(view: RoomPanelView): void {
    const key = JSON.stringify(view);
    if (key === this.shown) return;
    this.shown = key;
    const parts: HTMLElement[] = [element('h2', 'pause-heading', 'Playing together')];
    if (view.role === 'off') {
      const open = button('menu-button room-open-button', 'Open to others');
      open.disabled = view.disabledReason !== null;
      open.addEventListener('click', () => this.options.onOpen());
      parts.push(open);
      if (view.disabledReason) parts.push(element('div', 'room-note', view.disabledReason));
    } else {
      const code = element('div', 'room-code-line');
      code.appendChild(element('span', 'room-code-label', 'Room code'));
      code.appendChild(element('span', 'room-code', view.code ?? ''));
      parts.push(code);
      const list = element('ul', 'room-players');
      list.setAttribute('aria-label', 'Players');
      for (const p of view.players) {
        const item = element('li', 'room-player');
        item.dataset.id = String(p.id);
        const swatch = element('span', 'room-swatch');
        swatch.style.background = `#${PLAYER_COLORS[p.slot % PLAYER_COLORS.length].toString(16).padStart(6, '0')}`;
        item.appendChild(swatch);
        item.appendChild(headIconCanvas(p.look, 3));
        const marks = [p.host ? '(host)' : '', p.self ? '(you)' : ''].filter((m) => m !== '');
        item.appendChild(element('span', 'room-player-name', [p.name, ...marks].join(' ')));
        list.appendChild(item);
      }
      parts.push(list);
      if (view.role === 'host') {
        const row = element('div', 'room-buttons');
        const copy = button('menu-button room-copy-button', 'Copy join link');
        copy.addEventListener('click', () => this.options.onCopyLink());
        const close = button('menu-button room-close-button', 'Close to others');
        close.addEventListener('click', () => this.options.onClose());
        row.append(copy, close);
        parts.push(row);
        if (view.touch) parts.push(element('div', 'room-note room-touch-hint', TEXT_PHONE_HOST));
      }
    }
    if (view.message) parts.push(element('div', 'room-message', view.message));
    this.element.replaceChildren(...parts);
  }
}
