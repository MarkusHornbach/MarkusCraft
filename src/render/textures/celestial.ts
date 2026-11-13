// Procedural sun and moon images (RGBA, row 0 at the bottom). Original designs.
import { type Rng } from '../../util/rng';

/** A warm disc with a bright core, a soft halo and eight faint rays. */
export function paintSun(size: number): Uint8Array<ArrayBuffer> {
  const px = new Uint8Array(size * size * 4);
  const centre = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - centre) / centre;
      const dy = (y - centre) / centre;
      const d = Math.hypot(dx, dy);
      const disc = d < 0.42 ? 1 : Math.max(0, 1 - (d - 0.42) / 0.06);
      const halo = Math.max(0, 1 - d) ** 2 * 0.55;
      const rays = Math.max(0, Math.cos(Math.atan2(dy, dx) * 8)) ** 6 * Math.max(0, 1 - d) * 0.3;
      const alpha = Math.min(1, disc + halo + rays);
      const i = (y * size + x) * 4;
      // Core nearly white, rim and halo more yellow-orange.
      px[i] = 255;
      px[i + 1] = Math.round(232 + 18 * disc - 30 * (1 - disc) * Math.min(1, d));
      px[i + 2] = Math.round(150 + 80 * disc * Math.max(0, 1 - d * 2));
      px[i + 3] = Math.round(alpha * 255);
    }
  }
  return px;
}

/** A pale disc with soft craters and a gently shaded limb. */
export function paintMoon(size: number, rng: Rng): Uint8Array<ArrayBuffer> {
  const px = new Uint8Array(size * size * 4);
  const centre = (size - 1) / 2;
  const craters: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const angle = rng() * Math.PI * 2;
    const distance = Math.sqrt(rng()) * 0.6;
    craters.push({
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      r: 0.06 + rng() * 0.12,
    });
  }
  const radius = 0.8;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - centre) / centre;
      const dy = (y - centre) / centre;
      const d = Math.hypot(dx, dy);
      const i = (y * size + x) * 4;
      if (d > radius + 0.03) continue;
      // Limb darkening plus a soft light direction from the upper left.
      let shade = 1 - 0.25 * (d / radius) ** 3 + 0.06 * (-dx + dy);
      for (const crater of craters) {
        const cd = Math.hypot(dx - crater.x, dy - crater.y) / crater.r;
        if (cd < 1) shade -= 0.16 * (1 - cd * cd);
        else if (cd < 1.25) shade += 0.05;
      }
      px[i] = Math.round(Math.min(255, 222 * shade));
      px[i + 1] = Math.round(Math.min(255, 228 * shade));
      px[i + 2] = Math.round(Math.min(255, 240 * shade));
      px[i + 3] = Math.round(255 * Math.min(1, Math.max(0, (radius + 0.03 - d) / 0.03)));
    }
  }
  return px;
}
