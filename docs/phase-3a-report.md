# Phase 3 part A report – Foundation

Plan: [`phase-3-plan.md`](phase-3-plan.md), Part A (steps 1–5). Implemented on the branch
`claude/cool-brown-lroakv`, one commit per step. Parts B, C and D are not started.

## What was built

- **Terrain, generator version 1.** The noise gradient table is written with literal
  values, so every browser computes the same terrain. High ground (from about y 80) and
  steep steps are bare rock without soil and trees. Coal ore (y 12–110, about 1.2 % of the
  stone) and iron ore (y 4–44, about 0.6 %) lie in connected veins of 3 to 10 blocks that
  cross chunk borders; clay lies in patches in lake beds under at least two blocks of
  water. Three new blocks with code-painted tiles: coal ore, iron ore, clay. They can be
  broken but are not in the bar. Every world stores its generator version; a checksum of
  the terrain is the same in Node and in the browser.
- **Action layer.** Breaking, placing and selecting a slot are plain, serialisable
  actions. `decodeAction` validates anything it is given, `applyAction` decides purely
  whether an action is allowed and what it changes, and `LocalSession` applies it. `Game`
  no longer changes a block itself; a source-scan test guards that.
- **Saving.** A world is one record plus one record per edited chunk, validated field by
  field when read. `IdbStore` keeps them in IndexedDB, `MemoryStore` in memory (tests).
  Autosave writes 5 s after the first unsaved change, on pause, when the page is hidden
  and on leaving the world, only the chunks that changed; a failed write is retried and
  shown. Worlds are opened in place, without a page reload.
- **World menu.** The start screen lists the saved worlds (name, mode, date of last play),
  creates worlds (name, optional seed as number or text), deletes them after a question,
  and opens the settings page. The pause menu has "Save and back to worlds" and shows
  "Saved" / "Saving…". A world open in another tab cannot be opened or deleted. Damaged
  records and records of a newer version are listed and cannot be played. A `?seed=` link
  opens the "New world" form. The browser is asked once for persistent storage.
- **Fullscreen.** In touch mode a tap on a play or continue button also enters fullscreen
  where the browser has it, unless the player chose "Exit fullscreen" in this visit.
- **Fixed:** the Phase 1 browser test for the block name label no longer depends on real
  time (known issue of the Phase 2 part A report).
- **Automation:** 61 new unit tests (218 in total), 31 new browser tests (83 in total),
  two new reference screenshots (`rocky-hill`, `world-menu`).

Nothing was cut: the cut list of section 8 (tab lock, damaged-world listing, seed-link
form) was not needed. All worlds are Creative worlds, as the plan says for Part A.

## Acceptance criteria

