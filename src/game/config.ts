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

/**
 * Version of the terrain generator that worlds of the "New world" form get (stored per
 * world). The automatic world of `?test=1` stays version 1 (Phase 7 part A).
 */
export const GENERATOR_VERSION = 3;
// --- Generator 3: caves (Phase 8 part B2a). Tuned to the face budget; never change a value
// after the merge (generator 3 is then frozen; a change is a generator 4).

/** Carving never reaches below this cell (the bedrock and the cell above it stay). */
export const BEDROCK_SAFE_Y = 3;
/** Edge length of a cave region in columns; its hash decides its tunnels. */
export const CAVE_REGION = 64;
/** A tunnel stays within this many blocks of its region on every side. */
export const CAVE_REACH = 32;
/** Tunnel radius range (blocks): 3 to 5 blocks wide. */
export const CAVE_RADIUS_MIN = 1.8;
export const CAVE_RADIUS_MAX = 2.4;
/** Tunnels per region: 0 to this many, decided by the region's hash. */
export const CAVE_TUNNELS_MAX = 4;
/** Share of tunnels that are entrances (open at the surface). */
export const CAVE_ENTRANCE_SHARE = 0.7;
/** Entrances start only on dry land up to this surface height. */
export const CAVE_ENTRANCE_MAX_Y = 84;
/** Entrances descend to a hashed height in this range. */
export const CAVE_TARGET_MIN_Y = 16;
export const CAVE_TARGET_MAX_Y = 30;
/** Edge length of a ravine region in columns and the chance that one holds a ravine. */
export const RAVINE_REGION = 256;
export const RAVINE_CHANCE = 0.5;
/** Mine shafts: a jittered grid of cells of this size, a chance per cell. */
export const SHAFT_GRID = 160;
export const SHAFT_CHANCE = 0.7;
/** A shaft's footprint columns differ in height by at most this much. */
export const SHAFT_MAX_HEIGHT_DIFF = 4;

/** Generator 2 spawn: at least this many trunks within `SPAWN_WOOD_RADIUS` (Chebyshev). */
export const SPAWN_MIN_TREES = 8;
export const SPAWN_WOOD_RADIUS = 40;
/** Generator 2 spawn: rings searched for a spot with wood before the plain rule applies. */
export const SPAWN_WOOD_RINGS = 256;
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
/** How long one progress notice ("Task done: …") shows, in simulation time (Phase 8). */
export const PROGRESS_NOTICE_MS = 3000;

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

/**
 * Version of the save format; a world saved by a newer version is not opened. Version 2
 * (Phase 6 part C) adds the guests of the world; version 1 records load without any.
 * Version 3 adds the world options, version 4 (Phase 8) the task book and the progress
 * fields of player records, version 5 (Polish 2) the tracked task of player records.
 */
export const SAVE_FORMAT_VERSION = 5;
/** Guests a world keeps (items and place); beyond this the one seen longest ago goes. */
export const GUESTS_MAX = 32;
export const WORLD_NAME_MAX = 24;
export const DEFAULT_WORLD_NAME = 'My world';
/** Unsaved changes are written this long after the first of them. */
export const AUTOSAVE_INTERVAL_MS = 5000;
export const SAVE_DATABASE = 'markuscraft';

// --- Performance test (Phase 4 part P) ---

/** Raised when a scenario is added or the order of the suite changes. */
export const BENCH_SUITE_VERSION = 4;
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
/**
 * `players` (Phase 6 part E): three simulated guests walk arcs in front of the player at
 * these radii (blocks), at most this angle to either side, at walking speed.
 */
export const BENCH_GUEST_RADII: readonly number[] = [3.5, 6.5, 9.5];
export const BENCH_GUEST_ARC = Math.PI / 4;
/** Their looks: Ember, Moss and Plum. */
export const BENCH_GUEST_LOOKS: readonly number[] = [2, 5, 8];
/** Each guest acts every this many steps (place, then break the same block). */
export const BENCH_GUEST_EDIT_INTERVAL = 30;
/** Steps before each break in which the guest holds break (its arm swings). */
export const BENCH_GUEST_BUSY_STEPS = 15;
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
/**
 * A browser "Back" this soon after the controller's B press is the same press. The time is
 * counted per frame, each frame (and the wait since the last one) at most
 * `BACK_PAIR_FRAME_MS`: a slow frame does not use up the window (fix-ci-flaky).
 */
