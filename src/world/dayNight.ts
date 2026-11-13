// Day/night model: time of day → sun position, sky colours and world brightness. Pure.
import { DAYLIGHT_MIN, DAY_LENGTH_SECONDS } from '../game/config';
import { smoothstep } from '../util/math';

export type Rgb = [number, number, number];

export interface SkyColors {
  /** Display-space (sRGB) colours, components in 0..1. */
  zenith: Rgb;
  horizon: Rgb;
}

/** The sun's arc is tilted this far from the vertical, towards +Z (south). */
export const SUN_TILT = (30 * Math.PI) / 180;

const DAY: SkyColors = { zenith: [0.3, 0.55, 0.9], horizon: [0.74, 0.85, 0.96] };
const NIGHT: SkyColors = { zenith: [0.015, 0.025, 0.07], horizon: [0.05, 0.07, 0.14] };
const SUNRISE: SkyColors = { zenith: [0.34, 0.44, 0.7], horizon: [0.98, 0.7, 0.48] };
const SUNSET: SkyColors = { zenith: [0.3, 0.3, 0.56], horizon: [0.98, 0.54, 0.32] };

/** Wraps any number into [0, 1). */
export function wrapTime(t: number): number {
  return ((t % 1) + 1) % 1;
}

/** Advances the time of day by `dt` seconds of real time. */
export function advanceTime(t: number, dt: number, freeze: boolean): number {
  if (freeze) return t;
  return wrapTime(t + dt / DAY_LENGTH_SECONDS);
}

/** Sine of the sun's elevation: 0 at sunrise (t = 0), 1 at noon, 0 at sunset, -1 at midnight. */
export function sunHeight(t: number): number {
  return Math.sin(t * Math.PI * 2);
}

/** Unit vector towards the sun: rises in the east (+X), sets in the west. */
export function sunDirection(t: number): Rgb {
  const angle = t * Math.PI * 2;
  const up = Math.sin(angle);
  return [Math.cos(angle), up * Math.cos(SUN_TILT), up * Math.sin(SUN_TILT)];
}

/** The moon is always opposite the sun. */
export function moonDirection(t: number): Rgb {
  const [x, y, z] = sunDirection(t);
  return [-x, -y, -z];
}

/** World brightness: 1 by day, `DAYLIGHT_MIN` by night, blended smoothly at dusk and dawn. */
export function daylightFactor(t: number): number {
  return DAYLIGHT_MIN + (1 - DAYLIGHT_MIN) * smoothstep(-0.25, 0.35, sunHeight(t));
}

/** 0 by day, 1 at night. */
export function starVisibility(t: number): number {
  return 1 - smoothstep(-0.6, 0, sunHeight(t));
}

function blend(out: Rgb, colour: Rgb, weight: number): void {
  out[0] += colour[0] * weight;
  out[1] += colour[1] * weight;
  out[2] += colour[2] * weight;
}

/** Sky gradient colours, interpolated between the day, night, sunrise and sunset key frames. */
export function skyColors(t: number): SkyColors {
  const h = sunHeight(t);
  const day = smoothstep(0, 0.55, h);
  const night = smoothstep(0, 0.55, -h);
  // Twilight peaks when the sun is on the horizon. Morning and evening use different
  // keys; the switch between them happens at noon and midnight, where the weight is 0.
  const twilight = 1 - day - night;
  const morning = Math.cos(t * Math.PI * 2) > 0;
  const key = morning ? SUNRISE : SUNSET;
  const zenith: Rgb = [0, 0, 0];
  const horizon: Rgb = [0, 0, 0];
  blend(zenith, DAY.zenith, day);
  blend(zenith, NIGHT.zenith, night);
  blend(zenith, key.zenith, twilight);
  blend(horizon, DAY.horizon, day);
  blend(horizon, NIGHT.horizon, night);
  blend(horizon, key.horizon, twilight);
  return { zenith, horizon };
}