| Criterion    | Where it is verified                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| AC1.1        | `src/util/noise.test.ts` (gradient table), `src/world/generation/terrainV1.test.ts` (checksum 884517734)                                 |
| AC1.2        | `e2e/terrain.spec.ts`                                                                                                                    |
| AC1.3–AC1.8  | `src/world/generation/terrainV1.test.ts` (five seeds × 256 chunks; spawn and coal tests over 20 seeds)                                   |
| AC1.9        | `src/world/blocks.test.ts` (pinned ids), `terrainV1.test.ts` (version argument)                                                          |
| AC1.10       | `terrainV1.test.ts`: version 1 against the Phase 1 terrain in the same process; measured +9 % to +12 %, limit +20 %                      |
| AC1.11       | `e2e/terrain.spec.ts`, `src/render/textures/tiles.test.ts`                                                                               |
| AC1.12       | `e2e/interaction.spec.ts` (unchanged test), run with `--repeat-each=20`: 20 of 20 passed                                                 |
| AC1.13       | `e2e/terrain.spec.ts` (`rocky-hill`) and review by eye, see below                                                                        |
| AC2.1, AC2.2 | `src/actions/actions.test.ts`                                                                                                            |
| AC2.3–AC2.5  | `src/actions/apply.test.ts`; wiring in `e2e/actions.spec.ts`                                                                             |
| AC2.6        | `src/actions/pipeline.test.ts`; proven by two temporary violations (see step 2 below)                                                    |
| AC2.7        | All Phase 1 and Phase 2 tests in test mode pass unchanged; the adapted start-screen tests are listed under step 4                        |
| AC2.8        | `src/actions/apply.test.ts` (10 000 actions through `LocalSession`; measured about 0.0005 ms per action)                                 |
| AC3.1–AC3.3  | `src/save/saveFormat.test.ts`                                                                                                            |
| AC3.4        | `src/save/WorldStore.test.ts`                                                                                                            |
| AC3.5        | `src/game/autosave.test.ts`                                                                                                              |
| AC3.6–AC3.11 | `e2e/save.spec.ts`, one test each                                                                                                        |
| AC4.1–AC4.9  | `e2e/worldMenu.spec.ts`, one test each (AC4.8 twice: granted and rejecting; AC4.9 at 640 × 360 and 1280 × 800)                           |
| AC4.10       | `e2e/ui.spec.ts` (pointer lock from "Create and play", "Click to continue" and the list's play button), `e2e/touch.spec.ts` AC1.4, AC1.5 |
| AC4.11       | `e2e/worldMenu.spec.ts` (`world-menu`), `e2e/ui.spec.ts` (`pause-screen`), reviewed by eye                                               |
| AC5.1        | `e2e/fullscreen.spec.ts` (five tests, stubbed API)                                                                                       |
| AC5.2        | `e2e/soak.spec.ts`                                                                                                                       |
| AC5.3        | `src/util/repoHygiene.test.ts` (eleven images, no protected names); new tiles, block names and all menu texts were read for hard rule 1  |
| AC5.4        | `README.md`, section "Worlds and saving"                                                                                                 |
| AC5.5        | `CLAUDE.md`                                                                                                                              |
| AC5.6        | This file                                                                                                                                |
| AC5.7        | CI and the pull request; see the pull request itself                                                                                     |

**Screenshots reviewed by eye:** `rocky-hill` (a grey hilltop of stepped stone, a coal
vein of several blocks with black nuggets about ten blocks ahead, no stripes or
checkerboards), `overview-noon` (the rock face of the hill south of the start point with a
ragged border to the grass), `spawn-noon`, `shore`, `world-menu` (two worlds, the newer one
selected), `pause-screen` (continue button, "Save and back to worlds", "Saved" next to the
seed), an atlas preview of all 16 tiles, and ad-hoc screenshots of the world list, the
form and the pause menu at 640 × 360. Found this way: the list kept the old selection
instead of preselecting the newest world, and `pause-screen` had silently kept its old
picture (see "Known issues").

## Decisions and deviations

Where the plan left a detail open, the simplest option was chosen.

### Step 1 – Terrain, generator version 1

| Topic                 | Decision                                                                                                                                                                                                                                                                                  | Why                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| "Land column" (rock)  | A column whose ground is at or above sea level (`h >= SEA_LEVEL`), beaches included. Columns under water are never rock, also when they are steep                                                                                                                                         | Plan 5.3 says "a land column"; AC1.5 is tested for land columns only                                                                           |
| Rock line             | `ROCK_HEIGHT` 80 + noise × 4 (scale 1/64) + a per-column jitter of ±1 block. The jitter is the fallback of section 8 against hard edges; the line stays inside 75–85, so AC1.5 (rock from 88, none below 72) holds. `ROCK_HEIGHT` and `ROCK_SLOPE` are the plan's values                  | Judged by eye on `rocky-hill` and `overview-noon`: the border between grass and rock is ragged, not a contour line                             |
| Ore veins             | Space is divided into cells of 6 × 6 × 6 blocks. A hash of the cell decides whether it holds a vein (coal 40 %, iron 20 % of the cells), its origin and its size (3 to 10 blocks, uniform). The vein is a random walk inside the 5 × 5 × 5 box around the origin; ore replaces stone only | A pure function of seed and coordinates; a chunk evaluates every cell whose vein can reach it, so veins cross borders without any shared state |
| Ore on rock           | Veins also replace the stone of bare rock, including its surface. Iron (y 4–44) never reaches a land surface, so visible ore is coal                                                                                                                                                      | Plan 5.3: "Ores replace stone only"; change 9: "bare stone with visible ore"                                                                   |
| Clay patches          | Cells of 12 × 12 columns; 42 % hold a round patch of radius 2 to 4.5 with a ragged rim. Clay replaces the top two blocks of the bed where the water is at least 2 deep                                                                                                                    | Same technique as the veins; measured 7–10 % of the underwater columns                                                                         |
| Spawn                 | The spawn column must be grass: above the beach band and not rock (Phase 1: any dry column). The spawn of seed 1337 did not move                                                                                                                                                          | AC1.5: "the spawn column of 20 seeds is grass"                                                                                                 |
| Height cache          | `Terrain` keeps the column heights of up to 512 recently generated chunks. The slope rule needs the heights of the columns around a chunk; with the cache every column is computed once. It never changes results (AC1.4 generates chunks in different orders and alone)                  | Without it the slope rule alone cost 9 % (64 extra columns per chunk)                                                                          |
| Terrain cache         | `getTerrain` keeps the generators of the last 4 seeds (Phase 1: one)                                                                                                                                                                                                                      | Switching between worlds (step 3) must not rebuild noise tables each time                                                                      |
| AC1.10 (speed)        | The test generates the same contiguous 7 × 7 chunks with a fresh generator once with and once without rock, ores and clay (`TerrainFeatures`, for tests and dev tools only) and compares the best of 40 rounds: version 1 must be below 1.2 × the Phase 1 terrain                         | A limit relative to a number recorded on another machine would be flaky; "without the features" is exactly the Phase 1 generator               |
| "Plain generation"    | In AC1.3 this is version 1 without the ore pass (rock and clay included)                                                                                                                                                                                                                  | On bare rock ore replaces stone that the Phase 1 terrain does not have                                                                         |
| Checksum              | `terrainChecksum(seed, version)` in `terrain.ts`; the recorded value for seed 1337 is `884517734` (`src/testing/terrainChecksum.ts`, used by the unit test and the browser test). Test API: `__mc.terrainChecksum()`                                                                      | AC1.1, AC1.2; Phase 4 will use it in the handshake                                                                                             |
| Block names           | `coal_ore`, `iron_ore`, `clay`; tiles 13–15. `BlockDef.slot` is `null` for them (cannot be placed in Part A)                                                                                                                                                                              | Plan 5.3                                                                                                                                       |
| AC1.12 (label test)   | In test mode the block name label does not hide by real time (`Hud` option `keepLabel`). The test itself is unchanged and passed 20 times in a row (`--repeat-each=20`)                                                                                                                   | The second option the plan offers; no assertion had to change                                                                                  |
| References            | All seven WebGL references and `touch-controls` were regenerated. Only `overview-noon` really changed (a rock face on the right); the others showed the same picture as before, because the literal gradient table moved no block near the start point of seed 1337                       | AC1.13                                                                                                                                         |
| Phase 1 tests adapted | `blocks.test.ts` (15 blocks, names may contain `_`), `terrain.test.ts` ("uses the specified layers" skips rock columns and accepts ore and clay), `repoHygiene.test.ts` (10 images), all `generateChunk` callers pass the version                                                         | Inherent in the step                                                                                                                           |

Measured in step 1 (cloud container, Node 22): Phase 1 terrain 0.21–0.27 ms per chunk,
generator version 1 0.23–0.29 ms per chunk, +9 % to +12 % in direct comparison (`npx
vite-node scripts/terrainStats.ts`). Meshing costs about 5.6 ms per chunk and dominates.
Before the optimisations (hash per walk step, branches on random directions, no height
cache) version 1 was 64 % slower.

### Step 2 – Action layer

| Topic                | Decision                                                                                                                                                                                                                                                                                                                             | Why                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Slot numbers         | Actions and the `PlayerRecord` count bar slots from 0 (plan 5.2: "slot 0–8"). The keys, the HUD and `getState().selectedSlot` keep counting from 1                                                                                                                                                                                   | Existing tests read `selectedSlot` 1–9 (AC2.7: unchanged assertions)                                            |
| Coordinates          | `decodeAction` accepts integers up to ±2 147 483 647. A `y` outside 0–127 is decoded and then refused by `applyAction` with `invalid`                                                                                                                                                                                                | The height range is a rule about the world, the integer check a rule about the data                             |
| `PlayerRecord`       | Lives in `src/actions/playerRecord.ts`: 36 slots of `{ item, count }` or `null`, `selectedSlot`, `breaking`. A Creative record starts with the nine Phase 1 blocks in slots 0–8 (count 1, never used up). `src/items/` is created by Part B, as the plan lists                                                                       | Part A needs the record for the action context and the save file, but no inventory logic                        |
| Placeable            | `isPlaceable(id)`: a solid, breakable block. Coal ore, iron ore and clay would be accepted by the rule but are in no bar slot in Part A                                                                                                                                                                                              | "The slot holds a placeable block"; Part B's inventory can hold them                                            |
| Reasons used         | `reach`, `unbreakable`, `occupied` (cell not replaceable, or inside a player box), `missing` (empty slot), `invalid` (malformed action, `y` out of range, slot holds something that cannot be placed)                                                                                                                                | Plan 5.2 lists the identifiers; the mapping to cases was open                                                   |
| Session decodes      | `LocalSession.submit` runs `decodeAction` on everything it is given and answers `invalid` otherwise                                                                                                                                                                                                                                  | One check for the game, the test API and later the network                                                      |
| `submit` in test API | Added already in step 2 (`__mc.submit(action)` returns the result)                                                                                                                                                                                                                                                                   | Needed to test the wiring in the browser; plan 6.3 lists it                                                     |
| AC2.6                | Source-scan test `src/actions/pipeline.test.ts`: calls of `.setBlock(` are allowed once in `src/actions/Session.ts` and once in `src/game/Game.ts` (the test API tool). Proven by two temporary violations: a call in a new file `src/ui/violation.ts` and a second call in `Game.ts`; the test failed both times and names the file | Plan 5.2 offers a lint rule or a source-scan test; the scan also limits the number of calls in the allowed file |
| `mode` URL parameter | Not read in Part A; every world is Creative                                                                                                                                                                                                                                                                                          | Plan section 3: the choice appears with Part B                                                                  |

### Step 3 – Save format, stores, autosave, loading in place

| Topic                 | Decision                                                                                                                                                                                                                                                          | Why                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Records               | Plain JSON-compatible objects. World record: the fields of plan 5.4 (`pose` = x, y, z, yaw, pitch; `moveMode`; `player` = the `PlayerRecord`). Chunk record: `key` (`<world id>\|<cx>,<cz>`), `worldId`, `cx`, `cz`, `edits` as a flat array of pairs (index, id) | A later network snapshot (Phase 4) can send the same records                               |
| IndexedDB layout      | Database `markuscraft` version 1; store `worlds` (key `id`), store `chunks` (key `key`, index `worldId`). A chunk record is replaced as a whole when the chunk is dirty                                                                                           | Plan 5.4                                                                                   |
| World id              | `w<time in base 36>-<two random 32-bit numbers in base 36>`, made by the shell (`makeWorldId` is pure, time and random numbers come in)                                                                                                                           | No dependency; ids match `[A-Za-z0-9_-]{1,64}`                                             |
| Seed text             | Digits (optionally with a minus sign, up to 15 digits) are the number, wrapped to 32 bits as `?seed=` always did; any other text is hashed with 32-bit FNV-1a over its UTF-16 units                                                                               | Plan 5.4; a minus sign keeps old `?seed=-1` links meaning the same                         |
| Names                 | Control characters (Unicode class Cc) removed, trimmed, cut to 24 characters (code points), trimmed again. A stored name that is not in this form makes the record damaged                                                                                        | Plan 5.4                                                                                   |
| Unknown generator     | A record with a generator version this build does not know is listed as "saved by a newer version", like a higher format version                                                                                                                                  | It can only come from a later build                                                        |
| One bad chunk         | A chunk record that fails validation makes the whole world damaged                                                                                                                                                                                                | Simplest; a world with silently missing edits would be worse                               |
| Break in progress     | Saved as `null`                                                                                                                                                                                                                                                   | The action clock (simulation time) restarts at 0 when a world is opened                    |
| Meta dirty            | The world record is marked dirty by every simulation step, every look movement, a slot change and the test tools `setPlayer` / `setTime`. In normal play it is therefore written every 5 s; in test mode only after a change                                      | Pose and time of day are part of the record                                                |
| Autosave clock        | Real time (`performance.now()`), also in test mode                                                                                                                                                                                                                | AC3.7 waits 8 real seconds without simulation steps                                        |
| Retry                 | After a failed write everything stays dirty and the next attempt comes one interval after the failed write started. `flush` (pause, hide, exit, `__mc.save()`) never rejects                                                                                      | Plan 5.4                                                                                   |
| `test=1` without save | Uses a `MemoryStore`: the same autosave path runs, nothing reaches IndexedDB (AC3.10 checks `indexedDB.databases()`)                                                                                                                                              | One code path for both                                                                     |
| `save=1` and `time`   | For a stored world the saved time of day wins over `?time=`; the parameter sets the time of a newly created world                                                                                                                                                 | AC3.6 restores the time                                                                    |
| Placeholder world     | Until a world is open, `Game` holds an empty placeholder world (seed 0) whose chunk manager never starts; `isReady()` is false and only the sky is drawn                                                                                                          | `save=1` loads asynchronously, and from step 4 the menu is shown before any world exists   |
| Test API additions    | `getState()`: `mode`, `world`, `save { dirty, lastError, lastSaveMs, lastLoadMs }`, `inventory { slots, selected }`. New: `save()`, `openWorld(name, seed)` (saves, then opens or creates the named world in place). `breaking` and `ui` follow in Part B         | `openWorld` is what AC3.9 switches worlds with; the two durations are what AC3.11 measures |
| Step 3 start screen   | Without `test=1` the game still opened a new unsaved world behind the old start screen; step 4 replaces that                                                                                                                                                      | "No menu yet"                                                                              |

Measured in step 3 (headless Chromium in the cloud container): a world with 50 000 edits
in 200 chunks was written in 27 ms and loaded (read, validated, world opened) in 49 ms.

### Step 4 – World menu

| Topic                    | Decision                                                                                                                                                                                                                                           | Why                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Screens                  | Outside test mode there are four states: world menu, settings page, pause menu, playing. Until a world is chosen none is open and only the sky is drawn behind the menu                                                                            | Plan 5.4: the world menu replaces the single play button                                                           |
| Settings page            | "Settings" in the world menu opens the existing pause screen without its world parts: no continue button, no seed, no link; the button reads "Back to worlds". In touch mode the fullscreen button moves next to it                                | "Opens the existing settings and controls page"                                                                    |
| Pause menu               | "Save and back to worlds" sits beside the continue button; "Saved" / "Saving…" stands next to the seed. If saving failed, the line reads "Saving failed. Free up storage space." and the world is **not** closed by "Save and back to worlds"      | Leaving would throw the unsaved changes away                                                                       |
| Mouse capture            | A play button of the world menu requests the pointer lock at once, inside the click, and loads the world afterwards. If the lock is not there when the world is, the pause menu shows with its play button                                         | Browsers grant the lock only for a user gesture; the player is never left without a way on (fallback of section 8) |
| List                     | Rows are buttons; the first (most recently played) row is preselected every time the list is shown. Date format: "Jul 5, 2026" (fixed English, like all in-game text)                                                                              | Plan 5.4                                                                                                           |
| "Last played"            | Starting a world from the menu marks its record dirty, so the date changes also when the player does nothing in it                                                                                                                                 | Found by the AC4.2 test: a world that was only opened did not move to the top                                      |
| Seed of a new world      | Random per world when the field is empty. `?time=` in the address sets the time of day of worlds created during that visit                                                                                                                         | Seeds now belong to worlds, not to the page visit                                                                  |
| Seed link                | `?seed=<n>` opens the "New world" form with the seed; with stored worlds a "Back" button leads to the list                                                                                                                                         | Plan 5.4                                                                                                           |
| Tab lock                 | Web Locks, name `markuscraft-world-<id>`, taken when a world is opened or created from the menu and released by "Save and back to worlds" or by closing the tab. Deleting also needs the lock. `test=1&save=1` and `__mc.openWorld` do not take it | Change 13 of the plan; test mode stays free of it                                                                  |
| Persistence request      | `navigator.storage.persist()` once per page visit, after the first world created in that visit; the answer and a rejection are ignored                                                                                                             | AC4.8                                                                                                              |
| No IndexedDB             | The menu shows "Worlds cannot be saved in this browser window." and worlds live in memory until the page closes                                                                                                                                    | Fallback of section 8                                                                                              |
| Damaged and newer worlds | Listed after the playable ones with "Damaged" or "Saved by a newer version"; the play button is disabled for them. A newer world can be deleted too                                                                                                | Plan 5.4 says a damaged world "can only be deleted"; nothing forbids deleting a newer one                          |
| Phone layout             | Below 480 px of height the list shows about two rows and scrolls; the form has no heading. Everything else fits 640 × 360 without scrolling the page                                                                                               | Layout rules of Phase 2                                                                                            |
| Shared button code       | `src/ui/activate.ts` holds the "which pointer pressed this button" logic that the pause screen had, now used by both menus                                                                                                                         | Mode selection by pointer type must work from the new buttons (AC4.10)                                             |

Existing browser tests adapted for the new start flow (AC4.10):

- `ui.spec.ts`: "the start screen is shown on load …" became "the pause screen shows the
  controls and the simulation stands still" (the world menu is shown first; the pause
  screen checks run after creating a world and pausing); "clicking play captures the mouse
  …" starts from "Create and play" and additionally checks "Click to continue" and the
  list's "Click to play"; "settings apply live …" creates a world before counting chunks
  and continues it after the reload; "matches the pause screen reference" pauses a created
  world. "seeds are random per visit unless given in the URL (AC11.4)" was removed: its
  content is now `worldMenu.spec.ts` AC4.2 and AC4.5.
