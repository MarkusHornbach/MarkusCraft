// Pause screen: continue button, controls, settings and the open world. Opened from the
// world menu it is the settings page (no world, no continue button).
import {
  FOV_MAX,
  FOV_MIN,
  MOUSE_SENSITIVITY_MAX,
  MOUSE_SENSITIVITY_MIN,
  PAD_SENSITIVITY_MAX,
  PAD_SENSITIVITY_MIN,
  RENDER_DISTANCE_MAX,
  RENDER_DISTANCE_MIN,
  TOUCH_SENSITIVITY_MAX,
  TOUCH_SENSITIVITY_MIN,
} from '../game/config';
import type { GameMode } from '../actions/playerRecord';
import { type InputMode, button, element, onActivate } from './activate';
import { type GlyphName, drawGlyph } from './padGlyphs';
import type { NumberSetting, Settings } from './settings';

export type { InputMode } from './activate';

/** `pause`: a world is open and paused. `settings`: opened from the world menu. */
export type PauseKind = 'pause' | 'settings';

export const SAVE_FAILED_TEXT = 'Saving failed. Free up storage space.';

/**
 * Key, what it does, and optionally what it does in a Gathering world, where nobody
 * flies: another text, or null if the line is left out.
 */
type ControlLine = readonly [string, string, (string | null)?];

const CONTROLS: readonly ControlLine[] = [
  ['Mouse', 'Look around'],
  ['W A S D', 'Move'],
  ['Space', 'Jump / swim up / fly up', 'Jump / swim up'],
  ['Shift', 'Sprint'],
  ['F', 'Toggle fly mode', null],
  ['C', 'Fly down', null],
  ['Left click', 'Break block'],
  ['Right click', 'Place block'],
  ['1–9, wheel', 'Select block'],
  ['E', 'Inventory'],
  ['F3', 'Debug overlay'],
  ['Esc', 'Pause'],
];

const TOUCH_CONTROLS: readonly ControlLine[] = [
  ['Left thumb', 'Move with the stick (push far to sprint)'],
  ['Drag right side', 'Look around'],
  ['Break / Place', 'Break or place a block at the crosshair'],
  ['Up', 'Jump / swim up / fly up', 'Jump / swim up'],
  ['Down', 'Fly down', null],
  ['Fly', 'Toggle fly mode', null],
  ['Block bar', 'Tap a block to select it'],
  ['Bag', 'Open the inventory'],
  ['Menu', 'Pause and open this menu'],
];

/** The controller's lines: glyphs, what they do, and the text in Gathering (as above). */
type PadControlLine = readonly [readonly GlyphName[], string, (string | null)?];

const PAD_CONTROLS: readonly PadControlLine[] = [
  [['LS'], 'Move'],
  [['LS-click'], 'Sprint (until the stick is let go)'],
  [['RS'], 'Look around'],
  [['A'], 'Jump / swim up / fly up', 'Jump / swim up'],
  [['B'], 'Fly down', null],
  [['X'], 'Toggle fly mode', null],
  [['RT'], 'Break block'],
  [['LT'], 'Place block'],
  [['LB', 'RB'], 'Select block (also the D-pad)'],
  [['Y'], 'Inventory'],
  [['start'], 'Pause'],
];

/** Shown while a controller is connected that has not been used yet. */
export const PAD_WAITING_TEXT = 'Press a button on the controller to use it';

export interface PauseScreenOptions {
  settings: Settings;
  mode: InputMode;
  /** `via` tells how the play button was activated; null if that is unknown (keyboard). */
  onPlay: (via: InputMode | null) => void;
  /** "Save and back to worlds", or "Back to worlds" on the settings page. */
  onBack: () => void;
  onSettingsChange: (settings: Settings) => void;
  onDebugChange: (visible: boolean) => void;
  /** The player left fullscreen with the "Exit fullscreen" button. */
  onFullscreenExit: () => void;
  /** "Network test" on the settings page. */
  onNetTest: () => void;
}

interface SliderHandle {
  row: HTMLElement;
  set: (value: number) => void;
}

/** Link that opens the same world again: the current address with only the seed. */
export function worldLink(seed: number): string {
  return `${window.location.origin}${window.location.pathname}?seed=${seed}`;
}

