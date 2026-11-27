// World options (Phase 7 part A): terrain shape and tree level of a world, and its generator.

/**
 * The strings are written into saves and room messages. Like block ids they are
 * append-only: never rename or remove one (`worldOptions.test.ts` pins them).
 */
export const TERRAIN_SHAPES = ['flat', 'balanced', 'hilly'] as const;
export const TREE_DENSITIES = ['none', 'few', 'normal', 'many'] as const;

export type TerrainShape = (typeof TERRAIN_SHAPES)[number];
export type TreeDensity = (typeof TREE_DENSITIES)[number];

export interface WorldOptions {
  terrain: TerrainShape;
  trees: TreeDensity;
}

/**
 * The generator of a world: version 1 has no options, versions 2 and 3 (caves, Phase 8
 * part B2a) take them.
 */
export type WorldGen = { version: 1 } | { version: 2 | 3; options: WorldOptions };

export const DEFAULT_WORLD_OPTIONS: WorldOptions = { terrain: 'balanced', trees: 'few' };
export const CLASSIC_GEN: WorldGen = { version: 1 };

export const TERRAIN_LABELS: Record<TerrainShape, string> = {
  flat: 'Flat',
  balanced: 'Balanced',
  hilly: 'Hilly',
};
export const TREE_LABELS: Record<TreeDensity, string> = {
  none: 'No trees',
  few: 'Few trees',
  normal: 'Normal trees',
  many: 'Many trees',
};
/** Short labels of the form's buttons. */
export const TREE_BUTTON_LABELS: Record<TreeDensity, string> = {
  none: 'None',
  few: 'Few',
  normal: 'Normal',
  many: 'Many',
};
/** How the world list names a generator 1 world. */
export const CLASSIC_LABEL = 'Classic';
/** Added to the world list's text of a generator 3 world. */
export const CAVES_LABEL = 'Caves';

export function isTerrainShape(value: unknown): value is TerrainShape {
  return typeof value === 'string' && (TERRAIN_SHAPES as readonly string[]).includes(value);
}

export function isTreeDensity(value: unknown): value is TreeDensity {
  return typeof value === 'string' && (TREE_DENSITIES as readonly string[]).includes(value);
}

/**
 * Result of reading stored or received options: `damaged` for anything malformed,
 * `newer` for well-formed strings this build does not know (written by a later build).
 */
export type OptionsCheck =
  { ok: true; options: WorldOptions } | { ok: false; error: 'damaged' | 'newer' };

/** Validates options from a save or a message. Never throws, never fills in a default. */
export function decodeWorldOptions(value: unknown): OptionsCheck {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, error: 'damaged' };
  }
  const record = value as Record<string, unknown>;
  const { terrain, trees } = record;
  if (typeof terrain !== 'string' || typeof trees !== 'string') {
    return { ok: false, error: 'damaged' };
  }
  if (terrain.length === 0 || terrain.length > 32 || trees.length === 0 || trees.length > 32) {
    return { ok: false, error: 'damaged' };
  }
  if (!isTerrainShape(terrain) || !isTreeDensity(trees)) return { ok: false, error: 'newer' };
  return { ok: true, options: { terrain, trees } };
}

/** Generator versions this build can generate. */
export function isKnownGeneratorVersion(version: number): boolean {
  return version === 1 || version === 2 || version === 3;
}

/**
 * The generator of a stored world or a room's welcome: version 1 without options, a
 * known later version with them. Null if the pair does not fit together.
 */
export function worldGenOf(version: number, options: WorldOptions | null): WorldGen | null {
  if (version === 1) return options === null ? CLASSIC_GEN : null;
  if ((version === 2 || version === 3) && options !== null) return { version, options };
  return null;
}

/** The options of a generator, null for version 1. */
export function optionsOf(gen: WorldGen): WorldOptions | null {
  return gen.version === 1 ? null : gen.options;
}

export function sameWorldGen(a: WorldGen, b: WorldGen): boolean {
  if (a.version !== b.version) return false;
  if (a.version === 1 || b.version === 1) return true;
  return a.options.terrain === b.options.terrain && a.options.trees === b.options.trees;
}

/** A stable key of a generator, for caches. */
export function worldGenKey(gen: WorldGen): string {
  return gen.version === 1 ? '1' : `${gen.version}:${gen.options.terrain}:${gen.options.trees}`;
}

/**
 * What the world list shows: "Balanced · Few trees", "Balanced · Few trees · Caves" for
 * version 3, or "Classic" for version 1.
 */
export function describeWorldGen(gen: WorldGen): string {
  if (gen.version === 1) return CLASSIC_LABEL;
  const text = `${TERRAIN_LABELS[gen.options.terrain]} · ${TREE_LABELS[gen.options.trees]}`;
  return gen.version === 3 ? `${text} · ${CAVES_LABEL}` : text;
}

/** The F3 overlay's row: "Generator 2 · balanced · few", or "Generator 1". */
export function debugWorldGen(gen: WorldGen): string {
  if (gen.version === 1) return 'Generator 1';
  return `Generator ${gen.version} · ${gen.options.terrain} · ${gen.options.trees}`;
}