- `touch.spec.ts`: "Tap to play starts the game …" (AC1.4) and "in mouse mode no touch
  control is in the document" (AC1.5) start through the world menu's buttons.
- `touchLayout.spec.ts`: AC3.1 checks the pause menu's buttons after opening it with the
  menu button (now four: continue, back, copy link, fullscreen); AC3.2, AC3.4 and AC3.5
  create a world by tap first. The world menu's own layout is AC4.9 in `worldMenu.spec.ts`.
- Step 5: the touch tests that start through the menu (`touchLayout.spec.ts`, AC1.4 in
  `touch.spec.ts`, AC4.9) run in a browser "without fullscreen" (`withoutFullscreen` in
  `e2e/touch.ts`). With the new rule a tap on a play button really entered fullscreen in
  headless Chromium, whose window can then not be resized, and the menu button read "Exit
  fullscreen". The rule itself is tested in `fullscreen.spec.ts` with a fake API.
- Test-mode tests (`test=1`) were not changed.

Test robustness (found while running the whole suite with three workers): under software
WebGL three parallel browsers render at 1 to 7 frames per second. AC3.11 therefore takes
the best of up to three saves and loads (alone: 27 ms and 49 ms; under load one save took
2.8 s), menu tests store a render distance of 2 before they start and have a timeout of
three minutes, and a yaw check after a real click resets the yaw first, because the
captured mouse may have turned the view.

