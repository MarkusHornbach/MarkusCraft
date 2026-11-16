// Controller glyphs drawn on canvases: neutral letters and plain shapes, light on dark, in
// no vendor's colours or style.

export type GlyphName =
  | 'A'
  | 'B'
  | 'X'
  | 'Y'
  | 'LB'
  | 'RB'
  | 'LT'
  | 'RT'
  | 'LS'
  | 'RS'
  | 'LS-click'
  | 'RS-click'
  | 'dpad'
  | 'dpad-up'
  | 'dpad-down'
  | 'dpad-left'
  | 'dpad-right'
  | 'dpad-horizontal'
  | 'dpad-vertical'
  | 'start';

/** Every glyph, in the order of the reference sheet. */
export const GLYPH_NAMES: readonly GlyphName[] = [
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'LT',
  'RT',
  'LS',
  'RS',
  'LS-click',
  'RS-click',
  'dpad',
  'dpad-up',
  'dpad-down',
  'dpad-left',
  'dpad-right',
  'dpad-horizontal',
  'dpad-vertical',
  'start',
];

/** How a screen reader names each glyph. */
const LABELS: Record<GlyphName, string> = {
  A: 'A',
  B: 'B',
  X: 'X',
  Y: 'Y',
  LB: 'LB',
  RB: 'RB',
  LT: 'LT',
  RT: 'RT',
  LS: 'Left stick',
  RS: 'Right stick',
  'LS-click': 'Left stick click',
  'RS-click': 'Right stick click',
  dpad: 'D-pad',
  'dpad-up': 'D-pad up',
  'dpad-down': 'D-pad down',
  'dpad-left': 'D-pad left',
  'dpad-right': 'D-pad right',
  'dpad-horizontal': 'D-pad left and right',
  'dpad-vertical': 'D-pad up and down',
  start: 'Start',
};

