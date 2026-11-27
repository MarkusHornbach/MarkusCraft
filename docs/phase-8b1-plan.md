# Phase 8 part B1 plan – Radar

Read `CLAUDE.md`, `src/world/CLAUDE.md`, `src/progress/CLAUDE.md`, `src/bot/CLAUDE.md`,
`src/ui/CLAUDE.md`, `src/input/CLAUDE.md`, `src/bench/CLAUDE.md` and `e2e/CLAUDE.md` first,
and the "Decisions and deviations" of `docs/phase-8a1-report.md` (tables, static check,
bot), `docs/phase-8a2-report.md` (locks per player in rooms, guests' outcomes),
`docs/polish-2-report.md` (the tracker, the Tasks tab), `docs/fix-adventure-1-report.md`
(the light rule of the static check), `docs/phase-7a-report.md` (generator 2) and
`docs/phase-5b-report.md` (the inventory screen and the controller).

Phase 8 ("Adventure") was outlined in `docs/phase-8a-plan.md` as parts A–E. Part B is now
planned in smaller pieces. **B1** (this plan) is the radar. B2 and later (caves, special
places, chests, new material tier, …) are not planned. One implementation session, one
branch, one pull request. Work on the branch assigned to the cloud session, else
`phase-8b1-radar`. Start from `main`. If this plan is not on `main` yet, merge the branch
that holds it (`claude/wizardly-volta-0v520p`) first. The session is autonomous: do not ask
the owner questions. Where this plan leaves a detail open, choose the simplest option
consistent with it and note it in `docs/phase-8b1-report.md`, section "Decisions and
deviations".

Tests name their criterion in the title as "Phase 8B1 AC1.1". Device tests have the origin
"8B1".

## 1. Goal

The game moves away from digging blindly into a mountain for coal and iron. An Adventure
player who has finished task 8 "Climb to height 64" gets a **radar**: a small circle on the
game screen and a larger map on a new inventory tab "Map". It shows the nearest coal and
iron veins around the player. The depth hint gets more exact the closer the player is, so
the player still has to search and dig, but no longer blindly.

The radar is worked out from the seed and the world coordinates (the ore veins are pure
functions of the seed). Where the chunk is loaded, the real blocks correct it, so mined
veins disappear. No terrain, ore, save format or protocol changes. Old worlds keep working.

## 2. Findings of the planning session

- **Too many veins to show them all.** A scratch measurement (seeds 1, 42, 1337, 2024;
  generator 2 flat, balanced and hilly; few trees) counted the ore veins whose blocks lie
  within 48 blocks (horizontally) of the spawn point: **450–560 coal veins and 265–335 iron
  veins**. Even within ±12 blocks of the spawn height there are 87–132 coal veins, and 23–55
  coal veins lie within 24 blocks in 3D. A radar that shows every vein in its radius would
  be covered completely. The real problem with blind digging is not "is there coal around
  here" (underground it nearly always is) but "which direction from my tunnel, and how far up
  or down". Hence decision 1 (nearest few per kind).
- **An ore is only placed where the cell is stone.** `placeOres` (`ores.ts`) walks a vein
  through a 5 × 5 × 5 box around its origin and sets a cell to ore only if it is
  `Block.STONE` at that moment. The vein walk is the same in generator 1 and 2; the stone
  depends on the generator: a rock column is stone from 1 to its height `h`, any other
  column from 1 to `h − DIRT_DEPTH − 1` (dirt, sand, clay and water lie above; clay reaches
  only `CLAY_DEPTH` = 2 below the top, so never into stone). Coal is placed before iron, so a
  cell that a coal vein took is never iron. The radar therefore needs, besides the vein
  walk, a pure "is this cell stone before the ores" per generator version. Trees are placed
  after the ores; the agreement test (AC1.1) proves they never replace an ore.
- **Chunk data always covers the radar.** The chunk manager keeps block data out to the
  render distance + 2 chunks (Chebyshev). At the smallest render distance (2) that is at
  least 64 blocks from the player in every direction, so the radar's area (48 blocks) is
  loaded except for a moment after a world opens or a teleport. Reading the real blocks
  there is cheap and makes mined-out veins exact; the seed prediction covers the rest and
  the "beyond range" arrow (up to 96 blocks).
- **The unlock fits task 8.** Task 8 "Climb to height 64" (chapter 2) needs nothing the
  radar gives, the bot already does it, and it lies right before chapter 3's "Mine 32
  coal". Task progress belongs to the world, so in a room everyone has the radar once it is
  done (as with the torch's task unlock, Fix Adventure 1).
- **Free screen space.** PC: the top-left holds the tracker and room notices, the top centre
  the progress notice; the top-right is free. Touch (landscape): menu top-left, bag
  top-right (Adventure has no fly button), up/down/break/place bottom-right, the stick
  bottom-left. The space below the bag is free.
- **The Pi side** (`sync/status.md` of the owner's Pi repository, read only): main build at
  b224b30, no open PRs, nothing waiting. This part needs nothing new there (section 11).

## 3. Decisions made with the owner

| Topic                  | Decision                                                                                                                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What the radar shows   | Per resource kind the **nearest N veins by 3D distance** whose nearest ore cell lies within the radius (horizontal distance ≤ 48). N = 4 on the circle, 8 on the map                                                                      |
| Depth hint             | **Relative to the player's feet.** 3D distance over 24: symbol only. 12–24: a coarse arrow, ↑ above, = about level (`dy` within ±3), ↓ below. Up to 12: the exact difference ("5↓", "2↑", "=" at 0)                                       |
| Data source, mined-out | Veins from the seed and the stone rule of the world's generator; **where a cell's chunk is loaded, the real block decides.** Mined cells drop out, a vein without ore disappears, the next nearest takes its place. No save format change |
| Unlock                 | **Task 8 "Climb to height 64"**. Notice "Unlocked: Radar". In a room: everyone, since the task belongs to the world's book                                                                                                                |
| Circle orientation     | **Heading-up** (the view direction is up). Redraw only when needed, capped (5.6)                                                                                                                                                          |
| Circle placement       | **Top-right on both.** PC: 12 px from the top and right edges, 112 px. Touch: right edge, directly below the bag button, 88 px. Never takes pointer, touch or focus                                                                       |
| Map tab                | A fourth tab "Map" (after Items, Crafting, Tasks). North-up, a turning player arrow, **a terrain background from the loaded chunks** (current state, no memory, no fog), distance rings, 8 veins per kind, a legend row per kind          |
| Addition: task focus   | When the tracked task is a `mine` task for a radar resource ("Mine 20 iron ore"), the circle shows only that kind; otherwise all kinds. The map always shows all kinds                                                                    |
| Addition: beyond range | A kind with no vein in the radius gets a small arrow on the rim of the circle (and the map) pointing to its nearest vein up to 96 blocks away (seed prediction where not loaded)                                                          |
| Setting                | A switch "Radar circle" on the settings page, on by default; the Map tab stays available when it is off                                                                                                                                   |
| Creative               | No radar, no Map tab                                                                                                                                                                                                                      |
| Sizing                 | About one typical part (estimate 1.1–1.2 with both additions). No split                                                                                                                                                                   |

## 4. Changes to the original scope

The owner's starting scope was challenged during planning. Agreed changes:

| #   | Change                                                                                                                            | Reason                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The radar shows the nearest 4 (circle) or 8 (map) veins per kind, not every vein in the radius                                    | Measured: 450–560 coal and 265–335 iron veins within 48 blocks; showing all would cover the circle. Nearest-first keeps the search (the player still digs to it) and stays readable                     |
| 2   | The depth hint is relative to the player's feet (↑ / = / ↓, then the exact difference), not an absolute "shallow / medium / deep" | "Dig down, sideways or up" can be acted on at once; an absolute layer has to be related to one's own height first                                                                                       |
| 3   | The radar reads the real blocks where a chunk is loaded, on top of the seed prediction                                            | Makes mined-out veins exact without a save format change ("visited" marks would need format 6), works in rooms because a guest's world holds the host's edits. The seed alone still drives it elsewhere |
| 4   | The Map tab gets a terrain background from the loaded chunks                                                                      | Makes it an environment map for orientation (lakes, hills, own builds). It shows the current state only: no memory, no fog of war                                                                       |
| 5   | Added: the circle follows the tracked task's resource                                                                             | The hint matches the goal the player chose; cheap (pure, derived from the tracker, no save, no input)                                                                                                   |
| 6   | Added: an arrow on the rim for a kind with no vein in range (up to 96 blocks)                                                     | Never an empty radar for a kind; prepares rare resources of later parts                                                                                                                                 |
| 7   | Added: an F3 row "Radar" with the last scan and draw time, and a bench scenario `radar`                                           | The owner asked to prove the cost with the bench tools; both make the cost visible on a real phone                                                                                                      |

## 5. Out of scope (do not build)

- Caves, special places (abandoned mine shaft, ravine with exposed ore), ore on the surface
  as a feature, chests, new generator versions (8B-2 and later).
- A discovered-area map, fog of war, any memory of where the player was.
- Task markers or waypoints on the map; choosing a target on the map.
- Health, creatures, new items, new blocks, new recipes; any change to the recipe,
  item, block, task or chapter tables except the new unlock entry (5.3).
- Changes to terrain, ores, the save format (stays 5), the room protocol, generator
  versions or their checksums.
- Sound, animation of the circle (a sweeping beam, pulses), zooming or panning the map.
- The rest of Phase 7, Web Workers (Phase 4 part C).

## 6. Specification

### 6.1 Generation: shared vein walk and the ore host (`src/world/generation/`)

- **The vein walk becomes shared.** `ores.ts` exports the walk of one vein (origin, size and
  cells from a cell hash, the walk through the box) in a form the radar can call, for
  example `veinCells(kind, kindSeed, cellX, cellY, cellZ, out): number` writing the cells'
  coordinates into a reused `Int32Array` and returning the count (0: no vein in this cell).
  `placeKind` uses the same code. Generation output must not change: the checksums
  (`TERRAIN_CHECKSUM_1337_V1`, the twelve `TERRAIN_CHECKSUMS_1337_V2`) stay; the solo speed
  tests (`terrainSpeed.solo.test.ts`, `terrainV2Speed.solo.test.ts`) must still pass. If
  sharing makes generation measurably slower than their limits, keep `placeKind`'s loop as
  it is and give the radar a second copy of the walk; the agreement test (AC1.1) then guards
  that both agree. Record which way was taken.
- **The ore host.** `TerrainSource` gets `oreHost(x, y, z): boolean`: true if generation
  leaves stone in that cell before the ores are placed. Versions 1 and 2: `1 ≤ y ≤
stoneTop(x, z)`, where `stoneTop` is `h` for a rock column and `h − DIRT_DEPTH − 1`
  otherwise. The rock decision must be the same code `generateChunk` uses (factor it out of
  the chunk loop without changing the output; the neighbours' heights come from
  `heightAt`). A small per-column cache (bounded, for example 4 096 columns) keeps repeated
  queries cheap. **Extension point:** a generator with caves (8B-2) adds its cave test to
  its own `oreHost`; the radar does not change.
- The order rule: kinds are placed in `ORE_KINDS` order and only into stone, so a cell taken
  by an earlier kind's vein is not a later kind's. The radar's prediction follows it.

### 6.2 The radar core (pure, new area `src/radar/`)

A new pure area with the discipline of `src/progress/` (no `three`, DOM, `Math.random`,
`Date.now`; add it to the ESLint purity rules and the coverage scope, and to the root
`CLAUDE.md`'s project structure). Files (names may change, record it):

- `kinds.ts`: `RADAR_KINDS`, one row per resource: `{ key, block, label, shape, colour }`
  (`coal`: `Block.COAL_ORE`, "Coal", a filled dot, dark grey with a light rim; `iron`:
  `Block.IRON_ORE`, "Iron", a diamond, tan). The shapes differ, so colour is never the only
  difference. **A new ore of a later part is one row here plus its row in `ORE_KINDS`.**
  Labels are generic words, never a third-party name.
- `veins.ts`: the seed side. `VeinIndex(seed, gen)` lists the veins whose box touches a
  horizontal area, per ore cell column `(cellX, cellZ)` of `ORE_CELL`, each vein as
  `{ kind, cells }` with only the cells where `oreHost` holds and no earlier kind's vein
  took the cell. Cached per ore cell column (bounded, for example 2 048 columns, oldest
  dropped); it depends on the seed and the generator only, never on the world.
- `scan.ts`: `scanRadar(input): RadarScan`. Input: the vein index, the feet cell `(x, y, z)`
  (floored), a block probe `(x, y, z) => number | null` (the block of a loaded chunk, null
  where the chunk is not loaded), the kinds to look for, N, the radius, the far radius. Per
  vein, a cell counts if the probe says it is that kind's block, or the probe returns null
  (then the prediction counts). A vein with no counting cell is left out. Its distance is
  the 3D distance from the feet cell to its nearest counting cell, and that cell is where its
  symbol is drawn. A vein is in range if that cell's horizontal distance is ≤ the radius.
  Per kind the N nearest in range are returned, as `{ kind, dx, dy, dz, dist, hint }`, in
  order of distance (ties: lower `dy`, then `dx`, then `dz`, so the result is
  deterministic). `hint` is `none`, `{ coarse: 'up' | 'level' | 'down' }` or
  `{ exact: dy }` by the table of section 3. For a kind with no vein in range, `beyond` gives
  the direction (`dx`, `dz`) and distance of its nearest counting cell up to the far radius,
  or null.
- `focus.ts`: `radarFocus(tracked)`: the kind whose block drops the tracked task's `mine`
  target (`Item.COAL` from coal ore, the iron ore item from iron ore; through the drop table,
  not a hard-coded list), else null (all kinds).
- `map.ts` (pure helpers for the Map tab): `MAP_COLOURS` (a colour per top block, generated
  here as numbers; water, sand, grass, dirt, stone, leaves, logs, snow-free; unknown: grey),
  `surfaceShade(y)` (lighter with height, a simple relief) and the hint texts of the legend
  ("2 below", "below", "level", "above", "far"; "none within 96").
- Constants in `src/game/config.ts`: `RADAR_RADIUS` 48, `RADAR_FAR_RADIUS` 96,
  `RADAR_CIRCLE_PER_KIND` 4, `RADAR_MAP_PER_KIND` 8, `RADAR_COARSE_DIST` 24,
  `RADAR_EXACT_DIST` 12, `RADAR_LEVEL_DY` 3, `RADAR_SCAN_STEPS` 15, `RADAR_DRAW_STEPS` 4,
  `RADAR_TURN_DEG` 2, `RADAR_CIRCLE_PX` 112, `RADAR_CIRCLE_TOUCH_PX` 88.

Hot path: the scan allocates nothing per cell (typed arrays, reused buffers); the result
objects are at most `2 × N` per call.

### 6.3 The unlock (`src/progress/`)

- `tables.ts`: `FEATURE_UNLOCKS: readonly { feature: Feature; unlock: Unlock }[]` with
  `Feature = 'radar'` and the one entry `{ feature: 'radar', unlock: { task: 8 } }`. Features
  are not saved, so the string is safe; the table is append-only all the same (pinned by
  `tables.test.ts`).
- `progress.ts`: `featureUnlocked(feature, record, progress)` (level from the record, task
  from the world's `done`, as `recipeUnlocked` without the `crafted` rule). The outcome
  `unlocked` gets `features: Feature[]` next to `recipes`; `stepProgress` and
  `outcomesOfBook` (guests) fill it; a level-up's outcome too if a feature is ever on a level.
- `view.ts`: the notice "Unlocked: Radar" (with recipes: "Unlocked: Torch, Radar"; after a
  level: "Level 3 · Unlocked: …, Radar"); `featureLockText('radar')` = "Task: Climb to
  height 64".
- `check.ts`: every feature has exactly one unlock; its level exists or its task exists and
  is done in the abstract play; a failure names it ("feature radar: task 8 is never done").
  Nothing needs a feature yet, so the light rule is untouched; the check's output (the
  guaranteed XP per chapter) does not change.

### 6.4 Rooms

Nothing new in the protocol: `protocol.ts` and the message kinds stay. Every player works
out its own radar from its own `World` (a guest's world holds the host's edits of loaded
chunks) and its own pose. The unlock follows the world's book, which a guest knows from the
host's messages; in a room, everyone has the radar once task 8 is done. Creative rooms: no
radar.

### 6.5 Goal bot (`src/bot/`, `scripts/progressRun.ts`)

The bot ignores the radar. Additions:

- `bot.slow.test.ts`: at the end `featureUnlocked('radar', …)` is true. At the start of
  task 12 "Mine 32 coal" and task 16 "Mine 20 iron ore" the radar's nearest vein of that
  kind (scan with the bot's world as the probe, after generating every chunk within the
  radius) equals the nearest ore block of that kind found by a brute-force scan of those
  chunks (same distance, same cell). This checks the world correction in a world with
  real edits.
- `scripts/progressRun.ts` prints a short "Radar" section: the median and maximum
  estimated minute at which the radar unlocks, and at the start of tasks 12 and 16 the
  median distance and `dy` to the nearest vein of the task's kind.

### 6.6 The circle (`src/ui/RadarCircle.ts`, part of the HUD)

- A 2D canvas (device pixels, at most 2 × CSS size), round, a dark translucent disc with a
  thin rim, a tick or small triangle at the top for "ahead", the player as a small arrow in
  the centre. Symbols at `(dx, dz)` turned by the player's yaw (heading-up), scaled so
  `RADAR_RADIUS` reaches the rim. Next to a symbol its hint: none, "↑", "=", "↓", or the
  exact number with the arrow ("5↓"). The `beyond` arrow sits on the rim in its direction,
  in its kind's colour. Text is drawn upright (never rotated). Everything is drawn by code.
- **Shown** in Adventure while playing when the radar is unlocked and the setting is on.
  Hidden with the HUD (inventory, pause, world menu), in Creative, while locked, with the
  setting off, during a performance run (except in the scenario `radar`).
- **Place:** PC top-right, 12 px from both edges, `RADAR_CIRCLE_PX`. Touch: right edge
  aligned with the bag button, its top one gap below the bag button, `RADAR_CIRCLE_TOUCH_PX`;
  it must not overlap any touch button at 640 × 360 and 1280 × 720 (landscape). `pointer-
events: none`, never focusable; a look drag that starts on it turns the view as anywhere
  else. The F3 overlay (top-left) and the tracker are unaffected.
- **When it scans** (the vein query): at most once every `RADAR_SCAN_STEPS` simulation
  steps, and only if something changed since the last scan: the feet cell, a block within
  `RADAR_FAR_RADIUS` + 2 (from `onBlocks`), a chunk within that distance loaded or dropped,
  the tracked task's focus, the unlock or the setting. **When it draws:** after a scan with a
  changed result, or when the yaw changed by at least `RADAR_TURN_DEG` since the last draw,
  and at most once every `RADAR_DRAW_STEPS` simulation steps. Standing still and not turning
  draws nothing. Counting in simulation steps keeps tests deterministic.
- **Task focus:** `radarFocus(trackedTask(…))` chooses the kinds of the circle (6.2).
- **Settings:** "Radar circle" (`radar: boolean`, default true) below "Collide with leaves",
  in every input mode, stored with the other settings (a missing field reads as true).
- **F3 overlay:** a row "Radar" in Adventure while unlocked: "4 coal · 2 iron · scan 0.6 ms ·
  draw 0.1 ms" (the last scan and draw, measured with `performance.now` in the shell), or
  "off" when the setting is off.

### 6.7 The Map tab (`src/ui/MapTab.ts`)

- The inventory screen of an Adventure world has four tabs: "Items", "Crafting", "Tasks",
  "Map". Mouse, touch and the controller's LB/RB reach it as the others (no wrap-around); it
  opens on the tab it was closed with. Its controller default focus is the tab itself (like
  "Tasks"); nothing inside it is focusable; the pad hint bar shows the usual hints. Creative:
  no Map tab.
- **Locked:** the panel shows "Map · Locked" and "Task: Climb to height 64" (the lock text),
  no canvas.
- **Unlocked:** a square canvas as large as the panel allows (it must fit a 640 × 360 phone
  without scrolling), north-up (north = −Z at the top, as the F3 row "Facing"), radius
  `RADAR_RADIUS`:
  - background: per column the top block of the loaded world (`World.surfaceY`) as a
    colour of `MAP_COLOURS` shaded by `surfaceShade`; columns of unloaded chunks stay dark.
    Worked out per chunk (16 × 16 pixels) and cached while the tab is open; a chunk's tile is
    redone when `onBlocks` reports a change in it or it is loaded; the cache is dropped when
    the inventory closes;
  - rings at 16, 32 and 48 blocks, the player arrow in the centre turned by the yaw;
  - up to `RADAR_MAP_PER_KIND` veins per kind (all kinds, no task focus) with the same hints
    as the circle, and the `beyond` arrows;
  - a legend row per kind: its symbol, label and nearest vein ("Coal · 7 blocks · 2 below",
    "Iron · 70 blocks · far", "Iron · none within 96"). The legend sits beside the map when
    the panel is wider than tall, else below it.
- It updates while open (the inventory does not pause the game) with the circle's scan and
  draw rules (6.6); the background only redraws tiles that changed.

### 6.8 Test tools (`src/game/testApi.ts`)

- `getState().radar`: `{ unlocked, setting, shown, focus, entries, beyond, scans, draws }`;
  `entries` and `beyond` as the circle's last scan (kind keys, `dx`, `dy`, `dz`, `dist`,
  `hint`), `scans` and `draws` counted since the world was loaded. `getState().map` (only
  while the Map tab is open): `{ locked, entries, legend }` with the legend texts.
- `progress=all` unlocks the radar (task 8 done), `progress=fresh` does not. No new URL
  parameter; tests turn the circle off through the settings page or the stored settings.
- `World` is reachable for specs that break a vein's cells through actions (the test API's
  existing helpers; a new helper only if none fits, documented in `docs/testing.md`).

### 6.9 Performance proof (`src/bench/`)

- A scenario `radar` (version 1; `BENCH_SUITE_VERSION` 3 → 4): from `BENCH_SPAWN`, the
  `walk` input, and the view turning steadily (about 1.5° per step) so the heading-up circle
  draws at its cap the whole window. The scenario shows the circle in the bench's Creative
  world (a scenario flag, for example `radar: true`; nothing else of the radar runs in
  Creative). `Scenario` gets an optional `yaw(step)` that sets the view direction per step;
  only `radar` uses it. `scenarios.test.ts` pins the table.
- Numbers from software WebGL (the cloud, CI) are never evidence. The report gives the
  Node cost of a scan (AC1.7) and the cloud bench rows only as a smoke check. The evidence is
  device test RADAR-1 and RADAR-2 (section 9).

### 6.10 Older specs and references

- References that show an Adventure HUD with `progress=all` now show the circle (and those of
  the inventory with four tabs). Regenerate only those, look at each, and list them in the
  report. The default `?test=1` world is Creative and unchanged.
- Specs that walk the tabs with LB/RB (`e2e/gamepadInventory.spec.ts`, `e2e/padSoak.spec.ts`
  Part B) now reach "Map" after "Tasks": adapt their expectations and record each change in
  the report ("Tests changed on purpose").
- Specs that read the settings page's rows by position: adapt for the new switch.

## 7. Acceptance criteria

**AC1 The radar core (pure)**

- AC1.1 **Agreement with the generator** (`src/radar/agreement.slow.test.ts`): for seeds 1,
  42, 1337, 2024 and the generators version 1 and version 2 (all twelve presets), for a
  3 × 3 square of chunks at the origin and one at chunk (−20, 13): the set of coal and iron
  cells the radar predicts (probe always null) equals exactly the set of `COAL_ORE` and
  `IRON_ORE` blocks of `generateChunk`, kind by kind.
- AC1.2 **World correction:** in a `World` with loaded chunks, breaking cells of a vein
  removes exactly those cells from its counting cells; breaking all removes the vein and the
  next nearest takes its place; an ore block placed where no vein lies is never shown; with
  a chunk unloaded, its cells fall back to the prediction. `verifyLight()` is 0 at the end.
- AC1.3 **Selection and hints:** nearest N per kind by 3D distance among veins in range
  (horizontal ≤ 48), deterministic order; hints by the table at the borders: distance 24.01
  `none`, 24 coarse, 12.01 coarse, 12 exact; `dy` −3…3 is `level` in the coarse range; exact
  0 shows as "=".
- AC1.4 **Beyond range:** a kind with no vein in range gets its nearest counting cell up to
  96 blocks (direction and distance); none within 96 gives null.
- AC1.5 **Task focus:** a tracked "Mine 32 coal" gives `coal`, "Mine 20 iron ore" `iron`,
  any other task, no task or a complete book null.
- AC1.6 **Unchanged generation:** the V1 and V2 terrain checksums are unchanged (existing
  tests pass untouched); the generation speed solo tests pass.
- AC1.7 **Cost in Node:** a scan around the spawn of seed 1337 (balanced, few) with a warm
  index, all chunks within 64 blocks loaded, and with a cold index are measured
  (`*.solo.test.ts`, best of several rounds) and limited through `expectFasterThan` (limits
  at least three times the measured median, numbers in the report).

**AC2 Unlock and progress**

- AC2.1 `FEATURE_UNLOCKS` holds `radar → task 8`; `tables.test.ts` pins it; the static
  check passes with it and fails with "feature radar: …" for an unlock on a task that does
  not exist or is never done.
- AC2.2 Finishing task 8 queues the notice "Unlocked: Radar" (unit test of `stepProgress` and
  `noticeTexts`); a guest gets the same notice from `outcomesOfBook`.
- AC2.3 `featureUnlocked` is false before task 8 and true after, for every player record in
  the world, whatever its level.
- AC2.4 `bot.slow.test.ts`: the radar is unlocked at the end; at the start of tasks 12 and
  16 the radar's nearest vein equals the brute-force nearest (6.5).
- AC2.5 `scripts/progressRun.ts` prints the "Radar" section for all 12 runs; the report
  holds it.

**AC3 The circle**

- AC3.1 With `progress=all` in an Adventure world the circle is shown while playing, and
  hidden in the inventory, the pause menu, Creative, with `progress=fresh` and with the
  setting off (a browser spec for each state).
- AC3.2 Place: PC top-right at 12 px, 112 px; touch at 640 × 360 and 1280 × 720 below the
  bag button, 88 px, overlapping no touch button and not the tracker (bounding boxes in the
  spec); a touch look drag that starts on the circle turns the view.
- AC3.3 Heading-up: a vein straight ahead of the player (set by the test through yaw) is
  drawn above the centre; after turning 90° right it is drawn on the left (from the state's
  screen positions, `entries[].screen` or similar).
- AC3.4 Redraw rules: standing still for 120 steps adds no draw and no scan; turning by 1°
  per step for 120 steps adds at most 30 draws; breaking a block of a shown vein triggers a
  scan within `RADAR_SCAN_STEPS`.
- AC3.5 The setting "Radar circle" switches it, survives a reload, and is on in a fresh
  profile.
- AC3.6 The F3 row "Radar" shows in Adventure while unlocked, not in Creative.
- AC3.7 References `radar-circle` (PC) and `radar-circle-touch` (640 × 360), looked at.

**AC4 The Map tab**

- AC4.1 Adventure has four tabs; the mouse, a tap and LB/RB reach "Map"; RB on "Map" stays;
  the tab is the controller's default focus; nothing inside is focusable; it reopens on
  "Map" after closing on it; Creative has no Map tab.
- AC4.2 Locked (`progress=fresh`): "Task: Climb to height 64", no canvas.
- AC4.3 Unlocked: the canvas, the legend rows of coal and iron with their texts; at most 8
  veins per kind; moving the player while the tab is open changes the legend's distance.
- AC4.4 Mined-out in the browser: breaking every cell of the nearest coal vein (through
  actions) changes the nearest coal entry to another vein.
- AC4.5 It fits 640 × 360 without scrolling (spec measures the canvas and legend inside the
  panel). References `map-tab` (PC), `map-tab-touch` (640 × 360), looked at.

**AC5 Rooms**

- AC5.1 In an Adventure room (host with `progress=all`) the guest's `getState().radar` is
  unlocked and shown, and its nearest coal entry equals the host's when both stand at the
  same cell; after the host breaks that vein the guest's entry changes too.
- AC5.2 No protocol change: `protocol.ts` is not touched (the diff of the pull request
  shows it), its tests pass unchanged.

**AC6 Performance**

- AC6.1 The scenario `radar` (version 1) exists, `BENCH_SUITE_VERSION` is 4, and a local
  bench run (cloud, smoke check only) completes it.
- AC6.2 Device tests RADAR-1 to RADAR-7 are in `docs/device-tests.md` (section 9).

**AC7 General**

- AC7.1 `npm run check`, `npm run build` and the affected specs pass; no console errors.
- AC7.2 `SAVE_FORMAT_VERSION` stays 5; a world saved before this part loads unchanged
  (existing save tests pass untouched); an old Adventure world of generator 1 gets the radar
  when task 8 is done.
- AC7.3 Every older spec passes, adapted only as 6.10 says.
- AC7.4 Docs: `src/radar/CLAUDE.md` exists; the root `CLAUDE.md` names `src/radar/` in the
  structure, purity line and "Where the rules are", and has the status row; the docs budget
  passes.

## 8. Test strategy

- **Unit (Node):** the vein walk and `oreHost` (`src/world/generation/`), `src/radar/` (the
  scan, hints, beyond, focus, map helpers, the index cache bounds), the feature unlock
  (`src/progress/`), settings decoding. The agreement test is a `*.slow.test.ts`; the scan
  cost a `*.solo.test.ts`.
- **Bot:** the slow test and the script (6.5).
- **Browser:** a new `e2e/radar.spec.ts` (AC3, AC4 on the PC), `e2e/radarTouch.spec.ts`
  (640 × 360, 1280 × 720), additions to `e2e/gamepadInventory.spec.ts` (AC4.1 with the pad),
  one multiplayer spec or an addition to an existing Adventure room spec (AC5.1). Add the new
  specs to `e2e/shards.json`, balancing by the last CI run's times.
- Wait on state (`whenIdle`, the `scans` / `draws` counters), never on sleeps. Run browser
  specs with `MC_CONTAINER_GPU_STALL=1` in the cloud.
- **Screenshots:** open every new and regenerated reference with the Read tool and judge it
  by eye: symbols readable, hints upright, circle clear of the buttons, the map's colours
  telling water, sand, grass and stone apart.

## 9. Device tests (origin "8B1", new section "11. Radar (Phase 8 part B1)")

- **RADAR-1** Performance test on the phone: the `radar` row against the `walk` row
  (frame time and lights). _Phone._
- **RADAR-2** On the phone in an Adventure world with the radar: F3 overlay "Radar" row
  while walking and turning (scan and draw times); does the game feel as smooth with the
  circle on as off? _Phone._
- **RADAR-3** The circle: are coal and iron told apart at a glance, are the hints readable,
  is it in the way anywhere (PC top-right; phone below the bag)? _PC, Phone._
- **RADAR-4** Finding ore with the radar (seed 1337, the form's defaults, from task 12 on):
  do the hints lead to coal and iron without making it trivial? How long did "Mine 20 iron
  ore" take compared with before? _PC._
- **RADAR-5** The Map tab with mouse, touch and controller: readable on the phone, the
  terrain recognisable (lake, hills), the legend clear? _PC, Phone, controller._
- **RADAR-6** Tracking "Mine 20 iron ore" makes the circle show iron only: is that
  understandable, or confusing? _PC._
- **RADAR-7** Walk on the surface away from the spawn until the circle shows the rim
  arrow for a kind (no vein of it within 48 blocks): is it clear where to go? _PC._

## 10. Implementation steps

Commit after every step at the latest (rule 4), run `npm run check`, `npm run build` and
the specs the step touches.

1. **Generation:** the shared vein walk and `oreHost` with its cache in versions 1 and 2;
   the checksums and speed tests unchanged (AC1.6).
2. **Radar core:** `src/radar/` (kinds, index, scan, hints, beyond, focus, map helpers),
   purity rules and coverage scope, constants; unit tests, the agreement test, the cost test
   (AC1.1–AC1.5, AC1.7).
3. **Unlock:** `FEATURE_UNLOCKS`, `featureUnlocked`, outcomes, notice texts, lock text,
   the static check, guests' outcomes (AC2.1–AC2.3).
4. **Bot:** the slow test's checks and the script's section (AC2.4, AC2.5).
5. **The circle:** `RadarCircle`, the scan and draw rules in `Game`, the setting, the F3
   row, `getState().radar`; `e2e/radar.spec.ts` and `e2e/radarTouch.spec.ts` (AC3).
6. **The Map tab:** the fourth tab, the locked text, the canvas with background, rings,
   veins and legend; `getState().map`; specs incl. the controller (AC4); adapt the tab specs
   (6.10).
7. **Rooms and bench:** the room spec (AC5); the scenario `radar` (AC6.1).
8. **References and docs:** regenerate and look at the references (AC3.7, AC4.5, 6.10);
   `src/radar/CLAUDE.md`, the nested files of `world`, `progress`, `ui`, `input`, `bench`,
   `bot`, `docs/testing.md`, the root `CLAUDE.md` (section 12); device tests (section 9);
   `docs/phase-8b1-report.md` with "For the Pi side"; the pull request.

## 11. For the owner and for the Pi side

- **The owner** plays the part on the PR preview the Pi serves and fills in RADAR-1 to
  RADAR-7. The Pi must stay resumed while the pull request is open.
- **The Pi side:** no new build variables, packages, signaling requests or lazy chunks; the
  room protocol does not change. The PR preview and, after the merge, the main build are
  built as usual. The report repeats this under "For the Pi side".

## 12. Documentation

- New `src/radar/CLAUDE.md` (at most 8 000 bytes): files, the data source and the world
  correction, the hints, the scan and draw rules, the extension points (a new ore kind; a
  generator's `oreHost`; later sources such as special places as another provider of
  targets).
- `src/world/CLAUDE.md`: the shared vein walk and `oreHost` (two sentences).
- `src/progress/CLAUDE.md`: feature unlocks. `src/ui/CLAUDE.md`: the circle, the Map tab,
  the setting. `src/input/CLAUDE.md`: the fourth tab under "The controller on the
  inventory". `src/bench/CLAUDE.md`: the scenario `radar`. `src/bot/CLAUDE.md`: the radar
  checks. `docs/testing.md`: `getState().radar`, `getState().map`.
- Root `CLAUDE.md`: `src/radar/` in the project structure and the purity invariant, one line
  in "Where the rules are", one status row, the "Open" paragraph. It must not grow by more
  than about 600 bytes (it is near its limit); move details to the nested files.

## 13. Risks and fallbacks

| Risk                                                                           | Fallback                                                                                                                                                                                     |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sharing the vein walk slows generation beyond the solo tests' limits           | A second copy of the walk for the radar, guarded by the agreement test (6.1)                                                                                                                 |
| `oreHost` and the chunk loop disagree in a corner case (trees, rock at a step) | The agreement test finds it; fix `oreHost` to match generation, never the other way round                                                                                                    |
| A scan is too slow on a phone                                                  | Smaller index work per scan (only ore cell columns that entered or left the radius), a lower scan rate; never more scans. RADAR-2 decides                                                    |
| Heading-up redraws cost frames on a phone                                      | Raise `RADAR_TURN_DEG` or `RADAR_DRAW_STEPS`; as a last resort draw the symbols north-up and rotate the canvas element by CSS with upright hint labels                                       |
| The terrain background takes too long when the tab opens                       | Fill the tiles over several frames (nearest chunks first); the veins and legend come first                                                                                                   |
| The fourth tab breaks the pad soak's random walk                               | Adjust its weights as Fix Adventure 1 did, record it                                                                                                                                         |
| The part runs over its size                                                    | Finish every criterion in this order: core, unlock, circle, Map tab, rooms, bench; nothing is dropped without the owner (report it as a known issue only if a criterion truly cannot be met) |
