# Phase 8 part B2 plan – Caves and special places

Read `CLAUDE.md`, `src/world/CLAUDE.md`, `src/radar/CLAUDE.md`, `src/bot/CLAUDE.md`,
`src/progress/CLAUDE.md`, `src/bench/CLAUDE.md`, `src/save/CLAUDE.md`, `src/net/CLAUDE.md`
and `e2e/CLAUDE.md` first, and the "Decisions and deviations" of `docs/phase-8b1-report.md`
(the radar, `oreHost`, the vein walk copy), `docs/phase-7a-report.md` (generator 2, the
form, checksums), `docs/phase-4a-report.md` (light, the mesher, the cave light estimate),
`docs/fix-adventure-1-report.md` (the light rule, dark breaks) and `docs/phase-3a-report.md`
(generation).

Phase 8 ("Adventure") was outlined in `docs/phase-8a-plan.md`; part B is planned in
pieces. B1 (the radar) is built. **B2** (this plan) makes the underground easier to move
through and gives the radar real destinations. It is implemented in **two parts**, each
with its own session, branch, pull request and report:

- **B2a – Generator 3** (sections 6.1–6.9): tunnels with chambers, ravines and abandoned
  mine shafts as a new generator version for all new worlds; the radar's `oreHost` knows
  them; cost budgets; the bot and a walk check on generator 3; a bench scenario `caves`.
  Report: `docs/phase-8b2a-report.md`. Device tests: origin "8B2a".
- **B2b – Places on the radar** (sections 6.10–6.13): mine shafts and cave entrances as a
  second provider of radar entries next to `VeinIndex` (circle, Map tab, legend). No
  generation change. Report: `docs/phase-8b2b-report.md`. Device tests: origin "8B2b".

B2b starts from `main` after B2a is merged. Work on the branch assigned to the cloud
session, else `phase-8b2a-caves` / `phase-8b2b-places`. If this plan is not on `main` yet,
merge the branch that holds it (`claude/beautiful-cerf-06nl4f`) first. Both sessions are
autonomous: do not ask the owner questions. Where this plan leaves a detail open, choose the
simplest option consistent with it and note it in the part's report, section "Decisions and
deviations".

Tests name their criterion in the title as "Phase 8B2a AC1.1" or "Phase 8B2b AC1.1".

## 1. Goal

Digging blindly through a mountain for iron should shrink further. B1 told the player where
the ore is; B2 makes the way there shorter and gives the radar places to point at:

- **Tunnels with chambers** wind through the underground. Some open at the surface on dry
  land and slope down into iron depth (heights 4–44, sea level 48), walkable down and back
  up without breaking a block. Inside it is dark; torches, the sky light at the openings and
  the Brightness floor make it playable.
- **Ravines**: rare long cuts from the surface down to about y 14–24, with ore showing in
  their walls; their ends slope, so the floor can be reached on foot.
- **Abandoned mine shafts**: a lit staircase from a small frame of logs at the surface down
  to a chamber at about y 12, built from existing blocks. One is guaranteed near the spawn
  of every new world, so every Adventure world has a lit way into iron depth.
- In B2b the radar shows the nearest **mine shafts and cave entrances** next to the coal and
  iron veins.

Old worlds keep their generator and their terrain. No save format change, no protocol
change, no new blocks, items, recipes or tasks.

## 2. Findings of the planning session

- **A new generator version needs no save format change.** `WorldMeta` already stores
  `generatorVersion` and `options`; `decodeWorld` answers "newer" for a generator version
  the build does not know (`isKnownGeneratorVersion`), and a room's `welcome` carries the
  version and options and is checked against the terrain checksum. Generator 3 takes
  version 2's `{ terrain, trees }` options, so `worldGenOf(3, options)` fits format 5 as it
  is. An older build sees a generator 3 world as "Saved by a newer version" and refuses to
  join its room, which is what the rules want.
- **The cost of caves is faces, not light.** Scratch measurement in Node (7 × 7 chunks,
  seeds 1337 and 42, generator 2 balanced/few, crude radius-2 tunnels at y 8–44):

  | Carved share of the stone below y 45 | Faces per chunk (1337) | Faces per chunk (42) | Light per chunk |
  | ------------------------------------ | ---------------------: | -------------------: | --------------- |
  | 0 % (generator 2)                    |                  1 104 |                  469 | 0.6–1.0 ms      |
  | 3 %                                  |          1 660 (+50 %) |         994 (+112 %) | about the same  |
  | 6 %                                  |          2 064 (+87 %) |       1 518 (+224 %) | about the same  |

  The mesher draws every face next to air and nothing hides chunks underground, so cave
  walls cost triangles on the GPU even when nobody can see them. Closed tunnels get no sky
  light, so the earlier "2.4 × slower light" (a test chunk with 37 % carved out) is a worst
  case that playable caves do not reach. Hence decision "Face budget".

