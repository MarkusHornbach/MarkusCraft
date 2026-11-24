# Polishing session 2 plan – the tracked task

Read `CLAUDE.md`, `src/ui/CLAUDE.md`, `src/input/CLAUDE.md`, `src/actions/CLAUDE.md`,
`src/save/CLAUDE.md`, `src/progress/CLAUDE.md`, `src/net/CLAUDE.md` and `e2e/CLAUDE.md`
first, and the "Decisions and deviations" of `docs/phase-8a1-report.md` (Tasks tab,
notices, save format 4) and `docs/phase-8a2-report.md` (shared progress in rooms).

**Start only after the pull request of Phase 8 part A2 is merged.** This plan builds on it
(records travel to guests, the host owns the book). The session merges `main` into the
branch `polish-2-task-tracker` (which holds this plan) first and works there. It is
implemented autonomously in one cloud session: do not ask the owner questions. Where this
plan leaves a detail open, choose the simplest option and note it in
`docs/polish-2-report.md`, section "Decisions and deviations".

Tests name their acceptance criterion in the title as "Polish 2 AC1.1"; device tests have
the origin "P2".

## 1. Goal

In an Adventure world one task of the open chapter is shown on the main game screen, in
the top-left corner: "Mine 32 logs 12 / 32". The player chooses it in the "Tasks" tab by
clicking or tapping its row, or with A on the controller; choosing the shown task again
hides the tracker. Without a choice it shows the first open task. When the shown task is
done it moves on to the next open task. The choice belongs to the player and is saved with
the world, for guests in rooms too.

## 2. Decisions made with the owner

| Topic             | Decision                                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where it is built | A part of its own after Phase 8 part A2, not in that part's pull request                                                                                  |
| Stored            | Per player, in the world: a field of `PlayerRecord`, so the host keeps it for guests and it is saved (save format 5)                                      |
| Choosing          | A click, tap or A on a task row of the Tasks tab. The rows of the open chapter become focusable (this reverses the 8A1 rule "nothing in it is focusable") |
| Default           | Before any choice the tracker shows the first open task of the open chapter                                                                               |
| When done         | The tracker moves on to the next open task (section 5.2)                                                                                                  |
| Hiding            | Choosing the row of the task the tracker shows hides the tracker; choosing any row shows it again                                                         |
| Position          | Top-left on every device: the corner on the PC, just below the menu button on touch. The room notices ("Anna joined") move below the tracker              |
| Content           | One line: the task's label and its count ("12 / 32", "–" for a reach task), in the style of the other HUD notices                                         |

## 3. Changes to the original scope

The owner's starting proposal ("currently tasks can only be followed in the Tasks tab; a
player should be able to select a single task to be shown on the main game screen") was
challenged during planning. Agreed changes:

| #   | Change                                                                                    | Reason                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A part of its own instead of an addition to the pull request of Phase 8 part A2           | The 8A plan lists "a HUD tracker" as not chosen and out of scope; that pull request was finished and green, and the tracker is a different topic   |
| 2   | The choice is a field of the player's record, changed by a new action `track`             | "Per player, in the world" (owner); the record is the one place that is saved and travels to guests, and record fields change only through actions |
| 3   | The rows of the Tasks tab become focusable for the controller                             | Choosing needs it; PROG-3 (8A1) checked that nothing there can be selected, so it is replaced by a new device test                                 |
| 4   | Added: an automatic default (first open task) and hiding by choosing the shown task again | Owner's choices: new players see the tracker at once, and a player who does not want it can hide it without a new setting                          |

## 4. Out of scope (do not build)

- Tracking several tasks; a tracker in Creative; a tracker of the chapter or the level.
- Arrows, markers or directions in the world; sounds; extra notices for the tracked task.
- Changes to the tables, counts, XP, levels or unlocks; other changes to the Tasks tab than
  the focusable rows and the mark of the tracked row.
- A setting in the pause menu for the tracker.

## 5. Specification

### 5.1 The record and the action

