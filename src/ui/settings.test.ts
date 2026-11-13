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
    });
    expect(SETTINGS_STORAGE_KEY).toBe('markuscraft.settings.v1');
  });

  it('validates and clamps values', () => {
    expect(validateSettings({ renderDistance: 2, mouseSensitivity: 2.5, fov: 110 })).toEqual({
      renderDistance: 2,
      mouseSensitivity: 2.5,
      fov: 110,
      touchSensitivity: 1,
    });
    expect(validateSettings({ renderDistance: 99, mouseSensitivity: 0, fov: 10 })).toEqual({
      renderDistance: 16,
      mouseSensitivity: 0.2,
      fov: 60,
      touchSensitivity: 1,
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
    const chosen = { renderDistance: 5, mouseSensitivity: 1.5, fov: 90, touchSensitivity: 1 };
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
      ...chosen,
      touchSensitivity: 2.5,
    });
    expect(loadSettings(storage).touchSensitivity).toBe(2.5);
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