### Step 5 – Fullscreen, hardening

| Topic             | Decision                                                                                                                                                                                                                                    | Why                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Which buttons     | "Create and play", the list's play button and "Tap to continue". Pressing Enter in the form counts too                                                                                                                                      | Plan 5.4: "a play or continue button"                                             |
| "Exit fullscreen" | Only the menu's own "Exit fullscreen" button counts as the player's choice. If fullscreen ends another way (system back gesture), the next play button asks again                                                                           | The plan names the button                                                         |
| Orientation       | For 500 ms after a fullscreen change a portrait-shaped view does not show the rotate overlay or pause; the view is checked again afterwards                                                                                                 | Fallback of section 8, built in from the start because it cannot be seen headless |
| Tests             | The fullscreen API is replaced by a recording fake (works, rejects, throws, missing). "Inside the tap's event handler" is checked through `window.event.type === 'click'` and `navigator.userActivation.isActive`                           | Headless fullscreen is unreliable (Phase 2 report)                                |
| Soak              | 500 seeded actions (40 % place, 40 % break, 10 % slot, 10 % junk) around a hovering player, a switch to a second world and back after 250, a real 5.5 s wait for the autosave, then a reload and a block-by-block comparison of 2 925 cells | AC5.2                                                                             |

## Measured numbers