- `PlayerRecord.track: number`: `0` automatic (nothing chosen, the default of
  `createPlayerRecord`), `-1` hidden, or a chosen task id (1–65 535). Built only by
  `src/actions/` (and the save format's decoder); extend the record-field rule of
  `pipeline.test.ts` to `track`.
- A new action `{ kind: 'track', task: number }` (`decodeAction`): `task` is a task id of
  the open chapter that is not done, or `-1` to hide. Refusals in this order: `mode`
  (Creative), `invalid` (anything else: an unknown id, a task of another chapter, a done
  task, `0`). It changes only `track`; it does not clear `breaking`. In a room it goes to the
  host like every action and counts towards a guest's rate limit.
- The screen decides what a press means (5.3), so the action stays a plain "set": choosing
  the row of the shown task sends `-1`; choosing another row, or any row while hidden,
  sends its id.

### 5.2 What the tracker shows (pure, `src/progress/view.ts`)

`trackedTask(record, progress)` → the task the tracker shows, or null (hidden):

- null if `track` is `-1` or the book is complete;
- the chosen task if `track` names a task of the open chapter that is not done;
- otherwise (automatic, or the chosen task is done or no longer in the open chapter) the
  next open task: the first task of the open chapter, in table order, that comes after the
  chosen one and is not done, wrapping around to the first open one of the chapter. With
  `track` 0 this is the chapter's first open task.

Nothing is written when the shown task moves on: the record keeps the chosen id, and the
derivation decides. `trackerText(task, progress)` gives the line: the label, two spaces
and "12 / 32" (`countOf`), or "–" for a reach task.

### 5.3 Screens

- **The tracker** (`src/ui/TaskTracker.ts`, part of the HUD): shown in Adventure worlds
  while playing; hidden with the HUD (inventory open, pause menu, world menu), in Creative,
  when `trackedTask` is null. No pointer events, no focus. A long label is cut with an
  ellipsis at 45 % of the view's width. PC: top-left corner (12 px). Touch: below the menu
  button. The room notices (`.net-notices`) are placed below the tracker while it shows,
  in one column; without it they stay where they are today. The debug overlay (F3) lies
  above it. It updates on every `onProgress` and `onPlayer`.
- **The Tasks tab:** each row of the open chapter that is not done is a button (mouse,
  touch, the controller's focus and A); done rows ("✓") stay plain. The row the tracker
  shows is marked (a highlighted border and the text "Tracked" in its status column next to
  the count; plain CSS and text, no images). Rows keep their fixed height and order. The
  controller's default focus stays on the tab button; D-pad down enters the rows; the
  right stick still scrolls the tab. The pad hint bar shows "A Track" on a row.
- `getState()` gets `progress.tracked` (`{ id, text } | null`, what the tracker shows) and
  `progress.track` (the record's value).

### 5.4 Save format 5 and the protocol

- `SAVE_FORMAT_VERSION` 5: player records (the world's player and every guest entry) get
  `track`, an integer from −1 to 65 535. A format 5 record without it, or with another
  value, is damaged. Formats 1–4 load with `track` 0 and are written back as 5. An unknown
  task id that is a valid number loads (the derivation treats it as "chosen task gone").
- Network records (`encodePlayer`, `decodePlayer`) carry `track` too; builds that differ
  never meet.

### 5.5 Test tools

`__mc.submit({ kind: 'track', task })` is enough to set the choice; no new tool.

## 6. Acceptance criteria

**AC1 Record, action, derivation**

- AC1.1 `track` refuses `mode` in Creative and `invalid` for an unknown id, a done task, a
  task of a later chapter and `0`; it accepts an open task and `-1`; it never changes
  anything but `track` (unit tests, frozen inputs).
- AC1.2 `trackedTask`: automatic shows the first open task; a chosen open task is shown;
  when it is done the next open task after it is shown, wrapping around; a new chapter
  shows its first open task; hidden and a complete book show nothing (unit tests).
- AC1.3 `pipeline.test.ts` fails if `track` is given a value outside `src/actions/`, the
  save format and tests.

**AC2 Save and rooms**

- AC2.1 Format 5 round trip of `track`; formats 1–4 load with `track` 0 and are written back
  as 5; malformed values (a fraction, −2, 65 536, a string, missing) are damaged (unit).
- AC2.2 Over the memory transport: a guest's `track` is applied by the host, kept when the
  guest leaves and returns, and saved in its guest entry; each player's choice is its own
  (unit).

**AC3 Screens**

- AC3.1 Mouse: in a fresh Adventure world (`progress=fresh`) the tracker shows "Mine 32
  logs 0 / 32"; clicking "Make 64 planks" in the Tasks tab shows that task; its count
  follows a craft; clicking it again hides the tracker; clicking any row shows it again
  (browser test).
- AC3.2 When the shown task is done the tracker shows the next open task; the last task of
  a chapter moves it to the next chapter's first open task; a complete book hides it.
- AC3.3 Touch: tapping a row chooses it; at 640 × 360 the tracker lies inside the view,
  below the menu button, and overlaps no touch button, the hotbar or the progress notice
  (browser test, as `e2e/progressTouch.spec.ts`).
- AC3.4 Controller: D-pad down from the tab reaches the rows, A chooses, A again hides;
  done rows are not focusable; the right stick still scrolls the tab (browser test in
  `e2e/gamepadInventory.spec.ts`).
- AC3.5 The tracker is hidden while the inventory, the pause menu or the world menu
  shows, in Creative, and while the book is complete; it survives a reload (`save=1`) with
  the player's choice.
- AC3.6 In a room the guest's tracker follows the shared book and its own choice; the room
  notices sit below the tracker (multiplayer browser test, an addition to
  `e2e/mpProgress.spec.ts`).

**AC4 General**

- AC4.1 `npm run check`, `npm run build` and the affected specs pass; no console errors.
- AC4.2 References: new `task-tracker` (PC) and `task-tracker-touch` (640 × 360);
  `tasks-tab`, `tasks-tab-touch` and `pad-inventory` regenerated if they show the tab with
  its rows, and looked at. Every other reference stays unchanged (the test worlds of
  `progress=all` have a complete book, so their HUD shows no tracker).
- AC4.3 Hard rule 1 checked (text and CSS only).

## 7. Implementation steps

1. Record field, action, derivation, pipeline rule. (AC1)
2. Save format 5 with migration; network records. (AC2.1, AC2.2)
3. The tracker on screen, the room notices below it, `getState()`. (AC3.1, AC3.2, AC3.5)
4. The Tasks tab: rows as buttons, the mark, focus and the hint bar. (AC3.1, AC3.4)
5. Touch layout at 640 × 360, references, the room test. (AC3.3, AC3.6, AC4.2)
6. Docs, device tests, report, pull request.

## 8. Documentation

- `src/ui/CLAUDE.md`: the tracker, the focusable rows (replacing "read-only: nothing in it
  is focusable"). `src/input/CLAUDE.md`: focus on the rows. `src/actions/CLAUDE.md`: the
  action `track` and the record field. `src/save/CLAUDE.md`: format 5.
  `src/progress/CLAUDE.md`: `trackedTask`. `docs/testing.md`: `progress.tracked`,
  `progress.track`, the new references.
- Root `CLAUDE.md`: the status row "Polish 2", `SAVE_FORMAT_VERSION` 5 in "Saving", and
  "Polish 2 names its criteria …" in "Reading older docs" if needed.
- `docs/device-tests.md`: in "Progression", PROG-3 moves to "Obsolete" in
  `docs/device-tests-done.md` (the tab is no longer read-only) and is replaced by a new
  test; new tests for the tracker (section 10).

## 9. Risks and fallbacks

| Risk                                                      | Fallback                                                                                      |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| The tracker and the room notices crowd the phone's corner | Smaller font below 480 px height (as the pause menu); at most two room notices while it shows |
| Focusable rows change the pad tests of 8A1                | Adapt only the steps that assumed nothing focusable; list them in the report                  |
| Save format 5 breaks fixtures of older tests              | As in 8A1: fixtures expect format 5 and `track` 0; list the adapted tests                     |

## 10. For the owner and for the Pi side

Device tests: **PROG-8** (P2) the tracker on the phone: readable, never in the way of the
buttons, the room notices below it; **PROG-9** (P2) choosing and hiding the tracked task
with mouse, finger and controller (replaces PROG-3); **PROG-10** (P2) in a room of two each
player tracks a different task and keeps it after leaving and rejoining.

For the Pi side: the room protocol changes again (records carry `track`); devices must run
the same build, which the build id ensures. No new build variables or packages.
