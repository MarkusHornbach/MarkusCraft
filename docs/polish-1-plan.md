# Polishing session 1 plan – inventory and recipe list

Read `CLAUDE.md`, the "Decisions and deviations" of `docs/phase-3c-report.md` (recipe
list, hold to repeat, furnace) and of `docs/phase-5a-report.md` (focus system; decision 13
on the inventory) first. This is a small session between Phase 5 part A and part B. It is
implemented autonomously in one cloud session: do not ask the owner questions. Where this
plan leaves a detail open, choose the simplest option and note it in
`docs/polish-1-report.md`, section "Decisions and deviations".

Tests name their acceptance criterion in the title as "Polish 1 AC1.1".

## 1. Goal

The recipe list keeps one fixed order, so crafting never changes what lies under the
mouse, a finger or (in Part B) the controller's focus. Craftable recipes are found by
their highlight and by a count on the "Crafting" tab, not by moving to the top. The rule
that made another recipe ignore presses for a quarter of a second after a craft goes away
with the reason for it. Two small known issues are fixed on the way. The result is the
layout that Phase 5 part B builds on.

No change to the game's rules: recipes, items, break times, the action layer and the save
format stay as they are.

## 2. Decisions made with the owner

| Topic             | Decision                                                                                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Order             | Table order (recipe ids 1–20) at all times. Craftable rows keep today's highlight (green border and background, "Craft" button); the others stay greyed                      |
| Finding them      | The "Crafting" tab shows the number of recipes that can be made now ("Crafting 3"); no number at 0                                                                           |
| Quarter second    | The rule "a press on another recipe within `CRAFT_REPEAT_MS` of a craft is ignored" is removed: with a fixed order and rows of fixed height nothing slides under the pointer |
| Scroll position   | The list keeps its scroll position while a world is open (tab switches, closing and opening the inventory); loading a world starts at the top                                |
| Esc               | Unchanged (see section 3, change 1)                                                                                                                                          |
| Holding "Craft"   | The first repeat comes after `CRAFT_HOLD_DELAY_MS` (500), then every `CRAFT_REPEAT_MS` (250) as now                                                                          |
| Pause menu labels | "Controller sensitivity" and "Invert controller look" fit on one line                                                                                                        |
| Device tests      | None are needed to finish this session; new entries are added to `docs/device-tests.md` for later                                                                            |

## 3. Changes to the original scope

The owner's starting scope was challenged during planning. Agreed changes:

| #   | Change                                                                                                             | Reason                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Dropped: "Esc closes the inventory and returns to play instead of ending up in the pause menu". Esc stays as it is | In the planning session, headless Chromium closed the inventory with Esc and captured the mouse again, without the pause menu. The Phase 3B report's "usually ends in the pause menu" was never seen on a device (GATH-7 has no result). Whether other browsers refuse cannot be found out without a device test. The owner chose to keep it; GATH-7 will tell |
| 2   | Added: a count of craftable recipes on the "Crafting" tab                                                          | With a fixed order a craftable row can lie below the visible part of the list (the list shows about five and a half of its 20 rows; the torch is last)                                                                                                                                                                                                         |
| 3   | Added: the list keeps its scroll position while a world is open                                                    | Jumping to the top made sense while craftable rows came first. With a fixed order a player who uses the furnace rows or torches would scroll down every time                                                                                                                                                                                                   |
| 4   | Added: rows of one fixed height and an action column of fixed width                                                | Needed for the goal. Today a row may grow when an ingredient's count gets longer or a note replaces the "Craft" button, which moves every row below it                                                                                                                                                                                                         |
| 5   | Added: the first repeat of a held "Craft" after 500 ms instead of 250 ms                                           | Known issue of Phase 3C: a finger that rests on "Craft" for a quarter second before it starts scrolling crafts once. The same rule then holds for mouse, finger and (Part B) controller                                                                                                                                                                        |
| 6   | Added: the two controller labels of the pause menu on one line                                                     | Noted in the Phase 5A report as a candidate for this session; it is cheap. It touches the pause menu, not the inventory                                                                                                                                                                                                                                        |