const FILL = '#1b2230';
const LINE = '#eef2f6';
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Width of a glyph in units of its height. */
function widthOf(name: GlyphName): number {
  if (name === 'LB' || name === 'RB' || name === 'LT' || name === 'RT') return 1.6;
  if (name === 'start') return 1.5;
  return 1;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  ctx.fillStyle = LINE;
  ctx.font = `bold ${Math.round(size)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + size * 0.05);
}

/** Fills the current path dark and strokes it light. */
function shape(ctx: CanvasRenderingContext2D, line: number): void {
  ctx.fillStyle = FILL;
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = line;
  ctx.stroke();
}

function drawFace(ctx: CanvasRenderingContext2D, name: string, s: number): void {
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.43, 0, Math.PI * 2);
  shape(ctx, s * 0.07);
  label(ctx, name, s / 2, s / 2, s * 0.5);
}

function drawBumper(ctx: CanvasRenderingContext2D, name: string, w: number, s: number): void {
  roundedRect(ctx, s * 0.06, s * 0.2, w - s * 0.12, s * 0.6, s * 0.18);
  shape(ctx, s * 0.07);
  label(ctx, name, w / 2, s / 2, s * 0.42);
}

/** A trigger: flat at the bottom, a high rounded back on the top. */
function drawTrigger(ctx: CanvasRenderingContext2D, name: string, w: number, s: number): void {
  const left = s * 0.06;
  const right = w - s * 0.06;
  const top = s * 0.08;
  const bottom = s * 0.9;
  ctx.beginPath();
  ctx.moveTo(left, bottom);
  ctx.lineTo(left, top + s * 0.3);
  ctx.quadraticCurveTo(left, top, left + s * 0.3, top);
  ctx.lineTo(right - s * 0.3, top);
  ctx.quadraticCurveTo(right, top, right, top + s * 0.3);
  ctx.lineTo(right, bottom);
  ctx.closePath();
  shape(ctx, s * 0.07);
  label(ctx, name, w / 2, s * 0.53, s * 0.42);
}

function drawStick(ctx: CanvasRenderingContext2D, side: string, click: boolean, s: number): void {
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.43, 0, Math.PI * 2);
  shape(ctx, s * 0.07);
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.3, 0, Math.PI * 2);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = s * 0.04;
  ctx.stroke();
  if (!click) {
    label(ctx, side, s / 2, s / 2, s * 0.36);
    return;
  }
  // Pressed in: a small arrow pointing into the stick, above its letter.
  label(ctx, side, s / 2, s * 0.6, s * 0.3);
  ctx.beginPath();
  ctx.moveTo(s * 0.4, s * 0.24);
  ctx.lineTo(s * 0.6, s * 0.24);
  ctx.lineTo(s * 0.5, s * 0.38);
  ctx.closePath();
  ctx.fillStyle = LINE;
  ctx.fill();
}

type Arm = 'up' | 'down' | 'left' | 'right';

function drawDpad(ctx: CanvasRenderingContext2D, filled: readonly Arm[], s: number): void {
  const a = s * 0.33;
  const b = s * 0.67;
  const lo = s * 0.06;
  const hi = s * 0.94;
  ctx.beginPath();
  ctx.moveTo(a, lo);
  ctx.lineTo(b, lo);
  ctx.lineTo(b, a);
  ctx.lineTo(hi, a);
  ctx.lineTo(hi, b);
  ctx.lineTo(b, b);
  ctx.lineTo(b, hi);
  ctx.lineTo(a, hi);
  ctx.lineTo(a, b);
  ctx.lineTo(lo, b);
  ctx.lineTo(lo, a);
  ctx.lineTo(a, a);
  ctx.closePath();
  shape(ctx, s * 0.06);
  ctx.fillStyle = LINE;
  const inset = s * 0.06;
  for (const arm of filled) {
    if (arm === 'up') ctx.fillRect(a + inset, lo + inset, b - a - 2 * inset, a - lo - inset);
    if (arm === 'down') ctx.fillRect(a + inset, b, b - a - 2 * inset, hi - b - inset);
    if (arm === 'left') ctx.fillRect(lo + inset, a + inset, a - lo - inset, b - a - 2 * inset);
    if (arm === 'right') ctx.fillRect(b, a + inset, hi - b - inset, b - a - 2 * inset);
  }
}

/** A pill with three short lines. */
function drawStart(ctx: CanvasRenderingContext2D, w: number, s: number): void {
  roundedRect(ctx, s * 0.06, s * 0.2, w - s * 0.12, s * 0.6, s * 0.3);
  shape(ctx, s * 0.07);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = s * 0.07;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const y of [0.37, 0.5, 0.63]) {
    ctx.moveTo(w / 2 - s * 0.18, s * y);
    ctx.lineTo(w / 2 + s * 0.18, s * y);
  }
  ctx.stroke();
}

const DPAD_ARMS: Partial<Record<GlyphName, readonly Arm[]>> = {
  dpad: [],
  'dpad-up': ['up'],
  'dpad-down': ['down'],
  'dpad-left': ['left'],
  'dpad-right': ['right'],
  'dpad-horizontal': ['left', 'right'],
  'dpad-vertical': ['up', 'down'],
};

/** A canvas showing one glyph, `size` CSS pixels high. */
export function drawGlyph(name: GlyphName, size = 22): HTMLCanvasElement {
  const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const width = Math.round(size * widthOf(name));
  const canvas = document.createElement('canvas');
  canvas.className = 'pad-glyph';
  canvas.dataset.glyph = name;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(size * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${size}px`;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', LABELS[name]);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(ratio, ratio);
  const arms = DPAD_ARMS[name];
  if (arms) drawDpad(ctx, arms, size);
  else if (name === 'A' || name === 'B' || name === 'X' || name === 'Y') drawFace(ctx, name, size);
  else if (name === 'LB' || name === 'RB') drawBumper(ctx, name, width, size);
  else if (name === 'LT' || name === 'RT') drawTrigger(ctx, name, width, size);
  else if (name === 'start') drawStart(ctx, width, size);
  else drawStick(ctx, name[0], name.endsWith('click'), size);
  return canvas;
}

/** A sheet of every glyph with its name (the reference screenshot `pad-glyphs`). */
export function glyphSheet(): HTMLElement {
  const sheet = document.createElement('div');
  sheet.className = 'pad-glyph-sheet';
  for (const name of GLYPH_NAMES) {
    const cell = document.createElement('div');
    cell.className = 'pad-glyph-cell';
    cell.appendChild(drawGlyph(name, 40));
    const text = document.createElement('span');
    text.textContent = name;
    cell.appendChild(text);
    sheet.appendChild(cell);
  }
  return sheet;
}