export class PauseScreen {
  readonly element: HTMLElement;
  private settings: Settings;
  private readonly hint: HTMLElement;
  private readonly playButton: HTMLButtonElement;
  private readonly controlsList: HTMLElement;
  private readonly sliders: Record<NumberSetting, SliderHandle>;
  /** "Invert controller look", a switch row like the debug overlay. */
  private readonly invertRow: HTMLElement;
  private readonly invertSwitch: HTMLInputElement;
  /** A controller was used during this visit: its two settings rows are shown. */
  private padSeen = false;
  /** Parts of the menu that only exist for touch mode. */
  private readonly touchOnly: HTMLElement[] = [];
  private readonly debugSwitch: HTMLInputElement;
  private readonly fullscreenButton: HTMLButtonElement;
  private readonly worldSection: HTMLElement;
  /** "Playing together" (Phase 6), in the pause menu of a world only. */
  private roomPanel: HTMLElement | null = null;
  /** A guest's world: "Leave world" instead of "Save and back to worlds". */
  private guest = false;
  private readonly backButton: HTMLButtonElement;
  /** "Network test": only on the settings page. */
  private readonly netTestButton: HTMLButtonElement;
  private readonly buttonRow: HTMLElement;
  private readonly rightColumn: HTMLElement;
  private readonly seedValue: HTMLElement;
  private readonly seedLink: HTMLInputElement;
  private readonly saveState: HTMLElement;
  private mode: InputMode;
  private kind: PauseKind = 'pause';
  private gameMode: GameMode = 'creative';
  private resumed = false;
  /** The controller is the active source: its controls list and button labels. */
  private padActive = false;
  /** A controller is connected but was not used yet during this visit. */
  private padWaiting = false;

