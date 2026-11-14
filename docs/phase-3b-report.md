# Phase 3 part B report – Gathering (work in progress)

Plan: [`phase-3-plan.md`](phase-3-plan.md), Part B (steps 6–9). Branch
`claude/elegant-einstein-xisa8s`. **Part B is not finished.** The first session was stopped
by the owner during step 8; this file is the hand-over. The next session completes it and
then rewrites this file as the final report (Definition of Done, item 8).

## Status when the session stopped

| Step | State                                                                                                                                                                                                                                                             |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6    | Done and committed. `npm run check:all` passed (99 browser tests) on the commit of steps 6 and 7                                                                                                                                                                  |
| 7    | Done and committed together with step 6 (see "Decisions and deviations", commits)                                                                                                                                                                                 |
| 8    | Code, browser tests and the four references are written. The step 8 tests (`e2e/inventoryScreen.spec.ts`, "Phase 3 AC8.5" in `e2e/touchLayout.spec.ts`) passed when run alone. **The full `npm run check:all` for step 8 was interrupted** after 44 passing tests |
| 9    | `e2e/gathering.spec.ts` (AC9.1 play-through, AC9.2 soak) is written but **was never run**. README, `CLAUDE.md`, the final report, merging `main`, the pull request and CI are open                                                                                |

## To do, in this order

1. `npm ci`, `npm run check`, then `npm run test:e2e` (about 7 minutes; run nothing else in
   parallel, see "Test robustness"). Fix what fails. Step 8 is then complete: commit.
2. Run `e2e/gathering.spec.ts` and make it pass. It finds the nearest beach and tree of seed
   1337 with the test API and uses real mouse and key events for breaking, selecting and
   placing; the player is moved to the sites with `setPlayer` (record that in the report).
   The geometry of the wall (three cells in one row on the beach, each targeted on its top
   face) is untested and may need another spot or other angles.
3. AC9.3: hygiene and hard rule 1 for icons, cracks and texts (coal icon, bag and bin
   symbols, crack overlay are painted by code; texts are plain English).
4. AC9.4: `README.md` – both modes, the inventory, the controls (E, bag button; no flying in
   Gathering), timed breaking.
5. AC9.5: `CLAUDE.md` – structure (`src/items/`, `render/BreakOverlay.ts`,
   `render/textures/itemIcons.ts` and `cracks.ts`, `ui/InventoryScreen.ts`,
   `ui/itemIcon.ts`), conventions and test API listed below, status "Phase 3 part B:
   implemented".
6. AC9.6: rewrite this file as the final report, including measured numbers and the manual
   list for the owner (feel of the break times by finger and mouse, the inventory on the
   phone, whether "Inventory full" is understood, the bag button, E and Esc with the
   captured mouse, the mode choice in the form).
7. Merge the current `main`, `npm run check:all`, open exactly one pull request, CI green.

## What exists

- **Items** (`src/items/items.ts`): every placeable block is an item with the block's id;
  coal is item 256 (`Item.COAL`). Ids are pinned by `items.test.ts`.
- **Inventory** (`src/items/inventory.ts`): pure functions on the 36 slots (`addItems`,
  `fits`, `removeItems`, `moveStack`, `emptySlot`, `setSlot`, `countItems`).
- **Hardness** (`src/items/hardness.ts`): break times of plan 5.5 by hand, drop table (coal
  ore yields coal).
- **Actions**: `startBreak`, `moveStack`, `discard`, `setBarSlot` added; `break` and `place`
  have their Gathering rules.
- **Game mode**: chosen in the "New world" form (Gathering preselected), `mode=` in test
  mode, no flying in Gathering (key, touch button, `setPlayer`, controls list).
- **HUD**: the bar shows the record's slots with counts; break progress bar, crack overlay
  (`render/BreakOverlay.ts`, one draw call), pickup notice, "Inventory full".
- **Inventory screen** (`ui/InventoryScreen.ts`): 27 slots or the Creative palette, bar, bin,
  close button; `E`, `Esc`, touch button `bag`.
- **Test API**: `give(item, count)`, `clearInventory()`, `openWorld(name, seed, mode?)`;
  `getState()` has `breaking { x, y, z, progress } | null` and `ui { screen }`.
- **References**: `gathering-hud`, `inventory`, `palette`, `inventory-touch` (new),
  `touch-controls` and `pause-screen` (regenerated: bag button, line "E – Inventory"). All
  six were opened and judged by eye: counts readable, cracks and progress bar clear, slots
  48 px, nothing cut off at 640 × 360.

## Decisions and deviations

