// World menu: the start screen. Lists the saved worlds, creates and deletes them.
import type { GameMode } from '../actions/playerRecord';
import { WORLD_NAME_MAX } from '../game/config';
import { type WorldListEntry, metaGen, nextWorldName } from '../save/saveFormat';
import {
  DEFAULT_WORLD_OPTIONS,
  TERRAIN_LABELS,
  TERRAIN_SHAPES,
  TREE_BUTTON_LABELS,
  TREE_DENSITIES,
  type TerrainShape,
  type TreeDensity,
  type WorldOptions,
  describeWorldGen,
} from '../world/generation/worldOptions';
import { type InputMode, button, element, onActivate } from './activate';

export interface WorldMenuOptions {
  mode: InputMode;
  /** Play the stored world with this id. */
  onPlay: (id: string, via: InputMode | null) => void;
  /** Create a world from the form (raw texts, chosen mode and options) and play it. */
  onCreate: (
    name: string,
    seedText: string,
    mode: GameMode,
    options: WorldOptions,
    via: InputMode | null,
  ) => void;
  onDelete: (id: string) => void;
  onSettings: () => void;
  /** Open the performance test. */
  onBench: () => void;
}

/** The parts of the menu: the list of worlds, the "New world" form, the confirmation. */
export type View = 'list' | 'form' | 'confirm';

