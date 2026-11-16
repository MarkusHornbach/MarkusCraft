import { describe, expect, it } from 'vitest';
import { SETTINGS_STORAGE_KEY } from '../game/config';
import {
  DEFAULT_SETTINGS,
  type SettingsStorage,
  hasStoredSettings,
  loadSettings,
  saveSettings,
  validateSettings,
} from './settings';

function fakeStorage(initial?: string): SettingsStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(SETTINGS_STORAGE_KEY, initial);
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe('settings', () => {
  it('has the specified defaults and storage key', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      renderDistance: 8,
      mouseSensitivity: 1,
      fov: 75,
      touchSensitivity: 1,
      brightness: 0.5,
      padSensitivity: 1,
      padInvertY: false,
    });
    expect(SETTINGS_STORAGE_KEY).toBe('markuscraft.settings.v1');
  });

  it('validates and clamps values', () => {
    expect(validateSettings({ renderDistance: 2, mouseSensitivity: 2.5, fov: 110 })).toEqual({
      renderDistance: 2,
      mouseSensitivity: 2.5,
      fov: 110,
      touchSensitivity: 1,
      brightness: 0.5,
      padSensitivity: 1,
      padInvertY: false,
    });
    expect(validateSettings({ renderDistance: 99, mouseSensitivity: 0, fov: 10 })).toEqual({
      renderDistance: 16,
      mouseSensitivity: 0.2,
      fov: 60,
      touchSensitivity: 1,
      brightness: 0.5,
      padSensitivity: 1,
      padInvertY: false,
    });
    expect(validateSettings({ touchSensitivity: 2 }).touchSensitivity).toBe(2);
    expect(validateSettings({ touchSensitivity: 9 }).touchSensitivity).toBe(3);
    expect(validateSettings({ touchSensitivity: 0 }).touchSensitivity).toBe(0.2);
    expect(validateSettings({ renderDistance: 3.6, fov: 80.4 })).toMatchObject({
      renderDistance: 4,
      fov: 80,
    });
  });

  it('falls back to defaults for broken input', () => {
    for (const raw of [null, undefined, 5, 'text', [], { renderDistance: 'far', fov: NaN }]) {
      expect(validateSettings(raw)).toEqual(DEFAULT_SETTINGS);
    }
    expect(validateSettings({ fov: Infinity, mouseSensitivity: null })).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips through storage', () => {
    const storage = fakeStorage();
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    expect(hasStoredSettings(storage)).toBe(false);
    const chosen = {
      renderDistance: 5,
      mouseSensitivity: 1.5,
      fov: 90,
      touchSensitivity: 1,
      brightness: 0.5,
      padSensitivity: 1,
      padInvertY: false,
    };
    saveSettings(storage, chosen);
    expect(hasStoredSettings(storage)).toBe(true);
    expect(loadSettings(storage)).toEqual(chosen);
    // The default touch sensitivity is not written, so the stored text stays as in Phase 1.
    expect(JSON.parse(storage.data.get(SETTINGS_STORAGE_KEY) ?? '')).toEqual({
      renderDistance: 5,
      mouseSensitivity: 1.5,
      fov: 90,
    });
    saveSettings(storage, { ...chosen, touchSensitivity: 2.5 });
    expect(JSON.parse(storage.data.get(SETTINGS_STORAGE_KEY) ?? '')).toEqual({
      renderDistance: 5,
      mouseSensitivity: 1.5,
      fov: 90,
      touchSensitivity: 2.5,
    });
    expect(loadSettings(storage).touchSensitivity).toBe(2.5);
  });

  it('Phase 4 AC4.1: Brightness defaults when missing or broken and is clamped to 0–1', () => {
    expect(validateSettings({}).brightness).toBe(0.5);
    for (const broken of ['bright', null, NaN, Infinity, {}, []]) {
      expect(validateSettings({ brightness: broken }).brightness).toBe(0.5);
    }
    expect(validateSettings({ brightness: 0 }).brightness).toBe(0);
    expect(validateSettings({ brightness: 1 }).brightness).toBe(1);
    expect(validateSettings({ brightness: 0.35 }).brightness).toBe(0.35);
    expect(validateSettings({ brightness: -2 }).brightness).toBe(0);
    expect(validateSettings({ brightness: 7 }).brightness).toBe(1);
  });

  it('Phase 4 AC4.1: settings stored before this phase load unchanged otherwise', () => {
    const stored = '{"renderDistance":5,"mouseSensitivity":1.5,"fov":90,"touchSensitivity":2}';
    const storage = fakeStorage(stored);
    expect(loadSettings(storage)).toEqual({
      renderDistance: 5,
      mouseSensitivity: 1.5,
      fov: 90,
      touchSensitivity: 2,
      brightness: 0.5,
      padSensitivity: 1,
      padInvertY: false,
    });
    // Writing them back without a change of Brightness gives the same text.
    saveSettings(storage, loadSettings(storage));
    expect(storage.data.get(SETTINGS_STORAGE_KEY)).toBe(stored);
    saveSettings(storage, { ...loadSettings(storage), brightness: 0.8 });
    expect(JSON.parse(storage.data.get(SETTINGS_STORAGE_KEY) ?? '').brightness).toBe(0.8);
    expect(loadSettings(storage).brightness).toBe(0.8);
  });

  it('Phase 5 AC1.8: the controller settings default, clamp and survive storing', () => {
    expect(validateSettings({})).toMatchObject({ padSensitivity: 1, padInvertY: false });
    for (const broken of ['fast', null, NaN, Infinity, {}, []]) {
      expect(validateSettings({ padSensitivity: broken }).padSensitivity).toBe(1);
    }
    for (const broken of ['true', 1, 0, null, {}]) {
      expect(validateSettings({ padInvertY: broken }).padInvertY).toBe(false);
    }
    expect(validateSettings({ padSensitivity: 2.4 }).padSensitivity).toBe(2.4);
    expect(validateSettings({ padSensitivity: 9 }).padSensitivity).toBe(3);
    expect(validateSettings({ padSensitivity: 0 }).padSensitivity).toBe(0.2);
    expect(validateSettings({ padInvertY: true }).padInvertY).toBe(true);

    const storage = fakeStorage();
    saveSettings(storage, { ...DEFAULT_SETTINGS, padSensitivity: 1.7, padInvertY: true });
    expect(JSON.parse(storage.data.get(SETTINGS_STORAGE_KEY) ?? '')).toMatchObject({
      padSensitivity: 1.7,
      padInvertY: true,
    });
    expect(loadSettings(storage)).toMatchObject({ padSensitivity: 1.7, padInvertY: true });
  });

  it('Phase 5 AC1.8: the stored text of a player who never changed them stays the same', () => {
    const stored = '{"renderDistance":5,"mouseSensitivity":1.5,"fov":90,"brightness":0.8}';
    const storage = fakeStorage(stored);
    expect(loadSettings(storage)).toMatchObject({ padSensitivity: 1, padInvertY: false });
    saveSettings(storage, loadSettings(storage));
    expect(storage.data.get(SETTINGS_STORAGE_KEY)).toBe(stored);
    saveSettings(storage, { ...loadSettings(storage), padInvertY: false, padSensitivity: 1 });
    expect(storage.data.get(SETTINGS_STORAGE_KEY)).toBe(stored);
  });

  it('survives corrupt or unavailable storage', () => {
    expect(loadSettings(fakeStorage('{not json'))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(fakeStorage('"a string"'))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(fakeStorage('{"fov": 100}'))).toEqual({ ...DEFAULT_SETTINGS, fov: 100 });
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    const throwing: SettingsStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
    expect(hasStoredSettings(throwing)).toBe(false);
    expect(hasStoredSettings(null)).toBe(false);
    expect(() => saveSettings(throwing, DEFAULT_SETTINGS)).not.toThrow();
    expect(() => saveSettings(null, DEFAULT_SETTINGS)).not.toThrow();
  });
});
