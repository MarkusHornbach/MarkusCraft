# Phase 5 part A report – the controller in play, the focus system, the menus

Plan: `docs/phase-5-plan.md`, Part A (steps 1–4). Branch: `claude/hopeful-hypatia-ywk3fq`.

## What was built

- **The pure core** (`src/input/padMapping.ts`, `src/input/focusMove.ts`, constants `PAD_*`
  and `BACK_PAIR_MS` in `config.ts`). `PadMapper` turns one snapshot of a controller into
  a `PadFrame`: movement after the radial dead zone (rescaled), look rate with the
  exponent curve, sensitivity, invert and the ramp, held actions and presses of the
  mapping table of plan 5.3, the sprint latch, the button hysteresis (down at 0.5, up below
  0.35), the wake-up rule, the right stick for scrolling and the menu navigation with
  repeat (`NavRepeat`). `nextFocus` and `nearestFocus` choose between rectangles. The
  settings gained `padSensitivity` (0.2–3, default 1) and `padInvertY`, stored only once
  changed.
- **The pad in play** (`src/input/GamepadSource.ts`, `Input.addTurn` / `consumeTurn`,
  `Game`). One `getGamepads()` per rendered frame; the first standard-mapping pad with
  input becomes the pad. In play it feeds `Input` (only changes), everywhere else `Game`
  gets the frame. `Game.padActive` makes the pad the active source: touch controls
  covered, mouse mode without pointer lock and with a hidden cursor over the view, Esc
  pauses. A click on the view hands back to the mouse (and captures it in that click), a
  finger on the view back to touch; neither acts otherwise. Notices "Controller
  connected", "Controller disconnected", "This controller is not supported"; disconnecting
  the pad in use releases everything and pauses a played world.
- **The focus system and the menus** (`src/ui/FocusManager.ts`, `PadHints.ts`,
  `padGlyphs.ts`). A virtual focus with a frame over the focused element on the world menu
  (list, "New world" form, delete confirmation), the pause menu and settings page and the
  screens of the performance test. The screens are marked with `data-pad-default` and
  `data-pad-back` only. A, B, Start, sliders (left/right by one step, with repeat),
  switches, scrolling with the right stick, the hint bar ("A Select, B Back, ◄► Change"),
  "Press A to play / continue" on the play buttons, the controller's controls list with
  glyphs, the rows "Controller sensitivity" and "Invert controller look" once a pad was
  used during the visit.
- **The back guard** (`src/game/backGuard.ts`): one history entry while anything but the
  world list is shown; Back pauses, closes the inventory, continues from the pause menu,
  goes back from sub-views, cancels a run; a Back within 150 ms of the pad's B only
  re-arms.
- **Tests**: `padMapping.test.ts`, `focusMove.test.ts`, settings; the fake controller
  `e2e/gamepad.ts`; `e2e/gamepad.spec.ts` (step 2), `e2e/gamepadMenus.spec.ts` (step 3),
  `e2e/padSoak.spec.ts` (step 4); references `pad-glyphs`, `pad-world-menu`, `pad-pause`.
- **Docs**: `README.md` (section "Controller"), `CLAUDE.md`, `docs/device-tests.md`
  (section 9, PAD-1 to PAD-12).

## Acceptance criteria

| AC    | Where it is checked                                                                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------- |
| AC1.1 | `padMapping.test.ts` "dead zone"                                                                                              |
| AC1.2 | `padMapping.test.ts` "look"                                                                                                   |
| AC1.3 | `padMapping.test.ts` "ramp"                                                                                                   |
| AC1.4 | `padMapping.test.ts` "buttons"                                                                                                |
| AC1.5 | `padMapping.test.ts` "sprint and the mapping" (table-driven over all 16 buttons)                                              |
| AC1.6 | `padMapping.test.ts` "cost" (`expectFasterThan`, best of five rounds)                                                         |
| AC1.7 | `focusMove.test.ts`; navigation repeat also through `PadMapper` in `padMapping.test.ts`                                       |
| AC1.8 | `settings.test.ts` (two "Phase 5 AC1.8" tests)                                                                                |
| AC2.1 | `gamepad.spec.ts` "Phase 5 AC2.1"                                                                                             |
| AC2.2 | `gamepad.spec.ts`: turn, look up, clamp; invert stored (without `test=1`, which ignores stored settings)                      |
| AC2.3 | `gamepad.spec.ts`: RT/LT/LB/RB/D-pad (Creative), RT held in Gathering, A/X/B/stick click, X refused in Gathering              |
| AC2.4 | `gamepad.spec.ts`: Y (test mode), Start (without `test=1`, in the AC2.6 test)                                                 |
| AC2.5 | `gamepad.spec.ts` "the press that wakes the pad does not act"                                                                 |
| AC2.6 | `gamepad.spec.ts` "the pad plays without pointer lock; a click hands back to the mouse"                                       |
| AC2.7 | `gamepad.spec.ts` "touch mode"                                                                                                |
| AC2.8 | `gamepad.spec.ts`: releases and notices (test mode), pause on disconnect (without), unsupported pad                           |
| AC2.9 | The full browser suite passes; no existing test or reference was changed (one helper was made safer, decision 22)             |
| AC3.1 | `gamepadMenus.spec.ts` "the pad alone creates a world, plays, pauses, goes back and plays it again"                           |
| AC3.2 | `gamepadMenus.spec.ts` "the focus frame lies over the focused element" (within 4 px; the frame is 3 px outside the element)   |
| AC3.3 | `gamepadMenus.spec.ts`: world menu views (list, confirmation, form), pause menu and settings page; the bench tests            |
| AC3.4 | `gamepadMenus.spec.ts`: Brightness by steps and held, stored as by the mouse; invert switch; debug switch in touch mode       |
| AC3.5 | `gamepadMenus.spec.ts` "the controller rows appear after the first press"                                                     |
| AC3.6 | `gamepadMenus.spec.ts`: quick suite started with A, cancelled with B and Start, "Start again" focused; sample result + B      |
| AC3.7 | `gamepadMenus.spec.ts` "the back guard" (two tests)                                                                           |
| AC3.8 | `gamepadMenus.spec.ts` "references"; looked at, see below                                                                     |
| AC4.1 | `padSoak.spec.ts`                                                                                                             |
| AC4.2 | No vendor name in `src`, `e2e`, `scripts`, `README.md`, `docs/device-tests.md`; glyphs drawn by code; `repoHygiene` counts 30 |
| AC4.3 | `npm run check:all` locally; CI on the pull request                                                                           |

