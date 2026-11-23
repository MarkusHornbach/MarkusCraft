# Phase 7 part A report – World options and passable leaves

Plan: `docs/phase-7a-plan.md`. One session, one branch, one pull request. Tests name their
criterion as "Phase 7 AC…".

## What was built

- **World options** (`src/world/generation/worldOptions.ts`): `TerrainShape` (`flat`,
  `balanced`, `hilly`), `TreeDensity` (`none`, `few`, `normal`, `many`), `WorldOptions`,
  `WorldGen` (`{ version: 1 }` or `{ version: 2, options }`), the labels, validation
  (`decodeWorldOptions`: malformed is damaged, unknown strings are newer) and the descriptions
  of the world list and the F3 overlay. The strings are pinned by `worldOptions.test.ts`.
- **Generator 2** (`src/world/generation/terrainV2.ts`, `TerrainV2`): the three height curves
  (`SHAPE_CURVES`; `hilly` is version 1's curve exactly), forests and meadows from a forest
  noise and the level table `TREE_LEVELS`, everything after the heights as in version 1.
  `generateChunk`, `terrainChecksum` and `getTerrain` take a `WorldGen` and dispatch;
  `Terrain` (version 1) is untouched. Its shared constants moved to `terrainRules.ts` in a
  commit of their own (no change in output).
- **Spawn with wood** (`spawn.ts`): with trees, a generator 2 spawn also needs 8 trunks
  within 40 columns, searched over a summed-area table of trunks in three stages (16, 64,
  256 rings), then the plain rule. Version 1 worlds keep their spawn exactly.
- **Save format 3**: `WorldMeta.options` (stored only for generator 2); formats 1 and 2 load
  as generator 1 and are written back as 3.
- **Rooms**: `welcome.options`, the guest's checksum and world use the host's generator.
- **"New world" form**: the rows "Terrain" and "Trees", the `None` rule with its hint; the
  world list shows mode, shape and trees ("Classic" for generator 1); the F3 overlay a row
  "World"; URL parameters `terrain` and `trees`; `getState().world.options`.
- **"Collide with leaves"** (default off): a switch on the settings page; physics steps on a
  `MovementWorld` that reads `BLOCK_SOLID_PASSABLE_LEAVES` while it is off.
- **Tools**: `scripts/terrainStats.ts` measures every preset over the plan's seeds through
  `src/testing/terrainMeasure.ts` (also used by `terrainV2Stats.slow.test.ts`).

## Measured numbers

`npx vite-node scripts/terrainStats.ts`, eight seeds (1, 1337, 987654321, 42, 7, 2024, 99,
31337), 320 × 320 columns each. Plains, beach, high land and rock are shares of the land
columns; water of all columns; trees per 1000 grass columns; open is the share of grass
columns without a trunk within 6; coal and iron are shares of the stone in their ranges,
clay of the underwater columns. "Min" is the lowest plains share of a single seed.

| Preset          | Plains | Water | Beach | High | Rock | Trees/1000 | Open | Coal | Iron | Clay | Min plains |
| --------------- | -----: | ----: | ----: | ---: | ---: | ---------: | ---: | ---: | ---: | ---: | ---------: |
| version 1       |   55.8 |  34.1 |  16.6 |  9.0 |  2.6 |       18.2 |  3.0 | 1.18 | 0.58 |  8.5 |       40.1 |
| flat/none       |   95.2 |  35.5 |  17.0 |  0.0 |  0.0 |        0.0 |  100 |      |      |      |       91.9 |
| flat/few        |   95.2 |  35.5 |  17.0 |  0.0 |  0.0 |        8.3 | 63.3 |      |      |      |       91.9 |
| flat/normal     |   95.2 |  35.5 |  17.0 |  0.0 |  0.0 |       15.6 | 38.9 | 1.18 | 0.58 |  8.5 |       91.9 |
| flat/many       |   95.2 |  35.5 |  17.0 |  0.0 |  0.0 |       36.6 |  0.0 |      |      |      |       91.9 |
| balanced/none   |   80.6 |  35.0 |  16.8 |  2.2 |  0.3 |        0.0 |  100 |      |      |      |       66.6 |
| balanced/few    |   80.6 |  35.0 |  16.8 |  2.2 |  0.3 |        8.3 | 63.2 |      |      |      |       66.6 |
| balanced/normal |   80.6 |  35.0 |  16.8 |  2.2 |  0.3 |       15.6 | 38.8 | 1.18 | 0.58 |  8.5 |       66.6 |
| balanced/many   |   80.6 |  35.0 |  16.8 |  2.2 |  0.3 |       36.6 |  0.0 |      |      |      |       66.6 |
| hilly/none      |   55.8 |  34.1 |  16.6 |  9.0 |  2.6 |        0.0 |  100 |      |      |      |       40.1 |
| hilly/few       |   55.8 |  34.1 |  16.6 |  9.0 |  2.6 |        8.4 | 63.3 |      |      |      |       40.1 |
| hilly/normal    |   55.8 |  34.1 |  16.6 |  9.0 |  2.6 |       15.7 | 38.8 | 1.18 | 0.58 |  8.5 |       40.1 |
| hilly/many      |   55.8 |  34.1 |  16.6 |  9.0 |  2.6 |       36.7 |  0.1 |      |      |      |       40.1 |

Ores and clay are counted for the `normal` presets (the trees do not change them). Shapes
only move the land above sea level, so the water columns, their clay and the ore shares
stay as in version 1.

Acceptance ranges: plains flat ≥ 85 % (each seed ≥ 75), balanced 68–88 % (each ≥ 55),
hilly as version 1; water within 6 points of version 1; high land flat ≤ 1 %, balanced
≤ 6 %; trees few 4–10, normal 12–22, many 28–45; open few ≥ 50 %, normal ≥ 20 %. All hold.
The shape curves are the plan's starting points unchanged: they met group 2 at the first
measurement. The tree levels were tuned in four rounds (see "Decisions").

Spawn (AC3.3): 180 searches (seeds 1–20, three shapes, three levels): every spawn is grass
with no trunk within 4 and at least 8 trunks within 40; the slowest search took 11 ms
(limit 200), the farthest spawn lay 29 rings out, the median 4. The fallback to the plain
rule was never needed.

Generation speed (AC4.3, `terrainV2Speed.solo.test.ts`, best of 120 rounds of 49 fresh
chunks, both warmed up): version 1 0.262 ms per chunk, generator 2 `balanced`/`normal` 0.277 ms (+5.9 %, limit +15 %); the Phase 1 terrain 0.241 ms (`scripts/terrainStats.ts`, cloud container, Node 22). The solo test passes.

## Decisions and deviations

| Topic                             | Decision                                                                                                                                                                                                                                                                                                           | Why                                                                                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `terrainV1.test.ts`               | Only its test of the generator-version API changed: `terrainChecksum(1337, { version: 1 })` instead of `GENERATOR_VERSION`, `{ version: 0 }` / `{ version: 3 }` as the unknown versions, and the line `expect(GENERATOR_VERSION).toBe(1)` removed. Every check of version 1's output is unchanged and passes       | The plan makes `generateChunk` take a `WorldGen` and `GENERATOR_VERSION` 2; the old lines pinned exactly those two things. The checksum and all terrain checks are untouched                |
| Shared code                       | Version 1's constants moved to `terrainRules.ts`; `TerrainV2` is its own class (a copy of `Terrain`'s structure with the height curve and the tree rule changed), not a subclass                                                                                                                                   | `Terrain` stays byte for byte as it was apart from its imports; a subclass would have needed its private members                                                                            |
| Shape curves                      | The plan's starting points, unchanged (`balanced`: slope 20 above c = 0, amplitude 3 + 28 · smoothstep(0.3, 0.9, c); `flat`: slope 10, amplitude 2 + 4 · smoothstep(0.3, 1, c))                                                                                                                                    | Group 2 held at the first measurement                                                                                                                                                       |
| Forest noise                      | `fbm2D` of a new noise table (`deriveSeed` index 4), scale 1/160, two octaves; a new hash salt for the candidates                                                                                                                                                                                                  | Two octaves give ragged forest edges; one octave gave round blobs                                                                                                                           |
| Tree levels                       | `few`: meadow 0.0006, forest 0.08, lo 0.24, hi 0.44; `normal`: 0.002, 0.10, 0.00, 0.22; `many`: 0.06, 0.14, -0.40, -0.10. A higher meadow chance put single trees into every meadow: one trunk takes 169 columns out of "open"                                                                                     | Tuned with `scripts/terrainStats.ts` until AC3.1 and AC3.2 held with margin for every shape                                                                                                 |
| Forest noise per column           | Computed lazily into a scratch `Float32Array` over the chunk and its rim (`-1` = not yet), only for columns whose hash is below the level's highest chance                                                                                                                                                         | Evaluated at most once per column and never per neighbour check (plan 5.3); the coarse grid of the plan's fallback was not needed                                                           |
| `none` and the spawn              | `none` (and version 1) use the plain spawn rule                                                                                                                                                                                                                                                                    | Plan 5.4                                                                                                                                                                                    |
| Format 2 records with generator 2 | Damaged (no build ever wrote one)                                                                                                                                                                                                                                                                                  | The plan names the cases of format 3 only                                                                                                                                                   |
| Options decoder                   | Strings longer than 32 characters are damaged, not newer                                                                                                                                                                                                                                                           | A later build will not use such names; it keeps "newer" for plausible values                                                                                                                |
| `welcome` with bad options        | The decoder refuses the message (as any malformed field); options that are valid but do not give the checksum fail the join with `terrain`                                                                                                                                                                         | Builds that differ never meet (`hello`), so only a forged welcome can carry them                                                                                                            |
| Test world                        | `?test=1` without `terrain` and `trees` stays generator 1; `__mc.openWorld` and the test world after leaving a room use the same rule; worlds of the form are generator 2 in tests too                                                                                                                             | Plan, change 7                                                                                                                                                                              |
| Trees hint                        | Shown whenever Gathering is chosen (then `None` is disabled), not only after an automatic switch                                                                                                                                                                                                                   | Explains the greyed button at any time; the form is regenerated anyway                                                                                                                      |
| Short tree labels                 | The form's buttons say "None", "Few", "Normal", "Many"; the list says "No trees", "Few trees", …                                                                                                                                                                                                                   | The plan names both                                                                                                                                                                         |
| F3 row label                      | "World" (value "Generator 2 · balanced · few")                                                                                                                                                                                                                                                                     | The value already starts with "Generator"                                                                                                                                                   |
| Menu scroll                       | The world menu scrolls back to the top when it is shown again and when its view changes                                                                                                                                                                                                                            | The taller form scrolls on a phone; the list kept that offset (found by AC4.9)                                                                                                              |
| AC4.9 (Phase 3)                   | On the phone the form no longer has to fit without scrolling; the test checks sizes and overlaps of the form's controls, scrolls to "Create and play", checks that nothing covers it, and that the Trees row fits the width (AC6.3). The tablet keeps the old check                                                | Plan 5.8: the form scrolls                                                                                                                                                                  |
| Pad path (Phase 5 AC3.1)          | The pad test walks up past the two new rows to the Mode row                                                                                                                                                                                                                                                        | The rows lie between "Create and play" and the Mode row                                                                                                                                     |
| Pad and `None`                    | With `None` disabled, left from "Few" leaves the row (the focus rule picks the nearest element, here "Create and play"); the test checks that `None` is never focused                                                                                                                                              | The focus rule is generic and is not changed per screen (`src/input/CLAUDE.md`)                                                                                                             |
| Leaf collision object             | `MovementWorld` in `src/player/physics.ts`, made once per world by `Game`, reading `World.isSolidIn(table, …)`; `BLOCK_SOLID_PASSABLE_LEAVES` in `blocks.ts`                                                                                                                                                       | Plan 5.9's example                                                                                                                                                                          |
| AC7.5                             | There was no allocation test to copy. The test checks that every solidity call uses one of the two module tables (nothing built per step)                                                                                                                                                                          | A heap measurement in Node is not reliable enough for a test                                                                                                                                |
| `setCollideLeaves`                | A new test-API call; test mode has no settings page                                                                                                                                                                                                                                                                | AC7.1 and AC7.4 in the browser                                                                                                                                                              |
| Settings storage                  | `collideLeaves` is written only when on, like the other later settings                                                                                                                                                                                                                                             | Stored settings of players who never touch it stay as they were                                                                                                                             |
| References                        | New: `gen2-balanced-few`, `gen2-flat-many`, `gen2-hilly-normal` (seed 1337, noon, from (0.5, 88, 0.5) looking south-east, 40° down). Regenerated: `world-menu`, `pad-world-menu` (list rows); `pause-screen`, `pad-pause`, `player-section` (the new switch row on the settings page). All others unchanged        | Plan section 7                                                                                                                                                                              |
| AC1.3 and the menu references     | No reference of the world (terrain, light, figures) changed and every older spec of the world passes as it was. Five references of menus changed: `world-menu` and `pad-world-menu` (as planned) and `pause-screen`, `pad-pause`, `player-section`, which show the settings page with its new row                  | Plan 5.9 puts the switch on the settings page; those three pictures cannot stay the same. They still passed within their tolerance; regenerated as `e2e/CLAUDE.md` asks after a menu change |
| Older specs adapted               | `inventory.spec.ts` and `worldMenu.spec.ts` AC4.1 read the new list text and options; `light.spec.ts` Phase 4 AC5.2 expects `options: null` and format 3; `save.spec.ts` Phase 6 AC8.5 runs for a format 1 and a format 2 world and expects format 3; `gamepadMenus.spec.ts` Phase 5 AC3.1 walks past the new rows | The changes the plan makes (format 3, list rows, `getState().world.options`, the form)                                                                                                      |
| Phone pause menu                  | In touch mode below 480 px the settings rows are 1 px apart (was 2) and switch rows 24 px high                                                                                                                                                                                                                     | The new row made the pause menu 5 px taller than a 640 × 360 phone (Phase 2 AC3.1)                                                                                                          |
| Hard rule 1                       | Checked: the new labels are plain words, no images other than the five regenerated and three new test references                                                                                                                                                                                                   | Definition of Done 9                                                                                                                                                                        |
| Hygiene count                     | `repoHygiene.test.ts` allows digits in reference names and counts 42 images                                                                                                                                                                                                                                        | The commit of step 6 missed this because the files were untracked when the check ran; fixed in the next commit                                                                              |
| Browser spec of AC5.3             | Added with step 6                                                                                                                                                                                                                                                                                                  | It needs the URL parameters of step 6                                                                                                                                                       |

## Known issues

- On the phone the "New world" form now scrolls (as planned): the Terrain and Trees rows
  push "Create and play" below the fold at 640 × 360.
- Left on the controller from "Few" in Gathering leaves the Trees row (see "Decisions").
- A player inside leaves sees the leaf faces around the camera (no effect yet; LEAF-2).

## Tests on real devices

Added to `docs/device-tests.md`, section "World options (Phase 7 part A)": GEN-1, GEN-2,
GEN-3, GEN-4, LEAF-1, LEAF-2. The intro now says that compared worlds use seed 1337 with the
form's defaults and describes the new start point. No open test was ticked, none became
pointless.

## For the Pi side

Nothing new to configure: the same build variables, no new packages, no new requests on the
signaling server. The room protocol changed (`welcome` has `options`), so devices must run
the same build, which the build id ensures. GEN-4 needs the PR preview of this pull request,
so the preview service must be running (not paused) while the pull request is open.

## Suggestions for the next phase

- If LEAF-2 asks for it: a tint or darkening of the view inside leaves.
- The world list row is getting long; a second line for mode and options would read better
  on phones.
- The rest of Phase 7 (custom blocks, textures, characters, names, effects) is unplanned.