const MODE_LABELS: Record<GameMode, string> = { creative: 'Creative', gathering: 'Gathering' };
/** The modes in the order of the form; the first one is preselected. */
const FORM_MODES: readonly GameMode[] = ['gathering', 'creative'];
const MODE_HINTS: Record<GameMode, string> = {
  gathering: 'Gather blocks before you build. No flying.',
  creative: 'All blocks, instant breaking, flying.',
};
/** Shown under the Trees row while Gathering rules out "None" (Phase 7 part A). */
export const NO_TREES_HINT = 'No trees only in Creative: Gathering needs wood.';
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
  private readonly panel: HTMLElement;
  private readonly confirmText: HTMLElement;
  private entries: WorldListEntry[] = [];
  private selectedId: string | null = null;
  private readonly modeButtons = new Map<GameMode, HTMLButtonElement>();
  private readonly modeHint: HTMLElement;
  /** Game mode chosen in the form. */
  private gameMode: GameMode = FORM_MODES[0];
  private readonly terrainButtons = new Map<TerrainShape, HTMLButtonElement>();
  private readonly treeButtons = new Map<TreeDensity, HTMLButtonElement>();
  private readonly treesHint: HTMLElement;
  /** World options chosen in the form. */
  private terrain: TerrainShape = DEFAULT_WORLD_OPTIONS.terrain;
  private trees: TreeDensity = DEFAULT_WORLD_OPTIONS.trees;
  private mode: InputMode;
  private padActive = false;
  private view: View = 'form';
  private busy = false;

  constructor(parent: HTMLElement, options: WorldMenuOptions) {
    this.mode = options.mode;
    this.element = element('div', 'world-menu');
    const panel = element('div', 'world-panel');
    this.panel = panel;
    this.element.appendChild(panel);
    panel.appendChild(element('h1', 'pause-title', 'MarkusCraft'));

    // --- list of worlds ---
    this.listView = element('div', 'world-view world-list-view');
    this.list = element('div', 'world-list');
    this.list.setAttribute('role', 'listbox');
    this.list.setAttribute('aria-label', 'Worlds');
    this.listView.appendChild(this.list);
    this.playButton = button('play-button world-play-button', '');
    // The controller's focus starts here and on the default of each view (plan 5.6).
    this.playButton.dataset.padDefault = '';
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
    row.append(newButton, this.deleteButton, settings, this.benchButton(options));
    this.listView.appendChild(row);
    panel.appendChild(this.listView);

    // --- new world ---
    this.formView = element('form', 'world-view world-form');
    this.formView.appendChild(element('h2', 'pause-heading', 'New world'));
    this.nameInput = this.field('world-name', 'Name', WORLD_NAME_MAX * 2);
    this.seedInput = this.field('world-seed', 'Seed', 40);
    this.seedInput.placeholder = 'Random';
    // The game mode: fixed once the world exists.
    this.choiceRow('world-mode-field', 'Mode', 'Game mode', FORM_MODES, MODE_LABELS, 'mode', (m) =>
      this.setGameMode(m),
    ).forEach((b, m) => this.modeButtons.set(m, b));
    this.modeHint = element('div', 'world-mode-hint');
    this.formView.appendChild(this.modeHint);
    // The world options (Phase 7 part A): fixed once the world exists, like the mode.
    this.choiceRow(
      'world-terrain-field',
      'Terrain',
      'Terrain',
      TERRAIN_SHAPES,
      TERRAIN_LABELS,
      'terrain',
      (t) => this.setTerrain(t),
    ).forEach((b, t) => this.terrainButtons.set(t, b));
    this.choiceRow(
      'world-trees-field',
      'Trees',
      'Trees',
      TREE_DENSITIES,
      TREE_BUTTON_LABELS,
      'trees',
      (t) => this.setTrees(t),
    ).forEach((b, t) => this.treeButtons.set(t, b));
    this.treesHint = element('div', 'world-mode-hint world-trees-hint');
    this.formView.appendChild(this.treesHint);
    this.setGameMode(this.gameMode);
    this.setTerrain(this.terrain);
    const formRow = element('div', 'world-buttons');
    const create = button('play-button world-create-button', 'Create and play');
    create.dataset.padDefault = '';
    onActivate(create, (via) => {
      if (this.busy) return;
      options.onCreate(
        this.nameInput.value,
        this.seedInput.value,
        this.gameMode,
        this.chosenOptions(),
        via,
      );
    });
    this.backButton = button('menu-button world-back-button', 'Back');
    this.backButton.dataset.padBack = '';
    this.backButton.addEventListener('click', () => this.setView('list'));
    const formSettings = button('menu-button world-form-settings-button', 'Settings');
    formSettings.addEventListener('click', () => options.onSettings());
    formRow.append(create, this.backButton, formSettings, this.benchButton(options));
    this.formView.appendChild(formRow);
    // Enter in a text field creates the world; the input mode stays as it is.
    this.formView.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.busy) return;
      options.onCreate(
        this.nameInput.value,
        this.seedInput.value,
        this.gameMode,
        this.chosenOptions(),
        null,
      );
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
    keep.dataset.padDefault = '';
    keep.dataset.padBack = '';
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

  private benchButton(options: WorldMenuOptions): HTMLButtonElement {
    const bench = button('menu-button world-bench-button', 'Performance test');
    bench.addEventListener('click', () => options.onBench());
    return bench;
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

  /**
   * A row of choice buttons like the Mode row: a radio group with one button per value
   * (`data-<key>` names the value). Returns the buttons by value.
   */
  private choiceRow<T extends string>(
    className: string,
    label: string,
    groupLabel: string,
    values: readonly T[],
    labels: Record<T, string>,
    key: string,
    choose: (value: T) => void,
  ): Map<T, HTMLButtonElement> {
    const row = element('div', `world-field ${className}`);
    row.appendChild(element('span', 'world-field-label', label));
    const group = element('div', 'world-mode-choice');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', groupLabel);
    const buttons = new Map<T, HTMLButtonElement>();
    for (const value of values) {
      const choice = button('menu-button world-mode-button', labels[value]);
      choice.dataset[key] = value;
      choice.setAttribute('role', 'radio');
      choice.addEventListener('click', () => choose(value));
      buttons.set(value, choice);
      group.appendChild(choice);
    }
    row.appendChild(group);
    this.formView.appendChild(row);
    return buttons;
  }

  private static markChoice<T>(buttons: Map<T, HTMLButtonElement>, chosen: T): void {
    for (const [value, choice] of buttons) {
      choice.classList.toggle('selected', value === chosen);
      choice.setAttribute('aria-checked', String(value === chosen));
    }
  }

  private setGameMode(gameMode: GameMode): void {
    this.gameMode = gameMode;
    WorldMenu.markChoice(this.modeButtons, gameMode);
    this.modeHint.textContent = MODE_HINTS[gameMode];
    // Every tool of Gathering starts with a log: a world without trees is Creative only.
    const gathering = gameMode === 'gathering';
    const none = this.treeButtons.get('none');
    if (none) none.disabled = gathering;
    this.treesHint.textContent = gathering ? NO_TREES_HINT : '';
    this.treesHint.hidden = !gathering;
    this.setTrees(gathering && this.trees === 'none' ? 'few' : this.trees);
  }

  private setTerrain(terrain: TerrainShape): void {
    this.terrain = terrain;
    WorldMenu.markChoice(this.terrainButtons, terrain);
  }

  private setTrees(trees: TreeDensity): void {
    if (trees === 'none' && this.gameMode === 'gathering') return;
    this.trees = trees;
    WorldMenu.markChoice(this.treeButtons, trees);
  }

  /** The world options chosen in the form. */
  private chosenOptions(): WorldOptions {
    return { terrain: this.terrain, trees: this.trees };
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
    // Tests wait for this before they type: the form is reset when the list arrives.
    this.element.dataset.ready = '1';
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
        // "Gathering · Balanced · Few trees", or "Creative · Classic" for generator 1.
        const what = `${MODE_LABELS[entry.meta.mode]} · ${describeWorldGen(metaGen(entry.meta))}`;
        row.appendChild(element('span', 'world-row-mode', what));
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
    this.terrain = DEFAULT_WORLD_OPTIONS.terrain;
    this.trees = DEFAULT_WORLD_OPTIONS.trees;
    this.setTerrain(this.terrain);
    this.setGameMode(FORM_MODES[0]);
    this.setView('form');
  }

  /** Which part of the menu shows: the list, the "New world" form or the confirmation. */
  get currentView(): View {
    return this.view;
  }

  /** Goes back to the list from the form or the confirmation; false if there is none. */
  backToList(): boolean {
    if (this.view === 'list' || this.entries.length === 0) return false;
    this.setView('list');
    return true;
  }

  private setView(view: View): void {
    // A view starts at the top: the form, taller since Phase 7 part A, scrolls on a phone,
    // and the list must not inherit its scroll position.
    if (view !== this.view) this.element.scrollTop = 0;
    this.view = view;
    this.listView.hidden = view !== 'list';
    this.formView.hidden = view !== 'form';
    this.confirmView.hidden = view !== 'confirm';
  }

  setMode(mode: InputMode): void {
    this.mode = mode;
    this.updatePlayLabel();
  }

  /** While the controller is the active source the play button names its button. */
  setPadActive(active: boolean): void {
    this.padActive = active;
    this.updatePlayLabel();
  }

  private updatePlayLabel(): void {
    const verb = this.padActive ? 'Press A' : this.mode === 'touch' ? 'Tap' : 'Click';
    this.playButton.textContent = `${verb} to play`;
  }

  /** Adds a section (joining a world) under the views, above the message line. */
  addSection(section: HTMLElement): void {
    this.panel.insertBefore(section, this.message);
  }

  /** A line under the buttons, e.g. why a world could not be opened. Empty clears it. */
  setMessage(text: string): void {
    this.message.textContent = text;
  }

  get messageText(): string {
    return this.message.textContent ?? '';
  }

  /** While a world is being opened, created or deleted the buttons do nothing. */
  setBusy(busy: boolean): void {
    this.busy = busy;
    this.element.classList.toggle('busy', busy);
  }

  setVisible(visible: boolean): void {
    const shown = visible && this.element.classList.contains('hidden');
    this.element.classList.toggle('hidden', !visible);
    // A hidden menu keeps the scroll position of the form it left (taller since Phase 7
    // part A); it comes back at the top. Set after showing: a hidden element cannot scroll.
    if (shown) this.element.scrollTop = 0;
  }
}
