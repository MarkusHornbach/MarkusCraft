# Fix Adventure 1 plan – the torch unlock and the recipe list's focus while smelting

Read `CLAUDE.md`, `src/progress/CLAUDE.md`, `src/bot/CLAUDE.md`, `src/ui/CLAUDE.md`,
`src/input/CLAUDE.md`, `src/actions/CLAUDE.md` and `e2e/CLAUDE.md` first, and the
"Decisions and deviations" of `docs/phase-8a1-report.md` (tables, static check, bot),
`docs/phase-8a2-report.md` (locks per player in rooms), `docs/phase-5b-report.md` and
`docs/polish-1-report.md` (the recipe list, its focus and the hold).

A small fix round after Phase 8 part A, found while playing 8A on a device. One
implementation session, one branch, one pull request. Work on the branch assigned to the
cloud session, else `fix-adventure-1`. Start from `main`. If this plan is not on `main` yet,
merge the branch that holds it (`claude/wizardly-cerf-ruf1da`) first. The session is
autonomous: do not ask the owner questions. Where this plan leaves a detail open, choose the
simplest option and note it in `docs/fix-adventure-1-report.md`, section "Decisions and
deviations".

Tests name their criterion in the title as "Fix Adventure 1 AC1.1". Device tests have the
origin "FA1".

## 1. Goal

1. **Torches can be unlocked in a normal game.** Today the torch (recipe 20) is unlocked
   by task 12 "Mine 32 coal". That task counts only coal from breaking coal ore, and coal
   ore lies in the dark, where a player needs torches to find it. After this round the
   torch comes with task 11 "Make 16 coal" (coal made from logs in the furnace). A tables
   rule and the static check make sure no unlock needs the thing it unlocks.
2. **Crafting the same furnace item several times in a row works with the controller.**
   Today the focus jumps to a neighbouring row when smelting starts. After this round the
   "Craft" button stays where it is while its row smelts, so the focus stays on it.

## 2. Findings of the planning session

- **The torch loop, measured.** A scratch run of the goal bot on the 12 worlds of
  `scripts/progressRun.ts` looked at how bright the faces of the coal ore it breaks for
  "Mine 32 coal" are. The bot breaks 32 ores per run. In 11 of the 12 runs, 26–32 of them
  had no face brighter than sky light 4, which is practically black. Only seed 42 hilly had
  10 ores in daylight. Iron ore was dark in every run. The bot did not notice the problem
  because it has no notion of light.
- **Other unlocks checked by hand.** With the torch on task 11 there is no other loop.
  Iron (level 5), "Reach depth 30" and all of chapter 4 come after task 11. Glass and bricks
  need coal, which the furnace makes from logs. Every level is reached through XP whose
  tasks need no dark mining: chapters 1–3 give 125 + 110 XP, and "Mine 32 coal" is done
  after the torch.
- **The bot cannot stand in for a player's eyes.** Before task 11 is done, the bot also
  breaks 50–120 stone blocks in the dark in most runs. It tunnels sideways to the nearest
  stone, where a player would dig an open pit. A hard bot rule "never break in the dark
  without torches" would therefore fail because of how the bot moves, not because of the
  tables.