## 4. Out of scope (do not build)

- A furnace that keeps smelting while the screen is closed, a queue, chests, any block
  state, tool wear.
- New recipes or items, changes to recipe contents, break times, the action layer or the
  save format.
- Controller support for the inventory and the recipe list (Phase 5 part B), including
  `data-pad-*` marks on the inventory.
- A filter "only what can be made", groups or headings in the list, a search.
- A different highlight style of craftable rows.
- Any change to what Esc, `E`, "Close", the bag button or the browser's Back do.

## 5. Specification

### 5.1 Fixed order

- `listRecipes` returns the statuses in table order (the order of `RECIPES`, ids 1–20). It
  stays the one place that decides the order. `getState().recipes` therefore lists the
  recipes in table order.
- `RecipeList.update` no longer moves rows. The rows are appended once in the constructor.
- `Game.craft` loses the `lastCraft` check; `lastCraft` is removed. A second press on any
  recipe right after a craft crafts (if it can be made).

### 5.2 Rows that never move

- Every row has the same height in a given mode, whatever it shows: a "Craft" button, a
  note ("Needs a workbench nearby", "Needs a furnace nearby", "Inventory full"), the
  furnace's progress bar, or nothing; ingredient counts of one to four digits ("2304 / 9").
  Use a fixed `height` instead of `min-height`, an action column of fixed width, and
  ingredients that do not wrap (a recipe has at most two). The touch mode may have a
  larger fixed height than the mouse mode (its "Craft" button is 48 px high).
- The list keeps showing five rows and part of the sixth in both modes and at both screen
  heights (`max-height: 480px`), so it is clear that it goes on.
- A note may wrap onto two lines inside the action column; it must not change the row's
  height or overflow it.

### 5.3 The count on the tab

- The "Crafting" tab shows the number of craftable recipes after its label, in an element
  of its own (`.tab-count`), for example "Crafting 3". At 0 the element is hidden.
- It updates whenever the statuses are updated (`refreshRecipes`): after a craft, a move,
  a pickup, a station coming into or out of reach. It is visible on both tabs.
- The tab's accessible name stays "Crafting" (`aria-label`), so `getState().ui.focus`
  reads the same in Part B.
- Creative has no tabs; nothing changes there.

### 5.4 Scroll position

- Switching tabs and closing and opening the inventory keep the list's `scrollTop`.
  `setGameMode` (called when a world is loaded) puts it back to the top.
- `RecipeList.scrollToTop` stays for that.

### 5.5 Holding "Craft"

- New constant `CRAFT_HOLD_DELAY_MS` = 500 in `config.ts`. A hold makes its first craft
  after 500 ms of simulation time (30 steps), then one every `CRAFT_REPEAT_MS` (15 steps).
- Everything else of the hold stays: a quick click or tap crafts once on release; letting
  go after a hold that crafted does not craft once more; a refused craft ends the hold; a
  hold on a furnace row starts the next item when one is done.

### 5.6 Pause menu labels

- The labels "Controller sensitivity" and "Invert controller look" each fit on one line in
  mouse mode at 960 × 540 and in touch mode at 640 × 360. Widen the label column of
  `.setting-row` (for all rows, so the sliders stay aligned); the texts stay as they are.
- The pause panel still fits at 640 × 360 (existing layout tests).

### 5.7 Test API

- `getState().recipes` is in table order (was: in list order, craftable first). Same
  fields as before.
- No other change.

## 6. Test strategy

