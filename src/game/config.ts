// Central game constants. Pure data: may be imported from every layer.

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 128;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;
export const SEA_LEVEL = 48;

export const RENDER_DISTANCE_DEFAULT = 8;
export const RENDER_DISTANCE_MIN = 2;
export const RENDER_DISTANCE_MAX = 16;
export const TEST_RENDER_DISTANCE = 4;
export const CHUNK_BUDGET_MS = 6;
/** The debug overlay's performance numbers cover this long. */
export const PERF_WINDOW_MS = 10_000;
/** A frame that takes longer than this is counted as a long frame (below 30 per second). */
export const LONG_FRAME_MS = 33;

export const FOG_START_FACTOR = 0.6;
export const UNDERWATER_FOG_NEAR = 1;
export const UNDERWATER_FOG_FAR = 24;

/** Version of the terrain generator that new worlds are created with (stored per world). */
export const GENERATOR_VERSION = 1;
/** Land at or above this height (shifted by noise) is bare rock without soil. */
export const ROCK_HEIGHT = 80;
/** Largest shift of the rock line by its low-frequency noise, in blocks. */
export const ROCK_HEIGHT_SHIFT = 4;
/** A land column this much higher or lower than a direct neighbour is bare rock. */
export const ROCK_SLOPE = 3;
export const COAL_MIN_Y = 12;
export const COAL_MAX_Y = 110;
export const IRON_MIN_Y = 4;
export const IRON_MAX_Y = 44;
/** Clay needs at least this much water above the lake bed. */
export const CLAY_MIN_WATER_DEPTH = 2;
/** Clay replaces this many blocks from the top of the lake bed. */
export const CLAY_DEPTH = 2;

export const TILE_SIZE = 32;
export const ATLAS_TILES_PER_ROW = 8;
/** Fixed seed for the tile painters: textures do not vary with the world seed. */
export const TEXTURE_SEED = 0x7e57ab1e;

export const FACE_SHADE_TOP = 1.0;
export const FACE_SHADE_NORTH_SOUTH = 0.8;
export const FACE_SHADE_EAST_WEST = 0.65;
export const FACE_SHADE_BOTTOM = 0.5;
export const AO_LEVELS: readonly number[] = [1.0, 0.8, 0.65, 0.5];
export const WATER_SURFACE_DROP = 1 / 8;

/** Brightest light level of a cell; sky light and block light both run from 0 to this. */
export const LIGHT_MAX = 15;
/** Light lost in a leaf or water block, on top of the one level every step costs. */
export const LEAVES_OPACITY = 1;
export const WATER_OPACITY = 1;
/** Block light of a torch in its own cell; it reaches 13 cells further. */
export const TORCH_LIGHT = 14;
/**
 * The box a torch is aimed at with (and its target outline), in blocks: wider than the
 * drawn stick so a finger can hit it, and as high as the flame. It stands on the cell's
 * floor, centred.
 */
export const TORCH_AIM_WIDTH = 6 / 16;
export const TORCH_AIM_HEIGHT = 14 / 16;
/** Brightness of a light level on screen: (level ÷ 15) to this power. */
export const LIGHT_GAMMA = 1.5;
/** Colour of block light at full strength: warm, like fire. */
export const TORCH_TINT: readonly [number, number, number] = [1.0, 0.86, 0.62];
/**
 * The darkest a place gets on screen, as a share of full daylight. The Brightness setting
 * moves it between the two ends; the light values themselves never change with it.
 */
export const MIN_LIGHT_DARKEST = 0.02;
/** The floor at the default Brightness (the middle of the slider). */
export const MIN_LIGHT_DEFAULT = 0.11;
/**
 * The floor with the slider at its top (Phase 4 part B: 0.20 → 0.35). Dark values lose
 * more on screen than the factor says (the sRGB curve is linear near black), and a phone
 * at night needs the top of the slider to show about a fifth of daylight (AC8.2).
 */
export const MIN_LIGHT_BRIGHTEST = 0.35;
export const BRIGHTNESS_DEFAULT = 0.5;

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE_HEIGHT = 1.62;
export const FOV_DEFAULT = 75;
export const FOV_MIN = 60;
export const FOV_MAX = 110;
export const MOUSE_SENSITIVITY_DEFAULT = 1;
export const MOUSE_SENSITIVITY_MIN = 0.2;
export const MOUSE_SENSITIVITY_MAX = 3;
/** Radians of rotation per pixel of mouse movement at sensitivity 1. */
export const LOOK_RADIANS_PER_PIXEL = 0.0025;
export const MAX_PITCH = (89 * Math.PI) / 180;

export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;
/** Upper bound of simulation steps per rendered frame, so a slow frame cannot spiral. */
export const MAX_STEPS_PER_FRAME = 5;

