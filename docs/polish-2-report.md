# Polishing session 2 report – the tracked task

Plan: `docs/polish-2-plan.md` (acceptance criteria Polish 2 AC1.1–AC4.3). Built after
Phase 8 part A2 was merged (`main` merged into `polish-2-task-tracker` first).

## What was built

- **The record and the action** (`src/actions/`): `PlayerRecord.track` (`0` automatic,
  `-1` hidden, or a chosen task id; `TRACK_AUTO`, `TRACK_HIDDEN`), the action
  `{ kind: 'track', task }` (`decodeAction`: an integer from −1 to 65 535; `applyAction`:
  `mode` in Creative, `invalid` unless the task is an open task of the open chapter or
  `-1`; it changes only `track`). `pipeline.test.ts` guards who gives `track` a value.
- **The derivation** (`src/progress/view.ts`): `trackedTask(record, progress)` (plan
  5.2), `trackerCount` and `trackerText` ("Mine 32 logs 12 / 32", "–" for a reach task).
- **Save format 5** (`src/save/saveFormat.ts`): `track` in every player record, guest
  entries and network records; `decodePlayer(value, format)` replaces the `legacy` flag;
  formats 1–4 load with `track` 0.
- **The tracker** (`src/ui/TaskTracker.ts`, inside the HUD): the top-left corner on the PC
  (12 px), below the menu button on touch; `.hud-corner` holds the tracker and the room
  notices in one column. `Game.refreshTracker` on every `onProgress`, `onPlayer` and world
  load. `getState().progress` has `tracked` and `track`.
- **The Tasks tab** (`src/ui/TasksTab.ts`): open rows are buttons (click, tap, the
  controller's A) that send `track`; the row the tracker shows is marked (`tracked`, a
  highlighted border, "Tracked" in a column before the count); done rows stay plain. Rows
  keep their elements across updates. The pad hint bar says "A Track" on a row.
- **Tests**: `src/actions/track.test.ts` (AC1.1), `src/progress/view.test.ts` (AC1.2),
  `src/actions/pipeline.test.ts` (AC1.3), `src/save/trackSave.test.ts` (AC2.1),
  `src/net/trackNet.test.ts` (AC2.2), `e2e/taskTracker.spec.ts` (AC3.1, AC3.2, AC3.5),
  `e2e/progressTouch.spec.ts` (AC3.3), `e2e/gamepadInventory.spec.ts` (AC3.4),
  `e2e/mpProgress.spec.ts` (AC3.6).

## Acceptance criteria

| Criterion | Result | Where                                                                                                                                                                                                                                                                                               |
| --------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1.1     | Met    | `src/actions/track.test.ts` (frozen inputs)                                                                                                                                                                                                                                                         |
| AC1.2     | Met    | `src/progress/view.test.ts`                                                                                                                                                                                                                                                                         |
| AC1.3     | Met    | `src/actions/pipeline.test.ts`                                                                                                                                                                                                                                                                      |
| AC2.1     | Met    | `src/save/trackSave.test.ts`                                                                                                                                                                                                                                                                        |
| AC2.2     | Met    | `src/net/trackNet.test.ts` (memory transport, two guests, leave and return, guest entries through the save format)                                                                                                                                                                                  |
| AC3.1     | Met    | `e2e/taskTracker.spec.ts`                                                                                                                                                                                                                                                                           |
| AC3.2     | Met    | `e2e/taskTracker.spec.ts` (a real craft and a real place finish the tasks)                                                                                                                                                                                                                          |
| AC3.3     | Met    | `e2e/progressTouch.spec.ts`                                                                                                                                                                                                                                                                         |
| AC3.4     | Met    | `e2e/gamepadInventory.spec.ts`                                                                                                                                                                                                                                                                      |
| AC3.5     | Met    | `e2e/taskTracker.spec.ts` (the pause and world menus without `test=1`)                                                                                                                                                                                                                              |
| AC3.6     | Met    | `e2e/mpProgress.spec.ts` (the notice checked is "Anna left", see below)                                                                                                                                                                                                                             |
| AC4.1     | Met    | `npm run check`, `npm run build`; specs run here: `taskTracker`, `progress`, `progressTouch`, `gamepadInventory`, `mpProgress`, `save`, `light`; after step 3 also `crafting`, `gamepadMenus`, `inventoryScreen`, `playerSection`, `torch`, `touchLayout`, `ui`, `worldMenu`, `mpFigure`, `mpMenus` |
| AC4.2     | Met    | see "References"                                                                                                                                                                                                                                                                                    |
| AC4.3     | Met    | text and CSS only                                                                                                                                                                                                                                                                                   |

## Decisions and deviations

