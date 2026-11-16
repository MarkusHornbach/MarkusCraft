# Phase 5 part B report – the controller on the inventory, the palette and the recipe list

Plan: `docs/phase-5-plan.md`, Part B (steps 5–7). Branch: `ccr-d2d53ebf-grddk2`. Built
on Part A (`docs/phase-5a-report.md`) and polishing session 1 (`docs/polish-1-report.md`).

## What was built

- **The inventory joins the focus system** (step 5). `Game.focusScreen` returns the
  inventory while it is open, also in test mode. The screen takes part by marks only:
  `data-pad-default` on the selected bar slot (Gathering), on the first palette block
  (Creative) and on the "Crafting" tab while that tab is shown; `data-pad-back` on
  "Close". `Game.onInventoryPadFrame` replaces Part A's interim rule (decision 13 there):
  Y closes, Start closes and opens the pause menu, B puts a picked slot down or otherwise
  closes, LB/RB change the tab in Gathering; A, the moves and the scrolling go to
  `FocusManager`. The browser's Back acts like B there. The click guard of the inventory
  counts `padpress` as a press. Slots have an accessible name ("Slot 3: Planks").
- **Hint bar** of the inventory: "A Pick / Put" (on slots, palette and bin), "A Craft" (on
  a "Craft" button), "A Select" (tabs, "Close"), then "B Back", "Y Close" and in Gathering
  "LB RB Tabs". It comes through a new `hintsFor` option of `FocusManager`; the other
  screens keep the generic hints.
- **Crafting tab** (step 6). `RecipeList` listens to `padpress` / `padrelease` on "Craft"
  exactly as to `pointerdown` / release, so a held A crafts first after
  `CRAFT_HOLD_DELAY_MS`, then every `CRAFT_REPEAT_MS`, and the click after a hold that
  crafted does nothing. The list never moves, so the focus stays on its button after a
  craft; when the button hides (nothing left, the furnace bar) the existing rule of Part A
  moves the focus to the nearest element. Moving down from a "Craft" button goes to the
  next one (rows without a button have nothing to focus).
- **Scrolling** (`FocusManager`). The right stick scrolls the scroll container of the
  focus; when the focus lies in none (on the "Crafting" tab) and the screen itself cannot
  scroll, the first visible scroll container of the screen, so the list can be scrolled
  to recipes that cannot be made. A focus that the stick scrolls out of its list moves to
  the nearest element in view, inside the list or outside it, so A never acts on a hidden
  row.
- **Short screens.** A focused element is scrolled into view above the hint bar, not
  under it. On screens up to 480 px high the inventory's line of text is hidden while the
  controller is active (the hint bar lies over it and says the same).
- **A held across a closing screen.** If the screen of a pressed element goes away (Y
  closes the inventory while A holds "Craft"), the element gets `padrelease` without a
  click.
- **Tests**: `e2e/gamepadInventory.spec.ts` (AC5.1–AC6.4), a second soak in
  `e2e/padSoak.spec.ts` over the inventory and the recipe list, references `pad-inventory`
  and `pad-recipe-list`.
- **Docs**: `README.md` (inventory with the controller), `CLAUDE.md`,
  `docs/device-tests.md` (PAD-13 to PAD-15).

## Acceptance criteria

| AC    | Where it is checked                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- |
| AC5.1 | `gamepadInventory.spec.ts` "Phase 5 AC5.1": move, merge, swap, bin; the slots equal what the mouse's four actions give                |
| AC5.2 | `gamepadInventory.spec.ts` "Phase 5 AC5.2": A on a block fills the selected slot; a picked bar slot then a block                      |
| AC5.3 | `gamepadInventory.spec.ts`: the opening Y held does not close; B with a pick; LB/RB; hints (test mode); Y without pointer lock, Start |
| AC6.1 | `gamepadInventory.spec.ts` "Phase 5 AC6.1": one tap crafts once; held 30 + 2 × 15 steps crafts three times; release adds nothing      |
| AC6.2 | `gamepadInventory.spec.ts` "Phase 5 AC6.2": the bar starts with A, delivers after 120 steps, Y cancels it                             |
| AC6.3 | `gamepadInventory.spec.ts` "Phase 5 AC6.3": focus kept after a craft (button not moved), nearest one after it hides, down, scrolling  |
| AC6.4 | `gamepadInventory.spec.ts` "Phase 5 AC6.4"; looked at, see below                                                                      |
| AC7.1 | `npm run check:all` locally; CI on the pull request                                                                                   |

The soak of AC4.1 now has a second run of 2 000 frames in a Gathering world with items,
weighted towards Y, A, LB/RB and the D-pad; it must see the inventory and both tabs and
ends with no controller and `verifyLight()` 0.

