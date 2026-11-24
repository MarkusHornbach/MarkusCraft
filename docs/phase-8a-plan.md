# Phase 8 part A plan – Progression core (task book, experience, recipe unlocks)

Read `CLAUDE.md`, `src/items/CLAUDE.md`, `src/actions/CLAUDE.md`, `src/save/CLAUDE.md`,
`src/net/CLAUDE.md`, `src/ui/CLAUDE.md`, `src/input/CLAUDE.md` and `e2e/CLAUDE.md` first,
and the "Decisions and deviations" of `docs/phase-3b-report.md` and
`docs/phase-3c-report.md` (items, recipes, the recipe list), `docs/phase-6c-report.md`
(save format 2, rooms in Gathering) and `docs/phase-7a-report.md` (format 3, the form).

Phase 8 ("Adventure") gives the game more depth in five parts, each planned after the owner
has played the previous one: **A** progression core (this plan) · B content round (chests,
new recipes, a new material and tool tier, caves as a new generator version) · C health
without enemies · D creature foundation with peaceful animals · E enemies and melee combat.
Only part A is planned here. It is designed so that B–E add task types, event kinds and XP
sources by extending tables and one switch each, without reworking what A builds.

Part A is implemented in **two sessions**, each with its own branch, pull request and
report: **8A1** (single-player progression, sections 5.1–5.11) and **8A2** (shared
progress in rooms, section 5.12). Both are autonomous: do not ask the owner questions.
Where this plan leaves a detail open, choose the simplest option consistent with it and
note it in the part's report (`docs/phase-8a1-report.md`, `docs/phase-8a2-report.md`),
section "Decisions and deviations". Tests name their criterion as "Phase 8 AC1.1".

## 1. Goal

The Gathering mode becomes the **Adventure** mode. An Adventure world has a task book: a
fixed chain of chapters that leads a player from the first log to iron tools and torches.
Finishing tasks, finding an ore for the first time and crafting a recipe for the first
time give experience (XP); levels unlock recipes. Locked recipes stay visible in the recipe
list with what unlocks them. A short notice tells the player when a task, a chapter or a
level is done. Creative stays as it is.

In a room (8A2) the task book belongs to the world and is shared by everyone; XP and level
belong to each player. The host decides and stores everything, as with inventories today.

A headless goal bot proves that the book can be finished from a fresh world on several
seeds, that every locked recipe can be reached, and reports a rough time per task. It is
the seed of the bot and balancing tool later parts extend.

## 2. Decisions made with the owner

| Topic            | Decision                                                                                                                                                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modes            | Gathering becomes Adventure (label only; the internal id stays `gathering`, see 5.11). Creative unchanged. No third mode                                                                                                                                  |
| Co-op model      | Task progress per world (shared); XP, level and unlocks per player. When a task is completed, **every player in the room** gets its XP. First finds and first crafts give XP only to the player who made them                                             |
| Unlocks          | Each recipe has exactly one unlock: a level, or a task. Level 1 recipes are open from the start                                                                                                                                                           |
| Structure        | Chapters of 3–6 tasks. All tasks of the open chapter are open at once; the next chapter opens when every task of the current one is done                                                                                                                  |
| Counting         | Events while the task's chapter is open: items received from breaking, items made by crafting, blocks placed, the lowest and highest feet Y reached. Inventory contents do not count; nothing counts twice; work before the chapter opened does not count |
| Task types       | `mine`, `craft`, `place`, `reachBelow` (feet Y ≤ N), `reachAbove` (feet Y ≥ N). "Place" means placing a block                                                                                                                                             |
| Book on screen   | A third tab "Tasks" of the inventory screen (after "Items" and "Crafting"), in Adventure worlds only. No HUD tracker                                                                                                                                      |
| Length           | A player who knows the game finishes the book in about 30–45 minutes: 5 chapters, about 20 tasks, 7 levels                                                                                                                                                |
| Checker          | Static check plus a goal bot with generic skills, on several seeds, using only valid actions; a unit test for one seed, a script for all with a time table                                                                                                |
| Old worlds       | An old Gathering world loads as an Adventure world with fresh progress: blocks and inventory kept, book at the start, level 1. Creative worlds load unchanged                                                                                             |
| Split            | 8A1 single-player (about 2 typical parts), 8A2 co-op (about 1 part)                                                                                                                                                                                       |
| Rooms during 8A1 | "Open to others" is disabled in Adventure worlds until 8A2 is merged. Creative rooms are unaffected                                                                                                                                                       |
| Extras           | An F3 overlay row "Progress"; test tools for progress (URL parameter `progress`, test-API calls)                                                                                                                                                          |
| Not chosen       | Renaming the internal mode id; the level in the world list; a HUD tracker; a separate task screen                                                                                                                                                         |

