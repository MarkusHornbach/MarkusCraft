// Test API on `window.__mc`: lets headless tests observe and drive the game deterministically.
import type { CaveSites } from '../world/generation/terrainV3';
import type { ActionResult } from '../actions/apply';
import type { GameMode, ItemStack } from '../actions/playerRecord';
import type { BenchResult } from '../bench/benchReport';
import type { WorldOptions } from '../world/generation/worldOptions';
import type { Network } from '../net/transport';
import type { RoomList } from './multiplayer';
import type { FigureAngles } from '../player/figureMotion';
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
  world: {
    id: string;
    name: string;
    generatorVersion: number;
    /** The world options of generator 2; null for generator 1 (Phase 7 part A). */
    options: WorldOptions | null;
    /** Chests with at least one item (Phase 8 part B3a). */
    chests: number;
  } | null;
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
    tab: 'items' | 'crafting' | 'tasks' | 'map' | null;
    /**
     * The element the controller's focus is on (its `aria-label`, its text or its id).
     * Left out while there is none (the controller is not the active source, or no screen
     * is open), so that tests of earlier phases that compare `ui` as a whole still match.
     */
    focus?: string;
    /**
     * The preview of "Your player": pictures it drew. Left out while it does not exist,
     * like `focus`, so that older `toEqual` checks of `ui` still match.
     */
    preview?: { frames: number };
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
    /** Adventure: the player has not unlocked it yet (Phase 8). */
    locked: boolean;
    /** What unlocks it. */
    unlock: { level: number } | { task: number };
  }[];
  /**
   * The task book and the player's level (Adventure, Phase 8); null in Creative. `tasks`
   * are those of the open chapter (`chapter` null: the book is complete); `notice` the
   * progress notice shown now; `tracked` and `track` the task tracker (Polish 2).
   */
  progress: {
    level: number;
    xp: number;
    nextLevelXp: number | null;
    chapter: number | null;
    done: number[];
    tasks: { id: number; count: number; goal: number; done: boolean }[];
    notice: string | null;
    /** What the HUD's task tracker shows (Polish 2), or null while it is hidden. */
    tracked: { id: number; text: string } | null;
    /** The record's choice: 0 automatic, -1 hidden, or a task id. */
    track: number;
  } | null;
  /**
   * The radar (Phase 8 part B1); null in Creative. `entries` and `beyond` are what the
   * circle drew last (`screen`: the spot relative to its centre in CSS pixels, y down);
   * `scans` and `draws` (of the circle) count since the world was loaded.
   */
  radar: {
    unlocked: boolean;
    setting: boolean;
    shown: boolean;
    focus: string | null;
    entries: RadarStateEntry[];
    beyond: { kind: string; dx: number; dz: number; dist: number }[];
    scans: number;
    draws: number;
  } | null;
  /** The Map tab while it is open (Phase 8 part B1); left out otherwise. */
  map?: {
    locked: boolean;
    entries: RadarStateEntry[];
    legend: string[];
    draws: number;
  };
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
    /** Most other players' figures drawn at once during the run (Phase 6 AC15.2). */
    figures: number;
  } | null;
  /**
   * Multiplayer (Phase 6): the role of this page, whether this build knows a signaling
   * server, the build id that must match between players, and the network test while its
   * screen is open.
   */
  net: {
    role: 'off' | 'host' | 'guest';
    status: 'offline' | 'connecting' | 'syncing' | 'online' | 'reconnecting';
    available: boolean;
    build: string;
    roomCode: string | null;
    /** The id the room gave this player. */
    selfId: number | null;
    /**
     * Everyone in the room: the last pose known (`x` …) and, for the others, where the
     * figure is drawn now (`renderX` …; the own player's pose for itself).
     */
    players: {
      id: number;
      name: string;
      slot: number;
      /** The figure's look (1–8, Part D). */
      look: number;
      self: boolean;
      host: boolean;
      /** Flying, and holding break on a block (relayed with the pose). */
      fly: boolean;
      busy: boolean;
      x: number;
      y: number;
      z: number;
      yaw: number;
      pitch: number;
      renderX: number;
      renderY: number;
      renderZ: number;
      renderYaw: number;
      /** The angles the figure was drawn with in the last frame; null if it is not drawn. */
      anim: FigureAngles | null;
      /** How often the figure's name tag was drawn (a new name draws it again). */
      tagDraws: number;
    }[];
    /** Round trip of the last ping to the host (guests only). */
    rttMs: number | null;
    /** The host's last answer to this guest (also to raw messages), or null. */
    lastResult: { seq: number; ok: boolean; reason: string | null } | null;
    /** Order-independent hash of the world's edits and block states (Phase 8 part B3a). */
    worldHash: number;
    lastError: string | null;
    /** The multiplayer notices on screen ("Anna joined"). */
    notices: string[];
    /** Figures of other players drawn in the last frame. */
    figures: number;
    test: NetTestState | null;
  };
  player: {
    /**
     * "Your player" (Phase 6 part D): the name as typed, the stored choice of look
     * (0 Automatic, 1–8) and the look it resolves to.
     */
    name: string;
    choice: number;
    look: number;
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
    /** "Collide with leaves" (Phase 7 part A). */
    collideLeaves: boolean;
    /** "Radar circle" (Phase 8 part B1). */
    radar: boolean;
    /** "Radar circle size": 0 Small, 1 Medium, 2 Large. */
    radarSize: number;
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
  /**
   * The slots of the chest in a cell (Phase 8 part B3a), or null if no chest is there
   * (also in a chunk that is not loaded).
   */
  getChest(x: number, y: number, z: number): (ItemStack | null)[] | null;
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
  /**
   * The spawn shaft, the nearest entrance and ravine of a generator 3 world (Phase 8 part
   * B2a), or null for an older generator.
   */
  caveSites(): CaveSites | null;
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
   * not exist; a new Adventure world with the book as `progress` says (default `all`).
   */
  openWorld(name: string, seed: number, mode?: GameMode, progress?: 'all' | 'fresh'): Promise<void>;
  /**
   * Sets the XP of the player (on a host with `player`, of that guest) and replaces the
   * world's done list, clearing the counts, or setting them to `counts` (test tool, Phase 8;
   * on a host every guest learns the book).
   */
  setProgress(
    patch: { xp?: number; done?: number[]; counts?: { task: number; count: number }[] },
    player?: number,
  ): void;
  /**
   * Puts items into the inventory directly, as far as they fit (test tool); on a host with
   * `player`, into that guest's inventory (Phase 6 part C).
   */
  give(item: number, count: number, player?: number): void;
  /** Switches "Collide with leaves" (Phase 7 part A) without storing it (test tool). */
  setCollideLeaves(on: boolean): void;
  /** Empties the inventory directly (test tool). */
  clearInventory(): void;
  /** The result record on the performance test's result screen, or null. */
  benchResult(): BenchResult | null;
  /**
   * The PeerJS network of this page's configuration (loads `peerjs`), or null without a
   * signaling server. Tests drive its signaling and connections directly.
   */
  netNetwork(): Promise<Network | null>;
  /** Multiplayer (Phase 6 part B). */
  net: {
    /** Opens the open world to others; resolves with the room code. */
    host(options?: { code?: string; build?: string }): Promise<string>;
    /** Joins a room; resolves when synced, rejects with the text of the reason. */
    join(
      code: string,
      options?: { name?: string; checksum?: number; build?: string },
    ): Promise<void>;
    /** The room list as the world menu shows it. */
    rooms(): Promise<RoomList>;
    /** Leaves (guest) or closes (host) the room. */
    leave(): void;
    /** Any message to the host, past the encoder. */
    sendRaw(message: unknown): void;
    /** Kills the guest's transport without a goodbye. */
    dropConnection(): void;
  };
  /** The frame loop skips all work while on (a hidden tab). */
  suspendFrames(on: boolean): void;
  /** Shows the sheet of all controller glyphs over the game (reference screenshot). */
  glyphSheet(): void;
  /** Shows every look from the front and the back over the game (reference screenshot). */
  figureSheet(): void;
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

/** A vein the radar shows (Phase 8 part B1). */
export interface RadarStateEntry {
  kind: string;
  dx: number;
  dy: number;
  dz: number;
  dist: number;
  hint: 'none' | { coarse: 'up' | 'level' | 'down' } | { exact: number };
  screen?: { x: number; y: number } | null;
}
