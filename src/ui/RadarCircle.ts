// The radar circle (Phase 8 part B1): heading-up, top-right, part of the HUD. No pointer, no focus.
import { RADAR_CIRCLE_PX, RADAR_CIRCLE_TOUCH_PX, RADAR_RADIUS } from '../game/config';
import type { RadarKind } from '../radar/kinds';
import { hintLabel, type RadarScan } from '../radar/scan';
import { css, drawArrow, drawHint, drawSymbol, fitCanvas } from './radarDraw';

/** Where a vein was drawn, relative to the circle's centre in CSS pixels (y down). */
export interface ScreenSpot {
  x: number;
  y: number;
}

export class RadarCircle {
  readonly element: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private touch = false;

  constructor(parent: HTMLElement) {
    this.element = document.createElement('canvas');
    this.element.className = 'radar-circle';
    this.element.hidden = true;
    this.element.setAttribute('aria-hidden', 'true');
    this.ctx = this.element.getContext('2d');
    parent.appendChild(this.element);
  }

  setTouch(touch: boolean): void {
    this.touch = touch;
    this.element.classList.toggle('touch', touch);
  }

  get size(): number {
    return this.touch ? RADAR_CIRCLE_TOUCH_PX : RADAR_CIRCLE_PX;
  }

  setShown(shown: boolean): void {
    if (this.element.hidden === shown) this.element.hidden = !shown;
  }

  get shown(): boolean {
    return !this.element.hidden;
  }

  /**
   * Draws the scan heading-up for the view direction `yaw` (forward is up), only the veins
   * of `kinds`. Returns where each entry of the scan was drawn (null: a kind not shown).
   */
  draw(scan: RadarScan, yaw: number, kinds: readonly RadarKind[]): (ScreenSpot | null)[] {
    const size = this.size;
    const scale = fitCanvas(this.element, size, size);
    const spots: (ScreenSpot | null)[] = scan.entries.map(() => null);
    const ctx = this.ctx;
    if (!ctx) return spots;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const c = size / 2;
    const rim = c - 3;
    const reach = rim - 6;

    ctx.beginPath();
    ctx.arc(c, c, rim, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16, 20, 28, 0.6)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c, c, reach / 2, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.stroke();
    // "Ahead": a small triangle at the top of the rim.
    ctx.beginPath();
    ctx.moveTo(c, 1);
    ctx.lineTo(c + 5, 9);
    ctx.lineTo(c - 5, 9);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fill();

    // Heading-up: forward (-sin yaw, -cos yaw) points up, right (cos yaw, -sin yaw) right.
    // The distance is drawn on a cube-root scale, so the near veins, which matter most,
    // spread out; the rim is RADAR_RADIUS.
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const toScreen = (dx: number, dz: number): ScreenSpot => {
      const h = Math.hypot(dx, dz);
      const f = h === 0 ? 0 : (reach * Math.cbrt(Math.min(1, h / RADAR_RADIUS))) / h;
      return { x: (dx * cos - dz * sin) * f, y: (dx * sin + dz * cos) * f };
    };
    const keys = new Set(kinds.map((kind) => kind.key));
    const fit = (x: number, width: number): number => Math.min(x, size - 4 - width);
    const font = this.touch ? 10 : 11;
    const r = this.touch ? 4 : 5;
    const drawn: number[] = [];
    for (let i = 0; i < scan.entries.length; i++) {
      const entry = scan.entries[i];
      if (!keys.has(entry.kind)) continue;
      spots[i] = toScreen(entry.dx, entry.dz);
      drawn.push(i);
    }
    // Symbols farthest first, so the nearest lies on top; labels nearest first, and a label
    // that would cover one already written is left out.
    drawn.sort((a, b) => scan.entries[a].dist - scan.entries[b].dist);
    for (const i of [...drawn].reverse()) {
      const kind = kinds.find((kd) => kd.key === scan.entries[i].kind);
      const spot = spots[i];
      if (kind && spot) drawSymbol(ctx, kind, c + spot.x, c + spot.y, r);
    }
    const labels: { x: number; y: number; w: number }[] = [];
    ctx.font = `700 ${font}px system-ui, sans-serif`;
    for (const i of drawn) {
      const spot = spots[i];
      const text = hintLabel(scan.entries[i].hint);
      if (!spot || text === '') continue;
      const w = ctx.measureText(text).width;
      const x = fit(c + spot.x + font * 0.6, w);
      const y = c + spot.y;
      if (labels.some((l) => x < l.x + l.w + 2 && l.x < x + w + 2 && Math.abs(l.y - y) < font))
        continue;
      labels.push({ x, y, w });
      drawHint(ctx, text, c + spot.x, y, font, fit);
    }
    for (const beyond of scan.beyond) {
      const kind = kinds.find((kd) => kd.key === beyond.kind);
      if (!kind) continue;
      const spot = toScreen(beyond.dx, beyond.dz);
      const angle = Math.atan2(spot.x, -spot.y);
      const at = rim - 7;
      drawArrow(
        ctx,
        c + Math.sin(angle) * at,
        c - Math.cos(angle) * at,
        angle,
        6,
        css(kind.colour),
        css(kind.rim),
      );
    }
    drawArrow(ctx, c, c, 0, 6, '#ffffff', 'rgba(0, 0, 0, 0.7)');
    return spots;
  }
}
