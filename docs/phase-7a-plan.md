# Phase 7 part A plan – World options and passable leaves

Read `CLAUDE.md`, `src/world/CLAUDE.md`, `src/save/CLAUDE.md`, `src/net/CLAUDE.md`,
`src/ui/CLAUDE.md`, `src/input/CLAUDE.md` (focus, controller) and `e2e/CLAUDE.md` first,
and the "Decisions and deviations" of `docs/phase-3a-report.md` (generation, saves, the
world menu), `docs/phase-6b-report.md` (protocol) and `docs/phase-6c-report.md` (save
format 2). Phase 7 is "personalization"; this is its part A. The rest of Phase 7 (custom
blocks, textures, characters beyond the eight looks, names, effects) is not planned.

This part is implemented autonomously in one cloud session, on one branch, with one pull
request: do not ask the owner questions. Where this plan leaves a detail open, choose the
simplest option consistent with it and note it in `docs/phase-7a-report.md`, section
"Decisions and deviations". Tests name their acceptance criterion in the title as
"Phase 7 AC1.1".

## 1. Goal

A player who creates a world chooses how hilly it is and how many trees it has. New
worlds default to fewer trees and more plains than today. Trees grow in forests and
groves with open meadows between them, and a Gathering player still finds wood near the
start. Worlds that exist today stay exactly as they are, in single-player and in rooms.

Separately, a device setting "Collide with leaves" (default off) lets the player walk
through tree canopies. It changes movement only.

## 2. Decisions made with the owner

| Topic            | Decision                                                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Naming           | Phase 7 is personalization; world options are its part A ("7A"). Files `docs/phase-7a-plan.md`, `docs/phase-7a-report.md`                                                              |
| Parts            | One part: generator, save format, protocol, UI and the leaf setting in one session and one pull request                                                                                |
| Generator        | A new generator version 2 takes the world options as parameters. Version 1 (code, output, checksum) stays untouched                                                                    |
| Terrain shapes   | `flat` / `balanced` / `hilly`. Hilly uses today's height curve exactly. Balanced (default) has more plains and lower hills. Flat is gentle lowland with small hills only, no mountains |
| Water            | Every shape keeps today's water share (about 30–36 % of the area). Flattening must not dry the world out or flood it                                                                   |
| Tree levels      | `none` / `few` / `normal` / `many`; default `few`                                                                                                                                      |
| Tree spread      | Patches: low-frequency noise makes forests and open meadows. The level sets how much is forest and how dense                                                                           |
| Wood near spawn  | With trees (not `none`), the spawn search prefers a tree-free grass spot with enough trees near it                                                                                     |
| `none` and modes | `none` can be chosen only for Creative. Switching the form to Gathering turns `none` into `few`, and the hint line says why                                                            |
| Form layout      | Two always-visible rows of choice buttons, built like the Mode row: "Terrain" and "Trees". The form scrolls on small screens                                                           |
| Extras           | The world list shows shape and trees; the F3 overlay has a generator row; URL parameters `terrain` and `trees` in test mode; `scripts/terrainStats.ts` measures each preset            |
| Leaf physics     | With the setting off, leaves do not collide at all (walk and fall through). Visible, targetable, breakable as before                                                                   |
| Test world       | The automatic world of `?test=1` stays generator 1 unless `terrain` or `trees` is in the URL. Worlds created in the form use version 2, in tests too                                   |

## 3. Changes to the original scope

The owner's starting scope was challenged during planning. Agreed changes:

