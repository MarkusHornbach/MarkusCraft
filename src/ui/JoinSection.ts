// "Join a world" on the world menu (Phase 6): the player's name, the open worlds at home
// from the room list, a room code field and the line that tells how joining goes.
import type { GameMode } from '../actions/playerRecord';
import { NET_MAX_PLAYERS } from '../game/config';
import { type InputMode, button, element, onActivate } from './activate';

/** One open world as the room list shows it. */
export interface RoomRowView {
  code: string;
  hostName: string;
  worldName: string;
  mode: GameMode;
  players: number;
  max: number;
}

/** What the list shows: rooms, or why there are none. */
export type RoomListView =
  | { kind: 'rooms'; rooms: RoomRowView[] }
  | { kind: 'loading' }
  | { kind: 'off' }
  | { kind: 'unreachable' }
  | { kind: 'unavailable' };

export const TEXT_NO_ROOMS = 'No open worlds right now.';
export const TEXT_DISCOVERY_OFF = 'No room list on this server. Use a room code.';
export const TEXT_LIST_UNREACHABLE =
  'Could not reach the connection service. Is this device on the home network?';
export const TEXT_UNAVAILABLE = 'Multiplayer is not available in this build.';

const MODE_TEXT: Record<GameMode, string> = { creative: 'Creative', gathering: 'Gathering' };

export interface JoinSectionOptions {
  name: string;
  /** Multiplayer exists in this build. */
  available: boolean;
  onName: (name: string) => void;
  /** "Join" on a row, on the code field or on the join link: the code as typed. */
  onJoin: (code: string, via: InputMode | null) => void;
}

export class JoinSection {
  readonly element: HTMLElement;
  /** "Join world CODE" from a join link; hidden without one. */
  readonly linkButton: HTMLButtonElement;
  private readonly list: HTMLElement;
  private readonly nameInput: HTMLInputElement;
  private readonly codeInput: HTMLInputElement;
  private readonly status: HTMLElement;
  private shown = '';
  private linkCode: string | null = null;

  constructor(options: JoinSectionOptions) {
    this.element = element('section', 'join-section');
    this.element.appendChild(element('h2', 'pause-heading', 'Join a world'));
    this.linkButton = button('play-button join-link-button', '');
    this.linkButton.hidden = true;
    onActivate(this.linkButton, (via) => {
      if (this.linkCode) options.onJoin(this.linkCode, via);
    });
    this.element.appendChild(this.linkButton);

    const nameRow = element('label', 'world-field join-name-field');
    nameRow.htmlFor = 'player-name';
    nameRow.appendChild(element('span', 'world-field-label', 'Name'));
    this.nameInput = element('input', 'world-input');
    this.nameInput.type = 'text';
    this.nameInput.id = 'player-name';
    this.nameInput.maxLength = 32;
    this.nameInput.autocomplete = 'off';
    this.nameInput.spellcheck = false;
    this.nameInput.placeholder = 'Your name';
    this.nameInput.value = options.name;
    this.nameInput.addEventListener('input', () => options.onName(this.nameInput.value));
    nameRow.appendChild(this.nameInput);
    this.element.appendChild(nameRow);

    this.element.appendChild(element('h3', 'join-subheading', 'Open worlds at home'));
    this.list = element('div', 'room-list');
    this.list.setAttribute('aria-label', 'Open worlds at home');
    this.element.appendChild(this.list);

    const codeRow = element('form', 'world-field join-code-field');
    const codeLabel = element('label', 'world-field-label', 'Code');
    codeLabel.htmlFor = 'room-code';
    codeRow.appendChild(codeLabel);
    this.codeInput = element('input', 'world-input');
    this.codeInput.type = 'text';
    this.codeInput.id = 'room-code';
    this.codeInput.maxLength = 12;
    this.codeInput.autocomplete = 'off';
    this.codeInput.spellcheck = false;
    this.codeInput.setAttribute('autocapitalize', 'characters');
    this.codeInput.placeholder = 'ABC123';
    codeRow.appendChild(this.codeInput);
    const join = button('menu-button join-code-button', 'Join');
    onActivate(join, (via) => options.onJoin(this.codeInput.value, via));
    codeRow.appendChild(join);
    codeRow.addEventListener('submit', (e) => {
      e.preventDefault();
      options.onJoin(this.codeInput.value, null);
    });
    this.element.appendChild(codeRow);

    this.status = element('div', 'join-status');
    this.status.setAttribute('role', 'status');
    this.element.appendChild(this.status);
    this.onJoin = options.onJoin;
    this.setRooms(options.available ? { kind: 'loading' } : { kind: 'unavailable' });
  }

  private readonly onJoin: (code: string, via: InputMode | null) => void;

  /** The room list; rows are rebuilt only when what they show changed. */
  setRooms(view: RoomListView): void {
    const key = JSON.stringify(view);
    if (key === this.shown) return;
    this.shown = key;
    const rows: HTMLElement[] = [];
    if (view.kind === 'rooms') {
      for (const room of view.rooms) rows.push(this.row(room));
      if (view.rooms.length === 0) rows.push(element('div', 'room-list-empty', TEXT_NO_ROOMS));
    } else if (view.kind === 'off') {
      rows.push(element('div', 'room-list-empty', TEXT_DISCOVERY_OFF));
    } else if (view.kind === 'unreachable') {
      rows.push(element('div', 'room-list-empty', TEXT_LIST_UNREACHABLE));
    } else if (view.kind === 'unavailable') {
      rows.push(element('div', 'room-list-empty', TEXT_UNAVAILABLE));
    } else {
      rows.push(element('div', 'room-list-empty', 'Looking for open worlds…'));
    }
    this.list.replaceChildren(...rows);
  }

  private row(room: RoomRowView): HTMLElement {
    const row = element('div', 'room-row');
    row.dataset.code = room.code;
    const text = element('div', 'room-row-text');
    text.appendChild(element('span', 'room-row-world', room.worldName));
    text.appendChild(
      element(
        'span',
        'room-row-details',
        `${room.hostName} · ${MODE_TEXT[room.mode]} · ${room.players}/${Math.min(room.max, NET_MAX_PLAYERS)}`,
      ),
    );
    row.appendChild(text);
    if (room.players < room.max) {
      const join = button('menu-button room-join-button', 'Join');
      join.setAttribute('aria-label', `Join ${room.worldName}`);
      onActivate(join, (via) => this.onJoin(room.code, via));
      row.appendChild(join);
    }
    return row;
  }

  /** The line under the code field: progress or why joining failed. */
  setStatus(text: string): void {
    this.status.textContent = text;
  }

  get statusText(): string {
    return this.status.textContent ?? '';
  }

  /** A page opened with `?join=CODE` offers that room as its main button. */
  setLink(code: string | null): void {
    this.linkCode = code;
    this.linkButton.hidden = code === null;
    this.linkButton.textContent = code ? `Join world ${code}` : '';
  }
}