| Topic                    | Decision                                                                                                                                                                                                                  | Why                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Commits                  | Steps 6 and 7 are one commit, and it already contains the inventory screen code of step 8 without its tests                                                                                                               | The session wrote the action rules of both steps before testing in the browser; a deviation from hard rule 4 |
| Save format              | Unchanged (version 1). A Part A record loads as it is (AC6.9: unit test with a literal record, and a browser test that writes it into IndexedDB)                                                                          | The record already had 36 slots and the mode                                                                 |
| Which blocks are items   | Every placeable block (solid and breakable). Air, water and bedrock are no items                                                                                                                                          | Nothing else can be held                                                                                     |
| Unknown item ids         | A stored item id this build does not know still loads; it shows as "Unknown item" without an icon                                                                                                                         | A later part must not make worlds "damaged"                                                                  |
| Notices                  | `ActionResult.notices` is a list of `{ item, count }`, not of strings                                                                                                                                                     | The screen counts pickups up and maps ids to names, like the reasons                                         |
| `moveStack` in Creative  | Equal blocks swap instead of merging                                                                                                                                                                                      | AC6.3: a Creative count never changes                                                                        |
| Running break            | `selectSlot`, `moveStack`, `discard` and a Gathering `place` clear `record.breaking`                                                                                                                                      | "The selected slot unchanged since then", also for the tools of Part C                                       |
| `startBreak`             | Refused with `mode` in Creative, `unbreakable`, `reach`, `invalid`, and `full` if the drop has no room. A new press always submits it again                                                                               | "Breaking does not start"; releasing and pressing starts from zero                                           |
| Break without start      | `break` in Gathering without a matching `startBreak` is refused with `early`                                                                                                                                              | No other reason of the plan fits                                                                             |
| Action clock             | `simSteps` is counted before the held actions of a step, so dirt falls on step 36                                                                                                                                         | AC7.4                                                                                                        |
| Notice times             | Pickup notice and "Inventory full" last 1.5 s of simulation time (`NOTICE_MS`)                                                                                                                                            | Deterministic in test mode                                                                                   |
| Cracks                   | Five nested stages painted by `render/textures/cracks.ts`: dark lines with a faint light edge below them                                                                                                                  | Visible on dark blocks too                                                                                   |
| Pipeline check           | `pipeline.test.ts` also fails if the slot-changing inventory functions are called outside `src/actions/` (one call in `Game.ts` for `give`) or if `replaceRecord` is called outside the two test tools                    | Plan 5.2                                                                                                     |
| Mode in the form         | Two buttons (Gathering, Creative) with a one-line explanation; the form resets to Gathering each time it opens                                                                                                            | Plan 5.5                                                                                                     |
| Settings page            | Lists all controls including flying (no world is open there)                                                                                                                                                              | –                                                                                                            |
| Inventory keys           | `Game` listens for `E` and `Esc` itself; `Input` ignores keys while the screen is open                                                                                                                                    | One listener opens and closes                                                                                |
| Mouse after closing      | Closing requests the pointer lock; if it is not there after 1 s, or the browser reports an error, the pause menu shows ("Click to continue"). Esc is no user gesture for browsers, so closing with Esc usually ends there | Fallback of plan section 8                                                                                   |
| While the screen is open | The HUD is hidden and the touch controls are made invisible (`covered`: opacity 0, no touches) instead of removed                                                                                                         | Judged by eye on `inventory-touch`: the buttons shone through around the panel                               |
| Creative palette         | A block goes into the selected bar slot, or into a bar slot that was picked first                                                                                                                                         | By touch the selected slot cannot be changed while the screen is open                                        |
| Reference screenshots    | `inventory-touch` hides the canvas and uses `maxDiffPixelRatio` 0.05 (no test mode); `inventory`, `palette` and `gathering-hud` are taken in test mode with the world behind them                                         | As `pause-screen`                                                                                            |

Existing tests adapted: `e2e/game.ts` (`createWorld` chooses Creative unless told
otherwise; `openMenu` waits for `.world-menu[data-ready]`), `touchLayout.spec.ts` (creates a
Creative world; seven touch buttons with `bag`; nine lines in the touch controls list),
`ui.spec.ts` and `worldMenu.spec.ts` (twelve lines in the controls list), `worldMenu.spec.ts`
AC4.6 (the retry no longer blocks on a button that is gone), `actions.test.ts`,
`urlParams.test.ts`, `repoHygiene.test.ts` (15 images).

## Test robustness (found in this session)

- The "New world" form is on screen before the list of stored worlds arrives and is reset
  when it does. A test that typed a name early lost it under load. `WorldMenu` now sets
  `data-ready` and the helpers wait for it.
- Running `npm run check` or a build while the browser tests run makes menu tests time out.
  Run the suite alone.
- A vertical finger drag that starts on the inventory overlay is a scroll gesture for the
  browser (the overlay may scroll on very small screens) and cancels the touch. Tests drag
  sideways there.

## Known issues

- A malformed action made `Game.onActionResult` throw while step 7 was written; fixed, and
  covered by `e2e/actions.spec.ts` and the Part A soak test.
- Nothing was tried on a real device.