- **The focus jump, confirmed.** `RecipeList.showAction` hides the row's "Craft" button
  while its row smelts (`row.craft.hidden = smelting || …`). In the next frame,
  `FocusManager.update` finds the focused element unusable and moves the focus to the
  nearest focusable element, usually the "Craft" button of the row above. Phase 5 part B
  built this on purpose (`e2e/gamepadInventory.spec.ts` Phase 5 AC6.2: "The button hides
  under the bar: the focus goes to the nearest one"). Mouse and touch have no focus frame,
  and the button comes back under the pointer after the smelt, so only the controller is
  visibly affected.
- **An edge case of existing worlds.** Tasks of a chapter can be done in any order. A world
  where "Mine 32 coal" is done but "Make 16 coal" is not has the torch today, and would
  lose it when the unlock moves to task 11 (see 5.2).

## 3. Decisions made with the owner

| Topic                 | Decision                                                                                                                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Torch unlock          | Task 11 "Make 16 coal" instead of task 12. "Mine 32 coal" stays a task of chapter 3, unchanged                                                                                                                                                              |
| Keeping the torch     | New general rule: a recipe a player has crafted at least once (`record.crafted`) is never locked again for that player                                                                                                                                      |
| Proof without torches | A rule in the static check (ores and depth tasks need a light source unlocked first) plus a bot **report** of dark breaks before a light source. The report is not a failure. A device test covers what the bot cannot judge                                |
| Focus while smelting  | The "Craft" button stays visible and focusable while its row smelts, with the progress drawn inside it. A press during the smelt starts nothing (as today). Holding the button keeps smelting one item after another                                        |
| Torches of chapter 3  | No rule change. Torches made and placed in chapter 3 do not count for chapter 4's "Make 32 torches" / "Place 32 torches" (the 8A counting rule). Recorded as a known consequence; the device test asks about it                                             |
| Docs size             | This planning commit moves the device-test rules from the root `CLAUDE.md` into the header of `docs/device-tests.md` (root below the 22 500-byte warning). The fix session keeps `src/ui/CLAUDE.md` below its 7 200-byte warning. `src/net/CLAUDE.md` stays |

## 4. Changes to the original scope

The owner's starting scope was challenged during planning. Agreed changes:

| #   | Change                                                                                                                         | Reason                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Added: "a recipe a player has crafted once stays unlocked" (one rule in `recipeUnlocked`)                                      | The scope asks that a player who already unlocked the torch keeps it. Moving the unlock alone would re-lock it in a world where task 12 is done and task 11 is not. The rule covers every player who made a torch, and future table changes too |
| 2   | "Prove with the bot that every unlock is reachable without torches" became a static-check rule plus a bot report               | Measured: the bot's sideways tunnels break stone in the dark long before any torch, so a hard bot rule would fail for the bot's own path. The static rule catches this bug class in the tables; the report and a device test cover the rest     |
| 3   | The focus fix keeps the "Craft" button on screen while its row smelts (the bar moves into the button), instead of a focus rule | Nothing disappears, so the focus cannot jump with any input. No new rule in the focus system. It reverses a deliberate Phase 5B behaviour, whose test is changed on purpose                                                                     |
| 4   | Added: the device-test rules move out of the root `CLAUDE.md` (done in this planning commit)                                   | The root is above its 22 500-byte warning; the rules are already mostly in the header of `docs/device-tests.md`                                                                                                                                 |

## 5. Out of scope (do not build)

- New recipes, items or blocks; changing recipe, item, task or chapter ids.
- Changing XP, levels, task counts or the chapter structure. The only table change is the
  torch's unlock (and its comment). This includes chapter 4's torch counts (section 3).
- Changing the counting rule (work before a chapter opened does not count).
- A light-aware bot (one that chooses lit sources or fails on dark breaks); the bot using
  torches; night in the bot.
- The radar and any other Phase 8 part B work; the furnace queue ("Ofen mit Inhalt"):
  pressing "Craft" during a smelt still starts nothing.
- A new focus rule in `FocusManager`; changes to how the focus moves when a button really
  goes away (ingredients used up, inventory full).
- Save format changes (`SAVE_FORMAT_VERSION` stays 5) and protocol changes.
- Trimming `src/net/CLAUDE.md`.

## 6. Specification

### 6.1 The torch's unlock (`src/progress/tables.ts`)

- `RECIPE_UNLOCKS`: `{ recipe: 20, unlock: { task: 11 } }`. The comment above it says
  "The torch comes with "Make 16 coal": coal from logs, without light." and no longer
  names a count that is out of date. No other unlock changes.
- Lock texts follow from the table: the torch row says "Task: Make 16 coal", a refused
  craft "Locked: Make 16 coal", and finishing task 11 shows "Unlocked: Torch".
- `src/testing/startingTables.ts` spreads `PROGRESS_TABLES`, so engine tests that name the
  torch's unlock (`progress.test.ts`, `view.test.ts`: "Locked: Mine 3 coal") change with it.
  They are listed in the report as "Tests changed on purpose".

### 6.2 Crafted recipes stay unlocked (`src/progress/progress.ts`)

- `recipeUnlocked(recipe, record, progress, tables)` returns true when `record.crafted`
  includes the recipe; otherwise it decides by the unlock as today. Every place that asks
  whether a recipe is locked goes through it: `applyAction`'s `craft`, `Game.recipeLocks`
  (the list), the bot. In a room each player's own record decides, as for levels (8A2).
- `crafted` is already in the record, saved (format 4 and 5) and sent to guests.
  Nothing new is stored.
- **The static check does not use this rule.** It proves reachability for a fresh player
  (`crafted` empty), as today.
- "Next level: …" in the Tasks tab and the `levelUp` / `unlocked` outcomes do not change.
  An outcome may name a recipe the player already crafted, which is harmless.
- Existing worlds (format 5, no migration): chapter 3 open with task 11 done → the torch is
  unlocked (a gain); task 12 done, task 11 not, torch crafted → unlocked; task 12 done,
  task 11 not, never crafted → locked with "Task: Make 16 coal" until task 11 is done (same
  open chapter, no light needed); chapter 4 or later → unchanged. Worlds load exactly as
  before; none becomes damaged.

### 6.3 The light rule of the static check (`src/progress/tables.ts`, `check.ts`)

- New table data `DARK_BLOCKS: readonly number[]` in `tables.ts`: natural blocks a player
  normally finds only in the dark (`Block.COAL_ORE`, `Block.IRON_ORE`), with a one-line
  comment why. It goes into `ProgressTables` as `darkBlocks`, so tests can build variants.
- A **light source** is a recipe whose result is a block with light emission
  (`BLOCK_EMISSION` > 0 in `src/world/blocks.ts`); today that is only the torch.
- In `checkReachability`: until a light-source recipe is unlocked **and** its ingredients
  are obtainable, a block of `darkBlocks` is no source of anything (in `obtainable` and
  `sourcesOf`), and a `reachBelow` task cannot be completed. Everything else is as today.
  The fixed point already repeats within a chapter, so task 11 unlocks the torch and task 12
  then completes in the same chapter.
- The shipped tables pass. The guaranteed XP after each chapter stays 50, 125, 235, 380,
  520 (the rule changes reachability, not XP).
- Failures name the task and say why, e.g. `task 12 "Mine 32 coal": needs light (coal ore),
no light source before it`. A recipe that can then never be unlocked is named as today.

### 6.4 The bot's dark-break report (`src/bot/`, `scripts/progressRun.ts`)

- The bot counts a **dark break**: a `break` it submits while no light-source recipe (6.3)
  is unlocked for it, where the brightest of the six faces of the broken block has light
  `max(sky, block)` ≤ `DARK_LIGHT` (4, a constant in `Bot.ts` with a one-line comment).
  Light comes from the world as the bot changes it: `World.lightOf` (a lit chunk's stored
  light, or the light computed for an unlit one), or lighting the chunks the bot works in,
  whichever is simpler. The light invariant (`verifyLight` 0) must still hold.
- `BotRun` gets `darkBreaks: { task: number; block: number; count: number }[]` (per open
  task and broken block kind).
- `scripts/progressRun.ts` prints, after the time tables, one table: per task, the median
  and maximum dark breaks over the 12 runs, and separately those of `darkBlocks`. It
  prints them **as a report only**: they never make a run or the script fail.
- Expected after the fix: dark breaks of stone and dirt in chapter 2 and early chapter 3
  (the bot's sideways tunnels), a few incidental coal ores on those paths, and none after
  task 11. The report records the table and names what the bot cannot judge: whether a
  player would dig in the open or tunnel, the night (the bot ignores the time of day), and
  how dark is too dark on a real screen (device test PROG-11).
- The time model is unchanged. The 12 runs must still finish with every recipe unlocked,
  and the balance targets of `src/bot/CLAUDE.md` still hold (expected unchanged: the bot
  uses no torches and plays the same actions). The script may get slower, but must still
  finish in about two minutes.

### 6.5 The "Craft" button while smelting (`src/ui/RecipeList.ts`, `ui.css`)

- While a row smelts, its "Craft" button stays visible, in the same place and size, and
  stays focusable. The progress is drawn inside the button: a fill growing from the left
  behind the label, with the class `smelting` on the row as today. The button keeps its
  `aria-label` ("Craft Coal") and its label "Craft". The separate `.recipe-progress` element
  may stay as the fill's element inside the button, or be replaced; `getState().smelting`
  is unchanged.
- A press (click, tap, A) on the smelting row's button starts nothing, as `Game.craft`
  already ignores it. Holding it (mouse, finger, A) repeats as today: each repeat that
  comes after the smelt delivered starts the next one, so holding smelts one item after
  another.
- The button still disappears when the row can no longer be crafted (ingredients used up,
  inventory full, station out of reach, locked). Then the focus moves to the nearest
  element, as today (Phase 5 AC6.3, device test PAD-14).
- Other rows' buttons are unchanged during a smelt (a press on another furnace row starts
  nothing, as today).
- The row's height, the action column's fixed width and the table order do not change
  (Polish 1). On touch the button keeps its touch size.

## 7. Acceptance criteria

**AC1 The torch unlock**

- AC1.1 `tables.test.ts` pins recipe 20's unlock as `{ task: 11 }` and every other unlock
  as before. The comment above it names "Make 16 coal" (checked by reading; the report says
  so).
- AC1.2 Unit (`progress.test.ts`, `src/actions/` craft tests): with `crafted` containing
  20, the torch is unlocked whatever the book and the level say, and `applyAction` accepts
  the craft. With `crafted` empty and task 11 not done, the craft is refused `locked`. With
  task 11 done it is accepted. A level recipe crafted once stays unlocked when the XP is set
  below its level. Inputs are frozen (no mutation).
- AC1.3 Unit, existing worlds: four format-5 metas built with the save format's encoder
  (chapter 3 with task 11 done; task 12 done and task 11 not, with and without 20 in
  `crafted`; chapter 4 open) decode without damage. `recipeUnlocked` gives the torch
  unlocked, unlocked, locked ("Task: Make 16 coal"), unlocked.
- AC1.4 Unit over the memory transport (`progressNet.test.ts` or a new file in
  `src/net/`): in a room, a guest whose record has the torch crafted can craft it while the
  host's cannot, and the reverse. Each player's own record decides.
- AC1.5 Browser (`e2e/progress.spec.ts`): in a fresh Adventure world with chapter 3 open
  and task 11 one coal short (`setProgress` with `counts`), the torch row says "Task: Make
  16 coal" and has no button. One real smelt of coal at a furnace finishes the task: the
  notice "Unlocked: Torch" shows, the torch row offers "Craft", and crafting it works.
  `getState().recipes` names the torch's unlock `{ task: 11 }`.

**AC2 The static check and the bot**

- AC2.1 `check.test.ts`: the shipped tables pass with the guaranteed XP 50, 125, 235, 380, 520. Three variants fail, naming the culprit: the torch on task 12 (the tables before this
  round: task 12 needs light), the torch on task 14 "Reach depth 30" (a `reachBelow` without
  light), and `darkBlocks` with coal ore while the torch is locked until level 7 (task 12
  needs light). A variant with an empty `darkBlocks` and the torch on task 12 passes, which
  shows the rule is what catches it.
- AC2.2 Unit (`src/bot/`): on a small hand-built world, a break with all six faces enclosed
  in stone counts as a dark break before a light source and not after one. A break at the
  surface by day counts as none.
- AC2.3 `bot.slow.test.ts` passes as before (book complete, every recipe unlocked,
  `verifyLight()` 0). It also checks that `darkBreaks` names no task after task 11: the
  count stops once the torch is unlocked. Dark breaks before that, incidental ores
  included, are reported, not failed.
- AC2.4 `npx vite-node scripts/progressRun.ts` finishes all 12 runs, the balance targets
  hold, and the report contains the time summary and the dark-break table.

**AC3 The focus while smelting**

- AC3.1 Browser, mouse (`e2e/crafting.spec.ts`, Phase 3 AC12.3 changed on purpose): after a
  click on "Craft Coal", the button stays visible at the same box (bounding box equal within
  1 px) for the whole smelt. Its fill is 50 % after 60 steps. A click during the smelt
  starts nothing and takes nothing. After delivery, a second click at the same spot starts
  the next smelt.
- AC3.2 Browser, controller (`e2e/gamepadInventory.spec.ts`, Phase 5 AC6.2 changed on
  purpose): with logs for 3 coal, A on "Craft Coal" three times in a row (each after the
  previous delivery) makes 3 coal, and `ui.focus` is "Craft Coal" after every press, during
  every smelt and after every delivery, with the frame on it. Holding A from the first press
  on makes at least 2 coal without letting go. When the logs are used up the button goes and
  the focus moves to the nearest element on screen (as Phase 5 AC6.3).
- AC3.3 Browser, touch at 640 × 360 (`e2e/progressTouch.spec.ts` or `e2e/touchLayout.spec.ts`):
  two taps on "Craft Coal" at the same point, the second after the first delivery, make 2
  coal. The button lies inside the panel and keeps its size during the smelt.
- AC3.4 Hand and workbench recipes behave as before (Phase 5 AC6.1, AC6.3 pass unchanged).
- AC3.5 References that show a smelting row are regenerated and looked at (expected:
  `recipe-list`; any other the run shows, e.g. `pad-recipe-list`, `recipe-list-touch`).
  Every other reference is unchanged.

**AC4 General**

- AC4.1 `npm run check` and `npm run build` pass. The browser specs the steps touch pass
  locally (with `MC_CONTAINER_GPU_STALL=1`): at least `progress`, `progressTouch`,
  `crafting`, `gamepadInventory`, `inventoryScreen`, `touchLayout`, `padSoak`, `mpProgress`,
  `taskTracker`. No console errors or warnings.
- AC4.2 `npm run docs:budget` shows no warning for the root `CLAUDE.md` and none for
  `src/ui/CLAUDE.md` (the `src/net/CLAUDE.md` warning may stay).
- AC4.3 Hard rule 1 checked (text, CSS and table data only).
- AC4.4 `CI result` is green on the pull request.

## 8. Test strategy

- Pure areas (`src/progress/`, `src/bot/`) in Node, in the coverage scope. The static rule
  is tested with variant tables built in the test, like the 8A1 variants. The crafted rule
  is tested through `recipeUnlocked` and through `applyAction`, so both halves are covered.
- Existing worlds are tested with metas from the real encoder, not hand-written JSON.
- The bot's dark-break count gets a small deterministic unit test. The slow test and the
  script check the whole run. The script is run by hand and its output goes into the
  report.
- Browser specs: mouse, controller and touch each get one test for the smelting row
  (AC3.1–AC3.3). The torch unlock gets one end-to-end test with a real smelt (AC1.5). Wait
  on game state (`step`, `getState().smelting`, `ui.focus`), never on sleeps. No new spec
  file is expected; if one is added, add it to `e2e/shards.json`.
- Tests changed on purpose are listed in the report with the reason (expected: Phase 3
  AC12.3, Phase 5 AC6.2, the torch's unlock in `progress.spec.ts`, `progress.test.ts`,
  `view.test.ts`, `tables.test.ts`).

## 9. Implementation steps

1. **The unlock and the crafted rule**: `tables.ts` (unlock, comment), `recipeUnlocked`,
   unit tests, the browser test of the torch row. (AC1)
2. **The static rule**: `DARK_BLOCKS`, `darkBlocks` in `ProgressTables`, `check.ts`,
   variants. (AC2.1)
3. **The bot's dark-break report**: count, `BotRun.darkBreaks`, the script's table, unit
   and slow test, run the script. (AC2.2–AC2.4)
4. **The "Craft" button while smelting**: `RecipeList.ts`, `ui.css`, the three browser
   tests, the references. (AC3)
5. **Docs, device tests, report, pull request.** (AC4)

Commit after each step, run `npm run check`, `npm run build` and the affected specs, and
push (`CLAUDE.md`, hard rule 4).

## 10. Documentation

- `src/progress/CLAUDE.md`: the torch's unlock is task 11; the crafted rule (a crafted
  recipe stays unlocked; the static check does not use it); `DARK_BLOCKS` and the light
  rule of the static check.
