// World menu: the start screen. Lists the saved worlds, creates and deletes them.
import { WORLD_NAME_MAX } from '../game/config';
import { type WorldListEntry, nextWorldName } from '../save/saveFormat';
import { type InputMode, button, element, onActivate } from './activate';

export interface WorldMenuOptions {
  mode: InputMode;
  /** Play the stored world with this id. */
  onPlay: (id: string, via: InputMode | null) => void;
  /** Create a world from the form (raw texts) and play it. */
  onCreate: (name: string, seedText: string, via: InputMode | null) => void;
  onDelete: (id: string) => void;
  onSettings: () => void;
}

type View = 'list' | 'form' | 'confirm';

const MODE_LABELS: Record<string, string> = { creative: 'Creative', gathering: 'Gathering' };
export const STORAGE_NOTE = 'Worlds are saved in this browser, on this device only.';

function playedDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });
}

export class WorldMenu {
  readonly element: HTMLElement;
  private readonly list: HTMLElement;
  private readonly listView: HTMLElement;
  private readonly formView: HTMLElement;
  private readonly confirmView: HTMLElement;
  private readonly playButton: HTMLButtonElement;
  private readonly deleteButton: HTMLButtonElement;
  private readonly backButton: HTMLButtonElement;
  private readonly nameInput: HTMLInputElement;
  private readonly seedInput: HTMLInputElement;
  private readonly message: HTMLElement;
  private readonly confirmText: HTMLElement;
  private entries: WorldListEntry[] = [];
  private selectedId: string | null = null;
  private mode: InputMode;
  private busy = false;