| Measurement                               | Result                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| Production bundle                         | 630 kB JavaScript (Phase 2: 599 kB), 10 kB CSS (Phase 2: 7 kB)                            |
| Unit tests                                | 218, about 9 s; line coverage of the pure core 98.7 %                                     |
| Browser tests                             | 83, about 5 minutes with 3 workers                                                        |
| Chunk generation (Node)                   | Phase 1 terrain 0.21–0.27 ms, version 1 0.23–0.29 ms per chunk (+9–12 %)                  |
| Chunk meshing (Node)                      | about 5.6 ms per chunk (unchanged; it dominates loading)                                  |
| Validate and apply one action             | about 0.0005 ms                                                                           |
| Save 50 000 edits in 200 chunks           | 27 ms                                                                                     |
| Load that world (read, validate, open)    | 49 ms                                                                                     |
| Ore and clay over five seeds × 256 chunks | coal 1.15–1.22 %, iron 0.54–0.60 % of the stone; clay 7.3–9.1 % of the underwater columns |
| Rock                                      | 0.7–9.8 % of the land columns, depending on how hilly the seed is                         |

Frame rates could not be measured: the cloud container has software WebGL only (1 to 7
frames per second with three browsers in parallel). The frame rate on real devices is item
5 of the manual list and decides about Part D.

