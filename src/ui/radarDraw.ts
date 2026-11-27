// Drawing pieces shared by the radar circle and the Map tab: symbols, hints, arrows. By code.
import type { RadarKind } from '../radar/kinds';

export function css(colour: number): string {
  return `#${colour.toString(16).padStart(6, '0')}`;
}

/**
 * A kind's symbol centred at (x, y): a dot, a diamond, a hollow square (shaft) or a
 * downward triangle (cave), each with a rim, so the shape alone tells them apart.
 */
export function drawSymbol(
  ctx: CanvasRenderingContext2D,
  kind: RadarKind,
  x: number,
  y: number,
  r: number,
): void {
  ctx.beginPath();
  if (kind.shape === 'square') {
    // Hollow: a thick frame in the kind's colour between two thin rims.
    const d = r * 1.05;
    const w = Math.max(2, r * 0.55);
    ctx.rect(x - d, y - d, 2 * d, 2 * d);
    ctx.lineWidth = w + 2.5;
    ctx.strokeStyle = css(kind.rim);
    ctx.stroke();
    ctx.lineWidth = w;
    ctx.strokeStyle = css(kind.colour);
    ctx.stroke();
    return;
  }
  if (kind.shape === 'dot') {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  } else if (kind.shape === 'triangle') {
    const d = r * 1.35;
    ctx.moveTo(x - d, y - d * 0.7);
    ctx.lineTo(x + d, y - d * 0.7);
    ctx.lineTo(x, y + d);
    ctx.closePath();
  } else {
    const d = r * 1.3;
    ctx.moveTo(x, y - d);
    ctx.lineTo(x + d, y);
    ctx.lineTo(x, y + d);
    ctx.lineTo(x - d, y);
    ctx.closePath();
  }
  ctx.fillStyle = css(kind.colour);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = css(kind.rim);
  ctx.stroke();
}

/** A hint label ("5↓"), upright, beside a symbol; kept inside `bounds` (a circle or a box). */
export function drawHint(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  fit: (x: number, width: number) => number,
): void {
  if (text === '') return;
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  const width = ctx.measureText(text).width;
  const left = fit(x + size * 0.6, width);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.strokeText(text, left, y);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, left, y);
}

/** A small arrow at (x, y) pointing in direction `angle` (radians, 0 = up, clockwise). */
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
  fill: string,
  rim: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.7, size * 0.7);
  ctx.lineTo(0, size * 0.3);
  ctx.lineTo(-size * 0.7, size * 0.7);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = rim;
  ctx.stroke();
  ctx.restore();
}

/** Sizes a canvas to a CSS size at up to twice the device pixels; returns the scale. */
export function fitCanvas(canvas: HTMLCanvasElement, width: number, height: number): number {
  const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  return scale;
}
