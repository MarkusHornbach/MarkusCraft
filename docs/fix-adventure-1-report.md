# Fix Adventure 1 report – the torch unlock and the focus while smelting

Plan: `docs/fix-adventure-1-plan.md` (acceptance criteria Fix Adventure 1 AC1.1–AC4.4).
A fix round after Phase 8 part A, built on `claude/wizardly-cerf-ruf1da` (the branch that
held the plan, which started from `main`).

## What was built

- **The torch's unlock** (`src/progress/tables.ts`): recipe 20 comes with task 11 "Make 16
  coal" instead of task 12 "Mine 32 coal". The comment above it says "The torch comes with
  "Make 16 coal": coal from logs, without light." (AC1.1, checked by reading). Lock texts
  follow from the table: "Task: Make 16 coal", "Locked: Make 16 coal", "Unlocked: Torch".
- **Crafted recipes stay unlocked** (`src/progress/progress.ts`): `recipeUnlocked` returns
  true when `record.crafted` holds the recipe. `applyAction`'s `craft`, `Game.recipeLocks`
  and the bot all go through it; in a room each player's own record decides. Nothing new
  is stored (format 5, no migration); the static check does not use the rule.
- **The light rule of the static check** (`tables.ts`, `check.ts`): `DARK_BLOCKS` (coal
  ore, iron ore) as `darkBlocks` in `ProgressTables`; `isLightSource` (a recipe whose
  result block emits light: the torch). Until a light source is unlocked and its result
  obtainable, dark blocks are no source and `reachBelow` tasks cannot be done. A stuck task
  says why: `task 12 "Mine 3 coal": needs light (coal ore), no light source before it`.
- **The bot's dark-break report** (`src/bot/Bot.ts`, `report.ts`,
  `scripts/progressRun.ts`): `DARK_LIGHT` (4), `Bot.brightestFace`, `Bot.isDarkBreak`,
  `BotRun.darkBreaks` (per task and block), `darkBreakRows` / `formatDarkBreaks`. The
  script prints the table after the time tables; it never fails a run.
- **The "Craft" button while smelting** (`src/ui/RecipeList.ts`, `ui.css`): the bar
  (`.recipe-progress`) now lies inside the button, behind its label, filling it from the
  left; the button stays visible, in place and focusable while its row smelts (its
  background darkens). `aria-label` "Craft Coal" and the label "Craft" are unchanged; so
  is `getState().smelting`. `Game` was not changed: a press during a smelt already started
  nothing, and a held press already starts the next smelt with the first repeat after the
  delivery.
- **Tests**: `src/progress/tables.test.ts` (AC1.1), `progress.test.ts` and
  `src/actions/crafting.test.ts` (AC1.2), `src/save/torchUnlock.test.ts` (AC1.3),
  `src/net/progressNet.test.ts` (AC1.4), `e2e/progress.spec.ts` (AC1.5),
  `src/progress/check.test.ts` (AC2.1), `src/bot/darkBreak.test.ts` (AC2.2),
  `src/bot/bot.slow.test.ts` (AC2.3), `src/bot/report.test.ts` (the table, AC2.4),
  `e2e/crafting.spec.ts` (AC3.1), `e2e/gamepadInventory.spec.ts` (AC3.2),
  `e2e/progressTouch.spec.ts` (AC3.3).

## Acceptance criteria

| Criterion | Where                                                                 | Result                                                      |
| --------- | --------------------------------------------------------------------- | ----------------------------------------------------------- |
| AC1.1     | `tables.test.ts` (pin `T11`), the comment read                        | passes                                                      |
| AC1.2     | `progress.test.ts`, `crafting.test.ts` (frozen inputs)                | passes                                                      |
| AC1.3     | `torchUnlock.test.ts`: four metas through the real encoder            | unlocked, unlocked, locked ("Task: Make 16 coal"), unlocked |
| AC1.4     | `progressNet.test.ts` over the memory transport, both directions      | passes                                                      |
| AC1.5     | `e2e/progress.spec.ts`, one real smelt at a furnace                   | passes                                                      |
| AC2.1     | `check.test.ts`: shipped tables 50, 125, 235, 380, 520; four variants | passes                                                      |
| AC2.2     | `darkBreak.test.ts`                                                   | passes                                                      |
| AC2.3     | `bot.slow.test.ts`: no dark break after task 11                       | passes                                                      |
| AC2.4     | `npx vite-node scripts/progressRun.ts` (below)                        | 12/12 complete, targets hold, table printed                 |
| AC3.1     | `crafting.spec.ts` (Phase 3 AC12.3, changed on purpose)               | passes                                                      |
| AC3.2     | `gamepadInventory.spec.ts` (Phase 5 AC6.2, changed on purpose)        | passes                                                      |
| AC3.3     | `progressTouch.spec.ts`, 640 × 360                                    | passes                                                      |
| AC3.4     | Phase 5 AC6.1 and AC6.3 unchanged                                     | pass                                                        |
| AC3.5     | references (below)                                                    | regenerated and looked at                                   |
| AC4.1     | `npm run check`, `npm run build`, the specs listed below              | pass, no console messages                                   |
| AC4.2     | `npm run docs:budget`                                                 | only the allowed `src/net/CLAUDE.md` warning                |
| AC4.3     | hard rule 1 (below)                                                   | checked                                                     |
| AC4.4     | `CI result` on the pull request                                       | see the pull request                                        |