## Known issues

- **Nothing was tried on a real device or in a real browser window.** Saving across a
  browser restart, real fullscreen and the on-screen keyboard are on the manual list.
- **Text-only references are compared loosely.** `pause-screen` and `world-menu` use
  `maxDiffPixelRatio` 0.05 (CI has another system font). That is loose enough that the
  new "Save and back to worlds" button and the "Saved" text did not fail the old
  `pause-screen` reference; it had to be regenerated with `--update-snapshots=all`. The
  rule-based tests check the buttons and texts, so nothing went unnoticed, but a reference
  comparison of a menu proves little. `CLAUDE.md` says how to regenerate.
- **A world whose saving fails cannot be left by "Save and back to worlds".** The pause
  menu shows "Saving failed. Free up storage space." and stays; the player can free space
  and try again, or close the tab and lose the unsaved changes.
- **"Saving…" shows most of the time while playing**, because the player's pose is part of
  the world record. The line matters in the pause menu, where it turns to "Saved" after a
  moment.
- **Two worlds may have the same name.** The form proposes a free default name but does
  not forbid a taken one. `__mc.openWorld` and `world=` open the first world with a name.
- **The world list shows dates in English** ("Jul 5, 2026"), like all in-game text.
- **Up to 5 s of play can be lost** if the browser kills the page without the `pagehide`
  or `visibilitychange` event, or before the write started there completes (plan,
  section 8).
