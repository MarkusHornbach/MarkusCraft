# Phase 8 part B3b plan – Loot in mine shafts

Read `CLAUDE.md`, `src/world/CLAUDE.md`, `src/world/generation/CLAUDE.md`,
`src/radar/CLAUDE.md`, `src/net/CLAUDE.md`, `src/save/CLAUDE.md`, `src/actions/CLAUDE.md`,
`src/bot/CLAUDE.md`, `src/progress/CLAUDE.md`, `src/ui/CLAUDE.md`, `src/input/CLAUDE.md` and
`e2e/CLAUDE.md` first, and the "Decisions and deviations" of `docs/phase-8b2a-report.md`
(generator 3, shafts, budgets), `docs/phase-8b2b-report.md` (places, radar),
`docs/phase-8b3a1-report.md` (block state, chests in rooms) and `docs/phase-8b3a2-report.md`
(chest screen).

Phase 8 part B3 ("storage and loot") is planned in pieces; B3a (chests as storage,
`docs/phase-8b3a-plan.md`) is built. **B3b** (this plan) is one part: one implementation
session, one branch, one pull request. Work on the branch assigned to the cloud session,
else `phase-8b3b-loot`. The session is autonomous: do not ask the owner questions. Where
this plan leaves a detail open, choose the simplest option consistent with it and note it
in `docs/phase-8b3b-report.md`, section "Decisions and deviations".

Tests name their criterion in the title as "Phase 8B3b AC1.1". Device tests have the
origin "8B3b".

## 1. Goal

New worlds use **generator 4**. It is generator 3 plus one **loot chest** in the chamber
of every mine shaft. A chest's contents are worked out from the seed and its position
when someone first reads it. They are never stored until a player touches the chest, and
a chest a player emptied stays empty. The spawn shaft, which every world has close to
the spawn, holds a small **starter** table. The other shafts hold a **rich** table, so the
long walk is what pays. The radar shows loot chests as a place kind **"Chest"** while they
still hold items. A hint under the crosshair says how to open a chest. Worlds of
generators 1–3 are unchanged and get no loot.

## 2. Findings of the planning session

- **Generator 4 costs one block per shaft.** A chest is an opaque cube in a chamber corner.
  Generation writes one more cell per shaft and works out no contents (they are derived on
  read, 6.2). Faces, light and meshing barely change. Generator 4 adds no render cost of
  its own, but it inherits generator 3's caves. Their phone cost is untested (device test
  CAVE-1), and this part neither fixes nor worsens it.
- **Rooms would lose loot.** `HostSession.ts` computes the slots a chest change touched
  against `storedState ?? emptyChest()`, and `ClientSession.ts` patches the same base. An
  untouched loot chest has no stored state. The host would miss slots that a move emptied
  and send the rest; the guest would patch an empty chest. Host and guest would then
  disagree. Both must start from the derived state (`World.getState`, 6.4).
- **Derived contents must be frozen.** An untouched loot chest is derived again each time
  it is read. If the tables changed after the merge, unopened chests in existing generator
  4 worlds would change. So the loot tables belong to generator 4 like its blocks: frozen
  once merged and pinned by a loot checksum (6.2). A change to loot is a generator 5.
- **What could shorten the book.** Tasks count actions (mined drops, crafts, placements,
  stores), not items a player holds. Loot gives no first-find XP and never unlocks a recipe
  (`crafted` grows only by crafting). Three kinds of item would still skip something:
  - Tools: they have no durability, so a looted pickaxe speeds up every break for the rest
    of the game.
  - Logs: crafting planks from them counts for "Make 64 planks".
  - Iron ore: smelting it counts for "Make 20 iron ingots".

  The tables leave out tools and every natural block (decision 2), and a unit test
  enforces it.

- **The spawn shaft is in every world.** All 48 of B2a's test worlds had it 24–32 blocks
  from the spawn, with lit stairs. Its chest is reachable in the first minute, before any
  task. Hence the smaller starter table (decision 1).