export const BACK_PAIR_MS = 150;
export const BACK_PAIR_FRAME_MS = 25;

// --- Multiplayer (Phase 6) ---

/** Characters of room codes and test codes: no I, O, 0 or 1, which are easily mixed up. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Length of the network test's own code (the part after `mc-<build>-t-`). */
export const NET_TEST_CODE_LENGTH = 4;
/** The PeerJS server's key (its default). */
export const PEERJS_KEY = 'peerjs';
/** Registering with the signaling server must succeed within this time. */
export const SIGNAL_TIMEOUT_MS = 15_000;
/** A data channel must open within this time after "Connect" (ICE). */
export const ICE_TIMEOUT_MS = 15_000;
/** The room list and the network test's list of others are refreshed this often. */
export const ROOM_LIST_REFRESH_MS = 3_000;
/** The network test: pings for the round-trip time, then bytes in messages of this size. */
export const NET_TEST_PINGS = 20;
export const NET_TEST_BYTES = 1_048_576;
export const NET_TEST_MESSAGE_BYTES = 16_384;
/** The pings and the transfer of the network test must be done within this time. */
export const NET_TEST_RUN_TIMEOUT_MS = 30_000;

// --- Multiplayer: rooms and sessions (Phase 6 part B) ---

/** Players in one room, the host included. */
export const NET_MAX_PLAYERS = 4;
/** Length of a room code (the part after `mc-<build>-r-`). */
export const ROOM_CODE_LENGTH = 6;
/** A room code that is taken is drawn again up to this many times. */
export const ROOM_CODE_ATTEMPTS = 5;
/** A room that does not answer `info` within this time is left out of the room list. */
export const INFO_TIMEOUT_MS = 3_000;
/** Joining fails if the world has not arrived within this time. */
export const JOIN_TIMEOUT_MS = 15_000;
/** Longest message the decoder accepts, in characters. */
export const MAX_MESSAGE_BYTES = 65_536;
/** A peer that sends this many invalid messages is disconnected. */
export const MAX_PROTOCOL_ERRORS = 20;
/** Longest part of the world's edits sent on joining, in characters. */
export const SNAPSHOT_PART_BYTES = 16_384;
/** The host sends a guest more only while less than this is queued in its channel. */
export const NET_QUEUE_HIGH_WATER = 262_144;
/** Chunks the host keeps generated on the side for actions far from its own player. */
export const AUTHORITY_CACHE_CHUNKS = 32;
/** A player's pose is sent at most this often, and only while it changes. */
export const POSE_SEND_HZ = 20;
/** Other players are drawn this far in the past, between two received poses. */
export const INTERP_DELAY_MS = 100;
/** A pose this many blocks from the last one is a jump, not a movement. */
export const SNAP_DISTANCE = 8;
/** A guest pings the host this often; the pong carries the time of day. */
export const PING_INTERVAL_MS = 1_000;
/** A peer that sent nothing for this long counts as lost. */
export const HEARTBEAT_TIMEOUT_MS = 5_000;
/** A guest whose earlier connection was silent this long may replace it (a reconnect). */
export const DUPLICATE_STALE_MS = 2_500;
/** A guest that lost the host tries again this often, for this long. */
export const RECONNECT_INTERVAL_MS = 2_000;
export const RECONNECT_WINDOW_MS = 10_000;
/** "<name> joined", "<name> left" and connection notices stay this long; at most this many. */
export const NET_NOTICE_MS = 5_000;
export const NET_NOTICES_MAX = 4;
/** Longest player name, after trimming. */
export const PLAYER_NAME_MAX = 16;
/** Poses beyond these bounds are dropped by the host. */
export const POSE_LIMIT_XZ = 30_000_000;
export const POSE_MIN_Y = -64;
export const POSE_MAX_Y = 512;
/** A new guest starts on free ground within this many blocks of the host. */
export const START_POSE_RADIUS = 3;

