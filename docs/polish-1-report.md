# Polishing session 1 report – inventory and recipe list

Plan: `docs/polish-1-plan.md`. Branch: `ccr-4139afb8-0yh9ba`.

## What was built

- **Fixed order** (step 1). `listRecipes` returns the statuses in table order (ids 1–20)
  and stays the one place that decides the order; `getState().recipes` follows it.
  `RecipeList.update` no longer moves rows: they are appended once in the constructor.
  `Game.lastCraft` and the rule "a press on another recipe within `CRAFT_REPEAT_MS` of a
  craft is ignored" are gone.
- **Rows that never move** (step 1). Every row has a fixed `height` (mouse 48 px, touch
  52 px: the 48 px "Craft" button plus the 2 px borders, no vertical padding), the
  columns are fixed (`44px 128px 1fr 112px`), ingredients never wrap, and the action
  column is 112 px wide, so a note ("Needs a workbench nearby") wraps onto two lines
  inside it. List heights: mouse 284 px (5.5 rows of pitch 52), touch 300 px (5.4 rows of
  pitch 56); at `max-height: 480px` mouse 278 px (5.4 rows) and touch 288 px (5.2 rows).
- **The count on the tab** (step 2). `.tab-count` after "Crafting" (a small green pill),
  hidden at 0, updated by `InventoryScreen.setRecipes`, which `Game.refreshRecipes` calls
  after every action, a pickup, a station check, on both tabs. The tab's `aria-label` is
  "Crafting".
- **Scroll position** (step 2). `RecipeList` remembers its `scrollTop` from its `scroll`
  events while it has a size and puts it back (`restoreScroll`) when the Crafting tab is
  shown and when the screen opens on it. `setGameMode` (a loaded world) calls
  `scrollToTop`.
- **Holding "Craft"** (step 3). `CRAFT_HOLD_DELAY_MS` = 500 in `config.ts`: the first craft
  of a hold after 30 steps, then one every 15 (`CRAFT_REPEAT_MS`). Everything else of the
  hold is unchanged.
- **Pause menu labels** (step 4). The label column of `.setting-row` and `.switch-row` is
  136 px instead of 120 px for all rows, so the sliders stay aligned. In touch mode the
  value column is 66 px instead of 74 px, so the sliders lose only 8 px.
- **Tests**: `recipes.test.ts` (AC1.1), `e2e/recipeRows.ts` (walks the list through the
  states of AC1.3; checks the partly visible sixth row of AC1.5), new tests in
  `e2e/crafting.spec.ts` (AC1.2–AC1.5, AC2.1, AC2.2, AC3.1, AC3.2), `e2e/touchLayout.spec.ts`
  (AC1.3 and AC1.5 on phone and tablet), `e2e/ui.spec.ts` (AC4.1). `swipe` in
  `e2e/touch.ts` takes an optional `rest` callback (a finger that rests before it moves).

## Acceptance criteria

| AC    | Where                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------ |
| AC1.1 | `src/items/recipes.test.ts`                                                                                              |
| AC1.2 | `e2e/crafting.spec.ts` "Polish 1 AC1.2"                                                                                  |
| AC1.3 | `e2e/crafting.spec.ts` (mouse, 960 × 540), `e2e/touchLayout.spec.ts` (touch, 640 × 360)                                  |
| AC1.4 | `e2e/crafting.spec.ts` "Polish 1 AC1.4"                                                                                  |
| AC1.5 | `e2e/crafting.spec.ts` (mouse at 960 × 540 and 640 × 360), `e2e/touchLayout.spec.ts` (touch at 640 × 360 and 1280 × 800) |
| AC2.1 | `e2e/crafting.spec.ts` "Polish 1 AC2.1"; Creative without tabs: Phase 3 AC12.5                                           |
| AC2.2 | `e2e/crafting.spec.ts` "Polish 1 AC2.2"                                                                                  |
| AC3.1 | `e2e/crafting.spec.ts` "Phase 3 AC12.4 and Polish 1 AC3.1"                                                               |
| AC3.2 | `e2e/crafting.spec.ts` "Polish 1 AC3.2"                                                                                  |
| AC4.1 | `e2e/ui.spec.ts` "Polish 1 AC4.1" (mouse 960 × 540, touch 640 × 360)                                                     |
| AC4.2 | the existing pause and touch layout tests, unchanged, pass                                                               |
| AC5.1 | see "Reference screenshots"                                                                                              |
| AC5.2 | nothing new beyond CSS and plain words                                                                                   |
| AC5.3 | `npm run check:all`, CI, the pull request                                                                                |

## Decisions and deviations

1. **List heights changed.** The plan says the list "keeps showing five rows and part of
   the sixth"; before this session it did that only in mouse mode on large screens (touch
   rows were 56 px high, and at `max-height: 480px` every mode showed fewer than five).
   The heights were set so all four cases show five rows and part of the sixth (see
   "What was built"). On a 640 × 360 phone in touch mode the panel is now 354 px high,
   3 px from each edge; the touch row was made 52 px (no vertical padding) so this fits.
2. **Scroll position kept by the list itself.** A list inside an element with
   `display: none` has no scroll box; rather than rely on how a browser treats that,
   `RecipeList` stores the position from its own `scroll` events (only while it has a
   height) and writes it back when it is shown.
3. **The tab count only changes while the inventory is open.** `refreshRecipes` runs only
   while the screen is open (as before); the count is never seen otherwise, and opening
   the screen refreshes it.