- **A permanent radar kind would say nothing new.** Every loot chest lies inside a shaft,
  and shafts are already places. So the Chest kind hides once a chest is emptied or broken
  (decision 3). Edits and chest states are kept for the whole world in memory, also for
  unloaded chunks and on guests, so "still holds items" is known everywhere.
- **The bot breaks what is in its way.** A generated chest on the bot's path whose break
  is refused (`full`) would end a run. The bot handles chests (6.7).
- **The first chest a player sees** is often a loot chest, before the chest recipe (task 6)
  and task 21. The crosshair hint (6.6) tells them how to open it.
- **Docs near their budget.** The root `CLAUDE.md` is 23.7 of 25 KB, `src/net/CLAUDE.md`
  7 977 of 8 000 bytes and `src/radar/CLAUDE.md` 7.2 KB. Section 12 says what moves where.
- **The Pi side:** `sync/status.md` of the owner's Pi repository was read. Nothing there
  concerns this part.

## 3. Decisions made with the owner

| #   | Topic     | Decision                                                                                                                                                                                                                                                        |
| --- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Placement | One loot chest in **every** shaft chamber. The spawn shaft's chest uses a smaller **starter** table, the other shafts the **rich** table. No chests in caves or anywhere else                                                                                   |
| 2   | Tables    | Starter (3–4 stacks): torches 4–8, coal 2–6, sticks 4–8, planks 8–16. Rich (4–6 stacks): torches 8–16, coal 6–12, iron ingots 2–5, glass 4–12, bricks 4–12, stone bricks 8–16, rarely one iron block. Never tools, logs, stone, ores or any other natural block |
| 3   | Radar     | A new place kind "Chest" with its own symbol and legend row, shown only while the chest is there and holds at least one item                                                                                                                                    |
| 4   | Task      | No new task and no book version: loot is an optional reward the radar points to                                                                                                                                                                                 |
| 5   | Split     | One part, with the crosshair hint as the last step                                                                                                                                                                                                              |

Choices of the planning session (not asked; the owner may change them at review): the
world list says "· Caves · Loot" for generator 4 (generator 3 stays "· Caves"). Creative
worlds get generator 4 and loot too, as both modes use `GENERATOR_VERSION` today. The bot
measures loot with a separate run mode (6.7).

## 4. Changes to the original scope

The owner's starting scope was challenged during planning. Agreed changes:

| #   | Change                                                                                                         | Reason                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Two loot tables: a small starter table for the spawn shaft, a rich one for every other shaft                   | The spawn shaft is in every world 24–32 blocks from the spawn. Rich loot there would reach every player in minute one; the walk to a far shaft is what should pay                              |
| 2   | The radar's Chest kind hides once the chest is emptied or broken (B2b's "cheap" version was a permanent place) | Every loot chest is in a shaft, and shafts are already on the radar. Only "loot is left here" is new information. It costs a check of the cell's edit and stored state                         |
| 3   | "Existing items only" is narrowed: no tools, no logs, no stone, no ores, no natural block                      | Tools have no durability (a permanent speed boost). Crafted logs count for "Make 64 planks", smelted ore for "Make 20 iron ingots"                                                             |
| 4   | The optional crosshair hint is in. It shows for every chest, not only loot chests                              | A loot chest is often the first chest a player meets, before the chest recipe and task 21. It also answers CHEST-8 ("is it clear that the place input opens a chest?") before its result is in |
| 5   | The optional task is left out                                                                                  | A task counts only while its chapter is open. A spawn chest looted earlier would send the player to a far shaft, and a world without a spawn shaft could never finish the book                 |
| 6   | Added: a bot loot run (`scripts/progressRun.ts --loot`) with limits on how much shorter the book may get       | "Not noticeably shorter" needs a number. The bot loots in the worst place (the spawn chest before task 1, a rich chest at chapter 4) and the report compares it with the plain run             |

## 5. Out of scope (do not build)