  constructor(parent: HTMLElement, options: PauseScreenOptions) {
    this.settings = { ...options.settings };
    this.mode = options.mode;
    this.element = element('div', 'pause-screen');
    const panel = element('div', 'pause-panel');
    this.element.appendChild(panel);

    panel.appendChild(element('h1', 'pause-title', 'MarkusCraft'));
    this.buttonRow = element('div', 'pause-buttons');
    this.playButton = button('play-button', '');
    onActivate(this.playButton, (via) => options.onPlay(via));
    this.backButton = button('menu-button back-button', '');
    this.backButton.addEventListener('click', () => options.onBack());
    this.netTestButton = button('menu-button net-test-button', 'Network test');
    this.netTestButton.addEventListener('click', () => options.onNetTest());
    this.buttonRow.append(this.playButton, this.backButton);
    panel.appendChild(this.buttonRow);
    this.hint = element('div', 'pause-hint');
    panel.appendChild(this.hint);

    const columns = element('div', 'pause-columns');
    panel.appendChild(columns);

    const controls = element('section', 'pause-section');
    controls.appendChild(element('h2', 'pause-heading', 'Controls'));
    this.controlsList = element('dl', 'controls-list');
    controls.appendChild(this.controlsList);
    columns.appendChild(controls);

    const right = element('div', 'pause-right');
    this.rightColumn = right;
    columns.appendChild(right);

    const settings = element('section', 'pause-section');
    settings.appendChild(element('h2', 'pause-heading', 'Settings'));
    const change = (): void => options.onSettingsChange({ ...this.settings });
    const renderDistance = this.slider({
      id: 'setting-render-distance',
      label: 'Render distance',
      min: RENDER_DISTANCE_MIN,
      max: RENDER_DISTANCE_MAX,
      step: 1,
      value: this.settings.renderDistance,
      format: (v) => `${v} chunks`,
      apply: (v) => {
        this.settings.renderDistance = v;
        change();
      },
    });
    const mouseSensitivity = this.slider({
      id: 'setting-sensitivity',
      label: 'Mouse sensitivity',
      min: MOUSE_SENSITIVITY_MIN,
      max: MOUSE_SENSITIVITY_MAX,
      step: 0.1,
      value: this.settings.mouseSensitivity,
      format: (v) => `${v.toFixed(1)}×`,
      apply: (v) => {
        this.settings.mouseSensitivity = v;
        change();
      },
    });
    const touchSensitivity = this.slider({
      id: 'setting-touch-sensitivity',
      label: 'Touch sensitivity',
      min: TOUCH_SENSITIVITY_MIN,
      max: TOUCH_SENSITIVITY_MAX,
      step: 0.1,
      value: this.settings.touchSensitivity,
      format: (v) => `${v.toFixed(1)}×`,
      apply: (v) => {
        this.settings.touchSensitivity = v;
        change();
      },
    });
    const fov = this.slider({
      id: 'setting-fov',
      label: 'Field of view',
      min: FOV_MIN,
      max: FOV_MAX,
      step: 1,
      value: this.settings.fov,
      format: (v) => `${v}°`,
      apply: (v) => {
        this.settings.fov = v;
        change();
      },
    });
    const brightness = this.slider({
      id: 'setting-brightness',
      label: 'Brightness',
      min: 0,
      max: 1,
      step: 0.05,
      value: this.settings.brightness,
      format: (v) => `${Math.round(v * 100)} %`,
      apply: (v) => {
        this.settings.brightness = v;
        change();
      },
    });
    const padSensitivity = this.slider({
      id: 'setting-pad-sensitivity',
      label: 'Controller sensitivity',
      min: PAD_SENSITIVITY_MIN,
      max: PAD_SENSITIVITY_MAX,
      step: 0.1,
      value: this.settings.padSensitivity,
      format: (v) => `${v.toFixed(1)}×`,
      apply: (v) => {
        this.settings.padSensitivity = v;
        change();
      },
    });
    this.sliders = {
      renderDistance,
      mouseSensitivity,
      touchSensitivity,
      padSensitivity,
      fov,
      brightness,
    };
    settings.append(
      renderDistance.row,
      mouseSensitivity.row,
      touchSensitivity.row,
      fov.row,
      brightness.row,
    );

    const invert = this.switchRow('setting-pad-invert', 'Invert controller look');
    this.invertRow = invert.row;
    this.invertSwitch = invert.input;
    this.invertSwitch.checked = this.settings.padInvertY;
    this.invertSwitch.addEventListener('change', () => {
      this.settings.padInvertY = this.invertSwitch.checked;
      change();
    });

    // Touch devices have no F3 key; this switch replaces it.
    const debug = this.switchRow('setting-debug', 'Debug overlay');
    const debugRow = debug.row;
    this.debugSwitch = debug.input;
    this.debugSwitch.addEventListener('change', () =>
      options.onDebugChange(this.debugSwitch.checked),
    );
    settings.appendChild(debugRow);
    this.touchOnly.push(debugRow);
    right.appendChild(settings);

    const world = element('section', 'pause-section');
    world.appendChild(element('h2', 'pause-heading', 'World'));
    const seedLine = element('div', 'seed-line');
    seedLine.appendChild(element('span', 'seed-label', 'Seed: '));
    this.seedValue = element('span', 'seed-value', '');
    seedLine.appendChild(this.seedValue);
    // Whether the world is written to the store: "Saved", "Saving…" or the failure.
    this.saveState = element('span', 'save-state', '');
    this.saveState.setAttribute('role', 'status');
    seedLine.appendChild(this.saveState);
    world.appendChild(seedLine);
    const link = element('input', 'seed-link');
    link.type = 'text';
    link.readOnly = true;
    this.seedLink = link;
    link.setAttribute('aria-label', 'Link to this world');
    world.appendChild(link);
    const copy = button('copy-link-button', 'Copy link to this world');
    copy.addEventListener('click', () => {
      void this.copyLink(link, copy);
    });
    world.appendChild(copy);
    this.fullscreenButton = button('fullscreen-button', 'Fullscreen');
    this.fullscreenButton.addEventListener('click', () => {
      if (document.fullscreenElement) options.onFullscreenExit();
      void this.toggleFullscreen();
    });
    document.addEventListener('fullscreenchange', () => this.updateFullscreenLabel());
    this.worldSection = world;
    right.appendChild(world);

    parent.appendChild(this.element);
    this.setMode(options.mode);
    this.setKind('pause');
  }

  /** Switches between the pause menu of an open world and the settings page. */
  setKind(kind: PauseKind): void {
    this.kind = kind;
    const pause = kind === 'pause';
    this.backButton.textContent = this.backLabel();
    // Where the controller's focus starts and what B does (plan 5.6).
    this.mark(this.playButton, pause, pause);
    this.mark(this.backButton, false, !pause);
    const firstSlider = this.sliders.renderDistance.row.querySelector('input');
    if (firstSlider) this.mark(firstSlider, !pause, false);
    // Parts without a meaning on the settings page are taken out of the document.
    if (pause) {
      this.buttonRow.insertBefore(this.playButton, this.backButton);
      if (this.roomPanel)
        this.rightColumn.insertBefore(this.roomPanel, this.rightColumn.firstChild);
      this.rightColumn.appendChild(this.worldSection);
      this.netTestButton.remove();
    } else {
      this.playButton.remove();
      this.roomPanel?.remove();
      this.worldSection.remove();
      this.buttonRow.insertBefore(this.netTestButton, this.backButton.nextSibling);
    }
    this.placeFullscreenButton();
    this.renderControls();
  }