## 3. Changes to the original scope

The owner's starting scope was challenged during planning. Agreed changes:

| #   | Change                                                                                                   | Reason                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Split into 8A1 (single-player) and 8A2 (co-op), one plan                                                 | Estimated at about 3 typical parts, above the 2.5 target. The split leaves something playable after each session                                                    |
| 2   | Rooms in Adventure worlds are disabled in the user interface during 8A1                                  | Owner's choice over a temporary "progress pauses in rooms" rule. The room specs of Phase 6C keep running through the test API (5.11)                                |
| 3   | XP of a completed task goes to every player in the room                                                  | With per-player levels and a shared book, a player who does less mining would otherwise stay locked out of the recipes the book asks for next                       |
| 4   | Exactly one unlock per recipe (a level or a task)                                                        | One rule and one text per locked row; the static check can prove reachability                                                                                       |
| 5   | Chapters instead of a strict single chain                                                                | Two players can work on different tasks at once and the order stays clear                                                                                           |
| 6   | Events counted while the chapter is open (not inventory, not lifetime totals)                            | No instant completions, nothing gamed by moving items, a steady pace                                                                                                |
| 7   | "Reach a depth or a place" became depth and height tasks; "place" means placing a block                  | Clear in every world, cheap for the bot, and fits caves in part B. Position comes from poses, not from actions: a second, explicit source of progress (5.3)         |
| 8   | The task book is a tab of the inventory screen, not a screen of its own                                  | Mouse, touch and controller (focus, LB/RB, Back, scrolling) come for free; no new key, touch button or pad button                                                   |
| 9   | Old Gathering worlds migrate with fresh progress instead of being refused                                | An ordinary format migration is the simplest clean option and never loses a world                                                                                   |
| 10  | The headless check is a goal bot with generic skills on several seeds, plus a static check               | A script for one seed would have to be rewritten for every table change and is no seed for a balancing bot; a static check alone cannot prove the chain is playable |
| 11  | Added: an F3 row "Progress" and test tools (`progress=all\|fresh`, `getState().progress`, `setProgress`) | Bug reports need the state; about 20 existing Gathering specs craft recipes that would be locked, and new specs must start mid-book                                 |

## 4. Out of scope (do not build)

- Health, damage, food, creatures, enemies, combat, chests, caves (parts B–E).
- New blocks, items or recipes. The recipe table, item table and their ids stay exactly as
  they are.
- Attributes, stat bonuses, skill trees, NPCs, dialogue, sound.
- Item rewards for tasks. Tasks give XP only; levels and tasks only unlock recipes.
- A HUD tracker of open tasks, the level in the world list, renaming the internal mode id.
- Shared progress in rooms in 8A1 (it is 8A2). In 8A2: no XP for players who are not in the
  room when a task completes, no catch-up XP for late joiners.
- The rest of Phase 7, Web Workers (Phase 4 part C).

## 5. Specification

### 5.1 Tables (pure, `src/progress/tables.ts`)

A new pure area `src/progress/` (the same discipline as `src/items/`: no `three`, DOM,
`Math.random`, `Date.now`; add it to the ESLint purity rules and the coverage scope). The
tables are plain data, so tuning never touches logic:

- `CHAPTERS`: `{ id, title }` in book order.
- `TASKS`: `{ id, chapter, label, type, target, count, xp }` in book order. `type` is
  `mine` (items received from breaking; `target` an item id), `craft` (items made;
  `target` an item id, counted as the result count, so "Make 8 planks" needs two crafts),
  `place` (`target` a block id), `reachBelow` / `reachAbove` (`target` a feet Y; `count`
  1). `label` is the text shown ("Mine 4 logs").
- `LEVELS`: the total XP each level starts at (level 1 at 0). The highest entry is the
  maximum level.
- `RECIPE_UNLOCKS`: for every recipe id, `{ level: n }` or `{ task: id }`.
- `FIRST_FIND_XP`: block id → XP for the first ore of that kind a player mines **with a
  yield** (a coal ore broken by hand does not count).
- `FIRST_CRAFT_XP`: XP for the first craft of each recipe by a player (one number;
  a per-recipe override map may stay empty).

Ids of chapters and tasks are stable (append-only, never reused), like recipe ids, and
pinned by `tables.test.ts`. Saves store task ids; an id this build does not know is
ignored on load and never makes a world damaged.

Starting values (8A1 tunes counts and XP with the bot, section 5.10; ids, types and the
chapter order stay):

