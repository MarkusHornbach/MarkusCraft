# Phase 3 part B report – Gathering

Plan: [`phase-3-plan.md`](phase-3-plan.md), Part B (steps 6–9). Branch
`claude/elegant-einstein-xisa8s`. Implemented in two cloud sessions: the first was stopped
by the owner during step 8, the second finished steps 8 and 9.

## What was built

- **Items** (`src/items/items.ts`): every placeable block is an item with the block's id;
  coal is item 256 (`Item.COAL`). Ids are pinned by `items.test.ts`.
- **Inventory** (`src/items/inventory.ts`): pure functions on the 36 slots (`addItems`,
  `fits`, `removeItems`, `moveStack`, `emptySlot`, `setSlot`, `countItems`); stacks of up
  to 99.
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
  were opened and judged by eye in both sessions: counts readable, cracks and progress bar
  clear, slots 48 px, nothing cut off at 640 × 360.
- **Documents**: `README.md` (modes, breaking, inventory, controls), `CLAUDE.md`.

## Acceptance criteria

| Criteria     | Where                                                                                                                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC6.1–AC6.4  | `src/items/*.test.ts`, `src/actions/inventoryActions.test.ts`                                                                                                                                            |
| AC6.5–AC6.9  | `e2e/inventory.spec.ts` (AC6.9 also as a unit test with a literal Part A record)                                                                                                                         |
| AC7.1–AC7.3  | `src/items/hardness.test.ts`, `src/actions/breaking.test.ts`                                                                                                                                             |
| AC7.4–AC7.11 | `e2e/breaking.spec.ts`; AC7.10 by the unchanged Phase 1 tests in `e2e/interaction.spec.ts`                                                                                                               |
| AC8.1–AC8.4  | `e2e/inventoryScreen.spec.ts`                                                                                                                                                                            |
| AC8.5        | `e2e/touchLayout.spec.ts` (640 × 360 and 1280 × 800)                                                                                                                                                     |
| AC8.6, AC8.7 | `e2e/inventoryScreen.spec.ts`; the four references                                                                                                                                                       |
| AC9.1, AC9.2 | `e2e/gathering.spec.ts`                                                                                                                                                                                  |
| AC9.3        | `repoHygiene.test.ts` passes (15 images, all test references). Checked by hand: the coal icon, the bag and bin symbols and the cracks are painted by code; no protected name in code, texts or documents |
| AC9.4–AC9.6  | `README.md`, `CLAUDE.md`, this file                                                                                                                                                                      |
| AC9.7        | See the pull request                                                                                                                                                                                     |

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

| Play-through (AC9.1) | The test moves the player to the beach and to the tree with `setPlayer`; breaking, selecting and placing use real mouse and key events, and nothing is given. The nearest sites of seed 1337 are found with the test API (the beach about 36 blocks from the start point) | Walking there with keys under software rendering would take minutes and add nothing to what is tested |
| Wall of the play-through | Three blocks in one row on a dry place of three by three columns; the sand is dug at its edge. A hole dug next to the lake fills with water, and `surfaceY` counts water as surface | Found when the test first ran |
| Soak (AC9.2) | A fixed seed; 500 actions give 23 accepted breaks, 9 places, 4 discards and every listed refusal | Deterministic, so the counts are asserted |
| Mode is permanent | A world's mode cannot be changed after it is created; the README says so | The plan has no such function |
| Second session | The first session was stopped by the owner during step 8. The second one ran the full suite (the code of step 8 needed no change), made the two step 9 tests pass, and wrote the documents | – |
Existing tests adapted: `e2e/game.ts` (`createWorld` chooses Creative unless told
otherwise; `openMenu` waits for `.world-menu[data-ready]`), `touchLayout.spec.ts` (creates a
Creative world; seven touch buttons with `bag`; nine lines in the touch controls list),
`ui.spec.ts` and `worldMenu.spec.ts` (twelve lines in the controls list), `worldMenu.spec.ts`
AC4.6 (the retry no longer blocks on a button that is gone), `actions.test.ts`,
`urlParams.test.ts`, `repoHygiene.test.ts` (15 images).

## Test robustness

- The "New world" form is on screen before the list of stored worlds arrives and is reset
  when it does. A test that typed a name early lost it under load. `WorldMenu` now sets
  `data-ready` and the helpers wait for it.
- Running `npm run check` or a build while the browser tests run makes menu tests time out.
  Run the suite alone.
- A vertical finger drag that starts on the inventory overlay is a scroll gesture for the
  browser (the overlay may scroll on very small screens) and cancels the touch. Tests drag
  sideways there.
- A hole dug next to water fills with water and `surfaceY` reports water as the surface: a
  test that looks for flat ground must check the block, not only the height.