- **The radar's extension point fits.** `TerrainSource.oreHost` is per generator; B1's
  "taken by an earlier kind" rule looks at the earlier kind's vein cells, not at `oreHost`,
  so carving after the ores with `oreHost = stone before the ores && not carved && not
built` gives exactly the generated ores (6.6). The risk is cost: an expensive carve test
  per cell would grow the cold scan (about 19 ms in Node); a carve mask cached per chunk
  keeps it bounded.
- **Darkness does not make any task unreachable.** Caves and shafts only add air and lit
  steps; every task the bot does today it can still do by digging. The static check's
  light rule stays conservative (coal and iron ore are still `DARK_BLOCKS`). What can get
  worse is how many blocks a player breaks in the dark before torches (a tunnel under the
  first stone pit), which the bot's dark-break report measures (6.7).
- **Docs budget:** the root `CLAUDE.md` is at 22.7 KB of 25 KB and `src/world/CLAUDE.md` at
  7.4 KB of 8 KB (above the warning). B2a moves the section "Generator version" into a new
  `src/world/generation/CLAUDE.md` instead of raising any limit (section 12).
- **The Pi side:** `sync/status.md` of the owner's Pi repository could not be read in the
  planning session (adding the repository was denied). This plan needs nothing new on the
  Pi (section 11); the implementation sessions read it if it is reachable.

## 3. Decisions made with the owner

| Topic              | Decision                                                                                                                                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cave style         | **Tunnels with chambers**: seeded winding tunnels 3–5 blocks wide, worked out per region from a hash (like the ore veins); some open at the surface on dry land and slope down to iron depth; small chambers where tunnels end or meet. No 3D-noise caverns |
| Special places     | **Mine shaft and ravine.** No ore on the surface (it would weaken the "ore only in the dark" light rule and duplicates the radar)                                                                                                                           |
| Split              | **By layer:** B2a = the whole of generator 3 (one generator version); B2b = places on the radar                                                                                                                                                             |
| New worlds         | **Always generator 3** for new worlds (Creative and Adventure), no new form row and no new option string. The `?test=1` world and the bench keep generator 1                                                                                                |
| Face budget        | **Density budget:** the median faces per chunk of generator 3 at most 1.5 × generator 2's (about 2 % carved), pinned by a Node test, plus a bench scenario `caves`. No renderer change                                                                      |
| Shafts             | **Rare plus one near the spawn:** about one per 160 × 160 blocks on a jittered grid, plus one guaranteed 24–64 blocks (horizontal) from the spawn on dry land. A shaft exposes the veins it cuts; it adds no ore                                            |
| Radar places (B2b) | **Mine shafts and cave entrances**, each a place kind with its own shape; nearest 2 of each on the circle, 4 on the map; a far radius of 192 for the rim arrow of places. Ravines are not shown                                                             |

## 4. Changes to the original scope

The owner's starting scope was challenged during planning. Agreed changes:

| #   | Change                                                                                                                  | Reason                                                                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | B2 is split by layer into B2a (generator 3 complete) and B2b (places on the radar)                                      | About 1.8–2 typical parts in one PR. A split by feature (shafts later) would need a generator 4, since a merged generator version is frozen; the layer split keeps one version                    |
| 2   | Ore on the surface is dropped from the special places                                                                   | It changes ore placement and breaks the assumption of the task book's light rule that ore is found only in the dark; the radar already answers "where is ore near the surface"                    |
| 3   | The performance budget is about faces per chunk first, then light, meshing, generation and the radar scan               | Measured: closed tunnels barely change light time, but 3 % carved adds 50–110 % faces per chunk (section 2). The density is tuned to a face budget                                                |
| 4   | Generator 3 is what every new world gets, Creative included; no form option                                             | No new form row at 640 × 360, no option string to keep forever; older worlds keep their generator                                                                                                 |
| 5   | Added: one mine shaft is guaranteed near the spawn                                                                      | Every new world has a lit way into iron depth ("reachable without a torch"), and tests find a shaft deterministically                                                                             |
| 6   | Added: the radar shows cave entrances as places, not only shafts; places get a far radius of 192                        | Entrances are the main new way down; a rare shaft is otherwise often beyond 96 blocks and never pointed at                                                                                        |
| 7   | Added: a pure walk check ("reachable on foot, without breaking a block, and for shafts in torch light") next to the bot | The bot digs everywhere and knows no darkness, so it cannot prove that caves and shafts are usable; the walk check proves the promises of section 1 directly                                      |
| 8   | Added: tunnels never carve next to water; trees and the spawn avoid carved columns; the world list says "· Caves"       | Water does not flow in this game, so a tunnel beside a lake would show a standing wall of water; floating trees and a spawn over a hole look broken; the owner must tell old and new worlds apart |
| 9   | Added: a URL parameter `gen=3` for test worlds                                                                          | Specs and references need a generator 3 world without the menu flow; `?test=1` alone stays generator 1, so every older reference stays as it is                                                   |

## 5. Out of scope (do not build)

- Chests and any block state (B3), new blocks, items, recipes, materials or tool tiers;
  changes to the task, chapter, recipe or unlock tables.