export const WALK_SPEED = 4.3;
export const SPRINT_SPEED = 5.6;
export const GROUND_ACCEL = 60;
export const AIR_ACCEL = 12;
export const GRAVITY = 28;
/** Gives a jump apex of about 1.25 blocks with the discrete 60 Hz integration. */
export const JUMP_SPEED = 8.6;
export const MAX_FALL_SPEED = 50;
export const FLY_SPEED = 10;
export const FLY_SPRINT_SPEED = 20;
export const FLY_ACCEL = 60;
export const SWIM_SPEED = 2.2;
export const SWIM_ACCEL = 20;
export const SWIM_SINK_SPEED = 2;
export const SWIM_RISE_SPEED = 3;
export const SWIM_VERTICAL_ACCEL = 30;
/**
 * Upward speed while jumping against a bank with the feet still in water. Leaving the
 * water at this speed lifts the feet about 1.1 blocks: enough for a bank one block
 * above the water surface, not for two.
 */
export const SWIM_EXIT_SPEED = 8;
export const VOID_Y = -20;

export const REACH = 5;
/** Slack for the reach check of the action layer (block centre against the actor's eye). */
export const REACH_TOLERANCE = 1.5;
export const ACTION_REPEAT_MS = 250;
/** A workbench or furnace unlocks its recipes within this distance of the eye. */
export const STATION_REACH = 5;
/** A furnace recipe shows its progress bar this long before the item is made. */
export const SMELT_MS = 2000;
/**
 * A held "Craft" makes its first item after this long, so that a finger resting on the
 * button before it scrolls the list does not craft (polishing session 1).
 */
export const CRAFT_HOLD_DELAY_MS = 500;
/** After the first, holding "Craft" repeats at this interval. */
export const CRAFT_REPEAT_MS = 250;
/** Slots of a player's inventory; the first `HOTBAR_SLOTS` are the bar. */
export const INVENTORY_SLOTS = 36;
export const STACK_SIZE = 99;
export const HOTBAR_SLOTS = 9;
/** A `break` may arrive this much before its time is up (Gathering). */
export const BREAK_TOLERANCE_MS = 100;
/** A pickup notice ("+1 Stone") and the "Inventory full" hint stay this long. */
export const NOTICE_MS = 1500;

export const DAY_LENGTH_SECONDS = 20 * 60;
export const START_TIME_OF_DAY = 0.1;
/**
 * Daylight at midnight (Phase 4 part B: 0.25 → 0.14). On screen open ground then has about
 * 7 % of its noon brightness, a little above an unlit cave at the default Brightness.
 */
export const DAYLIGHT_MIN = 0.14;

export const TEST_VIEW_WIDTH = 960;
export const TEST_VIEW_HEIGHT = 540;

export const SETTINGS_STORAGE_KEY = 'markuscraft.settings.v1';

/** Stick deflection (0..1) below which the player does not move. */
export const TOUCH_STICK_DEADZONE = 0.15;
/** Finger travel in CSS pixels for full stick deflection. */
export const TOUCH_STICK_RADIUS = 60;
/** Stick deflection beyond which the player sprints. */
export const TOUCH_SPRINT_THRESHOLD = 0.9;
/** The stick can start in the left half of the view, below this fraction of its height. */
export const TOUCH_STICK_ZONE_TOP = 0.3;
/** Radians of rotation per CSS pixel of a look drag at touch sensitivity 1. */
export const TOUCH_LOOK_RADIANS_PER_PIXEL = 0.004;
export const TOUCH_SENSITIVITY_DEFAULT = 1;
export const TOUCH_SENSITIVITY_MIN = 0.2;
export const TOUCH_SENSITIVITY_MAX = 3;
/** Render distance in touch mode while no setting is stored. */
export const TOUCH_RENDER_DISTANCE_DEFAULT = 5;
export const PIXEL_RATIO_MAX = 2;
export const TOUCH_PIXEL_RATIO_MAX = 1.5;

/** Version of the save format; a world saved by a newer version is not opened. */
export const SAVE_FORMAT_VERSION = 1;
export const WORLD_NAME_MAX = 24;
export const DEFAULT_WORLD_NAME = 'My world';
/** Unsaved changes are written this long after the first of them. */
export const AUTOSAVE_INTERVAL_MS = 5000;
export const SAVE_DATABASE = 'markuscraft';

// --- Performance test (Phase 4 part P) ---

