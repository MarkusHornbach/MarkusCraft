# src/world/generation/ — terrain generators (versions 1–4)

Pure core (root `CLAUDE.md`, "Architecture invariants"); tested in Node. Plans:
`docs/phase-7a-plan.md` (version 2), `docs/phase-8b2-plan.md` (version 3),
`docs/phase-8b3b-plan.md` (version 4).

## Files

`worldOptions.ts` (options, `WorldGen`, labels, validation), `terrain.ts` (version 1;
`TerrainSource`, dispatch, checksum), `terrainV2.ts` (shapes, forests), `terrainV3.ts`
(caves, `caveSites`), `terrainV4.ts` (loot chests, `lootSites`), `caves.ts` (tunnels, chambers, ravines, carve mask), `shafts.ts`
(mine shafts), `terrainRules.ts`, `ores.ts` (veins, clay), `trees.ts`, `spawn.ts`,
`columnCache.ts`. Test helpers: `src/testing/caveMeasure.ts`, `src/testing/caveViews.ts`.

## Generator version

Every world stores its generator: `WorldGen` is `{ version: 1 }` or `{ version: 2 | 3 | 4,
options: { terrain, trees } }` (the strings are append-only, pinned by
`worldOptions.test.ts`). `GENERATOR_VERSION` (4) is what the "New world" form gives (both
modes; the world list adds "· Caves" for 3, "· Caves · Loot" for 4, F3 "Generator 4 ·
balanced · few"); the automatic world of `?test=1` and the bench
(`BENCH_GENERATOR_VERSION`) stay version 1, the bench scenario `caves` version 3; `gen=3`
and `gen=4` make test worlds of those versions. `generateChunk`, `terrainChecksum` and `getTerrain` (cached per
seed and generator) dispatch on the version. An old version produces the same blocks for
ever: a change to generation adds a version. `TERRAIN_CHECKSUM_1337_V1` and the twelve
`TERRAIN_CHECKSUMS_1337_V2`, `_V3` and `_V4` (`src/testing/terrainChecksum.ts`) never change;
checked in Node and in the browser. Generator 3 is frozen since Phase 8 part B2a, generator
4 (blocks and loot) with the merge of B3b: a fix is a generator 5.

**Version 2** (`TerrainV2`) uses version 1's noise tables (`deriveSeed` 1–3) and rules
after the heights. Shapes (`SHAPE_CURVES`): `hilly` is version 1's curve; `balanced` and
`flat` keep the base below c = 0 (the water share) and flatten only the land. Trees: a
forest noise (`deriveSeed` 4) weights each column; `TREE_LEVELS` gives the candidate
chance; version 1's spacing rule and tree shape follow. Its chunk runs in phases
(`fillBase`, ores, `placeTreesPhase`) that version 3 reuses; tree hooks (`treeBlocked`,
`leafBlocked`) are off in version 2.

**Version 3** (`TerrainV3`, Phase 8 part B2a): version 2's phases with base → clay → ores
→ **carve** → **shafts** → trees. Old worlds keep their generator; no save format change.

- **Carve mask** (`CaveCarver`): a cave region (`CAVE_REGION` 64) hashes 0–4 tunnels
  (`CAVE_TUNNELS_MAX`), 70 % entrances; each is a chain of capsules (3-block segments,
  radius 1.8–2.4, floor 0.75 × radius below the axis) rasterized once per region into
  column spans and cached; a chunk's mask (16 × 16 × 128 bits, 512 cached) is the union of
  the spans of every shape whose box touches it, so borders agree in any order. Tunnels
  stay within `CAVE_REACH` (32) of their region (they turn back gradually).
- **Entrances** start on dry land (above the beach, surface ≤ 84) one above the surface
  and descend 0.4–0.55 per block to a hashed 16–30, then run level 3–8 segments; **deep
  tunnels** wander at 10–36 and stay 2 below the stone top. Chambers (3–5 wide ellipsoids,
  floor at the tunnel's floor) at the end and at 1 in 8 joints of the level part.
- **Rules** (a tunnel that breaks one is dropped as a whole, from heights only): no carved
  cell within 2 columns of a column at or below sea level unless 2 or more below its
  bed; y ≤ 2 never carved; no tunnel touches a ravine. **Crossing rule**: a deep tunnel
  touching an entrance's candidate shape is dropped, of two touching entrances the earlier
  (region z, x, index) stays, so an entrance's floor is never cut (the walk check needs
  it). The water rule skips columns whose continent noise is ≥ 0.34 (`continentAt`: c ≥ 0
  means height ≥ 50 for every shape; c changes ≤ `CONTINENT_SLOPE` 0.12 per block).
- **Ravines**: one per 256 × 256 region at 50 %, on dry land: a 64–80 long line, 3–7 wide,
  V-shaped, floor 14–24 where its ends (rising 0.9 per block to the highest ground of the
  line) allow it; dropped near water.
- **Shafts** (`ShaftPlanner`, 7 × 7 footprint): a 3 × 3 well, a log column in its centre,
  a spiral of plank steps (1 down per step, torches every 4) from a collar of planks at the
  footprint's lowest height (a log frame, plank lintel 4 above) to a stone-brick chamber
  (7 × 7 × 3, floor stood on at 10–14, two torches). Sites need dry land, heights within 4
  and no carved cell within one column. Grid: one candidate per 160 × 160 at 70 %; the
  spawn shaft: first fitting site on rings 24–128 (step 4) from the spawn, a hashed angle;
  grid shafts within 48 of it are left out.
- **Spawn**: `spawnPoint()` runs `findSpawn` over a view without shafts (they depend on
  the spawn) whose grass also wants no carved cell within 2 columns and 8 below. `isGrass`
  is false on carved and shaft columns; no tree or leaf over a carved column or in a shaft
  footprint. `heightAt` stays the noise height; `World.surfaceY` reads the blocks.

**Version 4** (`TerrainV4 extends TerrainV3`, Phase 8 part B3b): generator 3 plus
`Block.CHEST` in the **chest cell** of every shaft, `shaftChestCell(s)` = (x − 3, floor,
z + 3), the chamber corner without a torch, written after the trees (nothing reaches the
chamber). Nothing else changes: the identity test (`terrainV4.slow.test.ts`) compares every
chunk within 3 of the spawn shaft and two grid shafts with generator 3 for the twelve
presets (only the chest cells differ). `TERRAIN_CHECKSUMS_1337_V4` hash the 3 × 3 chunks
around the spawn chest's chunk (`terrainChecksumAt`, `spawnChestChunk`; the origin's may
equal V3's). `placesIn` adds a `chest` per shaft. **Loot** (`src/world/loot.ts`): contents
are never generated or stored; `lootAt(x, y, z)` derives them for a chest cell
(`lootOf(seed, x, y, z, table)`, `mulberry32` of `hash2(seed ^ SALT_LOOT, x, z)` mixed
with y): the spawn shaft's `starter` table (3–4 stacks), the other shafts' `rich` table
(4–6), drawn without repeats by weight into hashed free slots. `initialState` reads it
(`src/world/CLAUDE.md`). Never tools or natural blocks, and the starter sticks stay below
the 4 the first pickaxes need (`loot.test.ts`). `LOOT_CHECKSUM_1337_V4` pins the tables
and the draw: a change to either is a new generator.

**For the radar**: `veinCells` is the radar's copy of the vein walk; `oreHost` says where
generation leaves stone before the ores (version 3 adds: not carved, not a shaft cell);
the agreement tests (`src/radar/agreement*.slow.test.ts`) prove index = ores.

**Spawn** (versions 1, 2): the grass column nearest the origin with no trunk within
`SPAWN_TREE_CLEARANCE`; with trees, version 2 also wants `SPAWN_MIN_TREES` (8) trunks
within `SPAWN_WOOD_RADIUS` (40), searched up to `SPAWN_WOOD_RINGS` rings, then the plain
rule. `Game` finds the spawn with the world's generator.

## Budgets and measuring (generator 3 against 2, Node)

Faces per chunk (the GPU cost; nothing hides caves): median ≤ 1.5 ×, no preset above 2 ×
(`caveCost.slow.test.ts`); generation ≤ 1.35 × over 15 × 15 chunks
(`terrainV3Speed.solo.test.ts`); light and meshing ≤ 1.5 × (`caveLight.solo.test.ts`);
radar scan (`src/radar/scanCost.solo.test.ts`). If a budget fails, lower the density
(in a new version). `npx vite-node scripts/terrainStats.ts` prints version 2's measures.
Numbers: `docs/phase-7a-report.md`, `docs/phase-8b2a-report.md`.