- Ore on the surface, extra ore in shafts or ravines, any change to the vein walk or ore
  chances (generator 3 places the same veins as generator 2 before carving).
- 3D-noise caverns, underground lakes, flooded caves, flowing water, lava.
- A renderer change (depth culling, occlusion queries); Web Workers (Phase 4 part C).
- Fog of war, a discovered-map memory, goal markers set by tasks, waypoints.
- Health, falling damage, creatures, enemies.
- A save format change (`SAVE_FORMAT_VERSION` stays 5), a room protocol change
  (`src/net/protocol.ts` stays untouched), changes to generator 1 or 2 output or checksums.
- A "Caves" switch in the "New world" form; converting old worlds to generator 3.
- Sound; the rest of Phase 7.

## 6. Specification

### Part B2a – Generator 3

#### 6.1 Generator 3 (`src/world/generation/`)

- **`TerrainV3`** (`terrainV3.ts`) has version 2's heights, rock, beaches, soil, water,
  clay, ores and tree rules for the same options and seed, then carves and builds:
  base → clay → ores → **carve** (tunnels, chambers, ravines) → **shafts** → trees. To share
  code, factor `TerrainV2.generateChunk` into its phases (`fillBase`, ores, `placeTrees`)
  without changing its output; the twelve `TERRAIN_CHECKSUMS_1337_V2` and the speed solo
  tests guard that. `TerrainV2` stays the code of version 2 for ever.
- **Dispatch:** `isKnownGeneratorVersion` accepts 3; `WorldGen` gets `{ version: 3;
options }`; `worldGenOf(3, options)`, `optionsOf`, `sameWorldGen`, `worldGenKey`,
  `describeWorldGen` ("Balanced · Few trees · Caves"), `debugWorldGen` ("Generator 3 ·
  balanced · few"). `GENERATOR_VERSION` becomes 3 (what the form gives).
  `BENCH_GENERATOR_VERSION` and the automatic `?test=1` world stay 1.
- **Checksums:** twelve `TERRAIN_CHECKSUMS_1337_V3` (one per preset) in
  `src/testing/terrainChecksum.ts`, pinned once the density is tuned (step 7), checked in
  Node and in the browser like version 2's. The V1 and V2 checksums never change.
- **Carve mask:** whether a cell is carved is a pure function `carved(x, y, z)` of seed and
  options. It is worked out per chunk as a bit mask (16 × 16 × 128 bits) and cached
  (bounded, for example 256 chunks, oldest dropped); generation and `oreHost` use the same
  mask. A tunnel or ravine is evaluated from every region whose reach touches the chunk, so
  both sides of a border agree and the result never depends on generation order.

#### 6.2 Tunnels and chambers (`caves.ts`)

- Space is divided into **cave regions** (`CAVE_REGION`, for example 64 × 64 columns). A
  region's hash decides its tunnels: each tunnel is a chain of segments (capsules) from a
  start point, its yaw and pitch changing by hashed steps, radius `CAVE_RADIUS_MIN`–`MAX`
  (about 1.5–2.5, so 3–5 blocks wide), length bounded so that it stays within
  `CAVE_REACH` blocks of its region (only neighbouring regions are evaluated). Hot path:
  typed arrays, no allocation per cell.
- **Entrance tunnels** start at a dry land column (grass or rock, not a beach, not under
  water) and descend to a hashed target height of 16–30 with a slope of at most 1 down per
  1 along (walkable both ways); the mouth breaks the surface. **Deep tunnels** wander at
  y 8–40 and never reach the soil. **Chambers** (ellipsoids, radius about 3–5) sit at
  tunnel ends and at some segment joints.
- **Rules (a tunnel that breaks one is dropped as a whole, decided from heights only, so an
  entrance always stays connected):** never carve y ≤ 2 (bedrock and the cell above stay);
  never carve a cell within 2 blocks (horizontally and above) of a column whose top is at
  or below sea level (no air beside water, no hole in a lake or sea floor); only an
  entrance mouth carves soil or the surface. A ravine or shaft footprint (plus one block)
  is never carved by a tunnel.
- **Density** (`CAVE_*` constants in `config.ts`) is tuned in step 7 to the face budget
  (AC2.1); about 2 % of the stone below y 45 is the expected result. The report gives the
  final numbers (carved share, entrances per 1 000 × 1 000 blocks).

#### 6.3 Ravines (`caves.ts`)

- Rare (`RAVINE_REGION`, for example 256 × 256, a hashed chance), only on dry land: a path
  of 40–80 blocks with a slowly turning direction; width 3–7 at the top, narrowing towards
  the floor; the floor at a hashed height of 14–24. Both ends slope at most 1 down per 1
  along up to the surface, so the floor is reachable on foot.
- The same water and bedrock rules as tunnels; a ravine whose path would come within 2
  blocks of a water column is dropped. Ravines are carved after tunnels (they share the
  mask), and never through a shaft footprint.

#### 6.4 Abandoned mine shafts (`shafts.ts`)

- **Sites:** a jittered grid of `SHAFT_GRID` (160 × 160) cells, a hashed chance per cell
  (about 0.6–0.8), plus the **spawn shaft**: the first suitable site on a hashed ring
  search 24–64 blocks (horizontal) from the spawn, further out up to 128 if none fits (the
  report says how often that happens over the test seeds). A site is suitable if every
  column of its footprint is dry land (not water, not a beach) and the footprint's heights
  differ by at most 4. Grid shafts within 48 blocks of the spawn shaft are left out.
- **Spawn first:** the spawn search of generator 3 does not depend on shafts (6.5), so the
  terrain finds its spawn (cached), then its spawn shaft, without a cycle.
- **Shape** (existing blocks only: planks, logs, torch, stone bricks): a footprint of at
  most 8 × 8 columns; a staircase of 1-block steps (1 down per 1 along, at least 2 cells of
  headroom) winding down a well around a central column, from the surface to a chamber at
  y 10–14 (at least 5 × 5 × 3 of air); the well's walls stay as generated (stone, ore,
  soil) except where a step needs a block; a frame of logs and planks at most 4 blocks
  above the surface marks the top; a torch on a step at least every 6 steps down and two
  in the chamber (each on a solid cube, the support rule holds). The exact layout is the
  implementer's, within these limits; record it.
