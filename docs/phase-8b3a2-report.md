# Phase 8 part B3a2 report – Chest screen, task and Creative

Plan: `docs/phase-8b3a-plan.md` (sections 6.9–6.14, AC5–AC8). Branch
`claude/upbeat-brahmagupta-w13c6p` (the session's branch), started from `main` after B3a1
was merged (pull request #47).

## What was built

- **Recipe and palette** (6.11): recipe 21 `chest` (8 planks at a workbench → 1 chest),
  unlocked by task 6 "Mine 64 stone"; the locked row says "Task: Mine 64 stone". The chest
  is in the Creative palette (last, in id order).
- **Task 21 and book 2** (6.12): task type `store` with the event `{ kind: 'store', item,
count }` from `chestMove` and `quickMove` into a chest (`eventsOf` counts what the chest
  gained of the moved item; `takeAll`, taking out and moves inside the chest give none).
  Task 21 "Store 32 stone in a chest" (chapter 3, 20 XP, in book order after task 12).
  `BOOK_VERSION` 2 with the rule "tasks 9–12 done → task 21 done, without XP";
  `checkTables` needs the item and a chest for a `store` task and reports the unlocked
  recipes after each chapter.
- **Bot** (6.13): skill `storeOne` (a chest through `obtain`, placed, opened, a quick move per
  stack, closed, broken again with its contents).
- **Opening and closing** (6.9): the place input (right click, touch `place`, the pad's
  place trigger) on a chest submits `openChest`; the screen opens when the session accepts
  it. It closes with E, Esc, "Close", the pad's Y or B, a pause, a new session, when the
  cell is no chest any more or the eye is beyond `REACH + REACH_TOLERANCE`; every close
  submits `closeChest`.
- **The chest screen** (6.10, `src/ui/ChestScreen.ts`): header ("Chest", "Also open: …",
  "Take all", "Close"), the chest's 27 slots, the 27 inventory slots (Adventure) and the
  bar. Pick then place across both sides (`chestMove` with the shown item), quick move by a
  second activation within `QUICK_MOVE_MS` (350 ms of simulation time) or the pad's X,
  "Take all". Slots follow `onStates` and `onPlayer` at once; a picked slot whose stack
  changed is put down. 48 px slots; 38 px on screens up to 480 px high.
- **Rooms on screen**: the "Also open" line from `onViewers` (names from the room's player
  list).
- **Test API**: `ui.screen` `chest`, `ui.chest { x, y, z, viewers }`.
- **Browser specs**: `e2e/chestScreen.spec.ts` (AC5.1, AC5.5, AC5.7, AC6.5, reference),
  `e2e/chestTouch.spec.ts` (AC5.2, AC5.3, reference), `e2e/chestPad.spec.ts` (AC5.4,
  reference), `e2e/mpChestScreen.spec.ts` (AC5.6, AC5.5 in a room), `chest-block` in
  `e2e/chest.spec.ts`, the format 5 fixture of AC6.3 in `e2e/save.spec.ts`.
- **Docs**: `docs/device-tests-2.md` (CHEST-1 to CHEST-8) and the budget script checks it
  (`DEVICE_TESTS` is a list, both files are link-checked); nested files of `ui`, `game`
  (the "New world" section moved there), `input`, `progress`, `bot`, `items`;
  `docs/testing.md`.

## Acceptance criteria

| AC    | Where                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------- |
| AC5.1 | `e2e/chestScreen.spec.ts` (right click opens, clicks, double click, Take all, Esc, E, right click elsewhere places) |
| AC5.2 | `e2e/chestTouch.spec.ts` (place button, taps, double tap, Close; `bag` see deviations)                              |
| AC5.3 | `e2e/chestTouch.spec.ts` (640 × 360, 915 × 412: 38 px; 1280 × 800: 48 px; no scrolling)                             |
| AC5.4 | `e2e/chestPad.spec.ts` (trigger, walk over all 63 slots and Take all, A/A, X, B, Y)                                 |
| AC5.5 | `e2e/chestScreen.spec.ts` (out of reach, chest gone), `e2e/mpChestScreen.spec.ts` (broken by the other player)      |
| AC5.6 | `e2e/mpChestScreen.spec.ts`                                                                                         |
| AC5.7 | `e2e/chestScreen.spec.ts` (Creative)                                                                                |
| AC5.8 | references `chest-screen`, `chest-screen-touch`, `pad-chest-screen`, `chest-block`, looked at                       |
| AC6.1 | `src/progress/tables.test.ts` (unlock T6), `src/items/recipes.test.ts`; older recipe specs                          |
| AC6.2 | `src/progress/events.test.ts`, `src/progress/progress.test.ts`, `src/net/chestNet.test.ts` (a guest's stores)       |
| AC6.3 | `src/progress/book.test.ts`, `src/save/chestSave.test.ts`, `e2e/save.spec.ts` (format 5 fixture)                    |
| AC6.4 | `src/progress/check.test.ts`                                                                                        |
| AC6.5 | `e2e/chestScreen.spec.ts` (play-through with real input)                                                            |
| AC7.1 | `scripts/progressRun.ts` (below)                                                                                    |
| AC7.2 | `src/bot/bot.slow.test.ts`, `src/bot/botV3.slow.test.ts`                                                            |
| AC8.1 | `e2e/inventoryScreen.spec.ts` (palette names), `e2e/chestScreen.spec.ts` (Creative)                                 |
| AC8.2 | `docs/device-tests-2.md`, `scripts/ci/docsBudget.mjs`                                                               |

## Measured numbers (Node and Chromium in this container; never device evidence)

`scripts/progressRun.ts` (generator 3, 12 runs): all 12 complete, light errors 0. Total
31.9 min median (38.0 max); chapter 3 7.9 min (9.2 max); largest level gap 6.3 min; every
target holds. Task 21: **0.0 min median, 0.1 max** (the bot has its stone from task 6 and
needs a craft, a place, two quick moves and a break; a player also has to find out that the
place input opens a chest: device test CHEST-8). The count stays 32 (the fallback to 16 was
not needed). Dark breaks of tasks 1–11 are equal to B2b's (task 6: 20 / 47, task 7: 0 / 1,
task 8: 0 / 64; ores 0 / 0, 0 / 0, 0 / 3). Radar and places checks agree in all 12 runs.

`checkTables`: XP after the chapters 50, 125, 260, 405, 545 on the plan's starting tables
(was 235, 380, 520 from chapter 3 on: task 21's 20 XP and the chest's first craft, 5).

## References

New: `chest-screen`, `chest-screen-touch`, `pad-chest-screen`, `chest-block`. Regenerated
because they show the chest or task 21: `palette` (the chest as the 18th block),
`tasks-tab` and `tasks-tab-touch` (chapter 3 with a fifth row). Regenerating every
reference of the six specs that show these screens changed only one more, `touch-controls`
(0.3 % of pixels, leaf noise, nothing visible); it was kept as it was. All were looked at.

## Browser specs run in this container

The new specs (`chestScreen`, `chestTouch`, `chestPad`, `mpChestScreen`) and the older ones
the counts and the book touch: `inventoryScreen`, `torch`, `crafting`, `progress`,
`progressTouch`, `taskTracker`, `touchLayout`, `gamepadInventory`, `radar`, `radarMap`,
`radarPlaces`, `radarTouch`, `light`, `interaction`, `chest`, `gathering`, `inventory`,
`padSoak`, `save` (138 + 70 runs, all passing after the count fixes). CI runs the rest.

## Decisions and deviations

- **Steps 1–3 are one commit.** Task 21 without the bot skill fails the bot's slow tests,
  which `npm run check` runs; the commit message names the three steps.
- **Book order is not id order any more.** Task 21 stands after task 12 in `TASKS`
  (the plan: "in book order after task 12"); `tables.test.ts` pins the order and the slow
  bot tests compare ids sorted.
- **Any accepted `openChest` opens the screen**, not only one the place input submitted
  (the layout tests outside test mode open a chest through the test API). The game rule is
  unchanged: only the place input and the test API submit `openChest`.
- **The touch button `bag` does not close the chest screen.** Like the inventory, the
  screen covers the touch controls (they are invisible and take no touches), so `bag` is not
  there to press; "Close" closes it on touch (AC5.2 tests "Close"). The inventory has always
  worked the same way.
- **`viewers` before the answer:** the host tells the viewers before it answers the guest's
  `openChest`, so `Game` keeps the room's last `viewers` news and shows it when the screen
  opens.
- **A new session closes the screen without `closeChest`** to the old session (it is gone);
  the new room knows of no open chest.
- **Quick move on touch** stays a double tap (the plan's fallback, a long press, was not
  needed: a second tap after 350 ms puts the slot down, tested with 30 steps between).
  In test mode simulation time stands still between clicks, so two activations of one slot
  without steps are always a quick move.
- **The hint line** also hides while the controller is active (the hint bar says what to
  do, and on a 540 px view it lay over the line), not only on short screens.
- **Phone fit**: 38 px slots, 4 px gaps, the hint hidden and header buttons 40 px high on
  touch (48 elsewhere on touch) fit 640 × 360 without moving the header beside the grid.
- **Creative quick move** onto the bar merges (B3a1's rule), as before.
- **The furnace and workbench "near" rule** is untouched: a chest is no station.

## Tests changed on purpose

- Counts of recipes (21), palette blocks (18), tasks (21) and chapter 3 (5 tasks, "Task
  2/5"): `recipes.test.ts`, `items.test.ts`, `tables.test.ts`, `view.test.ts`,
  `report.test.ts` (21 tasks: 42 min), `check.test.ts` (chapter XP),
  `e2e/crafting.spec.ts`, `e2e/recipeRows.ts`, `e2e/touchLayout.spec.ts`,
  `e2e/inventoryScreen.spec.ts`, `e2e/torch.spec.ts`, `e2e/progress.spec.ts`,
  `e2e/taskTracker.spec.ts` (a complete book is 21 tasks).
- Book 2 in written records: `progressSave.test.ts`, `saveFormat.test.ts`,
  `chestSave.test.ts`, `book.test.ts`, `e2e/save.spec.ts`, `e2e/light.spec.ts`.
- `progressNet.test.ts`: "every task before 20" now includes task 21.
- `src/testing/startingTables.ts`: task 21 starts at 4 ("Store 4 stone in a chest").
- `repoHygiene.test.ts`: 60 reference pictures.

## Known issues

- `src/radar/scanCost.solo.test.ts` (B2b AC5.4) failed once in a full `npm run check`
  while nothing else ran and passed in the next runs; the radar is untouched by this part.
- The B3a1 report's known issues stand (the five-player menu test in this container, page
  crashes with three browser workers).

## For the Pi side

Nothing new to configure: no build variables, packages or signaling requests. The room
protocol did not change in this part (the chest messages came with B3a1); host and guests
must still run the same build. **Rollback:** a world opened by this build is saved with
book 2. A B3a1 build lists it as "Saved by a newer version" and never writes it; builds
before B3a1 do the same (format 6). Back on this build it opens unchanged. Worlds this
build never opened keep their format and book. `sync/status.md` of the Pi repository was
read: nothing there concerns this part (the owner plays CHEST-1 to CHEST-8 on this part's
PR preview).

## Device tests

New in `docs/device-tests-2.md`: CHEST-1 to CHEST-8 (origin "8B3a2"). None became
pointless; nothing was ticked in `docs/device-tests.md`.

## Suggestions for the next part (B3b)

- Generated loot: `initialState(block, x, y, z, source)` in `src/world/blockState.ts` is the
  hook; a chest a player emptied stays stored as empty, so a derivation never refills it.
- A furnace with contents is a new state kind and so a new save format (rule of B3a1); its
  screen can reuse `ChestScreen`'s slot code (sides, pick, quick move).
- If CHEST-8 shows players do not find the place input on a chest, a crosshair hint ("Right
  click: open") would be a small addition.