- `src/bot/CLAUDE.md`: the dark-break report, `DARK_LIGHT`, and what it cannot judge.
- `src/ui/CLAUDE.md`: the locked-row example becomes "Task: Make 16 coal"; one sentence on
  the "Craft" button staying with its fill while its row smelts. Keep the file below 7 200
  bytes: shorten or move text elsewhere to make room (e.g. move details of "Your player" to
  `src/game/CLAUDE.md`).
- `src/input/CLAUDE.md`: only if a sentence there says the button hides during a smelt.
- Root `CLAUDE.md`: the status row "Fix Adv 1" with its plan and report and "Before
  changing": "torch unlock, dark rule, smelting row". No other growth.
- `docs/device-tests.md` (section 12.1 below), "Last updated".

## 11. Risks and fallbacks

| Risk                                                                     | Fallback                                                                                                                                           |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| An older spec or unit test relies on a recipe being locked after a craft | It sets `crafted` or uses a fresh record; listed in the report as changed on purpose                                                               |
| Computing light for the bot slows the script a lot                       | Count only until a light source is unlocked (after that nothing is counted), and cache a chunk's light until a break in it                         |
| The fill inside the button is hard to read under software WebGL          | The references judge layout only; readability is device test CRAFT-14                                                                              |
| The static rule is too coarse (coal ore also shows on some hill faces)   | It is meant to be conservative: it proves the book works without seeing any ore in daylight. A table that needs daylight ore to finish is rejected |
| The "Craft" button on a smelting row invites presses that do nothing     | Accepted for this round (the furnace queue is out of scope); the fill shows that the furnace is busy. CRAFT-14 asks whether it is understood       |