| #   | Change                                                                                                                                                  | Reason                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Named Phase 7 part A, not a separate Phase 7                                                                                                            | `CLAUDE.md` reserved "Phase 7" for personalization. Choosing how one's world looks is personalization, so it becomes its first part                                                                                 |
| 2   | `none` trees only in Creative                                                                                                                           | In Gathering every tool starts with a log (planks → workbench → wooden pickaxe). A treeless Gathering world could never be progressed                                                                               |
| 3   | Forest patches are required, not optional, plus a "wood near spawn" rule for the spawn search                                                           | With `few` as the default, an even scatter would leave single trees everywhere and no forests. With patches but no spawn rule, a Gathering player could spawn in a meadow far from any wood                         |
| 4   | Hilly is today's height curve; balanced and flat keep today's base curve                                                                                | Keeps the familiar look available. Prototypes showed that flattening by squeezing the whole curve moves the water share from 34 % down to 7 %. Water is out of scope, so only the land above sea level is flattened |
| 5   | The multiplayer change is one field in `welcome` plus the checksum call, no compatibility work                                                          | `hello` already rejects a guest whose build differs (`build`), and `welcome` already carries the generator version and a terrain checksum that the guest verifies                                                   |
| 6   | Added: shape and trees in the world list, a generator row in the F3 overlay, URL parameters `terrain` and `trees`, presets in `scripts/terrainStats.ts` | Players should see what a world was made with. Bug reports from devices and rooms need it. Specs and screenshots need to start a preset world directly. Tuning needs one tool that later sessions can re-run        |
| 7   | The automatic test world (`?test=1`) stays generator 1 by default                                                                                       | About 40 specs, `e2e/sites.ts` and about 15 reference screenshots depend on the generator 1 terrain of seed 1337. They stay valid; version 2 gets its own specs and references                                      |
| 8   | One part instead of a separate part for the leaf setting                                                                                                | The leaf setting is small and touches nothing the generator touches. One status row instead of two (the root `CLAUDE.md` is near its size warning)                                                                  |

## 4. Out of scope (do not build)

- Water amount, sea level, rivers, new biomes, caves, new blocks, new tree shapes.
- Any change to generator version 1: `Terrain` in `world/generation/terrain.ts`, and
  `trees.ts`, `ores.ts`, `spawn.ts` as version 1 uses them. Every output and the
  checksum `TERRAIN_CHECKSUM_1337_V1` stay the same.
- Changing a world's options after it was created. Converting old worlds to version 2.
- Sliders or free numbers for generation (only the presets of section 5.1).
- A terrain preview in the form.
- A leaf setting per world or per room, a host rule about it, leaf collision for
  placing blocks (section 5.9), a "slow down in leaves" effect, a visual effect for the
  camera inside leaves.
- Moving the performance test to version 2 (`BENCH_GENERATOR_VERSION` stays 1, so
  `perf-run` results stay comparable).
- Phase 4 part C (Web Workers) and the rest of Phase 7.

## 5. Specification

### 5.1 World options (pure, `src/world/generation/worldOptions.ts`)

```ts
type TerrainShape = 'flat' | 'balanced' | 'hilly';
type TreeDensity = 'none' | 'few' | 'normal' | 'many';
interface WorldOptions {
  terrain: TerrainShape;
  trees: TreeDensity;
}
type WorldGen = { version: 1 } | { version: 2; options: WorldOptions };
```

- `DEFAULT_WORLD_OPTIONS = { terrain: 'balanced', trees: 'few' }`; `GENERATOR_VERSION`
  (in `game/config.ts`) becomes 2 and means "the version new worlds get".
- The strings are written into saves and messages. Like ids they are append-only and are
  never renamed; `worldOptions.test.ts` pins them. A validator turns unknown values into
  "unknown" (for `newer`, section 5.6), never into a default.
- Display labels (`Flat`, `Balanced`, `Hilly`; `No trees`, `Few trees`, `Normal trees`,
  `Many trees`; `Classic` for version 1) live in one table next to the types.

### 5.2 Generator version 2 heights

- `generateChunk(seed, cx, cz, gen: WorldGen)` and `terrainChecksum(seed, gen)` dispatch
  on `gen.version`. Version 1 calls today's `Terrain` unchanged. Version 2 lives in a new
  module (`terrainV2.ts`, class `TerrainV2`). It may import pure helpers of version 1
  (`placeOres`, `markClayColumns`, `hasLeaf`, `trunkHeight`, the noise, the rock rule's
  constants) but must not change them. If code is shared by extracting it from `Terrain`,
  the version 1 checksum test and `terrainV1.test.ts` must pass unchanged after the
  extraction, in its own commit.