- A furnace with contents or fuel; any new state kind.
- New items, materials, tools, recipes; changes to tasks, counts, XP, levels or the book
  version.
- Health, creatures, enemies; items on the ground.
- Loot anywhere but shaft chambers (caves, ravines, the surface); more than one chest per
  shaft; refilling or respawning loot.
- A radar with fog of war or any change to the radar's ore rules; zoom steps.
- World export or import.
- **Any change to generator 1–3 output** (every checksum stays) or to the save format.
- Changes to the chest screen beyond what loot needs (nothing is planned to change).
- The rest of Phase 7, Web Workers (Phase 4 part C).

## 6. Specification

### 6.1 Generator 4 (`src/world/generation/`)

- `GENERATOR_VERSION` 4 (`config.ts`); `WorldGen` `{ version: 2 | 3 | 4, options }`;
  `isKnownGeneratorVersion` knows 4. The "New world" form gives 4 in both modes. The world
  list says "Balanced · Few trees · Caves · Loot", F3 "Generator 4 · balanced · few".
  `gen=4` makes a generator 4 test world. The `?test=1` world and the bench stay generator
  1, and the bench scenario `caves` stays generator 3 (`BENCH_SUITE_VERSION` unchanged).
- `TerrainV4 extends TerrainV3` (`terrainV4.ts`): the same phases. After the shafts are
  built, each shaft whose chamber touches the chunk gets `Block.CHEST` in its **chest
  cell**, `shaftChestCell(s)` = `(s.x − 3, s.floor, s.z + 3)`. That is the chamber corner
  without a torch, opposite the stair landing `shaftChamberCell` (2, −2). It stands on the
  chamber's stone bricks. Nothing else changes. Generator 3's code paths and output are
  untouched (its twelve checksums prove it).
- **Identity test:** for the twelve presets, every chunk within 3 chunks of the spawn shaft
  and of two grid shafts equals generator 3's chunk except exactly the chest cells of
  the shafts whose chamber touches it.
- `TERRAIN_CHECKSUMS_1337_V4`: twelve new checksums over chunks that contain the spawn
  shaft's chest (the existing origin checksums may equal V3's, as B2a saw for two presets;
  the new ones must not), pinned like V1–V3.
- `placesIn` of `TerrainV4` lists generator 3's places, then one `{ kind: 'chest', x, y, z }`
  per shaft (its chest cell). `Place.kind` gains `'chest'`. Generator 3's `placesIn` is
  unchanged.
- The walk check (`src/bot/caveWalks.ts`) on generator 4: for every spawn shaft of the 48
  worlds, the shaft's top reaches a standing cell next to the chest in torch light (block
  light above 4) and returns. That is the answer to "does this work without light?": the
  chest stands in the lit chamber.

### 6.2 Loot tables and derivation (`src/world/loot.ts`, `blockState.ts`)

- `TerrainSource.lootAt?(x, y, z): ChestState | null`. Generator 4 only: the derived
  contents if (x, y, z) is the chest cell of a shaft, else null. `initialState(block, x, y,
z, source)` returns `source.lootAt(…)` for a chest cell where it is not null, else the
  empty chest as today. No other caller changes: `World.getState`, `stateFor`
  (`FarReader`) and the actions already go through `initialState`.
- **Tables** (`LOOT_TABLES` in `loot.ts`; plain data). Starter: 3–4 stacks drawn without
  repeats from torch 4–8, coal 2–6, stick 4–8, planks 8–16. Rich: 4–6 stacks drawn without
  repeats by weight: torch 8–16 (3), coal 6–12 (3), iron ingot 2–5 (2), glass 4–12 (2),
  stone bricks 8–16 (2), bricks 4–12 (1), iron block 1 (0.5). Each stack goes into a hashed
  free slot of the 27. The spawn shaft (`Shaft.spawn`) uses the starter table, every other
  shaft the rich one.
