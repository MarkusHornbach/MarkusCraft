// Game: wires world, player, renderer and UI together and runs the fixed-step loop.
import type { Action } from '../actions/actions';
import type { ActionResult, BlockChange } from '../actions/apply';
import { type GameMode, createPlayerRecord } from '../actions/playerRecord';
import { type PlayerRecord } from '../actions/playerRecord';
import { LocalSession } from '../actions/Session';
import { Input, type PressAction } from '../input/Input';
import { breakTimeMs } from '../items/hardness';
import { addItems } from '../items/inventory';
import { isItem, itemLabel } from '../items/items';
import { TouchControls } from '../input/TouchControls';
import { type MoveInput, respawnIfFallen, stepPlayer } from '../player/physics';
import { applyLook, createPlayer, eyeY, type PlayerState, viewDirection } from '../player/player';
import { Renderer } from '../render/Renderer';
import {
  type LoadedWorld,
  type WorldEdits,
  type WorldMeta,
  makeWorldId,
  normalizeName,
  seedFromText,
} from '../save/saveFormat';
import { MemoryStore, type WorldStore } from '../save/WorldStore';
import { DebugOverlay } from '../ui/DebugOverlay';
import { Hud } from '../ui/Hud';
import { InventoryScreen } from '../ui/InventoryScreen';
import { type InputMode, PauseScreen, SAVE_FAILED_TEXT } from '../ui/PauseScreen';
import {
  DEFAULT_SETTINGS,
  type Settings,
  browserStorage,
  hasStoredSettings,
  loadSettings,
  saveSettings,
} from '../ui/settings';
import { TouchHud } from '../ui/TouchHud';
import { WorldMenu } from '../ui/WorldMenu';
import { CRACK_STAGES } from '../render/textures/cracks';
import { Block, getBlockDef } from '../world/blocks';
import { ChunkManager } from '../world/ChunkManager';
import { chunkKey, toChunkCoord } from '../world/chunk';
import { advanceTime, wrapTime } from '../world/dayNight';
import { findSpawn, type SpawnPoint } from '../world/generation/spawn';
import { getTerrain, terrainChecksum } from '../world/generation/terrain';
import { type RayHit, raycast } from '../world/raycast';
import { World, chunksAffectedByEdit } from '../world/World';
import { Autosave, type SaveBatch } from './autosave';
import {
  ACTION_REPEAT_MS,
  CHUNK_BUDGET_MS,
  GENERATOR_VERSION,
  HOTBAR_SLOTS,
  LOOK_RADIANS_PER_PIXEL,
  MAX_STEPS_PER_FRAME,
  NOTICE_MS,
  PIXEL_RATIO_MAX,
  PLAYER_EYE_HEIGHT,
  REACH,
  SAVE_FORMAT_VERSION,
  SIM_DT,
  SIM_HZ,
  START_TIME_OF_DAY,
  TEST_RENDER_DISTANCE,
  TEST_VIEW_HEIGHT,
  TEST_VIEW_WIDTH,
  TOUCH_LOOK_RADIANS_PER_PIXEL,
  TOUCH_PIXEL_RATIO_MAX,
  TOUCH_RENDER_DISTANCE_DEFAULT,
  WATER_SURFACE_DROP,
} from './config';
import { IdbStore } from './idbStore';
import { type GameState, type PlayerPatch, type TestApi, installTestApi } from './testApi';
import type { GameParams } from './urlParams';
import { type ReleaseLock, acquireWorldLock } from './worldLock';

/** If the browser has not captured the mouse this long after a request, the game pauses. */
const POINTER_LOCK_WAIT_MS = 1000;
/** Time the view may need to settle after entering or leaving fullscreen. */
const FULLSCREEN_SETTLE_MS = 500;

/** What covers the view outside test mode: a menu, or nothing while playing. */
type Screen = 'worlds' | 'settings' | 'pause' | 'play';

/** A problem the world menu tells the player about. */
class MenuProblem extends Error {}

const TEXT_OTHER_TAB = 'This world is open in another tab.';
const TEXT_NOT_OPENED = 'This world could not be opened.';
const TEXT_NOT_CREATED = 'The world could not be created. Free up storage space.';
const TEXT_NO_STORAGE = 'Worlds cannot be saved in this browser window.';
const TEXT_INVENTORY_FULL = 'Inventory full';

/** A timed break as the screen shows it: the cell and how far it has come (0..1). */
interface BreakView {
  x: number;
  y: number;
  z: number;
  progress: number;
}