- **AC1.10 is a relative limit measured in a busy test run.** It takes the best of 40
  rounds and had about 8 points of margin; if it ever fails on a slow CI machine, it is
  the test's noise and not a slower generator (compare with `scripts/terrainStats.ts`).
- **One unexplained failure**: "Phase 3 AC4.2" (list order after playing an older world)
  failed once right after a rebuild and passed 7 times in a row afterwards, alone and in
  parallel. If it shows up in CI, the place to look is the write of `playedMs` between
  pausing and "Save and back to worlds".
- Iron ore never shows on the surface (it lies below sea level); it is found by digging.
- Browsers without the Web Locks API skip the two-tab check; browsers without IndexedDB
  play without saving. Neither was tested on a real browser of that kind.

## For the owner to try

Open the deployed game after merging. Each item says what to look for.

1. **Worlds survive.** Create a world, build something, press Esc (or the menu button)
   and wait for "Saved". Close the browser completely and open the game again: the world
   is in the list with today's date and the building is there. Repeat after restarting the
   computer, and once on the phone and the tablet after a reboot.
2. **Closing without pausing.** Build something, then close the tab right away (no pause).
   Reopen: at most the last few seconds are missing.
3. **Fullscreen on the Android phone and tablet.** Tapping "Create and play" or "Tap to
   play" hides the address bar. After "Exit fullscreen" in the menu, "Tap to continue" does
   not enter fullscreen again; the "Fullscreen" button still does. Does the rotate overlay
   flash when fullscreen starts? (It should not.)