- **Determinism:** the RNG is `mulberry32` seeded from `hash2(seed ^ SALT_LOOT, x, z)` mixed
  with y. The contents are a pure function of seed, generator and cell. No `Math.random`;
  the same object is not cached across worlds. Deriving is cheap (no allocation beyond the
  result) and needs no blocks: the shaft comes from `ShaftPlanner.shaftAt`.
- **Frozen:** `LOOT_CHECKSUM_1337_V4` hashes the contents of every loot chest of seed 1337
  (balanced, few) whose shaft lies within ±1 024 of the origin, plus the spawn chest of
  each of the twelve presets. It is pinned like the terrain checksums. From the merge on,
  a change to the tables or the derivation is a new generator version.
- **The item rule** (`loot.test.ts`): no loot item is a tool, none is in `NATURAL_BLOCKS`,
  every item exists in the item table, every count lies within 1–`STACK_SIZE`, and a full
  draw fits in 27 slots.

### 6.3 State rules for loot (`src/world/`, `src/actions/`)

- Nothing new in the rules of B3a1. They already give "never refilled": a chest without a
  stored state reads as `initialState` (now the loot). The first accepted action that
  changes its slots (`chestMove`, `quickMove`, `takeAll`) stores the result explicitly,
  also when empty. `openChest` and `closeChest` store nothing (an opened chest keeps its
  loot derived). Breaking a loot chest follows the break rule: in Adventure the chest item
  and the contents go to the breaker, or the break answers `full`. In Creative it answers
  `notEmpty` while the chest holds items. The edit then makes the cell air. A chest placed
  into that cell later stores an explicit empty state.
- Tests (`src/actions/loot.test.ts`): take one stack, then all, then reload the world. The
  chest stays empty. A broken loot chest whose cell gets a new chest is empty. A
  never-touched loot chest has no stored state and costs no save bytes. A soak of 1 000
  random chest actions on two loot chests and one placed chest keeps every item total
  (Adventure and Creative).
- `getState().world.chests` and the F3 row "Chests" count stored states only, as today.
  Untouched loot chests are not counted (documented in `docs/testing.md`).

### 6.4 Rooms (`src/net/`)

- **The fix:** `HostSession` computes a chest message's changed slots against
  `world.getState` before the action (the derived state for an untouched loot chest), not
  against `storedState ?? emptyChest()`. `ClientSession` patches `world.getState` (its
  own derived state) the same way. A guest's terrain is the host's (checksum in
  `welcome`), so both derive the same loot.
- The snapshot is unchanged: untouched loot chests are not in it, and a joining guest
  derives them. `worldHash` covers stored states only, as before.
- No protocol change. The room protocol is the same as B3a2's, and host and guest must run
  the same build anyway (build id).
- Tests (`src/net/lootNet.test.ts`, memory transport):
  - A guest takes one stack of an untouched loot chest; host and guest then have the same
    27 slots.
  - A move that empties a slot on the host shows as empty on the guest.
  - Two guests race for one loot stack: one gets it, the other `missing`.
  - A guest who joins late reads the same contents, touched or not.
  - Hashes are equal throughout.
  - The soak of B3a1's AC3.3 runs with two loot chests (one in a chunk the host has not
    loaded).

### 6.5 Save and rollback (`src/save/`)

- No save format change: the generator version is stored in `WorldMeta`, and touched loot
  chests are ordinary block states (format 6). A generator 4 world opened by an older
  build is "Saved by a newer version" (`decodeMeta` answers `newer` for an unknown
  generator) and is never written. Back on this build it opens unchanged. Tests: a
  generator 4 world with a touched and an untouched loot chest saves and reloads
  (`WorldStore` and `e2e/loot.spec.ts` with `save=1`). A meta with generator 5 is `newer`.

### 6.6 The radar's Chest kind (`src/radar/`, `src/ui/radarDraw.ts`)

- `RADAR_KINDS` gets a third place row: `chest`, label "Chest", a filled amber square
  with a dark band across its middle, drawn by code. It must be easy to tell apart from
  the hollow shaft square on the circle at Small. Numbers as the other places: 4 on the
  map, 2 on the circle, `beyond` up to 192.
