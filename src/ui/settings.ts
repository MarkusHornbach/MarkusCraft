// Player settings: defaults, validation and persistence in localStorage.
import {
  BRIGHTNESS_DEFAULT,
  FOV_DEFAULT,
  FOV_MAX,
  FOV_MIN,
  MOUSE_SENSITIVITY_DEFAULT,
  MOUSE_SENSITIVITY_MAX,
  MOUSE_SENSITIVITY_MIN,
  PAD_SENSITIVITY_DEFAULT,
  PAD_SENSITIVITY_MAX,
  PAD_SENSITIVITY_MIN,
  RENDER_DISTANCE_DEFAULT,
  RENDER_DISTANCE_MAX,
  RENDER_DISTANCE_MIN,
  SETTINGS_STORAGE_KEY,
  TOUCH_SENSITIVITY_DEFAULT,
  TOUCH_SENSITIVITY_MAX,
  TOUCH_SENSITIVITY_MIN,
} from '../game/config';

export interface Settings {
  /** Render distance in chunks. */
  renderDistance: number;
  /** Multiplier on the mouse look speed. */
  mouseSensitivity: number;
  /** Vertical field of view in degrees. */
  fov: number;
  /** Multiplier on the look speed of a touch drag. */
  touchSensitivity: number;
  /**
   * How bright the darkest places are drawn, 0..1. It changes the picture only, never
   * the light of the world.
   */
  brightness: number;
  /** Multiplier on the look speed of the controller's right stick. */
  padSensitivity: number;
  /** The controller's right stick pushed up looks down. */
  padInvertY: boolean;
}

/** The settings that are numbers (each has a slider). */
export type NumberSetting = Exclude<keyof Settings, 'padInvertY'>;

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  renderDistance: RENDER_DISTANCE_DEFAULT,
  mouseSensitivity: MOUSE_SENSITIVITY_DEFAULT,
  fov: FOV_DEFAULT,
  touchSensitivity: TOUCH_SENSITIVITY_DEFAULT,
  brightness: BRIGHTNESS_DEFAULT,
  padSensitivity: PAD_SENSITIVITY_DEFAULT,
  padInvertY: false,
};

/** The part of the Storage interface that is used; lets tests pass a fake. */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function numberInRange(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Turns anything into valid settings: unknown or broken fields fall back to defaults. */
export function validateSettings(raw: unknown): Settings {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    renderDistance: Math.round(
      numberInRange(
        source.renderDistance,
        RENDER_DISTANCE_MIN,
        RENDER_DISTANCE_MAX,
        DEFAULT_SETTINGS.renderDistance,
      ),
    ),
    mouseSensitivity: numberInRange(
      source.mouseSensitivity,
      MOUSE_SENSITIVITY_MIN,
      MOUSE_SENSITIVITY_MAX,
      DEFAULT_SETTINGS.mouseSensitivity,
    ),
    fov: Math.round(numberInRange(source.fov, FOV_MIN, FOV_MAX, DEFAULT_SETTINGS.fov)),
    touchSensitivity: numberInRange(
      source.touchSensitivity,
      TOUCH_SENSITIVITY_MIN,
      TOUCH_SENSITIVITY_MAX,
      DEFAULT_SETTINGS.touchSensitivity,
    ),
    brightness: numberInRange(source.brightness, 0, 1, DEFAULT_SETTINGS.brightness),
    padSensitivity: numberInRange(
      source.padSensitivity,
      PAD_SENSITIVITY_MIN,
      PAD_SENSITIVITY_MAX,
      DEFAULT_SETTINGS.padSensitivity,
    ),
    padInvertY:
      typeof source.padInvertY === 'boolean' ? source.padInvertY : DEFAULT_SETTINGS.padInvertY,
  };
}

/** Reads the stored settings. Missing, corrupt or inaccessible storage yields defaults. */
export function loadSettings(storage: SettingsStorage | null): Settings {
  if (!storage) return { ...DEFAULT_SETTINGS };
  try {
    const text = storage.getItem(SETTINGS_STORAGE_KEY);
    if (text === null) return { ...DEFAULT_SETTINGS };
    return validateSettings(JSON.parse(text));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** True if settings were saved before (then they win over mode-dependent defaults). */
export function hasStoredSettings(storage: SettingsStorage | null): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(SETTINGS_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function saveSettings(storage: SettingsStorage | null, settings: Settings): void {
  if (!storage) return;
  try {
    const { touchSensitivity, brightness, padSensitivity, padInvertY, ...rest } =
      validateSettings(settings);
    // The settings added after Phase 1 are only written once they were changed, so the
    // stored text of players who never touched them stays as it was before they existed.
    const stored: Partial<Settings> = rest;
    if (touchSensitivity !== DEFAULT_SETTINGS.touchSensitivity) {
      stored.touchSensitivity = touchSensitivity;
    }
    if (brightness !== DEFAULT_SETTINGS.brightness) stored.brightness = brightness;
    if (padSensitivity !== DEFAULT_SETTINGS.padSensitivity) stored.padSensitivity = padSensitivity;
    if (padInvertY !== DEFAULT_SETTINGS.padInvertY) stored.padInvertY = padInvertY;
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage can be full or blocked (private mode); the game works without it.
  }
}

/** `window.localStorage`, or null where the browser denies access to it. */
export function browserStorage(): SettingsStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
