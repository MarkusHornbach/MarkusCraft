# Phase 3 plan – Gathering & Crafting

Read `CLAUDE.md`, `docs/phase-1-report.md` and `docs/phase-2a-report.md` first. This plan is
executed autonomously: do not ask the owner questions. Where this plan leaves a detail
open, choose the simplest option and note it in the report of the part being implemented.

**The phase has four parts, each implemented in its own cloud session with its own branch,
report and pull request:**

| Part | Content                                                     | Steps | Report                    | Starts when                                     |
| ---- | ----------------------------------------------------------- | ----- | ------------------------- | ----------------------------------------------- |
| A    | Foundation: final terrain, action layer, saving, world menu | 1–5   | `docs/phase-3a-report.md` | Now, from `main`                                |
| B    | Gathering: game modes, inventory, timed breaking            | 6–9   | `docs/phase-3b-report.md` | After Part A is merged                          |
| C    | Crafting: items, recipes, stations, tools                   | 10–13 | `docs/phase-3c-report.md` | After Part B is merged                          |
| D    | Web Workers for generation and meshing (optional)           | 14–15 | `docs/phase-3d-report.md` | Only if the owner's starting prompt asks for it |

A session implements exactly one part; the owner's starting prompt says which. The
Definition of Done in `CLAUDE.md` applies to each part separately. After each merge the
game on GitHub Pages is playable and the owner tries it on real devices.

Rules for parts B, C and D:

- Precondition: the report of the previous required part exists on the session's branch
  (B needs `phase-3a-report.md`, C needs `phase-3b-report.md`, D needs
  `phase-3a-report.md`). If it does not, write that into the own report, commit it and stop.