- `getTerrain` caches per (seed, gen). The noise tables of version 2 come from the same
  `deriveSeed(seed, 1..3)` as version 1, plus new indices for new noise. So `hilly`
  returns exactly the heights of version 1 for every column.
- Height of a column: `round(base(c) + amplitude(c) * (d * 0.6 + |d| * 0.4))`, clamped to
  `MIN_SURFACE..MAX_SURFACE`, where `c` (continent) and `d` (detail) are today's noise
  values. Per shape:
  - `hilly`: today's `base = SEA_LEVEL + 3 + 26c`, `amplitude = 5 + 40 · smoothstep(0.05,
0.75, c)`.
  - `balanced`: below sea level today's base. Above it a lower slope and later, lower
    hills. Starting point from planning: `base = SEA_LEVEL + 3 + (c > 0 ? 20c : 26c)`,
    `amplitude = 3 + 28 · smoothstep(0.3, 0.9, c)` (measured: 80 % plains, 35 % water).
  - `flat`: starting point `base = SEA_LEVEL + 3 + (c > 0 ? 10c : 26c)`, `amplitude = 2 +
4 · smoothstep(0.3, 1, c)` (measured: 95 % plains, 36 % water).
    The implementation tunes the numbers until section 6, group 2, holds over the measured
    seeds. The curve shapes may change, the base below sea level may not (water share).
- Everything after the heights works as in version 1: rock line and slope rule, beaches,
  dirt depth, water, clay, ores. The shapes only move the heights, so these follow.

### 5.3 Generator version 2 trees

- A new low-frequency "forest" noise (own `deriveSeed` index, scale about 1/160) gives a
  forest weight `w = smoothstep(lo, hi, f)` per column. The candidate chance of a column is
  `meadow + (forest - meadow) · w`. `lo`, `hi`, `meadow` and `forest` come from the level's
  row in a preset table. `none` has no candidates at all.
- The spacing rule of version 1 stays (minimum spacing 3, the highest hash wins among
  candidates closer than that). It is decided per column, so it stays independent of
  generation order. Tree shape (trunk 4–6, canopy) as in version 1.
- Trees still need grass (above the beach band, not rock).
- Starting points from planning (all columns, 8 seeds): `few` about 7 trees per 1000
  columns with 59 % open land, `normal` 15 with 27 %, `many` 25 with 2 %. Version 1 has
  about 18.5 per 1000 grass columns, evenly spread (4 % open).
- Hot path: the forest noise is evaluated once per column of the chunk and its rim into a
  scratch typed array, never per neighbour check.

### 5.4 Spawn

- `findSpawn` keeps its version 1 behaviour exactly for version 1 worlds (spawn points of
  existing worlds and of `?test=1` do not move).
- For version 2 a spot is suitable if it is suitable by today's rule (grass, no trunk
  within `SPAWN_TREE_CLEARANCE`) and, unless trees are `none`, at least
  `SPAWN_MIN_TREES` (8) trunks lie within `SPAWN_WOOD_RADIUS` (40, Chebyshev) of it. The
  spiral looks for such a spot up to `SPAWN_WOOD_RINGS` rings (constant in
  `game/config.ts`, about 256), then falls back to today's rule.
- `Game.newWorldMeta` and `Game.loadWorld` call `findSpawn` with the world's generator,
  not `getTerrain(seed)` of version 1.

### 5.5 What does not change

Version 1 output, the light rules and `LIGHT_CHECKSUM_1337_V1`, the mesher, block and item
tables, recipes, the action layer, the bench (`BENCH_GENERATOR_VERSION` 1), the room
protocol apart from section 5.7, the device settings apart from section 5.9.

### 5.6 Save format 3

- `SAVE_FORMAT_VERSION` 3. `WorldMeta` gets `options: WorldOptions | null`: an object for
  generator 2, `null` for generator 1. The record stores `options` only for generator 2.
- Decoding: version 1 and 2 records load with `options: null` (they are all generator 1)
  and are written back as version 3. A generator 2 record without valid `options` is
  damaged. A generator 2 record with an unknown string is `newer` (written by a later
  build). A generator 1 record with `options` is damaged.
  Decoding never throws.
- The migration is covered by tests from stored version 1 and version 2 records
  (`saveFormat.test.ts`, `e2e/save.spec.ts`).
- `World` gets the world's `WorldGen`. `World`, `FarReader`, `lightScenes.ts`,
  `netRig.ts` and every other `generateChunk` caller pass it on. The test helpers'
  default is `{ version: 1 }`.

### 5.7 Multiplayer

- `welcome` gets `options` (the same validation as the save, `null` for generator 1).
  The guest's `checksum(seed, gen)` call and `Game.openGuestWorld` use it. A guest never
  sees a world other than the host's. A mismatch is the existing join error `terrain`.
- No other message changes. Builds that differ are rejected by `hello` as today, so there
  is no compatibility case.

### 5.8 The "New world" form, the world list, the F3 overlay, URL parameters

- Below the Mode row (and its hint), in this order: "Terrain: Flat | Balanced | Hilly"
  and "Trees: None | Few | Normal | Many". They are radio groups like the Mode row
  (`role="radio"`, `aria-checked`, reachable by mouse, touch and the controller's focus
  in `FocusManager`, pad hints unchanged). `showForm` preselects the defaults.
- `None` is disabled (greyed, not focusable) while the mode is Gathering. Switching to
  Gathering while `None` is chosen selects `Few`, and the hint line under Trees says
  "No trees only in Creative: Gathering needs wood." while that is so.
- `onCreate` passes the chosen options; a created world is generator 2 with them.
- The form scrolls when it does not fit. On the phone landscape viewport of the touch
  specs, "Create and play" can be reached by scrolling and is not covered.
- World list row: mode, shape and trees ("Gathering · Balanced · Few trees"); generator 1
  worlds show "Classic".
- F3 overlay: one row "Generator 2 · balanced · few" or "Generator 1".
- `?test=1&terrain=…&trees=…`: the automatic test world uses generator 2 with these
  options; a missing one takes its default; an invalid value is ignored, as other URL
  parameters are. Without both parameters the test world is generator 1.
- Test API: `getState().world` gains `options` (`null` for generator 1).
  `terrainChecksum()` uses the open world's `WorldGen`.

### 5.9 "Collide with leaves"

- `Settings.collideLeaves: boolean`, default `false`, validated like `padInvertY`. It is a
  switch row "Collide with leaves" on the settings page (the same page from the world menu
  and the pause menu), below "Invert controller look". It takes effect at once.
- Physics: `World.isSolidAt` keeps its meaning (the block table's `solid`). Game hands
  physics a `PhysicsWorld` whose `isSolidAt` treats `Block.LEAVES` as passable while the
  setting is off. That object is made once per world, with no allocation per step (for
  example a second solid table in `blocks.ts` chosen by the flag).
- Nothing else changes: leaves stay `solid` in the block table, so they stay a support
  (torches on leaves), the place rule still refuses a leaf in a cell the player stands
  in, light, mesher, raycast and the save are unchanged. A player inside leaves who turns
  the setting on is not pushed out and can walk out (physics only tests cells it newly
  enters). The leaf cell the eye is in cannot be targeted (the raycast never hits the
  origin cell). Accepted, the player steps out to break it.
- Multiplayer: the host checks no movement except `validPose`, so each player's own
  setting applies to their own movement. No protocol change.
- `getState()` reports `collideLeaves`.

## 6. Acceptance criteria

Measured over the seeds 1, 1337, 987654321, 42, 7, 2024, 99, 31337 (an area of 320 × 320
columns around the origin) unless a criterion says otherwise. "Plains" = a land column
whose 9 × 9 neighbourhood spans at most 3 blocks of height. "Open" = a grass column with
no trunk within 6 columns.

**Group 1: version 1 stays.**

- AC1.1 `terrainChecksum(1337, { version: 1 })` equals `TERRAIN_CHECKSUM_1337_V1` in
  Node and in the browser; `terrainV1.test.ts` and `LIGHT_CHECKSUM_1337_V1` pass unchanged.
- AC1.2 A stored format 2 world (and a format 1 world) opens with its old terrain, spawn,
  edits and inventory, shows "Classic", and is written back as format 3 with
  `options: null`.
- AC1.3 `?test=1&seed=1337` without `terrain`/`trees` is generator 1. Every existing
  spec and reference screenshot passes without being regenerated.

**Group 2: shapes.**

- AC2.1 `hilly`: `heightAt` equals version 1's for every column of the measured area.
- AC2.2 Plains share of land: `flat` ≥ 85 %, `balanced` 68–88 %, `hilly` as measured for
  version 1 (about 56 %). Each seed alone: `balanced` ≥ 55 %, `flat` ≥ 75 %.
- AC2.3 Water share of the area for each shape within 6 percentage points of version 1's.
- AC2.4 Land above `SEA_LEVEL + 20`: `flat` ≤ 1 %, `balanced` ≤ 6 %.
- AC2.5 Ores and clay: coal and iron replace about 1.2 % and 0.6 % of the stone in their
  ranges and clay covers about 8 % of the underwater columns, within the tolerances of
  today's version 1 tests, for every shape.

**Group 3: trees.**

- AC3.1 Trees per 1000 grass columns: `none` 0, `few` 4–10, `normal` 12–22, `many`
  28–45.
- AC3.2 Open share of grass columns: `few` ≥ 50 %, `normal` ≥ 20 %.
- AC3.3 For 20 seeds (1–20) and each of `few`, `normal`, `many` × each shape: the spawn
  is grass, has no trunk within `SPAWN_TREE_CLEARANCE`, and has at least 8 trunks within
  40 columns. A search takes under 200 ms in Node (`expectFasterThan`).

**Group 4: determinism and speed.**

- AC4.1 Recorded checksums `terrainChecksum(1337, { version: 2, options })` for all 12
  combinations, in `src/testing/terrainChecksum.ts`, checked in Node; the browser checks
  the default (`balanced`/`few`) and `flat`/`many`.
- AC4.2 Generating a chunk is independent of order: a chunk generated alone equals the
  same chunk generated after its neighbours (any order), for every combination; a tree's
  canopy across a chunk border is complete on both sides.
- AC4.3 Generator 2 `balanced`/`normal` is at most 15 % slower per chunk than version 1
  (solo test, best of many rounds, both warmed up).

**Group 5: saving and rooms.**

- AC5.1 A world created in the form with `flat`/`many` reloads with the same options,
  terrain checksum and spawn. Its world list row shows "Flat · Many trees".
- AC5.2 Decoding: a generator 2 record without options is damaged, with an unknown string
  it is "Saved by a newer version", a generator 1 record with options is damaged; nothing
  throws (unit tests with fuzzed fields).
- AC5.3 A guest joining a host's generator 2 world (`hilly`/`none`) gets the same options
  and checksum and sees the same blocks (mp spec); a forged `welcome` with other options
  fails the join with `terrain` (unit test).

**Group 6: the form.**

- AC6.1 The Terrain and Trees rows work with the mouse, touch and the controller (focus
  moves into both rows, A selects, the selection shows); the defaults are Balanced and
  Few.
- AC6.2 `None` is disabled in Gathering; with `None` chosen in Creative, switching to
  Gathering selects `Few` and shows the hint.
- AC6.3 On the phone landscape viewport, "Create and play" is reachable and works.
- AC6.4 The F3 overlay shows the generator row for generator 1 and 2 worlds.

**Group 7: leaves.**

- AC7.1 With the default setting, a player walking at a canopy passes through it and a
  player standing above a canopy falls through it; with the setting on, both are blocked
  as today (unit tests on physics with both tables, and one browser spec).
- AC7.2 Leaves stay targetable and breakable with the setting off; torches still stand on
  leaves.
- AC7.3 The setting persists over a reload, is in `getState()`, and can be switched with
  mouse, touch and the controller on the settings page.
- AC7.4 Turning the setting on while inside leaves does not move the player, and the
  player can walk out into air.
- AC7.5 Physics allocates nothing per step with either setting (existing allocation test
  pattern).

## 7. Test strategy

- **Unit (Node):** `worldOptions.test.ts` (strings pinned, validation), `terrainV2.test.ts`
  (AC2.1, AC4.1, AC4.2, trees spacing, `none`), `terrainV2Stats.slow.test.ts` (groups 2
  and 3: heavy statistics, no tight time limit), `terrainV2Speed.solo.test.ts` (AC4.3),
  `spawn.test.ts` additions (AC3.3), `saveFormat.test.ts` (AC1.2, AC5.2),
  `protocol.test.ts` / `sessions.test.ts` (AC5.3), `settings.test.ts` and
  `physics.test.ts` (group 7).
- **Browser:** `terrain.spec.ts` (AC1.1, AC4.1 in the browser), `worldMenu.spec.ts`
  (AC5.1, AC6.1, AC6.2), `touchLayout.spec.ts` or `touch.spec.ts` (AC6.3),
  `gamepadMenus.spec.ts` (AC6.1 controller), `save.spec.ts` (AC1.2), `mpRooms.spec.ts`
  (AC5.3), a new `leaves.spec.ts` (AC7.1–AC7.4), `ui.spec.ts` (AC6.4). New specs go into
  `e2e/shards.json`.
- **References:** new screenshots `gen2-balanced-few.png` and `gen2-flat-many.png` (seed
  1337 from a fixed high pose) and `gen2-hilly-normal.png`. The form's `world-menu.png`
  and `pad-world-menu.png` are regenerated. Every new or changed reference is looked at
  by eye. All other references must stay unchanged (AC1.3).
- **Hard rule 1:** the labels are plain words; no third-party names.

## 8. Implementation steps

Each step ends with `npm run check`, `npm run build` and the specs it touches (with
`MC_CONTAINER_GPU_STALL=1`), named in the commit body, then a push.

### Step 1 – World options and dispatch

`worldOptions.ts`, `WorldGen`, `generateChunk`/`terrainChecksum`/`isKnownGeneratorVersion`
taking `WorldGen`, all callers passing `{ version: 1 }` or the world's generator.
`GENERATOR_VERSION` stays 1 in this step. No change in output (AC1.1). Commit:
`world: pass the world's generator to generateChunk`.