- In a test that builds actions from stored objects, spread the cell only
  (`{ kind: 'break', ...cell }`): a stored action brings its own `kind` along.
- The full browser run now takes a little over seven minutes with three workers.

## Measured numbers

| Measurement                   | Result                                                              |
| ----------------------------- | ------------------------------------------------------------------- |
| Production bundle             | 649 kB JavaScript (Part A: 630 kB), 13 kB CSS (Part A: 10 kB)       |
| Unit tests                    | 275 (Part A: 218), about 8 s; line coverage of the pure core 98.7 % |
| Browser tests                 | 111 (Part A: 83), 7.3 minutes with 3 workers                        |
| `addItems` on 36 slots (Node) | about 0.0001 ms                                                     |
| `moveStack` (Node)            | about 0.00003 ms                                                    |
| Break overlay                 | 1 draw call while a block is being broken, 0 otherwise (AC7.11)     |
| Soak of 500 actions (AC9.2)   | about 1 s in the browser, without a console message                 |

Frame rates still cannot be measured in the cloud container (software WebGL). Part B adds
one small mesh and a few HUD elements; nothing in it touches generation or meshing.

## Known issues

- Nothing was tried on a real device: break times, the inventory by finger and the bag
  button are judged from tests and screenshots only (see the list below).
- Closing the inventory with `Esc` usually ends in the pause menu ("Click to continue"),
  because browsers do not give the mouse back on that key. The close button returns to the
  game directly (AC8.3); `E` should too, but that was not tested with a captured mouse.
- The Creative screen shows the bin although nothing can be thrown away there (it is
  greyed out).
- A Gathering world offers nothing to do with coal, iron ore and clay yet; that is Part C.
- A malformed action made `Game.onActionResult` throw while step 7 was written; fixed, and
  covered by `e2e/actions.spec.ts` and both soak tests.

## For the owner to try

Open the deployed game after merging. Each item says what to look for.

1. **The mode choice in the form.** "New world" shows Gathering (preselected) and Creative
   with one line of explanation. Is it clear what each means? The list of worlds names the
   mode of each world.
2. **Feel of the break times with the mouse.** In a Gathering world hold the left button on
   leaves (0.25 s), sand and dirt (0.6 s), a log (2 s) and stone (3 s). Too slow, too fast?
   Holding on continues with the next block. Stone by hand is meant to feel long: Part C
   brings tools.
3. **Feel of the break times by finger**, on the phone and the tablet: hold the break
   button. Is it comfortable to hold for three seconds while the other thumb looks around?
   A short tap must not break anything.
4. **Cracks and progress bar.** Are the cracks visible on dark blocks (log, coal ore) and
   in the evening? Is the small bar under the crosshair noticed at all?
5. **Pickup notice.** "+1 Dirt" above the bar, counting up while you keep digging: readable
   on the phone, and gone soon enough?
6. **"Inventory full".** Fill the inventory (sand and dirt go fastest; 36 slots of 99 take
   a while – or fill it with many different blocks and stacks). Is it understood why the
   block no longer breaks?
7. **The inventory with the mouse.** `E` opens it, the mouse is free; click a stack, then
   another slot: move, merge, swap; the bin throws away. The close button returns to the game with the mouse captured; does `E` as well? `Esc` closes too but usually shows the pause menu –
   is that acceptable?
8. **The inventory on the phone** (landscape): the bag button at the top right opens it.
   Are the slots large enough for a finger, is everything on screen, are the counts
   readable? The game goes on behind it.
9. **The bag button.** Is the symbol recognised as a bag, and is its place good (left of
   the fly button; in the corner in a Gathering world)?
10. **Creative as before.** Flying, instant breaking, unlimited blocks. The inventory key
    shows all blocks: put coal ore, iron ore or clay into the bar and build with them.
11. **Old worlds.** A world created before this part opens as a Creative world with the
    nine blocks in its bar and everything that was built.
12. **Saving.** Gather something in a Gathering world, go back to the worlds, close the
    browser, come back: the inventory is as it was.

## Suggestions for Part C

- Recipes are one more action (`craft`); the soak already sends `{ kind: 'craft' }` and
  expects `invalid`, so that test must be adapted when the action exists.
- `RejectReason` already has `station`; `missing` stands for an empty slot and fits "not
  enough material".
- Tools divide the times in `items/hardness.ts` (`breakTimeMs(block)` gets the held item).
  `selectSlot` already clears a running break, which is what tools need.
- Items that are no blocks start at 256 and get their icon from
  `render/textures/itemIcons.ts`; `ui/itemIcon.ts` chooses between cube and icon.
- The inventory screen has room below the 27 slots at 1280 × 800 but not at 640 × 360: the
  recipe list needs its own page or a second column there.
- Decide in the plan whether tools wear out; the record has only `{ item, count }` per
  slot, and anything more is a new save format version.