| Topic                          | Decision                                                                                                                                                                   | Why                                                                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-1` with a complete book      | Accepted (it only hides)                                                                                                                                                   | The plan's refusal list names only task ids; hiding is always meaningful                                                                          |
| `decodePlayer` signature       | `decodePlayer(value, format = SAVE_FORMAT_VERSION)` instead of the boolean `legacy`                                                                                        | Three generations of records now (1–3, 4, 5); network records are always the current format                                                       |
| Pipeline rule for `track`      | A pattern like the 8A1 rule; allowed in `src/actions/`, the save format (4: encoder, two migrations, decoder) and once in `Game.ts` (`getState().progress.track` reads it) | The plan names actions, the save format and tests; the test API's state needs the field's name as a key                                           |
| Tracker element                | Label and count in two spans; the count span starts with the two spaces (`white-space: pre`), so the element's text equals `trackerText`                                   | Only the label is cut with an ellipsis; the count always shows                                                                                    |
| 45 % limit                     | `max-width: 45vw` on the tracker                                                                                                                                           | The game's root is the view; a percentage of the corner column would also limit the room notices                                                  |
| Room notices below the tracker | One column (`.hud-corner`); on touch the column moves below the menu button only while the tracker shows                                                                   | "Without it they stay where they are today" (plan 5.3)                                                                                            |
| Crowding fallback              | Not built (smaller font, two notices at most)                                                                                                                              | At 640 × 360 the tracker and a notice fit with room to spare (AC3.3); PROG-8 decides                                                              |
| The mark                       | A third grid column between label and count, empty unless tracked                                                                                                          | "Tracked … next to the count" without widening the fixed count column                                                                             |
| Rows keep their elements       | `TasksTab` reuses a row while its task and done state stay; a row that becomes done is rebuilt as plain text                                                               | The controller's focus and the pointer stay on the row after A or a click (the mark and the count change at once)                                 |
| AC3.6's notice                 | The layout check uses "Anna left" (the guest leaves at the end), followed by one host step                                                                                 | Room notices last 5 s of wall-clock time and the test-mode HUD redraws them on a step; "Anna joined" was often gone before the slow join returned |
| Rows' list roles               | Dropped (`role="list"` / `listitem`)                                                                                                                                       | A button with `role="listitem"` would lose its button role                                                                                        |
| `aria-label` of a row          | The task's label ("Make 16 coal"), `aria-pressed` for the mark                                                                                                             | `ui.focus` reports it; the controller test names rows by it                                                                                       |

### Tests changed on purpose

- `e2e/progress.spec.ts` Phase 8 AC5.2: the tab has four buttons now (the open rows) and
  the first row is marked "Tracked".
- `e2e/gamepadInventory.spec.ts` Phase 8 AC5.3 became "Phase 8 AC5.3, Polish 2 AC3.4":
  the D-pad reaches the rows instead of never entering the tab.
- `e2e/mpProgress.spec.ts` Phase 8 AC8.4: the first row's text includes "Tracked".
- Format 5: `e2e/save.spec.ts`, `e2e/light.spec.ts` (fixtures saved again as format 5 with
  `track` 0); unit tests `saveFormat.test.ts`, `guests.test.ts`, `progressSave.test.ts`,
  `WorldStore.test.ts` ("newer" is now format 6), `gatheringNet.test.ts` (a literal record);
  `repoHygiene.test.ts` counts 48 images (found by CI).

### References

New and looked at: `task-tracker` (a 480 × 96 clip of the PC view's top-left corner, the
canvas hidden; CI's Chromium drew the leaves and the text 2 % differently, so both new
references use the text references' 5 % limit) and `task-tracker-touch` (640 × 360, the canvas hidden: menu button,
tracker below it, bag, buttons, bar). Regenerated and looked at: `tasks-tab` and
`tasks-tab-touch` (the first open row marked "Tracked"); they still passed their loose
5 % limit, but the plan asks for them to be regenerated. `pad-inventory` shows the Items
tab, not the rows, and passed unchanged. All other references passed unchanged after step
3 (the test worlds of `progress=all` show no tracker).

## Known issues

- `e2e/mpMenus.spec.ts` "five players" (Phase 6 AC7.10) timed out at "Connecting…" twice
  while other specs or the unit tests ran in parallel here; alone it passes (2.8 min).
  Unchanged by this part; five software-rendered pages starve WebRTC on this machine.
- No other issue found. The tracker is drawn under the F3 overlay, which covers it while open (as
  planned).

## Measured numbers

The tracker adds no work per frame: it changes only when the book or the record changes,
and then only text that differs. No performance numbers were taken (software WebGL numbers
are never evidence).

## Tests on real devices

Added to `docs/device-tests.md`, section "Progression": PROG-8, PROG-9, PROG-10 (origin
P2). PROG-3 moved to "Obsolete" in `docs/device-tests-done.md` (the tab is no longer
read-only; PROG-9 replaces it).

## Hard rule 1

Checked: the tracker and the mark are text and CSS only; no images, fonts, names or
textures from any other game.

## For the Pi side

The room protocol changes again (player records carry `track`); devices must run the same
build, which the build id ensures. No new build variables, packages or lazy chunks.

## Suggestions for the next part

- If PROG-8 shows the phone's corner crowded, use the plan's fallback (a smaller font
  below 480 px height, at most two room notices while the tracker shows).