| Layer       | What                                                                                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (Node) | `recipes.test.ts`: `listRecipes` in table order for several inventories and stations                                                                       |
| Browser     | `e2e/crafting.spec.ts` (order, rows, guard, tab count, scroll, hold), `e2e/touchLayout.spec.ts` (row sizes at 640 × 360), the pause labels in `ui.spec.ts` |
| Device      | New entries in `docs/device-tests.md`; not needed to finish                                                                                                |

- **Existing tests that change on purpose** (name each in the report): Phase 3 AC12.1
  (asserted the reordering and the quarter-second rule), AC12.4 (first repeat after
  15 steps), AC12.6 if it depends on the first repeat, the `listRecipes` unit tests, and
  any test that reads `getState().recipes` by position or `.inventory-tab` by its full
  text ("Crafting" now may carry a number). Every other existing test passes unchanged.
- **References**: `recipe-list` and `recipe-list-touch` are regenerated (order, row height,
  tab count) and looked at. `pad-pause` is regenerated (labels on one line); if the wider
  label column changes `pause-screen` or other pause references, they are regenerated and
  looked at too, and the report says which. All other references stay unchanged.
- Recipe-list tests in test mode no longer need 15 steps between two different recipes;
  remove those steps where they only served the old rule.

## 7. Implementation steps

### Step 1 – Fixed order, rows that never move, no quarter-second rule

- 5.1, 5.2, 5.7. Adapt AC12.1 and the unit tests.

Acceptance criteria:

- **AC1.1** Unit: `listRecipes` returns the ids 1–20 in table order with no inventory, with
  one log, with planks and stone near a workbench, and with everything craftable; the
  statuses are the same as `recipeStatus` gives for each recipe.
- **AC1.2** Browser, test mode, Gathering: the `.recipe-row` elements are in table order and
  `getState().recipes` names them in the same order, before and after crafts that make a
  recipe craftable and that make one uncraftable.
- **AC1.3** Browser: the rectangles of all 20 rows (top and height, within 0.5 px, list not
  scrolled) are the same in each of these states: nothing craftable; planks craftable;
  after crafting the last planks (button hides); sticks and workbench craftable; a
  station note shown; "Inventory full" shown; the furnace bar running; an ingredient count
  of four digits. Checked in mouse mode at 960 × 540 and in touch mode at 640 × 360 (the
  touch height may differ from the mouse height, but is the same for every row).
- **AC1.4** Browser: with planks craftable, a click on its "Craft" crafts; the element at
  the click point (`elementFromPoint`) still belongs to the planks row afterwards; a second
  click at the same point without a step in between crafts planks again; a click on
  "Craft" of another recipe without a step in between crafts that recipe.
- **AC1.5** Browser: the list still shows a partly visible sixth row at the bottom in both
  modes and at both screen heights (the list's height is not a multiple of the row pitch).

### Step 2 – The count on the tab, the scroll position

- 5.3, 5.4.

Acceptance criteria:

- **AC2.1** The "Crafting" tab shows `.tab-count` with the number of recipes whose
  `craftable` is true in `getState().recipes`: hidden with nothing craftable, "1" with one
  log, "2" after crafting planks (sticks, workbench); it updates while the "Items" tab is
  shown (after a move or a pickup) and when a placed workbench comes into reach. Its
  `aria-label` is "Crafting" throughout. Creative shows no tabs.
- **AC2.2** Scrolled to the bottom (torch visible), the list keeps its `scrollTop` after
  switching to "Items" and back, and after closing and opening the inventory (by `E` and
  by "Close"); after `openWorld` it is at 0.

### Step 3 – Holding "Craft"

- 5.5. Adapt AC12.4 (and AC12.6 if needed).

Acceptance criteria:

- **AC3.1** Holding the mouse on "Craft" of sticks with 5 planks: no sticks after 29 steps,
  4 after 30, 8 after 45; the button hides when one plank is left and the hold ends; letting
  go crafts nothing more. A quick click crafts once.
- **AC3.2** Touch (`TOUCH_DEVICE`, test mode): a finger that rests on "Craft" for 20 steps
  and then drags vertically (`swipe`) crafts nothing; a tap crafts once.

### Step 4 – Pause menu labels

- 5.6.

Acceptance criteria:

- **AC4.1** With a controller seen (fake pad), the label elements of "Controller
  sensitivity" and "Invert controller look" are one line high (height at most 1.3 times
  their computed line height) in mouse mode at 960 × 540 and in touch mode at 640 × 360.