  private backLabel(): string {
    if (this.kind !== 'pause') return 'Back to worlds';
    return this.guest ? 'Leave world' : 'Save and back to worlds';
  }

  /** The "Playing together" section; shown in the pause menu of a world. */
  setRoomPanel(panel: HTMLElement): void {
    this.roomPanel = panel;
    if (this.kind === 'pause') this.rightColumn.insertBefore(panel, this.rightColumn.firstChild);
  }

  /** A guest's world is left, not saved; its seed link would open another world. */
  setGuest(guest: boolean): void {
    this.guest = guest;
    this.backButton.textContent = this.backLabel();
    this.worldSection.hidden = guest;
  }

  /** The world the pause menu is about: its seed and the link that recreates it. */
  setWorld(seed: number): void {
    this.seedValue.textContent = String(seed);
    this.seedLink.value = worldLink(seed);
    this.resumed = false;
    this.updatePlayLabel();
  }

  setSaveState(text: string): void {
    if (this.saveState.textContent !== text) this.saveState.textContent = text;
  }

  /** The fullscreen button lives in the world section, or next to "Back" without one. */
  private placeFullscreenButton(): void {
    if (this.mode !== 'touch') this.fullscreenButton.remove();
    else if (this.kind === 'pause') this.worldSection.appendChild(this.fullscreenButton);
    else this.buttonRow.appendChild(this.fullscreenButton);
  }

  /** The controls list names flying only where the open world has it. */
  setGameMode(mode: GameMode): void {
    this.gameMode = mode;
    this.renderControls();
  }

  private mark(node: HTMLElement, isDefault: boolean, isBack: boolean): void {
    if (isDefault) node.dataset.padDefault = '';
    else delete node.dataset.padDefault;
    if (isBack) node.dataset.padBack = '';
    else delete node.dataset.padBack;
  }

  private renderControls(): void {
    this.controlsList.replaceChildren();
    // The settings page is about no world: it lists everything.
    const gathering = this.gameMode === 'gathering' && this.kind === 'pause';
    const pick = (action: string, inGathering: string | null | undefined): string | null =>
      gathering && inGathering !== undefined ? inGathering : action;
    if (this.padActive) {
      for (const [glyphs, action, inGathering] of PAD_CONTROLS) {
        const text = pick(action, inGathering);
        if (text === null) continue;
        const term = element('dt', 'control-input control-glyphs');
        for (const glyph of glyphs) term.appendChild(drawGlyph(glyph, 22));
        this.controlsList.appendChild(term);
        this.controlsList.appendChild(element('dd', 'control-action', text));
      }
    } else {
      const lines = this.mode === 'touch' ? TOUCH_CONTROLS : CONTROLS;
      for (const [input, action, inGathering] of lines) {
        const text = pick(action, inGathering);
        if (text === null) continue;
        this.controlsList.appendChild(element('dt', 'control-input', input));
        this.controlsList.appendChild(element('dd', 'control-action', text));
      }
    }
    if (this.padWaiting && !this.padActive) {
      this.controlsList.appendChild(element('dt', 'control-input', 'Controller'));
      this.controlsList.appendChild(element('dd', 'control-action', PAD_WAITING_TEXT));
    }
  }

  /** The controller became the active source, or control went back to mouse or touch. */
  setPadActive(active: boolean): void {
    if (active === this.padActive) return;
    this.padActive = active;
    this.updatePlayLabel();
    this.renderControls();
  }

  /** A controller is connected that was not used yet: the controls list says what to do. */
  setPadWaiting(waiting: boolean): void {
    if (waiting === this.padWaiting) return;
    this.padWaiting = waiting;
    this.renderControls();
  }

