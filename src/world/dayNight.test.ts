import { describe, expect, it } from 'vitest';
import { DAY_LENGTH_SECONDS, SIM_DT, START_TIME_OF_DAY } from '../game/config';
import {
  advanceTime,
  daylightFactor,
  moonDirection,
  skyColors,
  starVisibility,
  sunDirection,
  sunHeight,
  wrapTime,
} from './dayNight';

const STEP = 0.001;

describe('day/night model (AC10.1)', () => {
  it('has continuous sky colours and daylight, including the wrap from 1 to 0', () => {
    for (let i = 0; i <= 1000; i++) {
      const a = wrapTime(i * STEP);
      const b = wrapTime((i + 1) * STEP);
      expect(Math.abs(daylightFactor(a) - daylightFactor(b))).toBeLessThan(0.02);
      expect(Math.abs(starVisibility(a) - starVisibility(b))).toBeLessThan(0.02);
      const ca = skyColors(a);
      const cb = skyColors(b);
      for (let c = 0; c < 3; c++) {
        expect(Math.abs(ca.zenith[c] - cb.zenith[c])).toBeLessThan(0.02);
        expect(Math.abs(ca.horizon[c] - cb.horizon[c])).toBeLessThan(0.02);
      }
    }
    // Directly across the wrap.
    expect(Math.abs(daylightFactor(0.99999) - daylightFactor(0))).toBeLessThan(0.001);
    expect(Math.abs(skyColors(0.99999).horizon[0] - skyColors(0).horizon[0])).toBeLessThan(0.001);
  });

  it('is fully bright at noon and at the minimum at midnight', () => {
    expect(daylightFactor(0.25)).toBe(1);
    expect(daylightFactor(0.75)).toBe(0.25);
    for (let i = 0; i < 1000; i++) {
      const f = daylightFactor(i * STEP);
      expect(f).toBeGreaterThanOrEqual(0.25);
      expect(f).toBeLessThanOrEqual(1);
    }
    // The start time is a bright morning.
    expect(daylightFactor(START_TIME_OF_DAY)).toBeGreaterThan(0.9);
  });

  it('puts the sun highest at noon with the moon opposite', () => {
    let best = 0;
    for (let i = 0; i < 1000; i++) {
      if (sunDirection(i * STEP)[1] > sunDirection(best)[1]) best = i * STEP;
    }
    expect(best).toBeCloseTo(0.25, 6);
    expect(sunHeight(0.25)).toBeCloseTo(1, 10);
    expect(sunHeight(0)).toBeCloseTo(0, 10);
    expect(sunHeight(0.5)).toBeCloseTo(0, 10);
    expect(sunHeight(0.75)).toBeCloseTo(-1, 10);
    for (const t of [0, 0.1, 0.25, 0.4, 0.5, 0.75, 0.9]) {
      const sun = sunDirection(t);
      const moon = moonDirection(t);
      expect(Math.hypot(...sun)).toBeCloseTo(1, 10);
      for (let c = 0; c < 3; c++) expect(moon[c]).toBeCloseTo(-sun[c], 10);
    }
    // Sunrise in the east (+X), sunset in the west (-X).
    expect(sunDirection(0)[0]).toBeCloseTo(1, 10);
    expect(sunDirection(0.5)[0]).toBeCloseTo(-1, 10);
    expect(moonDirection(0.75)[1]).toBeGreaterThan(0.8);
  });

  it('shows stars only at night', () => {
    expect(starVisibility(0.25)).toBe(0);
    expect(starVisibility(0.1)).toBe(0);
    expect(starVisibility(0.75)).toBe(1);
  });

  it('uses plausible key colours', () => {
    const noon = skyColors(0.25);
    expect(noon.zenith[2]).toBeGreaterThan(noon.zenith[0] + 0.3);
    const midnight = skyColors(0.75);
    expect(Math.max(...midnight.zenith)).toBeLessThan(0.1);
    // Warm horizon at sunrise and sunset, and the two differ.
    const sunrise = skyColors(0);
    const sunset = skyColors(0.5);
    expect(sunrise.horizon[0]).toBeGreaterThan(sunrise.horizon[2] + 0.3);
    expect(sunset.horizon[0]).toBeGreaterThan(sunset.horizon[2] + 0.3);
    expect(sunrise.horizon[1]).not.toBeCloseTo(sunset.horizon[1], 2);
    for (const t of [0, 0.13, 0.25, 0.5, 0.62, 0.75]) {
      const colours = skyColors(t);
      for (const value of [...colours.zenith, ...colours.horizon]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('clock (AC10.2)', () => {
  it('advances by exactly one cycle in 20 minutes of steps', () => {
    const steps = DAY_LENGTH_SECONDS / SIM_DT;
    expect(DAY_LENGTH_SECONDS).toBe(20 * 60);
    let t = 0.1;
    let wraps = 0;
    for (let i = 0; i < steps; i++) {
      const next = advanceTime(t, SIM_DT, false);
      if (next < t) wraps++;
      t = next;
    }
    expect(wraps).toBe(1);
    expect(t).toBeCloseTo(0.1, 9);
    // Half the steps move the clock by half a cycle.
    let half = 0.1;
    for (let i = 0; i < steps / 2; i++) half = advanceTime(half, SIM_DT, false);
    expect(half).toBeCloseTo(0.6, 9);
  });

  it('does not advance while frozen', () => {
    let t = 0.3;
    for (let i = 0; i < 1000; i++) t = advanceTime(t, SIM_DT, true);
    expect(t).toBe(0.3);
  });

  it('wraps times into [0, 1)', () => {
    expect(wrapTime(1.25)).toBeCloseTo(0.25, 12);
    expect(wrapTime(-0.25)).toBeCloseTo(0.75, 12);
    expect(wrapTime(1)).toBe(0);
  });
});