- **AC4.2** The existing pause and touch layout tests pass (the panel fits at 640 × 360).

### Step 5 – References, documentation, pull request

- Regenerate `recipe-list`, `recipe-list-touch` and `pad-pause` (and any pause reference
  the label column changes): copy `e2e/screenshots/` out first, regenerate with
  `--update-snapshots=all`, compare with `scripts/compareShots.mjs`, open every sheet with
  the Read tool. The report gets one line per regenerated reference.
- `CLAUDE.md`: the "Crafting" paragraph (fixed order, tab count, scroll position, hold
  delay; the quarter-second rule removed), the recipe-list test note under "Headless
  testing", `getState().recipes` order, "Current status".
- `docs/device-tests.md`: move CRAFT-3 (the reordering) and CRAFT-8 (four per second from
  the first quarter second) to "Obsolete" with one line of reason each; add CRAFT-12 (fixed
  order: are craftable rows found, is the number on the tab noticed and understood?) and
  CRAFT-13 (holding "Craft" with the longer first delay, by mouse and finger: does a short
  press still feel immediate, does scrolling on the phone never craft?), origin "P1".
  Update "Last updated".
- `docs/polish-1-report.md`: what was built, decisions and deviations, the tests changed
  on purpose, references, known issues, notes for Phase 5 part B.

Acceptance criteria:

- **AC5.1** References regenerated and looked at; all others unchanged.
- **AC5.2** Hard rule 1: nothing new beyond code-drawn UI and plain words.
- **AC5.3** `npm run check:all` passes with zero warnings; CI green; one pull request into
  `main` that links the report.

## 8. Fit with Phase 5 part B

Part B's steps 5–7 still fit; this session updated their wording in
`docs/phase-5-plan.md`:

- Step 6: the list no longer reorders, so "the focus follows the 'Craft' button when the
  list reorders" becomes "the focus stays on the 'Craft' button after a craft; when it
  hides, it goes to the nearest one". AC6.1 counts the hold with the first repeat after
  `CRAFT_HOLD_DELAY_MS`; AC6.3 checks that the focus did not move.
- Moving down from one "Craft" button goes to the next visible "Craft" button and skips
  the rows in between that cannot be made; the right stick scrolls to them (already in
  step 6). The tab's accessible name stays "Crafting" with the count.
- The pad's A on "Craft" goes through `onCraftDown` / `onCraftUp` and so gets the same
  hold delay.

## 9. Risks and fallbacks

| Risk                                                                | Fallback                                                                                                                                      |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| A fixed row height clips a note or a four-digit count on CI's fonts | AC1.3 runs on CI; give the action column room for two lines of the note at 12 px; the report names the chosen sizes                           |
| The fixed width of the action column makes ingredients too narrow   | Two ingredients with four-digit counts must fit (AC1.3); take the room from the name column (128 px) only if needed, and say so in the report |
| A wider label column changes several pause references               | Expected; regenerate and look at each; text references use `maxDiffPixelRatio` 0.05, so look at the sheets even where the test would pass     |
| Players miss craftable rows below the visible part of the list      | The tab count (5.3); CRAFT-12 asks the owner. A filter is out of scope here                                                                   |
| The 500 ms first delay feels slow for intended holds                | One constant; CRAFT-13 asks the owner                                                                                                         |
| Esc still ends in the pause menu in some browser                    | Out of this session's scope by the owner's choice; GATH-7 shows it, and a later session can add a light "click to keep playing" prompt        |
