// Test API on `window.__mc`: lets headless tests observe and drive the game deterministically.
import type { ActionResult } from '../actions/apply';
import type { GameMode, ItemStack } from '../actions/playerRecord';
import type { BenchResult } from '../bench/benchReport';
import type { Network } from '../net/transport';
import type { MoveMode } from '../player/player';
import type { NetTestState } from '../ui/NetTestScreen';

export interface TargetInfo {
  x: number;
  y: number;
  z: number;
  /** Block id of the targeted block. */
  id: number;
  /** Outward normal of the face that was hit. */
  face: [number, number, number];
}

/** The screens of the performance test, and the run itself. */
export type BenchPhase = 'start' | 'running' | 'result' | 'interrupted';
/** Why a run of the performance test was thrown away. */
export type BenchStop = 'hidden' | 'portrait' | 'resize' | 'cancel';

export interface GameState {
  seed: number;
  time: number;
  paused: boolean;
  /** Game mode of the open world. */
  mode: GameMode;
  /** The open world, or null while none is open. */
  world: { id: string; name: string; generatorVersion: number } | null;
  save: {
    /** True while a change of the world is not written yet. */
    dirty: boolean;
    /** Message of the last failed write, or null. */
    lastError: string | null;
    /** Milliseconds the last write and the last load of a stored world took. */
    lastSaveMs: number;
    lastLoadMs: number;
  };
  /** The player's confirmed item slots; `selected` counts from 0. */
  inventory: { slots: (ItemStack | null)[]; selected: number };
  /** True in touch mode (touch controls shown), false in mouse mode. */
  touch: boolean;
  /** What covers the view: a menu, the inventory, or nothing (`play`). */
  ui: {
    screen: 'worlds' | 'settings' | 'pause' | 'play' | 'inventory' | 'bench' | 'nettest';
    /** The open page of the inventory screen, or null while it is closed. */
    tab: 'items' | 'crafting' | null;
    /**
     * The element the controller's focus is on (its `aria-label`, its text or its id).
     * Left out while there is none (the controller is not the active source, or no screen
     * is open), so that tests of earlier phases that compare `ui` as a whole still match.
     */
    focus?: string;
  };
  /**
   * Every recipe in the order of the recipe list (craftable ones first): whether it can
   * be made right now, which ingredients are short (item and missing count) and whether
   * its station is out of reach.
   */
  recipes: {
    id: number;
    name: string;
    craftable: boolean;
    missing: ItemStack[];
    stationMissing: boolean;
  }[];
  /** The furnace recipe whose progress bar runs (0..1), or null. */
  smelting: { recipe: number; progress: number } | null;
  /**
   * The performance test, or null while it is not open: its phase, the suite, the
   * scenario of a run (counted from 1) and why a run was interrupted.
   */
  bench: {
    phase: BenchPhase;
    suite: 'full' | 'quick';
    index: number;
    total: number;
    scenario: string | null;
    reason: BenchStop | null;
  } | null;
  /**
   * Multiplayer (Phase 6): the role of this page, whether this build knows a signaling
   * server, the build id that must match between players, and the network test while its
   * screen is open.
   */
  net: {
    role: 'off' | 'host' | 'guest';
    available: boolean;
    build: string;
    test: NetTestState | null;
  };
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
    /** All chunks with light in memory. */
    lit: number;
    /** Meshed chunks that wait for a new mesh because an edit changed their light. */
    relight: number;
  };
  /** Performance over the last ten seconds; a long frame takes more than 33 ms. */
  perf: { chunkWorkAvgMs: number; chunkWorkMaxMs: number; longFrames: number; frames: number };
  settings: {
    /** The Brightness setting, 0..1. */
    brightness: number;
    padSensitivity: number;
    padInvertY: boolean;
  };
  /**
   * The controller: pads the browser reports, whether one is the active source, how often
   * the game has polled (tests wait for it to grow), and whether an unsupported pad was
   * pressed.
   */
  pad: { connected: number; active: boolean; polls: number; unsupported: boolean };
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
  /** The timed break in progress (Gathering): its cell and progress 0..1, or null. */
  breaking: { x: number; y: number; z: number; progress: number } | null;
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
  /**
   * Resolves when no chunk jobs are pending, no mesh waits for changed light, and a frame
   * was rendered after that.
   */
  whenIdle(): Promise<void>;
  getState(): GameState;
  /** Teleport / orient / set walk or fly mode. Velocity is reset. Angles in radians. */
  setPlayer(patch: PlayerPatch): void;
  /** Feed a look delta in pixels, as if the mouse moved. */
  look(dx: number, dy: number): void;
  getBlock(x: number, y: number, z: number): number;
  /** Sets a block directly, past the action layer (test tool). */
  setBlock(x: number, y: number, z: number, id: number): void;
  /**
   * Hands an arbitrary value to the session as an action and returns the answer (null if
   * the session has not answered yet, which the local session never does).
   */
  submit(action: unknown): ActionResult | null;
  /** Highest non-air, non-leaf block of a column, or -1 if the column is not loaded. */
  surfaceY(x: number, z: number): number;
  /** Checksum over the generated terrain around the origin (see `terrainChecksum`). */
  terrainChecksum(): number;
  /** Sky light and block light (0–15) of a cell, or null in a chunk that is not lit. */
  getLight(x: number, y: number, z: number): { sky: number; block: number } | null;
  /**
   * Number of cells in lit chunks whose stored light differs from the slow reference
   * (`lightCheck`): 0 is correct. Slow; for tests.
   */
  verifyLight(): number;
  /** Checksum over the light of the 3 × 3 chunks around the origin (see `lightChecksumOf`). */
  lightChecksum(): number;
  setTime(t: number): void;
  /** Resolves when everything unsaved is written to the store. */
  save(): Promise<void>;
  /**
   * Saves the open world, then opens the world with this name from the store in place,
   * creating it from the seed (and the mode, default: the `mode` parameter) if it does
   * not exist.
   */
  openWorld(name: string, seed: number, mode?: GameMode): Promise<void>;
  /** Puts items into the inventory directly, as far as they fit (test tool). */
  give(item: number, count: number): void;
  /** Empties the inventory directly (test tool). */
  clearInventory(): void;
  /** The result record on the performance test's result screen, or null. */
  benchResult(): BenchResult | null;
  /**
   * The PeerJS network of this page's configuration (loads `peerjs`), or null without a
   * signaling server. Tests drive its signaling and connections directly.
   */
  netNetwork(): Promise<Network | null>;
  /** Shows the sheet of all controller glyphs over the game (reference screenshot). */
  glyphSheet(): void;
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