| Chapter            | Task (id, label, type, target, count)                                                                                                                    | XP each |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------: |
| 1 "First wood"     | 1 Mine 4 logs (mine, log, 4) · 2 Make 8 planks (craft, planks, 8) · 3 Make a workbench (craft, workbench, 1) · 4 Place a workbench (place, workbench, 1) |      10 |
| 2 "Tools"          | 5 Make a wooden pickaxe (craft) · 6 Mine 8 stone (mine, stone, 8) · 7 Make a stone pickaxe (craft) · 8 Climb to height 64 (reachAbove, 64)               |      15 |
| 3 "Stone and fire" | 9 Make a furnace (craft) · 10 Place a furnace (place) · 11 Make 2 coal (craft, coal, 2) · 12 Mine 3 coal (mine, coal, 3)                                 |      20 |
| 4 "Into the dark"  | 13 Make 8 torches (craft, torch, 8) · 14 Reach depth 30 (reachBelow, 30) · 15 Place 4 torches (place, torch, 4) · 16 Mine 3 iron ore (mine, iron ore, 3) |      25 |
| 5 "Iron"           | 17 Make 3 iron ingots (craft) · 18 Make an iron pickaxe (craft) · 19 Make 4 glass (craft) · 20 Place 8 stone bricks (place)                              |      30 |

Levels (total XP): 1 → 0, 2 → 30, 3 → 80, 4 → 150, 5 → 240, 6 → 350, 7 → 480.
`FIRST_FIND_XP`: coal ore 20, iron ore 40. `FIRST_CRAFT_XP`: 5.

Unlocks: level 1: planks, sticks, workbench, wooden pickaxe · level 2: wooden axe, wooden
shovel, stone pickaxe · level 3: stone axe, stone shovel, furnace, coal · level 4: stone
bricks, bricks · level 5: iron ingot, glass · level 6: iron pickaxe, iron axe, iron
shovel · level 7: iron block · task 12 "Mine 3 coal": torch.

The guaranteed XP before each chapter (tasks of earlier chapters plus the first crafts
and finds they force) reaches the level the chapter needs: about 50 after chapter 1
(level 2), about 235 after chapter 3 (level 4), about 380 after chapter 4 (levels 5 and
6), about 520 at the end (level 7). The static check (5.10) proves this for whatever
values the tables hold.

### 5.2 Progress state (pure, `src/progress/progress.ts`)

- **World progress** (shared, one per world): `WorldProgress { done: readonly number[];
counts: readonly { task: number; count: number }[] }`: the finished task ids and the
  counts of open tasks that are above 0. The open chapter is derived: the first chapter
  in table order with a task not in `done` (none: the book is complete). Immutable like
  `PlayerRecord`.
- **Player progress** (per player): three new fields of `PlayerRecord`: `xp` (integer ≥ 0),
  `found` (block ids of first finds, no duplicates) and `crafted` (recipe ids crafted at
  least once, no duplicates). `createPlayerRecord` starts them at `0`, `[]`, `[]`. Because
  they live in the record, they travel with the existing `record` messages and guest
  entries (needed by 8A2) and are validated by `decodePlayer`.
- `levelOf(xp)`, `nextLevelXp(xp)` (null at the maximum level), `recipeUnlocked(recipe,
record, progress)`, `unlockText(recipe)` ("Level 3", "Task: Mine 3 coal").
- In Creative nothing of this is used: `progress` stays empty and records keep `xp` 0.

### 5.3 Events and the progress step (pure, `src/progress/events.ts`, `progress.ts`)

Progress is derived from what the session already confirms, never from the screen:

- `eventsOf(action, result, ctxBefore)`: the progress events of one **accepted** action:
  `break` → `{ kind: 'mine', block, item, count }` for the broken block's drop only (not
  a carried torch); `craft` → `{ kind: 'craft', recipe, item, count }` (the result);
  `place` → `{ kind: 'place', block }`. Refused actions and other kinds give none.
- `{ kind: 'pose', y }`: position is not an action. The session receives the player's feet
  Y (single-player: `Game` hands it to the session once per simulation step; 8A2: the
  host from every pose it receives). The step returns at once unless an open task is a
  `reachBelow` / `reachAbove`, so this costs nothing in the usual case.
- `stepProgress(world, actor, record, event, present)` → the new `WorldProgress`, the new
  records of every player whose XP changed, and a list of **outcomes**: `taskDone { task,
actor }`, `chapterDone { chapter }`, `xp { player, amount }`, `firstFind { player,
block }`, `levelUp { player, level, recipes }` (the recipes that level unlocked) and
  `unlocked { recipes }` (a task unlock). `present` is the list of players in the room (in
  single-player: the player). A task done gives its XP to everyone in `present`; first
  finds and first crafts to `actor` only. A chapter completes when its last task does,
  and the next chapter's tasks start at 0 from the next event on.