## 12. For the owner and for the Pi side

### 12.1 Device tests (added by the fix session to `docs/device-tests.md`, origin "FA1")

- **PROG-11** (section "Progression"): a fresh Adventure world (seed 1337, defaults) on the
  PC, played from chapter 3: before "Make 16 coal" the torch row says "Task: Make 16 coal";
  finishing it shows "Unlocked: Torch". Then "Mine 32 coal" with torches. Was any task
  before the torch too dark to do comfortably, by day or at night? Did it feel unfair that
  the torches made and placed in chapter 3 did not count for chapter 4's torch tasks?
- **PROG-12** (section "Progression"): replaces PROG-5, whose example "Task: Mine 32 coal"
  no longer exists. Same question: a locked recipe row ("Level 3" or "Task: Make 16 coal"
  instead of "Craft"): is it clear why it cannot be made and what to do? PROG-5 moves to
  "Obsolete" in `docs/device-tests-done.md` with that reason.
- **PAD-17** (section "Controller"): with the controller, smelt coal several times in a row:
  the frame stays on "Craft" during and after each smelt; A again makes the next one;
  holding A keeps the furnace going. _PC, Phone._
- **CRAFT-14** (section "Crafting and tools"): with the mouse and with a finger, smelt
  several items in a row: the button stays with its bar inside; is it clear that the
  furnace is busy, and that a press during the bar does nothing? _PC, Phone._

PAD-14 stays (its subject, the frame when a button really goes away, is unchanged).

### 12.2 For the Pi side

No protocol change, no save format change, no new build variables or packages. The host
decides locks with each player's own record as before; devices in a room run the same
build, which the build id ensures. After the merge the Pi needs a `/sync` so that its main
build serves this version. Shared worlds stored on the Pi's main build load unchanged.
PAD-17, CRAFT-14 and PROG-11 can be played on the PR preview while the pull request is open.
