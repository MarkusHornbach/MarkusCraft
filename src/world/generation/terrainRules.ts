// Constants of the terrain rules shared by every generator version. Never change a value:
// generator version 1 and its recorded checksum depend on them.

/** Columns whose surface is this close to sea level are sand (beaches, shallow beds). */
export const BEACH_ABOVE = 2;
export const BEACH_BELOW = 3;
export const DIRT_DEPTH = 3;
export const MIN_SURFACE = 22;
export const MAX_SURFACE = 106;

export const CONTINENT_SCALE = 1 / 360;
export const DETAIL_SCALE = 1 / 110;
export const ROCK_SCALE = 1 / 64;
/** Per-column jitter of the rock line, so grass and rock do not meet along a contour. */
export const ROCK_JITTER = 1;
export const SALT_ROCK = 0x70c4;
