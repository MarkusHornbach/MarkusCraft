// Player settings: defaults, validation and persistence in localStorage.
import {
  FOV_DEFAULT,
  FOV_MAX,
  FOV_MIN,
  MOUSE_SENSITIVITY_DEFAULT,
  MOUSE_SENSITIVITY_MAX,
  MOUSE_SENSITIVITY_MIN,
  RENDER_DISTANCE_DEFAULT,
  RENDER_DISTANCE_MAX,
  RENDER_DISTANCE_MIN,
  SETTINGS_STORAGE_KEY,
} from '../game/config';

export interface Settings {
  /** Render distance in chunks. */
  renderDistance: number;
  /** Multiplier on the mouse look speed. */
  mouseSensitivity: number;
  /** Vertical field of view in degrees. */
  fov: number;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  renderDistance: RENDER_DISTANCE_DEFAULT,
  mouseSensitivity: MOUSE_SENSITIVITY_DEFAULT,
  fov: FOV_DEFAULT,
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

export function saveSettings(storage: SettingsStorage | null, settings: Settings): void {
  if (!storage) return;
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(validateSettings(settings)));
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
