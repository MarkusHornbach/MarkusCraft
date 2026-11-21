// Debug overlay (F3): live numbers about the player, the world, the renderer and the room.
import type { NetDebug } from '../game/multiplayer';

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
  /** The room, or null in single-player. */
  net: NetDebug | null;
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
  'room',
  'roundTrip',
  'link',
  'signal',
  'traffic',
] as const;
type Row = (typeof ROWS)[number];

const NET_ROWS: readonly Row[] = ['room', 'roundTrip', 'link', 'signal', 'traffic'];

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
  room: 'Room',
  roundTrip: 'Round trip',
  link: 'Link',
  signal: 'Signaling',
  traffic: 'Traffic',
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

/** The network rows of the overlay as text; single-player shows "off" in the first. */
export function netRows(
  net: NetDebug | null,
): Record<'room' | 'roundTrip' | 'link' | 'signal' | 'traffic', string> {
  if (!net) return { room: 'off', roundTrip: '–', link: '–', signal: '–', traffic: '–' };
  const code = net.roomCode ?? '–';
  const players = `${net.players} ${net.players === 1 ? 'player' : 'players'}`;
  const ms = (rtt: number | null): string => (rtt === null ? '–' : `${Math.round(rtt)} ms`);
  const roundTrip =
    net.role === 'guest'
      ? ms(net.rtt[0]?.rttMs ?? null)
      : net.rtt.length === 0
        ? 'no guests'
        : net.rtt.map((r) => `${r.name} ${ms(r.rttMs)}`).join(', ');
  const kb = (bytes: number): string => (bytes / 1024).toFixed(1);
  const r = net.rates;
  return {
    room: `${net.role}, ${net.status}, code ${code}, ${players}`,
    roundTrip,
    link: net.links.length === 0 ? '–' : [...new Set(net.links)].join(', '),
    signal: net.signal,
    traffic:
      `in ${r.inMsgs.toFixed(0)} msg/s ${kb(r.inBytes)} kB/s, ` +
      `out ${r.outMsgs.toFixed(0)} msg/s ${kb(r.outBytes)} kB/s`,
  };
}

export class DebugOverlay {
  readonly element: HTMLElement;
  private readonly values = new Map<Row, HTMLElement>();
  private readonly lines = new Map<Row, HTMLElement>();
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
      this.lines.set(row, line);
      if (NET_ROWS.includes(row)) line.hidden = true;
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
    const net = netRows(info.net);
    // The network rows are shown only in a room: single-player keeps its short overlay.
    for (const row of NET_ROWS) {
      const line = this.lines.get(row);
      if (line && line.hidden !== (info.net === null)) line.hidden = info.net === null;
    }
    this.set('room', net.room);
    this.set('roundTrip', net.roundTrip);
    this.set('link', net.link);
    this.set('signal', net.signal);
    this.set('traffic', net.traffic);
  }

  private set(row: Row, text: string): void {
    const element = this.values.get(row);
    // Skipping unchanged text avoids needless DOM work every frame.
    if (element && element.textContent !== text) element.textContent = text;
  }
}