### Step 2 – Generator 2 heights

`terrainV2.ts` with the three shapes; `scripts/terrainStats.ts` prints plains, water,
beach, high land, rock, trees and open share per preset. Tune `balanced` and `flat`.
Tests of group 2 and AC4.3. Commit: `world: generator 2 terrain shapes`.

### Step 3 – Generator 2 trees and spawn

Forest noise, levels, spawn rule. Tests of group 3, AC4.1 (record the 12 checksums), AC4.2.
Commit: `world: generator 2 forests and the wood rule of the spawn`.

### Step 4 – Save format 3

`options` in `WorldMeta`, decode, migration, `Game.newWorldMeta`/`loadWorld` with the
world's generator. `GENERATOR_VERSION` becomes 2. Tests AC1.2, AC5.2. Commit:
`save: format 3 with the world's options`.

### Step 5 – Rooms

`options` in `welcome`, checksum with `WorldGen`, guest world. AC5.3. Commit:
`net: welcome carries the world's options`.

### Step 6 – Form, list, overlay, URL, test API

The two rows, the `None` rule, the list rows, the F3 row, `terrain`/`trees` URL
parameters, `getState().world.options`. Group 6, AC5.1, AC4.1 in the browser, new
references. Commit: `ui: terrain and trees in the new world form`.

