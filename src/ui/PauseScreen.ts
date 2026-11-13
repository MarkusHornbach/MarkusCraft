// Start / pause screen: title, play button, controls, settings and the world seed.
import {
  FOV_MAX,
  FOV_MIN,
  MOUSE_SENSITIVITY_MAX,
  MOUSE_SENSITIVITY_MIN,
  RENDER_DISTANCE_MAX,
  RENDER_DISTANCE_MIN,
  TOUCH_SENSITIVITY_MAX,
  TOUCH_SENSITIVITY_MIN,
} from '../game/config';
import type { Settings } from './settings';

/** How the game is controlled: mouse and keyboard, or the on-screen touch controls. */
export type InputMode = 'mouse' | 'touch';

const CONTROLS: readonly [string, string][] = [
  ['Mouse', 'Look around'],
  ['W A S D', 'Move'],
  ['Space', 'Jump / swim up / fly up'],
  ['Shift', 'Sprint'],
  ['F', 'Toggle fly mode'],
  ['C', 'Fly down'],
  ['Left click', 'Break block'],
  ['Right click', 'Place block'],
  ['1–9, wheel', 'Select block'],
  ['F3', 'Debug overlay'],
  ['Esc', 'Pause'],
];

const TOUCH_CONTROLS: readonly [string, string][] = [
  ['Left thumb', 'Move with the stick (push far to sprint)'],
  ['Drag right side', 'Look around'],
  ['Break / Place', 'Break or place a block at the crosshair'],
  ['Up', 'Jump / swim up / fly up'],
  ['Down', 'Fly down'],
  ['Fly', 'Toggle fly mode'],
  ['Block bar', 'Tap a block to select it'],
  ['Menu', 'Pause and open this menu'],
];

export interface PauseScreenOptions {
  seed: number;
  settings: Settings;
  mode: InputMode;
  /** `via` tells how the play button was activated; null if that is unknown (keyboard). */
  onPlay: (via: InputMode | null) => void;
  onSettingsChange: (settings: Settings) => void;
  onDebugChange: (visible: boolean) => void;
}

interface SliderHandle {
  row: HTMLElement;
  set: (value: number) => void;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
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
  private readonly sliders: Record<keyof Settings, SliderHandle>;
  /** Parts of the menu that only exist for touch mode. */
  private readonly touchOnly: HTMLElement[] = [];
  private readonly debugSwitch: HTMLInputElement;
  private mode: InputMode;
  private resumed = false;

  constructor(parent: HTMLElement, options: PauseScreenOptions) {
    this.settings = { ...options.settings };
    this.mode = options.mode;
    this.element = element('div', 'pause-screen');
    const panel = element('div', 'pause-panel');
    this.element.appendChild(panel);

    panel.appendChild(element('h1', 'pause-title', 'MarkusCraft'));
    this.playButton = element('button', 'play-button');
    this.playButton.type = 'button';
    // Not every browser reports the pointer type on `click`; remember it from the press.
    let pressedWith = '';
    this.playButton.addEventListener('pointerdown', (e) => {
      pressedWith = e.pointerType;
    });
    this.playButton.addEventListener('click', (e) => {
      const type = (e as PointerEvent).pointerType || pressedWith;
      pressedWith = '';
      options.onPlay(type === 'touch' ? 'touch' : type === 'mouse' ? 'mouse' : null);
    });
    panel.appendChild(this.playButton);
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
    this.sliders = { renderDistance, mouseSensitivity, touchSensitivity, fov };
    settings.append(renderDistance.row, mouseSensitivity.row, touchSensitivity.row, fov.row);

    // Touch devices have no F3 key; this switch replaces it.
    const debugRow = element('label', 'setting-row switch-row');
    debugRow.htmlFor = 'setting-debug';
    debugRow.appendChild(element('span', 'setting-label', 'Debug overlay'));
    this.debugSwitch = element('input', 'setting-switch');
    this.debugSwitch.type = 'checkbox';
    this.debugSwitch.id = 'setting-debug';
    this.debugSwitch.addEventListener('change', () =>
      options.onDebugChange(this.debugSwitch.checked),
    );
    debugRow.appendChild(this.debugSwitch);
    settings.appendChild(debugRow);
    this.touchOnly.push(debugRow);
    right.appendChild(settings);

    const world = element('section', 'pause-section');
    world.appendChild(element('h2', 'pause-heading', 'World'));
    const seedLine = element('div', 'seed-line');
    seedLine.appendChild(element('span', 'seed-label', 'Seed: '));
    seedLine.appendChild(element('span', 'seed-value', String(options.seed)));
    world.appendChild(seedLine);
    const link = element('input', 'seed-link');
    link.type = 'text';
    link.readOnly = true;
    link.value = worldLink(options.seed);
    link.setAttribute('aria-label', 'Link to this world');
    world.appendChild(link);
    const copy = element('button', 'copy-link-button', 'Copy link to this world');
    copy.type = 'button';
    copy.addEventListener('click', () => {
      void this.copyLink(link, copy);
    });
    world.appendChild(copy);
    right.appendChild(world);

    parent.appendChild(this.element);
    this.setMode(options.mode);
  }

  /** Adapts the labels, the controls list and the settings to the input mode. */
  setMode(mode: InputMode): void {
    this.mode = mode;
    const touch = mode === 'touch';
    this.updatePlayLabel();
    this.controlsList.replaceChildren();
    for (const [input, action] of touch ? TOUCH_CONTROLS : CONTROLS) {
      this.controlsList.appendChild(element('dt', 'control-input', input));
      this.controlsList.appendChild(element('dd', 'control-action', action));
    }
    // Parts that do not apply are taken out of the document, not just hidden.
    const place = (node: HTMLElement, parent: HTMLElement, before: Node | null, on: boolean) => {
      if (on) parent.insertBefore(node, before);
      else node.remove();
    };
    const settings = this.sliders.fov.row.parentElement;
    if (settings) {
      place(this.sliders.mouseSensitivity.row, settings, this.sliders.fov.row, !touch);
      place(this.sliders.touchSensitivity.row, settings, this.sliders.fov.row, touch);
      for (const node of this.touchOnly) place(node, settings, null, touch);
    }
  }

  /** Shows other settings than the player chose, e.g. the defaults of another mode. */
  setSettings(settings: Settings): void {
    this.settings = { ...settings };
    for (const key of Object.keys(this.sliders) as (keyof Settings)[]) {
      this.sliders[key].set(settings[key]);
    }
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
    const verb = this.mode === 'touch' ? 'Tap' : 'Click';
    this.playButton.textContent = `${verb} to ${this.resumed ? 'continue' : 'play'}`;
  }

  /** Shows a short message under the play button (empty string clears it). */
  setHint(text: string): void {
    this.hint.textContent = text;
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