- A shaft cuts through whatever veins lie in its well (ore in its walls is the vein's,
  never added). Torches make the shaft lit: no torch of the player's own is needed to walk
  it (AC3.3).

#### 6.5 Trees, spawn and surface (generator 3)

- No tree on a column whose ground cell is carved or belongs to a shaft footprint; no leaf
  into a shaft footprint (the frame stays visible).
- `isGrass` is false for a carved or shaft column; the spawn search of generator 3 also
  wants no carved cell within 2 columns and 8 blocks below the surface of the spawn column.
  `TerrainSource` gets what the spawn and the radar need; the spawn code stays one function.
- `heightAt` stays the uncarved height (the noise); `World.surfaceY` and the Map tab read
  the real blocks, so a mouth or ravine shows as what it is.

#### 6.6 The radar's ore host

- `TerrainV3.oreHost(x, y, z)` = version 2's rule (stone before the ores) and not carved
  and not a shaft block or shaft air. Nothing in `src/radar/` changes in B2a.
- The agreement test (`src/radar/agreement.slow.test.ts`) also covers generator 3, all
  twelve presets, the four seeds, the two squares of B1 **plus** the 3 × 3 chunks around the
  spawn shaft and around one ravine per seed. If its time grows above about 10 s, move the
  generator 3 cases into a file of their own.
- The cost of `oreHost` with the carve mask keeps the radar's scan within budget (AC2.4).

#### 6.7 The goal bot and the walk check (`src/bot/`, `scripts/progressRun.ts`)

- **The walk check** (`src/bot/walk.ts`, pure): a breadth-first search over standing cells
  (an air or torch cell with a solid cube below and a free cell above) of the generated
  blocks: a step to a neighbour at the same height, one up (a jump) or any number down (no
  fall damage), never through a solid block, never breaking one. Options: a light floor
  (only cells whose block light, or sky light by day, is above `DARK_LIGHT`).