Browser specs run locally (alone, `MC_CONTAINER_GPU_STALL=1`): `progress`,
`progressTouch`, `crafting`, `gamepadInventory`, `inventoryScreen`, `touchLayout`,
`padSoak`, `mpProgress`, `mpGathering`, `taskTracker`.

## Decisions and deviations

| Topic                                          | Decision                                                                                                                                                                                                                     | Why                                                                                                                                                                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Light source can be made"                     | The fixed point first computes what is obtainable without dark blocks; if a light source's result is in it, the light is on and obtainable is computed again with them                                                       | Equals "unlocked and its ingredients (and station) obtainable" without a second graph walk                                                                                                                  |
| Failure text                                   | The usual `chapter N "…" cannot be finished: task …` line, followed by `: needs light (coal ore), no light source before it` when the task would be possible with light; a `reachBelow` says `needs light (depth 30)`        | Keeps the existing message shape (and its tests); the plan's example text is contained in it. Other tasks blocked only through the locked light source (e.g. "Make 8 torches") stay plain                   |
| The torch-on-task-14 variant                   | With the shipped `darkBlocks` the first failure is task 12 (it needs light before task 14 can unlock the torch); the test also builds the variant with only iron ore dark, where task 14 fails with `needs light (depth 30)` | Both show the rule; the plan names "a `reachBelow` without light"                                                                                                                                           |
| How the bot gets light                         | Before a counted break it lights the 3 × 3 chunks around the block (generating their neighbours as needed) and reads `World.getLight`                                                                                        | The plan's "lighting the chunks the bot works in": stored light stays correct through later edits (quick updates), and `verifyLight` checks it. Nothing is counted after the torch, so the cost stops there |
| `isLightSource` location                       | Exported from `src/progress/check.ts`, used by the bot                                                                                                                                                                       | One definition of a light source for the check and the report                                                                                                                                               |
| Dark-break table                               | Rows only for tasks with a dark break in some run; medians over all 12 runs (zeros included)                                                                                                                                 | A short table; a task without breaks in most runs shows median 0 and its maximum                                                                                                                            |
| The bar inside the button                      | `.recipe-progress` became an absolutely placed child of the button (`z-index: -1` in an isolated button), the fill orange; the button's background darkens while smelting                                                    | No new element, the label stays on top, the box of the button is unchanged                                                                                                                                  |
| A row that smelts but can no longer be crafted | The button stays visible while its row smelts even if the row is no longer craftable (a player walked away from the furnace); it goes once the smelt ends or is refused                                                      | The bar was visible in that state before too (Polish 1 decision 8); the focus does not jump mid-smelt                                                                                                       |
| `padSoak` Part B                               | One more RB in the button weights, and the screen and tab are sampled every frame instead of every tenth                                                                                                                     | With the button change the real-time soak reached "Tasks" in only some runs (it is a seeded walk whose path depends on frame pacing). After the change: 5 of 5 runs pass                                    |
| `recipe-list-touch` reference                  | Regenerated although it shows no smelting row                                                                                                                                                                                | It was stale since 8A1 (no "Tasks" tab, no locked row) and passed only within the 5 % text tolerance; the new one shows the current list                                                                    |
| Docs size                                      | "Your player" details moved from `src/ui/CLAUDE.md` to `src/game/CLAUDE.md`; the root's "Open" and device-test paragraphs were tightened to make room for the status row                                                     | Plan section 10 and AC4.2                                                                                                                                                                                   |

### Tests changed on purpose