- **Hiding:** places stay permanent, except chests, which go through a probe
  (`ChestProbe` passed to `scanRadar`). A listed chest counts only if its cell still holds
  a chest and its state is not empty. For the block: a loaded chunk's block, else
  `World.edits` for that cell (no edit: the generated chest is there). For the state: the
  stored state, else the derived loot, which is never empty. Guests hold the whole
  world's edits and states, so they see the same as the host.
- **Rescan:** a change of a chest state within `RADAR_FAR_RADIUS` + 2 (`onStates`) triggers
  a scan, like `onBlocks` does.
- Generators 1–3 scan, draw and list exactly what they do today. The chest legend row
  ("Chest · 37 blocks · far", "Chest · none within 192") shows in generator 4 worlds only.
  The F3 radar row counts chests like the other places.
- Tests: `scanPlaces.test.ts` (shown, hidden after `takeAll`, hidden after a break,
  shown again never), the places agreement test on generator 4 (every listed chest is a
  chest block in the generated chunks, every chest block near the spawn and the spawn shaft
  is listed), `scanCost.solo.test.ts` (generator 4 with chests at most 1.2 × the scan
  without the chest kind, as B2b's limit for places).

### 6.7 The bot (`src/bot/`, `scripts/progressRun.ts`)

- **Default generator 4.** `scripts/progressRun.ts` runs generator 4 (`--gen 3` and
  `--gen 2` for comparison). The plain run never seeks loot. A chest in its way is opened,
  emptied with `takeAll` (junk thrown away first when the inventory is full), then broken.
  A refusal never ends a run. The report counts these accidental loots.
- **Loot run** (`--loot`): before task 1 the bot fetches the spawn shaft's chest (its usual
  walking and digging, `openChest`, `takeAll`, `closeChest`). At the start of chapter 4
  it fetches the nearest other loot chest within 192 blocks, if any. The time of each fetch
  is its own row ("Loot trip 1", "Loot trip 2") and is not part of a task. Later it uses
  what it holds: `obtain` takes items from the inventory first.
- **Limits** (medians over the 12 runs, the loot run against the plain run on the same
  worlds, trips left out):
  - the total is at most 1.5 minutes shorter;
  - no chapter is more than 1.0 minute shorter;
  - tasks 11, 12, 16 and 17 (the coal and iron chain) are each within 0.3 minutes;
  - all 12 runs complete with light errors 0, and the targets of 30–45 minutes still hold.

  The report prints both runs, the trips, the dark breaks of tasks 1–11 (with looted
  torches held) and the accidental loots.

- **Fallback:** if a limit fails, lower the count range of the item that saves the time
  (record which). This is allowed only before the merge, since the tables are frozen after
  it. If lowering cannot meet a limit, drop that item from the table.
- `botV3.slow.test.ts` stays (generator 3). New `botLoot.slow.test.ts`: seed 1337 balanced
  generator 4 with `--loot`. The book completes, both trips found a chest, light errors 0.

### 6.8 The crosshair hint (`src/ui/Hud.ts`, `Game.ts`)

- While playing (no screen open) with the crosshair on a chest within reach, a small line
  under the crosshair says how to open it. The text depends on the input mode: "Right
  click: Open" (mouse), "Place: Open" (touch, naming the button's label), and the LT glyph
  with "Open" (controller, through `padGlyphs`). It shows for every chest in both modes and
  hides while a break is in progress. It costs no simulation work beyond the target the
  game already raycasts.
- Test: `e2e/chestHint.spec.ts` for mouse, touch and pad. The line shows on a chest, hides
  on another block and while breaking. Reference `chest-hint`.

### 6.9 Test API (`src/game/`)

- `lootSites()`: the spawn shaft's chest cell and a standing cell next to it, and the
  nearest grid shaft's chest cell within 256 (or null). `getChest` already reads derived
  contents. `getState().world.generatorVersion` is 4 in new worlds.