// --- Multiplayer: Gathering together (Phase 6 part C) ---

/**
 * A guest's `break` that reaches the host at most this much before its time is up is held
 * and decided when it is due (Wi-Fi jitter shortens the time between two messages).
 */
export const NET_BREAK_GRACE_MS = 400;
/** A guest's actions beyond this many within one second are refused (`rate`). */
export const ACTION_RATE_LIMIT = 30;
export const ACTION_RATE_WINDOW_MS = 1_000;
/** Where a device keeps its player key and name (per site). */
export const PLAYER_STORAGE_KEY = 'markuscraft.player.v1';

// --- Player figure (Phase 6 part D) ---

/**
 * The figure's parts in figure texels (width × height × depth). Proportions of this game's
 * own: a smaller head, thinner arms and a deeper body than the best-known blocky figure.
 * 11 + 11 + 7 = 29 texels tall, scaled to `PLAYER_HEIGHT`.
 */
export const FIGURE_LEG: readonly [number, number, number] = [4, 11, 4];
export const FIGURE_BODY: readonly [number, number, number] = [8, 11, 5];
export const FIGURE_ARM: readonly [number, number, number] = [3, 10, 3];
export const FIGURE_HEAD: readonly [number, number, number] = [7, 7, 7];
export const FIGURE_TEXELS_TALL = 29;
/** Largest swing of a leg while walking, in radians (reached at walking speed). */
export const FIGURE_LEG_SWING = 0.6;
/** Blocks walked per full step cycle (both legs once forward). */
export const FIGURE_STRIDE = 1.6;
/** The limbs come to rest this long after the player stops. */
export const FIGURE_SETTLE_MS = 200;
/** Time constant of the smoothed walking speed and direction. */
export const FIGURE_SPEED_SMOOTH_MS = 40;
/** Below this speed (blocks per second) a figure counts as standing. */
export const FIGURE_STAND_SPEED = 0.3;
/** Fastest turn of the body towards the walking direction, in radians per second. */
export const FIGURE_BODY_TURN = 8;
/** The head is never turned further than this from the body. */
export const FIGURE_HEAD_YAW_MAX = Math.PI / 4;
/** One swing of the right arm (breaking, placing). */
export const FIGURE_SWING_MS = 300;
/** Largest angle of that swing. */
export const FIGURE_SWING_ANGLE = 1.1;
/** A longer gap between two frames (a hidden tab) counts as this long for a figure. */
export const FIGURE_MAX_FRAME_MS = 1_000;

// The radar (Phase 8 part B1): `src/radar/CLAUDE.md`.
/** Horizontal distance of the radar's veins (the circle's rim, the map's edge). */
export const RADAR_RADIUS = 48;
/** A kind with no vein in range points to its nearest one up to this far. */
export const RADAR_FAR_RADIUS = 96;
export const RADAR_CIRCLE_PER_KIND = 4;
export const RADAR_MAP_PER_KIND = 8;
/** Over this 3D distance a vein shows no depth hint. */
export const RADAR_COARSE_DIST = 24;
/** Up to this 3D distance the hint is the exact height difference. */
export const RADAR_EXACT_DIST = 12;
/** In the coarse range a height difference within ± this is "level". */
export const RADAR_LEVEL_DY = 3;
/** At most one scan per this many simulation steps (only if something changed). */
export const RADAR_SCAN_STEPS = 15;
/** At most one draw per this many simulation steps. */
export const RADAR_DRAW_STEPS = 4;
/** The heading-up circle redraws after the view turned by this many degrees. */
export const RADAR_TURN_DEG = 2;
export const RADAR_CIRCLE_PX = 112;
export const RADAR_CIRCLE_TOUCH_PX = 88;
