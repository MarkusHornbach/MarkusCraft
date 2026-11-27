// The "Map" tab of the inventory screen (Phase 8 part B1): north-up, the loaded terrain as a
// background, rings, the radar's veins and a legend. Nothing in it takes the focus.
import { CHUNK_SIZE, RADAR_FAR_RADIUS, RADAR_PLACE_FAR_RADIUS, RADAR_RADIUS } from '../game/config';
import { RADAR_KINDS, type RadarKind } from '../radar/kinds';
import { legendText, mapColour, shadeColour, surfaceShade, topBlockOf } from '../radar/map';
import { hintLabel, type RadarScan } from '../radar/scan';
import type { Chunk } from '../world/chunk';
import { chunkKey } from '../world/chunk';
import type { World } from '../world/World';
import { element } from './activate';
import { css, drawArrow, drawHint, drawSymbol, fitCanvas } from './radarDraw';

/** One chunk of the background: 16 × 16 pixels, and the chunk it was made from. */
interface Tile {
  canvas: HTMLCanvasElement;
  chunk: Chunk;
}

const RINGS = [16, 32, 48];
/** The legend keeps at least this width beside the square map (CSS pixels). */
const LEGEND_MIN_PX = 200;
/** On a phone the header and the legend share a column beside the map at least this wide. */
const SIDE_MIN_PX = 250;
/** The map's edge at which symbols and labels have their base size (B1's map). */
const BASE_PX = 284;

export class MapTab {
  readonly element: HTMLElement;
  private readonly locked: HTMLElement;
  private readonly lockText: HTMLElement;
  private readonly body: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly legend: HTMLElement;
  private readonly legendRows: HTMLElement[] = [];
  private readonly legendTextNodes: HTMLElement[] = [];
  private readonly tiles = new Map<string, Tile>();
  private world: World | null = null;
  /** The texts of the legend and the veins drawn last (the test API). */
  legendTexts: string[] = [];
  entries: RadarScan['entries'] = [];
  draws = 0;
  isLocked = true;

  constructor(parent: HTMLElement) {
    this.element = element('div', 'map-tab');
    this.element.setAttribute('role', 'region');
    this.element.setAttribute('aria-label', 'Map');
    this.locked = element('div', 'map-locked');
    this.locked.appendChild(element('div', 'map-locked-title', 'Map · Locked'));
    this.lockText = element('div', 'map-locked-text', '');
    this.locked.appendChild(this.lockText);
    this.body = element('div', 'map-body');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'map-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.legend = element('div', 'map-legend');
    for (const kind of RADAR_KINDS) {
      const row = element('div', 'map-legend-row');
      row.dataset.kind = kind.key;
      const symbol = document.createElement('canvas');
      symbol.className = 'map-legend-symbol';
      const scale = fitCanvas(symbol, 16, 16);
      const ctx = symbol.getContext('2d');
      if (ctx) {
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        drawSymbol(ctx, kind, 8, 8, 5);
      }
      const text = element('span', 'map-legend-text', kind.label);
      row.append(symbol, text);
      this.legend.appendChild(row);
      this.legendRows.push(row);
      this.legendTextNodes.push(text);
    }
    this.body.append(this.canvas, this.legend);
    this.element.append(this.locked, this.body);
    parent.appendChild(this.element);
    this.setLocked(true, '');
  }

  /** Locked: the lock text and no canvas. */
  setLocked(locked: boolean, text: string): void {
    this.isLocked = locked;
    this.locked.hidden = !locked;
    this.body.hidden = locked;
    if (this.lockText.textContent !== text) this.lockText.textContent = text;
  }

  /** The world whose loaded chunks make the background. */
  setWorld(world: World): void {
    if (world !== this.world) this.clear();
    this.world = world;
  }

  /** Drops the background cache (the inventory closed, another world). */
  clear(): void {
    this.tiles.clear();
    this.world = null;
  }

