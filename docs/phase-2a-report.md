# Phase 2 part A report – Touch controls

Plan: [`phase-2-plan.md`](phase-2-plan.md), Part A (steps 1–3). Implemented on the branch
`claude/happy-gauss-supqck`. Part B (multiplayer, steps 4–12) is not started.

## What was built

The game is playable on touch screens, in single-player:

- **Two input modes.** The game runs in mouse mode or touch mode. A tap on the play button
  starts touch mode, a mouse click starts mouse mode, `?touch=1` forces touch mode. Phones
  and tablets show "Tap to play" from the start. Touch mode uses no pointer lock.
- **Stick** (left thumb): appears where the lower left part of the screen is touched,
  analog in all directions, dead zone 0.15, sprint beyond 0.9 deflection.
- **Look**: dragging on the right half turns the view, with its own "Touch sensitivity".
- **Buttons**: break, place (both repeat while held), up, down, fly, menu; the fly button
  is green while flying. Slots of the block bar can be tapped. Symbols are drawn by code.
- **Several fingers at once**: stick, look drag and a button work together.
- **Phone and tablet layout**: button size follows the shorter screen side (48 to 88 px);
  the menu has a compact form for phones in landscape.
- **Rotate overlay** in portrait, which also pauses the game.
- **Browser gestures suppressed** on the game: page zoom, scrolling, pull-to-refresh, text
  selection and the long-press menu.
- **Menu in touch mode**: "Fullscreen" button, "Debug overlay" switch, "Touch sensitivity"
  slider, and a controls list that describes the touch controls.
- **Touch defaults**: render distance 5 while nothing is stored, pixel ratio at most 1.5.
- **Automation**: 20 new unit tests (157 in total), 17 new browser tests (53 in total), one
  new reference screenshot (`touch-controls`).

Nothing from the plan was cut. The fallbacks of the risk table were not needed:
multi-finger input through the DevTools protocol works.

## Acceptance criteria

| Criterion | Where it is verified                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| AC1.1     | `src/input/TouchTracker.test.ts` (stick mapping, dead zone, sprint, release), `src/player/physics.test.ts` |
| AC1.2     | `e2e/touch.spec.ts`, two tests (stick; look drag with clamped pitch)                                       |
| AC1.3     | `e2e/touch.spec.ts`                                                                                        |
| AC1.4     | `e2e/touch.spec.ts` (without `test=1`)                                                                     |
| AC1.5     | `e2e/touch.spec.ts` ("with a mouse"); all 36 Phase 1 browser tests pass with unchanged assertions          |
| AC2.1–2.5 | `e2e/touch.spec.ts`, one test each; AC2.5 additionally in `TouchTracker.test.ts`                           |
| AC3.1     | `e2e/touchLayout.spec.ts`, once at 640 × 360 and once at 1280 × 800                                        |
| AC3.2–3.5 | `e2e/touchLayout.spec.ts`, one test each                                                                   |
| AC3.6     | `src/util/repoHygiene.test.ts`: the only binary files are the nine reference screenshots                   |
| AC3.7     | `e2e/touchLayout.spec.ts` plus review by eye (see below)                                                   |
| AC3.8     | `README.md`, sections "Play" and "Touch controls"                                                          |
| AC3.9     | `CLAUDE.md`: structure, conventions (input modes), `touch=1`, touch testing, status                        |
| AC3.10    | This file                                                                                                  |
| AC3.11    | CI and the pull request; see the pull request itself                                                       |