### Step 7 – Collide with leaves

Setting, switch row, physics table, `getState()`. Group 7. Commit:
`player: leaves are passable unless "Collide with leaves" is on`.

### Step 8 – Docs, device tests, report, pull request

See section 9. Then open the pull request into `main`, describing the result and linking
the report; watch it until merged or closed.

## 9. Documentation

- Root `CLAUDE.md` (must stay below the 22 500-byte warning): the invariants "Generator
  version" and "Saving" each shrink to two lines (the current number, the never-change
  rule, a pointer to `src/world/CLAUDE.md` and `src/save/CLAUDE.md`). The planning note in
  "Open" is replaced by one status row `7A`. "Reading older docs" is not needed.
- `src/world/CLAUDE.md`: generator versions, `WorldGen`, the presets, the forest and
  spawn rules, `scripts/terrainStats.ts`. `src/save/CLAUDE.md`: format 3. `src/net/CLAUDE.md`:
  `options` in `welcome`. `src/ui/CLAUDE.md`: the form rows and the `None` rule.
  `src/player/CLAUDE.md`: the leaf table. `docs/testing.md`: `terrain`, `trees`,
  `getState().world.options`, `collideLeaves`.
- `docs/device-tests.md`: a new section "World options (Phase 7 part A)" with GEN-1 (the
  three shapes look like their names on PC and phone), GEN-2 (Few trees: wood within reach
  of the spawn in Gathering, forests and meadows readable), GEN-3 (the form on phone
  landscape and with the controller), GEN-4 (a guest in a generator 2 room sees the same
  world, from a PR preview), LEAF-1 (walking through canopies feels right), LEAF-2 (how
  the view looks inside a canopy; whether an effect is wanted later). The intro's "seed
  1337 … start point in a wood" is updated: comparing tests use seed 1337 with the form's
  defaults (or say which options), and the description of the start point is re-measured.