  /** Blocks changed: their chunks' tiles are made again at the next draw. */
  noteBlocks(changes: readonly { x: number; z: number }[]): void {
    for (const { x, z } of changes) {
      this.tiles.delete(chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)));
    }
  }

  /**
   * Draws the scan of `kinds` north-up. The canvas is the largest square the tab holds
   * beside the legend; symbols and labels grow with it.
   */
  draw(
    scan: RadarScan,
    yaw: number,
    feet: { x: number; y: number; z: number },
    kinds: readonly RadarKind[],
  ): void {
    this.draws++;
    this.entries = scan.entries;
    this.updateLegend(scan, kinds);
    const size = this.squareSize();
    const px = `${size}px`;
    if (this.canvas.style.width !== px) {
      this.canvas.style.width = px;
      this.canvas.style.height = px;
    }
    const unit = Math.max(1, Math.min(2.2, size / BASE_PX));
    const scale = fitCanvas(this.canvas, size, size);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = '#10141c';
    ctx.fillRect(0, 0, size, size);
    const c = size / 2;
    const k = c / RADAR_RADIUS;
    // World x, z → canvas: north (−Z) up, the feet cell's centre in the middle.
    const sx = (x: number) => c + (x - feet.x - 0.5) * k;
    const sz = (z: number) => c + (z - feet.z - 0.5) * k;
    this.drawBackground(ctx, feet, sx, sz, k);

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    for (const ring of RINGS) {
      ctx.beginPath();
      ctx.arc(c, c, ring * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    const order = scan.entries
      .map((_, i) => i)
      .sort((a, b) => scan.entries[a].dist - scan.entries[b].dist);
    const spot = (i: number) => ({
      x: c + scan.entries[i].dx * k,
      y: c + scan.entries[i].dz * k,
    });
    for (const i of [...order].reverse()) {
      const kind = RADAR_KINDS.find((kd) => kd.key === scan.entries[i].kind);
      const p = spot(i);
      if (kind) drawSymbol(ctx, kind, p.x, p.y, 5 * unit);
    }
    const font = Math.round(12 * unit);
    const fit = (x: number, w: number) => Math.min(x, size - 4 - w);
    ctx.font = `700 ${font}px system-ui, sans-serif`;
    const labels: { x: number; y: number; w: number }[] = [];
    for (const i of order) {
      const text = hintLabel(scan.entries[i].hint);
      if (text === '') continue;
      const p = spot(i);
      const w = ctx.measureText(text).width;
      const x = fit(p.x + font * 0.6, w);
      if (labels.some((l) => x < l.x + l.w + 2 && l.x < x + w + 2 && Math.abs(l.y - p.y) < font))
        continue;
      labels.push({ x, y: p.y, w });
      drawHint(ctx, text, p.x, p.y, font, fit);
    }
    for (const beyond of scan.beyond) {
      const kind = RADAR_KINDS.find((kd) => kd.key === beyond.kind);
      if (!kind) continue;
      const angle = Math.atan2(beyond.dx, -beyond.dz);
      const at = RADAR_RADIUS * k - 8 * unit;
      drawArrow(
        ctx,
        c + Math.sin(angle) * at,
        c - Math.cos(angle) * at,
        angle,
        7 * unit,
        css(kind.colour),
        css(kind.rim),
      );
    }
    // The player: an arrow turned by the yaw (forward is (−sin yaw, −cos yaw)).
    drawArrow(ctx, c, c, -yaw, 8 * unit, '#ffffff', 'rgba(0, 0, 0, 0.8)');
    ctx.font = `700 ${Math.round(11 * unit)}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillText('N', c, 3);
    ctx.textAlign = 'start';
  }

  /**
   * The largest square for the map: the tab's height beside the legend, or on a phone (the
   * tab lays its parts into the panel's grid) the panel's height beside the side column.
   */
  private squareSize(): number {
    const panel = this.element.parentElement;
    let height = this.body.clientHeight;
    let width = this.body.clientWidth - LEGEND_MIN_PX - gapOf(this.body);
    if (panel && getComputedStyle(this.body).display === 'contents') {
      const style = getComputedStyle(panel);
      height = panel.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      width =
        panel.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        SIDE_MIN_PX -
        gapOf(panel);
    }
    return Math.max(1, Math.floor(Math.min(height, width)));
  }

  /** One row per kind shown (the place rows only in worlds with places). */
  private updateLegend(scan: RadarScan, kinds: readonly RadarKind[]): void {
    const texts: string[] = [];
    RADAR_KINDS.forEach((kind, i) => {
      const shown = kinds.includes(kind);
      const row = this.legendRows[i];
      if (row.hidden === shown) row.hidden = !shown;
      if (!shown) return;
      const nearest = scan.entries.find((e) => e.kind === kind.key) ?? null;
      const beyond = scan.beyond.find((b) => b.kind === kind.key) ?? null;
      const far = kind.category === 'place' ? RADAR_PLACE_FAR_RADIUS : RADAR_FAR_RADIUS;
      const text = legendText(kind, nearest, beyond, far);
      const node = this.legendTextNodes[i];
      if (node.textContent !== text) node.textContent = text;
      texts.push(text);
    });
    this.legendTexts = texts;
  }

  /** The loaded chunks' tiles; unloaded chunks stay dark. */
  private drawBackground(
    ctx: CanvasRenderingContext2D,
    feet: { x: number; z: number },
    sx: (x: number) => number,
    sz: (z: number) => number,
    k: number,
  ): void {
    const world = this.world;
    if (!world) return;
    ctx.imageSmoothingEnabled = false;
    const reach = RADAR_RADIUS + CHUNK_SIZE;
    const c0x = Math.floor((feet.x - reach) / CHUNK_SIZE);
    const c1x = Math.floor((feet.x + reach) / CHUNK_SIZE);
    const c0z = Math.floor((feet.z - reach) / CHUNK_SIZE);
    const c1z = Math.floor((feet.z + reach) / CHUNK_SIZE);
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const chunk = world.getChunk(cx, cz);
        if (!chunk) continue;
        const key = chunkKey(cx, cz);
        let tile = this.tiles.get(key);
        if (!tile || tile.chunk !== chunk) {
          tile = { canvas: tileOf(chunk), chunk };
          this.tiles.set(key, tile);
        }
        const x = sx(cx * CHUNK_SIZE);
        const z = sz(cz * CHUNK_SIZE);
        ctx.drawImage(tile.canvas, x, z, CHUNK_SIZE * k + 0.5, CHUNK_SIZE * k + 0.5);
      }
    }
  }
}

/** A chunk's top blocks as 16 × 16 pixels: colour by block, lighter with height. */
function tileOf(chunk: Chunk): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CHUNK_SIZE;
  canvas.height = CHUNK_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const image = ctx.createImageData(CHUNK_SIZE, CHUNK_SIZE);
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const top = topBlockOf(chunk.blocks, lx, lz);
      const colour =
        top < 0 ? 0x10141c : shadeColour(mapColour(top & 0xff), surfaceShade(top >> 8));
      const i = (lx + lz * CHUNK_SIZE) * 4;
      image.data[i] = (colour >> 16) & 0xff;
      image.data[i + 1] = (colour >> 8) & 0xff;
      image.data[i + 2] = colour & 0xff;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function gapOf(node: HTMLElement): number {
  return parseFloat(getComputedStyle(node).columnGap) || 0;
}