### 6.10 Budgets

- Generation: generator 4 at most 1.35 × generator 2 over 15 × 15 chunks, as a third side of
  `terrainV3Speed.solo.test.ts`. Generator 4 adds one cell write per shaft. If the solo test
  proves flaky, add rounds. Never change generator 3 or 4 for it.
- Faces per chunk, light and meshing: generator 4 equal to generator 3 within 1 %
  (`caveCost.slow.test.ts` gets a generator 4 column). The chest is one opaque cube per
  shaft.
- Radar scan: as 6.6. Save: an untouched loot chest costs 0 bytes, a touched one what a
  chest costs (B3a1: at most 400). Traffic: unchanged (no new messages).
- No new runtime dependency.

## 7. Acceptance criteria

**AC1 – Generator 4**

- AC1.1 New worlds of both modes are generator 4. The world list says "· Caves · Loot", F3
  "Generator 4 · …". Generators 1–3 and all their checksums are unchanged.
- AC1.2 Every shaft's chamber holds exactly one chest at `shaftChestCell`. Generator 4
  chunks equal generator 3's except the chest cells (identity test, twelve presets).
- AC1.3 `TERRAIN_CHECKSUMS_1337_V4` (twelve) are pinned, in Node and in the browser.
- AC1.4 The walk check reaches the chest of each of the 48 spawn shafts in torch light and
  returns.
- AC1.5 Generation, faces, light and meshing stay within 6.10. The solo tests pass.

**AC2 – Loot**

- AC2.1 An untouched loot chest reads the derived contents: the starter table in the spawn
  shaft, the rich table elsewhere. The same seed always gives the same contents, and
  `LOOT_CHECKSUM_1337_V4` is pinned.
- AC2.2 The item rule of 6.2 holds for both tables (no tool, no natural block).
- AC2.3 An emptied loot chest stays empty after reload and after its chunk unloads and
  loads again. A partly emptied one keeps exactly what is left. A loot chest broken in
  Adventure gives the chest and its contents, or `full`. In Creative it answers `notEmpty`.
- AC2.4 The soak of 6.3 keeps every item total. Tests that touch blocks end with
  `verifyLight()` 0.

**AC3 – Rooms**

- AC3.1 The tests of 6.4 pass: host and guests hold equal contents and hashes after every
  move on an untouched loot chest, also a move that empties a slot.
- AC3.2 `e2e/mpLoot.spec.ts`: a host and a guest on two pages in a generator 4 room. The
  guest opens the spawn shaft's chest (through the test API) and takes one stack; both read
  the same rest. A third page joins later and reads the same. Every `mp*.spec.ts` still
  passes.

**AC4 – Save**

- AC4.1 6.5's save and reload holds (Node and browser with `save=1`). A generator 5 meta is
  `newer`. An untouched loot chest writes no state.

**AC5 – Radar**

- AC5.1 In a generator 4 world, the circle and the Map tab show the Chest symbol, and the
  legend has a Chest row. After `takeAll` or a break, the chest disappears from both
  within one scan.
- AC5.2 Generators 1–3 show exactly what they showed before (`e2e/radarPlaces.spec.ts` and
  `e2e/radar.spec.ts` unchanged).
- AC5.3 The places agreement test and the scan cost of 6.6 pass. A guest's radar hides a
  chest the host emptied (`mpLoot`).
- AC5.4 Reference `map-tab-loot` (the Map tab with a Chest row) exists and was looked at.

**AC6 – Bot**

- AC6.1 `scripts/progressRun.ts` and `--loot`: all 12 runs of each complete, light errors 0,
  and the limits of 6.7 hold. The report lists both runs, the trips and the accidental
  loots.
- AC6.2 `botV3.slow.test.ts`, `bot.slow.test.ts` and `botLoot.slow.test.ts` pass.

**AC7 – Hint and play**