**Screenshots reviewed by eye:** the reference `touch-controls` (960 × 540: stick with the
knob pushed up and right, six buttons, block bar, crosshair free), and ad-hoc screenshots
of the game view and the menu at 640 × 360 and 1280 × 800 and of the rotate overlay at
360 × 640. Found and fixed this way: nothing after the first layout; the first test for
AC2.1 was wrong, not the game (it broke the block under the player's feet).

The eight Phase 1 reference screenshots are byte-identical and still match.

## Decisions and deviations

Where the plan left a detail open, the simplest option was chosen.

### Input

| Topic              | Decision                                                                                                                                                                     | Why                                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Module split       | `src/input/TouchTracker.ts` (no DOM: fingers → stick, look, buttons) and `src/input/TouchControls.ts` (pointer events → tracker). The plan names only `TouchControls.ts`     | AC1.1 asks for unit tests; unit tests run in Node without a DOM. `TouchTracker.ts` is in the coverage scope (100 % of its lines are exercised) |
| Stick response     | Inside the dead zone the output is zero; outside it equals the raw deflection (no rescaling)                                                                                 | Half deflection is then exactly half speed, as AC1.1 asks. The player starts at 15 % speed when leaving the dead zone                          |
| Stick zone         | Left half of the view, below 30 % of its height (`TOUCH_STICK_ZONE_TOP`). One stick at a time. A touch in the upper left that is not the menu button does nothing            | The plan says "lower left half"; the top strip belongs to the menu button                                                                      |
| Stick radius       | Fixed 60 CSS px (`TOUCH_STICK_RADIUS`); it does not scale with the screen                                                                                                    | Value from the plan; thumb travel is the same on phone and tablet                                                                              |
| Look speed         | `TOUCH_LOOK_RADIANS_PER_PIXEL = 0.004` (mouse: 0.0025), multiplied by the touch sensitivity (0.2 to 3, default 1). A drag over half of a 960 px wide screen turns about 110° | Fingers travel less than a mouse; needs judging on the real device                                                                             |
| Look direction     | Dragging right turns right, dragging up looks up                                                                                                                             | "Same signs as the mouse" (AC1.2)                                                                                                              |
| Second look finger | Ignored; only the first finger on the right half turns the view                                                                                                              | No pinch or two-finger gestures are specified                                                                                                  |
| Mouse buttons      | Ignored by `Input` in touch mode; `pointerdown` of a finger is also cancelled                                                                                                | Browsers send substitute mouse events after a touch; they must not break blocks                                                                |
| Sprint             | The stick sets and clears the same "sprint" state as the Shift key                                                                                                           | One state for both sources is simplest; only matters with keyboard and touch used together                                                     |
| New press action   | `PressAction` gained `{ type: 'menu' }`; `Input` gained `setHeld`, `setMove`, `press`, `moveAxes`, `setMouseEnabled`                                                         | Touch feeds the existing abstraction as the plan asks                                                                                          |

### Modes and menu

| Topic                     | Decision                                                                                                                                                                                           | Why                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Mode before the first tap | Devices whose main pointer is a finger (`pointer: coarse`) start in touch mode, so the button reads "Tap to play" and the touch defaults apply from the first frame                                | AC1.4 names the button "Tap to play" before anything was tapped                 |
| Switching                 | Every activation of the play button can switch the mode by its pointer type. Activating it by keyboard keeps the mode. `touch=1` pins touch mode                                                   | A laptop with a touch screen can use both                                       |
| Controls in the document  | In mouse mode the touch HUD, the rotate overlay, the debug switch, the fullscreen button and the touch sensitivity row are not in the document at all                                              | AC1.5; the `pause-screen` reference stays unchanged                             |
| Menu button in test mode  | Does nothing with `test=1`                                                                                                                                                                         | Test mode has no menu to return from                                            |
| Sensitivity rows          | Touch mode shows "Touch sensitivity" instead of "Mouse sensitivity"                                                                                                                                | One of them is meaningless in each mode                                         |
| Stored settings           | `touchSensitivity` is written to `localStorage` only when it differs from 1                                                                                                                        | A Phase 1 test compares the stored text exactly; "unchanged assertions" (AC1.5) |
| Render distance default   | While nothing is stored, the mode decides: 5 in touch mode, 8 in mouse mode, also when the mode changes later. It is stored only when the player moves a slider                                    | "When no setting is stored" (plan 5.11)                                         |
| Portrait                  | Only in touch mode and not with `test=1`. Turning the device upright opens the menu (paused) and covers everything with the rotate overlay. Back in landscape the menu is shown; "Tap to continue" | Resuming by itself while the device is still being turned would be a surprise   |
| Long-press menu           | Suppressed on the whole game in touch mode, except on text fields                                                                                                                                  | Paste by long press will be needed for the room code in Part B                  |
| Fullscreen                | Whole page (`document.documentElement`); the label changes to "Exit fullscreen". If the browser refuses, the menu shows "Fullscreen is not available in this browser."                             | –                                                                               |
| Phone menu                | Below 480 px of height the menu is compact and hides the link text field (the copy button stays)                                                                                                   | Everything has to fit into 360 px without scrolling (AC3.1)                     |
| Sliders                   | Rows are 26 px (phone) or 30 px (tablet) high, not 48                                                                                                                                              | AC3.1 is about buttons and controls; four 48 px rows do not fit a phone         |
| Scrolling the menu        | The menu itself may be scrolled vertically by finger if it ever is taller than the screen                                                                                                          | Safety net for very small screens                                               |

### Layout

- Button size `clamp(48px, 15vmin, 88px)`: 54 px at 640 × 360, 81 px at 960 × 540, 88 px at
  1280 × 800. Gap 8 px.
- Positions: menu top left, fly top right, down bottom right, up above it, break and place
  left of them above the block bar (place lower, break higher), as in the plan's sketch.
- In touch mode the slots of the block bar are 48 px instead of 44 px.
- The debug overlay moves to the right of the menu button in touch mode.
- `viewport-fit=cover` is deliberately **not** set: the page never extends under a display
  cutout, so no button can end up below a camera notch.

### Tests and tooling

- **Finger emulation** (`e2e/touch.ts`): a press or a move sends all touch points and
  Chromium works out which finger changed; a lift is a `touchEnd` that names the lifting
  finger. Chromium hands touch moves to the page with its next frame, after the DevTools
  call has returned, so the helper waits until the page has seen each position. Without
  that wait the tests were flaky under load.
- **One fixed wait**: the long-press check of AC3.3 waits 1.2 s twice, because the
  browser's own long-press timer has to run. Everything else waits on state.
- **AC3.3 has limited force.** The test asserts that a pinch, swipes and long presses
  change neither zoom nor scroll position and that every context-menu request is refused.
  It was not established whether headless Chromium would zoom or open a menu without the
  suppression, so a pass does not prove the behaviour on a real device. The plan foresaw
  this; the items are on the manual list.
- **Fullscreen** is not clicked in tests (headless fullscreen is unreliable); the test
  checks that the button exists, is on screen and is finger-sized.
- **Test API**: `getState()` also returns `touch`, `render.pixelRatio` and
  `render.renderDistance`.
- **Phase 1 unit tests adapted**: `settings.test.ts` and `urlParams.test.ts` compare whole
  objects and had to learn the new fields `touchSensitivity` and `touch`. No Phase 1
  browser test was changed.
- `repoHygiene.test.ts` now expects nine image files (one new reference screenshot).
- The message for browsers without WebGL2 no longer says "desktop version".

## Measured numbers

| Measurement                         | Result                                                        |
| ----------------------------------- | ------------------------------------------------------------- |
| Production bundle                   | 599 kB JavaScript (Phase 1: 588 kB), 7 kB CSS (Phase 1: 4 kB) |
| Unit tests                          | 157, about 4 s                                                |
| Browser tests                       | 53, about 3.5 minutes with 3 workers                          |
| Canvas at 640 × 360, device ratio 3 | 960 × 540 pixels (ratio capped at 1.5)                        |
| Chunks at the touch default         | 121 (11 × 11) at render distance 5; at the default 8: 289     |

Frame rates could not be measured: the cloud container has software WebGL only. The frame
rate on the real phone and tablet is the most important open number (manual list, item 3).

## Known issues

- **Nothing was tried on a real device.** All touch input in the tests is emulated in
  desktop Chromium.
- The stick can start on the strip left and right of the block bar, but a touch on a slot
  selects that slot instead. On a 640 px wide phone the bar covers most of the bottom edge.
- The sliders in the menu are small targets on a phone.
- A stick finger keeps the stick while it wanders over buttons (intended), so a thumb that
  slips far right does not press anything.
- The player keeps the speed they had when the menu opened and loses it within a few
  frames after continuing (as in Phase 1).
- iPhone and iPad are untested; iPhones have no fullscreen for web pages.
- The on-screen keyboard changes the viewport size; that matters only once text fields are
  used (Part B: name and room code) and may briefly show the rotate overlay if the
  remaining height is larger than the width. Not expected in landscape.

## For the owner to try on the Android phone and tablet

Open the deployed game in Chrome after merging. Each item says what to look for.

1. **Start**: the button reads "Tap to play"; tapping it shows the controls. No part of a
   button is cut off or hidden behind the system bars or a camera notch.
2. **Feel of the stick**: does the thumb find it, is the dead zone too large or too small,
   is the 60 px travel right, does sprinting at full push happen when intended?
3. **Look sensitivity**: is a comfortable drag enough to turn around? Try the "Touch
   sensitivity" slider. Report the value that feels right, so it can become the default.
4. **Frame rate at render distance 5**: switch on "Debug overlay" in the menu and read the
   FPS while walking and while flying fast. Try render distance 8 as well.
5. **Reachability of the buttons**: break, place, up and down with the right thumb while
   the left thumb is on the stick; fly and menu at the top. Too small, too close, wrong
   place?
6. **Three fingers**: walk with the stick, turn with one finger and break with another.
7. **Hold to repeat**: holding break or place repeats four times a second.
8. **Block bar**: tapping a slot selects it; no block is broken by the tap.
9. **Fullscreen**: the button in the menu hides the browser's address bar; "Exit
   fullscreen" brings it back.
10. **Rotate overlay**: turning the device upright shows "Please rotate your device to
    landscape."; turning back shows the menu with "Tap to continue".
11. **Gestures that must do nothing** during play: pinching with two fingers (no zoom),
    pulling down from the top edge (no reload), swiping up or sideways from the edges (as
    far as Android allows), a long press on the view or on a button (no menu, no text
    selection, no magnifier).
12. **Menu by touch**: sliders can be dragged, the debug switch toggles, "Copy link to
    this world" works.
13. **A mouse on the computer still works as before**, and `?touch=1` on the computer shows
    the touch controls (they react to real touches only, not to the mouse).

## Suggestions for Part B and later

- The menu has little vertical room on a phone. The multiplayer section (name field, room
  code, player list) will not fit beside the existing sections at 360 px of height; plan a
  second page or tabs for it rather than shrinking further.
- Text fields: the long-press menu is already allowed on `input` elements, and
  `.seed-link` shows how to re-enable text selection for one element.
- `Game.setPaused` is the single place that hides the touch HUD and lifts all fingers; the
  "menu without pause" of Part B should keep calling `touch.tracker.reset()` and
  `input.reset()` when the menu opens.
- If the owner's testing shows the look drag should ignore tiny movements or accelerate,
  that belongs into `TouchTracker` (pure, unit-tested).
- Timed breaking (Phase 3) fits the break button as it is: it already reports "held".
