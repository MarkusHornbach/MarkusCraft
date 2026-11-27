# Phase 8 part B3a plan – Chests as storage

Read `CLAUDE.md`, `src/world/CLAUDE.md`, `src/save/CLAUDE.md`, `src/actions/CLAUDE.md`,
`src/items/CLAUDE.md`, `src/net/CLAUDE.md`, `src/progress/CLAUDE.md`, `src/bot/CLAUDE.md`,
`src/ui/CLAUDE.md`, `src/input/CLAUDE.md` and `e2e/CLAUDE.md` first, and the "Decisions and
deviations" of `docs/phase-3a-report.md` and `docs/phase-6c-report.md` (save format),
`docs/phase-3b-report.md` and `docs/phase-5b-report.md` (inventory screen, controller),
`docs/phase-6b-report.md` (protocol, snapshot), `docs/phase-8a1-report.md` and
`docs/phase-8a2-report.md` (task book, bot, shared progress) and `docs/polish-2-report.md`
(save format 5).

Phase 8 part B3 ("storage and loot") is planned in pieces. **B3a** (this plan) is the chest
as storage. It is built in **two parts**, each one implementation session, one branch and
one pull request:

- **B3a1 – Block state and chest storage** (sections 6.1–6.8, AC1–AC4): the state
  infrastructure, the chest block, the chest actions, save format 6, rooms, the test API.
  No screen: on `main` the chest exists only through the test API (not craftable, not in
  the palette, the place input does not open it).
- **B3a2 – Chest screen, task and Creative** (sections 6.9–6.14, AC5–AC8): the screen for
  mouse, touch and controller, opening by the place input, the recipe and its unlock, task
  21 with book version 2, the bot skill, the palette, the device tests.

B3a2 starts from `main` after B3a1 is merged. If B3a1 is not merged yet, B3a2 starts from
B3a1's branch and its report says so. Work on the branch assigned to the cloud session,
else `phase-8b3a1-chest-state` / `phase-8b3a2-chest-screen`. Both sessions are autonomous:
do not ask the owner questions. Where this plan leaves a detail open, choose the simplest
option consistent with it and note it in the part's report (`docs/phase-8b3a1-report.md`,
`docs/phase-8b3a2-report.md`), section "Decisions and deviations".

Tests name their criterion in the title as "Phase 8B3a AC1.1". Device tests have the
origin "8B3a2".

## 1. Goal