- AC7.1 `e2e/chestHint.spec.ts` (6.8) passes for mouse, touch and pad. Reference
  `chest-hint` was looked at.
- AC7.2 `e2e/loot.spec.ts`: a generator 4 world. The player stands next to the spawn
  shaft's chest (test API). Real input then opens the chest (right click), quick-moves one
  stack, presses "Take all" and closes. With `save=1` the world reloads and the chest is
  empty. Reference `loot-chest` (the chamber with the chest, seen from the landing) was
  looked at.
- AC7.3 No console error or warning in the new and changed specs.

**AC8 – Docs**

- AC8.1 LOOT-1 to LOOT-7 are in `docs/device-tests-2.md` (section 9). `npm run docs:budget`
  passes with the moves of section 12 (no limit raised).

## 8. Test strategy

- **Pure first.** Generation identity, loot derivation, the item rule, the state rules,
  the room fix and the radar probe are unit tests in Node (memory transport for rooms).
  Browser specs prove the wiring: the world list, the screen with real input on a loot
  chest, the room, the radar on screen, the hint.
- **Frozen outputs** are guarded by checksums: V1–V3 unchanged, V4 and the loot checksum
  new.
- **Conservation** stays the main invariant of chest code: the soaks of 6.3 and 6.4 count
  every item kind.
- **The bot** measures the effect on the book (6.7); its numbers go into the report.
- **CI time:** three new browser specs (`loot`, `chestHint` in game shards, `mpLoot` in a
  multiplayer shard), added to the lightest shards of `e2e/shards.json`.
- **Local rule:** after each step `npm run check`, `npm run build` and the affected specs
  (`MC_CONTAINER_GPU_STALL=1`). Use one worker if pages crash for lack of memory (B2b's
  known issue).