## Decisions and deviations

1. **The Crafting tab's default is the tab itself**, not the first "Craft" button. The
   buttons come and go with the inventory; a default element that changes counts as a new
   view in the focus system (Part A, decision 9) and would move the focus away from where
   the player is. LB/RB still move the focus onto the new tab's default (a new view).
2. **B and Start are taken out of the frame** before the inventory's frame goes to
   `FocusManager` (one filtered copy, only when one of them was pressed), so B does not
   click "Close" after it cancelled a pick. "Close" keeps `data-pad-back` for the hint and
   for any later caller of `FocusManager.back`.
3. **The browser's Back on the inventory acts like B** (puts a picked slot down first).
   Plan 5.7 says "inventory → close it"; it also says Back acts as the pad's B, and this
   keeps the two the same.
4. **LB/RB have no wrap-around** (two tabs; LB on "Items" does nothing), like the focus
   moves. A tab change by LB/RB ends a held "Craft": the hold must not go on crafting on a
   page that is no longer shown.
5. **The A hint names what A does**: "Pick / Put" on slots, palette and bin, "Craft" on a
   "Craft" button, "Select" on the tabs and "Close". The plan names only "Pick / Put".
6. **Scrolling without a focus in the list** (the right stick with the focus on the
   "Crafting" tab, where no recipe can be made) uses the first visible scroll container of
   the screen. Plan 5.6 has the screen root there, which on the inventory does not scroll,
   and step 6 asks for the list to scroll to recipes without a button.
7. **A focus scrolled out of view moves**: to the nearest element in view in the list, or
   outside it if none is. The plan does not say what happens; leaving the focus on a hidden
   row would let A craft something the player cannot see.
8. **The hint bar on short screens.** On a 640 × 360 phone the bar lay over the inventory's
   line of text and over the last visible recipe row. `scrollToShow` treats the bar's top
   edge as the end of the visible part; the line of text is hidden below 480 px of height
   while the controller is active. The bar itself is unchanged (Part A's look).
9. **Accessible names of the slots** ("Slot 1", "Slot 1: Dirt") were added so that
   `ui.focus` says something; before, an empty slot had no name. Nothing visible changed;
   no test or reference depended on it.
10. **`padrelease` without a click when the screen goes** (`FocusManager.dropPress`): Y
    pressed while A holds "Craft" closes the inventory; without this the list would keep
    its press until the next pointer release.
11. **Nothing in `focusMove.ts` changed.** The grid, the bar with the bin beside it, the
    palette and the column of "Craft" buttons were all reached by the existing rule.

## Reference screenshots

New (looked at):

| Reference         | What it shows                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pad-inventory`   | Gathering items page, the logs in bar slot 2 picked (green), the frame on a slot of the bottom grid row, "Crafting 3", the hint bar "A Pick / Put, B Back, Y Close, LB RB Tabs" |
| `pad-recipe-list` | Crafting tab, planks, stick and workbench craftable, the frame on "Craft" of the stick row, station notes below, the hint bar "A Craft, …"                                      |

No existing reference changed: the full browser suite passes against them unchanged (no
controller in those tests). A 640 × 360 phone in touch mode with a controller was also
looked at by eye (not a reference): the frame and the hint bar clear the grid, the bar
and the bin; on the Crafting tab a focused button is scrolled above the hint bar.

## Known issues

- Real controllers, the feel of the frame over the grid and the palette, and the hold of
  A cannot be tested here: PAD-13 to PAD-15.
- An empty slot cannot be picked (as with the mouse), so in Creative an empty bar slot can
  only be filled through the selected slot.
- The inventory remembers the last focus while the page is open (Part A's memory per
  screen and view); reopening it starts there, not on the selected slot, unless the tab
  changed.

## Measured numbers

None new on the hot path: nothing runs per frame while the inventory is closed. With the
inventory open and the controller active, `FocusManager.update` places one frame element
as before. The scroll fallback looks through the screen's elements only while the right
stick is pushed with the focus outside a list (sizes first; a style is read only for an
element that has something to scroll).

Browser (software WebGL, not evidence): the eight new tests take about 45 s on three
workers; the new soak plays its 2 000 frames in about 90 s. `npm run check:all` in the cloud session: 223 browser tests
passed in 19.1 minutes (9 of them new).

## Tests on real devices

Added to `docs/device-tests.md`, section 9: PAD-13 to PAD-15 (origin 5B). No test became
pointless.

## Suggestions for later phases

- Phase 6 (multiplayer): the inventory and the recipe list submit the same actions with
  the controller as with the mouse; nothing new crosses the action layer.
- If PAD-15 finds the palette hard to follow, a larger frame or a block name in the hint
  bar would be a small change in `FocusManager` or the `hintsFor` hook.