- `src/progress/tables.test.ts`: the pin of recipe 20 is `T11` (was `T12`).
- `src/progress/progress.test.ts`: the task unlock is reached by task 11 (a coal craft);
  `recipeUnlocked` with task 12 done is now false, with task 11 true; `outcomesOfBook`
  names task 11.
- `src/progress/view.test.ts`: "Locked: Make 2 coal" (starting tables); the "Unlocked:
  Torch" notice comes from the coal craft of task 11.
- `src/actions/crafting.test.ts`: the torch with task 12 done is `locked`, with task 11
  `ok`.
- `e2e/progress.spec.ts`: Phase 8 plan 5.8 expects the torch's unlock `{ task: 11 }`;
  Phase 8 AC3.2 expects "Task: Make 16 coal".
- `e2e/crafting.spec.ts` Phase 3 AC12.3: the button stays visible under its bar (it hid
  before); adds the AC3.1 checks.
- `e2e/gamepadInventory.spec.ts` Phase 5 AC6.2: the focus stays on "Craft Coal" (it moved
  away before); adds the AC3.2 checks.
- `e2e/padSoak.spec.ts` Phase 5 AC4.1 Part B: weights and sampling (see the table).

### References

Regenerated and looked at: `recipe-list` (the coal row's bar now fills its "Craft" button,
half full, label readable on top) and `recipe-list-touch` (stale, see above).
`pad-recipe-list` and `touch-controls` were regenerated in the same run, came out without
a real change (0 and 1 229 of 518 400 pixels off, rendering noise) and were left as they
were. Every other reference is unchanged.

## Known issues

- Torches made and placed in chapter 3 do not count for chapter 4's "Make 32 torches" and
  "Place 32 torches" (the 8A counting rule, unchanged by plan). PROG-11 asks about it.
- A press on "Craft" during a smelt does nothing (no furnace queue, out of scope); the
  darker button with the bar is the only hint. CRAFT-14 asks whether that is understood.

## Measured numbers

`npx vite-node scripts/progressRun.ts` (52 s for all 12 runs; 1–7 s per run). Every run
complete, light errors 0. The time table is identical to the 8A1 report (the bot plays
the same actions): total median 32.3 min (max 38.0), chapters 3.7, 5.2, 8.4, 6.8, 8.0;
largest gap between level-ups 7.4 (max 11.3); actions median 1 870, blocks broken median 635. Every balance target holds.

```
Dark breaks before a light source (12 runs; report only, never a failure)

| Task | All: median | All: max | Ores: median | Ores: max |
| --- | ---: | ---: | ---: | ---: |
| 6 Mine 64 stone | 20 | 47 | 0 | 0 |
| 7 Make a stone pickaxe | 0 | 1 | 0 | 0 |
| 8 Climb to height 64 | 0 | 64 | 0 | 3 |
```

As expected: dark breaks of stone in chapter 2 (the bot's sideways tunnels to stone),
up to three incidental coal ores on a climb, and none after task 11. Fewer than the
planning session's scratch run saw (50–120 stone): this count needs every face at most 4
and lights the chunks with the real light engine. What the bot cannot judge: whether a
player would dig an open pit instead of a tunnel, the night (the bot ignores the time of
day), and how dark is too dark on a real screen (PROG-11).

## Tests on real devices

Added to `docs/device-tests.md` (origin FA1): CRAFT-14 ("Crafting and tools"), PAD-17
("Controller"), PROG-11 and PROG-12 ("Progression"). PROG-5 moved to "Obsolete" in
`docs/device-tests-done.md` (its example "Task: Mine 32 coal" no longer exists; PROG-12
replaces it). PAD-14 stays.

## Hard rule 1

Checked: the changes are table data, text and CSS (an orange fill inside a green button);
no images, fonts, names or textures from any other game.

## For the Pi side

No protocol change, no save format change, no new build variables or packages. The host
decides locks with each player's own record as before; devices in a room run the same
build, which the build id ensures. After the merge the Pi needs a `/sync` so that its main
build serves this version. Shared worlds stored on the Pi's main build load unchanged.
PAD-17, CRAFT-14 and PROG-11 can be played on the PR preview while the pull request is
open.

## Suggestions for the next part

- If PROG-11 finds the chapter 3 torches not counting unfair, count torches made since
  the torch was unlocked, or lower chapter 4's torch counts (a tables change).
- If CRAFT-14 shows that presses during a smelt confuse, the furnace queue ("several
  items in the furnace") is the natural next step.
- A light-aware bot (one that picks lit sources and plays at night) would turn the
  dark-break report into a check; part B's radar could use the same light reading.