- `docs/phase-7a-report.md` as in the Definition of Done, with the measured numbers of
  `scripts/terrainStats.ts` per preset and the section "For the Pi side".

## 10. Risks and fallbacks

- **Tuning does not reach a range of section 6.** Tune the starting points first. If a
  range cannot be reached without changing the water share, keep the water share (out of
  scope), record the measured value and the reason in the report, and widen that one
  range by the smallest step that holds.
- **Spawn search too slow with the wood rule.** Count trunks with a running window sum
  over the spiral's rows, or check the wood rule only for spots that pass the cheap rule.
  If still above 200 ms, lower `SPAWN_WOOD_RINGS` and note the fallback rate.
- **Generation slower than AC4.3.** The forest noise per column is the only new per-column
  cost. Evaluate it at a coarse grid (every 4 columns) with bilinear interpolation.
- **Form too tall on phones.** The form scrolls; if the focus manager does not scroll the
  focused row into view, fix that in `FocusManager` (scroll into view on focus), which
  also helps other long pages.
- **Shared code accidentally changes version 1.** Keep `Terrain` untouched. Any
  extraction is a separate commit that only passes if the version 1 tests pass unchanged.
- **Leaves passable surprises existing players** (no standing on tree tops). It is the
  owner's chosen default; LEAF-1 asks about it.

## 11. For the owner and for the Pi side

- After the merge, new worlds look different from the old ones; old worlds stay "Classic".
  Device tests compared on seed 1337 use the form's defaults from now on.
- For the Pi side: nothing new to configure (same build variables, no new packages, no
  new requests on the signaling server). The room protocol changed (`welcome`), so
  devices must run the same build, which the build id ensures. The multiplayer device test
  GEN-4 needs a PR preview, so the preview service must be running (not paused) when
  the pull request is open.
