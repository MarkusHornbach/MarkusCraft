# src/ui/ — HUD, menus, inventory, recipe list, settings

Shell (DOM). Screens change the world and items only through actions
(`src/actions/CLAUDE.md`). In-game text is English.

## Files

- `Hud.ts` (bar with counts, break progress, notices), `blockIcon.ts`, `itemIcon.ts`,
  `DebugOverlay.ts`, `settings.ts`, `ui.css`, `activate.ts` (button helpers)
- `InventoryScreen.ts` (27 slots or the Creative palette, bar, bin, tabs), `RecipeList.ts`
  (the "Crafting" tab: one row per recipe)
- `WorldMenu.ts` (start screen: list of worlds, new world, delete), `PauseScreen.ts` (pause
  menu of a world; also the settings page), `TouchHud.ts` (stick, buttons, rotate hint),
  `BenchScreen.ts` (performance test: start page, progress line, result, "Interrupted"),
  `NetTestScreen.ts` (the network test; own chunk, loaded on its first use)
- `FocusManager.ts` (the controller's focus on a screen, the focus frame), `PadHints.ts`
  (the hint bar), `padGlyphs.ts` (button glyphs drawn on canvases)
- `JoinSection.ts` ("Join a world" on the world menu), `RoomPanel.ts` ("Playing together"
  in the pause menu, with head icons), `PlayerSection.ts` ("Your player": name, preview,
  look picker), `figureIcons.ts` (head icons and the figure sheet on canvases)

**The focus system and the controller on the inventory** are described in
`src/input/CLAUDE.md` (`FocusManager.ts` lives here, the rules there). **Screens** and the
order between them: `src/game/CLAUDE.md`.

## The inventory screen

The inventory screen (`E`, `Esc`, touch button `bag`, the pad's Y) lies over the running
game and does not pause it; `Game` listens for its keys itself and `Input` ignores keys
while it is open. The HUD is hidden and the touch controls are made invisible
(`covered`), not removed. Closing requests the pointer lock again; if the browser refuses,
the pause menu shows. In a Gathering world the screen has two tabs, "Items" and
"Crafting" (the recipe list); it always opens on the tab it was closed with, and on
"Items" after a world was loaded.

## The recipe list keeps table order

(`listRecipes`, polishing session 1): rows never move, all rows have one fixed height (48
px, touch 52 px) and the action column a fixed width, so crafting never changes what lies
under the pointer; there is no rule that ignores presses after a craft. Craftable rows are
found by their highlight and by the count on the "Crafting" tab (`.tab-count`, hidden at
0; the tab's `aria-label` stays "Crafting"). The list keeps its scroll position while a
world is open (`RecipeList.restoreScroll`); `setGameMode` (a loaded world) puts it back to
the top. Holding "Craft" makes its first item after `CRAFT_HOLD_DELAY_MS` (500) of
simulation time, then one every `CRAFT_REPEAT_MS` (250); a quick press crafts once on
release. The recipe table itself: `src/items/CLAUDE.md`. The label column of the settings
rows is 136 px wide, so the controller labels fit on one line.

## The "New world" form and the world list (Phase 7 part A)

Under the Mode row and its hint: "Terrain" (Flat, Balanced, Hilly) and "Trees" (None, Few,
Normal, Many), radio groups built like the Mode row (`choiceRow`, `data-terrain`,
`data-trees`); `showForm` preselects Balanced and Few. **The `None` rule:** in Gathering
`None` is disabled (not focusable) and the hint under Trees says "No trees only in Creative:
Gathering needs wood."; switching to Gathering while `None` is chosen selects `Few`. The
form scrolls on small screens; the menu comes back at the top when it is shown again. A list
row shows "Gathering · Balanced · Few trees", or "Creative · Classic" for generator 1. The
F3 overlay has a row "World" ("Generator 2 · balanced · few", "Generator 1"). The settings
page has the switch "Collide with leaves" below "Invert controller look", in every input
mode (`src/player/CLAUDE.md`).

## "Your player" (Phase 6 part D)

A section of the pause screen after "Settings" (settings page and pause menu): the name
(the same value as the field of "Join a world"; sent to the room on `change`), a preview
(`FigurePreview`, its own WebGL2 context, created when the section is shown and in view,
at most 30 pictures a second, disposed with `forceContextLoss` when the page closes;
without WebGL the head icon) and nine look buttons (`aria-label` "Look: Fern", "Look:
Automatic (Fern)"). A new look is sent at once. Where it is stored:
`src/game/CLAUDE.md`, "Player identity".

Before changing the inventory screen or the recipe list read the "Decisions and
deviations" of `docs/phase-3b-report.md`, `docs/polish-1-report.md` and
`docs/phase-5b-report.md`; for the menus `docs/phase-3a-report.md` and
`docs/phase-6b-report.md`; for "Your player" `docs/phase-6d-report.md`.