4. **AC2.1 "after a move":** a `moveStack` cannot change what can be made, so the test
   uses `discard` (an action of the items page) for the change on the Items tab, and a
   real pickup (`startBreak` and `break` of a log).
5. **The `recipe-list` reference** now shows the list scrolled so that the stone shovel is
   the top row: in table order the coal row with the furnace bar lies below the visible
   part. It shows a craftable row (iron ingot), the bar, short ingredients, station notes
   and the tab count "4". The touch reference stays at the top of the list.
6. **AC1.3 presses "Craft" by a `click` event** (`dispatchEvent`), which does not scroll
   the list to the button; the rows are compared with the list scrolled to the top.
7. **Label column 136 px, touch value column 66 px.** "Controller sensitivity" is 126 px
   wide at 13 px in Inter (the cloud session's `system-ui`, wider than Roboto or Segoe
   UI). A first try with 148 px left the touch sliders on a 640 × 360 phone 52 px wide
   (before: 80 px), and the Brightness tap test of AC3.1 landed on 85 %. With 136 px and a
   value column of 66 px in touch mode ("16 chunks" is 62 px) they are 72 px wide; in
   mouse mode 119 px (before: 131 px).
8. **A station note hides while the furnace bar runs.** AC1.3 found that a player who
   walks away from the furnace while it works gets the note "Needs a furnace nearby" and
   the bar at once; together they do not fit the fixed row height (the note took three
   lines). The bar now shows alone (`.recipe-row.smelting .recipe-note`); when the bar is
   full the craft is refused (`station`) as before and the note returns. AC1.3 checks
   this state as well.
9. **The pause panel with the controller rows does not fit 640 × 360.** With the two
   controller rows (a pad was used) the touch pause panel is about 400 px high and scrolls
   (`.pause-panel` is built to stay reachable then). This was so before the session too,
   where the labels took two lines; AC4.2 is about the existing layout tests, which run
   without a controller, and they pass.

## Tests changed on purpose

- **Phase 3 AC12.1**: asserted the reordering and the quarter-second rule; now asserts
  table order and that another recipe is made right after a craft. The tab's text is
  matched as `/^Crafting/` and the active tab by its `aria-label`.
- **Phase 3 AC12.2**: compared the first four rows of the list after the workbench was
  placed; now compares the rows with a "Craft" button (in table order, the torch last).
- **Phase 3 AC12.4** (now "Phase 3 AC12.4 and Polish 1 AC3.1"): first craft after 30 steps
  instead of 15; a hold let go after 29 steps crafts once by its click.
- **Phase 3 AC12.6** (`crafting.spec.ts`, touch): the finger is held 45 steps instead of 30
  for the same two crafts.
- **Phase 3 AC12.7** (`recipe-list` reference): scrolled to the furnace rows, see decision 5.
- **Phase 4 AC8.5** (`touchLayout.spec.ts`, torch row): the torch row was on top as the
  only craftable recipe; it is now the last row, so the test scrolls the list to the end
  and checks the tab count "1".
- The `listRecipes` unit test ("craftable first") was replaced by AC1.1.

## Reference screenshots

Regenerated with `--update-snapshots=all`, compared with `scripts/compareShots.mjs`, every
sheet opened and judged. All other references: 0.0 % of pixels changed.

- `recipe-list` (6.5 %): scrolled to the furnace rows (decision 5): stone shovel and
  furnace with "Needs a workbench nearby" and red counts, coal with its bar at half, the
  iron ingot highlighted with "Craft", the tab "Crafting 4". Rows of one height.
- `recipe-list-touch` (41.6 %): rows 52 px instead of 56 px and a taller list, so five rows
  and part of the sixth show; the tab "Crafting 2". Same rows, same order (planks and
  sticks were first before too).
- `pad-pause` (7.2 %): "Controller sensitivity" and "Invert controller look" on one line;
  the settings column is shorter by those two lines; sliders start 16 px further right.
- `pause-screen` (0.3 %): the sliders start 16 px further right (label column 136 px).
- `inventory` (3.7 %): the "Crafting" tab shows the count "1" (the items in it make one
  recipe craftable). Not named in the plan; explained by the tab count.

## Known issues

- On a 640 × 360 phone in touch mode only about 12 px of the sixth row show; it is
  enough to show that the list goes on, but not more. A taller list would not fit.
- Esc in the inventory is unchanged (plan, change 1); GATH-7 will tell whether some
  browser ends in the pause menu.

## Measured numbers

None: this session changes no work per frame. The count on the tab is one pass over 20
statuses per refresh.

## Tests on real devices

Added CRAFT-12 and CRAFT-13 (origin P1); CRAFT-3 and CRAFT-8 moved to "Obsolete".

## Notes for Phase 5 part B

- The rows never move and a craft never shifts the list; the focus can stay on the
  "Craft" button after a craft. When the button hides (nothing left), move it to the
  nearest one (`nearestFocus`).
- The pad's A should go through `onCraftDown` / `onCraftUp`, so it gets the same 500 ms
  first delay.
- `RecipeList.restoreScroll` and the stored position: when the focus scrolls the list
  (right stick or a focus move to a row out of view), the `scroll` event keeps the stored
  position up to date by itself.
- The tab's accessible name is "Crafting" whatever the count; `getState().ui.focus` reads
  "Crafting".