- An event that completes a task does not carry its surplus into another task (8 stone
  mined in one go counts 8, not more, towards "Mine 8 stone").
- Event kinds and task types are the two extension points for parts B–E (`eat`, `kill`,
  `open`…): one union member and one `case` each.

### 5.4 Locked recipes in the action layer

`craft` checks the unlock after `invalid` and before `station`: a locked recipe is refused
with the new reason **`locked`**. `ActionContext` gets `progress: WorldProgress`, so
`applyAction` stays pure and decides it from `record` and `progress`. Order of reasons
for `craft`: `mode`, `invalid`, `locked`, `station`, `missing`, `full`. The HUD text of
`locked` is "Locked: Level 3" or "Locked: Mine 3 coal" (the furnace bar never starts for
a locked recipe; the list offers no button there, see 5.7).

### 5.5 Sessions (single-player in 8A1)

- `LocalSession` holds the world progress next to the record. After an accepted action it
  runs `eventsOf` and `stepProgress` (mode `gathering` only); a new method
  `notePose(y)` runs the pose step. A new listener method `onProgress(progress, outcomes)`
  reports changes; records changed by XP go through `onPlayer` as before.
- `pipeline.test.ts` also fails if `stepProgress` is called anywhere but in
  `actions/Session.ts` and `net/HostSession.ts`, or if a record's `xp`, `found` or
  `crafted` is built outside `src/progress/`, `src/actions/` and the one test tool.
- `Game` saves the world progress into `WorldMeta.progress` and marks the meta dirty on
  every `onProgress`.

### 5.6 Save format 4 (`src/save/saveFormat.ts`)