## Decisions and deviations

1. **Routing goes through `Game`.** The plan has `GamepadSource` route frames to `Input`
   or to `FocusManager`. The source feeds `Input` itself while the game is played and
   hands every frame to `Game.onPadFrame`, which knows the cases besides the menus (the
   inventory, a running performance test) and passes the rest to `FocusManager.handle`.
2. **`Input` gets only changes from the pad.** Keys, fingers and the pad share one set of
   held actions; a pad that set `jump` false every frame would cancel a held Space. The
   source remembers what it sent and releases exactly that (also on disconnect and when
   the target changes).
3. **A button held across a change of target does nothing in the new one**
   (`PadMapper.blockHeld`). Start opens the pause menu and must not also continue it;
   B pressed in a menu that starts play must not fly down; Y that opens the inventory must
   not close it.
4. **Choosing a pad.** The first standard-mapping pad on which a button is down (or a stick
   beyond 0.5) becomes the pad; that snapshot is its first one, so the press does nothing
   (the wake-up rule of 5.2 covers it). The fake pad's `connect()` therefore taps Select
   (unused) after connecting, as a real browser reports a pad only after a press.
5. **"Press a button on the controller to use it" shows only while a pad is connected but
   not used yet** (after the wake-up press), at the end of the controls list. Plan 5.2
   says "while no pad was seen", but 5.8 and 6.3 require the pause screen and its
   reference to stay unchanged without a pad; a line shown without any pad would break
   that, and browsers report a pad only after a press anyway.
6. **Notices.** In play a controller notice shows like a pickup notice for `NOTICE_MS` of
   game time (it wins over a pickup while it shows). In the menus it goes into the message
   line (world menu) or the hint line (pause menu, settings page) and stays until the
   controller is used or another message replaces it; a timer in real time would make the
   tests depend on the frame rate. The screens of the performance test show none.
7. **Unsupported pads**: the notice comes once per connection, on the first rising button
   edge after the pad's first snapshot. `getState().pad.unsupported` stays true for the
   visit.
8. **Spatial navigation.** The plan's formula `along + 3 × across` chose "Copy link" below
   the pause menu's "Continue" instead of the first slider (the button lies less far to
   the side), and from the Brightness slider jumped over the switch right under it.
   `nextFocus` now follows the rule of the focus finders of common TV and phone
   interfaces: candidates overlapping across the direction are ranked by the plan's
   formula (their `across` is 0); the others by `13 × gap along² + gap across²`; the
   overlapping best wins sideways, or vertically when it starts before the other one ends,
   otherwise the lower second score. Unit tests pin the pause-menu geometry, rows of
   different widths, a single column and gaps (sideways the row is kept; up and down go to
   the nearer row).
9. **Memory and views.** Each screen root remembers its last focus together with the view
   it was on (the visible `data-pad-default`); coming back to the same view restores it,
   to another view (the pause menu is also the settings page) starts at that view's
   default. Returning from the confirmation or the form to the list starts on "Play"
   (a new view), as 5.6 says for opening a view.
10. **A acts on release** (`padpress`, then `padrelease` and `click()`), **B on press**.
    A pressed in one place and released after the focus moved clicks the element it went
    down on.
11. **The hint bar shows "B Back" only where the screen has a back element** (not on the
    world list), "◄► Change" on a slider.
12. **During a run of the performance test there is no focus frame and no hint bar**; B
    and Start cancel it directly (`Game.onPadFrame`). Its "Cancel" button is still marked
    as default and back. So no element is moved per frame during a measured run (5.10).