- **Older specs** that pin generator 3 for new worlds adapt to 4: `e2e/caves.spec.ts`
  (form, list, F3), `e2e/worldMenu.spec.ts`, `e2e/inventory.spec.ts` ("Phase 7 AC5.1"
  checks the new generator's checksum and spawn). References that show the menu world are
  regenerated only if they change, and are looked at.

## 9. Device tests (origin "8B3b")

Added to `docs/device-tests-2.md`, new section "14. Loot (Phase 8 part B3b)", with a short
intro (what generator 4 adds, where the chests are, what the radar shows). Collected with
the other Phase 8 tests. The owner tests at the end of Phase 8, not per part.

- LOOT-1 PC: a new Adventure world. Find the chest in the shaft near the spawn. Is the
  starter loot worth the short trip? Is it clear it is a chest?
- LOOT-2 PC: after task 8, follow the radar's Chest symbol to a far shaft. Is the rich loot
  worth the walk? Does the book still feel paced (nothing skipped)?
- LOOT-3 PC, Phone: on circle and map, can you tell Chest from Shaft at a glance? Does the
  chest disappear after "Take all" and stay when one stack is left?
- LOOT-4 PC + Phone: a room. Both open the same untouched loot chest and the guest takes
  one stack. Do both see the same rest? Does a third player who joins later see it too?
- LOOT-5 PC, Phone, controller: the hint under the crosshair on a chest. Is it readable,
  does it help, is it in the way?
- LOOT-6 PC: an emptied loot chest stays empty after leaving and reopening the world.
- LOOT-7 PC: an old world (generator 3) opens unchanged, without loot chests. A new one
  shows "· Caves · Loot" in the world list.

## 10. Implementation steps

1. Generator 4: `TerrainV4`, the chest cell, version plumbing (form, list, F3, `gen=4`),
   checksums V4, identity test, speed and cost sides (6.1, 6.10; AC1.1–AC1.3, AC1.5).
2. Loot: `loot.ts`, tables, `lootAt`, `initialState`, the item rule, the loot checksum, the
   state rule tests and the soak (6.2, 6.3; AC2).
3. Rooms: the diff base fix in host and guest, `lootNet.test.ts` (6.4; AC3.1). Save tests
   (6.5; AC4.1).
4. Radar: the Chest kind, its symbol, the probe, the rescan, the agreement and cost tests
   (6.6; AC5.1–AC5.3).
5. Bot: chests in the way, `--loot`, the report, `botLoot.slow.test.ts`, the walk check on
   generator 4, the tuning check (6.7, 6.1; AC1.4, AC6).
6. Test API, `e2e/loot.spec.ts`, `e2e/mpLoot.spec.ts`, the radar spec and references, older
   specs (6.9, 8; AC3.2, AC5.4, AC7.2).
7. The crosshair hint and `e2e/chestHint.spec.ts` (6.8; AC7.1).
8. Device tests, docs (section 12), report `docs/phase-8b3b-report.md`, pull request.

## 11. For the owner and for the Pi side

- Nothing new on the Pi: no build variables, packages, signaling requests or lazy chunks.
  The room protocol does not change. Host and guest must run the same build (build id).
- **Rollback** (for the report's "For the Pi side"): a world made by this build is
  generator 4. An older build lists it as "Saved by a newer version", does not open it and
  never writes it. Back on this build it opens unchanged. Generator 3 worlds stay
  generator 3 and open on both builds. Rolling the Pi's main build back loses no data, but
  shared worlds made by this build cannot be played until it returns.
- The owner plays this part on its PR preview when convenient. Its device tests are
  collected for the end of Phase 8.

## 12. Documentation

- **Root `CLAUDE.md`** (limit 25 KB, not raised). The planning session moved the
  "Reading older docs" bullet of "Status" into `docs/architecture.md`, section "Reading
  older docs", leaving a one-line pointer (23.4 KB now). B3b adds one status row
  and changes the invariant line "Generator version" (now 4, loot chests). "Where the rules
  are" gets no new line (loot lives in `src/world/generation/CLAUDE.md`).
- `src/world/generation/CLAUDE.md`: section "Version 4" (chest cell, `lootAt`, tables
  frozen, checksums, identity test). `src/world/CLAUDE.md`: one sentence in "Block state"
  (`initialState` derives loot in generator 4).
- `src/net/CLAUDE.md` (23 bytes left): move its section "Measure and harden (Phase 6 part
  E)" into `docs/architecture.md`, new section "Network overlay and traffic", leaving one
  pointer line. Then add one sentence to "Chests in rooms" (changes are diffed against
  the derived state).
- `src/radar/CLAUDE.md` (7.2 KB): the Chest kind and the probe replace the extension point
  line "Another place kind (chests, B3)". If the file would pass 8 000 bytes, move its
  "On screen" paragraph into `docs/architecture.md`, section "Radar on screen", leaving a
  pointer line.
- `src/bot/CLAUDE.md`: chests in the way, `--loot`, the limits. `src/ui/CLAUDE.md`
  (7.6 KB): one line on the hint, else in `src/input/CLAUDE.md` if `ui` has no room.
  `docs/testing.md`: `gen=4`, `lootSites()`, what `world.chests` counts.
- `docs/device-tests-2.md` (section 9). `npm run docs:budget` passes in every commit.

## 13. Risks and fallbacks

- **Generation budget.** Generator 3 runs at 1.29–1.32 × against 1.35 ×. Generator 4 adds
  one cell write per shaft and should be the same. If the solo test proves flaky, add
  rounds or seeds to the test. Never change a generator.
- **Bot limits (6.7).** Lower the counts of the item that saves the time, before the merge
  only. Drop the item if that is not enough. Record it.
- **Radar symbol at Small.** If Chest and Shaft cannot be told apart on the 112 px circle
  (checked on the reference), the chest symbol's colour changes. The shapes stay.
- **A world without a spawn shaft** (none fitted within 128 blocks; none of the 48 test
  worlds) has no starter chest. Nothing depends on it: there is no task and the bot's
  first trip is skipped (counted in the report).
- **Root or nested budget.** Move further sections as section 12 says. Never raise a limit.