  constructor(parent: HTMLElement, options: WorldMenuOptions) {
    this.mode = options.mode;
    this.element = element('div', 'world-menu');
    const panel = element('div', 'world-panel');
    this.element.appendChild(panel);
    panel.appendChild(element('h1', 'pause-title', 'MarkusCraft'));

    // --- list of worlds ---
    this.listView = element('div', 'world-view world-list-view');
    this.list = element('div', 'world-list');
    this.list.setAttribute('role', 'listbox');
    this.list.setAttribute('aria-label', 'Worlds');
    this.listView.appendChild(this.list);
    this.playButton = button('play-button world-play-button', '');
    onActivate(this.playButton, (via) => {
      const entry = this.selected();
      if (entry?.status === 'ok' && !this.busy) options.onPlay(entry.id, via);
    });
    this.listView.appendChild(this.playButton);
    const row = element('div', 'world-buttons');
    const newButton = button('menu-button world-new-button', 'New world');
    newButton.addEventListener('click', () => this.showForm());
    this.deleteButton = button('menu-button world-delete-button', 'Delete');
    this.deleteButton.addEventListener('click', () => this.setView('confirm'));
    const settings = button('menu-button world-settings-button', 'Settings');
    settings.addEventListener('click', () => options.onSettings());
    row.append(newButton, this.deleteButton, settings);
    this.listView.appendChild(row);
    panel.appendChild(this.listView);

    // --- new world ---
    this.formView = element('form', 'world-view world-form');
    this.formView.appendChild(element('h2', 'pause-heading', 'New world'));
    this.nameInput = this.field('world-name', 'Name', WORLD_NAME_MAX * 2);
    this.seedInput = this.field('world-seed', 'Seed', 40);
    this.seedInput.placeholder = 'Random';
    const formRow = element('div', 'world-buttons');
    const create = button('play-button world-create-button', 'Create and play');
    onActivate(create, (via) => {
      if (!this.busy) options.onCreate(this.nameInput.value, this.seedInput.value, via);
    });
    this.backButton = button('menu-button world-back-button', 'Back');
    this.backButton.addEventListener('click', () => this.setView('list'));
    const formSettings = button('menu-button world-form-settings-button', 'Settings');
    formSettings.addEventListener('click', () => options.onSettings());
    formRow.append(create, this.backButton, formSettings);
    this.formView.appendChild(formRow);
    // Enter in a text field creates the world; the input mode stays as it is.
    this.formView.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!this.busy) options.onCreate(this.nameInput.value, this.seedInput.value, null);
    });
    panel.appendChild(this.formView);

    // --- delete? ---
    this.confirmView = element('div', 'world-view world-confirm');
    this.confirmText = element('div', 'world-confirm-name');
    this.confirmView.appendChild(this.confirmText);
    this.confirmView.appendChild(
      element('div', 'world-confirm-question', 'Delete this world for ever?'),
    );
    const confirmRow = element('div', 'world-buttons');
    const confirmDelete = button('menu-button danger world-confirm-delete', 'Delete');
    confirmDelete.addEventListener('click', () => {
      const entry = this.selected();
      this.setView('list');
      if (entry && !this.busy) options.onDelete(entry.id);
    });
    const keep = button('menu-button world-confirm-keep', 'Keep');
    keep.addEventListener('click', () => this.setView('list'));
    confirmRow.append(confirmDelete, keep);
    this.confirmView.appendChild(confirmRow);
    panel.appendChild(this.confirmView);

    this.message = element('div', 'world-message');
    this.message.setAttribute('role', 'status');
    panel.appendChild(this.message);
    panel.appendChild(element('div', 'world-note', STORAGE_NOTE));

    parent.appendChild(this.element);
    this.setMode(options.mode);
    this.setView('form');
  }

  private field(id: string, label: string, maxLength: number): HTMLInputElement {
    const row = element('label', 'world-field');
    row.htmlFor = id;
    row.appendChild(element('span', 'world-field-label', label));
    const input = element('input', 'world-input');
    input.type = 'text';
    input.id = id;
    input.maxLength = maxLength;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'sentences');
    row.appendChild(input);
    this.formView.appendChild(row);
    return input;
  }

  private selected(): WorldListEntry | undefined {
    return this.entries.find((entry) => entry.id === this.selectedId);
  }

  /**
   * Shows the stored worlds, most recently played first; the first one is preselected.
   * With no world the "New world" form is shown instead.
   */
  setWorlds(entries: WorldListEntry[]): void {
    this.entries = entries;
    this.selectedId = entries[0]?.id ?? null;
    this.renderList();
    if (entries.length === 0) this.showForm();
    else this.setView('list');
    this.backButton.hidden = entries.length === 0;
  }

  private renderList(): void {
    this.list.replaceChildren();
    for (const entry of this.entries) {
      const row = button('world-row', '');
      row.dataset.world = entry.id;
      row.dataset.status = entry.status;
      row.setAttribute('role', 'option');
      const ok = entry.status === 'ok';
      row.appendChild(
        element('span', 'world-row-name', ok ? entry.meta.name : (entry.name ?? 'Unnamed world')),
      );
      if (ok) {
        row.appendChild(element('span', 'world-row-mode', MODE_LABELS[entry.meta.mode]));
        row.appendChild(element('span', 'world-row-date', playedDate(entry.meta.playedMs)));
      } else {
        const text = entry.status === 'newer' ? 'Saved by a newer version' : 'Damaged';
        row.appendChild(element('span', 'world-row-problem', text));
      }
      row.addEventListener('click', () => {
        this.selectedId = entry.id;
        this.updateSelection();
      });
      this.list.appendChild(row);
    }
    this.updateSelection();
  }

  private updateSelection(): void {
    for (const row of this.list.children) {
      const selected = (row as HTMLElement).dataset.world === this.selectedId;
      row.classList.toggle('selected', selected);
      row.setAttribute('aria-selected', String(selected));
    }
    const entry = this.selected();
    // A world that cannot be opened can only be deleted.
    this.playButton.disabled = entry?.status !== 'ok';
    this.deleteButton.disabled = !entry;
    if (entry) {
      this.confirmText.textContent =
        entry.status === 'ok' ? entry.meta.name : (entry.name ?? 'Unnamed world');
    }
  }

  /** Opens the "New world" form with the next free default name and the given seed text. */
  showForm(seedText = ''): void {
    const names = this.entries.map((e) => (e.status === 'ok' ? e.meta.name : (e.name ?? '')));
    this.nameInput.value = nextWorldName(names);
    this.seedInput.value = seedText;
    this.setView('form');
  }

  private setView(view: View): void {
    this.listView.hidden = view !== 'list';
    this.formView.hidden = view !== 'form';
    this.confirmView.hidden = view !== 'confirm';
  }

  setMode(mode: InputMode): void {
    this.mode = mode;
    this.playButton.textContent = `${this.mode === 'touch' ? 'Tap' : 'Click'} to play`;
  }

  /** A line under the buttons, e.g. why a world could not be opened. Empty clears it. */
  setMessage(text: string): void {
    this.message.textContent = text;
  }

  /** While a world is being opened, created or deleted the buttons do nothing. */
  setBusy(busy: boolean): void {
    this.busy = busy;
    this.element.classList.toggle('busy', busy);
  }

  setVisible(visible: boolean): void {
    this.element.classList.toggle('hidden', !visible);
  }
}