13. **The inventory in Part A**: B and Y close it, Start closes it and pauses. Without
    this a controller player who opened it with Y could not leave it. Part B replaces this
    with the focus system on the inventory.
14. **"Press A to continue"** is also the pause menu's play button text while the pad is
    active (5.5 names only the world menu's).
15. **`getState().ui.focus` is left out while there is no focus** instead of being null.
    Three tests of Phase 3 compare `ui` with `toEqual`; AC2.9 requires them unchanged.
16. **Mouse switching listens to `mousedown`** (capture phase on the game root), not to
    `pointerdown`: `Input` acts on mouse events, which a cancelled `pointerdown` does not
    reliably suppress. Fingers switch on `pointerdown`.
17. **The back guard never navigates by itself while the player acts.** When the world list
    shows again it leaves its entry in place; a first version took it back with
    `history.back()`, which collided with a reload right after (an existing test,
    `inventory.spec.ts` AC6.5, caught it). A Back that pops the stale entry on the world
    list goes back once more (in a task of its own: Chromium drops a `history.back()` started inside the `popstate` handler), so one Back still leaves the page. Back in play also releases
    the pointer lock, as Esc does; otherwise the pause menu could not be clicked. Back on
    the pause menu in mouse mode continues, but the browser cannot capture the mouse
    without a click: the menu then shows its existing "Please click again" hint.
18. **Esc pauses while the pad is active**, in both modes (there is no pointer lock for it
    to release).
19. **The sprint latch** is set by the stick click and cleared when the left stick goes
    from outside its dead zone to inside. A click with the stick at rest therefore sprints
    from the next push until that push ends.
20. **Accessible names.** Sliders and switches of the pause screen got an `aria-label`
    (their label text); `ui.focus` reports it.
21. **The ramp** looks at the rescaled horizontal deflection (> 0.95), counted from the
    second frame above it.
22. **Test helpers.** `openMenu`'s init script now ignores a page without storage
    (`about:blank`, reached when Back leaves the game in AC3.7). The invert part of AC2.2
    runs without `test=1`, which ignores stored settings by design. The debug switch of
    AC3.4 is tested with `touch=1` (the row exists only in touch mode). The glyph sheet is
    shown by the test API (`glyphSheet()`), as the plan allows.
23. **No starting value of the plan was changed** (dead zone, curve, ramp, thresholds,
    repeat, scroll speed).

## Reference screenshots

New (looked at):

| Reference        | What it shows                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `pad-glyphs`     | All 20 glyphs on one sheet: A/B/X/Y discs, bumpers, triggers, both sticks and their clicks, the D-pad with each arm, Start |
| `pad-world-menu` | The world list with one world, the frame on "Press A to play", the hint bar "A Select"                                     |
| `pad-pause`      | The pause menu with the controller's controls list, the two controller rows, the frame on Brightness, "A B ◄►" hints       |

No existing reference was regenerated; they all pass unchanged (no pad in those tests).
In `pad-pause` the labels "Controller sensitivity" and "Invert controller look" wrap onto
two lines in the label column; readable, but a candidate for the polishing session.

## Known issues

- Real controllers, Bluetooth, B sent as Back by Android browsers, whether a pad press
  counts as a user gesture (fullscreen) and the feel of the sticks cannot be tested here
  (plan 6.4): PAD-1 to PAD-12.
- Back on the pause menu in mouse mode cannot capture the mouse (decision 17).
- Keys and the pad share held actions: releasing the pad's A while Space is held stops the
  jump until Space is pressed again. The same holds for touch since Phase 2.
- With several pads connected, a press on another pad is ignored until the pad in use
  disconnects (as planned); there is no notice for that.

## Measured numbers

Node, cloud session (not a real device):

- `PadMapper.update` with a full snapshot: 10 000 calls in about 7.6 ms, 0.76 µs each
  (AC1.6 allows 20 ms); no allocation per call.
- `nextFocus` over 40 rectangles: about 0.33 µs per call; it runs only when the focus
  moves.

Browser (software WebGL; not evidence of performance): the new browser tests take about
two minutes together on three workers; the soak plays its 2 000 frames in about 70 s.
`npm run check:all` in the cloud session: 202 browser tests passed in 19.6 minutes (29 of them new).

## Tests on real devices

Added to `docs/device-tests.md`, section 9: PAD-1 to PAD-12 (origin 5A). No test became
pointless.

## Suggestions for Part B and later

- The inventory joins the focus system by marks only (5.6); the grid of slots is a
  regular grid, which `nextFocus` handles without the second score. The palette has rows
  of equal width. Replace decision 13 (B/Y close, Start pauses) by the focus system and
  keep `blockHeld` so the Y that opens the inventory does not act inside it (AC5.3).
- `RecipeList`: `padpress`/`padrelease` arrive on the "Craft" button exactly like
  `pointerdown`/release; the `FocusManager` already keeps the focus on an element that
  moves (lists reorder) and goes to the nearest one when it hides.
- If PAD-4 finds the look too slow or fast, `PAD_LOOK_MAX_RAD_PER_S` and the default
  sensitivity are single constants; drift is `PAD_DEADZONE`.
