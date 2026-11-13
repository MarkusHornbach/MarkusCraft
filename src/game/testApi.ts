// Test API on `window.__mc`: lets headless tests observe and drive the game deterministically.
import type { MoveMode } from '../player/player';

export interface TargetInfo {
  x: number;
  y: number;
  z: number;
  /** Block id of the targeted block. */
  id: number;
  /** Outward normal of the face that was hit. */
  face: [number, number, number];
}

export interface GameState {
  seed: number;
  time: number;
  paused: boolean;
  /** True in touch mode (touch controls shown), false in mouse mode. */
  touch: boolean;
  player: {
    x: number;
    y: number;
    z: number;
    /** Radians, see `PlayerState`. */
    yaw: number;
    pitch: number;
    mode: MoveMode;
    onGround: boolean;
    inWater: boolean;
  };
  chunks: {
    /** Meshed chunks inside the load radius. */
    loaded: number;
    /** Chunks inside the load radius still waiting for their mesh. */
    pending: number;
    /** All chunks that own a mesh, including the unload-hysteresis ring. */
    meshed: number;
    /** All chunks with block data in memory. */
    generated: number;
  };
  render: {
    drawCalls: number;
    triangles: number;
    geometries: number;
    fov: number;
    /** Device pixels per CSS pixel the renderer draws at. */
    pixelRatio: number;
    /** Render distance in chunks (the current setting). */
    renderDistance: number;
  };
  selectedSlot: number;
  target: TargetInfo | null;
}

export interface PlayerPatch {
  x?: number;
  y?: number;
  z?: number;
  yaw?: number;
  pitch?: number;
  mode?: MoveMode;
}

export interface TestApi {
  /** True once all chunks within the load radius are meshed and one frame was rendered. */
  isReady(): boolean;
  /** Resolves when no chunk jobs are pending and a frame was rendered after that. */
  whenIdle(): Promise<void>;
  getState(): GameState;
  /** Teleport / orient / set walk or fly mode. Velocity is reset. Angles in radians. */
  setPlayer(patch: PlayerPatch): void;
  /** Feed a look delta in pixels, as if the mouse moved. */
  look(dx: number, dy: number): void;
  getBlock(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, id: number): void;
  /** Highest non-air, non-leaf block of a column, or -1 if the column is not loaded. */
  surfaceY(x: number, z: number): number;
  /** Checksum over the generated terrain around the origin (see `terrainChecksum`). */
  terrainChecksum(): number;
  setTime(t: number): void;
  /** Advance exactly `n` fixed simulation steps and render once. */
  step(n: number): void;
}

declare global {
  interface Window {
    __mc: TestApi;
  }
}

export function installTestApi(api: TestApi): void {
  window.__mc = api;
}