/** Raised when a scenario is added or the order of the suite changes. */
export const BENCH_SUITE_VERSION = 2;
/** Version of the result record and of the issue text built from it. */
export const BENCH_FORMAT_VERSION = 1;
export const BENCH_SEED = 1337;
/** The test world is generated by this version for ever, whatever new worlds get. */
export const BENCH_GENERATOR_VERSION = 1;
/** Noon; the clock stands still during a run. */
export const BENCH_TIME = 0.25;
/** Render distances of the two blocks of the full suite and of the quick suite. */
export const BENCH_RENDER_DISTANCES: readonly number[] = [5, 8];
export const BENCH_QUICK_RENDER_DISTANCES: readonly number[] = [2, 3];
/** Steps with the scenario's input before its measurement window opens. */
export const BENCH_WARMUP_STEPS = 120;
export const BENCH_QUICK_WARMUP_STEPS = 6;
/** The quick suite runs a scenario for its steps divided by this, but at least the minimum. */
export const BENCH_QUICK_DIVISOR = 20;
export const BENCH_QUICK_MIN_STEPS = 20;
/** A window that takes this many times its nominal duration is cut off. */
export const BENCH_CUT_FACTOR = 3;
/** Longest wait for idle chunks before the run goes on. */
export const BENCH_IDLE_TIMEOUT_MS = 120_000;
/** Chunk work of one frame above this counts for the chunk-work light. */
export const BENCH_CHUNK_WORK_LIMIT_MS = 30;
/** Upper edges of the histogram buckets, in ms; one more bucket holds everything above. */
export const BENCH_FRAME_EDGES: readonly number[] = [9, 12, 17, 22, 33, 50, 100, 250];
export const BENCH_CHUNK_EDGES: readonly number[] = [1, 2, 4, 6, 8, 12, 16, 30, 50, 100];
/** The `edit` scenario submits one action every this many steps. */
export const BENCH_EDIT_INTERVAL = 6;
/** The `fly` scenario lets go of the keys this many steps before its window ends. */
export const BENCH_FLY_STOP_STEPS = 20;
/** `torches`: the share of the window at its end in which the player moves past the line. */
export const BENCH_TORCH_MOVE_SHARE = 0.4;
/** Smoothness light: share of long frames and 99th percentile, for green and for yellow. */
export const BENCH_LONG_SHARE_GREEN = 0.01;
export const BENCH_LONG_SHARE_YELLOW = 0.05;
export const BENCH_P99_GREEN_MS = 33;
export const BENCH_P99_YELLOW_MS = 50;
/** Chunk-work light: share of frames above `BENCH_CHUNK_WORK_LIMIT_MS`. */
export const BENCH_WORK_SHARE_GREEN = 0.001;
export const BENCH_WORK_SHARE_YELLOW = 0.01;
/** The device "slowed down" if the last `stand` has frames this much longer than the first. */
export const BENCH_THROTTLE_FACTOR = 1.2;
/** The Web Workers line is decided at this render distance (the touch default). */
export const BENCH_WORKERS_RENDER_DISTANCE = 5;
/** Longest issue link, after encoding. */
export const BENCH_ISSUE_URL_MAX = 7000;
/** User agent and GPU name are cut to this length. */
export const BENCH_TEXT_MAX = 200;
export const BENCH_REPOSITORY = 'MarkusHornbach/MarkusCraft';
export const BENCH_LABEL = 'perf-run';
export const BENCH_STORAGE_KEY = 'markuscraft.lastPerfRun.v1';
/** After "Start" the view may settle (fullscreen) this long before anything is loaded. */
export const BENCH_START_DELAY_MS = 800;

// --- Controller (Phase 5) ---

/** Button value from which a button counts as down, and below which it counts as up again. */
export const PAD_BUTTON_DOWN = 0.5;
export const PAD_BUTTON_UP = 0.35;
/** Radial dead zone of both sticks; outside it the deflection is rescaled to 0..1. */
export const PAD_DEADZONE = 0.15;
/** Look rate = (rescaled deflection ^ exponent) × maximum × controller sensitivity. */
export const PAD_LOOK_EXPONENT = 2;
export const PAD_LOOK_MAX_RAD_PER_S = 3.0;
/** Held beyond this horizontal deflection, turning speeds up (the ramp). */
export const PAD_RAMP_THRESHOLD = 0.95;
export const PAD_RAMP_DELAY_MS = 250;
export const PAD_RAMP_MS = 400;
export const PAD_RAMP_FACTOR = 1.6;
/** A stick makes the controller the active source only when pushed this far. */
export const PAD_ACTIVATE_THRESHOLD = 0.5;
/** The left stick moves the focus in menus when pushed this far along one axis. */
export const PAD_NAV_THRESHOLD = 0.5;
/** Holding a direction in menus: first repeat after this delay, then at this interval. */
export const PAD_NAV_DELAY_MS = 400;
export const PAD_NAV_REPEAT_MS = 120;
/** The right stick scrolls a menu this many pixels per second at full deflection. */
export const PAD_SCROLL_PX_PER_S = 900;
/** Longest time one poll may account for (as the simulation's 0.25 s cap). */
export const PAD_MAX_ELAPSED_MS = 250;
export const PAD_SENSITIVITY_DEFAULT = 1;
export const PAD_SENSITIVITY_MIN = 0.2;
export const PAD_SENSITIVITY_MAX = 3;
/** A browser "Back" this soon after the controller's B press is the same press. */
export const BACK_PAIR_MS = 150;