  /** Adapts the labels, the controls list and the settings to the input mode. */
  setMode(mode: InputMode): void {
    this.mode = mode;
    const touch = mode === 'touch';
    this.updatePlayLabel();
    this.renderControls();
    // Parts that do not apply are taken out of the document, not just hidden.
    const place = (node: HTMLElement, parent: HTMLElement, before: Node | null, on: boolean) => {
      if (on) parent.insertBefore(node, before);
      else node.remove();
    };
    const settings = this.sliders.fov.row.parentElement;
    if (settings) {
      place(this.sliders.mouseSensitivity.row, settings, this.sliders.fov.row, !touch);
      place(this.sliders.touchSensitivity.row, settings, this.sliders.fov.row, touch);
      // The controller's rows show once a controller was used during this visit.
      place(this.sliders.padSensitivity.row, settings, this.sliders.fov.row, this.padSeen);
      place(this.invertRow, settings, null, this.padSeen);
      for (const node of this.touchOnly) place(node, settings, null, touch);
    }
    this.placeFullscreenButton();
  }

  /** A controller was used: from now on its settings rows are shown. */
  setPadSeen(): void {
    if (this.padSeen) return;
    this.padSeen = true;
    this.setMode(this.mode);
  }

  /** Shows other settings than the player chose, e.g. the defaults of another mode. */
  setSettings(settings: Settings): void {
    this.settings = { ...settings };
    for (const key of Object.keys(this.sliders) as NumberSetting[]) {
      this.sliders[key].set(settings[key]);
    }
    this.invertSwitch.checked = settings.padInvertY;
  }

  setDebugChecked(checked: boolean): void {
    this.debugSwitch.checked = checked;
  }

  setVisible(visible: boolean): void {
    this.element.classList.toggle('hidden', !visible);
  }

  /** After the first start the same screen serves as the pause screen. */
  setResumeMode(): void {
    this.resumed = true;
    this.updatePlayLabel();
  }

  private updatePlayLabel(): void {
    const verb = this.padActive ? 'Press A' : this.mode === 'touch' ? 'Tap' : 'Click';
    this.playButton.textContent = `${verb} to ${this.resumed ? 'continue' : 'play'}`;
  }

  /** Shows a short message under the play button (empty string clears it). */
  setHint(text: string): void {
    this.hint.textContent = text;
  }

  get hintText(): string {
    return this.hint.textContent ?? '';
  }

  /** Enters or leaves fullscreen; browsers allow this only from a tap or click. */
  private async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Some browsers (e.g. on phones of other makers) have no fullscreen for pages.
      this.setHint('Fullscreen is not available in this browser.');
    }
  }

  private updateFullscreenLabel(): void {
    this.fullscreenButton.textContent = document.fullscreenElement
      ? 'Exit fullscreen'
      : 'Fullscreen';
  }

  private async copyLink(link: HTMLInputElement, button: HTMLButtonElement): Promise<void> {
    try {
      await navigator.clipboard.writeText(link.value);
      button.textContent = 'Link copied';
    } catch {
      // Clipboard access can be denied; select the text so Ctrl+C works.
      link.focus();
      link.select();
      button.textContent = 'Press Ctrl+C to copy';
    }
    window.setTimeout(() => {
      button.textContent = 'Copy link to this world';
    }, 2000);
  }

  private switchRow(id: string, label: string): { row: HTMLElement; input: HTMLInputElement } {
    const row = element('label', 'setting-row switch-row');
    row.htmlFor = id;
    row.appendChild(element('span', 'setting-label', label));
    const input = element('input', 'setting-switch');
    input.type = 'checkbox';
    input.id = id;
    input.setAttribute('aria-label', label);
    row.appendChild(input);
    return { row, input };
  }

  private slider(config: {
    id: string;
    label: string;
    min: number;
    max: number;
    step: number;
    value: number;
    format: (value: number) => string;
    apply: (value: number) => void;
  }): SliderHandle {
    const row = element('label', 'setting-row');
    row.htmlFor = config.id;
    row.appendChild(element('span', 'setting-label', config.label));
    const input = element('input', 'setting-input');
    input.type = 'range';
    input.id = config.id;
    input.setAttribute('aria-label', config.label);
    input.min = String(config.min);
    input.max = String(config.max);
    input.step = String(config.step);
    input.value = String(config.value);
    const value = element('span', 'setting-value', config.format(config.value));
    input.addEventListener('input', () => {
      const v = Number(input.value);
      value.textContent = config.format(v);
      config.apply(v);
    });
    row.append(input, value);
    return {
      row,
      set: (v) => {
        input.value = String(v);
        value.textContent = config.format(v);
      },
    };
  }
}
