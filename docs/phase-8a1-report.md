# Phase 8 part A1 report – Single-player progression

Plan: `docs/phase-8a-plan.md`, sections 5.1–5.11 and the 8A1 steps of section 8
(acceptance criteria AC1–AC7). Part A2 (shared progress in rooms, 5.12, AC8) is not built.

## What was built

- **Tables and static check** (`src/progress/tables.ts`, `check.ts`): five chapters, twenty
  tasks, seven levels, one unlock per recipe, first-find and first-craft XP; the check
  proves ids, references and that the book can be finished and every recipe unlocked
  (`src/progress/CLAUDE.md`).
- **Engine** (`progress.ts`, `events.ts`): `WorldProgress`, `stepProgress`, `eventsOf`,
  levels and unlocks; `PlayerRecord` gets `xp`, `found`, `crafted`.
- **Action layer**: `craft` answers `locked`; `ActionContext.progress`; `LocalSession` runs
  the step after every accepted action and `notePose` once per simulation step;
  `onProgress`; the pipeline test guards `stepProgress`, `replaceProgress` and the record
  fields.
- **Save format 4** with the book and the record fields; formats 1–3 migrate to a fresh
  book at level 1.
- **Game and test tools**: `Game` hands the feet Y to the session, saves the book, shows
  notices; URL `progress=all|fresh`, `getState().progress`, `recipes[].locked/unlock`,
  `setProgress`, `openWorld(…, progress)`.
- **Screens**: "Adventure" everywhere the mode is shown, the "Tasks" tab, locked recipe
  rows, the progress notice, the F3 row "Progress", "Open to others" disabled in Adventure
  worlds with its note.
- **Goal bot** (`src/bot/`, `scripts/progressRun.ts`) and the tuning of counts and levels.
- **Browser specs**: `e2e/progress.spec.ts` (save and reload, `progress=all`, locked rows,
  Tasks tab, notices, F3, the play-through of chapter 1), `e2e/progressTouch.spec.ts`
  (640 × 360), additions to `e2e/gamepadInventory.spec.ts` (LB/RB to Tasks, right stick,
  no locked row reachable).

## Final tables (AC1.3: tuned from the plan's starting values)

| Chapter          | Tasks (count)                                                                      | XP each |
| ---------------- | ---------------------------------------------------------------------------------- | ------: |
| 1 First wood     | Mine 32 logs · Make 64 planks · Make a workbench · Place a workbench               |      10 |
| 2 Tools          | Make a wooden pickaxe · Mine 64 stone · Make a stone pickaxe · Climb to height 64  |      15 |
| 3 Stone and fire | Make a furnace · Place a furnace · Make 16 coal · Mine 32 coal                     |      20 |
| 4 Into the dark  | Make 32 torches · Reach depth 30 · Place 32 torches · Mine 20 iron ore             |      25 |
| 5 Iron           | Make 20 iron ingots · Make an iron pickaxe · Make 24 glass · Place 64 stone bricks |      30 |

Levels (total XP): 1 → 0, 2 → 50, 3 → 125, 4 → 190, 5 → 270, 6 → 370, 7 → 460 (the plan
started at 30, 80, 150, 240, 350, 480). Ids, types, targets, task XP, the unlocks,
`FIRST_FIND_XP` (coal ore 20, iron ore 40) and `FIRST_CRAFT_XP` (5) are the plan's. The
static check's guaranteed XP after each chapter: 50, 125, 235, 380, 520 (levels 2, 3, 4, 6,
7 at the chapter ends).

### Tuning rounds (median estimated minutes of the 12 runs)