- `WorldMeta.progress: WorldProgress`, stored for both modes (empty in Creative).
- Player records (the world's player and each guest entry) get `xp`, `found`, `crafted`.
  Limits: `xp` an integer 0–1 000 000 000; `found` at most 256 block ids, `crafted` at most
  1 024 recipe ids, each 1–65 535, no duplicates; `done` at most 1 024 task ids without
  duplicates; `counts` at most 1 024 entries, one per task, counts 1–1 000 000.
- Decoding stays total and never throws. A format 4 record whose `progress` or record
  progress fields do not check out is damaged (as any other field); unknown task, block or
  recipe ids that are valid numbers load and are ignored by the engine.
- **Old worlds:** formats 1–3 load with an empty `progress` and records with `xp` 0,
  `found` [], `crafted` [], and are written back as 4. An old Gathering world therefore
  opens as an Adventure world with its blocks and inventory, the book at chapter 1 and
  level 1 (owner decision); a player who already holds iron tools still finds those
  recipes locked until the levels are reached. Creative worlds are unchanged apart from
  the format number. Guest entries are migrated the same way.

### 5.7 Screens (8A1)

**Mode labels.** Everywhere the user reads the mode it says "Adventure": the form's Mode
button and its explanation ("Adventure: gather, craft and follow the task book."), the
`None` hint ("No trees only in Creative: Adventure needs wood."), the world list ("Adventure
· Balanced · Few trees"), the join section, the controls lists. The id stays `gathering`.

**The Tasks tab.** The inventory screen of an Adventure world has three tabs: "Items",
"Crafting", "Tasks" (LB/RB walk them, no wrap-around; it opens on the tab it was closed
with). The tab shows, top to bottom:

1. "Level N" and an XP bar with "120 / 150 XP" ("Max level" at the top).
2. "Next level: Stone axe, Stone shovel, Furnace" (absent at the maximum level).
3. One line per finished chapter ("✓ First wood"), folded.
4. The open chapter's title ("Chapter 3 · Stone and fire") and one fixed-height row per
   task: its label and "3 / 8", or "✓" when done (reach tasks: "–" until done).
5. "2 more chapters" while later chapters exist; "All tasks done." at the end.

It is read-only: no element in it is focusable; the controller's default focus is the tab
button (like "Crafting"), the right stick and a finger scroll it. It must fit a 640 × 360
phone (scrolling inside the panel is fine) and update while open.

**The recipe list.** Rows keep table order and fixed height (`src/ui/CLAUDE.md`). A locked
row is dimmed, shows its ingredients as today, and in the action column the text
"Level 3" or "Task: Mine 3 coal" instead of "Craft" (no button, not focusable). The
"Crafting" tab count counts unlocked craftable rows only.

**Notices.** A progress notice in the top centre, above the HUD **and** above the open
inventory screen (not above the pause menu or world menu): one line at a time from a
queue, each `PROGRESS_NOTICE_MS` (3 000) of simulation time, so it is deterministic in test
mode. Texts: "Task done: Mine 4 logs · +10 XP", "Chapter done: First wood", "Level 3 ·
Unlocked: Stone axe, Stone shovel, Furnace", "Unlocked: Torch" (task unlock), "First find:
Iron ore · +40 XP". First crafts give their XP silently (the bar shows it). It never
covers the touch buttons or the hotbar, and it does not take pointer or focus.

**F3 overlay.** A row "Progress" in Adventure worlds: "Chapter 3 · Task 2/4 done · Level 4
· 160/240 XP" ("Book complete · Level 7 · Max").

**"Open to others"** is disabled in an Adventure world during 8A1, with the note "Rooms in
Adventure worlds come with the next update." (`src/ui/RoomPanel.ts`).

### 5.8 Test tools (`src/game/testApi.ts`, `urlParams.ts`)

- URL `progress=all|fresh` with `test=1`, for the automatic test world of
  `mode=gathering`. **Default `all`**: every task done and the player at the maximum
  level, so older specs that craft keep working. `fresh` starts the book. Worlds created
  through the form are always fresh, in tests too. `openWorld(name, seed, mode?,
progress?)` takes the same choice (default `all`).
- `getState().progress`: `{ level, xp, nextLevelXp, chapter, done, tasks: [{ id, count,
goal, done }] (the open chapter), notice }` or `null` in Creative.
  `getState().recipes[]` gets `locked` and `unlock` (`{ level } | { task }`).
- `__mc.setProgress({ xp?, done? }, player?)`: past the action layer, like `give`
  (through the single `replaceRecord` call the pipeline test allows; on a host with a
  guest's id it sets that guest's XP). `done` replaces the world's done list and clears
  the counts.

### 5.9 Older specs and references

Specs that create an Adventure world through the form and craft beyond level 1, or whose
play-through would now be locked, call `__mc.setProgress` first; the report lists them.
The Phase 6C room specs (`e2e/mpGathering.spec.ts`) open rooms through the test API, which
stays allowed in Adventure test worlds in 8A1; they set the guest's progress with
`setProgress(…, guestId)` after the join. `e2e/mpMenus.spec.ts` (Phase 6 AC7.10) expects the
disabled button and its note in 8A1, and the enabled button again in 8A2.

References that show the inventory tab bar, a locked row or the mode label are regenerated
and looked at (expected: `inventory`, `recipe-list`, `recipe-list-touch`,
`pad-recipe-list`, `pad-inventory`, `world-menu`, `pad-world-menu`). New: `tasks-tab`,
`tasks-tab-touch` (640 × 360), `recipe-list-locked`, `progress-notice`. Every other
reference stays unchanged.

### 5.10 Static check and goal bot (8A1)

**Static check** (`src/progress/check.ts`, unit-tested, also run by the script):

- Every recipe has exactly one entry in `RECIPE_UNLOCKS`; every unlock names an existing
  level or task; ids are unique; every task names an existing chapter, item or block;
  every chapter has 1–6 tasks; `LEVELS` rise strictly.
- **Reachability by fixed point:** starting from level 1 with nothing done, repeatedly
  complete any open-chapter task whose requirement can be produced from the world's
  natural blocks (with the tool gating of `hardness.ts`) and the recipes unlocked so far,
  adding its XP plus the first-craft and first-find XP it forces. The book must complete,
  and at the end every recipe must be unlocked. Failures name the task or recipe.

**Goal bot** (`src/bot/`, a new pure area like `src/progress/`):

- Plays a real world through a `LocalSession` with the real progress engine: only valid
  actions, every refusal fails the run. It knows the world (no exploration) but must break
  every block between itself and a target, and stands only in free cells, as the
  iron-pickaxe test does (`src/actions/ironPickaxePath.test.ts`).
- Generic skills, chosen per open task from its type: `obtain(item, n)` (mine the nearest
  source, or craft through the recipe graph, placing a workbench or furnace when needed),
  `craft(item, n)`, `place(block, n)`, `digTo(y)` (a staircase down), `climbTo(y)`
  (walking up hills, else a pillar of blocks). It picks the open chapter's tasks in table
  order. A new task type needs one new skill.
- **Time model** (data in `tables.ts`, `BOT_TIME`): break times from `breakTimeMs` with
  the held tool, walking distance / `WALK_SPEED`, `SMELT_MS` per smelted item,
  `CRAFT_REPEAT_MS` per craft, `ACTION_REPEAT_MS` per place. **Estimated player time =
  bot time × `HUMAN_FACTOR`** (2.5, an assumption to be calibrated by device test PROG-1).
- `scripts/progressRun.ts` (`npx vite-node`): runs the bot on seeds 1, 1337, 42 and 2024 ×
  the shapes flat, balanced, hilly, trees "Few" (generator 2), and prints per task the
  median and maximum estimated minutes, per chapter and in total, the time of each
  level-up, and the actions and blocks broken. `src/bot/bot.slow.test.ts` runs seed 1337
  balanced/few and asserts completion; `bot.solo` is not needed (no time comparison).

**Balance targets** (estimated player time, median over the 12 runs): total 30–45
minutes; no single task above 5 minutes; no chapter above 12 minutes; no gap between two
level-ups above 8 minutes. 8A1 tunes counts and XP (not ids or types) until they hold, and
records the final numbers and the tuning rounds in its report.

### 5.11 Internal names and what stays

The id `gathering` stays in code, saves, actions, URL parameters (`mode=gathering`) and
tests; only texts say "Adventure". `src/actions/CLAUDE.md` says so in one line. Timed
breaking, gating, stations, smelting and the furnace bar are unchanged. Recipe and item
tables are unchanged.

### 5.12 Shared progress in rooms (8A2)

- `HostSession` holds the world's `WorldProgress` and runs `eventsOf` / `stepProgress`
  for every accepted action of every player (its own too), and the pose step for every
  pose it receives or produces. `present` is the host and every guest the host counts as
  in the room at that moment. Guests' XP, finds and crafts live in their records and so in
  their guest entries: a returning guest gets them back; a new guest starts at level 1.
- `applyAction` of a guest's `craft` uses that guest's record and the world progress, so
  each player is locked by their own level.
- Protocol: `welcome` carries `progress`; a new host→guest message `progress { progress,
done: [{ task, by }] }` is sent to everyone when the world progress changes (`by` is the
  name of the player whose action finished the task). The guest's `ClientSession` reports
  it through `onProgress`; its own level-ups and first finds it derives from its record
  updates (old vs new `xp` / `found`). Validating decoders as for every message;
  `progress` does not count towards a guest's rate limit (the host sends it).
- Notices: "Task done: Mine 4 logs (Anna) · +10 XP" for everyone in the room; level-ups
  and first finds only for the player concerned; "Chapter done" for everyone.
- The host's guest has no `progress=all` shortcut; tests use `setProgress(…, guestId)`.
- "Open to others" is enabled again in Adventure worlds (the 8A1 note is removed).
- Traffic: at most one `progress` message per changed action; a pose step that completes
  nothing sends nothing.

## 6. Acceptance criteria

### 8A1 (single-player)

**AC1 Tables and checks**

- AC1.1 `tables.test.ts` pins every chapter id, task id, type, target and the unlock of
  every recipe id; adding a task at the end passes, renumbering fails.
- AC1.2 The static check passes on the shipped tables and fails, naming the culprit, on
  six broken variants built in the test: a recipe without unlock, two unlocks, an unknown
  task in an unlock, a task whose item cannot be obtained before its chapter, a level
  table that falls, a recipe only unlocked by a level that the book's XP never reaches.
- AC1.3 Starting values in the plan's table are used unless the report lists the tuning.

**AC2 Engine**

- AC2.1 Unit tests for each task type: counts only while its chapter is open; a refused
  action counts nothing; a drop without yield (coal ore by hand) counts nothing; surplus
  is not carried over; a carried torch does not count as mined.
- AC2.2 A completed task gives its XP to every player in `present`, a first find and a
  first craft to the actor only, each once per player; `levelUp` lists exactly the
  recipes of that level; a task unlock reports `unlocked`.
- AC2.3 The last task of a chapter completes the chapter and opens the next; the last
  chapter completes the book; events after that change nothing.
- AC2.4 `stepProgress` and `eventsOf` never mutate their inputs (frozen inputs in tests).
- AC2.5 The pose step with no open reach task returns the same objects (no allocation of a
  new state); measured by identity in the test.

**AC3 Locked recipes**

- AC3.1 `craft` of a locked recipe is refused `locked` (before `station` and `missing`);
  unlocked at the level's XP or once the task is done.
- AC3.2 The recipe list shows locked rows dimmed with "Level N" / "Task: …" and no
  button; the tab count ignores them (browser test, mouse and touch).
- AC3.3 Pressing A on the controller cannot reach a locked row (it is not focusable).

**AC4 Save**

- AC4.1 Format 4 round trip of `progress` and the record fields (unit).
- AC4.2 Format 1, 2 and 3 Gathering fixtures load with empty progress, level 1 and their
  inventory, and are written back as 4; Creative fixtures load as before (unit and one
  browser test through IndexedDB).
- AC4.3 Twelve malformed variants of the new fields are damaged; unknown task, block and
  recipe ids load; decoding never throws (fuzz with the existing helpers).
- AC4.4 Progress survives a reload in the browser (`save=1`): open chapter, counts, XP.

**AC5 Screens**

- AC5.1 Adventure is the label in the form, the list, the join section and the controls
  lists; Creative is unchanged.
- AC5.2 The Tasks tab shows level, XP bar, next unlocks, folded chapters, the open
  chapter's rows with counts, and updates while open (browser test).
- AC5.3 Tabs are reachable by mouse, by touch and by LB/RB; the right stick scrolls the
  tab; Back closes (browser tests in all three input modes).
- AC5.4 At 640 × 360 in touch mode the tab panel lies inside the view, no row overlaps
  another, and the last row can be scrolled into view.
- AC5.5 Completing a task shows "Task done: …" for 3 000 ms of simulation time; queued
  notices follow each other; the notice shows over the open inventory, not over the pause
  menu; it never overlaps a touch button or the hotbar at 640 × 360.
- AC5.6 The F3 overlay shows the "Progress" row in Adventure only.
- AC5.7 "Open to others" is disabled with its note in an Adventure world; Creative rooms
  open as before.

**AC6 Play-through and bot**

- AC6.1 A browser play-through on a fresh world (`progress=fresh`, seed 1337, generator 2)
  completes chapter 1 with real input and nothing given: the notices appear, the level
  becomes 2, the stone pickaxe row unlocks. (Later chapters are covered by the bot.)
- AC6.2 `bot.slow.test.ts`: the bot finishes the book on seed 1337 balanced/few with no
  refused action, and ends with every recipe unlocked and `World.verifyLight()` 0.
- AC6.3 `scripts/progressRun.ts` finishes all 12 runs; the report contains its table and
  the balance targets of 5.10 hold.
- AC6.4 A soak of 1 000 random actions in an Adventure world (as Phase 3 AC13.2) with the
  progress engine on: after every action the world progress and XP equal a second,
  independent computation in the test.

**AC7 General**

- AC7.1 `npm run check`, `npm run build`, the affected specs pass; no console errors.
- AC7.2 Every older spec passes (adapted only as 5.9 says); references other than those
  listed in 5.9 are unchanged.
- AC7.3 Hard rule 1 checked (plain words, no images except the listed references).

### 8A2 (co-op)

- AC8.1 Unit tests over the memory transport with 2 and with 4 players: a guest's break
  advances the shared task; everyone gets the task XP; first finds only to the finder;
  each player's `craft` is locked by their own level.
- AC8.2 A guest joining mid-book receives the progress in `welcome`; a guest who leaves
  and returns keeps XP, finds and crafts; the host's save and reload keeps the world
  progress and every guest entry's progress.
- AC8.3 Malformed `progress` messages and `welcome.progress` are refused by the decoders
  (fuzz as the other messages).
- AC8.4 Browser test with two players in an Adventure room: the guest completes "Mine 4
  logs"; both see "Task done: Mine 4 logs (…)" and the updated Tasks tab; both XP bars
  rise by the task's XP.
- AC8.5 "Open to others" is enabled in Adventure worlds again; `mpMenus.spec.ts` checks it.
- AC8.6 With four moving players doing actions, the host's outgoing traffic stays within
  the Phase 6 limit (20 kB/s, scenario `players`).
- AC8.7 All Phase 6 room specs pass.

## 7. Test strategy

- Pure areas (`src/progress/`, `src/bot/`) are unit-tested in Node and in the coverage
  scope. Tables are pinned like recipes.
- The engine is tested with literal events and with events derived from real
  `applyAction` results (`eventsOf`), so both halves are covered.
- The bot's slow test is the end-to-end proof of the book for one seed; the script covers
  the rest and is run by hand (not in CI: about 12 world runs). The report records its
  output.
- Browser specs: `e2e/progress.spec.ts` (tab, notices, locked rows, F3, play-through of
  chapter 1, reload), `e2e/progressTouch.spec.ts` (640 × 360 layout), additions to
  `e2e/gamepadInventory.spec.ts` (LB/RB to Tasks, scrolling), and in 8A2
  `e2e/mpProgress.spec.ts`. Add every new spec to `e2e/shards.json`.
- Wait on game state (`__mc.whenIdle()`, `getState().progress`), never on sleeps.

## 8. Implementation steps

### 8A1

1. **Tables and static check**: `src/progress/tables.ts`, `check.ts`, purity and coverage
   config, `src/progress/CLAUDE.md`. (AC1)
2. **Engine**: `progress.ts`, `events.ts`, record fields, `createPlayerRecord`. (AC2)
3. **Action layer and session**: `locked`, `ActionContext.progress`, `LocalSession`
   progress and `notePose`, `onProgress`, pipeline test. (AC3.1, AC6.4)
4. **Save format 4** with migration and fixtures. (AC4.1–AC4.3)
5. **Game wiring and test tools**: `Game` hands poses and stores progress, autosave,
   URL `progress`, `getState().progress`, `setProgress`; adapt older specs. (AC4.4, AC7.2)
6. **Screens**: labels, Tasks tab, recipe list locks, notices, F3 row, disabled room
   button; references. (AC3.2, AC3.3, AC5)
7. **Goal bot and script**, then **tuning** until the targets hold. (AC6.2, AC6.3)
8. **Browser play-through of chapter 1**. (AC6.1)
9. **Docs, device tests, report, pull request.**

### 8A2

1. Host progress and `present`; per-guest locks. (AC8.1)
2. Protocol: `welcome.progress`, `progress` message, decoders. (AC8.3)
3. Guest side: `ClientSession.onProgress`, derived level-ups, notices with names. (AC8.2)
4. Enable "Open to others"; browser spec with two players; traffic check. (AC8.4–AC8.7)
5. Docs, device tests, report, pull request.

## 9. Documentation

- New `src/progress/CLAUDE.md` (tables, ids, events, the step, extension points) and
  `src/bot/CLAUDE.md` (skills, time model, how to run the script and read its table).
- `src/actions/CLAUDE.md`: `locked`, `ActionContext.progress`, the id `gathering` is shown
  as "Adventure", the pipeline rule for `stepProgress`.
- `src/save/CLAUDE.md`: format 4. `src/ui/CLAUDE.md`: the Tasks tab, locked rows, the
  progress notice. `src/net/CLAUDE.md` (8A2): shared progress in rooms.
- `docs/testing.md`: `progress=`, `getState().progress`, `setProgress`, new references.
- Root `CLAUDE.md`: the two new pure areas in "Project structure" and "Architecture
  invariants", two lines in "Where the rules are", the status rows 8A1 and 8A2, the
  "Open" bullet. Keep the root under its 25 000-byte budget; details go to nested files.
- `docs/device-tests.md`: a section "Progression (Phase 8 part A)".

## 10. Risks and fallbacks

| Risk                                                            | Fallback                                                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| The bot needs path finding to be honest about walking time      | Straight-line distance × 1.3 as the walking estimate; recorded as a decision. It is a rough time by design                     |
| The bot gets stuck in water or on cliffs on some seed           | Fall back to digging straight through; a seed that still fails is reported with the task and position, never silently skipped  |
| `HUMAN_FACTOR` is wrong                                         | It is one number in the tables; PROG-1 measures the real time and the next session recalibrates                                |
| The Tasks tab does not fit 640 × 360                            | Smaller rows below 480 px height (as the pause menu in 7A); the panel scrolls                                                  |
| Many older specs break through locked recipes                   | `progress=all` default in test mode; only form-created worlds need `setProgress`                                               |
| Notices hide behind the inventory panel or cover touch controls | A dedicated layer above the inventory screen, placed above the panel's top edge; tested at 640 × 360                           |
| 8A1 overruns                                                    | Steps 1–6 are the playable core. If step 7's tuning cannot finish, ship the bot with the measured table and report what is off |

## 11. For the owner and for the Pi side

Device tests (added by 8A1 unless noted): **PROG-1** play a fresh Adventure world (seed
1337, defaults) through the book on the PC and note the minutes per chapter (calibrates
`HUMAN_FACTOR`); **PROG-2** the Tasks tab is readable on the phone; **PROG-3** the
controller reaches and scrolls the Tasks tab; **PROG-4** the notices are noticed but not
annoying; **PROG-5** a locked recipe row is understandable; **PROG-6** (8A2) two players
on two devices finish chapter 1 together and both see the notices and XP; **PROG-7** (8A2)
a guest leaves and rejoins and keeps their level.

For the Pi side: 8A1 changes nothing there (no new build variables or packages; rooms in
Adventure worlds are off). 8A2 changes the room protocol (`welcome.progress`, message
`progress`); devices must run the same build, which the build id ensures. PROG-6 needs the
PR preview of 8A2 to be running while its pull request is open.