/** True on devices whose main pointer is a finger (phones and tablets). */
function prefersTouch(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

export class Game {
  readonly params: GameParams;
  // World, chunk manager, player and session belong to the open world; `loadWorld`
  // replaces them. Until a world is open they are empty placeholders.
  private world: World;
  private readonly renderer: Renderer;
  private chunkManager: ChunkManager;
  private player: PlayerState;
  private spawn: SpawnPoint;
  /** Where worlds are kept: IndexedDB, or memory in test mode. */
  private store: WorldStore = new MemoryStore();
  /** The open world as it was loaded or last saved; null while no world is open. */
  private meta: WorldMeta | null = null;
  private autosave: Autosave;
  /** Milliseconds the last load and the last save of a world took (for tests). */
  private lastLoadMs = 0;
  private lastSaveMs = 0;
  private readonly input: Input;
  private readonly hud: Hud;
  private readonly debug: DebugOverlay;
  private readonly pauseScreen: PauseScreen | null = null;
  /** The start screen with the list of worlds; like the pause screen not in test mode. */
  private readonly worldMenu: WorldMenu | null = null;
  private screen: Screen = 'play';
  private readonly inventoryScreen: InventoryScreen;
  /** The inventory covers the view. Unlike the menus it does not pause the world. */
  private inventoryOpen = false;
  /** True while a world is being opened, created or deleted from the menu. */
  private menuBusy = false;
  /** Releases the tab lock of the open world. */
  private releaseWorldLock: ReleaseLock | null = null;
  private persistRequested = false;
  /** The player chose "Exit fullscreen" during this visit: do not enter it again unasked. */
  private fullscreenDeclined = false;
  /** Until this time (performance clock) a portrait view does not pause the game. */
  private orientationQuietUntil = 0;
  private settings: Settings;
  private mode: InputMode = 'mouse';
  /** Touch source and its on-screen controls; they exist only in touch mode. */
  private touch: TouchControls | null = null;
  private touchHud: TouchHud | null = null;
  /** Smoothed frames per second for the debug overlay. */
  private fps = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private readonly root: HTMLElement;
  /** Every change to blocks and to the player's items goes through the session. */
  private session: LocalSession;
  private gameMode: GameMode = 'creative';
  /** Simulation steps since the world was opened: the clock of the action layer. */
  private simSteps = 0;
  /** Answer to the action submitted last (the test API returns it). */
  private lastResult: ActionResult | null = null;
  private target: RayHit | null = null;
  /** Gathering: the session confirmed the break that the held button is working on. */
  private breakActive = false;
  /** The pickup notice on screen ("+2 Dirt") and the action time until it stays. */
  private pickup: { item: number; count: number; untilMs: number } | null = null;
  /** "Inventory full" shows until this action time. */
  private fullUntilMs = -1;
  /** Seconds a mouse button has been held since the last break/place action. */
  private repeatTimer = 0;
  /** Player position before the latest simulation step, for render interpolation. */
  private readonly previous = { x: 0, y: 0, z: 0 };
  private time: number;
  private paused = false;
  private lastFrameMs = 0;
  private accumulator = 0;
  private framesSinceIdle = 0;
  private idleWaiters: (() => void)[] = [];

  constructor(container: HTMLElement, params: GameParams) {
    this.params = params;
    this.time = params.time;
    this.world = new World(0);

    this.root = document.createElement('div');
    this.root.className = 'game-root';
    container.appendChild(this.root);
    const canvas = document.createElement('canvas');
    canvas.className = 'game-canvas';
    this.root.appendChild(canvas);
    this.renderer = new Renderer(canvas, {
      preserveDrawingBuffer: params.test,
      pixelRatio: 1,
    });
    // Test mode ignores stored settings so results do not depend on the browser profile.
    this.settings = params.test
      ? { ...DEFAULT_SETTINGS, renderDistance: TEST_RENDER_DISTANCE }
      : loadSettings(browserStorage());
    this.renderer.setFov(this.settings.fov);
    const radius = this.settings.renderDistance;
    this.renderer.setRenderDistance(radius);

    this.chunkManager = this.createChunkManager(radius);
    this.spawn = { x: 0, y: 0, z: 0 };
    this.player = createPlayer(0, 0, 0);
    this.autosave = this.createAutosave();

    this.input = new Input({
      element: canvas,
      isActive: () => !this.paused && !this.inventoryOpen,
      onPress: (action) => this.handlePress(action),
    });

    this.session = this.createSession(createPlayerRecord(this.gameMode));
    this.hud = new Hud(this.root, this.renderer.atlas.tiles, params.test);
    this.hud.setSelected(this.selectedSlot, false);
    this.debug = new DebugOverlay(this.root);
    this.inventoryScreen = new InventoryScreen(this.root, {
      tiles: this.renderer.atlas.tiles,
      onMove: (from, to) => this.session.submit({ kind: 'moveStack', from, to }),
      onDiscard: (slot) => this.session.submit({ kind: 'discard', slot }),
      onPalette: (item, barSlot) =>
        this.session.submit({
          kind: 'setBarSlot',
          slot: barSlot ?? this.session.record.selectedSlot,
          item,
        }),
      onClose: () => this.closeInventory(),
    });
    // E opens and closes the inventory, Esc closes it. Not while a text field is typed in.
    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.target instanceof HTMLInputElement) return;
      if (e.code === 'KeyE') {
        if (this.inventoryOpen) this.closeInventory();
        else this.openInventory();
      } else if (e.code === 'Escape' && this.inventoryOpen) {
        this.closeInventory();
      }
    });

    if (!params.test) {
      // Normal play starts in the world menu; no world is open until one is chosen.
      this.pauseScreen = new PauseScreen(this.root, {
        settings: this.settings,
        mode: this.mode,
        onPlay: (via) => this.requestPlay(via),
        onBack: () => void this.backToWorlds(),
        onSettingsChange: (settings) => this.applySettings(settings),
        onDebugChange: (visible) => this.setDebugVisible(visible),
        onFullscreenExit: () => {
          this.fullscreenDeclined = true;
        },
      });
      document.addEventListener('fullscreenchange', () => {
        this.orientationQuietUntil = performance.now() + FULLSCREEN_SETTLE_MS;
        window.setTimeout(() => this.resize(), FULLSCREEN_SETTLE_MS + 20);
      });
      this.worldMenu = new WorldMenu(this.root, {
        mode: this.mode,
        onPlay: (id, via) => void this.startWorld(() => this.loadStoredWorld(id), via),
        onCreate: (name, seedText, mode, via) =>
          void this.startWorld(() => this.createStoredWorld(name, seedText, mode), via),
        onDelete: (id) => void this.deleteWorld(id),
        onSettings: () => this.showScreen('settings'),
      });
      this.paused = true;
      this.showScreen('worlds');
      document.addEventListener('pointerlockchange', () => this.onPointerLockChange());
      document.addEventListener('pointerlockerror', () => this.onPointerLockError());
      void this.openStore();
    } else if (params.save) {
      // The stored world arrives asynchronously; until then no world is open.
      void this.openStoredTestWorld();
    } else {
      // A new world in memory. It is never stored.
      this.loadWorld(
        this.newWorldMeta(params.world, params.seed, params.time, params.mode),
        new Map(),
      );
    }

    // Phones and tablets start in touch mode; the play button can still switch the mode.
    this.setMode(params.touch || (!params.test && prefersTouch()) ? 'touch' : 'mouse');
    window.addEventListener('resize', () => this.resize());
    // A long press must not open the browser's menu in touch mode. Text fields keep it
    // (paste). In mouse mode `Input` handles the right click on the canvas.
    this.root.addEventListener('contextmenu', (e) => {
      if (this.mode === 'touch' && !(e.target instanceof HTMLInputElement)) e.preventDefault();
    });
    // Leaving or hiding the page may be the last chance to save.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.saveNow();
    });
    window.addEventListener('pagehide', () => void this.saveNow());
    installTestApi(this.createTestApi());
  }

  private createChunkManager(radius: number): ChunkManager {
    return new ChunkManager(
      this.world,
      {
        onMesh: (cx, cz, data) => this.renderer.setChunkMesh(cx, cz, data),
        onUnload: (cx, cz) => this.renderer.removeChunkMesh(cx, cz),
      },
      radius,
    );
  }

  /** The record of a world that does not exist yet: at its start point, in the morning. */
  private newWorldMeta(name: string, seed: number, time: number, mode: GameMode): WorldMeta {
    const spawn = findSpawn(getTerrain(seed));
    const now = Date.now();
    const random = (): number => Math.floor(Math.random() * 0x100000000);
    return {
      id: makeWorldId(now, random(), random()),
      name: normalizeName(name),
      seed: seed >>> 0,
      mode,
      generatorVersion: GENERATOR_VERSION,
      formatVersion: SAVE_FORMAT_VERSION,
      createdMs: now,
      playedMs: now,
      time,
      pose: { x: spawn.x + 0.5, y: spawn.y, z: spawn.z + 0.5, yaw: 0, pitch: 0 },
      moveMode: 'walk',
      player: createPlayerRecord(mode),
    };
  }

  /**
   * Opens a world in place: replaces world, chunk manager, chunk meshes, player and
   * session without reloading the page, and frees the GPU buffers of the old world.
   * `edits` is taken over by the new world.
   */
  loadWorld(meta: WorldMeta, edits: WorldEdits): void {
    this.renderer.clearChunkMeshes();
    this.world = new World(meta.seed, meta.generatorVersion, edits);
    this.chunkManager = this.createChunkManager(this.settings.renderDistance);
    this.spawn = findSpawn(getTerrain(meta.seed));
    this.player = createPlayer(meta.pose.x, meta.pose.y, meta.pose.z);
    applyLook(this.player, meta.pose.yaw, meta.pose.pitch);
    // Nobody flies in a Gathering world, whatever the record says.
    this.player.mode = meta.mode === 'gathering' ? 'walk' : meta.moveMode;
    this.rememberPosition();
    this.time = meta.time;
    this.gameMode = meta.mode;
    this.simSteps = 0;
    this.repeatTimer = 0;
    this.breakActive = false;
    this.pickup = null;
    this.fullUntilMs = -1;
    this.target = null;
    this.meta = meta;
    this.session = this.createSession(meta.player);
    this.autosave = this.createAutosave();
    this.hud.setSlots(meta.player.slots);
    this.hud.setSelected(this.selectedSlot, false);
    this.hideInventory();
    this.inventoryScreen.setGameMode(meta.mode);
    this.inventoryScreen.setSlots(meta.player.slots, meta.player.selectedSlot);
    this.pauseScreen?.setWorld(meta.seed);
    this.pauseScreen?.setGameMode(meta.mode);
    this.touchHud?.setFlyAvailable(meta.mode === 'creative');
    this.updateChunkCenter();
    this.framesSinceIdle = 0;
  }

  /** The open world's record with the current pose, time and player record. */
  private currentMeta(meta: WorldMeta): WorldMeta {
    const p = this.player;
    return {
      ...meta,
      playedMs: Date.now(),
      time: this.time,
      pose: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch },
      moveMode: p.mode,
      // A break in progress is measured on a clock that restarts with the world.
      player: { ...this.session.record, breaking: null },
    };
  }

  /** A fresh autosave for the world that is open right now. */
  private createAutosave(): Autosave {
    const world = this.world;
    const store = this.store;
    return new Autosave(async (batch: SaveBatch) => {
      const meta = this.meta;
      if (!meta || this.world !== world) return;
      const start = performance.now();
      // Both calls take their snapshot at once, before anything is awaited.
      const chunks = store.saveChunks(meta.id, world.edits, batch.chunks);
      const saved = this.currentMeta(meta);
      const record = batch.meta ? store.saveMeta(saved) : Promise.resolve();
      await Promise.all([chunks, record]);
      if (batch.meta && this.meta === meta) this.meta = saved;
      this.lastSaveMs = performance.now() - start;
    });
  }

  /** Writes everything unsaved now. Never rejects; a failure shows in the save state. */
  private saveNow(): Promise<void> {
    return this.autosave.flush(performance.now());
  }

  private markMetaDirty(): void {
    if (this.meta) this.autosave.markMeta(performance.now());
  }

  private markChunkDirty(x: number, z: number): void {
    this.autosave.markChunk(chunkKey(toChunkCoord(x), toChunkCoord(z)), performance.now());
  }

  /**
   * Opens the world with this name from the store, creating it from the seed if there
   * is none. Saves the world that is open first.
   */
  private async openNamedWorld(name: string, seed: number, mode: GameMode): Promise<void> {
    await this.saveNow();
    const start = performance.now();
    const wanted = normalizeName(name);
    const entries = await this.store.list();
    const entry = entries.find((e) => e.status === 'ok' && e.meta.name === wanted);
    if (!entry) {
      const meta = this.newWorldMeta(wanted, seed, this.params.time, mode);
      await this.store.create(meta);
      this.loadWorld(meta, new Map());
    } else {
      const loaded = await this.store.load(entry.id);
      if (!loaded || !loaded.ok) throw new Error(`World "${wanted}" cannot be opened`);
      this.loadWorld(loaded.value.meta, loaded.value.edits);
    }
    this.lastLoadMs = performance.now() - start;
  }

  // --- world menu (not in test mode) --------------------------------------------------

  /** Opens IndexedDB and fills the world list. Without it worlds live in memory only. */
  private async openStore(): Promise<void> {
    try {
      this.store = await IdbStore.open();
    } catch {
      // Private windows of some browsers have no IndexedDB: play without saving.
      this.worldMenu?.setMessage(TEXT_NO_STORAGE);
    }
    // The autosave of the placeholder world was bound to the first store.
    this.autosave = this.createAutosave();
    await this.refreshWorldList();
    // A link with a seed opens the form for a new world with that seed.
    if (this.params.seedFromUrl) this.worldMenu?.showForm(String(this.params.seed));
  }

  private async refreshWorldList(): Promise<void> {
    try {
      this.worldMenu?.setWorlds(await this.store.list());
    } catch {
      this.worldMenu?.setWorlds([]);
      this.worldMenu?.setMessage(TEXT_NO_STORAGE);
    }
  }

  /** Shows one of the menus, or the game. Only outside test mode. */
  private showScreen(screen: Screen): void {
    this.screen = screen;
    this.worldMenu?.setVisible(screen === 'worlds');
    this.pauseScreen?.setKind(screen === 'settings' ? 'settings' : 'pause');
    this.pauseScreen?.setVisible(screen === 'settings' || screen === 'pause');
    this.hud.setVisible(screen === 'play');
    this.touchHud?.setVisible(screen === 'play');
  }

  /** Reads a stored world for playing; takes its tab lock. */
  private async loadStoredWorld(id: string): Promise<LoadedWorld> {
    const release = await acquireWorldLock(id);
    if (!release) throw new MenuProblem(TEXT_OTHER_TAB);
    const loaded = await this.store.load(id).catch(() => null);
    if (!loaded || !loaded.ok) {
      release();
      throw new MenuProblem(TEXT_NOT_OPENED);
    }
    this.releaseWorldLock = release;
    return loaded.value;
  }

  /** Creates and stores the world of the "New world" form. */
  private async createStoredWorld(
    name: string,
    seedText: string,
    mode: GameMode,
  ): Promise<LoadedWorld> {
    const seed = seedFromText(seedText) ?? Math.floor(Math.random() * 0x100000000);
    const time = this.params.timeFromUrl ? this.params.time : START_TIME_OF_DAY;
    const meta = this.newWorldMeta(name, seed, time, mode);
    try {
      await this.store.create(meta);
    } catch {
      throw new MenuProblem(TEXT_NOT_CREATED);
    }
    this.requestPersistence();
    this.releaseWorldLock = await acquireWorldLock(meta.id);
    return { meta, edits: new Map() };
  }

  /** Asks the browser once not to evict the stored worlds. The answer does not matter. */
  private requestPersistence(): void {
    if (this.persistRequested) return;
    this.persistRequested = true;
    try {
      void navigator.storage?.persist?.().catch(() => {});
    } catch {
      // Not every browser has the API.
    }
  }

  /**
   * A play button of the world menu was activated: opens the world that `load` delivers
   * and starts playing. Mouse capture is requested at once, while the browser still
   * accepts the click as the reason for it; the world arrives a moment later.
   */
  private async startWorld(load: () => Promise<LoadedWorld>, via: InputMode | null): Promise<void> {
    if (this.menuBusy) return;
    this.setMenuBusy(true);
    this.worldMenu?.setMessage('');
    this.pauseScreen?.setHint('');
    // `touch=1` pins touch mode; otherwise the way the button was pressed decides.
    if (via && via !== this.mode && !this.params.touch) this.setMode(via);
    if (this.mode === 'mouse') this.requestPointerLock();
    else this.enterFullscreen();
    try {
      const loaded = await load();
      this.loadWorld(loaded.meta, loaded.edits);
      // Playing a world counts as "last played", also when nothing in it changes.
      this.markMetaDirty();
      if (this.mode === 'touch') {
        if (this.isPortrait()) this.showScreen('pause');
        else this.setPaused(false);
      } else if (this.input.pointerLocked) {
        this.setPaused(false);
      } else {
        // The mouse is not captured (yet): the pause menu offers "Click to play".
        this.showScreen('pause');
      }
    } catch (error) {
      if (document.pointerLockElement) document.exitPointerLock();
      await this.refreshWorldList();
      this.worldMenu?.setMessage(error instanceof MenuProblem ? error.message : TEXT_NOT_OPENED);
    } finally {
      this.setMenuBusy(false);
    }
  }

  private setMenuBusy(busy: boolean): void {
    this.menuBusy = busy;
    this.worldMenu?.setBusy(busy);
  }

  /** "Save and back to worlds" (or "Back to worlds" on the settings page). */
  private async backToWorlds(): Promise<void> {
    if (this.screen === 'settings') {
      this.showScreen('worlds');
      return;
    }
    if (this.menuBusy || !this.meta) return;
    this.setMenuBusy(true);
    try {
      await this.saveNow();
      // An unsaved world is not closed: the pause menu shows why.
      if (this.autosave.lastError !== null) return;
      this.closeWorld();
      await this.refreshWorldList();
      this.worldMenu?.setMessage('');
      this.showScreen('worlds');
    } finally {
      this.setMenuBusy(false);
    }
  }

  /** Leaves the open world: frees its meshes and its tab lock. Nothing is saved here. */
  private closeWorld(): void {
    this.meta = null;
    this.renderer.clearChunkMeshes();
    this.world = new World(0);
    this.chunkManager = this.createChunkManager(this.settings.renderDistance);
    this.autosave = this.createAutosave();
    this.target = null;
    this.releaseWorldLock?.();
    this.releaseWorldLock = null;
  }

  private async deleteWorld(id: string): Promise<void> {
    if (this.menuBusy) return;
    this.setMenuBusy(true);
    try {
      // A world that is open in another tab stays.
      const release = await acquireWorldLock(id);
      if (!release) {
        this.worldMenu?.setMessage(TEXT_OTHER_TAB);
        return;
      }
      try {
        await this.store.delete(id);
        this.worldMenu?.setMessage('');
      } catch {
        this.worldMenu?.setMessage(TEXT_NOT_OPENED);
      } finally {
        release();
      }
      await this.refreshWorldList();
    } finally {
      this.setMenuBusy(false);
    }
  }

  /** `test=1&save=1`: the world named by the URL, kept in IndexedDB. */
  private async openStoredTestWorld(): Promise<void> {
    this.store = await IdbStore.open();
    await this.openNamedWorld(this.params.world, this.params.seed, this.params.mode);
  }

  /** Bar slot of the confirmed player record, 1-based as on the keyboard. */
  private get selectedSlot(): number {
    return this.session.record.selectedSlot + 1;
  }

  private createSession(record: PlayerRecord): LocalSession {
    return new LocalSession(
      {
        world: this.world,
        mode: this.gameMode,
        pose: () => this.player,
        nowMs: () => this.nowMs(),
      },
      record,
      {
        onBlocks: (changes) => this.onBlocksChanged(changes),
        onPlayer: (changed) => this.onPlayerChanged(changed),
        onResult: (action, result) => this.onActionResult(action, result),
      },
    );
  }

  /** The clock of the action layer: simulation time since the world was opened. */
  private nowMs(): number {
    return (this.simSteps * 1000) / SIM_HZ;
  }

  /** The session set blocks: rebuild the meshes they touch, outside the frame budget. */
  private onBlocksChanged(changes: readonly BlockChange[]): void {
    for (const { x, z } of changes) {
      this.markChunkDirty(x, z);
      this.remeshAround(x, z);
    }
  }

  /** The session confirmed a new record of the player: show it and save it. */
  private onPlayerChanged(record: PlayerRecord): void {
    this.hud.setSlots(record.slots);
    this.inventoryScreen.setSlots(record.slots, record.selectedSlot);
    this.markMetaDirty();
  }

  // --- inventory screen ----------------------------------------------------------------

  /**
   * Opens the inventory over the running game. The player gets no movement or look input
   * while it is open; in mouse mode the mouse is set free for it.
   */
  private openInventory(): void {
    if (!this.meta || this.paused || this.inventoryOpen) return;
    this.inventoryOpen = true;
    this.touch?.tracker.reset();
    this.input.reset();
    const record = this.session.record;
    this.inventoryScreen.setSlots(record.slots, record.selectedSlot);
    this.inventoryScreen.setVisible(true);
    if (this.pauseScreen && this.mode === 'mouse' && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  /**
   * Closes the inventory and goes on playing. In mouse mode the mouse is captured again;
   * if the browser refuses (it may, right after Esc), the pause menu offers "Click to
   * continue" instead, so the player is never left without the mouse.
   */
  private closeInventory(): void {
    if (!this.inventoryOpen) return;
    this.hideInventory();
    if (!this.pauseScreen || this.mode !== 'mouse') return;
    this.requestPointerLock();
    window.setTimeout(() => this.pauseWithoutPointerLock(), POINTER_LOCK_WAIT_MS);
  }

  private hideInventory(): void {
    this.inventoryOpen = false;
    this.inventoryScreen.setVisible(false);
  }

  /** Mouse mode is played with a captured mouse; without it the pause menu shows. */
  private pauseWithoutPointerLock(): void {
    if (this.mode !== 'mouse' || this.inventoryOpen || this.paused || !this.meta) return;
    if (!this.input.pointerLocked) this.setPaused(true);
  }

  private onActionResult(action: Action, result: ActionResult): void {
    this.lastResult = result;
    // A malformed value is refused and reported as it came: it may not be an object.
    if (!result.ok && (typeof action !== 'object' || action === null)) return;
    if (action.kind === 'startBreak') {
      // The break runs from now on, or it does not start at all.
      this.breakActive = result.ok;
      if (!result.ok && result.reason === 'full') this.fullUntilMs = this.nowMs() + NOTICE_MS;
    }
    if (!result.ok) return;
    if (action.kind === 'selectSlot') this.hud.setSelected(this.selectedSlot, true);
    if (action.kind === 'break') this.breakActive = false;
    for (const notice of result.notices) this.showPickup(notice.item, notice.count);
  }

  /** "+1 Stone"; another pickup of the same item while it shows counts up. */
  private showPickup(item: number, count: number): void {
    const now = this.nowMs();
    const shown = this.pickup;
    const total =
      shown && shown.item === item && now <= shown.untilMs ? shown.count + count : count;
    this.pickup = { item, count: total, untilMs: now + NOTICE_MS };
  }

  start(): void {
    this.lastFrameMs = performance.now();
    requestAnimationFrame((ms) => this.frame(ms));
  }

  /**
   * Switches between mouse mode and touch mode. Touch mode has the on-screen controls,
   * no pointer lock, a lower pixel ratio and its own default render distance.
   */
  private setMode(mode: InputMode): void {
    this.mode = mode;
    const touch = mode === 'touch';
    this.root.classList.toggle('touch-mode', touch);
    this.input.setMouseEnabled(!touch);
    if (touch && !this.touch) {
      this.touchHud = new TouchHud(this.root, this.hud.element);
      this.touchHud.setFlyAvailable(this.gameMode === 'creative');
      this.touchHud.setVisible(!this.paused);
      this.touch = new TouchControls({
        root: this.root,
        sink: this.input,
        isActive: () => !this.paused && !this.inventoryOpen,
      });
    } else if (!touch) {
      this.touch?.dispose();
      this.touch = null;
      this.touchHud?.remove();
      this.touchHud = null;
    }
    this.pauseScreen?.setMode(mode);
    this.worldMenu?.setMode(mode);
    if (!this.params.test) {
      const cap = touch ? TOUCH_PIXEL_RATIO_MAX : PIXEL_RATIO_MAX;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, cap));
      if (!hasStoredSettings(browserStorage())) {
        // Nothing was chosen yet: use the mode's default without storing it.
        const renderDistance = touch
          ? TOUCH_RENDER_DISTANCE_DEFAULT
          : DEFAULT_SETTINGS.renderDistance;
        this.useSettings({ ...this.settings, renderDistance });
        this.pauseScreen?.setSettings(this.settings);
      }
    }
    this.resize();
  }

  /**
   * The play button was activated. In mouse mode the browser is asked to capture the
   * mouse and the game resumes once the lock is granted; in touch mode it resumes at once.
   */
  private requestPlay(via: InputMode | null): void {
    if (!this.meta) return;
    this.pauseScreen?.setHint('');
    // `touch=1` pins touch mode; otherwise the way the button was pressed decides.
    if (via && via !== this.mode && !this.params.touch) this.setMode(via);
    if (this.mode === 'touch') {
      this.enterFullscreen();
      if (!this.isPortrait()) this.setPaused(false);
      return;
    }
    this.requestPointerLock();
  }

  /**
   * Touch mode: a tap on a play or continue button also enters fullscreen, where the
   * browser has it (not on iPhones). Must run inside the tap's event handler. A refusal
   * is silent; the fullscreen button of the menu stays for a deliberate try.
   */
  private enterFullscreen(): void {
    if (this.fullscreenDeclined || document.fullscreenElement) return;
    const root = document.documentElement as HTMLElement & {
      requestFullscreen?: () => Promise<void> | undefined;
    };
    if (typeof root.requestFullscreen !== 'function') return;
    try {
      root.requestFullscreen()?.catch(() => {});
    } catch {
      // Some browsers throw instead of rejecting.
    }
  }

  private requestPointerLock(): void {
    try {
      // Older browsers return nothing, newer ones a promise that rejects on failure.
      const result = this.renderer.canvas.requestPointerLock() as Promise<void> | undefined;
      result?.catch(() => this.onPointerLockError());
    } catch {
      this.onPointerLockError();
    }
  }

  private onPointerLockChange(): void {
    if (this.mode === 'touch') return;
    // While a world is still being opened, `startWorld` looks at the lock when it is there.
    if (!this.meta) return;
    // The inventory sets the mouse free without pausing.
    if (this.inventoryOpen) return;
    this.setPaused(!this.input.pointerLocked);
  }

  private onPointerLockError(): void {
    // Browsers refuse to lock again for a moment after Esc; a second click works.
    this.pauseScreen?.setHint('The browser did not capture the mouse yet. Please click again.');
    this.pauseWithoutPointerLock();
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    if (this.pauseScreen) {
      this.showScreen(paused ? 'pause' : 'play');
    } else {
      this.hud.setVisible(!paused);
      this.touchHud?.setVisible(!paused);
    }
    if (paused) {
      // A menu over the game closes the inventory.
      this.hideInventory();
      this.touch?.tracker.reset();
      this.input.reset();
      void this.saveNow();
    } else {
      this.pauseScreen?.setResumeMode();
      // Do not let the time spent paused turn into a burst of simulation steps.
      this.accumulator = 0;
      this.lastFrameMs = performance.now();
    }
  }

  /** Applies settings live and stores them. */
  private applySettings(settings: Settings): void {
    this.useSettings(settings);
    saveSettings(browserStorage(), settings);
  }

  private useSettings(settings: Settings): void {
    this.settings = settings;
    this.renderer.setFov(settings.fov);
    this.renderer.setRenderDistance(settings.renderDistance);
    this.chunkManager.setRadius(settings.renderDistance);
    if (this.chunkManager.pending > 0) this.framesSinceIdle = 0;
  }

  private setDebugVisible(visible: boolean): void {
    this.debug.setVisible(visible);
    this.pauseScreen?.setDebugChecked(visible);
  }

  /** Touch mode is played in landscape only. Test mode has a fixed view and no menu. */
  private isPortrait(): boolean {
    return this.mode === 'touch' && !this.params.test && window.innerHeight > window.innerWidth;
  }

  /** Shows the rotate hint while the device is upright and pauses the game for it. */
  private updateOrientation(): void {
    // Entering or leaving fullscreen can report odd sizes for a moment; the view is
    // looked at again when it has settled.
    const portrait = this.isPortrait() && performance.now() >= this.orientationQuietUntil;
    this.touchHud?.setRotateVisible(portrait);
    if (portrait && !this.paused) this.setPaused(true);
  }

  private resize(): void {
    this.updateOrientation();
    if (this.params.test) {
      // Fixed logical resolution so screenshots do not depend on the window.
      this.root.style.width = `${TEST_VIEW_WIDTH}px`;
      this.root.style.height = `${TEST_VIEW_HEIGHT}px`;
      this.renderer.setSize(TEST_VIEW_WIDTH, TEST_VIEW_HEIGHT);
    } else {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  private frame(ms: number): void {
    requestAnimationFrame((next) => this.frame(next));
    const elapsed = Math.max(0, Math.min((ms - this.lastFrameMs) / 1000, 0.25));
    this.lastFrameMs = ms;
    this.fpsFrames++;
    this.fpsTime += elapsed;
    if (this.fpsTime >= 0.5) {
      this.fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }

    // In test mode the simulation only advances through `__mc.step()`.
    if (!this.params.test && !this.paused) {
      this.accumulator += elapsed;
      let steps = 0;
      while (this.accumulator >= SIM_DT && steps < MAX_STEPS_PER_FRAME) {
        this.simulate();
        this.accumulator -= SIM_DT;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
    }

    if (!this.paused && !this.inventoryOpen) {
      const look = this.input.consumeLook();
      this.applyLookPixels(look.dx, look.dy);
      if (this.touch) {
        const drag = this.touch.tracker.consumeLook();
        this.applyTouchLook(drag.dx, drag.dy);
      }
    }

    if (this.meta) this.updateChunks();
    this.autosave.tick(performance.now());
    if (this.screen === 'pause') {
      const failed = this.autosave.lastError !== null;
      this.pauseScreen?.setSaveState(
        failed ? SAVE_FAILED_TEXT : this.autosave.dirty ? 'Saving…' : 'Saved',
      );
    }
    this.draw(this.params.test ? 1 : this.accumulator / SIM_DT);

    if (this.chunkManager.pending === 0) {
      this.framesSinceIdle++;
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      for (const resolve of waiters) resolve();
    } else {
      this.framesSinceIdle = 0;
    }
  }

  /** One fixed simulation step. */
  private simulate(): void {
    this.rememberPosition();
    stepPlayer(this.player, this.readMoveInput(), this.world, SIM_DT);
    if (respawnIfFallen(this.player, this.spawnPosition())) this.rememberPosition();
    // The step is over: actions of this step carry its end time.
    this.simSteps++;
    this.repeatHeldAction();
    // Pose and time of day are part of the world's record.
    this.markMetaDirty();
    this.time = advanceTime(this.time, SIM_DT, this.params.freeze);
  }

  /**
   * Holding a mouse button repeats its action at a fixed interval. In Gathering only
   * placing repeats; a held break button works on one block for its break time.
   */
  private repeatHeldAction(): void {
    const timed = this.gameMode === 'gathering';
    if (timed) this.continueBreak();
    const breaking = !timed && this.input.isHeld('break');
    const placing = this.input.isHeld('place');
    if (!breaking && !placing) {
      this.repeatTimer = 0;
      return;
    }
    this.repeatTimer += SIM_DT;
    // The small tolerance keeps 15 steps of 1/60 s from falling just short of 250 ms.
    if (this.repeatTimer < ACTION_REPEAT_MS / 1000 - 1e-9) return;
    this.repeatTimer = 0;
    if (breaking) this.breakTarget();
    else this.placeAtTarget();
  }

  /**
   * Gathering: one step of a timed break. A press on a block submits `startBreak`;
   * looking at another block, or pressing again after a release, starts over; when the
   * block's time is up `break` follows, and holding on starts the next block.
   */
  private continueBreak(): void {
    if (!this.input.isHeld('break')) {
      this.breakActive = false;
      return;
    }
    this.updateTarget();
    const t = this.target;
    if (!t) {
      this.breakActive = false;
      return;
    }
    const started = this.session.record.breaking;
    const same = started && started.x === t.x && started.y === t.y && started.z === t.z;
    if (!this.breakActive || !started || !same) {
      this.breakActive = false;
      this.session.submit({ kind: 'startBreak', x: t.x, y: t.y, z: t.z });
      return;
    }
    const required = breakTimeMs(t.id) ?? 0;
    // The tolerance keeps 36 steps of 1/60 s from falling just short of 600 ms.
    if (this.nowMs() - started.startMs < required - 1e-6) return;
    this.session.submit({ kind: 'break', x: t.x, y: t.y, z: t.z });
    this.updateTarget();
  }

  /** The timed break on screen, or null while none runs. */
  private breakView(): BreakView | null {
    const started = this.session.record.breaking;
    const t = this.target;
    if (!this.breakActive || !started || !t || !this.input.isHeld('break')) return null;
    if (started.x !== t.x || started.y !== t.y || started.z !== t.z) return null;
    const required = breakTimeMs(t.id) ?? 0;
    const elapsed = this.nowMs() - started.startMs;
    const progress = required > 0 ? Math.max(0, Math.min(1, (elapsed + 1e-6) / required)) : 1;
    return { x: started.x, y: started.y, z: started.z, progress };
  }

  /** Break progress, pickup notice and hints of the HUD. */
  private updateHudStatus(): void {
    const view = this.breakView();
    // Five stages of cracks over the break time.
    const stage = view ? Math.min(CRACK_STAGES - 1, Math.floor(view.progress * CRACK_STAGES)) : 0;
    this.renderer.setBreakOverlay(view, stage);
    this.hud.setBreakProgress(view ? view.progress : null);
    const now = this.nowMs();
    const pickup = this.pickup && now <= this.pickup.untilMs ? this.pickup : null;
    this.hud.setNotice(pickup ? `+${pickup.count} ${itemLabel(pickup.item)}` : null);
    this.hud.setMessage(now <= this.fullUntilMs ? TEXT_INVENTORY_FULL : null);
  }

  /** Finds the block the player is looking at, within reach. */
  private updateTarget(): void {
    const p = this.player;
    const [dx, dy, dz] = viewDirection(p.yaw, p.pitch);
    this.target = raycast(
      (x, y, z) => this.world.getBlock(x, y, z),
      p.x,
      eyeY(p),
      p.z,
      dx,
      dy,
      dz,
      REACH,
    );
  }

  private breakTarget(): void {
    this.updateTarget();
    const t = this.target;
    if (!t) return;
    this.session.submit({ kind: 'break', x: t.x, y: t.y, z: t.z });
    this.updateTarget();
  }

  private placeAtTarget(): void {
    this.updateTarget();
    const t = this.target;
    if (!t) return;
    this.session.submit({
      kind: 'place',
      x: t.x + t.face[0],
      y: t.y + t.face[1],
      z: t.z + t.face[2],
      slot: this.session.record.selectedSlot,
    });
    this.updateTarget();
  }

  private selectSlot(slot: number): void {
    // Wrap around in both directions (mouse wheel). Actions count slots from 0.
    const wrapped = (((slot - 1) % HOTBAR_SLOTS) + HOTBAR_SLOTS) % HOTBAR_SLOTS;
    this.session.submit({ kind: 'selectSlot', slot: wrapped });
  }

  private rememberPosition(): void {
    this.previous.x = this.player.x;
    this.previous.y = this.player.y;
    this.previous.z = this.player.z;
  }

  private spawnPosition(): { x: number; y: number; z: number } {
    return { x: this.spawn.x + 0.5, y: this.spawn.y, z: this.spawn.z + 0.5 };
  }

  private readMoveInput(): MoveInput {
    const input = this.input;
    const axes = input.moveAxes();
    return {
      forward: axes.forward,
      strafe: axes.strafe,
      jump: input.isHeld('jump'),
      sprint: input.isHeld('sprint'),
      descend: input.isHeld('descend'),
    };
  }

  private handlePress(action: PressAction): void {
    switch (action.type) {
      case 'toggleFly':
        // Gathering worlds are walked and swum.
        if (this.gameMode === 'gathering') break;
        this.player.mode = this.player.mode === 'fly' ? 'walk' : 'fly';
        this.player.vy = 0;
        break;
      case 'break':
        this.repeatTimer = 0;
        if (this.gameMode === 'gathering') {
          // A new press starts over, also on the block of the press before.
          this.breakActive = false;
          this.continueBreak();
        } else {
          this.breakTarget();
        }
        break;
      case 'place':
        this.repeatTimer = 0;
        this.placeAtTarget();
        break;
      case 'selectSlot':
        this.selectSlot(action.slot);
        break;
      case 'cycleSlot':
        this.selectSlot(this.selectedSlot + action.direction);
        break;
      case 'toggleDebug':
        this.setDebugVisible(!this.debug.visible);
        break;
      case 'inventory':
        this.openInventory();
        break;
      case 'menu':
        // Test mode has no menu to come back from.
        if (this.pauseScreen) this.setPaused(true);
        break;
    }
  }

  /** Mouse movement in pixels → rotation. Moving right turns right, moving up looks up. */
  private applyLookPixels(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    const scale = LOOK_RADIANS_PER_PIXEL * this.settings.mouseSensitivity;
    applyLook(this.player, -dx * scale, -dy * scale);
    this.markMetaDirty();
  }

  /** A touch drag in CSS pixels → rotation, with the same signs as the mouse. */
  private applyTouchLook(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    const scale = TOUCH_LOOK_RADIANS_PER_PIXEL * this.settings.touchSensitivity;
    applyLook(this.player, -dx * scale, -dy * scale);
    this.markMetaDirty();
  }

  private updateChunks(): void {
    this.chunkManager.setCenter(toChunkCoord(this.player.x), toChunkCoord(this.player.z));
    this.chunkManager.update(() => performance.now(), CHUNK_BUDGET_MS);
  }

  /** Renders one frame; `alpha` blends from the previous to the current simulation state. */
  private draw(alpha: number): void {
    const p = this.player;
    const prev = this.previous;
    this.updateTarget();
    this.renderer.setHighlight(this.target);
    this.updateHudStatus();
    const x = prev.x + (p.x - prev.x) * alpha;
    const y = prev.y + (p.y - prev.y) * alpha;
    const z = prev.z + (p.z - prev.z) * alpha;
    this.renderer.setCamera({ x, y, z, yaw: p.yaw, pitch: p.pitch });
    const underwater = this.isUnderWater(x, y + PLAYER_EYE_HEIGHT, z);
    this.hud.setUnderwater(underwater);
    this.renderer.setEnvironment(this.time, underwater);
    this.renderer.render();
    if (this.touchHud && this.touch) {
      this.touchHud.setStick(this.touch.tracker.stick);
      this.touchHud.setFlying(p.mode === 'fly');
    }
    if (this.debug.visible) this.updateDebug();
  }

  private updateDebug(): void {
    const p = this.player;
    const stats = this.renderer.getStats();
    const t = this.target;
    this.debug.update({
      fps: this.fps,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      pitch: p.pitch,
      chunkX: toChunkCoord(p.x),
      chunkZ: toChunkCoord(p.z),
      loaded: this.chunkManager.loaded,
      pending: this.chunkManager.pending,
      drawCalls: stats.drawCalls,
      triangles: stats.triangles,
      seed: this.world.seed,
      time: this.time,
      mode: p.mode,
      onGround: p.onGround,
      inWater: p.inWater,
      target: t ? `${getBlockDef(t.id).name} at ${t.x} / ${t.y} / ${t.z}` : null,
    });
  }

  /** Whether a point (the camera) is inside water, below the lowered water surface. */
  private isUnderWater(x: number, y: number, z: number): boolean {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    if (this.world.getBlock(bx, by, bz) !== Block.WATER) return false;
    return y - by < 1 - WATER_SURFACE_DROP || this.world.getBlock(bx, by + 1, bz) === Block.WATER;
  }

  /** Edits remesh immediately, outside the per-frame budget. */
  private remeshAround(x: number, z: number): void {
    for (const { cx, cz } of chunksAffectedByEdit(x, z)) this.chunkManager.remesh(cx, cz);
  }

  /** Test tool: sets a block directly, past the action layer. */
  private testSetBlock(x: number, y: number, z: number, id: number): void {
    if (!this.world.setBlock(x, y, z, id)) return;
    this.markChunkDirty(x, z);
    this.remeshAround(x, z);
  }

  /** Test tool: puts items into the inventory, past the action layer. */
  private testGive(item: number, count: number): void {
    if (!isItem(item) || !Number.isInteger(count) || count < 1) return;
    const record = this.session.record;
    const { slots } = addItems(record.slots, item, count);
    this.session.replaceRecord({ ...record, slots });
  }

  /** Test tool: empties all slots. */
  private testClearInventory(): void {
    const record = this.session.record;
    this.session.replaceRecord({ ...record, slots: record.slots.map(() => null) });
  }

  /** Test tool: hands any value to the session as an action and returns the answer. */
  private testSubmit(action: unknown): ActionResult | null {
    this.lastResult = null;
    this.session.submit(action as Action);
    this.updateTarget();
    return this.lastResult;
  }

  private getState(): GameState {
    const p = this.player;
    const stats = this.renderer.getStats();
    const record = this.session.record;
    return {
      seed: this.world.seed,
      time: this.time,
      paused: this.paused,
      mode: this.gameMode,
      world: this.meta
        ? {
            id: this.meta.id,
            name: this.meta.name,
            generatorVersion: this.meta.generatorVersion,
          }
        : null,
      save: {
        dirty: this.autosave.dirty,
        lastError: this.autosave.lastError,
        lastSaveMs: this.lastSaveMs,
        lastLoadMs: this.lastLoadMs,
      },
      inventory: {
        slots: record.slots.map((slot) => (slot ? { ...slot } : null)),
        selected: record.selectedSlot,
      },
      touch: this.mode === 'touch',
      ui: { screen: this.inventoryOpen ? 'inventory' : this.pauseScreen ? this.screen : 'play' },
      player: {
        x: p.x,
        y: p.y,
        z: p.z,
        yaw: p.yaw,
        pitch: p.pitch,
        mode: p.mode,
        onGround: p.onGround,
        inWater: p.inWater,
      },
      chunks: {
        loaded: this.chunkManager.loaded,
        pending: this.chunkManager.pending,
        meshed: this.chunkManager.meshed,
        generated: this.world.chunkCount,
      },
      render: {
        drawCalls: stats.drawCalls,
        triangles: stats.triangles,
        geometries: stats.geometries,
        fov: this.renderer.fov,
        pixelRatio: this.renderer.pixelRatio,
        renderDistance: this.settings.renderDistance,
      },
      selectedSlot: this.selectedSlot,
      breaking: this.breakView(),
      target: this.target
        ? {
            x: this.target.x,
            y: this.target.y,
            z: this.target.z,
            id: this.target.id,
            face: this.target.face,
          }
        : null,
    };
  }

  private setPlayer(patch: PlayerPatch): void {
    const p = this.player;
    if (patch.x !== undefined) p.x = patch.x;
    if (patch.y !== undefined) p.y = patch.y;
    if (patch.z !== undefined) p.z = patch.z;
    // Fly mode cannot be entered in a Gathering world, also not by a test.
    if (patch.mode !== undefined && (patch.mode === 'walk' || this.gameMode === 'creative')) {
      p.mode = patch.mode;
    }
    p.vx = 0;
    p.vy = 0;
    p.vz = 0;
    // Route angles through applyLook so they are wrapped and clamped like mouse input.
    const yaw = patch.yaw ?? p.yaw;
    const pitch = patch.pitch ?? p.pitch;
    p.yaw = 0;
    p.pitch = 0;
    applyLook(p, yaw, pitch);
    this.rememberPosition();
    this.markMetaDirty();
    // A teleport changes which chunks are needed: not idle until the next frame says so.
    this.updateChunkCenter();
  }

  private updateChunkCenter(): void {
    this.chunkManager.setCenter(toChunkCoord(this.player.x), toChunkCoord(this.player.z));
    if (this.chunkManager.pending > 0) this.framesSinceIdle = 0;
  }

  private createTestApi(): TestApi {
    return {
      isReady: () =>
        this.meta !== null && this.chunkManager.pending === 0 && this.framesSinceIdle > 0,
      whenIdle: () =>
        new Promise<void>((resolve) => {
          this.idleWaiters.push(resolve);
        }),
      getState: () => {
        this.updateTarget();
        return this.getState();
      },
      setPlayer: (patch) => this.setPlayer(patch),
      look: (dx, dy) => {
        // As the mouse: it turns nothing while the inventory is open.
        if (!this.inventoryOpen) this.applyLookPixels(dx, dy);
      },
      getBlock: (x, y, z) => this.world.getBlock(x, y, z),
      setBlock: (x, y, z, id) => this.testSetBlock(x, y, z, id),
      submit: (action) => this.testSubmit(action),
      surfaceY: (x, z) => this.world.surfaceY(x, z),
      terrainChecksum: () => terrainChecksum(this.world.seed, this.world.generatorVersion),
      setTime: (t) => {
        this.time = wrapTime(t);
        this.markMetaDirty();
      },
      save: () => this.saveNow(),
      give: (item, count) => this.testGive(item, count),
      clearInventory: () => this.testClearInventory(),
      openWorld: (name, seed, mode) => this.openNamedWorld(name, seed, mode ?? this.params.mode),
      step: (n) => {
        for (let i = 0; i < n; i++) this.simulate();
        this.updateChunkCenter();
        this.draw(1);
      },
    };
  }
}
