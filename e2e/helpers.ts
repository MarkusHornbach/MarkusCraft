// Pixel helpers for rule-based visual checks: decode screenshots in Node and measure them.
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';

export interface Image {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export async function capture(page: Page): Promise<Image> {
  const png = PNG.sync.read(await page.screenshot());
  return { width: png.width, height: png.height, data: png.data };
}

/** A centred region covering `fraction` of the width and height. */
export function centerRegion(img: Image, fraction = 0.2): Region {
  const width = Math.round(img.width * fraction);
  const height = Math.round(img.height * fraction);
  return {
    x: Math.round((img.width - width) / 2),
    y: Math.round((img.height - height) / 2),
    width,
    height,
  };
}

export function fullRegion(img: Image): Region {
  return { x: 0, y: 0, width: img.width, height: img.height };
}

export function meanColor(img: Image, region: Region = fullRegion(img)): Rgb {
  let r = 0;
  let g = 0;
  let b = 0;
  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      const i = (y * img.width + x) * 4;
      r += img.data[i];
      g += img.data[i + 1];
      b += img.data[i + 2];
    }
  }
  const n = region.width * region.height;
  return { r: r / n, g: g / n, b: b / n };
}

export function luminance(c: Rgb): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

export function meanLuminance(img: Image, region: Region = fullRegion(img)): number {
  return luminance(meanColor(img, region));
}

export function colorDistance(a: Rgb, b: Rgb): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

export interface ColorStats {
  distinct: number;
  /** Share of the most frequent colour, 0..1. */
  maxShare: number;
}

export function colorStats(img: Image): ColorStats {
  const counts = new Map<number, number>();
  const n = img.width * img.height;
  let max = 0;
  for (let i = 0; i < n; i++) {
    const key = (img.data[i * 4] << 16) | (img.data[i * 4 + 1] << 8) | img.data[i * 4 + 2];
    const c = (counts.get(key) ?? 0) + 1;
    counts.set(key, c);
    if (c > max) max = c;
  }
  return { distinct: counts.size, maxShare: max / n };
}

/** The "frame is not blank" rule from the phase plan (section 5.4). */
export function isNotBlank(img: Image): boolean {
  const stats = colorStats(img);
  return stats.distinct > 50 && stats.maxShare <= 0.6;
}

/** Fraction of pixels in the region for which the predicate holds. */
export function shareOf(
  img: Image,
  predicate: (r: number, g: number, b: number) => boolean,
  region: Region = fullRegion(img),
): number {
  let hits = 0;
  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      const i = (y * img.width + x) * 4;
      if (predicate(img.data[i], img.data[i + 1], img.data[i + 2])) hits++;
    }
  }
  return hits / (region.width * region.height);
}

/** Fraction of pixels in the region that differ noticeably between two images. */
export function diffShare(a: Image, b: Image, region: Region = fullRegion(a), tolerance = 24) {
  let hits = 0;
  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      const i = (y * a.width + x) * 4;
      const d =
        Math.abs(a.data[i] - b.data[i]) +
        Math.abs(a.data[i + 1] - b.data[i + 1]) +
        Math.abs(a.data[i + 2] - b.data[i + 2]);
      if (d > tolerance) hits++;
    }
  }
  return hits / (region.width * region.height);
}