- Uses: every entrance tunnel within 96 blocks of the spawn reaches a cell at y ≤ 30 from
  its mouth **and back**; the spawn shaft's top reaches its chamber and back **with the
  light floor on block light alone** (torches, no sky); every ravine's floor is reachable
  from the surface beside it. It runs in a slow test (AC3.1–AC3.3) and in
  `scripts/progressRun.ts` (a "Generator 3" section: entrances and shafts checked, the
  median walking distance from the spawn to the shaft's chamber).
- **The bot on generator 3:** `scripts/progressRun.ts` runs generator 3 by default (what
  new worlds get) and takes `--gen 2` for the comparison; `bot.slow.test.ts` adds a
  generator 3 run (seed 1337, balanced, few). The bot needs no new skill; it may fall into
  a tunnel and climbs out with its existing pillar skill. If it gets stuck (a refused
  action), fix the bot, never the terrain rules.
- **Darkness:** the dark-break report compares generator 3 with generator 2: for the tasks
  before the torch is unlocked (1–11), the median dark breaks per task on generator 3 must
  not exceed generator 2's by more than 2 (AC3.5). The book's targets (total 30–45
  minutes, no task over 5, no chapter over 12) still hold on generator 3.

#### 6.8 Performance budgets and measurement

All measured in Node in this container except the bench; numbers from software WebGL are
never evidence. Each comparison is generator 3 against generator 2 for the same seed and
options; "median" is over seeds 1, 42, 1337, 2024 × flat, balanced, hilly (trees few).

| What                                     | Budget                                  | Test                                         |
| ---------------------------------------- | --------------------------------------- | -------------------------------------------- |
| Faces per chunk (9 × 9 chunks at origin) | median ≤ 1.5 ×, no preset above 2 ×     | `src/world/generation/caveCost.slow.test.ts` |
| Generation per chunk (warm, spawn known) | ≤ 1.35 ×                                | `terrainV3Speed.solo.test.ts`                |
| First chunk of a world (spawn and shaft) | measured and limited (≥ 3 × the median) | same file                                    |
| Light per chunk (`lightChunk`)           | ≤ 1.5 ×                                 | `caveLight.solo.test.ts`                     |
| Meshing per chunk (with light)           | ≤ 1.5 ×                                 | `caveMesh.solo.test.ts`                      |
| Radar scan, cold and warm (B1's set-up)  | ≤ 1.5 × cold, ≤ 1.3 × warm              | `src/radar/scanCost.solo.test.ts`            |

Solo files warm both sides up and take the best of many rounds, the two sides in turn. If a
budget cannot be met, lower the density first (fewer tunnels, smaller radius); the face
budget wins over the carved share. The report gives every number.

- **Bench:** a scenario `caves` (version 1; `BENCH_SUITE_VERSION` 4 → 5): the `walk` input
  in a generator 3 world (seed 1337, balanced, few) instead of the bench's generator 1
  world (a scenario field `gen`, used only by `caves`). Its row stands next to `walk`;
  `scenarios.test.ts` pins the table. Device test CAVE-1 is the evidence.
- The F3 overlay's chunk row is unchanged; the report gives the faces per chunk.

#### 6.9 Worlds, rooms, tests tools, screens

- **Save:** format stays 5. A generator 3 record stores `generatorVersion` 3 and `options`;
  without valid options it is damaged; a generator 3 record read by this build loads; save
  tests cover it. Old records are untouched.
- **Rooms:** nothing in the protocol changes; the `welcome` carries version 3 and the
  options; the guest checks the checksum with `terrainChecksum(seed, gen)`. A browser spec
  opens a room of a generator 3 world and compares a tunnel chunk of host and guest.
- **Test tools:** `gen=2|3` with `test=1` (with `terrain` and `trees` or their defaults);
  without `gen`, `terrain` or `trees` still give generator 2 (older specs unchanged).
  `getState().world.generator` shows the version. A test helper finds the spawn shaft and
  the nearest entrance mouth (`__mc` or a pure function the spec calls through the test
  API; documented in `docs/testing.md`).
- **Screens:** the world list shows "· Caves" for generator 3, the F3 row "Generator 3 · …".
  The "New world" form is unchanged (it gives generator 3).
- **References** (new, generator 3 test worlds, looked at): `cave-tunnel` (inside a tunnel,
  a placed torch, the mouth's daylight behind), `mine-shaft` (looking down the spawn
  shaft's stairs with its torches), `ravine` (from the rim, ore in the walls). Older
  references do not change (the `?test=1` world stays generator 1).

### Part B2b – Places on the radar

#### 6.10 The places provider (`src/world/generation/`, `src/radar/places.ts`)

- `TerrainSource.placesIn(minX, minZ, maxX, maxZ, out)` (generator 3; empty for 1 and 2):
  the mine shafts (the top step's cell) and the entrance mouths (the lowest air cell of the
  mouth open to the sky) whose cell lies in the area, computed with the same decision code
  generation uses (no blocks generated). Pure, deterministic, no allocation per cell.
- `PlaceIndex(seed, gen)` (in `src/radar/`) caches places per region like `VeinIndex`
  (bounded). Places are permanent: no world correction (a mined frame still marks the
  shaft).

#### 6.11 Radar kinds and scan

- `RADAR_KINDS` gets a `category` (`ore` or `place`) and two rows: `shaft` ("Shaft", a
  hollow square, light brown) and `cave` ("Cave", a downward triangle, light grey). Shapes
  differ from coal's dot and iron's diamond; colour is never the only difference. Labels
  are generic words.
- `scanRadar` merges the places into its per-kind lists: places in range (horizontal ≤ 48) by 3D distance, at most `RADAR_CIRCLE_PLACES` (2) per place kind on the circle and
  `RADAR_MAP_PLACES` (4) on the map; hints by B1's table; `beyond` for a place kind uses
  `RADAR_PLACE_FAR_RADIUS` (192). Ore kinds are unchanged.
- **Task focus:** a focus narrows the ore kinds only; places are always on the circle (a
  shaft or entrance leads to both ores).
- Generators 1 and 2 have no places: their circle, map and legend stay exactly as in B1.

#### 6.12 On screen and test tools

- The circle and the Map tab draw the place symbols with their hints; labels nearest
  first, as B1. The Map tab's legend gets a row per place kind in generator 3 worlds
  ("Shaft · 37 blocks · level", "Cave · none within 192"); the legend must still fit
  640 × 360 without scrolling (two columns or a smaller row height if needed; record it).
- `getState().radar.entries` and `getState().map.legend` include the place kinds.

#### 6.13 Bot, rooms, bench

- `bot.slow.test.ts` (generator 3 run): at the start of task 16 the radar's nearest shaft
  and nearest cave entrance equal a brute-force search of `placesIn` over the far radius,
  and the nearest shaft's top is a planks or log block of the generated world.
  `scripts/progressRun.ts` adds to the "Radar" section the median distance from the spawn
  to the nearest shaft and entrance.
- Rooms: a guest's places equal the host's (pure function of seed and generator).
- No new bench scenario (the radar scenario stays in the generator 1 bench world); the
  scan cost test adds places (AC5.4).

## 7. Acceptance criteria

### Part B2a

**AC1 Generator 3**

- AC1.1 `generateChunk` dispatches version 3; the twelve `TERRAIN_CHECKSUMS_1337_V3` are
  pinned and checked in Node and in the browser; V1 and V2 checksums and their speed solo
  tests pass untouched.
- AC1.2 Determinism and borders: for seeds 1, 42, 1337, 2024 and the twelve presets,
  generating a chunk alone equals generating it after its neighbours (any order); a tunnel
  and a ravine that cross a chunk border match on both sides.
- AC1.3 Rules (unit, over the four seeds × twelve presets, 9 × 9 chunks at the origin and
  around the spawn shaft): no carved cell at y ≤ 2; no air cell from carving face-adjacent
  to water; no tree trunk or leaf over a carved column or a shaft footprint; no carved cell
  in a shaft footprint except the shaft's own air; every torch stands on a solid cube.
- AC1.4 Ores: generator 3's ores before carving equal generator 2's for the same seed and
  options (the vein walk is unchanged); after carving, every coal and iron ore block lies
  in a cell where generator 2 has the same ore.
- AC1.5 Spawn: the spawn of every preset is grass, with no carved cell within 2 columns
  and 8 blocks below its surface; the spawn shaft lies 24–64 blocks (horizontal) from it in
  at least 44 of the 48 cases, and within 128 in all.
- AC1.6 Save and generator plumbing: a generator 3 record round-trips; one without options
  is damaged; `describeWorldGen`, `debugWorldGen`, `worldGenKey`, `sameWorldGen` cover
  version 3; `SAVE_FORMAT_VERSION` stays 5 and older save tests pass untouched.

**AC2 Budgets** (section 6.8)

- AC2.1 Faces per chunk: median ≤ 1.5 × generator 2, no preset above 2 ×.
- AC2.2 Generation per chunk ≤ 1.35 × generator 2; the first chunk of a world measured and
  limited.
- AC2.3 Light and meshing per chunk ≤ 1.5 × generator 2 each; `verifyLight()` is 0 after
  loading, lighting, and breaking into a tunnel from the surface in a `World` of generator 3.
- AC2.4 The radar scan (cold, warm) on generator 3 ≤ 1.5 × and 1.3 × generator 2.
- AC2.5 The scenario `caves` (version 1) exists, `BENCH_SUITE_VERSION` is 5, a local bench
  run completes it (cloud: smoke check only).

**AC3 Usable without digging, and the bot**

- AC3.1 Walk check: every entrance tunnel within 96 blocks of the spawn (four seeds ×
  twelve presets) reaches y ≤ 30 from its mouth and returns, without breaking a block.
- AC3.2 Walk check: every ravine found within 192 blocks of the spawn has its floor
  reachable on foot from the surface beside it.
- AC3.3 Walk check: the spawn shaft's top reaches its chamber and back, every standing cell
  on the way having block light above `DARK_LIGHT` (torch light only).
- AC3.4 Radar agreement on generator 3 (6.6): prediction equals the generated ores cell by
  cell for all cases listed there.
- AC3.5 The bot completes the book on generator 3 in all 12 runs of
  `scripts/progressRun.ts`; the book's time targets hold; the median dark breaks per task
  of tasks 1–11 on generator 3 exceed generator 2's by at most 2; the report holds both
  tables. `bot.slow.test.ts` passes with its generator 3 run.

**AC4 Worlds, rooms, screens**

- AC4.1 The "New world" form creates a generator 3 world (both modes); the world list shows
  "· Caves"; F3 shows "Generator 3 · balanced · few" (browser spec).
- AC4.2 `?test=1&gen=3&seed=1337` opens a generator 3 world; `?test=1` alone is generator 1
  and every older reference is unchanged.
- AC4.3 Room: a guest joins a generator 3 world; the checksum matches; a chunk with a tunnel
  is identical on both; `src/net/protocol.ts` is not touched.
- AC4.4 References `cave-tunnel`, `mine-shaft`, `ravine` exist and were looked at (tunnel
  walls readable in torch light, the shaft's torches and steps clear, ore visible in the
  ravine wall, no water wall, no floating tree).
- AC4.5 Docs: `src/world/generation/CLAUDE.md` exists; the root `CLAUDE.md` has the B2a
  status row and generator "now 3"; the docs budget passes; device tests CAVE-1 to CAVE-6
  are in `docs/device-tests.md`.
- AC4.6 `npm run check`, `npm run build` and the affected specs pass; no console errors.

### Part B2b

**AC5 Places on the radar**

- AC5.1 Places agreement (`src/radar/placesAgreement.slow.test.ts`): for the four seeds
  and twelve generator 3 presets, every shaft and entrance mouth `placesIn` lists within
  128 blocks of the spawn exists in the generated blocks (a frame block at a shaft's top
  cell, an air cell open to the sky at a mouth), and every shaft and tunnel mouth in the
  generated chunks is listed.
- AC5.2 Scan (unit): nearest 2 per place kind on the circle, 4 on the map, deterministic
  order; `beyond` up to 192 for places, null beyond; a focus narrows ore kinds only;
  generators 1 and 2 give no place entries and the B1 results unchanged.
- AC5.3 `bot.slow.test.ts`: at the start of task 16 the radar's nearest shaft and entrance
  equal the brute-force search (6.13); `scripts/progressRun.ts` prints the distances.
- AC5.4 Scan cost with places ≤ 1.2 × B2a's generator 3 scan (cold and warm, solo test).

**AC6 On screen**

- AC6.1 Browser: in a generator 3 Adventure world with `progress=all` the circle shows a
  shaft or cave symbol with its hint (`getState().radar.entries`); in a generator 2 world
  it shows none.
- AC6.2 The Map tab's legend has "Shaft" and "Cave" rows in generator 3 worlds, fits 640 ×
  360 without scrolling (spec measures it), and has no place rows in generator 1 and 2.
- AC6.3 References `radar-places` (PC) and `map-tab-places` (640 × 360), looked at:
  the four shapes told apart, labels upright, legend readable. B1's references are
  unchanged (generator 1 test world).
- AC6.4 Room: the guest's nearest shaft entry equals the host's at the same cell.
- AC6.5 Docs: `src/radar/CLAUDE.md` describes the places provider; status row; device
  tests PLACE-1 to PLACE-4; docs budget passes. `npm run check`, `npm run build` and the
  affected specs pass; no console errors.

## 8. Test strategy

- **Unit (Node):** carving, ravines, shafts, spawn rules, border agreement, the rules of
  AC1.3, save plumbing; the walk check (small hand-built worlds: a stair, a jump, a drop, a
  wall, the light floor) before using it on terrain; places (B2b).
- **Slow:** radar agreement incl. generator 3, the face budget, walk checks on terrain, the
  places agreement, the bot. **Solo:** generation, light, meshing and scan cost.
- **Bot:** `scripts/progressRun.ts` on generators 3 and 2; tables into the report.
- **Browser:** a new `e2e/caves.spec.ts` (AC4.1–AC4.2, AC4.4, the light invariant after
  breaking into a tunnel through actions), `e2e/mpCaves.spec.ts` (AC4.3), B2b
  `e2e/radarPlaces.spec.ts` (AC6). Adapt specs that read "Generator 2" or the world list
  label of a new world (`e2e/ui.spec.ts`, `e2e/worldMenu.spec.ts`, …) and record each in
  "Tests changed on purpose". Add new specs to `e2e/shards.json` by the last CI times.
- Wait on state (`whenIdle`, `isReady`), never on sleeps; `MC_CONTAINER_GPU_STALL=1` in the
  cloud. Open every new reference with the Read tool and judge it by eye.

## 9. Device tests

The owner runs them at the end of Phase 8. Origins "8B2a" and "8B2b"; new section "12.
Caves and places (Phase 8 part B2)".

- **CAVE-1** Performance test on the phone: the `caves` row against `walk` (frame time,
  lights). _Phone._
- **CAVE-2** A new Adventure world: follow an entrance tunnel down to iron depth with
  torches and back up. Is it easy to find the way, too dark, too bright? _PC, Phone._
- **CAVE-3** Walk the surface of a new world: cave mouths and ravines look natural? Any
  hole beside water, floating tree, odd edge? _PC._
- **CAVE-4** The mine shaft near the spawn: found without the radar? Stairs easy to walk
  down and up (touch and controller too)? Is the torch light enough? _PC, Phone,
  controller._
- **CAVE-5** "Mine 20 iron ore" in a generator 3 world: how long, compared with RADAR-4?
  Did caves or the shaft make it more fun, or too easy? _PC._
- **CAVE-6** A room in a generator 3 world: does the guest see the same caves and shaft?
  _PC + Phone._
- **PLACE-1** (8B2b) The circle with shaft and cave symbols: told apart from coal and iron
  at a glance; too crowded? _PC, Phone._
- **PLACE-2** (8B2b) The Map tab's legend with four rows on the phone: readable? _Phone._
- **PLACE-3** (8B2b) Follow the radar from the spawn to the nearest cave entrance and down
  to iron: does it lead there? _PC._
- **PLACE-4** (8B2b) Rim arrow of a shaft far away (up to 192 blocks): clear where to go?
  _PC._

## 10. Implementation steps

Commit after every step at the latest (rule 4), run `npm run check`, `npm run build` and
the specs the step touches.

**B2a**

1. **Phases of version 2:** factor `TerrainV2.generateChunk` into phases; checksums and
   speed tests unchanged (AC1.1 part).
2. **Plumbing:** generator 3 dispatch (carving still empty), `WorldGen`, labels, save and
   welcome decoding, `gen=` URL parameter, `GENERATOR_VERSION` 3; save tests (AC1.6).
3. **Tunnels and chambers** with the carve mask and cache, the water and bedrock rules,
   trees and spawn rules; unit tests (AC1.2, AC1.3, AC1.5 part).
4. **Ravines** (AC1.3).
5. **Mine shafts** incl. the spawn shaft (AC1.5).
6. **Radar ore host** and the agreement test on generator 3 (AC1.4, AC3.4).
7. **Budgets:** the cost tests (AC2.1–AC2.4); tune the density; then pin the checksums
   (AC1.1). Nothing that changes generator 3 output may follow this step without
   re-pinning; after the merge, never.
8. **Walk check and the bot** on generator 3; `scripts/progressRun.ts` (AC3.1–AC3.3,
   AC3.5).
9. **Bench** scenario `caves` (AC2.5).
10. **Browser:** specs, room spec, references (AC4.1–AC4.4).
11. **Docs and report:** `src/world/generation/CLAUDE.md`, nested files, root `CLAUDE.md`,
    `docs/testing.md`, device tests CAVE-1 to CAVE-6, `docs/phase-8b2a-report.md` with
    "For the Pi side"; the pull request (AC4.5, AC4.6).

**B2b**

1. **Provider:** `placesIn` on generator 3 (no output change: checksums unchanged),
   `PlaceIndex`, the places agreement (AC5.1).
2. **Scan:** place kinds, merging, focus rule, far radius; unit tests, cost (AC5.2, AC5.4).
3. **Screens:** circle and Map tab symbols, legend, `getState()`; specs, references
   (AC6.1–AC6.4).
4. **Bot and docs:** the slow test and the script (AC5.3); `src/radar/CLAUDE.md`, status
   row, device tests PLACE-1 to PLACE-4, `docs/phase-8b2b-report.md`; the pull request
   (AC6.5).

## 11. For the owner and for the Pi side

- **The owner** plays each part on its PR preview the Pi serves; the device tests are run
  at the end of Phase 8. Generator 3 is frozen once B2a is merged: if CAVE-1 or CAVE-3
  later shows a problem, the fix is a generator 4 (new worlds only).
- **The Pi side:** no new build variables, packages, signaling requests or lazy chunks; the
  room protocol does not change. A guest on an older build refuses a generator 3 room
  ("newer"), so host and guest must use the same build (the Pi's PR preview, or its main
  build after the merge). Each report repeats this under "For the Pi side".

## 12. Documentation

- **B2a:** a new `src/world/generation/CLAUDE.md` (at most 8 000 bytes) takes the section
  "Generator version" of `src/world/CLAUDE.md` (versions 1–3, checksums, spawn, the radar's
  `oreHost`, measuring) and adds generator 3 (phases, carve mask, tunnels, ravines, shafts,
  rules, density, the face budget); `src/world/CLAUDE.md` keeps a two-line pointer, so it
  shrinks below the warning. `src/bot/CLAUDE.md`: the walk check, generator 3 runs.
  `src/bench/CLAUDE.md`: `caves`. `docs/testing.md`: `gen=`, the test helpers.
- **B2b:** `src/radar/CLAUDE.md`: the places provider, place kinds, the focus rule.
- **Root `CLAUDE.md`:** "Generator version" invariant "now 3"; one line
  `src/world/generation/CLAUDE.md` in "Where the rules are" (B2a); one status row per part;
  the "Open" paragraph. Each part may grow it by at most about 400 bytes; details go to the
  nested files and the reports, never a raised limit.

## 13. Risks and fallbacks

| Risk                                                                       | Fallback                                                                                                                                                                     |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The face budget leaves caves too sparse to matter                          | Prefer fewer, longer entrance tunnels over deep tunnels (entrances are what players use); report the carved share and entrances per area; the owner decides at CAVE-2/CAVE-5 |
| The phone is too slow with generator 3 (CAVE-1, end of Phase 8)            | A generator 4 with a lower density, or a renderer depth culling as a part of its own; never a change to generator 3 after the merge                                          |
| The carve test makes generation or the radar's cold scan too slow          | The carve mask per chunk with a larger cache; evaluate only regions whose bounding box touches the chunk; lower `CAVE_REACH`                                                 |
| Spawn or spawn shaft search is slow on the first chunk                     | Cache both per terrain; search shaft sites on a coarse ring first; report the time                                                                                           |
| The bot gets stuck in tunnels or ravines                                   | Fix the bot (pillar out, avoid falling targets); never weaken the terrain rules for it                                                                                       |
| A tunnel or ravine breaks the light invariant or meshes wrongly at borders | The border agreement and `verifyLight` tests find it; the reference decides, as always                                                                                       |
| The legend with four rows does not fit 640 × 360 (B2b)                     | Two columns or a smaller row height; place rows only in generator 3 worlds                                                                                                   |
| A part runs over its size                                                  | B2a in step order; nothing is dropped without the owner (a criterion that truly cannot be met is a known issue in the report)                                                |
