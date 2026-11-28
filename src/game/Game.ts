// Game: wires world, player, renderer and UI together and runs the fixed-step loop.
import type { Action } from '../actions/actions';
import { type ActionResult, type BlockChange, heldItem } from '../actions/apply';
import { type GameMode, TRACK_HIDDEN, createPlayerRecord } from '../actions/playerRecord';
import { type PlayerRecord } from '../actions/playerRecord';
import { type ChestViewers, LOCAL_PLAYER_ID, LocalSession, type Session } from '../actions/Session';
import { type BenchResult, issueText, parseIssueBody } from '../bench/benchReport';
import { type BenchHost, BenchRunner } from '../bench/BenchRunner';
import { SAMPLE_RESULT } from '../bench/sampleResult';
import type { GuestScript, SuiteKind } from '../bench/scenarios';
import { GamepadSource, type PadTarget } from '../input/GamepadSource';
import { Input, type PressAction } from '../input/Input';
import { PadButton, type PadFrame } from '../input/padMapping';
import { breakTimeMs, missingTool } from '../items/hardness';
import { addItems } from '../items/inventory';
import { isItem, itemLabel } from '../items/items';
import { RECIPES, type RecipeStatus, getRecipe, listRecipes, stationsNear } from '../items/recipes';
import { TouchControls } from '../input/TouchControls';
import { MovementWorld, type MoveInput, respawnIfFallen, stepPlayer } from '../player/physics';
import { applyLook, createPlayer, eyeY, type PlayerState, viewDirection } from '../player/player';
import { Renderer } from '../render/Renderer';
import {
  type LoadedWorld,
  type WorldEdits,
  type WorldMeta,
  makeWorldId,
  decodeProgress,
  metaGen,
  normalizeName,
  seedFromText,
} from '../save/saveFormat';
import { MemoryStore, type WorldStore } from '../save/WorldStore';
import { BenchScreen } from '../ui/BenchScreen';
import { DebugOverlay, chestsRow } from '../ui/DebugOverlay';
import { FocusManager } from '../ui/FocusManager';
import type { PadHint } from '../ui/PadHints';
import { glyphSheet } from '../ui/padGlyphs';
import { figureSheet } from '../ui/figureIcons';
import { type ChestHintInput, Hud } from '../ui/Hud';
import { ChestScreen } from '../ui/ChestScreen';
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
import type { NetTestScreen } from '../ui/NetTestScreen';
import type { Network } from '../net/transport';
import type { Welcome } from '../net/protocol';
import { worldHash } from '../net/snapshot';
import { Multiplayer } from './multiplayer';
import { JoinSection, type RoomListView, TEXT_UNAVAILABLE } from '../ui/JoinSection';
import { RoomPanel } from '../ui/RoomPanel';
import { PlayerSection } from '../ui/PlayerSection';
import { lookForKey } from '../player/looks';
import { CRACK_STAGES } from '../render/textures/cracks';
import { Block, getBlockDef } from '../world/blocks';
import {
  type StateChange,
  type WorldStates,
  emptyChest,
  summarizeStates,
} from '../world/blockState';
import { ChunkManager } from '../world/ChunkManager';
import { PerfStats } from './perfStats';
import { chunkKey, toChunkCoord } from '../world/chunk';
import { advanceTime, wrapTime } from '../world/dayNight';
import { findSpawn, type SpawnPoint } from '../world/generation/spawn';
import { getTerrain, terrainChecksumAt } from '../world/generation/terrain';
import { TerrainV3, caveSites } from '../world/generation/terrainV3';
import { TerrainV4, lootSites } from '../world/generation/terrainV4';
import {
  type WorldGen,
  type WorldOptions,
  debugWorldGen,
  optionsOf,
} from '../world/generation/worldOptions';
import { lightChecksumOf } from '../world/light/lightChunk';
import { blockOf, skyOf } from '../world/light/lightRules';
import { type RayHit, raycast } from '../world/raycast';
import { World } from '../world/World';
import { Autosave, type SaveBatch } from './autosave';
import { BackGuard } from './backGuard';
import { heapMb, readBenchEnv } from './benchEnv';
import {
  ACTION_REPEAT_MS,
  BENCH_SEED,
  BENCH_START_DELAY_MS,
  BENCH_STORAGE_KEY,
  BENCH_TIME,
  CHUNK_BUDGET_MS,
  CRAFT_HOLD_DELAY_MS,
  CRAFT_REPEAT_MS,
  GENERATOR_VERSION,
  HOTBAR_SLOTS,
  LOOK_RADIANS_PER_PIXEL,
  MAX_STEPS_PER_FRAME,
  NOTICE_MS,
  PROGRESS_NOTICE_MS,
  PIXEL_RATIO_MAX,
  PLAYER_EYE_HEIGHT,
  REACH,
  REACH_TOLERANCE,
  ROOM_LIST_REFRESH_MS,
  BOOK_VERSION,
  SAVE_FORMAT_VERSION,
  SIM_DT,
  SIM_HZ,
  SMELT_MS,
  START_TIME_OF_DAY,
  TEST_RENDER_DISTANCE,
  TEST_VIEW_HEIGHT,
  TEST_VIEW_WIDTH,
  TOUCH_LOOK_RADIANS_PER_PIXEL,
  TOUCH_PIXEL_RATIO_MAX,
  TOUCH_RENDER_DISTANCE_DEFAULT,
  WATER_SURFACE_DROP,
} from './config';
import {
  EMPTY_PROGRESS,
  type ProgressOutcome,
  type WorldProgress,
  completeProgress,
  countOf,
  levelOf,
  maxLevelXp,
  nextLevelXp,
  featureUnlocked,
  openChapter,
  recipeUnlocked,
  tasksOf,
  unlockText,
} from '../progress/progress';
import { radarFocus } from '../radar/focus';
import type { MapTab } from '../ui/MapTab';
import type { RadarKind } from '../radar/kinds';
import { Radar } from './Radar';
import { type Task, unlockOf } from '../progress/tables';
import {
  bookView,
  featureLockText,
  lockedText,
  noticeTexts,
  progressRow,
  trackedTask,
  trackerCount,
  trackerText,
} from '../progress/view';
import { ProgressNotice } from '../ui/ProgressNotice';
import { IdbStore } from './idbStore';
import { type NetConfig, readNetConfig } from './netConfig';
import {
  type BenchPhase,
  type BenchStop,
  type GameState,
  type PlayerPatch,
  type TestApi,
  installTestApi,
} from './testApi';
import type { GameParams } from './urlParams';
import { type ReleaseLock, acquireWorldLock } from './worldLock';

/** If the browser has not captured the mouse this long after a request, the game pauses. */
const POINTER_LOCK_WAIT_MS = 1000;
/** Time the view may need to settle after entering or leaving fullscreen. */
const FULLSCREEN_SETTLE_MS = 500;
/** The touch layout's gap (`--touch-gap` in `ui.css`): the circle starts this far below the bag. */
const TOUCH_CIRCLE_GAP_PX = 8;

/** While the recipe list is open, the stations around the player are looked for this often. */
const STATION_CHECK_STEPS = 15;

/** What covers the view outside test mode: a menu, or nothing while playing. */
type Screen = 'worlds' | 'settings' | 'pause' | 'play' | 'bench' | 'nettest';

/** Why a performance test run was thrown away, as the "Interrupted" screen says it. */
const BENCH_STOP_TEXT: Record<BenchStop, string> = {
  hidden: 'The page was hidden: the tab was switched, the screen went off or the app left.',
  portrait: 'The device was turned upright.',
  resize: 'The size of the view changed: the window was resized or fullscreen was left.',
  cancel: 'The test was cancelled.',
};

/** A performance test run in progress, with what it has to put back afterwards. */
interface BenchRun {
  runner: BenchRunner;
  /** Nothing is loaded or measured before this time: the view may still settle. */
  startAt: number;
  /** Canvas size the run started with; 0 until its first frame. */
  width: number;
  height: number;
  /** Settings and debug overlay as they were before the run. */
  settings: Settings;
  debug: boolean;
  wake: WakeLockSentinel | null;
  wakeGranted: boolean;
  /** Most figures of other players drawn at once (the scenario `players`). */
  figures: number;
}

type SimRoomModule = typeof import('../bench/simGuests');

/** A session as `Game` uses it; the test tools may replace a record where it can. */
type GameSession = Session & {
  replaceRecord?: (record: PlayerRecord) => void;
  /** Single-player only: the task book (Phase 8). */
  replaceProgress?: (progress: WorldProgress) => void;
  notePose?: (y: number) => void;
};

/** A problem the world menu tells the player about. */
class MenuProblem extends Error {}

