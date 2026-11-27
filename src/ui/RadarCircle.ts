// The radar circle (Phase 8 part B1): heading-up, top-right, part of the HUD. No pointer, no focus.
import {
  RADAR_CIRCLE_SIZES_PX,
  RADAR_CIRCLE_TOUCH_SIZES_PX,
  RADAR_RADIUS,
  RADAR_SIZE_DEFAULT,
} from '../game/config';
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
  /** The setting "Radar circle size": 0 Small, 1 Medium, 2 Large. */
  private sizeIndex = RADAR_SIZE_DEFAULT;
  /** On touch: the most room below the bag button that leaves the buttons free (px). */
  private room = Infinity;
  private measureRoom: (() => number | null) | null = null;

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
    this.refit();
  }

  /** The setting "Radar circle size" (0 Small, 1 Medium, 2 Large). */
  setSize(index: number): void {
    this.sizeIndex = index;
    this.applySize();
  }

  /**
   * How the touch layout's free room below the bag button is measured (null: not known
   * now, the last value stays). A larger setting never covers a button: on a small phone
   * the circle takes the room there is, never less than Small.
   */
  setRoomMeasure(measure: () => number | null): void {
    this.measureRoom = measure;
    this.refit();
  }

  /** Measures the room again (the view changed size). */
  refit(): void {
    const room = this.touch ? (this.measureRoom?.() ?? null) : null;
    if (room !== null) this.room = room;
    this.applySize();
  }

  /** The edge in CSS pixels. */
  get size(): number {
    return this.sizeFor(this.sizeIndex);
  }

  /** The edge a size setting gives in the current input mode and layout. */
  sizeFor(index: number): number {
    if (!this.touch) return RADAR_CIRCLE_SIZES_PX[clampIndex(index)];
    const wanted = RADAR_CIRCLE_TOUCH_SIZES_PX[clampIndex(index)];
    const room = Math.floor(Math.min(wanted, this.room));
    return Math.max(RADAR_CIRCLE_TOUCH_SIZES_PX[0], room);
  }

  private applySize(): void {
    const px = `${this.size}px`;
    if (this.element.style.width !== px) {
      this.element.style.width = px;
      this.element.style.height = px;
    }
  }

  setShown(shown: boolean): void {
    if (this.element.hidden === shown) this.element.hidden = !shown;
    if (shown) this.refit();
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
    // Symbols and labels grow with the circle (Small is B1's size).
    const unit = size / (this.touch ? RADAR_CIRCLE_TOUCH_SIZES_PX[0] : RADAR_CIRCLE_SIZES_PX[0]);
    const grow = Math.sqrt(unit);
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
    ctx.lineTo(c + 5 * grow, 1 + 8 * grow);
    ctx.lineTo(c - 5 * grow, 1 + 8 * grow);
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
    const font = Math.round((this.touch ? 10 : 11) * grow);
    const r = (this.touch ? 4 : 5) * grow;
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
      const at = rim - 7 * grow;
      drawArrow(
        ctx,
        c + Math.sin(angle) * at,
        c - Math.cos(angle) * at,
        angle,
        6 * grow,
        css(kind.colour),
        css(kind.rim),
      );
    }
    drawArrow(ctx, c, c, 0, 6 * grow, '#ffffff', 'rgba(0, 0, 0, 0.7)');
    return spots;
  }
}

function clampIndex(index: number): number {
  return Math.max(0, Math.min(RADAR_CIRCLE_SIZES_PX.length - 1, Math.round(index)));
}