| Round | Change                                                                                                                                           |                           Total | Largest level gap |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------: | ----------------: |
| 0     | the plan's starting values                                                                                                                       |                            12.3 |               4.5 |
| 1     | counts about ×2 (logs 10, planks 16, stone 24, coal 4/8, torches 16/8, iron 6/6, glass 8, bricks 16)                                             | 17.5 (5 runs failed: a bot bug) |               7.0 |
| 2     | counts about ×4 (logs 16, planks 32, stone 40, coal 8/16, torches 24/16, iron 10/10, glass 16, bricks 32)                                        |                            17.9 |               5.3 |
| 3     | walking × path factor 1.3 (the time model of the plan); logs 24, planks 48, stone 64, coal 12/24, torches 32/24, iron 16/16, glass 24, bricks 48 |                            26.2 |               7.0 |
| 4     | coal 16/32, torches placed 32, iron 20/20, bricks 64                                                                                             |                            29.8 |               8.2 |
| 5     | logs 32, planks 64; levels 30→60, 80, 150, 240→200, 350→330, 480→460                                                                             |                            32.3 |               9.7 |
| 6     | levels 60, 125, 190, 270, 370, 460                                                                                                               |                            32.3 |               7.4 |
| 7     | level 2 at 50 (chapter 1's 50 XP reach it, AC6.1)                                                                                                |                            32.3 |               7.4 |

### The bot's table (`npx vite-node scripts/progressRun.ts`, final tables)

    seed 1 flat: complete, 11.7 bot min, 1699 actions, 537 broken, light errors 0 (4.6 s)
    seed 1 balanced: complete, 12.0 bot min, 1745 actions, 560 broken, light errors 0 (2.9 s)
    seed 1 hilly: complete, 13.6 bot min, 2111 actions, 728 broken, light errors 0 (4.3 s)
    seed 1337 flat: complete, 12.2 bot min, 1804 actions, 592 broken, light errors 0 (3.0 s)
    seed 1337 balanced: complete, 15.2 bot min, 2278 actions, 835 broken, light errors 0 (2.6 s)
    seed 1337 hilly: complete, 14.1 bot min, 1995 actions, 770 broken, light errors 0 (5.9 s)
    seed 42 flat: complete, 12.6 bot min, 1723 actions, 572 broken, light errors 0 (2.0 s)
    seed 42 balanced: complete, 12.6 bot min, 1597 actions, 566 broken, light errors 0 (2.2 s)
    seed 42 hilly: complete, 12.3 bot min, 1595 actions, 556 broken, light errors 0 (3.5 s)
    seed 2024 flat: complete, 13.4 bot min, 1986 actions, 699 broken, light errors 0 (2.1 s)
    seed 2024 balanced: complete, 13.2 bot min, 1935 actions, 678 broken, light errors 0 (1.3 s)
    seed 2024 hilly: complete, 13.7 bot min, 2026 actions, 723 broken, light errors 0 (1.6 s)

| What                     | Median (min) | Max (min) |
| ------------------------ | -----------: | --------: |
| 1 Mine 32 logs           |          3.5 |       5.0 |
| 2 Make 64 planks         |          0.2 |       0.2 |
| 3 Make a workbench       |          0.0 |       0.0 |
| 4 Place a workbench      |          0.0 |       0.0 |
| 5 Make a wooden pickaxe  |          0.0 |       0.0 |
| 6 Mine 64 stone          |          4.3 |       4.5 |
| 7 Make a stone pickaxe   |          0.0 |       0.0 |
| 8 Climb to height 64     |          0.7 |       2.9 |
| 9 Make a furnace         |          0.1 |       0.1 |
| 10 Place a furnace       |          0.1 |       0.1 |
| 11 Make 16 coal          |          3.2 |       4.7 |
| 12 Mine 32 coal          |          4.4 |       5.8 |
| 13 Make 32 torches       |          0.1 |       0.1 |
| 14 Reach depth 30        |          1.7 |       2.4 |
| 15 Place 32 torches      |          2.0 |       2.0 |
| 16 Mine 20 iron ore      |          3.4 |       3.9 |
| 17 Make 20 iron ingots   |          1.6 |       1.6 |
| 18 Make an iron pickaxe  |          0.1 |       0.2 |
| 19 Make 24 glass         |          4.4 |       6.2 |
| 20 Place 64 stone bricks |          1.8 |       1.9 |

| What             | Median (min) | Max (min) |
| ---------------- | -----------: | --------: |
| 1 First wood     |          3.7 |       5.2 |
| 2 Tools          |          5.2 |       7.2 |
| 3 Stone and fire |          8.4 |       9.1 |
| 4 Into the dark  |          6.8 |       8.0 |
| 5 Iron           |          8.0 |       9.7 |
| Total            |         32.3 |      38.0 |

| What                          | Median (min) | Max (min) |
| ----------------------------- | -----------: | --------: |
| Level 2                       |          3.7 |       5.2 |
| Level 3                       |          8.7 |      10.2 |
| Level 4                       |         11.8 |      13.6 |
| Level 5                       |         18.8 |      22.9 |
| Level 6                       |         24.1 |      28.2 |
| Level 7                       |         30.4 |      36.2 |
| Largest gap between level-ups |          7.4 |      11.3 |

Actions: median 1870, max 2278; blocks broken: median 635, max 835

- [x] total 32.3 min within 30–45
- [x] chapter "1 First wood" 3.7 min ≤ 12
- [x] chapter "2 Tools" 5.2 min ≤ 12
- [x] chapter "3 Stone and fire" 8.4 min ≤ 12
- [x] chapter "4 Into the dark" 6.8 min ≤ 12
- [x] chapter "5 Iron" 8.0 min ≤ 12
- [x] largest level gap 7.4 min ≤ 8
- [x] all 12 runs complete
- every task ≤ 5 minutes (median): yes (largest: 4.4, "Mine 32 coal" and "Make 24 glass")

Bot time per run: 11.7–15.2 bot minutes (× 2.5 = estimated player minutes); a run takes
1–6 s in Node. Every run ends with every recipe unlocked and `World.verifyLight()` 0.

## Decisions and deviations

| Topic                               | Decision                                                                                                                                                                                                                                                          | Why                                                                                                                                                                                                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tuned counts                        | Counts grew about eightfold ("Mine 32 logs", "Mine 64 stone", "Place 64 stone bricks"); the labels follow the counts                                                                                                                                              | The plan's starting values gave 12 estimated minutes; the target is 30–45. The bot knows the world, so with `HUMAN_FACTOR` 2.5 only large counts reach it. If PROG-1 shows that people play much slower than 2.5 × the bot, the counts should come down again (one table) |
| Level thresholds                    | Tuned too (50, 125, 190, 270, 370, 460)                                                                                                                                                                                                                           | With the plan's thresholds two level-ups came close together and two gaps exceeded 8 minutes. Thresholds are XP data; the unlock table is unchanged                                                                                                                       |
| `stepProgress` signature            | `stepProgress(world, actor, event, present, tables?)` where `actor` and every entry of `present` are `{ id, record }`                                                                                                                                             | The plan's `(world, actor, record, event, present)` must give XP to every present player, so the step needs their records; the optional tables let tests and the check use other tables                                                                                   |
| `onProgress`                        | An optional method of `SessionListener`; `LocalSession` reports through it, records first through `onPlayer`                                                                                                                                                      | The host and guest listeners of Phase 6 need no change in 8A1                                                                                                                                                                                                             |
| Player id in single-player          | `'local'` (`LOCAL_PLAYER_ID`)                                                                                                                                                                                                                                     | Notices filter level-ups and finds by the player id (needed in 8A2)                                                                                                                                                                                                       |
| Rooms in 8A1                        | `HostSession` takes the world's book (`HostOptions.progress`) so a guest's `craft` is locked by the guest's own level, but no progress is counted in rooms                                                                                                        | Plan 5.11: room specs open Adventure rooms through the test API; 5.12 is 8A2                                                                                                                                                                                              |
| Network records                     | `decodePlayer` requires `xp`, `found`, `crafted` in messages too; `encodePlayer` sends them                                                                                                                                                                       | Builds that differ never meet (`hello` checks the build), and 8A2 needs them in the record messages                                                                                                                                                                       |
| Pipeline rule for the record fields | A pattern finds values given to `xp`, `found` or `crafted` (not type annotations); allowed in `src/progress/`, `src/actions/`, the save format (7, encoder and decoder) and once in `Game.ts` (the `progress=all` test world)                                     | The plan names "the one test tool"; the decoder has to build records from stored data                                                                                                                                                                                     |
| `setProgress`                       | Through one helper `testEditRecord` shared with `give`, so `replaceRecord` keeps its two calls in `Game.ts`; `done` goes through `LocalSession.replaceProgress` (one call, guarded like `replaceRecord`)                                                          | Plan 5.8                                                                                                                                                                                                                                                                  |
| `progress=all`                      | Every task done and the XP of the maximum level (460 now)                                                                                                                                                                                                         | Plan 5.8                                                                                                                                                                                                                                                                  |
| Notice timing                       | The queue advances in the simulation step with a tolerance of 1e-6 ms                                                                                                                                                                                             | 180 steps of 1/60 s fall just short of 3 000 ms in floating point                                                                                                                                                                                                         |
| Notice on short screens             | Up to 480 px high and while the inventory is open it moves to the bottom edge of the view                                                                                                                                                                         | The inventory panel fills a 640 × 360 phone: at the top the notice covered the tabs                                                                                                                                                                                       |
| Notice above the inventory          | The notice element comes after the inventory screen in the document (z-index 5); it is hidden whenever a menu shows (pause, world menu)                                                                                                                           | No z-index juggling with the menus                                                                                                                                                                                                                                        |
| Locked rows and the list status     | `Game.recipeStatuses` marks locked rows not craftable; the list gets a map of lock texts                                                                                                                                                                          | The hold, the furnace bar and the tab count all read `craftable`, so none of them starts for a locked recipe                                                                                                                                                              |
| Tasks tab size                      | As large as the recipe list (284 px, touch 300, 278/288 below 480 px); rows 36 px (32 px below 480 px)                                                                                                                                                            | The five chapters of 8A fit; the tab scrolls when a later book is longer. The controller test makes the tab short to prove the right stick scrolls it                                                                                                                     |
| The bot's movement                  | Steps of one block (along the larger horizontal distance first), a staircase down, a step onto a block or a pillar up; falls to the floor after each step; break, walk (× path factor 1.3), pillar (2 blocks/s), craft, smelt and place times as the plan's model | Plan 5.10 and its fallback (straight steps instead of path finding)                                                                                                                                                                                                       |
| The bot's stations                  | Placed when a recipe needs one, taken back when the task is done; a station left behind is made again                                                                                                                                                             | Keeps the bot generic; costs a little break and craft time, which a player also spends                                                                                                                                                                                    |
| The bot's inventory                 | Leaves, clay, grass, dirt and sand are thrown away (`discard`) when room is needed; one stack of pillar blocks stays                                                                                                                                              | Valid actions only; the 36 slots fill up on long digs                                                                                                                                                                                                                     |
| Task time in the table              | The time since the previous task was done                                                                                                                                                                                                                         | A task finished as a by-product shows near 0, which is how a player experiences it                                                                                                                                                                                        |
| Engine tests                        | Run against `src/testing/startingTables.ts` (the plan's starting values)                                                                                                                                                                                          | The tuning must not rewrite the engine tests                                                                                                                                                                                                                              |
| AC6.4 soak                          | A unit test (`src/progress/soak.test.ts`) with `LocalSession` and a second, plain implementation of the counting rules; it compares after every one of 1 000 actions                                                                                              | Phase 3 AC13.2 was a browser test; the comparison needs the session's record after each action, which a unit test has directly. With the tuned counts random actions finish only a few tasks; the comparison is the point                                                 |
| AC6.1                               | The player is teleported beside each trunk and back to the start point (as the Phase 3 play-throughs), mouse and keys do the rest; 32 logs by hand, 16 crafts of planks, a workbench, placed by right click                                                       | "Real input, nothing given"                                                                                                                                                                                                                                               |
| AC4.2 browser test                  | `e2e/save.spec.ts`'s format 1 and 2 fixtures now expect format 4, a fresh book and level 1                                                                                                                                                                        | Plan AC4.2                                                                                                                                                                                                                                                                |
| Commits                             | Steps 5 and 6 are one commit                                                                                                                                                                                                                                      | Step 6's code was written before step 5's browser specs had run; a deviation from hard rule 4                                                                                                                                                                             |
| Static check                        | Counts only forced first crafts and finds (an item with one recipe and no natural source; an ore that is the only source); tool crafts for gating are not counted                                                                                                 | Conservative: the guaranteed XP is a lower bound                                                                                                                                                                                                                          |

### Older specs adapted (plan 5.9)

- Labels: `e2e/inventory.spec.ts` (Mode button and list rows say "Adventure"),
  `e2e/worldMenu.spec.ts` (the `None` hint), `e2e/gamepadMenus.spec.ts` (Phase 5 AC3.1
  walks to "Adventure").
- Tabs: `e2e/crafting.spec.ts` AC12.1 (three tab labels), AC12.5 (three tab elements, all
  hidden in Creative), `e2e/touchLayout.spec.ts` AC8.5 (four header buttons),
  `e2e/gamepadInventory.spec.ts` AC5.3 (RB reaches Tasks).
- Worlds of the form that craft beyond level 1 call `setProgress` first:
  `e2e/touchLayout.spec.ts` (Phase 4 AC8.5, Polish 1 AC1.3), `e2e/padSoak.spec.ts`.
- `e2e/mpGathering.spec.ts` Phase 6 AC9.7 sets the guest's XP with `setProgress(…, guestId)`.
- `e2e/mpMenus.spec.ts` Phase 6 AC7.10 expects the disabled button and its note.
- Format 4: `e2e/save.spec.ts` (Phase 6 AC8.5, Phase 7 AC1.2), `e2e/light.spec.ts` (Phase 4
  AC5.2); unit tests `saveFormat.test.ts`, `guests.test.ts`.
- Unit tests with an `ActionContext` get `progress`; crafting tests unlock everything
  (`completeProgress`, maximum XP); `ironPickaxePath.test.ts` likewise;
  `pipeline.test.ts` gains three checks; `repoHygiene.test.ts` counts 46 images.

### References

Regenerated and looked at: `inventory`, `inventory-touch` (not in the plan's list; it shows
the tab bar), `recipe-list`, `pad-inventory`, `pad-recipe-list`. `recipe-list-touch`,
`world-menu` and `pad-world-menu` were regenerated and came out unchanged (their scenes show
no tab bar or mode label of a Gathering world). New: `tasks-tab`, `tasks-tab-touch`,
`recipe-list-locked`, `progress-notice`. Every other reference is unchanged.

## Known issues

- `e2e/mpMenus.spec.ts` Phase 6 AC7.10 fails in this cloud container on the base commit as
  well (the fifth player's second join stays at "Connecting…"); CI decides.
- The bot's estimate rests on `HUMAN_FACTOR` 2.5, an assumption until PROG-1 is played.
- The bot's "Climb to height 64" mostly uses pillars; a player may walk up a hill instead.
- A long notice wraps to two lines (three on a phone); it is still above the HUD and never
  over a touch button.

## Measured performance

- The pose step without an open reach task: about 70 ns per simulation step (Node, this
  container), and it returns the same objects (AC2.5); with "Climb to height 64" open about
  550 ns.
- A bot run: 1–6 s; the 12 runs of the script about 40 s. `bot.slow.test.ts` about 3 s.
- Numbers from software WebGL are not evidence of frame rates (none were taken).

## Tests on real devices

Added to `docs/device-tests.md`, section "Progression (Phase 8 part A)": PROG-1 to PROG-5.
No test became pointless.

## Hard rule 1

Checked: the new texts are plain English words; no images other than the listed test
references; no third-party names.

## For the Pi side

Nothing changes there: no new build variables or packages; rooms in Adventure worlds are off
in the user interface until 8A2.

## Suggestions for the next part (8A2)

- `HostSession` already takes the book for locks; 8A2 makes it the owner (5.12) and passes
  `present` with the guests' records to `stepProgress`.
- Recalibrate `HUMAN_FACTOR` and the counts after PROG-1; the counts are one table and the
  bot's script re-checks the targets in about a minute.
- The bot could carry its stations and walk up hills more often; both would make its time
  estimate closer to a careful player's.