const TEXT_OTHER_TAB = 'This world is open in another tab.';
const TEXT_NOT_OPENED = 'This world could not be opened.';
const TEXT_NOT_CREATED = 'The world could not be created. Free up storage space.';
const TEXT_NO_STORAGE = 'Worlds cannot be saved in this browser window.';
const TEXT_INVENTORY_FULL = 'Inventory full';
const TEXT_CHEST_FULL = "No room for the chest's items";
const TEXT_CHEST_NOT_EMPTY = 'Empty the chest first';
/** The hint bar of the chest screen (Phase 8 part B3a2). */
const CHEST_HINTS: PadHint[] = [
  { glyphs: ['A'], text: 'Move' },
  { glyphs: ['X'], text: 'Quick move' },
  { glyphs: ['Y'], text: 'Close' },
];
const TEXT_NEEDS_PICKAXE = 'Needs a pickaxe';
const TEXT_NEEDS_SUPPORT = 'Needs a block underneath';
const TEXT_NEEDS_STONE_PICKAXE = 'Needs a stone pickaxe';
const TEXT_PAD_CONNECTED = 'Controller connected';
const TEXT_PAD_DISCONNECTED = 'Controller disconnected';
const TEXT_PAD_UNSUPPORTED = 'This controller is not supported';

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
  /** The world as movement sees it (leaves passable unless "Collide with leaves"). */
  private movement: MovementWorld;
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
  /** The radar circle and the scans behind it and the Map tab (Phase 8 part B1). */
  private readonly radar: Radar;
  /** The circle's task focus, set with the tracker. */
  private radarFocusKind: RadarKind | null = null;
  /** The radar was unlocked and on at the last step (a change makes the scan stale). */
  private radarActive = false;
  /** The Map tab while the radar draws on it (open and unlocked). */
  private mapSurface: MapTab | null = null;
  private readonly debug: DebugOverlay;
  private readonly pauseScreen: PauseScreen | null = null;
  /** The start screen with the list of worlds; like the pause screen not in test mode. */
  private readonly worldMenu: WorldMenu | null = null;
  private screen: Screen = 'play';
  /** Screens of the performance test; like the menus not in test mode. */
  private readonly benchScreen: BenchScreen | null = null;
  /** Where the performance test is: on one of its screens, running, or not open (null). */
  private benchPhase: BenchPhase | null = null;
  private benchSuite: SuiteKind = 'full';
  private bench: BenchRun | null = null;
  /** The simulated guests of the scenario `players`, their chunk, and what was asked for. */
  private simRoom: import('../bench/simGuests').SimRoom | null = null;
  private simModule: Promise<SimRoomModule | null> | null = null;
  private simWanted: { script: GuestScript } | null = null;
  private lastBenchFigures = 0;
  /** The result on the result screen. */
  private benchResult: BenchResult | null = null;
  private benchStop: BenchStop | null = null;
  private readonly inventoryScreen: InventoryScreen;
  /** Where multiplayer finds its servers (build variables, URL parameters). */
  private readonly netConfig: NetConfig;
  /** The network test, opened from the settings page; like the menus not in test mode. */
  private netTestScreen: NetTestScreen | null = null;
  /** The network test's screen is being loaded (its own chunk). */
  private netTestLoading = false;
  /** The inventory covers the view. Unlike the menus it does not pause the world. */
  private inventoryOpen = false;
  /** The chest screen (Phase 8 part B3a2), and the chest it shows while it is open. */
  private readonly chestScreen: ChestScreen;
  private chestOpen: { x: number; y: number; z: number } | null = null;
  /** An `openChest` was submitted for this cell; the screen opens on its answer. */
  private chestPending: { x: number; y: number; z: number } | null = null;
  /** The room's last `viewers` news: it reaches a guest before the answer to its `openChest`. */
  private chestViewers: ChestViewers | null = null;
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
  /** The controller: a source on top of mouse or touch mode, not a mode of its own. */
  private readonly gamepad: GamepadSource;
  /**
   * The controller is the active source: the touch controls are covered, mouse mode
   * plays without pointer lock, menus show the focus frame.
   */
  private padActive = false;
  /** A controller was used during this visit (its settings rows are shown from then on). */
  private padSeen = false;
  /** The controller's focus on the menus. */
  private readonly focus: FocusManager;
  /** Keeps the browser's Back inside the game while a menu or a world is shown. */
  private readonly backGuard: BackGuard | null = null;
  /** A controller notice in play ("Controller connected") and the action time it stays until. */
  private padNotice: { text: string; untilMs: number } | null = null;
  /** Progress notices waiting their turn, and the one shown until its time (Phase 8). */
  private progressQueue: string[] = [];
  private progressShown: { text: string; untilMs: number } | null = null;
  private readonly progressNotice: ProgressNotice;
  /** The HUD's "Locked: Level 3" after a refused craft, until this action time. */
  private lockedUntilMs = -1;
  private lockedText = '';
  /** The controller notice last shown, which a menu clears once the controller is used. */
  private menuPadNotice: string | null = null;
  /** Smoothed frames per second for the debug overlay. */
  private fps = 0;
  private readonly perf = new PerfStats();
  /** Time spent on chunk jobs since the last frame was recorded. */
  private chunkWorkMs = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private readonly root: HTMLElement;
  /**
   * Every change to blocks and to the player's items goes through the session: a local
   * one in single-player, the host's own door into its room, or a guest's session.
   */
  private session: GameSession;
  /** Multiplayer (Phase 6): the room this page hosts or has joined. */
  private readonly mp: Multiplayer;
  /** Test tool: the frame loop does nothing (a hidden tab). */
  private framesSuspended = false;
  /** "Join a world" on the world menu and "Playing together" in the pause menu. */
  private joinSection: JoinSection | null = null;
  private playerSection: PlayerSection | null = null;
  private roomPanel: RoomPanel | null = null;
  /** The line of the room panel ("Opening…", an error, "Link copied"). */
  private roomMessage = '';
  /** When the room list was last asked for, and whether an answer is pending. */
  private roomListAt = -Infinity;
  private roomListPending = false;
  private gameMode: GameMode = 'creative';
  /** The open world's task book (Adventure); empty in Creative. */
  private progress: WorldProgress = EMPTY_PROGRESS;
  /** Simulation steps since the world was opened: the clock of the action layer. */
  private simSteps = 0;
  /** Answer to the action submitted last (the test API returns it). */
  private lastResult: ActionResult | null = null;
  private target: RayHit | null = null;
  /** Gathering: the session confirmed the break that the held button is working on. */
  private breakActive = false;
  /**
   * Gathering: a `startBreak` or `break` was submitted and the session has not answered
   * yet. A room's host answers a moment later; until then nothing is sent again.
   */
  private breakInFlight = false;
  /** The pickup notice on screen ("+2 Dirt") and the action time until it stays. */
  private pickup: { item: number; count: number; untilMs: number } | null = null;
  /** "Inventory full" shows until this action time. */
  private fullUntilMs = -1;
  /** What the "full" message says: the inventory, or a chest's items (Phase 8 part B3a). */
  private fullText = TEXT_INVENTORY_FULL;
  /** Until when "Empty the chest first" shows, after a refused Creative break. */
  private notEmptyUntilMs = -1;
  /** Until when "Needs a block underneath" shows, after a refused torch. */
  private supportUntilMs = -1;
  /** The item in the furnace: its recipe and the action time the progress bar started. */
  private smelt: { recipe: number; startMs: number } | null = null;
  /** A "Craft" button that is held down: its recipe, and how often it has repeated. */
  private craftHold: { recipe: number; timer: number; repeats: number } | null = null;
  /** The click that ends a hold which already crafted must not craft once more. */
  private suppressCraftClick = false;
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
    this.netConfig = readNetConfig(window.location.search);
    this.mp = this.createMultiplayer();
    if (params.name) this.mp.setName(params.name);
    if (params.look !== null) this.mp.setLook(params.look);
    this.time = params.time;
    this.world = new World(0);
    this.movement = new MovementWorld(this.world);

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
    this.renderer.setBrightness(this.settings.brightness);
    const radius = this.settings.renderDistance;
    this.renderer.setRenderDistance(radius);

    this.chunkManager = this.createChunkManager(radius);
    this.spawn = { x: 0, y: 0, z: 0 };
    this.player = createPlayer(0, 0, 0);
    this.autosave = this.createAutosave();

    this.input = new Input({
      element: canvas,
      isActive: () => !this.paused && !this.overlayOpen,
      onPress: (action) => this.handlePress(action),
    });

    this.gamepad = new GamepadSource({
      input: this.input,
      target: () => this.padTarget(),
      onFrame: (frame, target, elapsedMs) => this.onPadFrame(frame, target, elapsedMs),
      onUse: () => this.setPadActive(true),
      onConnect: () => {
        this.showPadNotice(TEXT_PAD_CONNECTED);
        this.pauseScreen?.setPadWaiting(!this.padSeen);
      },
      onDisconnect: () => this.onPadDisconnect(),
      onUnsupported: () => this.showPadNotice(TEXT_PAD_UNSUPPORTED),
    });
    this.gamepad.setLook(this.settings.padSensitivity, this.settings.padInvertY);
    this.focus = new FocusManager({
      host: this.root,
      screen: () => this.focusScreen(),
      onStart: () => this.onPadStart(),
      hintsFor: (root, element) =>
        root === this.inventoryScreen.element
          ? this.inventoryHints(element)
          : root === this.chestScreen.element
            ? [...CHEST_HINTS]
            : null,
    });

    this.session = this.createSession(createPlayerRecord(this.gameMode));
    this.hud = new Hud(this.root, this.renderer.atlas.tiles, params.test);
    this.hud.setSelected(this.selectedSlot, false);
    this.radar = new Radar(this.hud.element);
    this.radar.circle.setSize(this.settings.radarSize);
    this.radar.circle.setRoomMeasure(() => this.touchCircleRoom());
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
      onCraftDown: (recipe) => {
        this.suppressCraftClick = false;
        this.craftHold = { recipe, timer: 0, repeats: 0 };
      },
      onCraftUp: () => {
        // A hold that ended by itself (nothing left to craft) has set this already.
        if (this.craftHold) this.suppressCraftClick = this.craftHold.repeats > 0;
        this.craftHold = null;
      },
      onCraftClick: (recipe) => {
        const suppressed = this.suppressCraftClick;
        this.suppressCraftClick = false;
        if (!suppressed) this.craft(recipe);
      },
      onTab: () => {
        this.refreshRecipes();
        this.refreshBook();
        this.syncMapTab();
      },
      onTrack: (task) => {
        // Choosing the row the tracker shows hides it; any other row (or any row while
        // hidden) is chosen. The action itself is a plain "set".
        const shown = this.trackedNow();
        this.session.submit({ kind: 'track', task: shown?.id === task ? TRACK_HIDDEN : task });
      },
    });
    this.chestScreen = new ChestScreen(this.root, {
      tiles: this.renderer.atlas.tiles,
      onMove: (from, to, item) => {
        const c = this.chestOpen;
        if (!c) return;
        this.session.submit({
          kind: 'chestMove',
          ...c,
          from: from.slot,
          fromChest: from.chest,
          to: to.slot,
          toChest: to.chest,
          item,
        });
      },
      onQuickMove: (from, item) => {
        const c = this.chestOpen;
        if (c) {
          this.session.submit({
            kind: 'quickMove',
            ...c,
            slot: from.slot,
            fromChest: from.chest,
            item,
          });
        }
      },
      onTakeAll: () => {
        const c = this.chestOpen;
        if (c) this.session.submit({ kind: 'takeAll', ...c });
      },
      onClose: () => this.closeChest(),
      nowMs: () => this.nowMs(),
    });
    // Above the inventory and chest screens (it comes later in the document), below the menus.
    this.progressNotice = new ProgressNotice(this.root);
    // E opens and closes the inventory, Esc closes it. Not while a text field is typed in.
    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.target instanceof HTMLInputElement) return;
      if (this.bench) {
        // A run takes no keys but the one that cancels it.
        if (e.code === 'Escape') this.interruptBench('cancel');
        return;
      }
      if (e.code === 'KeyE') {
        if (this.chestOpen) this.closeChest();
        else if (this.inventoryOpen) this.closeInventory();
        else this.openInventory();
      } else if (e.code === 'Escape' && this.chestOpen) {
        this.closeChest();
      } else if (e.code === 'Escape' && this.inventoryOpen) {
        this.closeInventory();
      } else if (e.code === 'Escape' && this.padActive && this.isPlaying()) {
        // Without pointer lock there is no lock for Esc to release: it pauses directly.
        this.setPaused(true);
      }
    });
    this.watchOtherSources(canvas);

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
        onNetTest: () => void this.openNetTest(),
      });
      document.addEventListener('fullscreenchange', () => {
        this.orientationQuietUntil = performance.now() + FULLSCREEN_SETTLE_MS;
        window.setTimeout(() => this.resize(), FULLSCREEN_SETTLE_MS + 20);
      });
      this.worldMenu = new WorldMenu(this.root, {
        mode: this.mode,
        onPlay: (id, via) => void this.startWorld(() => this.loadStoredWorld(id), via),
        onCreate: (name, seedText, mode, options, via) =>
          void this.startWorld(() => this.createStoredWorld(name, seedText, mode, options), via),
        onDelete: (id) => void this.deleteWorld(id),
        onSettings: () => this.showScreen('settings'),
        onBench: () => this.openBench(),
      });
      this.joinSection = new JoinSection({
        name: this.mp.identity.name,
        available: this.netConfig.signal !== null,
        onName: (name) => {
          this.mp.setName(name);
          this.playerSection?.setName(name);
        },
        onJoin: (code, via) => void this.joinFromMenu(code, via),
      });
      this.joinSection.setLink(params.join);
      this.worldMenu.addSection(this.joinSection.element);
      this.roomPanel = new RoomPanel({
        onOpen: () => void this.openRoomFromMenu(),
        onClose: () => {
          this.roomMessage = '';
          this.mp.leave();
        },
        onCopyLink: () => void this.copyJoinLink(),
      });
      this.pauseScreen.setRoomPanel(this.roomPanel.element);
      this.playerSection = new PlayerSection({
        name: this.mp.identity.name,
        choice: this.mp.identity.look,
        automatic: lookForKey(this.mp.identity.key),
        previewGl: params.previewGl,
        onName: (name) => {
          this.mp.setName(name);
          this.joinSection?.setName(name);
        },
        onNameCommit: () => {
          this.mp.commitName();
          this.updateRoomPanel();
        },
        onLook: (choice) => {
          this.mp.setLook(choice);
          this.updateRoomPanel();
        },
      });
      this.pauseScreen.setPlayerSection(this.playerSection.element);
      this.benchScreen = new BenchScreen(this.root, {
        onStart: (via) => this.startBench(via),
        onBack: () => this.closeBench(),
        onCancel: () => this.interruptBench('cancel'),
        onShowLast: () => this.showBenchResult(this.storedBenchResult()),
      });
      if (params.bench === 'quick') this.benchSuite = 'quick';
      this.paused = true;
      this.showScreen('worlds');
      if (params.bench === 'sample') this.showBenchResult(SAMPLE_RESULT);
      else if (params.bench !== 'off') this.openBench();
      this.backGuard = new BackGuard(
        () => this.onBrowserBack(),
        () => this.wantsBackGuard(),
      );
      document.addEventListener('pointerlockchange', () => this.onPointerLockChange());
      document.addEventListener('pointerlockerror', () => this.onPointerLockError());
      void this.openStore();
    } else if (params.save) {
      // The stored world arrives asynchronously; until then no world is open.
      void this.openStoredTestWorld();
    } else {
      // A new world in memory. It is never stored.
      this.loadWorld(
        this.withTestProgress(
          this.newWorldMeta(
            params.world,
            params.seed,
            params.time,
            params.mode,
            this.testWorldGen(),
          ),
          params.progress,
        ),
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
      if (document.visibilityState !== 'hidden') return;
      this.interruptBench('hidden');
      void this.saveNow();
    });
    window.addEventListener('pagehide', () => {
      // The others learn at once that this player or this room is gone.
      this.mp.leave();
      void this.saveNow();
    });
    installTestApi(this.createTestApi());
    // `join=CODE` in test mode joins at once (the world menu offers it otherwise).
    if (params.test && params.join) void this.joinRoom(params.join).catch(() => {});
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

  /**
   * The generator of the automatic test world: version 1, as the specs before Phase 7 part A
   * expect, unless the URL names `terrain` or `trees`.
   */
  private testWorldGen(): WorldGen {
    return this.params.testGen;
  }

  /**
   * Test tool: the automatic test world of an Adventure world starts with the book complete
   * and the player at the maximum level (`progress=all`, the default), so specs that craft
   * keep working; `fresh` starts the book. Worlds of the form are always fresh.
   */
  private withTestProgress(meta: WorldMeta, choice: 'all' | 'fresh'): WorldMeta {
    if (meta.mode !== 'gathering' || choice === 'fresh') return meta;
    return { ...meta, progress: completeProgress(), player: { ...meta.player, xp: maxLevelXp() } };
  }

  /** The record of a world that does not exist yet: at its start point, in the morning. */
  private newWorldMeta(
    name: string,
    seed: number,
    time: number,
    mode: GameMode,
    gen: WorldGen,
  ): WorldMeta {
    const spawn = findSpawn(getTerrain(seed, gen));
    const now = Date.now();
    const random = (): number => Math.floor(Math.random() * 0x100000000);
    return {
      id: makeWorldId(now, random(), random()),
      name: normalizeName(name),
      seed: seed >>> 0,
      mode,
      generatorVersion: gen.version,
      options: optionsOf(gen),
      formatVersion: SAVE_FORMAT_VERSION,
      createdMs: now,
      playedMs: now,
      time,
      pose: { x: spawn.x + 0.5, y: spawn.y, z: spawn.z + 0.5, yaw: 0, pitch: 0 },
      moveMode: 'walk',
      player: createPlayerRecord(mode),
      guests: [],
      progress: EMPTY_PROGRESS,
      book: BOOK_VERSION,
    };
  }

  /**
   * Opens a world in place: replaces world, chunk manager, chunk meshes, player and
   * session without reloading the page, and frees the GPU buffers of the old world.
   * `edits` and `states` are taken over by the new world.
   */
  loadWorld(meta: WorldMeta, edits: WorldEdits, states: WorldStates = new Map()): void {
    // A room belongs to its world: another world closes it.
    if (this.mp.role === 'host') this.mp.leave();
    this.renderer.clearChunkMeshes();
    const gen = metaGen(meta);
    this.world = new World(meta.seed, gen, edits, states);
    this.movement = this.movementOf(this.world);
    this.chunkManager = this.createChunkManager(this.settings.renderDistance);
    this.spawn = findSpawn(getTerrain(meta.seed, gen));
    this.player = createPlayer(meta.pose.x, meta.pose.y, meta.pose.z);
    applyLook(this.player, meta.pose.yaw, meta.pose.pitch);
    // Nobody flies in a Gathering world, whatever the record says.
    this.player.mode = meta.mode === 'gathering' ? 'walk' : meta.moveMode;
    this.rememberPosition();
    this.time = meta.time;
    this.gameMode = meta.mode;
    this.simSteps = 0;
    this.radar.reset();
    this.repeatTimer = 0;
    this.breakActive = false;
    this.breakInFlight = false;
    this.pickup = null;
    this.fullUntilMs = -1;
    this.notEmptyUntilMs = -1;
    this.supportUntilMs = -1;
    this.lockedUntilMs = -1;
    this.progressQueue = [];
    this.progressShown = null;
    this.target = null;
    this.stopCrafting();
    this.meta = meta;
    this.progress = meta.mode === 'gathering' ? meta.progress : EMPTY_PROGRESS;
    this.session = this.createSession(meta.player);
    this.autosave = this.createAutosave();
    this.hud.setSlots(meta.player.slots);
    this.hud.setSelected(this.selectedSlot, false);
    this.hideInventory();
    this.hideChest();
    this.chestScreen.setGameMode(meta.mode);
    this.inventoryScreen.setGameMode(meta.mode);
    this.inventoryScreen.setSlots(meta.player.slots, meta.player.selectedSlot);
    this.pauseScreen?.setWorld(meta.seed);
    this.pauseScreen?.setGameMode(meta.mode);
    this.touchHud?.setFlyAvailable(meta.mode === 'creative');
    this.refreshTracker();
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
      // While the world is open to others, its guests as they are now.
      guests: this.mp.host?.guestEntries() ?? meta.guests,
      progress: this.progress,
    };
  }

  /** A fresh autosave for the world that is open right now. */
  private createAutosave(): Autosave {
    const world = this.world;
    const store = this.store;
    return new Autosave(async (batch: SaveBatch) => {
      const meta = this.meta;
      // The world of the performance test is never stored, nor a guest's copy of a room.
      if (!meta || this.world !== world || this.bench || this.mp.role === 'guest') return;
      const start = performance.now();
      // Both calls take their snapshot at once, before anything is awaited.
      const chunks = store.saveChunks(meta.id, world.edits, batch.chunks, world.states);
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
  private async openNamedWorld(
    name: string,
    seed: number,
    mode: GameMode,
    progress: 'all' | 'fresh' = this.params.progress,
  ): Promise<void> {
    await this.saveNow();
    const start = performance.now();
    const wanted = normalizeName(name);
    const entries = await this.store.list();
    const entry = entries.find((e) => e.status === 'ok' && e.meta.name === wanted);
    if (!entry) {
      const meta = this.withTestProgress(
        this.newWorldMeta(wanted, seed, this.params.time, mode, this.testWorldGen()),
        progress,
      );
      await this.store.create(meta);
      this.loadWorld(meta, new Map());
    } else {
      const loaded = await this.store.load(entry.id);
      if (!loaded || !loaded.ok) throw new Error(`World "${wanted}" cannot be opened`);
      this.loadWorld(loaded.value.meta, loaded.value.edits, loaded.value.states);
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
    // The room list registers with the signaling server only while it is shown.
    if (screen !== 'worlds' && this.screen === 'worlds') this.mp.closeRoomList();
    if (screen === 'worlds') this.roomListAt = -Infinity;
    this.screen = screen;
    this.worldMenu?.setVisible(screen === 'worlds');
    this.pauseScreen?.setKind(screen === 'settings' ? 'settings' : 'pause');
    this.pauseScreen?.setVisible(screen === 'settings' || screen === 'pause');
    this.playerSection?.setShown(screen === 'settings' || screen === 'pause');
    if (screen === 'nettest') {
      if (!this.netTestScreen?.isOpen) this.netTestScreen?.open();
    } else if (this.netTestScreen?.isOpen) {
      this.netTestScreen.close();
    }
    this.hud.setVisible(screen === 'play');
    this.touchHud?.setVisible(screen === 'play');
    this.syncFocus();
  }

  /**
   * The focus follows a screen change at once rather than with the next frame: a screen
   * often changes outside a frame (a world finished loading), and until the frame the
   * focus would still name an element of the screen that went away.
   */
  private syncFocus(): void {
    this.focus.update();
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
    options: WorldOptions,
  ): Promise<LoadedWorld> {
    const seed = seedFromText(seedText) ?? Math.floor(Math.random() * 0x100000000);
    const time = this.params.timeFromUrl ? this.params.time : START_TIME_OF_DAY;
    const meta = this.newWorldMeta(name, seed, time, mode, {
      version: GENERATOR_VERSION,
      options,
    });
    try {
      await this.store.create(meta);
    } catch {
      throw new MenuProblem(TEXT_NOT_CREATED);
    }
    this.requestPersistence();
    this.releaseWorldLock = await acquireWorldLock(meta.id);
    return { meta, edits: new Map(), states: new Map() };
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
    if (via) this.setPadActive(false);
    if (via && via !== this.mode && !this.params.touch) this.setMode(via);
    // With the controller, mouse mode plays without capturing the mouse.
    if (this.mode === 'touch') this.enterFullscreen();
    else if (!this.padActive) this.requestPointerLock();
    try {
      const loaded = await load();
      this.loadWorld(loaded.meta, loaded.edits, loaded.states);
      // Playing a world counts as "last played", also when nothing in it changes.
      this.markMetaDirty();
      if (this.mode === 'touch') {
        if (this.isPortrait()) this.showScreen('pause');
        else this.setPaused(false);
      } else if (this.input.pointerLocked || this.padActive) {
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
    if (this.mp.role === 'guest') {
      // "Leave world": nothing of a guest's world is kept.
      this.mp.leave();
      this.leaveGuestWorld('');
      return;
    }
    // The room closes for everyone before the host's world is saved and closed.
    this.mp.leave();
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
    if (this.mp.role === 'host') this.mp.leave();
    this.meta = null;
    this.renderer.clearChunkMeshes();
    this.world = new World(0);
    this.movement = this.movementOf(this.world);
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

  // --- network (Phase 6) ----------------------------------------------------------------

  /**
   * The PeerJS network for these ICE servers. `peerjs` is loaded here, the first time it is
   * needed: single-player never requests it.
   */
  private async loadNetwork(iceServers: { urls: string }[]): Promise<Network> {
    const signal = this.netConfig.signal;
    if (!signal) throw new Error('Multiplayer is not available in this build.');
    const { createPeerNetwork } = await import('./peerTransport');
    return createPeerNetwork({ signal, iceServers }, signal);
  }

  /**
   * "Network test" on the settings page. The screen lives in a chunk of its own, loaded the
   * first time: single-player never fetches it.
   */
  private async openNetTest(): Promise<void> {
    if (this.netTestLoading || this.screen !== 'settings') return;
    if (!this.netTestScreen) {
      this.netTestLoading = true;
      try {
        const { NetTestScreen } = await import('../ui/NetTestScreen');
        this.netTestScreen ??= new NetTestScreen(this.root, {
          build: __BUILD_COMMIT__,
          config: this.netConfig,
          load: (iceServers) => this.loadNetwork(iceServers),
          randomBytes: (count) => crypto.getRandomValues(new Uint8Array(count)),
          onBack: () => this.showScreen('settings'),
        });
      } catch {
        this.pauseScreen?.setHint('The network test could not be loaded.');
        return;
      } finally {
        this.netTestLoading = false;
      }
      // The player may have left the settings page meanwhile.
      if (this.screen !== 'settings') return;
    }
    this.showScreen('nettest');
  }

  private netState(): GameState['net'] {
    const p = this.player;
    const own = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch };
    return {
      role: this.mp.role,
      status: this.mp.status,
      available: this.netConfig.signal !== null,
      build: __BUILD_COMMIT__,
      roomCode: this.mp.roomCode,
      selfId: this.mp.selfId,
      players: this.mp.players(own).map((player) => {
        const drawn = player.self ? null : this.drawnPose(player.id);
        const figure = player.self ? null : this.renderer.remotePlayers.state(player.id);
        return {
          ...player,
          renderX: drawn ? drawn.x : player.x,
          renderY: drawn ? drawn.y : player.y,
          renderZ: drawn ? drawn.z : player.z,
          renderYaw: drawn ? drawn.yaw : player.yaw,
          anim: figure?.anim ?? null,
          tagDraws: figure?.tagDraws ?? 0,
        };
      }),
      rttMs: this.mp.client?.rttMs ?? null,
      lastResult: this.mp.client?.lastResult ?? null,
      worldHash: worldHash(this.world.edits, this.world.states),
      lastError: this.mp.lastError,
      notices: this.mp.currentNotices(),
      figures: this.renderer.remotePlayers.drawn,
      test: this.netTestScreen?.isOpen ? this.netTestScreen.state : null,
    };
  }

  /** The other players' figures at their interpolated poses (after the light uniforms). */
  private updateFigures(): void {
    const sim = this.simRoom;
    const roster = sim?.roster ?? this.mp.host?.roster ?? this.mp.client?.roster ?? null;
    // The simulated guests live on the simulation's clock.
    const now = sim ? sim.nowMs : performance.now();
    this.renderer.remotePlayers.update(
      roster
        ? roster.list().map((p) => ({
            id: p.id,
            name: p.name,
            slot: p.slot,
            look: p.look,
            pose: p.poses.sample(now),
            fly: p.fly,
            busy: p.busy,
            edits: p.edits,
            snaps: p.poses.snapsAt(now),
          }))
        : [],
      (x, y, z) => this.lightAt(x, y, z),
      now,
    );
  }

  /** The preview of "Your player" for the test API: no key while it does not exist. */
  private previewState(): { preview?: { frames: number } } {
    const preview = this.playerSection?.previewState ?? null;
    return preview ? { preview } : {};
  }

  /**
   * The player holds break on a block it aims at (the others' figure swings its arm): a
   * break in progress in Gathering, the held button in Creative.
   */
  private holdingBreak(): boolean {
    return !this.paused && this.target !== null && this.input.isHeld('break');
  }

  /** Where another player is drawn now, or null if it is not drawn. */
  private drawnPose(id: number): { x: number; y: number; z: number; yaw: number } | null {
    const roster = this.mp.host?.roster ?? this.mp.client?.roster;
    return roster?.get(id)?.poses.sample(performance.now()) ?? null;
  }

  /** The multiplayer controller and what it may do with the game. */
  private createMultiplayer(): Multiplayer {
    return new Multiplayer({
      world: () => this.world,
      worldName: () => this.meta?.name ?? null,
      mode: () => this.gameMode,
      record: () => this.session.record,
      pose: () => {
        const p = this.player;
        return { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch };
      },
      flying: () => this.player.mode === 'fly',
      busy: () => this.holdingBreak(),
      actionClock: () => this.nowMs(),
      guests: () => this.meta?.guests ?? [],
      keepGuests: (guests) => {
        if (!this.meta) return;
        this.meta = { ...this.meta, guests };
        this.markMetaDirty();
      },
      guestsChanged: () => this.markMetaDirty(),
      progress: () => this.progress,
      time: () => this.time,
      frozen: () => this.params.freeze,
      listener: {
        onBlocks: (changes) => this.onBlocksChanged(changes),
        onStates: (changes) => this.onStatesChanged(changes),
        onViewers: (viewers) => this.onViewers(viewers),
        onPlayer: (record) => this.onPlayerChanged(record),
        onResult: (action, result) => this.onActionResult(action, result),
        onProgress: (progress, outcomes) => this.onProgressChanged(progress, outcomes),
      },
      openGuestWorld: (welcome, edits, states, rejoin) =>
        this.openGuestWorld(welcome, edits, states, rejoin),
      useSession: (session, record) => this.useSession(session, record),
      guestEnded: (text) => this.leaveGuestWorld(text),
      roleChanged: () => this.onNetRoleChanged(),
      loadNetwork: () => this.loadNetwork(this.netConfig.iceServers),
      build: __BUILD_COMMIT__,
      available: this.netConfig.signal !== null,
    });
  }

  /** The session `Game` hands its actions to; null: a local one with this record. */
  private useSession(session: Session | null, record: PlayerRecord): void {
    // The chest screen belongs to the session before (a room opened, joined or left).
    this.hideChest(false);
    this.session = session ?? this.createSession(record);
    this.breakActive = false;
    // An answer of the session before will not come.
    this.breakInFlight = false;
    this.onPlayerChanged(this.session.record);
    this.hud.setSelected(this.selectedSlot, false);
  }

  /**
   * A guest's world arrived: it is opened like a stored world but never saved. After a
   * reconnect the player stays where it is.
   */
  private openGuestWorld(
    welcome: Welcome,
    edits: WorldEdits,
    states: WorldStates,
    rejoin: boolean,
  ): World {
    const p = this.player;
    const now = Date.now();
    const pose = rejoin ? { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch } : welcome.pose;
    const moveMode = rejoin ? p.mode : welcome.moveMode;
    this.loadWorld(
      {
        id: 'guest',
        name: welcome.worldName,
        seed: welcome.seed,
        mode: welcome.mode,
        generatorVersion: welcome.generatorVersion,
        options: welcome.options,
        formatVersion: SAVE_FORMAT_VERSION,
        createdMs: now,
        playedMs: now,
        time: welcome.time,
        pose,
        moveMode,
        player: welcome.record,
        guests: [],
        // The room's book; a guest's world is never saved.
        progress: welcome.progress,
        book: BOOK_VERSION,
      },
      edits,
      states,
    );
    this.mp.noteTeleport();
    return this.world;
  }

  /** A guest's room is over (left, closed by the host, lost): back to the world list. */
  private leaveGuestWorld(text: string): void {
    if (!this.pauseScreen) {
      // Test mode has no menus: a fresh world in memory, as at the start.
      this.loadWorld(
        this.withTestProgress(
          this.newWorldMeta(
            this.params.world,
            this.params.seed,
            this.params.time,
            this.params.mode,
            this.testWorldGen(),
          ),
          this.params.progress,
        ),
        new Map(),
      );
      return;
    }
    if (document.pointerLockElement) document.exitPointerLock();
    this.hideInventory();
    this.hideChest();
    this.paused = true;
    this.closeWorld();
    this.showScreen('worlds');
    this.worldMenu?.setMessage(text);
    void this.refreshWorldList();
  }

  /** The room was opened, joined, left or lost. */
  private onNetRoleChanged(): void {
    this.pauseScreen?.setGuest(this.mp.role === 'guest');
    this.updateRoomPanel();
  }

  /** "Playing together" in the pause menu, as the room is now. */
  private updateRoomPanel(): void {
    if (!this.roomPanel) return;
    const p = this.player;
    const players = this.mp.players({ x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch });
    this.roomPanel.set({
      role: this.mp.role,
      code: this.mp.roomCode,
      players: players.map(({ id, name, slot, look, host, self }) => ({
        id,
        name,
        slot,
        look,
        host,
        self,
      })),
      disabledReason: this.netConfig.signal === null ? TEXT_UNAVAILABLE : null,
      touch: this.mode === 'touch',
      message: this.roomMessage,
    });
  }

  /** "Open to others" in the pause menu. */
  private async openRoomFromMenu(): Promise<void> {
    if (this.mp.role !== 'off' || !this.meta) return;
    this.roomMessage = 'Opening…';
    this.updateRoomPanel();
    try {
      await this.mp.openRoom();
      this.roomMessage = '';
    } catch (error) {
      this.roomMessage = error instanceof Error ? error.message : 'The world could not be opened.';
    }
    this.updateRoomPanel();
  }

  /** The link that joins this room: the page with `join=CODE` (and the server parameters). */
  private joinLink(): string {
    const query = new URLSearchParams();
    query.set('join', this.mp.roomCode ?? '');
    const current = new URLSearchParams(window.location.search);
    for (const key of ['signal', 'stun']) {
      const value = current.get(key);
      if (value !== null) query.set(key, value);
    }
    return `${window.location.origin}${window.location.pathname}?${query.toString()}`;
  }

  private async copyJoinLink(): Promise<void> {
    const link = this.joinLink();
    try {
      await navigator.clipboard.writeText(link);
      this.roomMessage = 'Link copied';
    } catch {
      // Clipboard access can be denied: the link is shown to copy by hand.
      this.roomMessage = link;
    }
    this.updateRoomPanel();
  }

  /**
   * "Join" on the world menu (a listed room, the code field, the join link). Like a play
   * button: the way it was pressed decides mouse or touch mode, and the mouse is captured
   * inside the press; the world arrives when the host has sent it.
   */
  private async joinFromMenu(code: string, via: InputMode | null): Promise<void> {
    if (this.menuBusy || this.mp.role !== 'off') return;
    this.setMenuBusy(true);
    this.worldMenu?.setMessage('');
    this.joinSection?.setStatus('Connecting…');
    if (via) this.setPadActive(false);
    if (via && via !== this.mode && !this.params.touch) this.setMode(via);
    if (this.mode === 'touch') this.enterFullscreen();
    else if (!this.padActive) this.requestPointerLock();
    try {
      await this.mp.join(code);
      this.joinSection?.setStatus('');
      this.mp.closeRoomList();
      if (this.mode === 'touch') {
        if (this.isPortrait()) this.showScreen('pause');
        else this.setPaused(false);
      } else if (this.input.pointerLocked || this.padActive) {
        this.setPaused(false);
      } else {
        this.showScreen('pause');
      }
    } catch {
      if (document.pointerLockElement) document.exitPointerLock();
      this.joinSection?.setStatus(this.mp.lastError ?? '');
    } finally {
      this.setMenuBusy(false);
    }
  }

  /** The world menu asks for the open rooms every few seconds while it is shown. */
  private refreshRoomList(now: number): void {
    if (this.screen !== 'worlds' || !this.joinSection || this.roomListPending) return;
    if (this.netConfig.signal === null || this.mp.role !== 'off') return;
    if (now - this.roomListAt < ROOM_LIST_REFRESH_MS) return;
    this.roomListAt = now;
    this.roomListPending = true;
    void this.mp
      .rooms()
      .then((list) => {
        const view: RoomListView = list.ok
          ? { kind: 'rooms', rooms: list.rooms }
          : { kind: list.reason };
        this.joinSection?.setRooms(view);
      })
      .catch(() => this.joinSection?.setRooms({ kind: 'unreachable' }))
      .finally(() => {
        this.roomListPending = false;
      });
  }

  /**
   * Joins a room as a guest. Like a play button, the way it was pressed decides mouse or
   * touch mode; the world arrives when the host has sent it.
   */
  private async joinRoom(
    code: string,
    options: { name?: string; checksum?: number; build?: string } = {},
  ): Promise<void> {
    try {
      await this.mp.join(code, options);
    } catch (error) {
      this.worldMenu?.setMessage(this.mp.lastError ?? '');
      throw error;
    }
    if (!this.pauseScreen) return;
    this.markMetaDirty();
    if (this.mode === 'touch' || this.input.pointerLocked || this.padActive) this.setPaused(false);
    else this.showScreen('pause');
  }

  // --- performance test (not in test mode) ---------------------------------------------

  /** Shows the start page of the performance test. */
  private openBench(): void {
    if (this.menuBusy || this.bench || !this.benchScreen) return;
    this.benchPhase = 'start';
    this.showScreen('bench');
    this.benchScreen.showStart(this.storedBenchResult() !== null, this.benchSuite === 'quick');
  }

  /** "Back": from any screen of the performance test to the world menu. */
  private closeBench(): void {
    if (this.bench) return;
    this.benchPhase = null;
    this.benchResult = null;
    this.benchScreen?.hide();
    this.showScreen('worlds');
  }

  private showBenchResult(result: BenchResult | null): void {
    if (!result || this.bench || !this.benchScreen) return;
    this.benchResult = result;
    this.benchPhase = 'result';
    this.showScreen('bench');
    this.benchScreen.showResult(result);
  }

  /** The result of the last finished run, if the browser kept a valid one. */
  private storedBenchResult(): BenchResult | null {
    try {
      return parseIssueBody(window.localStorage.getItem(BENCH_STORAGE_KEY));
    } catch {
      return null;
    }
  }

  /**
   * "Start" was activated: a run begins. Like a play button, the way it was pressed
   * selects mouse or touch mode, and touch mode enters fullscreen inside the tap. The
   * run uses default settings and its own render distances; the stored ones stay as
   * they are and come back when it ends.
   */
  private startBench(via: InputMode | null): void {
    if (this.menuBusy || this.bench || !this.benchScreen) return;
    if (via) this.setPadActive(false);
    if (via && via !== this.mode && !this.params.touch) this.setMode(via);
    if (this.mode === 'touch') this.enterFullscreen();
    const suite = this.benchSuite;
    const run: BenchRun = {
      runner: new BenchRunner({
        suite,
        host: this.benchHost(),
        onProgress: (p) =>
          this.benchScreen?.showRunning(
            `Performance test – scenario ${p.index} of ${p.total}: ${p.label}`,
          ),
        info: () => ({
          commit: __BUILD_COMMIT__,
          date: new Date().toISOString(),
          env: readBenchEnv(
            this.renderer.canvas,
            this.renderer.pixelRatio,
            this.mode,
            run.wakeGranted,
          ),
        }),
        onDone: (result) => this.finishBench(result),
      }),
      startAt: performance.now() + BENCH_START_DELAY_MS,
      width: 0,
      height: 0,
      settings: this.settings,
      debug: this.debug.visible,
      wake: null,
      wakeGranted: false,
      figures: 0,
    };
    this.bench = run;
    // The simulated guests' code is a chunk of its own, loaded when a run starts.
    this.simModule ??= import('../bench/simGuests').then(
      (module) => module,
      () => null,
    );
    this.benchPhase = 'running';
    this.benchResult = null;
    this.benchStop = null;
    this.setDebugVisible(false);
    this.benchScreen.showRunning('Performance test – starting');
    this.requestWakeLock(run);
    // Fullscreen may take a moment; an upright device shows before anything is measured.
    if (this.isPortrait()) this.interruptBench('portrait');
  }

  /** Keeps the screen on during a run, where the browser can. A refusal changes nothing. */
  private requestWakeLock(run: BenchRun): void {
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLock }).wakeLock;
    if (!wakeLock) return;
    try {
      wakeLock.request('screen').then(
        (sentinel) => {
          if (this.bench !== run) {
            void sentinel.release().catch(() => {});
            return;
          }
          run.wake = sentinel;
          run.wakeGranted = true;
        },
        () => {},
      );
    } catch {
      // Some browsers throw instead of rejecting.
    }
  }

  /** What the runner may do with the game: the real world, physics and action layer. */
  private benchHost(): BenchHost {
    return {
      loadWorld: (renderDistance, gen) => {
        // The circle keeps B1's size, so the radar scenario stays comparable.
        this.useSettings({ ...DEFAULT_SETTINGS, renderDistance, radarSize: 0 });
        const meta = this.newWorldMeta('Performance test', BENCH_SEED, BENCH_TIME, 'creative', gen);
        this.loadWorld(meta, new Map());
        // The loop runs the simulation; no pointer lock is asked for.
        this.paused = false;
        this.showScreen('play');
        this.updateTouchCover();
      },
      setPlayer: (pose) => this.setPlayer(pose),
      setTime: (time) => {
        this.time = wrapTime(time);
      },
      setInput: (input) => this.input.setScript(input),
      submit: (action) => this.session.submit(action),
      setYaw: (yaw) => {
        applyLook(this.player, yaw - this.player.yaw, 0);
      },
      chunksIdle: () => this.chunksIdle(),
      pendingChunks: () => this.chunkManager.pending,
      missingMeshDistance: () => this.chunkManager.missingMeshDistance(),
      heapMb,
      openGuests: (script) => this.openSimRoom(script),
      guestsReady: () => this.simWanted === null || this.simRoom?.ready === true,
      stepGuests: (step, steps) => this.simRoom?.step(step, steps),
      closeGuests: () => this.closeSimRoom(),
    };
  }

  /**
   * The room of simulated guests of a run: made as soon as its chunk is loaded. It plays
   * in the run's world, next to the player's own session.
   */
  private openSimRoom(script: GuestScript): void {
    this.closeSimRoom();
    const wanted = { script };
    this.simWanted = wanted;
    void (this.simModule ?? Promise.resolve(null)).then((module) => {
      if (this.simWanted !== wanted || !this.bench) return;
      if (!module) return;
      const p = this.player;
      this.simRoom = new module.SimRoom({
        world: this.world,
        hostPose: () => ({ x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch }),
        hostRecord: this.session.record,
        script,
        onBlocks: (changes) => this.onBlocksChanged(changes),
      });
    });
  }

  private closeSimRoom(): void {
    this.simWanted = null;
    this.simRoom?.close();
    this.simRoom = null;
  }

  /** One frame of a run: the rules that throw it away, then the runner. */
  private benchFrame(ms: number, frameMs: number, chunkWorkMs: number): void {
    const run = this.bench;
    if (!run || ms < run.startAt) return;
    const canvas = this.renderer.canvas;
    if (run.width === 0) {
      run.width = canvas.width;
      run.height = canvas.height;
    } else if (canvas.width !== run.width || canvas.height !== run.height) {
      this.interruptBench('resize');
      return;
    }
    this.simRoom?.frame();
    run.figures = Math.max(run.figures, this.renderer.remotePlayers.drawn);
    run.runner.frame(ms, frameMs, chunkWorkMs);
  }

  /** Throws the run away: nothing of it is kept. */
  private interruptBench(reason: BenchStop): void {
    const run = this.bench;
    if (!run) return;
    run.runner.interrupt();
    this.endBench(run);
    this.benchPhase = 'interrupted';
    this.benchStop = reason;
    this.benchScreen?.showInterrupted(BENCH_STOP_TEXT[reason]);
  }

  private finishBench(result: BenchResult): void {
    const run = this.bench;
    if (!run) return;
    this.endBench(run);
    try {
      // The one thing the test keeps: the text of its last result.
      window.localStorage.setItem(BENCH_STORAGE_KEY, issueText(result));
    } catch {
      // Storage can be full or blocked; the result is on screen all the same.
    }
    this.showBenchResult(result);
  }

  /** Leaves the test world and puts settings, input and overlay back. */
  private endBench(run: BenchRun): void {
    this.closeSimRoom();
    this.lastBenchFigures = run.figures;
    this.bench = null;
    void run.wake?.release().catch(() => {});
    this.input.setScript(null);
    this.touch?.tracker.reset();
    this.updateTouchCover();
    this.paused = true;
    this.useSettings(run.settings);
    this.closeWorld();
    this.setDebugVisible(run.debug);
    this.showScreen('bench');
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
        onStates: (changes) => this.onStatesChanged(changes),
        onPlayer: (changed) => this.onPlayerChanged(changed),
        onResult: (action, result) => this.onActionResult(action, result),
        onProgress: (progress, outcomes) => this.onProgressChanged(progress, outcomes),
      },
      this.progress,
    );
  }

  /** The task book changed or a step had outcomes: keep it, save it, show it. */
  private onProgressChanged(progress: WorldProgress, outcomes: readonly ProgressOutcome[]): void {
    this.progress = progress;
    this.markMetaDirty();
    this.showProgress(outcomes);
  }

  /** Shows what changed in the task book: notices, the Tasks tab, unlocked rows. */
  private showProgress(outcomes: readonly ProgressOutcome[]): void {
    this.progressQueue.push(...noticeTexts(outcomes, LOCAL_PLAYER_ID));
    this.advanceProgressNotice();
    this.refreshRecipes();
    this.refreshBook();
    this.refreshTracker();
  }

  /** The task the tracker shows now (Adventure), or null. */
  private trackedNow(): Task | null {
    if (this.gameMode !== 'gathering') return null;
    return trackedTask(this.session.record, this.progress);
  }

  /** The HUD's task tracker; it hides with the HUD by itself. */
  private refreshTracker(): void {
    const task = this.trackedNow();
    this.radarFocusKind = radarFocus(task);
    this.hud.setTracker(
      task ? { id: task.id, label: task.label, count: trackerCount(task, this.progress) } : null,
    );
  }

  /** The next notice of the queue once the one shown has had its time (simulation time). */
  private advanceProgressNotice(): void {
    const now = this.nowMs();
    // The tolerance keeps 180 steps of 1/60 s from falling just short of 3 000 ms.
    if (this.progressShown && now < this.progressShown.untilMs - 1e-6) return;
    const text = this.progressQueue.shift();
    this.progressShown = text === undefined ? null : { text, untilMs: now + PROGRESS_NOTICE_MS };
  }

  /** The Tasks tab, while the inventory of an Adventure world is open. */
  private refreshBook(): void {
    if (!this.inventoryOpen || this.gameMode !== 'gathering') return;
    this.inventoryScreen.setBook(
      bookView(this.progress, this.session.record),
      this.trackedNow()?.id ?? null,
    );
  }

  /** The clock of the action layer: simulation time since the world was opened. */
  private nowMs(): number {
    return (this.simSteps * 1000) / SIM_HZ;
  }

  /** The session set blocks: rebuild the meshes they touch, outside the frame budget. */
  private onBlocksChanged(changes: readonly BlockChange[]): void {
    this.radar.noteBlocks(changes);
    this.inventoryScreen.map.noteBlocks(changes);
    for (const { x, z } of changes) {
      this.markChunkDirty(x, z);
      this.remeshAround(x, z);
    }
    // A station may have been placed or taken away.
    this.refreshRecipes();
  }

  /** The session set block states (a chest's slots): their chunks are saved. */
  private onStatesChanged(changes: readonly StateChange[]): void {
    for (const { x, z } of changes) this.markChunkDirty(x, z);
    // An emptied loot chest leaves the radar (Phase 8 part B3b).
    this.radar.noteStates(changes);
    const c = this.chestOpen;
    if (c && changes.some((s) => s.x === c.x && s.y === c.y && s.z === c.z)) this.showChestSlots();
  }

  /** In a room: who else has the open chest open, by name. */
  private onViewers(viewers: ChestViewers): void {
    this.chestViewers = viewers;
    this.showChestViewers();
  }

  private showChestViewers(): void {
    const c = this.chestOpen;
    const viewers = this.chestViewers;
    if (!c || !viewers || viewers.x !== c.x || viewers.y !== c.y || viewers.z !== c.z) return;
    const others = this.mp
      .players({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 })
      .filter((p) => !p.self && viewers.ids.includes(p.id));
    this.chestScreen.setViewers(others.map((p) => p.name));
  }

  /** The session confirmed a new record of the player: show it and save it. */
  private onPlayerChanged(record: PlayerRecord): void {
    this.hud.setSlots(record.slots);
    this.inventoryScreen.setSlots(record.slots, record.selectedSlot);
    this.chestScreen.setSlots(record.slots, record.selectedSlot);
    this.refreshRecipes();
    this.refreshBook();
    this.refreshTracker();
    this.markMetaDirty();
  }

  // --- crafting ------------------------------------------------------------------------

  /** The recipes as the list shows them now: what the player has, which stations are near. */
  private recipeStatuses(): RecipeStatus[] {
    const statuses = listRecipes(this.session.record.slots, stationsNear(this.world, this.player));
    // A locked recipe cannot be made, whatever the player has (Phase 8).
    return statuses.map((status) =>
      status.craftable && this.recipeLocked(status.id) ? { ...status, craftable: false } : status,
    );
  }

  /** What unlocks each locked recipe, as the list says it ("Level 3", "Task: Make 2 coal"). */
  private recipeLocks(): Map<number, string> {
    const locks = new Map<number, string>();
    if (this.gameMode !== 'gathering') return locks;
    for (const recipe of RECIPES) {
      if (this.recipeLocked(recipe.id)) locks.set(recipe.id, unlockText(recipe.id));
    }
    return locks;
  }

  /** Brings the recipe list up to date while it is on screen. */
  private refreshRecipes(): void {
    if (!this.inventoryOpen || this.gameMode !== 'gathering') return;
    this.inventoryScreen.setRecipes(this.recipeStatuses(), this.recipeLocks());
  }

  /**
   * "Craft" was pressed for a recipe. Workbench and hand recipes are made at once; a
   * furnace recipe first shows its progress bar for `SMELT_MS`. The wait is presentation
   * only: the action layer checks ingredients and station when the `craft` action comes.
   */
  private craft(id: number): void {
    const recipe = getRecipe(id);
    if (!recipe || !this.inventoryOpen || this.gameMode !== 'gathering') return;
    if (recipe.station !== 'furnace') {
      this.session.submit({ kind: 'craft', recipe: id });
      return;
    }
    // One item at a time, and only if it can be made at all.
    if (this.smelt) return;
    if (!this.recipeStatuses().some((status) => status.id === id && status.craftable)) return;
    this.smelt = { recipe: id, startMs: this.nowMs() };
  }

  /** One step of the furnace and of a held "Craft" button. */
  private continueCrafting(): void {
    if (!this.inventoryOpen) return;
    if (this.smelt && this.nowMs() - this.smelt.startMs >= SMELT_MS - 1e-6) {
      const recipe = this.smelt.recipe;
      this.smelt = null;
      this.session.submit({ kind: 'craft', recipe });
    }
    const hold = this.craftHold;
    if (hold) {
      hold.timer += SIM_DT;
      // The first craft of a hold waits longer than the repeats after it. The small
      // tolerance keeps 15 steps of 1/60 s from falling just short of 250 ms.
      const wait = hold.repeats === 0 ? CRAFT_HOLD_DELAY_MS : CRAFT_REPEAT_MS;
      if (hold.timer >= wait / 1000 - 1e-9) {
        hold.timer = 0;
        hold.repeats++;
        this.craft(hold.recipe);
      }
    }
    // The player may drift or fall while the list is open: look for the stations again.
    if (this.simSteps % STATION_CHECK_STEPS === 0) this.refreshRecipes();
  }

  /** Empties the furnace and lets go of the "Craft" button; nothing was taken yet. */
  private stopCrafting(): void {
    this.smelt = null;
    this.craftHold = null;
    this.suppressCraftClick = false;
    this.inventoryScreen.setSmelting(null, 0);
  }

  /** The furnace's progress bar. */
  private smeltView(): { recipe: number; progress: number } | null {
    if (!this.smelt) return null;
    const elapsed = this.nowMs() - this.smelt.startMs;
    return { recipe: this.smelt.recipe, progress: Math.max(0, Math.min(1, elapsed / SMELT_MS)) };
  }

  // --- inventory screen ----------------------------------------------------------------

  /**
   * Opens the inventory over the running game. The player gets no movement or look input
   * while it is open; in mouse mode the mouse is set free for it.
   */
  private openInventory(): void {
    if (!this.meta || this.paused || this.overlayOpen || this.bench) return;
    this.inventoryOpen = true;
    this.touch?.tracker.reset();
    this.input.reset();
    const record = this.session.record;
    this.inventoryScreen.setSlots(record.slots, record.selectedSlot);
    this.inventoryScreen.setVisible(true);
    this.refreshRecipes();
    this.refreshBook();
    this.syncMapTab();
    // The screen has its own bar; the controls of the game would only shine through.
    this.hud.setVisible(false);
    this.updateTouchCover();
    this.syncFocus();
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
    // With the controller, mouse mode goes on without capturing the mouse.
    if (!this.pauseScreen || this.mode !== 'mouse' || this.padActive) return;
    this.requestPointerLock();
    window.setTimeout(() => this.pauseWithoutPointerLock(), POINTER_LOCK_WAIT_MS);
  }

  private hideInventory(): void {
    if (this.inventoryOpen && !this.paused) this.hud.setVisible(true);
    this.inventoryOpen = false;
    this.updateTouchCover();
    this.inventoryScreen.setVisible(false);
    this.syncMapTab();
    // Closing cancels what is in the furnace: its ingredients were never taken.
    this.stopCrafting();
    this.syncFocus();
  }

  // --- chest screen (Phase 8 part B3a2) -------------------------------------------------

  /** The inventory or the chest screen lies over the running game. */
  private get overlayOpen(): boolean {
    return this.inventoryOpen || this.chestOpen !== null;
  }

  /**
   * The session accepted `openChest`: the screen opens over the running game, like the
   * inventory. Not if something else has opened meanwhile (then the chest is closed again).
   */
  private openChestScreen(cell: { x: number; y: number; z: number }): void {
    if (!this.meta || this.paused || this.overlayOpen || this.bench) {
      this.session.submit({ kind: 'closeChest' });
      return;
    }
    this.chestOpen = cell;
    this.touch?.tracker.reset();
    this.input.reset();
    const record = this.session.record;
    this.chestScreen.setSlots(record.slots, record.selectedSlot);
    this.showChestSlots();
    this.chestScreen.setVisible(true);
    this.showChestViewers();
    this.hud.setVisible(false);
    this.updateTouchCover();
    this.syncFocus();
    if (this.pauseScreen && this.mode === 'mouse' && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  /** The open chest's slots, as the world holds them (a chest without state is empty). */
  private showChestSlots(): void {
    const c = this.chestOpen;
    if (!c) return;
    this.chestScreen.setChest(this.world.getState(c.x, c.y, c.z)?.slots ?? emptyChest().slots);
  }

  /** Closes the chest screen and goes on playing (the mouse as after the inventory). */
  private closeChest(): void {
    if (!this.chestOpen) return;
    this.hideChest();
    if (!this.pauseScreen || this.mode !== 'mouse' || this.padActive) return;
    this.requestPointerLock();
    window.setTimeout(() => this.pauseWithoutPointerLock(), POINTER_LOCK_WAIT_MS);
  }

  /** Hides the chest screen; `tell` submits `closeChest` (not to a session that is gone). */
  private hideChest(tell = true): void {
    this.chestPending = null;
    if (!this.chestOpen) return;
    this.chestOpen = null;
    this.chestViewers = null;
    if (tell) this.session.submit({ kind: 'closeChest' });
    if (!this.paused) this.hud.setVisible(true);
    this.updateTouchCover();
    this.chestScreen.setVisible(false);
    this.syncFocus();
  }

  /** Each step: the screen closes when its cell is no chest or the eye is out of reach. */
  private checkChestOpen(): void {
    const c = this.chestOpen;
    if (!c) return;
    const p = this.player;
    const dx = c.x + 0.5 - p.x;
    const dy = c.y + 0.5 - (p.y + PLAYER_EYE_HEIGHT);
    const dz = c.z + 0.5 - p.z;
    const limit = REACH + REACH_TOLERANCE;
    const far = dx * dx + dy * dy + dz * dz > limit * limit;
    if (far || this.world.getBlock(c.x, c.y, c.z) !== Block.CHEST) this.closeChest();
  }

  /** B (and the browser's Back) on the chest screen: a picked slot goes down, else it closes. */
  private chestBack(): void {
    if (!this.chestScreen.cancelPick()) this.closeChest();
  }

  /** The controller on the chest screen: Y closes, Start closes and pauses, B, X quick moves. */
  private onChestPadFrame(frame: PadFrame, elapsedMs: number): void {
    const pressed = frame.pressed;
    if (pressed.includes(PadButton.START)) {
      this.closeChest();
      if (this.pauseScreen) this.setPaused(true);
      return;
    }
    if (pressed.includes(PadButton.Y)) {
      this.closeChest();
      return;
    }
    if (pressed.includes(PadButton.B)) {
      this.chestBack();
      if (!this.chestOpen) return;
    }
    if (pressed.includes(PadButton.X)) this.chestScreen.quickMoveAt(this.focus.focusedElement);
    const rest = pressed.filter(
      (b) => b !== PadButton.B && b !== PadButton.START && b !== PadButton.X,
    );
    this.focus.handle(
      rest.length === pressed.length ? frame : { ...frame, pressed: rest },
      elapsedMs,
    );
  }

  /** Mouse mode is played with a captured mouse; without it the pause menu shows. */
  private pauseWithoutPointerLock(): void {
    if (this.mode !== 'mouse' || this.overlayOpen || this.paused || !this.meta) return;
    if (!this.input.pointerLocked && !this.padActive) this.setPaused(true);
  }

  private onActionResult(action: Action, result: ActionResult): void {
    this.lastResult = result;
    // A malformed value is refused and reported as it came: it may not be an object.
    if (!result.ok && (typeof action !== 'object' || action === null)) return;
    // An accepted `openChest` opens the screen, whoever submitted it (the place input, or
    // the test API).
    if (action.kind === 'openChest') {
      this.chestPending = null;
      if (result.ok) this.openChestScreen({ x: action.x, y: action.y, z: action.z });
    }
    if (action.kind === 'startBreak' || action.kind === 'break') this.breakInFlight = false;
    // A `break` the host found too early (its clock against the screen's): start over.
    if (action.kind === 'break' && !result.ok && result.reason === 'early') {
      this.breakActive = false;
    }
    if (action.kind === 'startBreak') {
      // The break runs from now on, or it does not start at all.
      this.breakActive = result.ok;
    }
    if ((action.kind === 'startBreak' || action.kind === 'break') && !result.ok) {
      const chest = this.world.getBlock(action.x, action.y, action.z) === Block.CHEST;
      if (result.reason === 'full') {
        this.fullUntilMs = this.nowMs() + NOTICE_MS;
        this.fullText = chest ? TEXT_CHEST_FULL : TEXT_INVENTORY_FULL;
      }
      if (result.reason === 'notEmpty') this.notEmptyUntilMs = this.nowMs() + NOTICE_MS;
    }
    if (action.kind === 'place' && !result.ok && result.reason === 'support') {
      this.supportUntilMs = this.nowMs() + NOTICE_MS;
    }
    if (action.kind === 'craft' && !result.ok && result.reason === 'locked') {
      this.lockedUntilMs = this.nowMs() + NOTICE_MS;
      this.lockedText = lockedText(action.recipe);
    }
    // A recipe that cannot be made any more ends the hold on its button.
    if (action.kind === 'craft' && !result.ok && this.craftHold) {
      this.suppressCraftClick = this.craftHold.repeats > 0;
      this.craftHold = null;
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
    this.radar.circle.setTouch(touch);
    this.root.classList.toggle('touch-mode', touch);
    this.input.setMouseEnabled(!touch);
    if (touch && !this.touch) {
      this.touchHud = new TouchHud(this.root, this.hud.element);
      this.touchHud.setFlyAvailable(this.gameMode === 'creative');
      this.touchHud.setVisible(!this.paused);
      this.updateTouchCover();
      this.touch = new TouchControls({
        root: this.root,
        sink: this.input,
        isActive: () => !this.paused && !this.overlayOpen && !this.bench,
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
    if (via) this.setPadActive(false);
    // `touch=1` pins touch mode; otherwise the way the button was pressed decides.
    if (via && via !== this.mode && !this.params.touch) this.setMode(via);
    if (this.mode === 'touch') {
      this.enterFullscreen();
      if (!this.isPortrait()) this.setPaused(false);
      return;
    }
    // The controller plays without capturing the mouse.
    if (this.padActive) this.setPaused(false);
    else this.requestPointerLock();
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
    if (this.mode === 'touch' || this.benchPhase || this.padActive) return;
    // While a world is still being opened, `startWorld` looks at the lock when it is there.
    if (!this.meta) return;
    // The inventory and the chest set the mouse free without pausing.
    if (this.overlayOpen) return;
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
      // A menu over the game closes the inventory and the chest.
      this.hideInventory();
      this.hideChest();
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
    this.renderer.setBrightness(settings.brightness);
    this.renderer.setRenderDistance(settings.renderDistance);
    this.chunkManager.setRadius(settings.renderDistance);
    this.gamepad.setLook(settings.padSensitivity, settings.padInvertY);
    // Takes effect at once; physics only tests the cells the player newly enters.
    this.movement.collideLeaves = settings.collideLeaves;
    if (this.radar.circle.size !== this.radar.circle.sizeFor(settings.radarSize)) {
      this.radar.circle.setSize(settings.radarSize);
      this.radar.invalidate();
    }
    if (!this.chunksIdle()) this.framesSinceIdle = 0;
  }

  private movementOf(world: World): MovementWorld {
    const movement = new MovementWorld(world);
    movement.collideLeaves = this.settings.collideLeaves;
    return movement;
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
    // A run of the performance test is thrown away instead of paused.
    if (portrait && this.bench) this.interruptBench('portrait');
    else if (portrait && !this.paused) this.setPaused(true);
  }

  /**
   * On touch: from one gap below the bag button down to 4 px above the highest button on
   * the right (break, place, up, down); null while they are not laid out.
   */
  private touchCircleRoom(): number | null {
    const box = (name: string): DOMRect | null => {
      const node = this.root.querySelector(`.touch-${name}`);
      const rect = node?.getBoundingClientRect();
      return rect && rect.height > 0 ? rect : null;
    };
    const bag = box('bag');
    if (!bag) return null;
    let below = Infinity;
    for (const name of ['break', 'place', 'up', 'down']) {
      const rect = box(name);
      if (rect) below = Math.min(below, rect.top);
    }
    if (below === Infinity) return null;
    return below - 4 - (bag.bottom + TOUCH_CIRCLE_GAP_PX);
  }

  private resize(): void {
    this.updateOrientation();
    const circleSize = this.radar.circle.size;
    this.radar.circle.refit();
    if (this.radar.circle.size !== circleSize) this.radar.invalidate();
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
    if (this.framesSuspended) {
      // As in a hidden tab: nothing runs, and no burst of steps follows afterwards.
      this.lastFrameMs = ms;
      return;
    }
    // The time since the last frame, with the chunk work that was done since then.
    const frameMs = ms - this.lastFrameMs;
    if (this.meta) this.perf.record(ms, frameMs, this.chunkWorkMs);
    if (this.bench) this.benchFrame(ms, frameMs, this.chunkWorkMs);
    this.chunkWorkMs = 0;
    const elapsed = Math.max(0, Math.min((ms - this.lastFrameMs) / 1000, 0.25));
    this.lastFrameMs = ms;
    this.fpsFrames++;
    this.fpsTime += elapsed;
    if (this.fpsTime >= 0.5) {
      this.fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }

    // The controller first: its input counts for this frame's steps and look.
    this.gamepad.poll(elapsed * 1000);

    // The room's sessions: messages that wait, poses, the time of day.
    this.mp.frame(performance.now());

    // In test mode the simulation only advances through `__mc.step()`. A shared world goes
    // on behind the pause menu (the player gets no input there).
    if (!this.params.test && (!this.paused || this.mp.active)) {
      this.accumulator += elapsed;
      let steps = 0;
      while (this.accumulator >= SIM_DT && steps < MAX_STEPS_PER_FRAME) {
        this.simulate();
        this.accumulator -= SIM_DT;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
    }
    const roomTime = this.mp.timeOfDay(performance.now());
    if (roomTime !== null) this.time = roomTime;

    if (!this.paused && !this.overlayOpen && !this.bench) {
      const look = this.input.consumeLook();
      this.applyLookPixels(look.dx, look.dy);
      if (this.touch) {
        const drag = this.touch.tracker.consumeLook();
        this.applyTouchLook(drag.dx, drag.dy);
      }
      const turn = this.input.consumeTurn();
      if (turn.yaw !== 0 || turn.pitch !== 0) {
        applyLook(this.player, turn.yaw, turn.pitch);
        this.markMetaDirty();
      }
    }

    if (this.meta) this.updateChunks();
    this.autosave.tick(performance.now());
    this.refreshRoomList(performance.now());
    if (this.screen === 'pause') {
      this.updateRoomPanel();
      const failed = this.autosave.lastError !== null;
      this.pauseScreen?.setSaveState(
        failed ? SAVE_FAILED_TEXT : this.autosave.dirty ? 'Saving…' : 'Saved',
      );
    }
    this.draw(this.params.test ? 1 : this.accumulator / SIM_DT);
    // The focus frame follows its element (lists reorder, content scrolls).
    this.focus.update();
    this.backGuard?.update();

    if (this.chunksIdle()) {
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
    // A performance test sets the input of this step and submits its action.
    this.bench?.runner.step();
    this.rememberPosition();
    stepPlayer(this.player, this.readMoveInput(), this.movement, SIM_DT);
    if (respawnIfFallen(this.player, this.spawnPosition())) this.rememberPosition();
    // The reach tasks of the book read the feet (single-player; returns at once otherwise).
    (this.session as GameSession).notePose?.(this.player.y);
    // The step is over: actions of this step carry its end time.
    this.simSteps++;
    this.repeatHeldAction();
    this.continueCrafting();
    this.checkChestOpen();
    if (this.progressShown || this.progressQueue.length > 0) this.advanceProgressNotice();
    // Pose and time of day are part of the world's record.
    this.markMetaDirty();
    // The clock of a performance test stands still.
    this.time = advanceTime(this.time, SIM_DT, this.params.freeze || this.bench !== null);
    this.stepRadar();
  }

  /** The radar is open to the player: Adventure, its task done (Phase 8 part B1). */
  private radarUnlocked(): boolean {
    return (
      this.gameMode === 'gathering' && featureUnlocked('radar', this.session.record, this.progress)
    );
  }

  /** The circle shows: playing an Adventure world with the radar unlocked and switched on. */
  private radarCircleWanted(): boolean {
    if (this.bench) return this.bench.runner.showsRadar;
    return (
      this.isPlaying() && this.screen === 'play' && this.settings.radar && this.radarUnlocked()
    );
  }

  /**
   * The Map tab (Phase 8 part B1): while it is open its locked text or, unlocked, the
   * radar draws on it; its background cache goes when it closes.
   */
  private syncMapTab(): void {
    const map = this.inventoryScreen.map;
    const open =
      this.inventoryOpen &&
      this.gameMode === 'gathering' &&
      this.inventoryScreen.currentTab === 'map';
    const unlocked = this.radarUnlocked();
    if (open) map.setLocked(!unlocked, featureLockText('radar'));
    const surface = open && unlocked ? map : null;
    if (surface) map.setWorld(this.world);
    if (surface === this.mapSurface) return;
    this.mapSurface = surface;
    if (!surface) map.clear();
    this.radar.setMap(surface);
  }

  private stepRadar(): void {
    this.syncMapTab();
    const active = this.radarUnlocked() && this.settings.radar;
    if (active !== this.radarActive) {
      this.radarActive = active;
      this.radar.invalidate();
    }
    const p = this.player;
    this.radar.step({
      world: this.world,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      step: this.simSteps,
      circle: this.radarCircleWanted(),
      focus: this.radarFocusKind,
    });
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
    // Waiting for the session's answer to the last `startBreak` or `break`.
    if (this.breakInFlight) return;
    const started = this.session.record.breaking;
    const same = started && started.x === t.x && started.y === t.y && started.z === t.z;
    if (!this.breakActive || !started || !same) {
      this.breakActive = false;
      this.submitBreak({ kind: 'startBreak', x: t.x, y: t.y, z: t.z });
      // A block without break time (the torch) comes off in the step of its start, once
      // the session has accepted it; a session that answers later gets the next step.
      if (!this.breakActive || breakTimeMs(t.id, heldItem(this.session.record)) !== 0) return;
      this.submitBreak({ kind: 'break', x: t.x, y: t.y, z: t.z });
      this.updateTarget();
      return;
    }
    const required = breakTimeMs(t.id, heldItem(this.session.record)) ?? 0;
    // The tolerance keeps 36 steps of 1/60 s from falling just short of 600 ms.
    if (this.nowMs() - started.startMs < required - 1e-6) return;
    this.submitBreak({ kind: 'break', x: t.x, y: t.y, z: t.z });
    this.updateTarget();
  }

  /** A `startBreak` or `break` of the held button; nothing more until it is answered. */
  private submitBreak(action: Action): void {
    this.breakInFlight = true;
    this.session.submit(action);
  }

  /** The timed break on screen, or null while none runs. */
  private breakView(): BreakView | null {
    const started = this.session.record.breaking;
    const t = this.target;
    if (!this.breakActive || !started || !t || !this.input.isHeld('break')) return null;
    if (started.x !== t.x || started.y !== t.y || started.z !== t.z) return null;
    const required = breakTimeMs(t.id, heldItem(this.session.record)) ?? 0;
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
    this.hud.setChestHint(this.chestHintInput(view !== null));
    const now = this.nowMs();
    const pickup = this.pickup && now <= this.pickup.untilMs ? this.pickup : null;
    const padNotice = this.padNotice && now <= this.padNotice.untilMs ? this.padNotice : null;
    this.hud.setNetNotices(this.mp.currentNotices());
    this.hud.setNotice(
      padNotice ? padNotice.text : pickup ? `+${pickup.count} ${itemLabel(pickup.item)}` : null,
    );
    this.hud.setMessage(
      now <= this.fullUntilMs
        ? this.fullText
        : now <= this.notEmptyUntilMs
          ? TEXT_CHEST_NOT_EMPTY
          : now <= this.supportUntilMs
            ? TEXT_NEEDS_SUPPORT
            : now <= this.lockedUntilMs
              ? this.lockedText
              : this.toolHint(),
    );
    // Over the HUD and the open inventory; not over the pause menu or the world menu.
    const playing =
      (this.overlayOpen || !this.paused) && (!this.pauseScreen || this.screen === 'play');
    this.progressNotice.show(playing ? (this.progressShown?.text ?? null) : null, this.overlayOpen);
    const smelt = this.smeltView();
    this.inventoryScreen.setSmelting(smelt ? smelt.recipe : null, smelt ? smelt.progress : 0);
  }

  /**
   * The crosshair hint on a chest within reach (Phase 8 part B3b): by the input in use, in
   * both modes, never while a break is in progress. The target is the one already raycast.
   */
  private chestHintInput(breaking: boolean): ChestHintInput | null {
    const t = this.target;
    if (!t || t.id !== Block.CHEST || breaking || this.input.isHeld('break')) return null;
    if (this.padActive) return 'pad';
    return this.mode === 'touch' ? 'touch' : 'mouse';
  }

  /**
   * Gathering: "Needs a pickaxe" while the targeted block would yield nothing with the
   * item in the hand. It shows before and during breaking.
   */
  private toolHint(): string | null {
    const t = this.target;
    if (!t || this.gameMode !== 'gathering') return null;
    const needed = missingTool(t.id, heldItem(this.session.record));
    if (!needed) return null;
    return needed.tier > 1 ? TEXT_NEEDS_STONE_PICKAXE : TEXT_NEEDS_PICKAXE;
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
    // The place input on a chest opens it (Phase 8 part B3a2); building goes elsewhere.
    if (this.world.getBlock(t.x, t.y, t.z) === Block.CHEST) {
      if (this.chestPending || this.overlayOpen) return;
      this.chestPending = { x: t.x, y: t.y, z: t.z };
      this.session.submit({ kind: 'openChest', x: t.x, y: t.y, z: t.z });
      return;
    }
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

  // --- controller ------------------------------------------------------------------------

  /** A world is on screen and played: no menu, no inventory, no performance test. */
  private isPlaying(): boolean {
    return this.meta !== null && !this.paused && !this.overlayOpen && this.bench === null;
  }

  /** Something covers the game that a mouse or finger may use: a menu or the inventory. */
  private screenShown(): boolean {
    return this.overlayOpen || (this.pauseScreen !== null && this.screen !== 'play');
  }

  private padTarget(): PadTarget {
    return this.isPlaying() ? 'play' : 'other';
  }

  /** The controller's frame outside play: the inventory, a run, the menus. */
  private onPadFrame(frame: PadFrame, target: PadTarget, elapsedMs: number): void {
    const pressed = frame.pressed;
    // A browser that also sends B as "Back" must not make it act twice.
    if (pressed.includes(PadButton.B)) this.backGuard?.notePadBack();
    if (target === 'play') return;
    if (this.bench) {
      // A run takes no input but what cancels it.
      if (pressed.includes(PadButton.B) || pressed.includes(PadButton.START)) {
        this.interruptBench('cancel');
      }
      return;
    }
    if (this.chestOpen) {
      this.onChestPadFrame(frame, elapsedMs);
      return;
    }
    if (this.inventoryOpen) {
      this.onInventoryPadFrame(frame, elapsedMs);
      return;
    }
    this.focus.handle(frame, elapsedMs);
  }

  /**
   * The controller on the inventory: Y closes it, Start closes it and pauses, B puts a
   * picked slot down or closes, LB / RB change the tab; the rest is the focus system.
   */
  private onInventoryPadFrame(frame: PadFrame, elapsedMs: number): void {
    const pressed = frame.pressed;
    if (pressed.includes(PadButton.START)) {
      this.closeInventory();
      if (this.pauseScreen) this.setPaused(true);
      return;
    }
    if (pressed.includes(PadButton.Y)) {
      this.closeInventory();
      return;
    }
    if (pressed.includes(PadButton.B)) {
      this.inventoryBack();
      if (!this.inventoryOpen) return;
    }
    for (const [button, direction] of [
      [PadButton.LB, -1],
      [PadButton.RB, 1],
    ] as const) {
      // A hold of "Craft" ends with its page: it must not go on crafting unseen.
      if (pressed.includes(button) && this.inventoryScreen.cycleTab(direction)) {
        this.craftHold = null;
      }
    }
    // B and Start are handled above; the focus system gets A, the moves and the scrolling.
    const rest = pressed.filter((b) => b !== PadButton.B && b !== PadButton.START);
    this.focus.handle(
      rest.length === pressed.length ? frame : { ...frame, pressed: rest },
      elapsedMs,
    );
  }

  /** B (and the browser's Back) on the inventory: a picked slot is put down, else it closes. */
  private inventoryBack(): void {
    if (!this.inventoryScreen.cancelPick()) this.closeInventory();
  }

  /** The hint bar of the inventory: what A does on the focused element, B, Y, the tabs. */
  private inventoryHints(element: HTMLElement): PadHint[] {
    let select = 'Select';
    if (element.classList.contains('recipe-craft')) select = 'Craft';
    else if (element.classList.contains('task-row')) select = 'Track';
    else if (element.classList.contains('inv-slot')) select = 'Pick / Put';
    const hints: PadHint[] = [
      { glyphs: ['A'], text: select },
      { glyphs: ['B'], text: 'Back' },
      { glyphs: ['Y'], text: 'Close' },
    ];
    if (this.gameMode === 'gathering') hints.push({ glyphs: ['LB', 'RB'], text: 'Tabs' });
    return hints;
  }

  /** The screen the controller's focus is on, or null (play, a run). */
  private focusScreen(): HTMLElement | null {
    if (this.bench) return null;
    // The inventory and the chest also in test mode, which has no menus.
    if (this.chestOpen) return this.chestScreen.element;
    if (this.inventoryOpen) return this.inventoryScreen.element;
    if (!this.pauseScreen) return null;
    if (this.screen === 'bench') return this.benchScreen?.element ?? null;
    if (this.screen === 'worlds') return this.worldMenu?.element ?? null;
    if (this.screen === 'pause' || this.screen === 'settings') return this.pauseScreen.element;
    if (this.screen === 'nettest') return this.netTestScreen?.element ?? null;
    return null;
  }

  /** Start on a screen: the pause menu continues the game; elsewhere it does nothing. */
  private onPadStart(): void {
    if (this.screen === 'pause' && this.meta && !this.menuBusy) this.requestPlay(null);
  }

  /**
   * The browser's Back (or the phone's back gesture) while the guard holds its entry: acts
   * as the controller's B would.
   */
  private onBrowserBack(): void {
    if (this.bench) this.interruptBench('cancel');
    else if (this.chestOpen) this.chestBack();
    else if (this.inventoryOpen) this.inventoryBack();
    else if (this.screen === 'play') {
      if (!this.meta || this.paused) return;
      // The pause menu needs the mouse free, as after Esc.
      if (document.pointerLockElement) document.exitPointerLock();
      this.setPaused(true);
    } else if (this.screen === 'worlds') this.worldMenu?.backToList();
    else this.focus.back();
  }

  /** Back leaves the page only from the world list. */
  private wantsBackGuard(): boolean {
    return this.screen !== 'worlds' || this.worldMenu?.currentView !== 'list';
  }

  /**
   * Makes the controller the active source, or hands control back to the mouse or the
   * fingers. Keys never change it.
   */
  private setPadActive(active: boolean): void {
    if (active === this.padActive) return;
    this.padActive = active;
    this.root.classList.toggle('pad-active', active);
    if (active && !this.padSeen) {
      this.padSeen = true;
      this.pauseScreen?.setPadSeen();
      this.pauseScreen?.setPadWaiting(false);
    }
    if (active && this.menuPadNotice !== null) {
      // The notice has served its purpose: the controller is in use.
      if (this.worldMenu?.messageText === this.menuPadNotice) this.worldMenu.setMessage('');
      if (this.pauseScreen?.hintText === this.menuPadNotice) this.pauseScreen.setHint('');
      this.menuPadNotice = null;
    }
    this.focus.setActive(active);
    this.worldMenu?.setPadActive(active);
    this.pauseScreen?.setPadActive(active);
    // The mouse is set free: it does not look while the controller plays.
    if (active && this.mode === 'mouse' && document.pointerLockElement) document.exitPointerLock();
    this.updateTouchCover();
  }

  /** The touch controls are invisible under the inventory, during a run and with the pad. */
  private updateTouchCover(): void {
    this.touchHud?.setCovered(this.overlayOpen || this.bench !== null || this.padActive);
  }

  private onPadDisconnect(): void {
    this.setPadActive(false);
    this.pauseScreen?.setPadWaiting(false);
    // A player who loses the controller mid-walk must not walk on blind.
    if (this.pauseScreen && this.meta && !this.paused && !this.bench) this.setPaused(true);
    this.showPadNotice(TEXT_PAD_DISCONNECTED);
  }

  /**
   * A notice about the controller: over the game while it is played (for `NOTICE_MS` of
   * game time, like a pickup), otherwise in the message line of the menu, where it stays
   * until the controller is used or another message replaces it.
   */
  private showPadNotice(text: string): void {
    this.menuPadNotice = text;
    if (!this.pauseScreen || this.screen === 'play') {
      this.padNotice = { text, untilMs: this.nowMs() + NOTICE_MS };
    } else if (this.screen === 'worlds') {
      this.worldMenu?.setMessage(text);
    } else if (this.screen !== 'bench') {
      this.pauseScreen.setHint(text);
    }
  }

  /**
   * A click on the game hands control back to the mouse, a finger on it back to touch;
   * that press does nothing else. In menus, moving the mouse or touching only hides the
   * focus frame.
   */
  private watchOtherSources(canvas: HTMLCanvasElement): void {
    this.root.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.padActive || this.bench) return;
        if (this.screenShown()) {
          this.setPadActive(false);
          return;
        }
        if (e.pointerType !== 'touch' || this.mode !== 'touch') return;
        this.setPadActive(false);
        // Only the controls come back: this touch does not reach them.
        e.stopPropagation();
        e.preventDefault();
      },
      { capture: true },
    );
    // Mouse buttons reach Input as mouse events: the press that switches must not act.
    this.root.addEventListener(
      'mousedown',
      (e) => {
        if (!this.padActive || this.bench || this.mode !== 'mouse') return;
        if (e.target !== canvas || this.screenShown()) return;
        this.setPadActive(false);
        e.stopPropagation();
        e.preventDefault();
        // The mouse is captured inside this press, while the browser still allows it.
        if (this.pauseScreen && this.isPlaying()) this.requestPointerLock();
      },
      { capture: true },
    );
    window.addEventListener('pointermove', (e) => {
      if (!this.padActive || e.pointerType !== 'mouse') return;
      if (e.movementX === 0 && e.movementY === 0) return;
      if (this.screenShown()) this.setPadActive(false);
    });
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

  /** Sky light and block light of the cell around a point, or null where nothing is lit. */
  private lightAt(x: number, y: number, z: number): { sky: number; block: number } | null {
    const light = this.world.getLight(Math.floor(x), Math.floor(y), Math.floor(z));
    return light === null ? null : { sky: skyOf(light), block: blockOf(light) };
  }

  /** Nothing left to load, and no mesh waits for the light an edit changed. */
  private chunksIdle(): boolean {
    return this.chunkManager.pending === 0 && this.chunkManager.relight === 0;
  }

  private updateChunks(): void {
    const start = performance.now();
    this.chunkManager.setCenter(toChunkCoord(this.player.x), toChunkCoord(this.player.z));
    // An edit earlier in this frame already spent part of the budget, perhaps all of it.
    const left = CHUNK_BUDGET_MS - this.chunkWorkMs;
    if (left > 0) this.chunkManager.update(() => performance.now(), left);
    this.chunkWorkMs += performance.now() - start;
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
    this.updateFigures();
    this.renderer.render();
    if (this.touchHud && this.touch) {
      this.touchHud.setStick(this.touch.tracker.stick);
      this.touchHud.setFlying(p.mode === 'fly');
    }
    if (this.debug.visible) this.updateDebug();
  }

  /** The F3 row "Chests", or null while the world has no block states (Phase 8 part B3a). */
  private chestsDebug(): string | null {
    const world = this.world;
    if (world.states.size === 0 && world.droppedStates === 0) return null;
    const { filled, bytes } = summarizeStates(world.states);
    return chestsRow(filled, bytes, world.droppedStates);
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
      jobs: this.chunkManager.jobs,
      ...this.perf.summary(performance.now()),
      light: this.lightAt(p.x, p.y + PLAYER_EYE_HEIGHT, p.z),
      drawCalls: stats.drawCalls,
      triangles: stats.triangles,
      seed: this.world.seed,
      generator: debugWorldGen(this.world.gen),
      progress:
        this.gameMode === 'gathering' ? progressRow(this.progress, this.session.record) : null,
      radar: this.radarUnlocked() ? (this.settings.radar ? this.radar.debugText() : 'off') : null,
      chests: this.chestsDebug(),
      time: this.time,
      mode: p.mode,
      onGround: p.onGround,
      inWater: p.inWater,
      target: t ? `${getBlockDef(t.id).name} at ${t.x} / ${t.y} / ${t.z}` : null,
      net: this.mp.debugInfo(performance.now()),
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

  /**
   * The edited block's chunk is remeshed immediately, outside the per-frame budget. Its
   * neighbours across a border and other chunks whose light the edit changed wait in the
   * chunk manager's queue and follow in the next frames (Phase 4 part E): one frame never
   * builds more than one chunk because of an edit.
   */
  private remeshAround(x: number, z: number): void {
    const start = performance.now();
    this.chunkManager.remeshAfterEdit(x, z);
    this.chunkWorkMs += performance.now() - start;
    if (!this.chunksIdle()) this.framesSinceIdle = 0;
  }

  /** Test tool: sets a block directly, past the action layer. */
  private testSetBlock(x: number, y: number, z: number, id: number): void {
    // A guest's world is the host's: it changes only through the host.
    if (this.mp.role === 'guest') throw new Error('setBlock is not available on a guest');
    if (!this.world.setBlock(x, y, z, id)) return;
    this.markChunkDirty(x, z);
    this.remeshAround(x, z);
    this.radar.noteBlocks([{ x, y, z, id }]);
    this.inventoryScreen.map.noteBlocks([{ x, z }]);
    this.mp.host?.broadcastBlocks([{ x, y, z, id }]);
  }

  /**
   * Test tool: puts items into the inventory, past the action layer; on a host with
   * `player`, into that guest's inventory.
   */
  private testGive(item: number, count: number, player?: number): void {
    if (!isItem(item) || !Number.isInteger(count) || count < 1) return;
    this.testEditRecord(player, (record) => ({
      ...record,
      slots: addItems(record.slots, item, count).slots,
    }));
  }

  /**
   * Test tools `give` and `setProgress`: replaces the record past the action layer; on a
   * host with `player`, that guest's record.
   */
  private testEditRecord(
    player: number | undefined,
    edit: (r: PlayerRecord) => PlayerRecord,
  ): void {
    const session: { record: PlayerRecord; replaceRecord?: (r: PlayerRecord) => void } | null =
      player === undefined ? this.session : (this.mp.host?.guestRecordDoor(player) ?? null);
    if (!session) throw new Error(`No guest with id ${String(player)}`);
    if (session.replaceRecord) session.replaceRecord(edit(session.record));
  }

  /**
   * Test tool: sets a player's XP and the world's done list (clearing the counts), past
   * the action layer.
   */
  private testSetProgress(
    patch: { xp?: number; done?: number[]; counts?: { task: number; count: number }[] },
    player?: number,
  ): void {
    const { xp, done, counts } = patch;
    if (xp !== undefined) {
      if (!Number.isInteger(xp) || xp < 0) throw new Error(`Bad XP ${String(xp)}`);
      this.testEditRecord(player, (record) => ({ ...record, xp }));
    }
    if (done !== undefined || counts !== undefined) {
      const progress = decodeProgress({ done: done ?? this.progress.done, counts: counts ?? [] });
      if (!progress) throw new Error(`Bad progress ${JSON.stringify(patch)}`);
      const session = this.session as GameSession;
      if (session.replaceProgress) session.replaceProgress(progress);
      else this.onProgressChanged(progress, []);
    }
  }

  /** Test tool: empties all slots. */
  private testClearInventory(): void {
    const record = this.session.record;
    const session = this.session;
    if (session.replaceRecord)
      session.replaceRecord({ ...record, slots: record.slots.map(() => null) });
  }

  /** Test tool: hands any value to the session as an action and returns the answer. */
  private testSubmit(action: unknown): ActionResult | null {
    this.lastResult = null;
    this.session.submit(action as Action);
    this.updateTarget();
    return this.lastResult;
  }

  /** Whether the player has not unlocked a recipe yet (Adventure only). */
  private recipeLocked(recipe: number): boolean {
    if (this.gameMode !== 'gathering') return false;
    return !recipeUnlocked(recipe, this.session.record, this.progress);
  }

  /** `getState().progress`: the book and the player's level; null in Creative. */
  private progressState(): GameState['progress'] {
    if (this.gameMode !== 'gathering') return null;
    const xp = this.session.record.xp;
    const chapter = openChapter(this.progress);
    const tracked = this.trackedNow();
    return {
      level: levelOf(xp),
      xp,
      nextLevelXp: nextLevelXp(xp),
      chapter: chapter?.id ?? null,
      done: [...this.progress.done],
      tasks: chapter
        ? tasksOf(chapter.id).map((task) => ({
            id: task.id,
            count: countOf(this.progress, task),
            goal: task.count,
            done: this.progress.done.includes(task.id),
          }))
        : [],
      notice: this.progressNoticeText(),
      tracked: tracked ? { id: tracked.id, text: trackerText(tracked, this.progress) } : null,
      // Read for the test API; the record field is set only by the action layer.
      track: this.session.record.track,
    };
  }

  /** The radar for the test API (Phase 8 part B1); null in Creative. */
  private radarState(): GameState['radar'] {
    if (this.gameMode !== 'gathering') return null;
    const circle = this.radar.circleState();
    return {
      unlocked: this.radarUnlocked(),
      setting: this.settings.radar,
      shown: this.radar.circle.shown && this.radarCircleWanted(),
      focus: this.radarFocusKind?.key ?? null,
      entries: circle.entries,
      beyond: circle.beyond,
      scans: this.radar.scanCount,
      draws: this.radar.drawCount,
    };
  }

  /** The Map tab while it is open, for the test API; undefined otherwise. */
  private mapState(): GameState['map'] {
    const open =
      this.inventoryOpen &&
      this.gameMode === 'gathering' &&
      this.inventoryScreen.currentTab === 'map';
    if (!open) return undefined;
    const map = this.inventoryScreen.map;
    return {
      locked: map.isLocked,
      entries: map.isLocked ? [] : map.entries,
      legend: map.isLocked ? [] : map.legendTexts,
      draws: this.radar.mapDrawCount,
    };
  }

  /** The progress notice shown now, or null. */
  private progressNoticeText(): string | null {
    return this.progressShown?.text ?? null;
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
            options: this.meta.options,
            chests: summarizeStates(this.world.states).filled,
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
      ui: {
        screen: this.chestOpen
          ? 'chest'
          : this.inventoryOpen
            ? 'inventory'
            : this.pauseScreen
              ? this.screen
              : 'play',
        tab: this.inventoryOpen ? this.inventoryScreen.currentTab : null,
        ...(this.chestOpen
          ? { chest: { ...this.chestOpen, viewers: this.chestScreen.viewerNames } }
          : {}),
        ...(this.focus.description !== null ? { focus: this.focus.description } : {}),
        ...this.previewState(),
      },
      recipes: this.recipeStatuses().map((status) => ({
        id: status.id,
        name: getRecipe(status.id)?.name ?? '',
        craftable: status.craftable,
        missing: status.missing,
        stationMissing: status.stationMissing,
        locked: this.recipeLocked(status.id),
        unlock: unlockOf(status.id),
      })),
      progress: this.progressState(),
      radar: this.radarState(),
      ...(this.mapState() ? { map: this.mapState() } : {}),
      smelting: this.smeltView(),
      bench: this.benchState(),
      net: this.netState(),
      player: {
        name: this.mp.identity.name,
        choice: this.mp.identity.look,
        look: this.mp.look,
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
        lit: this.world.litCount,
        relight: this.chunkManager.relight,
      },
      perf: this.perf.summary(performance.now()),
      settings: {
        brightness: this.settings.brightness,
        padSensitivity: this.settings.padSensitivity,
        padInvertY: this.settings.padInvertY,
        collideLeaves: this.settings.collideLeaves,
        radar: this.settings.radar,
        radarSize: this.settings.radarSize,
      },
      pad: this.gamepad.state(this.padActive),
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

  private benchState(): GameState['bench'] {
    if (!this.benchPhase) return null;
    const progress = this.bench?.runner.progress;
    return {
      phase: this.benchPhase,
      suite: this.benchSuite,
      index: progress?.index ?? 0,
      total: progress?.total ?? 0,
      scenario: progress?.scenario ?? null,
      reason: this.benchPhase === 'interrupted' ? this.benchStop : null,
      figures: this.bench?.figures ?? this.lastBenchFigures,
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
    // The others snap to the new place instead of seeing the player glide there.
    this.mp.noteTeleport();
    // A teleport changes which chunks are needed: not idle until the next frame says so.
    this.updateChunkCenter();
  }

  private updateChunkCenter(): void {
    this.chunkManager.setCenter(toChunkCoord(this.player.x), toChunkCoord(this.player.z));
    if (!this.chunksIdle()) this.framesSinceIdle = 0;
  }

  private createTestApi(): TestApi {
    return {
      isReady: () => this.meta !== null && this.chunksIdle() && this.framesSinceIdle > 0,
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
        if (!this.overlayOpen) this.applyLookPixels(dx, dy);
      },
      getBlock: (x, y, z) => this.world.getBlock(x, y, z),
      getChest: (x, y, z) => {
        const state = this.world.getState(x, y, z);
        return state ? state.slots.map((s) => (s ? { item: s.item, count: s.count } : null)) : null;
      },
      setBlock: (x, y, z, id) => this.testSetBlock(x, y, z, id),
      submit: (action) => this.testSubmit(action),
      surfaceY: (x, z) => this.world.surfaceY(x, z),
      terrainChecksum: (cx, cz) =>
        terrainChecksumAt(this.world.seed, this.world.gen, cx ?? 0, cz ?? 0),
      caveSites: () => {
        const terrain = getTerrain(this.world.seed, this.world.gen);
        return terrain instanceof TerrainV3 ? caveSites(terrain) : null;
      },
      lootSites: () => {
        const terrain = getTerrain(this.world.seed, this.world.gen);
        return terrain instanceof TerrainV4 ? lootSites(terrain) : null;
      },
      getLight: (x, y, z) => this.lightAt(x, y, z),
      verifyLight: () => this.world.verifyLight(),
      lightChecksum: () => lightChecksumOf((cx, cz) => this.world.lightOf(cx, cz)),
      setTime: (t) => {
        this.time = wrapTime(t);
        this.mp.setTime(this.time);
        this.markMetaDirty();
      },
      save: () => this.saveNow(),
      give: (item, count, player) => this.testGive(item, count, player),
      setCollideLeaves: (on) => this.useSettings({ ...this.settings, collideLeaves: on }),
      clearInventory: () => this.testClearInventory(),
      benchResult: () => (this.benchPhase === 'result' ? this.benchResult : null),
      netNetwork: () =>
        this.netConfig.signal ? this.loadNetwork(this.netConfig.iceServers) : Promise.resolve(null),
      glyphSheet: () => {
        if (!this.root.querySelector('.pad-glyph-sheet')) this.root.appendChild(glyphSheet());
      },
      figureSheet: () => {
        if (!this.root.querySelector('.figure-sheet')) this.root.appendChild(figureSheet());
      },
      net: {
        host: (options) => this.mp.openRoom(options),
        join: (code, options) => this.joinRoom(code, options),
        rooms: () => this.mp.rooms(),
        leave: () => {
          if (this.mp.role === 'guest') {
            this.mp.leave();
            this.leaveGuestWorld('');
          } else {
            this.mp.leave();
          }
        },
        sendRaw: (message) => this.mp.sendRaw(message),
        dropConnection: () => this.mp.dropConnection(),
      },
      suspendFrames: (on) => {
        this.framesSuspended = on;
      },
      openWorld: (name, seed, mode, progress) =>
        this.openNamedWorld(name, seed, mode ?? this.params.mode, progress),
      setProgress: (patch, player) => this.testSetProgress(patch, player),
      step: (n) => {
        for (let i = 0; i < n; i++) this.simulate();
        this.updateChunkCenter();
        this.draw(1);
      },
    };
  }
}