- Read the reports of the earlier parts first, in particular "Decisions and deviations".
- Before opening the pull request, merge the current `main` into the branch (fixes from
  the owner's testing may have landed) and run `npm run check:all` again.
- Part D is independent of B and C. The owner starts it only if a real device shows
  hitches while terrain loads (manual list of Part A). If it is never started, Phase 3 is
  complete with Part C.

**Size, estimated honestly.** The whole phase is about two to three times Phase 1. Part A
is the largest and most delicate part (it touches generation, the game loop, the menu and
adds storage); B and C are each about the size of Phase 2 part A plus half; D is small but
risky. Each part has a cut list in section 8 in case a session runs out of room.

## 1. Goal

MarkusCraft becomes a game with a goal. A player creates named worlds that are saved
automatically in the browser. Each world is either a **Creative** world (as today: flying,
unlimited blocks, instant breaking) or a **Gathering** world: no flying, blocks must be
gathered before they can be placed, breaking takes time, and better tools from wood, stone
and iron make it faster. Coal, iron and clay are found in the terrain; a recipe list turns
materials into planks, tools, building blocks, and, next to a furnace, into glass, bricks
and iron. The game stays peaceful: the player cannot lose, be hurt, or lose items.

Everything works with keyboard and mouse and with the touch controls of Phase 2.

Multiplayer (Phase 4) is prepared but not built: every change to the world or to a
player's items is a plain, serialisable action that passes one central layer.

## 2. Decisions made with the owner

| Topic             | Decision                                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase order       | Phase 2 is complete with touch controls. Multiplayer becomes Phase 4 and is re-planned there; personalization becomes Phase 5                               |
| Delivery          | Four parts A–D with separate pull requests; D (workers) is optional and last                                                                                |
| Game mode         | Chosen when a world is created, fixed afterwards, shown in the world list                                                                                   |
| Gathering mode    | Walking and swimming only, limited items, timed breaking, peaceful. Nothing can be lost; night is only darker                                               |
| Creative mode     | As today, plus a palette of all blocks to fill the bar                                                                                                      |
| Worlds            | Several worlds per browser: create (name, optional seed, mode), play, delete. Saved automatically in IndexedDB on this device only                          |
| Data safety       | No export/import. The game asks the browser for persistent storage and the menu says that worlds live on this device                                        |
| Terrain           | Finalised in Part A before the first world is saved: rocky hills, coal and iron ore, clay, cross-browser noise table. Each world stores a generator version |
| Item pickup       | A broken block's item goes straight into the inventory. If there is no room, the block cannot be broken. No items lie in the world                          |
| Inventory         | 36 slots (9 bar + 27), stacks up to 99, tools do not stack. A bin slot discards items                                                                       |
| Tools             | Pickaxe, axe, shovel in wood, stone, iron: 2×, 4×, 8× faster on their blocks. No wear                                                                       |
| Tool gating       | Stone and coal ore yield their item only with a pickaxe, iron ore only with a stone or iron pickaxe. Everything else can be gathered by hand                |
| Crafting          | A recipe list, no grid. Craftable recipes come first; others are greyed out with the missing ingredients marked                                             |
| Stations          | Workbench and furnace are placeable blocks. Standing within reach of one unlocks its recipes. They store nothing                                            |
| Smelting          | A furnace recipe that also needs coal; a short progress bar per item in the recipe list                                                                     |
| New blocks        | Coal ore, iron ore, clay (terrain); workbench, furnace, stone bricks, iron block (crafted)                                                                  |
| Fullscreen        | In touch mode, starting or continuing a world by tap enters fullscreen where the browser allows it                                                          |
| Network readiness | One action layer (`src/actions/`), no network code                                                                                                          |

## 3. Changes to the original scope

The owner's starting scope was challenged during planning. Agreed changes:

| #   | Change                                                                                                                                                                                | Reason                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Web Workers move from "an early step" to an optional last part D, started only when a real device shows hitches                                                                       | No device measurement exists. Workers are the riskiest refactoring and add no gameplay; nothing else in the phase depends on them                                                                                                               |
| 2   | The phase is delivered in parts A, B, C (and D) with separate pull requests                                                                                                           | The scope is two to three times Phase 1; the game is deployed from `main` only, so each part can be tried on devices before the next starts                                                                                                     |
| 3   | The furnace is a station that unlocks smelting recipes, not a block with slots that smelts over time. Added: a workbench with the same rule                                           | A furnace with contents needs saved per-block state, must keep running in unloaded chunks and must later be synchronised between players. A station needs none of that                                                                          |
| 4   | Tools have no durability                                                                                                                                                              | A breaking tool is the most common frustration for a child in this genre; it also needs per-item state in inventory and save file                                                                                                               |
| 5   | Added: gating. Stone and coal ore need a pickaxe, iron ore a stone pickaxe                                                                                                            | Gives the tiers a purpose beyond speed, with a clear order of goals                                                                                                                                                                             |
| 6   | Broken blocks go straight into the inventory; a full inventory blocks breaking; a bin slot discards items                                                                             | No item objects to render, save and synchronise; nothing can get lost                                                                                                                                                                           |
| 7   | Added: Creative mode gets a block palette                                                                                                                                             | The fixed bar of nine blocks could not reach the new blocks                                                                                                                                                                                     |
| 8   | Ores are generated already in Part A, together with the literal noise gradient table that the multiplayer plan (Phase 2 plan, step 5) asked for. Added: a generator version per world | Saving freezes the generator: a later change would alter blocks under existing builds. `Math.sin`/`Math.cos` are not bit-identical across browser engines, which matters for multiplayer and is cheapest to fix before the first world is saved |
| 9   | Added: hilltops and steep slopes are bare stone with visible ore; coal is common and starts right under the soil                                                                      | Today stone is never visible; without caves, ores could only be found by digging blindly                                                                                                                                                        |
| 10  | Added: clay in lake beds (smelted into bricks), stone bricks and iron block                                                                                                           | Bricks get a natural source and diving gets a purpose; iron gets a use beyond three tools                                                                                                                                                       |
| 11  | The game mode is fixed at creation                                                                                                                                                    | One rule; no questions about what happens to an inventory on a switch                                                                                                                                                                           |
| 12  | Added: request for persistent storage and a one-line hint in the world menu (export/import stays out of scope)                                                                        | Reduces the risk that the browser evicts a child's worlds                                                                                                                                                                                       |
| 13  | Added: a world that is open in another tab cannot be opened a second time                                                                                                             | Two tabs would overwrite each other's saves                                                                                                                                                                                                     |
| 14  | Added: the recipe list shows craftable recipes first and marks missing ingredients                                                                                                    | A child sees what to gather next                                                                                                                                                                                                                |
| 15  | Added: the timing-dependent Phase 1 browser test (block name label, Phase 1 AC9.4) is fixed in Part A                                                                                 | It was reported as a known issue in the Part A report of Phase 2 and gets more likely as the test count grows                                                                                                                                   |

Proposed and declined by the owner: a "Back to start point" button in the menu.

Clarifications, stated so nobody is surprised:

- **Worlds created in Part A are Creative worlds.** The mode is part of the saved data from
  Part A on, but the choice between Creative and Gathering appears in the "New world" form
  only with Part B, when Gathering actually differs.
- **Between Part B and Part C, Gathering has no tools.** Every block, stone and ore
  included, yields its item by hand, slowly. The gating of decision "Tool gating" starts
  with Part C. Worlds and inventories carry over.
- **The world behind a `?seed=` link is no longer opened directly.** The link opens the
  "New world" form with that seed filled in.
- **Opening the inventory does not pause the world** (the pause menu still does). This is
  how it will have to work in multiplayer.

## 4. Out of scope (do not build)

Multiplayer and any network code (no transport, no sessions other than the local one, no
protocol envelope), health, hunger, fall damage, creatures, caves, light propagation,
torches, biomes, a crafting grid, graphics fixes (anti-aliasing, leaves, water), sound,
export/import of worlds, cloud saves, items lying in the world, throwing items, chests,
block state (a furnace with contents), tool durability, enchantments or repairs, armour,
farming, saplings and regrowth, splitting stacks, dragging items, renaming worlds or
changing their mode, world thumbnails, a "back to start point" button, a portrait layout,
gamepad controls, installing as an app (PWA). Part D only: no `SharedArrayBuffer`, no
OffscreenCanvas, no generation changes.

## 5. Specification

All numbers are starting values in `src/game/config.ts` and may be tuned; record changes
in the report. Acceptance criteria refer to the final values.

### 5.1 Architecture

```
src/actions/             pure core: unit-tested in Node, in the coverage scope
  actions.ts             Action types, decodeAction() with full validation
  apply.ts               applyAction(): validate against world + player record → result
  Session.ts             Session interface + LocalSession (the only implementation)
src/items/               pure core
  items.ts               item table (blocks are items; non-block items from id 256)
  inventory.ts           slots, stacks, add / remove / move / count
  hardness.ts            break time by block, tool class and tier; drop table      (B, C)
  recipes.ts             recipe table, craftable(), missing()                       (C)
src/save/                pure core
  saveFormat.ts          WorldMeta + chunk edits ⇄ plain records; versions, validation
  WorldStore.ts          WorldStore interface + MemoryStore
src/game/idbStore.ts     WorldStore on IndexedDB (shell)
src/game/autosave.ts     decides when to write what (pure logic, time as parameter)
src/world/generation/    ores.ts, clay and rock rules in terrain.ts, GENERATOR_VERSION
src/render/textures/     tiles.ts (new tiles), itemIcons.ts (painters for non-block items)
src/render/BreakOverlay.ts   cracks on the block being broken                       (B)
src/ui/                  WorldMenu.ts, InventoryScreen.ts (B), RecipeList.ts (C)
src/game/chunkWorker.ts, src/world/chunkJobs.ts                                     (D)
```

- `src/actions/`, `src/items/` and `src/save/` join the pure core: add them to the ESLint
  boundary rule and to the coverage scope. Time reaches them as a parameter.
- **One pipeline.** `Game` and the UI never change blocks, inventories or the selected
  slot themselves. They build an action and hand it to the `Session`; the world and the
  screen change when the session reports the result.
- **Stable ids.** Block ids and item ids are written into save files. From Part A on, the
  block table and the item table are append-only: an id is never reused or renumbered. A
  unit test pins the existing ids.

### 5.2 Action layer

An action is a plain object `{ kind, ... }` that survives `JSON.stringify` → `JSON.parse`
unchanged: integers, finite numbers and short strings only.

| Kind         | Fields          | Part | Effect when valid                                                                 |
| ------------ | --------------- | ---- | --------------------------------------------------------------------------------- |
| `selectSlot` | `slot` 0–8      | A    | Sets the selected bar slot; cancels a running break                               |
| `break`      | `x, y, z`       | A    | Removes the block (water rule of Phase 1). Gathering: adds the drop               |
| `place`      | `x, y, z, slot` | A    | Places the block held in that bar slot. Gathering: removes one item               |
| `startBreak` | `x, y, z`       | B    | Gathering: remembers cell and start time for the acting player                    |
| `moveStack`  | `from, to`      | B    | Moves a stack to an empty slot, merges equal items up to the stack size, or swaps |
| `discard`    | `slot`          | B    | Empties the slot (bin)                                                            |
| `setBarSlot` | `slot, item`    | B    | Creative only: puts a block into a bar slot                                       |
| `craft`      | `recipe`        | C    | Removes the ingredients, adds the result once                                     |

- `decodeAction(value: unknown)` returns an action or an error and never throws. It checks
  the kind, every field's type and range, and rejects extra fields.
- `applyAction(ctx, action, nowMs)` is one pure function. `ctx` gives read access to the
  world, the world's mode, and the acting player's pose and `PlayerRecord`
  (`slots`, `selectedSlot`, `breaking`). It returns either
  `{ ok: true, blocks: [...], player: <new record or null>, notices: [...] }` or
  `{ ok: false, reason }`. It changes nothing itself.
- Rules for every block action: integer coordinates inside the height range; the block
  centre within `REACH + REACH_TOLERANCE` (5 + 1.5) of the actor's eye.
  - `place`: the slot holds a placeable block, the cell is replaceable and intersects no
    player box.
  - `break` in Creative: the Phase 1 rule (`breakResult`).
  - `break` in Gathering: additionally the same cell as the last `startBreak`, the selected
    slot unchanged since then, `nowMs - startMs ≥ required − BREAK_TOLERANCE_MS` (100),
    and room in the inventory for the drop (reason `full`).
  - `craft`: the recipe exists, the ingredients are present, the result fits, and a
    required station block lies within `STATION_REACH = 5` of the actor's eye.
- Reasons are short identifiers (`reach`, `unbreakable`, `occupied`, `full`, `early`,
  `missing`, `station`, `mode`, `invalid`); the UI maps them to texts.
- `Session`: `submit(action)`, the confirmed `PlayerRecord`, and a listener with
  `onBlocks`, `onPlayer`, `onResult`. `LocalSession` validates and applies synchronously
  and calls the listener before `submit` returns. The interface does not promise that:
  callers must not read the result from the return value, so that a session which answers
  later (Phase 4) fits without changes.
- The clock: `nowMs` is the simulation time (steps × 1000 / 60). It stands still while the
  pause menu is open and advances only with `__mc.step` in test mode.
- An automated check (lint rule or source-scan test) proves that `World.setBlock` and the
  inventory mutators are called only from `src/actions/`, the world loader and the test API.
- Not needed yet and left to Phase 4: validation in chunks that are not loaded, rate
  limits, several players. `ctx` already takes a list of player boxes (one entry today).

### 5.3 Terrain, generator version 1 (Part A)

Heights, lakes, beaches and trees stay as in Phase 1. Changes:

- **Noise table.** The gradient table of the 2D noise is written with literal values
  (0, ±0.5, ±√3/2 via `Math.sqrt`, ±1) instead of `Math.sin`/`Math.cos`.
- **Rock.** A land column has a stone surface, without soil, when its height is at least
  `ROCK_HEIGHT = 80` (shifted by a low-frequency noise of ±4) or when it differs from one
  of its four neighbours by `ROCK_SLOPE = 3` or more. No trees grow on rock. The spawn
  column is never rock.
- **Ores** replace stone only, as a pure function of seed and world coordinates, so veins
  cross chunk borders without depending on generation order. Veins are connected groups of
  about 3 to 10 blocks.
  - Coal ore: y 12 to 110, about 1.2 % of the stone in that range.
  - Iron ore: y 4 to 44, about 0.6 % of the stone in that range.
- **Clay** replaces the top two blocks of a lake bed in patches, where the water is at
  least 2 deep: about 8 % of underwater columns.
- `GENERATOR_VERSION = 1` is stored in every world. `generateChunk` takes the version; a
  later phase that changes generation adds version 2 and keeps version 1 working.
- New blocks and tiles, painted by code: coal ore, iron ore, clay. In Part A they can be
  broken but not placed (the bar still holds the nine Phase 1 blocks).

### 5.4 Worlds and saving (Part A)

- **Data.** A world is one `WorldMeta` record plus one record per edited chunk.
  `WorldMeta`: `id`, `name` (1 to 24 characters after trimming and removing control
  characters), `seed`, `mode`, `generatorVersion`, `formatVersion`, `createdMs`,
  `playedMs`, time of day, player pose and move mode, `PlayerRecord`. Chunk record: world
  id, chunk coordinates, the edits as pairs of block index and block id.
- **Decoding** validates every field and never throws. A world that cannot be decoded is
  listed as "damaged" and can only be deleted. A world with a higher `formatVersion` is
  listed as "saved by a newer version" and cannot be opened.
- **Store.** `WorldStore`: `list`, `create`, `load`, `saveMeta`, `saveChunks`, `delete`.
  `MemoryStore` for unit tests and for `test=1`; `IdbStore` on IndexedDB (database
  `markuscraft`, object stores `worlds` and `chunks`). No new dependency.
- **Autosave.** Edited chunks and the meta record are marked dirty. They are written when
  `AUTOSAVE_INTERVAL_MS = 5000` have passed since the first unsaved change, when the pause
  menu opens, when the page is hidden (`visibilitychange`, `pagehide`) and when the player
  returns to the world menu. Only dirty chunks are written. A failed write is retried at
  the next interval and shows "Saving failed. Free up storage space." in the menu.
- **Loading in place.** `Game.loadWorld(meta, edits)` replaces world, chunk manager and
  chunk meshes without a page reload and frees the old GPU resources. (A reload would
  leave fullscreen; Phase 4 needs the same method for joining.)
- **Persistent storage.** After the first world is created, the game calls
  `navigator.storage.persist()` once and ignores the answer.
- **Two tabs.** Opening a world takes a lock named after the world id (Web Locks API). If
  the lock is held, the menu shows "This world is open in another tab." Without the API
  the check is skipped.
- **World menu** (start screen, replaces the single play button):
  - list of worlds, most recently played first: name, mode, last played date; the first
    entry is preselected; a play button ("Click to play" / "Tap to play") starts the
    selected world;
  - "New world": name (default "My world", then "My world 2", …), seed (optional text;
    empty means random; digits are used as the number, other text is hashed), from Part B
    the mode; "Create and play";
  - "Delete" on the selected world, which then asks "Delete this world for ever?" with
    "Delete" and "Keep";
  - the line "Worlds are saved in this browser, on this device only.";
  - "Settings" opens the existing settings and controls page.
  - With no saved world, the "New world" form is what the screen shows.
- **Pause menu**: as today, plus "Save and back to worlds" and a line "Saved" / "Saving…".
- **Links.** `?seed=<n>` without `test=1` opens the "New world" form with that seed.
  "Copy link to this world" stays and copies such a link.
- **Fullscreen.** In touch mode, activating a play or continue button requests fullscreen
  inside the same user gesture (before any asynchronous loading), unless the page is in
  fullscreen already, the API is missing (iPhone), or the player chose "Exit fullscreen"
  during this visit. A refusal is silent. The fullscreen button in the menu stays.
- The layout rules of Phase 2 apply: every button at least 48 × 48 CSS px in touch mode,
  everything reachable at 640 × 360 (the list scrolls), on-screen keyboard for the name.

### 5.5 Game modes, items and inventory (Part B)

- **Mode.** `creative` or `gathering`, chosen in the "New world" form (default Gathering),
  shown in the list. Gathering: fly mode cannot be entered (key, touch button and test API
  patch are refused; the touch `fly` button and the "fly" line of the controls list are
  absent). Falling below the world still returns the player to the start point.
- **Items.** Every block is an item with the same id. Stack size 99.
- **Inventory.** 36 slots; slots 0–8 are the bar. A new Gathering world starts empty.
  Adding an item fills existing stacks first, then the first empty slot, bar first.
- **Bar and HUD.** The bar shows the items of slots 0–8 with their count (no number for
  1). An empty slot is empty. The block name label shows the item name.
- **Placing** in Gathering takes one item from the selected slot; with an empty slot or a
  non-block item nothing happens.
- **Timed breaking** in Gathering. Holding break on a block submits `startBreak`; the
  game shows progress and submits `break` when the time is up. Looking at another block,
  releasing, or changing the slot starts over. Seconds by hand:

  | Block                       | Seconds | Tool class (Part C) |
  | --------------------------- | ------- | ------------------- |
  | Leaves                      | 0.25    | –                   |
  | Glass                       | 0.4     | –                   |
  | Sand, dirt                  | 0.6     | shovel              |
  | Grass                       | 0.7     | shovel              |
  | Clay                        | 0.8     | shovel              |
  | Planks, workbench           | 1.5     | axe                 |
  | Log                         | 2.0     | axe                 |
  | Stone, bricks, stone bricks | 3.0     | pickaxe             |
  | Furnace                     | 3.0     | pickaxe             |
  | Coal ore                    | 3.5     | pickaxe             |
  | Iron ore                    | 4.5     | pickaxe             |
  | Iron block                  | 5.0     | pickaxe             |

- **Progress indicator.** Cracks on the targeted block in five stages (a code-painted
  overlay on the six faces) and a bar under the crosshair.
- **Drops.** Every block drops itself; coal ore drops one coal (the item exists from Part
  B on, with a code-painted icon). A notice "+1 Stone" appears for 1.5 s near the bar;
  repeated pickups of the same item within that time count up ("+3 Stone").
- **Full inventory.** If the drop does not fit, breaking does not start and the HUD shows
  "Inventory full".
- **Inventory screen.** Opened with `E` or the touch button `bag`; closed with `E`, `Esc`
  or its close button. It shows the 27 slots, the bar and a bin. Selecting works the same
  for mouse and finger: activate a slot to pick it (it is highlighted), activate another
  slot to move, merge or swap, activate the bin to discard. Activating the picked slot
  again releases it. In mouse mode opening releases the pointer lock and closing requests
  it again. While open, the player receives no movement or look input.
- **Creative palette.** In Creative the same screen shows all placeable blocks instead of
  the 27 slots; activating one puts it into the selected bar slot (`setBarSlot`). The bar
  starts with the nine Phase 1 blocks and is saved with the world. Counts are not shown.
- **Touch.** The `bag` button sits at the top right (left of `fly`, or in its place in
  Gathering). Slots are at least 48 × 48 CSS px; the screen fits 640 × 360 without
  scrolling.

### 5.6 Non-block items, recipes and tools (Part C)

- **Items** (ids from 256, icons painted by code at 32 × 32 with the fixed texture seed):
  stick, coal (Part B), iron ingot, and pickaxe, axe, shovel each in wood, stone and iron.
  Tools have stack size 1.
- **New blocks**: workbench, furnace, stone bricks, iron block (appended ids, new tiles).
- **Recipes.** One table; a recipe has ingredients, one result with a count, and
  optionally a station.

  | Station   | Recipe                                                           |
  | --------- | ---------------------------------------------------------------- |
  | –         | 1 log → 4 planks                                                 |
  | –         | 2 planks → 4 sticks                                              |
  | –         | 4 planks → 1 workbench                                           |
  | Workbench | 3 planks / stone / iron ingots + 2 sticks → pickaxe of that tier |
  | Workbench | 3 planks / stone / iron ingots + 2 sticks → axe of that tier     |
  | Workbench | 1 plank / stone / iron ingot + 2 sticks → shovel of that tier    |
  | Workbench | 8 stone → 1 furnace                                              |
  | Workbench | 4 stone → 4 stone bricks                                         |
  | Workbench | 9 iron ingots → 1 iron block                                     |
  | Furnace   | 1 iron ore + 1 coal → 1 iron ingot                               |
  | Furnace   | 2 sand + 1 coal → 2 glass                                        |
  | Furnace   | 2 clay + 1 coal → 2 bricks                                       |
  | Furnace   | 2 logs → 1 coal                                                  |

- **Tools.** The tool in the selected slot divides the break time of blocks of its class
  by 2 (wood), 4 (stone) or 8 (iron). Other items and tools of another class count as the
  hand.
- **Gating.** Stone and coal ore drop their item only when broken with a pickaxe; iron ore
  only with a stone or iron pickaxe. Without it the block still breaks at hand speed and
  drops nothing. While such a block is targeted without the needed tool, the HUD shows
  "Needs a pickaxe" or "Needs a stone pickaxe", before and during breaking.
- **Recipe list.** A second tab "Crafting" of the inventory screen (Gathering only).
  Each row: result icon, name, count, ingredient icons with "have / need". Order:
  craftable recipes first, then recipes whose station is missing or whose ingredients are
  short, each group in table order. Missing ingredients are marked red; a missing station
  reads "Needs a workbench nearby" / "Needs a furnace nearby". A craftable row has a
  "Craft" button; holding it repeats four times a second. Rows are at least 48 px high;
  the list scrolls.
- **Smelting.** Furnace recipes show a progress bar for `SMELT_MS = 2000` after "Craft"
  and submit the `craft` action when it is full; closing the screen cancels. The delay is
  presentation only: the action layer checks ingredients and station, not the time.
- **Creative** gets no recipe list; all new blocks are in the palette.

### 5.7 Web Workers (Part D)

- A pool of `clamp(hardwareConcurrency − 1, 1, 4)` workers runs chunk generation and
  meshing. The pure functions stay unchanged; `src/world/chunkJobs.ts` describes jobs and
  results as transferable typed arrays; `src/game/chunkWorker.ts` is the worker entry.
- The main thread still orders work nearest-first, applies edits to generated data,
  uploads meshes, and re-meshes synchronously after an edit, so breaking and placing stay
  immediate.
- Results for chunks that left the load area are dropped. `whenIdle` also waits for jobs
  in flight.
- `workers=0` in the URL, a failing worker start, and Node (unit tests) use the old
  main-thread path. The output must be identical on both paths.

## 6. Test strategy

The rules of Phases 1 and 2 stay in force: unit tests in Node, browser tests against the
production build, state-based waiting, console hygiene, rule-based checks plus reference
screenshots, review of screenshots by eye, touch tests with real emulated fingers.

### 6.1 Layers

1. **Unit tests** for all of `src/actions/`, `src/items/`, `src/save/` and the new
   generation code; coverage scope and the 85 % threshold are extended to them. The whole
   game logic of the phase (every action, every recipe, every break time) is testable
   without a browser.
2. **Browser tests** for wiring, UI and persistence. Each Playwright test has its own
   browser context and therefore its own empty IndexedDB; persistence tests reload the
   page inside one context.
3. **Reference screenshots** for the new screens and the changed terrain.

### 6.2 Test mode and URL parameters

| Parameter      | Effect                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------- |
| `test=1`       | As before: no menu, straight into a world. The world lives in memory and is never stored           |
| `mode=<m>`     | With `test=1`: `creative` (default, so all existing tests keep their meaning) or `gathering`       |
| `save=1`       | With `test=1`: use IndexedDB; opens the world named by `world`, creating it from `seed` and `mode` |
| `world=<name>` | Name for `save=1` (default "Test")                                                                 |
| `workers=0`    | Part D: main-thread chunk work                                                                     |

### 6.3 Test API additions

- `getState()` gains `mode`, `world { id, name, generatorVersion }`, `save { dirty, lastError }`,
  `inventory { slots: [{ item, count } | null], selected }`,
  `breaking { x, y, z, progress } | null`, `ui { screen }` and, in Part C,
  `recipes [{ id, craftable, missing }]`.
- `submit(action)` hands an arbitrary action to the session and returns its result.
- `give(item, count)` and `clearInventory()` change the inventory directly (test tool).
- `save()` resolves when everything dirty is written.
- `setBlock` stays a direct test tool and marks the chunk dirty.

### 6.4 Reference screenshots

- Part A: `world-menu` (list with two worlds), `rocky-hill` (rock surface with visible
  ore, fixed pose). The seven WebGL references of Phase 1 and `touch-controls` are
  regenerated once in step 1, because the terrain changes, and reviewed by eye;
  `pause-screen` is regenerated in step 4.
- Part B: `gathering-hud` (bar with counts, break progress at stage 3),
  `inventory` (Gathering), `palette` (Creative), `inventory-touch` at 640 × 360.
- Part C: `recipe-list`, `recipe-list-touch` at 640 × 360, `item-icons` (all item icons
  on one sheet, also a tool for judging them by eye), `stations` (workbench and furnace
  placed).
- Part D: none new; all existing references must match without regeneration.

Screenshots containing text may use `maxDiffPixelRatio` 0.05 as before. The hygiene test's
count of image files is updated with every new reference.

### 6.5 Limits of automation

Not automatable in the cloud session and therefore listed in each report for the owner:
real fullscreen on Android and its absence on iPhone, storage surviving a browser restart
and a device reboot, the on-screen keyboard in the "New world" form, the feel of break
times and of the inventory on a phone, frame rate and hitches on real devices (decides
Part D), whether a child understands the recipe list without help.

## 7. Implementation steps

Work in order within the part. After each step: `npm run check:all` passes, commit, push.
All acceptance criteria (AC) are verified by automated tests unless marked _(manual)_.
Tests name their AC in the title, as "Phase 3 AC1.1".

### Part A – Foundation (steps 1–5)

### Step 1 – Terrain, generator version 1

Literal gradient table, rock, ores, clay, three blocks and tiles, generator version, stable
ids, the Phase 1 test fix, regenerated references.

- AC1.1 Unit: the literal gradient table equals the `Math.sin`/`Math.cos` values within
  1e-7. A checksum (32-bit FNV-1a) over the block data of the 3 × 3 chunks around the
  origin for seed 1337 equals a constant recorded in the test.
- AC1.2 E2E: the same checksum computed in the browser equals the Node constant.
- AC1.3 Unit, over five seeds and 256 chunks each: ores occur only where plain generation
  has stone; coal ore is 0.8–1.6 % of the stone between y 12 and 110, iron ore 0.4–0.8 %
  between y 4 and 44, and neither occurs outside its range; at least 90 % of ore blocks
  have an ore neighbour of the same kind.
- AC1.4 Unit: a chunk's data is identical whether its neighbours were generated before or
  after it, and veins continue across chunk borders (at least one vein per seed spans two
  chunks).
- AC1.5 Unit: every column at or above y 88 and every column differing by 3 or more from a
  direct neighbour has a stone or ore surface; no column below y 72 with all neighbour
  differences below 3 has; no tree stands on rock; the spawn column of 20 seeds is grass.
- AC1.6 Unit: clay occurs only in the top two blocks of lake beds under at least 2 blocks
  of water, in 4–12 % of underwater columns.
- AC1.7 Unit: within 24 blocks of the spawn of each of 20 seeds, at least one coal ore
  lies no deeper than 8 blocks under the surface.
- AC1.8 Unit: the Phase 1 terrain properties still hold with their original limits
  (heights, share of water, smooth neighbours, tree density within ± 20 % on non-rock
  land).
- AC1.9 Unit: the ids of all existing blocks are pinned by a test; `generateChunk` takes a
  generator version and rejects an unknown one.
- AC1.10 Unit: generating a chunk takes at most 20 % longer than before (measure before
  the change and record both numbers; `expectFasterThan`).
- AC1.11 E2E: the three new blocks render with their own tiles (rule-based: the dominant
  colour of a wall of each differs from stone) and can be broken in Creative.
- AC1.12 The Phase 1 browser test for the block name label no longer depends on real time
  (text and visibility are read in one step, or the label does not hide by real time in
  test mode); it passes 20 times in a row with `--repeat-each=20`.
- AC1.13 References regenerated and reviewed by eye, `rocky-hill` created: rock looks like
  a natural hilltop, ore is recognisable from 10 blocks away, no stripes or checkerboards.

### Step 2 – Action layer in single-player

`src/actions/` with `selectSlot`, `break`, `place`, `LocalSession`; `Game` routes all three
through the session. Behaviour is unchanged.

- AC2.1 Unit: every action kind of Part A survives `JSON.stringify` → `JSON.parse` →
  `decodeAction` unchanged.
- AC2.2 Unit: `decodeAction` returns an error, without throwing, for wrong field types,
  NaN and infinite numbers, non-integer coordinates, out-of-range slots, extra fields,
  unknown kinds, and for 10 000 seeded random values.
- AC2.3 Unit: `applyAction` accepts and rejects according to every rule of 5.2 that
  applies in Part A, one test per rule and reason, including the water rule and placing
  into a player box.
- AC2.4 Unit: `applyAction` never changes its inputs (world and record are compared before
  and after 1 000 seeded random actions).
- AC2.5 Unit: `LocalSession` applies a valid action, reports blocks and result through the
  listener, and reports a rejected action without changing anything.
- AC2.6 The automated check of 5.2 fails when `World.setBlock` is called from `src/ui/` or
  from a new place in `src/game/` (proven once by a temporary violation; mention in the
  report).
- AC2.7 All existing unit and browser tests pass with unchanged assertions (apart from
  AC1.12), including hold-to-repeat and the touch buttons.
- AC2.8 Node: validating and applying an action takes less than 0.2 ms on average over
  10 000 actions.

### Step 3 – Save format, stores, autosave, loading in place

`src/save/`, `idbStore.ts`, `autosave.ts`, `Game.loadWorld`, the URL parameters `save` and
`world`, the test API members `save()` and `getState().world/save`. No menu yet.

- AC3.1 Unit: a world with 50 000 edits in 200 chunks, a full inventory record and a pose
  survives encode → decode unchanged.
- AC3.2 Unit: decoding returns an error, without throwing, for missing and mistyped
  fields, over-long names, non-finite numbers, a higher format version, and 10 000 seeded
  random values.
- AC3.3 Unit: names are trimmed, stripped of control characters, cut to 24 characters and
  replaced by the default when empty; a text seed maps to the same number every time,
  digits map to their value.
- AC3.4 Unit (`MemoryStore`): create, list (most recently played first), load, save,
  delete; deleting removes the chunk records; two worlds do not see each other's edits.
- AC3.5 Unit (`autosave`, fake clock): nothing is written while nothing is dirty; a change
  is written 5 s after it; only dirty chunks are written; pause, hide and exit write at
  once; a failed write stays dirty and is retried.
- AC3.6 E2E (`save=1`): break and place blocks, move, set the time, `save()`, reload: the
  blocks, the pose (within 0.01), the time and the selected slot are restored, including
  an edit 320 blocks from the start point.
- AC3.7 E2E: after an edit and without calling `save()`, `save.dirty` is false within 8 s
  and a reload shows the edit.
- AC3.8 E2E: a second world name in the same context has none of the first world's edits;
  the first still has them afterwards.
- AC3.9 E2E: after `loadWorld` of another world, `chunks.loaded` is 81 and the geometry
  count is at most 110 % of a fresh load; after ten switches the JS heap grew by less
  than 30 MB.
- AC3.10 E2E: with `test=1` and without `save=1`, no IndexedDB database exists after
  playing.
- AC3.11 E2E: saving a world with 50 000 edits takes less than 2 s and loading it less
  than 3 s (record the numbers).

### Step 4 – World menu

`WorldMenu`, the changed start flow, pause menu additions, delete, persistence request,
tab lock, seed links, touch layout.

- AC4.1 E2E (without `test=1`): a first visit shows the "New world" form with the name
  "My world"; "Create and play" starts a world; after a reload the list shows it with its
  name and "Creative", and the play button continues it with its edits.
- AC4.2 E2E: a second world with the seed text "1337" has seed 1337; an empty seed gives
  different seeds for two worlds; the list is ordered by last play.
- AC4.3 E2E: "Delete" asks for confirmation; "Keep" keeps the world; "Delete" removes it
  from the list and from the store, also after a reload.
- AC4.4 E2E: "Save and back to worlds" shows the list without a page reload; another world
  can be started; the first one is unchanged afterwards.
- AC4.5 E2E: a page opened with `?seed=42` shows the form with seed 42; "Copy link to this
  world" copies a link containing the seed.
- AC4.6 E2E: a world that is open in a second page of the same context cannot be opened
  there and the message of 5.4 shows; after the first page closes it can.
- AC4.7 E2E: a damaged record (written by the test) is listed as damaged, cannot be
  played, can be deleted, and the other worlds work.
- AC4.8 E2E: with a stubbed `navigator.storage.persist`, it is called once after the first
  world is created; a rejecting stub causes no console message.
- AC4.9 E2E (touch, 640 × 360 and 1280 × 800): every button of the world menu and the form
  is inside the viewport or reachable by scrolling the list, at least 48 × 48 CSS px, and
  no two overlap; a world can be created, played, left and deleted with taps and typed
  text only.
- AC4.10 E2E: the pointer-lock flow of Phase 1 and the mode selection by pointer type of
  Phase 2 work from the new play buttons (existing tests adapted; list the adapted tests
  in the report).
- AC4.11 References `world-menu` created and `pause-screen` regenerated; both reviewed by
  eye.

### Step 5 – Fullscreen, hardening, documentation, pull request

- AC5.1 E2E (touch, stubbed `requestFullscreen`): a tap on a play or continue button
  requests fullscreen once, inside the tap's event handler; not when already in
  fullscreen, not after "Exit fullscreen" was chosen in this visit, not in mouse mode. A
  rejecting or missing API causes no console message and the game starts.
- AC5.2 E2E soak: 500 seeded random valid and invalid actions through `submit`, with
  autosave running and one switch to another world and back; no console message, the heap
  grows by less than 50 MB, and after a reload every block equals the state before.
- AC5.3 Hygiene test still passes; hard rule 1 checked for the new tiles and all texts.
- AC5.4 `README.md` explains worlds, saving, where the data lives and how it can be lost.
- AC5.5 `CLAUDE.md` is updated: structure, conventions (action layer, stable ids, generator
  version, saving), URL parameters, status "Phase 3 part A: implemented".
- AC5.6 `docs/phase-3a-report.md` is written per the Definition of Done, including the
  manual list for the owner: worlds survive closing the browser and a reboot; fullscreen on
  the Android phone and tablet; the "New world" form with the on-screen keyboard; the look
  of rocky hills; **frame rate and hitches while walking and flying at render distance 5
  and 8** with the debug overlay (this decides whether Part D is started).
- AC5.7 CI is green on the final commit and one pull request into `main` is open.

### Part B – Gathering (steps 6–9)

### Step 6 – Items, inventory, game mode

`src/items/items.ts`, `inventory.ts`, the actions `moveStack`, `discard`, `setBarSlot`, the
mode in the form and in the physics, the bar drawn from the inventory, the coal item.

- AC6.1 Unit: adding items fills existing stacks first, then empty slots, bar first;
  never exceeds the stack size; reports what did not fit. 10 000 seeded random operations
  never produce a negative count, a stack above its size, or a changed total other than
  by the operation.
- AC6.2 Unit: `moveStack` moves, merges (with a remainder staying behind) and swaps;
  `discard` empties; `setBarSlot` is refused in Gathering with reason `mode` and accepts
  only placeable blocks.
- AC6.3 Unit: `place` in Gathering takes one item and is refused with an empty slot; in
  Creative the count never changes.
- AC6.4 Unit: the item ids of all blocks equal their block ids; ids are pinned by a test.
- AC6.5 E2E: the "New world" form offers Gathering (preselected) and Creative; the list
  shows the mode; the mode survives a reload.
- AC6.6 E2E (`mode=gathering`): the fly key and `setPlayer({ mode: 'fly' })` leave the
  player walking; in touch mode no `fly` button is in the document. In Creative both work
  as before.
- AC6.7 E2E (`mode=gathering`): the bar is empty at the start; after `give` it shows icon
  and count; placing reduces the count and the last item empties the slot.
- AC6.8 E2E (`save=1`): the inventory and the Creative bar survive a reload.
- AC6.9 A world saved by Part A (fixture record in the test) loads as a Creative world
  with the nine Phase 1 blocks in its bar.

### Step 7 – Timed breaking and drops

`hardness.ts`, `startBreak`, the Gathering rules of `break`, `BreakOverlay`, progress bar,
pickup notice, "Inventory full".

- AC7.1 Unit: the break time of every block equals the table of 5.5; a test fails when a
  breakable block has no entry.
- AC7.2 Unit: `break` is refused with `early` before the time is up (minus the tolerance),
  with another cell than `startBreak`, and after a slot change; it succeeds at the time.
- AC7.3 Unit: the drop table; `break` with a full inventory is refused with `full` and
  changes nothing; a partly filled stack of the same item accepts the drop.
- AC7.4 E2E (`mode=gathering`): holding break on dirt removes it after 36 steps (± 1) and
  not after 30; the inventory then holds one dirt; holding on removes the next block.
- AC7.5 E2E: releasing at half time and pressing again starts from zero; turning to
  another block starts from zero.
- AC7.6 E2E: `breaking.progress` rises from 0 to 1; the crack overlay changes the pixels
  of the targeted face in at least three distinguishable stages and is gone after the
  break; the bar under the crosshair is visible only while breaking.
- AC7.7 E2E: a notice "+1 Dirt" appears and counts up for a second block within 1.5 s.
- AC7.8 E2E: with a full inventory, holding break changes no block and shows "Inventory
  full".
- AC7.9 E2E (touch, `mode=gathering`): holding the `break` button breaks a block after its
  time; a short tap does not.
- AC7.10 E2E (Creative): breaking is instant and repeats as in Phase 1 (existing tests
  unchanged).
- AC7.11 E2E: the break overlay adds at most 1 draw call.

### Step 8 – Inventory screen and palette

- AC8.1 E2E (`mode=gathering`): `E` opens and closes the screen; while open, movement keys
  and look input do not move the player, and time still advances with `step`.
- AC8.2 E2E: activating a slot and then an empty slot moves the stack; onto the same item
  merges; onto another item swaps; onto the bin discards; activating the picked slot again
  releases it. Each is checked against `getState().inventory`.
- AC8.3 E2E (without `test=1`, mouse): opening releases the pointer lock, closing with the
  close button takes it again.
- AC8.4 E2E (Creative): the screen shows every placeable block exactly once; activating
  one puts it into the selected bar slot; it can then be placed.
- AC8.5 E2E (touch, 640 × 360 and 1280 × 800): the `bag` button opens the screen; all
  slots, the bin and the close button are inside the viewport, at least 48 × 48 CSS px,
  not overlapping; AC8.2 works with taps.
- AC8.6 E2E (touch): no touch control of the game reacts while the screen is open, and
  the stick and buttons are released when it opens.
- AC8.7 References `gathering-hud`, `inventory`, `palette`, `inventory-touch` created and
  reviewed by eye: icons recognisable at bar size, counts readable, nothing cut off.

### Step 9 – Hardening, documentation, pull request

- AC9.1 E2E play-through (`mode=gathering`, real key and mouse events, no `give`): from an
  empty inventory the test gathers a log, dirt and sand near the start point, places them
  as a small wall, reloads, and finds wall and inventory unchanged.
- AC9.2 E2E soak (Gathering): 500 seeded random actions of all kinds through `submit`; the
  total item count changes only by successful breaks, places and discards; no console
  message.
- AC9.3 Hygiene test passes; hard rule 1 checked for icons, cracks and texts.
- AC9.4 `README.md` explains both modes, the inventory and the controls (keys and touch).
- AC9.5 `CLAUDE.md` is updated; status "Phase 3 part B: implemented".
- AC9.6 `docs/phase-3b-report.md` with the manual list: feel of the break times by finger
  and mouse, the inventory on the phone, whether "Inventory full" is understood.
- AC9.7 CI is green on the final commit and one pull request into `main` is open.

### Part C – Crafting (steps 10–13)

### Step 10 – Items, recipes, stations (core)

Non-block items, `itemIcons.ts`, four new blocks and tiles, `recipes.ts`, the `craft`
action with the station rule. No UI yet.

- AC10.1 Unit: every recipe of 5.6 exists; ingredients and results are known items; no two
  recipes have the same ingredients and station; every non-block item and every new block
  is the result of at least one recipe or a drop.
- AC10.2 Unit: `craft` removes exactly the ingredients and adds the result; is refused with
  `missing`, `full` or `station` and then changes nothing; a station counts within 5
  blocks of the eye and not at 7.
- AC10.3 Unit: starting with an empty inventory and a world of generated chunks, a
  scripted sequence of valid actions only (break, place, craft) ends with an iron pickaxe
  in the inventory. The test documents the shortest path and its simulated time.
- AC10.4 Unit: every item icon is 32 × 32, deterministic, not empty, and differs from
  every other icon in at least 10 % of its pixels; the three tiers of a tool differ in
  their head colour.
- AC10.5 E2E: the four new blocks render with their own tiles and are in the Creative
  palette.
- AC10.6 A world saved by Part B (fixture record) loads unchanged.

### Step 11 – Tools and gating

- AC11.1 Unit: for every block and every tool, the break time equals the hand time divided
  by 1, 2, 4 or 8 according to class and tier.
- AC11.2 Unit: stone and coal ore drop nothing by hand and their item with any pickaxe;
  iron ore drops nothing with a wooden pickaxe and its block with a stone or iron one;
  breaking without a drop is not refused by a full inventory.
- AC11.3 E2E (`mode=gathering`): stone takes 180 steps by hand and 45 with a stone
  pickaxe (± 1).
- AC11.4 E2E: targeting stone with an empty hand shows "Needs a pickaxe"; iron ore with a
  wooden pickaxe shows "Needs a stone pickaxe"; with the right tool no hint shows.
- AC11.5 E2E: a tool in the selected slot cannot be placed and its bar slot shows no count.

### Step 12 – Recipe list

- AC12.1 E2E (`mode=gathering`): the "Crafting" tab lists every recipe; with one log only
  "planks" is craftable and stands first; "Craft" turns the log into 4 planks and the
  order updates.
- AC12.2 E2E: a recipe short of ingredients shows "have / need" with the missing ones
  marked and has no active button; a workbench recipe without a workbench reads "Needs a
  workbench nearby" and becomes craftable after one is placed within reach, also for the
  furnace.
- AC12.3 E2E: a furnace recipe shows a progress bar and delivers the result after 120
  steps, not before; closing the screen during the bar changes nothing in the inventory.
- AC12.4 E2E: holding "Craft" on planks → sticks crafts repeatedly until the planks run
  out and then stops.
- AC12.5 E2E: Creative has no "Crafting" tab.
- AC12.6 E2E (touch, 640 × 360 and 1280 × 800): tabs, rows and buttons are at least 48 px
  high, inside the viewport or reachable by scrolling the list; crafting works with taps;
  scrolling the list by finger does not press "Craft".
- AC12.7 References `recipe-list`, `recipe-list-touch`, `item-icons`, `stations` created
  and reviewed by eye: every icon is recognisable as its item without the label, missing
  ingredients stand out, text does not overflow.

### Step 13 – Hardening, documentation, pull request

- AC13.1 E2E play-through (`mode=gathering`, real input and the real recipe list; `give`
  only for materials that lie far from the start point): gather wood, craft planks,
  sticks, a workbench and a wooden pickaxe, break stone with it, and end with a stone
  pickaxe in the bar; reload and find everything unchanged.
- AC13.2 E2E soak: 1 000 seeded random actions of all kinds; item totals change only as
  the successful actions say; no console message; heap growth below 50 MB.
- AC13.3 Hygiene test passes; hard rule 1 checked for item names, icons and recipes.
- AC13.4 `README.md` gets a "How to play Gathering" section: first steps, the recipe
  table, the tool table.
- AC13.5 `CLAUDE.md` is updated; status "Phase 3: implemented (parts A–C)".
- AC13.6 `docs/phase-3c-report.md` with the manual list (can a child reach the wooden
  pickaxe without help, is iron findable, are break times fun) and "Notes for Phase 4".
- AC13.7 CI is green on the final commit and one pull request into `main` is open.

### Part D – Web Workers (steps 14–15, optional)

### Step 14 – Worker pool

- AC14.1 Unit: job and result descriptions survive a structured clone; the job functions
  produce byte-identical chunk data and mesh arrays to the direct calls for 64 chunks with
  edits.
- AC14.2 E2E: with workers, the checksum of AC1.2 and `getBlock` at 1 000 seeded positions
  equal the values with `workers=0`.
- AC14.3 E2E: all existing reference screenshots match without regeneration, with and
  without workers.
- AC14.4 E2E: breaking and placing change the mesh within the same frame as before
  (existing interaction tests unchanged).
- AC14.5 E2E: teleporting 64 blocks ten times ends with 81 loaded chunks, no pending jobs,
  and a geometry count at most 110 % of a fresh load.
- AC14.6 E2E: with the worker script blocked by the test, the game starts on the
  main-thread path without a console error.
- AC14.7 E2E: the production build works when served from a sub-path (workers load with
  `base: './'`).

### Step 15 – Measurement, documentation, pull request

- AC15.1 `scripts/perf.ts` measures, while flying 300 blocks at 20 blocks per second at
  render distance 8, the main-thread time spent on chunk work per frame: the maximum is at
  most 3 ms with workers, and both numbers (with and without) are in the report.
- AC15.2 E2E: the time until `isReady()` after loading is not longer than without workers
  (± 10 %).
- AC15.3 `CLAUDE.md` and `docs/phase-3d-report.md` are updated, with the manual list: the
  same device measurement as in the Part A list, before and after.
- AC15.4 CI is green on the final commit and one pull request into `main` is open.

## 8. Risks and fallbacks

| Risk                                                                                 | Fallback (decide without asking)                                                                                                                                                      |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The literal gradient table moves terrain                                             | Expected: references are regenerated in step 1 anyway. The Phase 1 statistical tests must still hold                                                                                  |
| Rock and ore rules make generation slower than AC1.10 allows                         | Evaluate the ore function only for stone cells inside the ore height ranges; precompute per-column data; as a last step relax the limit to 35 % and record it                         |
| Rocky hills look artificial (hard edges between grass and stone)                     | Blend the border with the jitter noise; tune `ROCK_HEIGHT` and `ROCK_SLOPE`; judge by eye and record the final values                                                                 |
| IndexedDB behaves differently in headless Chromium, or is unavailable (private mode) | If opening the database fails, play with `MemoryStore` and show "Worlds cannot be saved in this browser window." in the menu                                                          |
| A write during `pagehide` does not complete                                          | By design the 5 s interval and the save on pause and on hide cover it; at most 5 s of play are lost                                                                                   |
| Loading a world in place leaks or proves fragile                                     | Recreate world, chunk manager and chunk meshes behind `loadWorld`; AC3.9 is the guard. Do not fall back to a page reload                                                              |
| Fullscreen changes the viewport and briefly shows the rotate overlay                 | Ignore orientation changes for 500 ms after a fullscreen change                                                                                                                       |
| Re-taking the pointer lock after closing the inventory is refused by the browser     | Show the existing "Click to continue" state instead of an error; never leave the game without a way back                                                                              |
| The inventory does not fit 640 × 360 with 48 px slots                                | Show the 27 slots as 3 rows of 9 at 48 px with the bar below and the bin beside it (432 × 192 px plus header); if tabs do not fit, put them beside the grid, not above                |
| Break times feel wrong                                                               | They are config values; the session keeps the table and the owner tunes after trying. Do not tune by guess beyond obvious errors                                                      |
| Icons are not recognisable at bar size                                               | Simplify shapes, raise contrast, add a dark outline; the `item-icons` sheet is the tool for judging                                                                                   |
| Part A runs out of room                                                              | Cut in this order and record it: the tab lock (AC4.6), the damaged-world listing (AC4.7, show nothing instead), the seed-link form (AC4.5, ignore the parameter). Never cut steps 1–3 |
| Part B runs out of room                                                              | Cut: the pickup notice (AC7.7), the count-up of notices, the `palette` polish (keep the function). Never cut the action rules or their tests                                          |
| Part C runs out of room                                                              | Cut: hold-to-repeat crafting (AC12.4), the smelting progress bar (craft at once), stone bricks and iron block. Never cut gating or the play-through                                   |
| Workers: Vite's worker build fails under `base: './'` or in the preview server       | Try the `?worker` import form; if neither works within the step, stop Part D, write the finding into its report and open no pull request                                              |
| Workers: copying nine chunks per mesh job costs more than it saves                   | Let each worker keep the generated data of chunks it produced and receive only edits; if still slower, move only generation to workers                                                |

## 9. Notes for Phase 4 (multiplayer)

- `docs/phase-2-plan.md` Part B stays the reference for transport, rooms, snapshot, poses
  and reconnecting. It is re-planned on top of this phase.
- The action layer is the seam: a host session calls the same `applyAction` and
  broadcasts `blocks` and the acting player's record; a client session forwards
  `submit` and waits. The UI already shows confirmed state only.
- Per-player state is the `PlayerRecord`. The save file already separates it from the
  world; a host will keep one record per player name.
- Still to add there: validation in chunks the host has not loaded (authoritative read),
  rate limits, the terrain checksum in the handshake (the function exists from AC1.1),
  wall-clock time instead of simulation time for `nowMs`.
- Stations and the missing furnace state mean that crafting needs no world
  synchronisation beyond blocks.
- Break progress of other players is not shown; decide in Phase 4 whether it should be.