An Adventure player gets a **chest**: a craftable block with 27 slots that keeps items in
the world. It is the first block with **state**. Its contents are saved with the world,
survive breaking (they go into the breaker's inventory, or the break is refused), and are
shared in rooms: two players can use the same chest at once, and a guest who joins sees the
current contents. A new task teaches it ("Store 32 stone in a chest"). Creative worlds get
the chest in the palette and can store items from the bar.

The state infrastructure is written for later parts: chests with generated loot (B3b) and
the furnace with contents (after B3b) add a state kind, not a new mechanism.

## 2. Findings of the planning session

- **No items on the ground.** The game has no dropped-item entities: items go into an
  inventory or are lost (the support rule loses a torch that does not fit). "The contents
  fall out" would need a new system, so the break rule moves them into the breaker's
  inventory or refuses the break (decision 2).
- **A new task reopens finished chapters.** The open chapter is derived as the first
  chapter with a task not done. Adding task 21 to chapter 3 would send every world that
  has finished chapter 3 back to it. Hence the book version (decision 7): an upgrade rule
  marks the new task done in such worlds, once.
- **The screen does not fit a 640 × 360 phone as it is.** Slots are 48 px with 6 px gaps:
  27 chest slots, 27 inventory slots and the bar are 7 rows, about 380 px before a header.
  On screens up to 480 px high the slots shrink (decision 3).
- **No "use" input exists.** Right click, the touch button `place` and the pad's place
  trigger only place blocks; the workbench and furnace work by being near. Opening a chest
  takes the place input when the crosshair is on a chest (decision 4).
- **Edits live for the whole world in memory** (`World.edits`, kept when chunks unload) and
  go to a joining guest as snapshot parts; the host reads unloaded chunks through
  `FarReader`. Chest states follow the same path (`World.states`), so a guest can use a
  chest in a chunk the host has not loaded.
- **Blocks have no facing.** Workbench and furnace look the same from every side. The chest
  does too (front pattern on all four sides), so no orientation is stored. It is a full
  opaque cube: faces, light and the mesher are unchanged.
- **Rollback is safe by construction.** `decodeMeta` answers `newer` for a format above the
  build's (`saveFormat.ts`): an older build lists a format 6 world as "Saved by a newer
  version", does not open it and writes nothing to it. Back on the newer build it opens as
  before (section 11).
- **The 8A2 lesson:** a new refusal reason must be added to the guest's decoder in
  `protocol.ts` (`locked` was missing there and a guest dropped the answer). The new reason
  `notEmpty` has a protocol test (AC3.4).
- **Nested docs near their budget:** `src/net/CLAUDE.md` is 7.3 KB and `src/ui/CLAUDE.md`
  7.5 KB of 8 KB; the root is 23.1 KB of 25 KB. Section 12 says what moves where.
- **The Pi side:** `sync/status.md` of the owner's Pi repository could not be read in the
  planning session (access to that repository was refused). Each implementation session
  reads it if it is reachable (root `CLAUDE.md`, "Owner decisions").

## 3. Decisions made with the owner

| #   | Topic          | Decision                                                                                                                                                                                                                                                                       |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Split          | Two parts: B3a1 (state, chest block, actions, save format 6, rooms, test API, no screen) and B3a2 (screen, opening, recipe and unlock, task, bot skill, palette, device tests)                                                                                                 |
| 2   | Break rule     | Adventure: breaking a chest puts the chest item **and all its contents** into the breaker's inventory; if not everything fits, the break is refused (`full`, checked at `startBreak` and `break`). Nothing is lost. Creative: refused while the chest holds items (`notEmpty`) |
| 3   | Size and phone | 27 slots (3 × 9). On screens up to 480 px high the screen's slots shrink to about 38 px (icons 28 px) and the hint line hides, so chest, inventory and bar fit 360 px without scrolling; slots stay at least 36 px                                                             |
| 4   | Opening        | The place input (right click, touch `place`, the pad's place trigger) opens a chest under the crosshair instead of placing against it. Building on a chest means aiming at another block                                                                                       |
| 5   | Task           | The chest recipe (recipe 21: 8 planks at a workbench → 1 chest) unlocks with task 6 "Mine 64 stone". New task 21 in chapter 3: "Store 32 stone in a chest", new task type `store` (items moved from a player into a chest count; taking out does not subtract)                 |
| 6   | Creative       | The chest is in the palette. It opens; the screen shows the chest and the 9 bar slots. Moving works as in Adventure; breaking is refused while it holds items                                                                                                                  |
| 7   | Book version   | Save format 6 adds `progress.book` (1 = today's 20 tasks). B3a2 adds book 2 with an upgrade rule (task 21 done, without XP, where tasks 9–12 are done). Later parts that add tasks add an upgrade rule, no save format                                                         |
| 8   | Additions      | Quick move, "Take all", "Also open: …" in rooms, F3 row "Chests" (section 4)                                                                                                                                                                                                   |

## 4. Changes to the original scope

The owner's starting scope was challenged during planning. Agreed changes:

| #   | Change                                                                                                                        | Reason                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Split into B3a1 and B3a2                                                                                                      | Estimated 1.6–1.8 typical parts (the inventory screen of 5B alone was one). The state and save design is proven in rooms before the screen depends on it                           |
| 2   | The recipe, the task, the palette entry and opening by the place input come in B3a2, not with the block                       | `main` must never have a chest players can make but not open                                                                                                                       |
| 3   | The task does not unlock the recipe; task 6 does. The new task uses the chest ("Store 32 stone in a chest", new type `store`) | A task that unlocks the chest has nothing to do with chests; a task after the unlock teaches that a chest opens and stores. Task 6 is when the inventory starts filling with stone |
| 4   | Added: book version in the save (`progress.book`) with upgrade rules                                                          | Task 21 would reopen chapter 3 in worlds past it. A book version makes the fix one-off and reusable: later task additions need no save format change                               |
| 5   | Added: quick move (double click / double tap a slot, pad X) moves a stack to the other side                                   | Pick-then-place across two grids costs two presses per stack; on touch and controller quick move halves that                                                                       |
| 6   | Added: "Take all" button                                                                                                      | Empties a chest into the inventory in one press, before breaking it or after a trip                                                                                                |
| 7   | Added: in rooms, "Also open: Anna" on the chest screen; the host tracks who has which chest open (`openChest` / `closeChest`) | Two players using one chest see that someone else is moving items                                                                                                                  |
| 8   | Added: F3 row "Chests" (chests with contents, size of the state data)                                                         | Makes the save and snapshot cost visible on real devices                                                                                                                           |
| 9   | Added: a second device test file `docs/device-tests-2.md` for Phase 8 part B3 and later                                       | `docs/device-tests.md` is at 24.4 of 25 KB; the owner chose a second file over moving text out or raising the limit                                                                |

## 5. Out of scope (do not build)

- A furnace with contents or with fuel; any other state kind than `chest`.
- Loot, chests in generated places, deriving contents from seed and position (only the
  hook, 6.2), generator 4, radar kinds for chests.
- Health, creatures, new materials or tool tiers, new items besides the chest.
- Items on the ground, dropping items, a chest item that carries its contents.
- Double chests, chest facing or orientation, an opening lid animation, sounds.
- Locking chests, chest names, sorting buttons, splitting stacks (half stacks), dragging.
- Changes to generation (every checksum stays), the radar, light rules or the mesher.
- Any change to tasks 1–20, their counts or XP, or the level thresholds, except as 6.12
  allows.
- The rest of Phase 7, Web Workers (Phase 4 part C).

## 6. Specification

### Part B3a1 – Block state and chest storage

#### 6.1 The chest block and item (`src/world/blocks.ts`, `src/items/`)

- `Block.CHEST = 20` (append-only), name `chest`, label "Chest": a solid opaque cube,
  breakable, no hotbar slot of its own. Tiles `CHEST_TOP` and `CHEST_SIDE` (appended to
  `Tile`; the bottom uses `CHEST_TOP`), painted in `tiles.ts`: dark-framed planks with a
  band and a latch on the side, a lid with a frame on top. Original pattern, generated by
  code (hard rule 1); the atlas grows by two tiles.
- Item 20 (the block item), stack size `STACK_SIZE`. Break time and tool class as the
  workbench (1.5 s, axe).
- **B3a1 only:** a flag keeps the chest out of the Creative palette (`BLOCK_ITEMS` stays as
  it is for the palette; for example `PALETTE_ITEMS` without the chest), and there is no
  recipe row for it. The test API gives it (`give(20, n)`).

#### 6.2 Block state (`src/world/blockState.ts`, `World.ts`)

- `BlockState` is a union of plain, immutable, JSON-safe values with a `kind`. Today one
  member: `ChestState { kind: 'chest'; slots: readonly (ItemStack | null)[] }` with exactly
  `CHEST_SLOTS` (27, `config.ts`) entries. `STATE_KIND_OF_BLOCK` maps a block id to the
  kind its cells carry (only `Block.CHEST → 'chest'`).
- `World.states: Map<chunkKey, Map<blockIndex, BlockState>>` for the whole world, kept when
  a chunk unloads (like `World.edits`), taken over from a loaded world. `World.getState(x,
y, z)` reads; `World.setState(x, y, z, state | null)` writes.
- **Rules.** A state exists only in a cell whose block has that state's kind.
  `World.setBlock` of a cell to a block of another kind removes the cell's state in the same
  call. A chest cell without a stored state reads as `initialState(…)`, which today is an
  empty chest. Once a chest is touched (placed, an item moved in or out), its state is
  stored explicitly, also when empty, so a later generator that derives initial contents
  (B3b) never refills a chest a player emptied.
- **The hook** for B3b: `initialState(block, x, y, z, source)` in `blockState.ts`, where
  `source` is the world's `TerrainSource`; today it ignores `source` and returns the empty
  state of the block's kind. Do not build any derivation.
- **Who writes.** `setState(` is called only where `setBlock(` may be called today
  (`actions/Session.ts`, `net/HostSession.ts`, `net/ClientSession.ts`, one test tool in
  `Game.ts`); `pipeline.test.ts` gets the same guard. State never touches light.
- A state that loads for a cell whose block (terrain plus edits) has another kind is
  dropped when its chunk is generated, and counted (`World.droppedStates`, shown in the F3
  row; a unit test makes one).

#### 6.3 The action layer (`src/actions/`)

- `ActionContext.states` reads states (`getState(x, y, z)`; a `FarReader` on the host
  answers for unloaded chunks from `World.states`). An accepted `ActionResult` gets an
  optional `states: StateChange[]` (`{ x, y, z, state }`, `state` null to remove), applied
  by the session after the blocks. Absent means no state changed.
- **New actions** (both modes; all check the cell with `checkCell`, reach as for blocks,
  and that the block there is a chest, else `invalid`):
  - `chestMove { x, y, z, from, fromChest, to, toChest, item }`: moves the stack of one
    slot to another, inside the chest, inside the player's slots or between the two, with
    `moveStack`'s rules (move, merge, swap; Creative swaps equal items as today). `item` is
    the item the screen showed in `from`; if the slot holds another item or is empty, the
    answer is `missing`, so two players racing for one stack never take the wrong one.
  - `quickMove { x, y, z, slot, fromChest, item }`: moves the stack to the other side,
    merging into stacks of the same item first, then into the first free slot (chest: slot
    order; player: the 27 inventory slots first, then the bar; Creative: the bar). What
    does not fit stays; `full` if nothing moved, `missing` as above.
  - `takeAll { x, y, z }`: chest slots in order, each by the quick move rule into the
    player; `missing` if the chest is empty, `full` if nothing moved.
  - `openChest { x, y, z }` and `closeChest {}`: change no state. `openChest` checks reach
    and the block; the sessions remember which chest each player has open (6.5). A player
    has at most one open; a new `openChest` replaces it.
- **Creative:** player slots are the bar only; `from` / `to` / `slot` of 9–35 on the player
  side are `invalid`.
- **Breaking a chest** (`startBreak` and `break`): Adventure: the chest item and every
  stack of its contents must fit into the breaker's inventory (one combined `fits` check),
  else `full`; an accepted break adds them all, removes the state and reports one notice
  per item kind ("+1 Chest", "+64 Stone"). Creative: `notEmpty` while any slot holds an
  item; an empty chest breaks. The support rule is unchanged (a torch may stand on a chest).
- Placing a chest stores an explicit empty state for the cell (`states` of the result).
- New refusal reason `notEmpty`, text "Empty the chest first". `full` on a chest says "No
  room for the chest's items". The HUD maps both.
- The pipeline guard (`pipeline.test.ts`): `setState(` as above; chest slots are changed
  only inside `src/actions/` (a new inventory-like function set for chest slots lives in
  `src/items/inventory.ts` and follows the slot-changing rule).

#### 6.4 Save format 6 (`src/save/saveFormat.ts`)

- `SAVE_FORMAT_VERSION` 6. **Chunk records** get `states`: a list of `[index, kind,
slots]`, `slots` as `[slot, item, count, …]` triples of the filled slots. A chunk record
  may hold states without edits (B3b's generated chests have no edit). Validation: index in
  the chunk, one state per index, `kind` known to the format, slot 0–26 once each, item id
  1–65 535 (unknown ids load as "Unknown item"), count 1–`STACK_SIZE`. A state that does not
  check out makes the world damaged, as a bad edit does.
- **State kinds belong to the format.** A new kind (the furnace) needs a new format
  version, like a generator version: a format 6 record with an unknown kind is damaged.
- **`progress.book`** (decision 7): an integer ≥ 1 in the meta's progress. Format 6 without
  a valid `book` is damaged; a `book` above the build's `BOOK_VERSION` makes the world
  `newer` (so a B3a2 world is never opened by a B3a1 build). Formats 1–5 load with `book` 1
  and no states, and are written back as 6. B3a1's `BOOK_VERSION` is 1 and has no upgrade
  rules (the mechanism, `upgradeBook(progress)` in `src/progress/`, is built and tested
  with test tables).
- Edited chunks with states are marked dirty like edited chunks (`Autosave`); saving a
  world writes the chunk records of chunks whose blocks or states changed.

#### 6.5 Rooms (`src/net/`)

- **Snapshot:** snapshot parts carry states next to edits (`snapshot { part, chunks,
states }`, `states` as in the chunk record with chunk coordinates), split by
  `SNAPSHOT_PART_BYTES` like edits; a state is never split across parts. `joinParts`
  returns both. `worldHash` covers states too (order-independent), so equal hashes mean
  equal blocks and contents.
- **Changes:** after an accepted action with state changes the host sends every guest
  `chest { x, y, z, slots }` with only the changed slots (`[slot, item, count, …]`, count 0
  empties; a removed state is its own form, `chest { x, y, z, gone: true }`), after
  `blocks` and before the changed `record`s. The guest applies them with `World.setState`.
- **Viewers:** the host keeps the open chest of every player (its own too) and sends
  `viewers { x, y, z, ids }` to each player who has that chest open whenever the set of its
  viewers changes (open, close, leave, the chest broken). A player who leaves or whose
  chest is broken has nothing open. `openChest` / `closeChest` count towards `rate`.
- **Decoders** for `chest`, `viewers`, the snapshot's `states`, the new actions and
  `notEmpty`, with the save format's limits; fuzz pieces for each.
- Guests' saved entries are unchanged (a guest's items are in its record; chest contents
  belong to the world, saved by the host).

#### 6.6 Test API and F3 (`src/game/`)

- `getChest(x, y, z)`: the slots (as `{ item, count } | null`) or null if no chest is there.
- `getState().world.chests`: the number of chests with at least one item.
- `give(20, n)` works; `submit` takes the new actions; `getState().worldHash` covers
  states.
- F3 row "Chests": "3 chests · 1.2 kB" (chests with contents, the JSON size of all states),
  plus "· 1 dropped" when `droppedStates` > 0. Shown in both modes when the world has
  chests.

#### 6.7 Tests of B3a1

- Unit: `blockState.test.ts` (rules of 6.2), `chest.test.ts` in `src/actions/` (every
  action, refusal and the break rule in both modes), `saveFormat.test.ts` (format 6, the
  migration of 1–5, damaged and newer cases, `book`), `snapshot.test.ts`, `protocol.test.ts`,
  `chestNet.test.ts` over the memory transport (two and four players, the soak of AC3.3,
  traffic AC3.5), `pipeline.test.ts`.
- Browser: `e2e/chest.spec.ts` (single-player through the test API: place, move, break,
  save and reload, F3 row) and `e2e/mpChest.spec.ts` (a room: both players move items in
  one chest, a guest joins late and sees the contents, hashes equal).
- Light: every test that sets blocks ends with `verifyLight()` 0.

#### 6.8 Budgets (both parts)

- Faces per chunk, light time, meshing time and radar scan: unchanged (the chest is an
  opaque cube; nothing in generation, light, mesher or radar changes). Every generator
  checksum stays. The existing solo tests must pass unchanged.
- Save: a full chest with 27 different stacks is at most 400 bytes in its chunk record.
- Traffic: four moving players in a room, each guest making two chest moves a second in
  one shared chest: the host sends at most 20 kB/s (AC3.5; 8A2 measured 16.5 kB/s for its
  worst case).
- No new runtime dependency.

### Part B3a2 – Chest screen, task and Creative

#### 6.9 Opening and closing (`Game.ts`)

- The place input with a chest under the crosshair submits `openChest`; the screen opens
  when the answer is accepted (`onResult`, never from `submit`'s return). The inventory
  screen and the chest screen are never open together.
- The screen closes with E, Esc, the pad's Y or B (B first puts a picked slot down, as on
  the inventory), the touch button `bag`, "Close", when the cell is no longer a chest, and
  when the player's eye is farther than `REACH + REACH_TOLERANCE` from the chest's centre;
  each close submits `closeChest`. Like the inventory it does not pause the game, hides the
  HUD and covers the touch controls; closing requests the pointer lock again.

#### 6.10 The chest screen (`src/ui/ChestScreen.ts`)

- Layout from top: header (title "Chest", in rooms the line "Also open: Anna, Ben" when
  others have it open, "Take all", "Close"), the chest's 27 slots (3 × 9), the player's 27
  inventory slots (3 × 9), the bar (9). Creative: the chest and the bar only. No bin, no
  tabs.
- **Moving:** pick-then-place as on the inventory (activate a slot, then another; the
  picked slot is marked; activating it again puts it down), across both grids; each move is
  one `chestMove` with the shown item. **Quick move:** two activations of the same slot
  within `QUICK_MOVE_MS` (350, simulation time) with nothing picked before the first, or
  the pad's X on the focused slot: one `quickMove`. "Take all": `takeAll`.
- Slots show counts; the chest's slots update when the session reports state changes (a
  second player's moves show at once). A picked slot whose stack changed under it (another
  player) is put down.
- **Sizes:** desktop slots 48 px as the inventory. On screens up to 480 px high slots are
  about 38 px (icons 28 px, at least 36 px), gaps 4 px, the hint line hidden: chest,
  inventory, bar and header fit 640 × 360 without scrolling (AC5.3).
- **Controller:** `data-pad-default` on the first chest slot, `data-pad-back` on "Close";
  the D-pad moves through both grids with `nextFocus` (a bad neighbour is fixed in
  `focusMove.ts` with a unit test, never per screen); A picks or places, X quick moves, Y
  closes, Start closes and pauses. Hints (`hintsFor`): "A Move · X Quick move · Y Close".
  Slots have `aria-label`s ("Chest slot 3: Stone", "Slot 12: Planks").
- The F3 row and the HUD texts of 6.3 come from B3a1.

#### 6.11 The recipe and the palette (`src/items/recipes.ts`, `src/progress/tables.ts`)

- Recipe 21 `chest`: 8 planks at a workbench → 1 chest; unlock `{ task: 6 }` ("Task: Mine
  64 stone" on the locked row). The chest joins the Creative palette (after the furnace in
  table order, or the end of the palette).

#### 6.12 Task 21 and book version 2 (`src/progress/`)

- Task type `store` (target an item id): counts items a player moves from its own slots
  into a chest (`chestMove`, `quickMove`; not `takeAll`, not moves inside the chest). New
  event `{ kind: 'store', item, count }` in `eventsOf`; one `case` in `advance`, one in
  `check.ts` (the item must be producible and the chest recipe unlocked before the task's
  chapter is played), one skill in the bot.
- Task 21, chapter 3, "Store 32 stone in a chest", `store`, `Block.STONE`, 32, 20 XP; in
  book order after task 12. In rooms a guest's stores count too (the host steps the book).
- **Book version 2** (`BOOK_VERSION` 2): `upgradeBook` turns a book 1 into book 2: if
  tasks 9, 10, 11 and 12 are done, task 21 is done too (no XP, no notice); otherwise
  nothing changes. Applied when a world loads (decode) and when a host's room opens with an
  older book; a book 2 is never upgraded again. Written into `src/progress/CLAUDE.md` as
  the rule for later task additions.
- The level thresholds stay. If the bot's targets (30–45 minutes, no task median above 5,
  no chapter above 12, no level gap above 8) fail with task 21, its count may come down to
  16 (label "Store 16 stone in a chest"); nothing else is tuned. Record the result.

#### 6.13 The goal bot (`src/bot/`)

- Skill `storeOne`: obtain a chest (craft it through `obtain`), place it next to itself,
  `openChest`, move stone with `quickMove` / `chestMove` until the task is done,
  `closeChest`, then break the chest (its contents come back) and carry on. Time model:
  `actionRepeatMs` per move. `scripts/progressRun.ts` and both bot slow tests stay green
  (all 12 runs complete, light errors 0), the dark-break table of tasks 1–11 is unchanged
  (chests need no light), and the radar and places checks still agree.

#### 6.14 Older specs and references

- Specs that count tabs, recipes, palette entries or tasks adapt (the recipe list has 21
  rows, chapter 3 five tasks, the palette one more block). References that show the recipe
  list, the palette, the Tasks tab or chapter 3 are regenerated and looked at.

## 7. Acceptance criteria

### Part B3a1

**AC1 – Block state**

- AC1.1 `setBlock` of a chest cell to another block removes its state; placing a chest
  stores an empty state; a chest without a stored state reads as empty (`initialState`).
- AC1.2 States survive unloading and reloading their chunk; a loaded state on a cell that
  is no chest is dropped and counted.
- AC1.3 `pipeline.test.ts` fails for a `setState(` call outside the allowed files and for
  chest slot changes outside `src/actions/`.
- AC1.4 Every generator checksum and the light checksum are unchanged; the solo speed tests
  pass.

**AC2 – Actions and the break rule**

- AC2.1 `chestMove` moves, merges and swaps in both directions and inside each side;
  `missing` when `item` differs from the slot; `reach` beyond reach; `invalid` on a cell
  that is no chest and for Creative player slots 9–35.
- AC2.2 `quickMove` and `takeAll` follow 6.3 (merge first, then free slots; partial moves;
  `full`, `missing`).
- AC2.3 Adventure: breaking a chest whose contents and item fit puts all of them into the
  inventory with notices and removes the state; if not everything fits, `startBreak` and
  `break` answer `full` and nothing changes. Creative: `notEmpty` while it holds items;
  empty, it breaks.
- AC2.4 A soak of 2 000 random chest and inventory actions (two chests, one player, both
  modes) keeps the total of every item kind constant (no item made or lost) except where a
  break of an empty chest or a placed chest changes the chest count by one.

**AC3 – Rooms**

- AC3.1 A guest who joins after items were stored gets every state in the snapshot;
  `worldHash` equals on host and guest.
- AC3.2 Two players moving items in one chest: both see each change at once; a race for one
  stack gives it to one of them, the other gets `missing`; nothing is duplicated.
- AC3.3 A soak over the memory transport (host and three guests, 1 000 random chest
  actions, two chests, one in a chunk the host has not loaded) ends with equal states and
  hashes on every player and the item totals conserved.
- AC3.4 The decoders refuse malformed `chest`, `viewers`, snapshot `states` and new actions
  (at least 10 cases each); `notEmpty` round-trips to a guest.
- AC3.5 Traffic as in 6.8: at most 20 kB/s from the host.
- AC3.6 `viewers` reaches each viewer when another player opens, closes, leaves or breaks
  the chest.
- AC3.7 `e2e/mpChest.spec.ts`: a host and a guest on two pages move items in one chest
  through the test API; a third page joins late and reads the same contents; every
  `mp*.spec.ts` still passes.

**AC4 – Save format 6**

- AC4.1 A world with chests saves and reloads with the same contents (Node and
  `e2e/chest.spec.ts` with `save=1`).
- AC4.2 Format 1–5 fixtures load with `book` 1 and no states and are written back as 6
  (`e2e/save.spec.ts` fixtures updated).
- AC4.3 A format 6 record with a bad state (index, slot, count, unknown kind) is damaged; a
  `book` above `BOOK_VERSION` is `newer`; a record with format 7 is `newer`.
- AC4.4 A full chest of 27 different stacks costs at most 400 bytes in its chunk record.

### Part B3a2

**AC5 – The chest screen**

- AC5.1 PC: right click on a chest opens the screen; the player moves a stack from the
  inventory into the chest and back with mouse clicks, quick moves with a double click,
  empties it with "Take all"; Esc and E close it. Right click on another block still
  places.
- AC5.2 Touch (640 × 360): the `place` button on a chest opens it; taps move, a double tap
  quick moves; `bag` and "Close" close it.
- AC5.3 At 640 × 360 (touch) and 915 × 412 every slot, "Take all" and "Close" lie inside
  the view without scrolling, slots at least 36 px; at 1280 × 800 slots are 48 px.
- AC5.4 Controller: the place trigger opens; the D-pad reaches every slot of both grids
  and "Take all" (a walk over all 63 slots); A, A moves; X quick moves; B puts a picked
  slot down, else closes; Y closes.
- AC5.5 The screen closes when the chest is broken (by the other player in a room) or the
  player is moved out of reach; `closeChest` is sent.
- AC5.6 Rooms: "Also open: Anna" appears on both screens when two players open the same
  chest and goes when one closes; a move by one shows on the other's screen.
- AC5.7 Creative: the screen shows chest and bar only; moving works; breaking a filled
  chest shows "Empty the chest first".
- AC5.8 References `chest-screen`, `chest-screen-touch`, `pad-chest-screen` and the chest
  block in the world (`chest-block`) exist, were looked at, and no console error or
  warning appears.

**AC6 – Recipe, task and book**

- AC6.1 The chest recipe is locked ("Task: Mine 64 stone") until task 6 and craftable at a
  workbench afterwards.
- AC6.2 Task 21 counts stone moved into a chest (quick move and moves), not taking out or
  moves inside the chest; done at 32 with 20 XP; in a room a guest's stores count.
- AC6.3 Book upgrade: a book 1 with tasks 9–12 done gets task 21 done without XP; one with
  chapter 3 open keeps task 21 open; a book 2 is unchanged; a format 5 world past chapter 3
  opens in its chapter (Node and a browser fixture).
- AC6.4 `checkTables` passes and names the chest recipe as unlocked before chapter 3.
- AC6.5 Browser: a play-through with real input from "task 20 of 21 open" (stone and a
  chest given): place the chest, open it, move 32 stone in; the notice "Task done: Store 32
  stone in a chest · +20 XP" shows.

**AC7 – The bot**

- AC7.1 `scripts/progressRun.ts`: all 12 runs complete, light errors 0, the targets of
  6.12 hold; the report lists task 21's median and maximum and the dark breaks of tasks
  1–11 equal B2b's.
- AC7.2 `bot.slow.test.ts` and `botV3.slow.test.ts` pass with task 21.

**AC8 – Creative and docs**

- AC8.1 The chest is in the palette and can be placed from the bar.
- AC8.2 Device tests CHEST-1 to CHEST-8 are in the new `docs/device-tests-2.md` (plan
  section 9); `npm run docs:budget` checks it like the first file.

## 8. Test strategy

- **Pure first.** State rules, actions, save, book upgrade and the net logic are unit
  tested in Node (memory transport for rooms). Browser specs prove the wiring and the
  screen, through real input where a person would act (AC5, AC6.5) and through the test API
  for set-up.
- **Conservation** is the main invariant of this part: AC2.4 and AC3.3 count every item
  kind before and after.
- **Room specs** run in the `multiplayer` project; the soak runs in Node, so CI time grows
  by at most two browser specs per part. Add the new specs to `e2e/shards.json` (lightest
  shard); a session that sees a shard above 15 minutes rebalances (root `CLAUDE.md`, "CI").
- **Local rule:** after each step `npm run check`, `npm run build` and the specs the step
  touches (`MC_CONTAINER_GPU_STALL=1`), one worker if pages crash for lack of memory
  (B2b's known issue).
- **References** are looked at by eye after regeneration (AC5.8).

## 9. Device tests (origin "8B3a2")

`docs/device-tests.md` is at 24.4 of 25 KB. B3a2 creates **`docs/device-tests-2.md`** for
Phase 8 part B3 and later: the same "How to use it" rules in short (it points to the first
file's header for "How it is kept up to date" and the seed 1337 conventions), "Last
updated", and section "13. Chests (Phase 8 part B3)" (numbering continues). Passed and
obsolete tests of both files go to `docs/device-tests-done.md`. Nothing moves out of the
first file; its header gets one line pointing to the second, and the root `CLAUDE.md`
section "Tests on real devices" names both. `scripts/ci/docsBudget.mjs` checks the second
file with the same limit (`DEVICE_TESTS` becomes a list) and its paths with the link check.

- CHEST-1 PC: open a chest, move items in and out with clicks and double clicks, "Take
  all": does it feel quick and clear?
- CHEST-2 Phone: the chest screen at the phone's size: slots and counts readable, taps hit
  the slot meant, double tap works without moving a wrong stack?
- CHEST-3 Controller: open with the trigger, D-pad through both grids, A/A and X: is the
  focus path sensible?
- CHEST-4 Two players, one chest: both move items; "Also open" shows; nothing disappears
  or doubles.
- CHEST-5 A guest joins a world with filled chests and finds the same contents.
- CHEST-6 Break a filled chest: everything arrives in the inventory; with a full inventory
  the break is refused and the text says why.
- CHEST-7 An old world (made before B3a1) past chapter 3 opens in its chapter; one in
  chapter 3 gets the new task.
- CHEST-8 Task 21: is it clear what to do (the place input opens a chest)?

## 10. Implementation steps

### B3a1

1. Block, item, tiles and the palette flag (6.1); `blocks.test.ts`, `items.test.ts`.
2. Block state in `World` with the rules, the hook and the guards (6.2, AC1).
3. Actions and the break rule, refusal texts (6.3, AC2).
4. Save format 6 with `states` and `progress.book`, `upgradeBook` with test tables (6.4,
   AC4).
5. Rooms: snapshot, `chest`, `viewers`, decoders, `worldHash` (6.5, AC3.1–AC3.6).
6. Test API, F3 row (6.6); `e2e/chest.spec.ts`, `e2e/mpChest.spec.ts` (AC3.7, AC4.1).
7. Docs (section 12), report `docs/phase-8b3a1-report.md`, pull request.

### B3a2

1. Recipe 21, unlock, palette (6.11, AC6.1, AC6.4, AC8.1).
2. Task type `store`, event, task 21, book 2 and its upgrade (6.12, AC6.2, AC6.3).
3. Bot skill and tuning check (6.13, AC7).
4. Opening and closing (6.9) and the chest screen with mouse (6.10, AC5.1, AC5.5, AC5.7).
5. Touch and the short-screen layout (AC5.2, AC5.3), then the controller (AC5.4).
6. Rooms on screen: viewers line, live updates (AC5.6); older specs and references (6.14,
   AC5.8); the play-through (AC6.5).
7. Device tests, docs (section 12), report `docs/phase-8b3a2-report.md`, pull request.

## 11. For the owner and for the Pi side

- Both parts need nothing new on the Pi: no build variables, packages or signaling
  requests. The room protocol changes in both parts (B3a1: snapshot `states`, `chest`,
  `viewers`, new actions; B3a2: none expected), so host and guest must run the same build
  (the build id ensures it).
- **Rollback** (for the report's "For the Pi side"): a world saved by B3a1 or later is
  format 6. An older build lists it as "Saved by a newer version", does not open it and
  never writes it; after going back to the newer build the world opens unchanged. A world
  saved by B3a2 (book 2) is likewise "newer" for a B3a1 build. Worlds that were not opened
  by the new build stay format 5 and open on both. Rolling the Pi's main build back
  therefore loses no data, but shared worlds opened by the new build are unplayable until
  it returns.
- The owner plays each part on its PR preview; CHEST-1 to CHEST-8 need B3a2's preview.

## 12. Documentation

- **Root `CLAUDE.md`** (23.1 KB, limit 25 KB, not raised): each part adds one status row;
  the invariant lines "Saving" (format 6, block states, book version) and "Stable ids"
  (state kinds belong to the format) change by a few words; "Where the rules are" gets no
  new line (block state lives in `src/world/CLAUDE.md`). Anything longer goes into nested
  files.
- **B3a1:** `src/world/CLAUDE.md` new section "Block state" (rules of 6.2);
  `src/save/CLAUDE.md` "Version 6"; `src/actions/CLAUDE.md` the new actions, `notEmpty`,
  the break rule; `src/net/CLAUDE.md` "Chests in rooms" — to make room, move its section
  "The network test (Phase 6 part A)" into `docs/testing.md` and leave one line pointing
  there; `docs/testing.md` (test API, F3).
- **B3a2:** `src/ui/CLAUDE.md` "The chest screen" — to make room, move "The 'New world'
  form and the world list" into `src/game/CLAUDE.md` (screens); `src/input/CLAUDE.md` (the
  chest screen's focus marks and X); `src/progress/CLAUDE.md` (`store`, book versions and
  the rule for later task additions); `src/bot/CLAUDE.md` (`storeOne`); `docs/device-tests-2.md` and the budget script (section
  9).
- `npm run docs:budget` passes in every commit.

## 13. Risks and fallbacks

- **Phone fit (AC5.3).** If 38 px slots and the hidden hint do not fit with CI's wider
  font, the header moves beside the chest grid on screens up to 480 px high (as B2b did
  with the Map tab); slots never go below 36 px.
- **Double tap versus pick-then-place.** If the 350 ms window makes ordinary second
  presses quick moves on touch (a picked slot put down by mistake), quick move on touch
  becomes a long press of 500 ms instead; record it.
- **Traffic.** If AC3.5 exceeds 20 kB/s, `chest` messages of one host step are merged per
  chest (one message with all changed slots) before anything else is cut.
- **Bot targets.** If task 21 pushes a target over its limit, the count comes down to 16
  (6.12); thresholds stay.
- **Root budget.** If the root would exceed 25 KB, shorten the status table's last column
  for rows of finished parts before touching rules.
- **B3a1 unmerged when B3a2 starts:** B3a2 branches from B3a1's branch and its pull request
  says it contains B3a1 until that one is merged.
