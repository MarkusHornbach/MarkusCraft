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

export const FOG_START_FACTOR = 0.6;
export const UNDERWATER_FOG_NEAR = 1;
export const UNDERWATER_FOG_FAR = 24;

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
/** Gives a jump apex of v²/2g ≈ 1.25 blocks. */
export const JUMP_SPEED = 8.4;
export const MAX_FALL_SPEED = 50;
export const FLY_SPEED = 10;
export const FLY_SPRINT_SPEED = 20;
export const FLY_ACCEL = 60;
export const SWIM_SPEED = 2.2;
export const SWIM_ACCEL = 20;
export const SWIM_SINK_SPEED = 2;
export const SWIM_RISE_SPEED = 3;
export const SWIM_VERTICAL_ACCEL = 14;
/** Upward speed given when jumping at the surface next to a bank, enough to climb out. */
export const SWIM_EXIT_SPEED = 7;
export const VOID_Y = -20;

export const REACH = 5;
export const ACTION_REPEAT_MS = 250;
export const HOTBAR_SLOTS = 9;

export const DAY_LENGTH_SECONDS = 20 * 60;
export const START_TIME_OF_DAY = 0.1;
export const DAYLIGHT_MIN = 0.25;

export const TEST_VIEW_WIDTH = 960;
export const TEST_VIEW_HEIGHT = 540;

export const SETTINGS_STORAGE_KEY = 'markuscraft.settings.v1';
