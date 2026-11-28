# src/input/ — keyboard, mouse, touch, controller, focus

Shell (browser APIs allowed). `TouchTracker.ts`, `padMapping.ts` and `focusMove.ts` follow
the pure discipline (no DOM, unit-tested in Node, in the coverage scope).

## Files

- `Input.ts`: keyboard/mouse/pointer-lock abstraction, fed by touch and the controller as
  well
- `TouchTracker.ts` (pure: finger events → stick, look, buttons), `TouchControls.ts`
  (pointer events of fingers → TouchTracker → Input)
- `padMapping.ts` (pure: `PadMapper`, one pad snapshot → `PadFrame`), `focusMove.ts`
  (pure: `nextFocus`, `nearestFocus`, `NavRepeat`), `GamepadSource.ts` (polls
  `navigator.getGamepads`, chooses the pad, feeds Input in play, hands the frame to `Game`
  otherwise)
- Elsewhere: `src/ui/FocusManager.ts`, `src/ui/PadHints.ts`, `src/game/backGuard.ts`.

## Mouse mode and touch mode

`Game` runs in one of two input modes. Touch mode has the on-screen controls, no pointer
lock, a pixel ratio capped at 1.5 and a default render distance of 5. The play button
selects the mode by the pointer type that activated it; phones and tablets
(`pointer: coarse`) start in touch mode; `touch=1` forces it. The touch controls exist in
the document only in touch mode. Game logic never asks for the mode: both feed `Input`.

## The controller (Phase 5) is an active source on top of the mode, not a third mode

`GamepadSource` polls once per rendered frame (`Game.frame`, before the steps) and is the
only place that reads `navigator.getGamepads`. The first standard-mapping pad on which
something is pressed becomes the pad; a button already down in its first snapshot does
nothing until released (the wake-up press). While the game is played (`padTarget` is
`play`) the source feeds `Input` with `setMove`, `setHeld`, `press` and `addTurn`
(radians, consumed per frame like the mouse), **sending only changes**, so keys and
fingers that hold the same action keep it; otherwise `Game.onPadFrame` gets the frame
(inventory: `onInventoryPadFrame`, below; a run: B/Start cancel; menus: `FocusManager`). A
change of target blocks every held button until it is released (`PadMapper.blockHeld`).
`Game.padActive` is set by a press or a stick beyond 0.5: the touch controls are covered,
mouse mode plays **without pointer lock** (losing the lock does not pause; Esc pauses),
menus show the focus frame. A mouse press on the canvas (capture listener on the root) or
a finger on the game view hands control back and does nothing else; moving the mouse or
touching in a menu only clears `padActive`. Keys never change it. Disconnecting the pad in
use releases everything and pauses a played world (not in test mode).

## The focus system

`FocusManager` works on the topmost open screen (`Game.focusScreen`: the inventory (also
in test mode), world menu, pause/settings, performance test screens; not during a run).
Focusable: `button`, `input[type=range]`, `input[type=checkbox]`, `[data-pad-focus]`;
enabled, with a size, not inside `[hidden]` or `[data-pad-skip]`; never text fields. It is
looked up anew on every move. A screen takes part with at most `data-pad-default` (where
its view starts; a new visible default means a new view and moves the focus there),
`data-pad-back` (what B clicks) and `padpress`/`padrelease` listeners (A down / A up, then
`click()`). Each screen root remembers its last focus (used when the view is the same).
Focus is virtual: class `pad-focused` and the frame `.pad-focus-frame`; DOM `focus()` is
never called. Moving is `nextFocus` (`focusMove.ts`): elements overlapping in the direction
first, then the nearest by `13 × gap² + gap across²`; an unexpected neighbour is fixed
there with a unit test, never per screen. Start on the pause menu continues. The right
stick scrolls the scroll container of the focus, or else the first visible one on the
screen; a focus scrolled out of its list moves to the nearest element in view.
`scrollToShow` keeps the focus above the hint bar. A screen with more buttons than A and B
gives its own hints through the `hintsFor` option (only the inventory does). A held A
whose screen goes away gets a `padrelease` without a click. `Game.showScreen`,
`openInventory` and `hideInventory` update the focus at once (`syncFocus`): a screen often
changes outside a frame (a world finished loading), and `ui.focus` must never name an
element of a screen that is gone.

## The controller on the inventory (Phase 5 part B)

Marks only: `data-pad-default` on the selected bar slot (Gathering), the first palette
block (Creative) or, on the Crafting, Tasks and Map tabs, the tab itself (a "Craft" button comes and goes;
a default that changed would count as a new view); `data-pad-back` on "Close".
`Game.onInventoryPadFrame`: Y closes, Start closes and pauses, B (and the browser's Back)
puts a picked slot down or else closes (`InventoryScreen.cancelPick`), LB/RB change the
tab (`cycleTab`, no wrap-around; it ends a held "Craft"); the rest goes to `FocusManager`
without B and Start. `padpress` arms the click guard (a capture listener sees the
non-bubbling event). `RecipeList` treats `padpress` / `padrelease` on "Craft" like
`pointerdown` / release, so the hold, the 500 ms delay and the suppressed click after a
hold are the mouse's. Slots have an `aria-label` ("Slot 3: Planks"), which `ui.focus`
reports; recipe buttons "Craft <item>" (e.g. "Craft Stick"). On the Tasks tab (Polish 2)
D-pad down from the tab reaches the open task rows (buttons with the task's label as
`aria-label`, hint "A Track"); done rows are no buttons and never take the focus. A row
keeps its element when the mark or count changes, so the focus stays on it after A. The
fourth tab, Map (Phase 8 part B1), follows Tasks; nothing inside it is focusable.

## The controller on the chest screen (Phase 8 part B3a2)

Marks only: `data-pad-default` on the chest's first slot, `data-pad-back` on "Close"; the
D-pad walks both grids, the bar and "Take all" with `nextFocus` unchanged.
`Game.onChestPadFrame`: Start closes and pauses, Y closes, B puts a picked slot down or
else closes (also the browser's Back), X quick moves the focused slot
(`FocusManager.focusedElement`); the rest goes to `FocusManager` without B, Start and X.
Hints: "A Move · X Quick move · Y Close"; the screen's text line hides while the pad is
active. The place trigger opens a chest under the crosshair, like right click.

## Back guard

Outside test mode, while anything but the world list is shown, the page holds one history
entry (`backGuard.ts`, in `src/game/`); a `popstate` re-arms it and acts like the pad's B
(`Game.onBrowserBack`). A `popstate` within `BACK_PAIR_MS` of a pad B press only re-arms;
the window counts each frame since B (and the wait since the last one) at most
`BACK_PAIR_FRAME_MS` (25), so slow frames, and ordinary frames between the tasks a
`popstate` needs after a slow one, do not use it up (six frames at least). Back on the
world list leaves the entry in place (no navigation of its own, which could collide with a
reload); a Back that pops it there goes back once more. Whether it is armed is asked at
each `popstate` (`Game.wantsBackGuard`); `update()` per frame only pushes the entry.

Before changing input, the controller or the focus system read the "Decisions and
deviations" of `docs/phase-2a-report.md`, `docs/phase-5a-report.md` and
`docs/phase-5b-report.md`.
