// Debug overlay (F3): live numbers about the player, the world and the renderer.

export interface DebugInfo {
  fps: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  chunkX: number;
  chunkZ: number;
  loaded: number;
  pending: number;
  /** Chunk jobs done since the world was opened. */
  jobs: { generate: number; light: number; mesh: number };
  /** Chunk work per frame and frames over the last ten seconds (see `PerfStats`). */
  chunkWorkAvgMs: number;
  chunkWorkMaxMs: number;
  frames: number;
  longFrames: number;
  /** Light of the cell of the player's eye, or null where nothing is lit. */
  light: { sky: number; block: number } | null;
  drawCalls: number;
  triangles: number;
  seed: number;
  time: number;
  mode: string;
  onGround: boolean;
  inWater: boolean;
  target: string | null;
}

const ROWS = [
  'fps',
  'position',
  'facing',
  'chunk',
  'chunks',
  'jobs',
  'work',
  'frames',
  'light',
  'render',
  'seed',
  'time',
  'mode',
  'target',
] as const;
type Row = (typeof ROWS)[number];

const LABELS: Record<Row, string> = {
  fps: 'FPS',
  position: 'Position',
  facing: 'Facing',
  chunk: 'Chunk',
  chunks: 'Chunks',
  jobs: 'Jobs',
  work: 'Chunk work',
  frames: 'Frames',
  light: 'Light',
  render: 'Render',
  seed: 'Seed',
  time: 'Time',
  mode: 'Mode',
  target: 'Target',
};

const COMPASS = [
  'north',
  'north-west',
  'west',
  'south-west',
  'south',
  'south-east',
  'east',
  'north-east',
];

/** Compass name for a yaw angle (0 = north = -Z, positive turns towards west). */
export function facingName(yaw: number): string {
  const index = Math.round(yaw / (Math.PI / 4));
  return COMPASS[((index % 8) + 8) % 8];
}

/** Name of the part of the day for a time in [0, 1). */
export function timeName(t: number): string {
  if (t < 0.04 || t >= 0.96) return 'sunrise';
  if (t < 0.2) return 'morning';
  if (t < 0.3) return 'noon';
  if (t < 0.46) return 'afternoon';
  if (t < 0.54) return 'sunset';
  return 'night';
}

export class DebugOverlay {
  readonly element: HTMLElement;
  private readonly values = new Map<Row, HTMLElement>();
  private shown = false;

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'debug-overlay';
    for (const row of ROWS) {
      const line = document.createElement('div');
      const label = document.createElement('span');
      label.className = 'debug-label';
      label.textContent = `${LABELS[row]}: `;
      const value = document.createElement('span');
      value.dataset.debug = row;
      line.append(label, value);
      this.element.appendChild(line);
      this.values.set(row, value);
    }
    parent.appendChild(this.element);
  }

  get visible(): boolean {
    return this.shown;
  }

  toggle(): void {
    this.setVisible(!this.shown);
  }

  setVisible(visible: boolean): void {
    this.shown = visible;
    this.element.classList.toggle('visible', visible);
  }

  update(info: DebugInfo): void {
    if (!this.shown) return;
    const degrees = (radians: number): string => ((radians * 180) / Math.PI).toFixed(1);
    this.set('fps', info.fps.toFixed(0));
    this.set('position', `${info.x.toFixed(2)} / ${info.y.toFixed(2)} / ${info.z.toFixed(2)}`);
    this.set(
      'facing',
      `${facingName(info.yaw)} (yaw ${degrees(info.yaw)}°, pitch ${degrees(info.pitch)}°)`,
    );
    this.set('chunk', `${info.chunkX} / ${info.chunkZ}`);
    this.set('chunks', `${info.loaded} loaded, ${info.pending} pending`);
    this.set(
      'jobs',
      `${info.jobs.generate} generated, ${info.jobs.light} lit, ${info.jobs.mesh} meshed`,
    );
    this.set(
      'work',
      `avg ${info.chunkWorkAvgMs.toFixed(1)} ms, max ${info.chunkWorkMaxMs.toFixed(1)} ms per frame`,
    );
    this.set('frames', `${info.frames} in 10 s, ${info.longFrames} long`);
    this.set('light', info.light ? `sky ${info.light.sky}, block ${info.light.block}` : 'none');
    this.set('render', `${info.drawCalls} draw calls, ${info.triangles} triangles`);
    this.set('seed', String(info.seed));
    this.set('time', `${info.time.toFixed(3)} (${timeName(info.time)})`);
    const detail = info.inWater ? ', in water' : info.onGround ? ', on ground' : '';
    this.set('mode', `${info.mode}${detail}`);
    this.set('target', info.target ?? 'none');
  }

  private set(row: Row, text: string): void {
    const element = this.values.get(row);
    // Skipping unchanged text avoids needless DOM work every frame.
    if (element && element.textContent !== text) element.textContent = text;
  }
}