4. **The "New world" form with the on-screen keyboard.** Tap the name field: the keyboard
   opens, the field stays visible, typing works, and "Create and play" can be reached
   (close the keyboard if it covers the button; tell me if that is annoying). Does the
   rotate overlay appear while the keyboard is open?
5. **Frame rate and hitches – this decides whether Part D (Web Workers) is started.**
   Switch on "Debug overlay" in the menu. Walk and then fly fast in a straight line for a
   minute at render distance 5 and at 8, on the phone, the tablet and the computer. Note
   the FPS while standing and while flying, and whether the picture stutters when new
   terrain appears at the horizon.
6. **The look of rocky hills.** Fly to a hill: is the change from grass to rock natural?
   Are the black nuggets of coal ore easy to spot from some blocks away? Dive into a lake:
   is the blue-grey clay recognisable?
7. **The world list.** Several worlds: the one played last is on top and selected. On the
   phone the list scrolls with a finger; a tap selects a row.
8. **Delete.** "Delete" asks "Delete this world for ever?"; "Keep" keeps it.
9. **Two tabs.** Open the game in a second tab and try to play the world that is open in
   the first: "This world is open in another tab."
10. **A seed link.** In the pause menu, "Copy link to this world"; open the link in a new
    tab: the form shows the seed, and the new world has the same terrain (without the
    buildings).
11. **A private window.** The game either saves until the window is closed or says "Worlds
    cannot be saved in this browser window."
12. **Old habits still work:** mouse capture on "Click to play" and "Click to continue",
    Esc pauses, the touch controls of Phase 2.

## Suggestions for Part B

- `PlayerRecord` already has the 36 slots and is saved; Part B adds `src/items/` with the
  inventory functions and lets `place` take an item in Gathering. `createPlayerRecord`
  already returns an empty record for `gathering`.
- The `mode` URL parameter and the mode choice in the form are not there yet: add `mode`
  to `GameParams`, to `newWorldMeta` and to `WorldMenu`'s form (`onCreate` gets a third
  value). `WorldMeta.mode`, the list's mode column and `getState().mode` exist.
- The HUD still draws the bar from `HOTBAR_BLOCKS`; it should draw
  `session.record.slots` in `onPlayer`. `Game.onActionResult` is the place for notices.
- Timed breaking needs `ctx.mode`, `record.breaking` and `nowMs`, which `applyAction`
  already receives. The session clock is `simSteps * 1000 / 60` and restarts at 0 when a
  world is opened, which is why `breaking` is saved as `null`.
- AC6.9 needs a fixture record "saved by Part A": take one from `encodeMeta` of this
  branch (format version 1) and keep it as a literal in the test.
- The inventory screen is a fifth screen state next to `worlds`, `settings`, `pause` and
  `play` in `Game.showScreen`; unlike the others it must not pause.
- Keep menu tests light (see "Headless testing" in `CLAUDE.md`): several worlds per test
  are slow under software rendering.
- If the owner's device test shows hitches, Part D should move meshing (5.6 ms per chunk)
  to workers before generation (0.25 ms).
