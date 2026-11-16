# Phase 5 plan – Gamepad controls

Read `CLAUDE.md`, `docs/phase-2a-report.md` (touch controls: input modes, `Input`, the
touch tests) and the "Decisions and deviations" of `docs/phase-4p-report.md` (how `Game`
switches screens, `Input.setScript`) first. Phase 5 has two parts with separate pull
requests: **A** (the pad in play, the focus system, all screens except the inventory) and
**B** (inventory, Creative palette, Crafting tab). Each part is implemented autonomously in
one cloud session: do not ask the owner questions. Where this plan leaves a detail open,
choose the simplest option and note it in the part's report (`docs/phase-5a-report.md`,
`docs/phase-5b-report.md`), section "Decisions and deviations".

Tests name their acceptance criterion in the title as "Phase 5 AC1.1".

## 1. Goal

The game can be played from start to finish with a controller that has the common
standard layout (two sticks, A/B/X/Y, two bumpers, two triggers, D-pad, Start/Select), on
desktop browsers and in Chrome on Android, connected by USB or Bluetooth. The pad is a
third input source next to mouse/keyboard and touch. It feeds the existing `Input`
abstraction, so game logic never asks which device is in use.

Every screen can be used with the pad and shows a visible focus frame. Button hints use
neutral letters and plain shapes drawn by code.

Nothing about the game's rules changes: no change to gameplay, recipes, break times, the
action layer or the save format.

## 2. Decisions made with the owner

| Topic             | Decision                                                                                                                                                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parts             | Two parts. **A**: pad source and mapping, play, switching, connect/disconnect, the generic focus system, world menu, "New world" form, pause menu and settings, performance test screens, back guard. **B**: inventory, Creative palette, Crafting tab (hold to repeat, furnace bar), their button hints      |
| Pad and the modes | Mouse mode and touch mode stay as they are; they also stand for the device (pixel ratio, default render distance, fullscreen, landscape rule). The pad is an **active source on top of the mode**: while it is active the touch controls are hidden and mouse mode needs no pointer lock. It is no third mode |
| Back to the mouse | On a computer a **click** on the game hands control back to the mouse (and captures it in that click). Mouse movement alone does nothing while the pad is active. A finger on the game view hands control back to touch                                                                                       |
| Mapping           | Table in 5.3: A jump / up, B fly down, X toggle fly, Y inventory, LB/RB and D-pad left/right slot, LT place, RT break, click on the left stick sprints until the stick is let go, Start pause. Select unused                                                                                                  |
| Back guard        | The page keeps one history entry while anything but the world list is shown. A "Back" from the browser, the phone's back gesture or a pad that sends B as Back acts like the pad's B (5.7)                                                                                                                    |
| Additions         | Auto-pause when the pad being played with disconnects; notices "Controller connected / disconnected" and a hint "Press a button on the controller"; a switch "Invert controller look"                                                                                                                         |
| Vibration         | Not built (owner's choice; it was optional)                                                                                                                                                                                                                                                                   |
| Performance       | No new scenario (5.10)                                                                                                                                                                                                                                                                                        |

## 3. Changes to the original scope

The owner's starting scope was challenged during planning. Agreed changes:

| #   | Change                                                                                                                                                               | Reason                                                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Two parts instead of one session of about the size of Phase 2 Part A                                                                                                 | Making every screen usable is the larger half of the work. Part B (inventory and recipe list) comes after the polishing session that the device tests of Phases 2–4 may trigger, so it is built on the final layout                               |
| 2   | The pad is an active source on top of mouse or touch mode, not a third input mode                                                                                    | Touch mode also means "phone or tablet": pixel ratio at most 1.5, render distance 5, fullscreen, landscape only. A third mode would drop those on a phone with a pad and make it slower. The performance test record (`env.input`) stays as it is |
| 3   | The mouse comes back with a click, not with any movement                                                                                                             | The browser captures the mouse only inside a click. Switching on movement would pause the game every time the desk is bumped                                                                                                                      |
| 4   | Added: a back guard (one history entry), which also changes what the browser's Back and the phone's back gesture do in the game                                      | Some Android browsers send the pad's B as "Back", which would leave the page in the middle of play. Unconfirmed for Chrome; the guard is cheap and makes Back useful for touch players too                                                        |
| 5   | Vibration dropped                                                                                                                                                    | Optional in the brief; support outside Chrome on the desktop is uncertain; the owner chose to leave it out                                                                                                                                        |
| 6   | Added: auto-pause on disconnect, connect/disconnect notices, the hint "Press a button on the controller", and "Invert controller look"                               | A pad that loses power mid-walk would leave the player walking blind; browsers report a pad only after its first press, so the player needs to be told; inverted look is expected by many players                                                 |
| 7   | Hold-to-repeat "Craft" and the sliders are wired to the focus system explicitly; the rest of the navigation is generic over the elements of a screen (5.6, "Layout") | The owner asked for navigation that survives layout changes. Three behaviours cannot be derived from the layout; they are attached to element types or to one data attribute each, so a changed layout still costs nothing                        |

## 4. Out of scope (do not build)

- Remapping buttons, a controls settings screen.
- Other controller layouts with their own glyphs (PlayStation, Switch); controllers whose
  browser mapping is not `standard` (they get a notice, 5.2).
- An on-screen keyboard; typing with the pad. Text fields keep their default text.
- iPhone and iPad.
- Vibration.
- Several players or several pads at once (one pad is used at a time).
- Aim assist, gyro aiming, a dead zone setting.
- Multiplayer; any change to gameplay rules, recipes, break times, the action layer or the
  save format.
- Any vendor logo, name, font or colour scheme (hard rule 1).

## 5. Specification

### 5.1 Architecture

New modules (pure ones follow the discipline of `TouchTracker.ts`: no DOM, unit-tested in
Node, in the coverage scope):

| Module                       | Kind  | Purpose                                                                                                                                                                   |
| ---------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/input/padMapping.ts`    | pure  | `PadMapper`: one snapshot (`buttons: number[]` values 0–1, `axes: number[]`) plus elapsed ms in, one `PadFrame` out: movement, look rate, held flags, presses, navigation |
| `src/input/focusMove.ts`     | pure  | `nextFocus(rects, from, direction)`, `nearestFocus(rects, point)`; navigation repeat (`NavRepeat`)                                                                        |
| `src/input/GamepadSource.ts` | shell | Polls `navigator.getGamepads()` once per rendered frame, chooses the pad, runs `PadMapper`, routes the frame to `Input` (play) or to `FocusManager` (screens)             |
| `src/ui/FocusManager.ts`     | shell | Virtual focus over the topmost open screen, the focus frame, confirm/back, sliders, scrolling                                                                             |
| `src/ui/padGlyphs.ts`        | shell | Draws the glyphs (A/B/X/Y, LB/RB, LT/RT, sticks, D-pad, Start) on canvases                                                                                                |
| `src/ui/PadHints.ts`         | shell | The hint bar at the bottom of a screen ("[A] Select [B] Back")                                                                                                            |
| `src/game/backGuard.ts`      | shell | The history entry and the `popstate` handler (5.7)                                                                                                                        |

`navigator.getGamepads` is only read inside `GamepadSource`, so tests replace it in one
place (6.2). `Game` owns the active-source flag (`padActive`) and asks nothing else about
devices; `Input` gets the pad's state through `setMove`, `setHeld`, `press` (as touch does)
and a new `addTurn(yaw, pitch)` in radians, consumed per frame like the mouse look.

### 5.2 The pad: connecting, choosing, edges

- **Supported pads** report `mapping === 'standard'`. A connected pad with another mapping
  is ignored; the first time one presses a button the game shows "This controller is not
  supported" (HUD notice in play, message line in the menus).
- **Choosing**: the first supported pad on which a button is pressed becomes the pad; others
  are ignored until it disconnects.
- **First press**: browsers report a pad only after a button was pressed. A button that is
  already down in the first snapshot of a pad (or after a reset) does not count as a press
  until it was released once. This keeps the wake-up press from acting.
- **Buttons** count as down from 0.5 and as up below 0.35 (hysteresis, also for the
  analogue triggers). Presses are detected per poll (one poll per rendered frame).
- **Notices**: "Controller connected" when the pad is first reported, "Controller
  disconnected" when the pad in use goes away; shown like the pickup notices in play and in
  the message line of the menus. The controls list says "Press a button on the controller
  to use it" while no pad was seen.
- **Disconnect** of the pad in use: everything it held is released at once (movement, break,
  place, sprint). If a world is being played (not in test mode) the game pauses.

### 5.3 Mapping in play

Button indices are those of the standard mapping.

| Input                                        | Action                                                     | Through `Input`              |
| -------------------------------------------- | ---------------------------------------------------------- | ---------------------------- |
| Left stick                                   | Move (analogue)                                            | `setMove`                    |
| Right stick                                  | Look                                                       | `addTurn`                    |
| A (0)                                        | Jump / swim up / fly up                                    | held `jump`                  |
| B (1)                                        | Fly down                                                   | held `descend`               |
| X (2)                                        | Toggle fly mode (Creative; refused as with F in Gathering) | press `toggleFly`            |
| Y (3)                                        | Inventory                                                  | press `inventory`            |
| LB (4) / RB (5)                              | Previous / next bar slot                                   | press `cycleSlot` −1 / +1    |
| LT (6)                                       | Place (holding repeats like the right mouse button)        | held `place` + press `place` |
| RT (7)                                       | Break (hold)                                               | held `break` + press `break` |
| Left stick click (10)                        | Sprint until the left stick returns into its dead zone     | held `sprint`                |
| Start (9)                                    | Pause menu                                                 | press `menu`                 |
| D-pad left (14) / right (15)                 | Previous / next bar slot                                   | press `cycleSlot`            |
| Select (8), D-pad up/down, right stick click | Unused                                                     | –                            |

Holding RT or LT behaves exactly as holding the mouse button: timed breaking in Gathering,
repeat every `repeatTimer` interval, the same actions through the session.

### 5.4 Sticks

- **Dead zone**: radial, `PAD_DEADZONE` 0.15. Inside it the stick reads zero; outside it the
  magnitude is rescaled from 0.15–1 to 0–1, keeping the direction. (Unlike the touch stick,
  which does not rescale: a resting pad must read zero, and slow walking must still be
  possible just outside the dead zone.)
- **Movement**: the rescaled left stick is `forward` (stick up = forward) and `strafe`.
- **Look**: rescaled right stick magnitude `m` → rate `m^PAD_LOOK_EXPONENT` (2) ×
  `PAD_LOOK_MAX_RAD_PER_S` (3.0, about 170°/s) × the controller sensitivity, in the stick's
  direction. Stick right turns right, stick up looks up (inverted when "Invert controller
  look" is on).
- **Ramp**: when the horizontal look magnitude stays above 0.95 for `PAD_RAMP_DELAY_MS`
  (250), the horizontal rate grows linearly to `PAD_RAMP_FACTOR` (1.6) times over
  `PAD_RAMP_MS` (400), so a full turn is quick while fine aiming stays slow. Letting go
  below 0.95 resets the ramp.
- **Applied per rendered frame** with the frame's elapsed time (as the mouse), capped like
  the simulation at 0.25 s.
- **Drift**: a stick never makes the pad active by itself unless pushed beyond
  `PAD_ACTIVATE_THRESHOLD` (0.5); drift below the dead zone moves nothing.

### 5.5 Active source and switching

- `padActive` becomes true when the pad is "used": a button press, or a stick beyond 0.5.
- **Mouse mode** with the pad active: the game runs without pointer lock (losing the lock
  does not pause; `requestPlay`, `startWorld` and `closeInventory` do not ask for it); the
  mouse cursor is hidden over the game view; mouse movement does not look; `Esc` pauses (it
  has no lock to release). A mouse button press on the game view sets `padActive` false,
  requests the pointer lock inside that press and does not break or place.
- **Touch mode** with the pad active: the touch controls are covered (`setCovered`), touch
  defaults stay (pixel ratio, render distance, fullscreen, landscape). A finger on the game
  view sets `padActive` false and only uncovers the controls (that touch does nothing else).
- In menus, moving the mouse or touching hides the focus frame (`padActive` false) without
  any other effect.
- Keys always work and never change `padActive`.
- The world menu's play button reads "Press A to play" while the pad is active.
- During a performance test run the pad does not play (`Input` ignores it while a script is
  set); B and Start cancel the run like Esc.

### 5.6 The focus system

**Which screen**: the topmost open screen: inventory (Part B) over pause menu over world
menu over performance test screens, whichever is visible. In play without a screen the
focus system is idle and the pad plays.

**What is focusable** (looked up anew on every move, never stored as a list): `button`,
`input[type=range]`, `input[type=checkbox]` and elements with `data-pad-focus`, that are
enabled, not inside a `hidden` element, and have a rectangle larger than zero. Text fields
are never focusable (a focused text field could open the on-screen keyboard on Android), and
`data-pad-skip` excludes an element.

**Focus is virtual**: the element gets the class `pad-focused` and a frame
(`.pad-focus-frame`, a 3 px light outline with a dark edge, readable on every background)
is drawn over its rectangle; the frame follows the element every frame (lists reorder,
content scrolls). DOM `focus()` is never called. The frame shows only while the pad is
active.

**Moving**: D-pad and left stick give four directions, with repeat (first after
`PAD_NAV_DELAY_MS` 400, then every `PAD_NAV_REPEAT_MS` 120). `nextFocus` picks among the
elements whose centre lies beyond the current element's edge in that direction the one with
the smallest `along + 3 × across` distance, where `across` is 0 if the two rectangles
overlap across the direction. There is no wrap-around. The new element is scrolled into
view (`block: 'nearest'`).

**Default and memory**: on opening a screen (or a view of it, e.g. the "New world" form)
the focus goes to `[data-pad-default]` if visible, otherwise to the first focusable element
in document order. Each screen root remembers its last focused element while it stays in
the document and visible. If the focused element disappears or is disabled, the focus goes
to the element nearest to its last rectangle (`nearestFocus`).

**Confirm (A)**: on press the element gets a `padpress` event, on release a `padrelease`
event and then `click()`. Buttons work by their existing click handlers; `onActivate`
reports `via = null`, so the mode is kept, as with the keyboard.

**Sliders**: on a focused `input[type=range]`, left and right change the value by one
`step` (with repeat) and dispatch an `input` event, which the existing handlers apply; up
and down move the focus. **Checkboxes**: A toggles (click).

**Back (B)**: clicks the visible element marked `data-pad-back` of the screen, if there is
one. Start in the pause menu continues the game; Start elsewhere does nothing.

**Scrolling**: the right stick scrolls the nearest scrollable ancestor of the focus (or the
screen root) vertically, proportional to the deflection (`PAD_SCROLL_PX_PER_S` 900).

**Layout**: the navigation knows no screen. A screen takes part with at most three
attributes: `data-pad-default` (where focus starts), `data-pad-back` (what B does), and
`padpress`/`padrelease` listeners where a press must be held (the recipe list). A changed
layout of the inventory or the recipe list needs no change in the focus system. Where this
is not enough: a grid with gaps or rows of very different widths may move the focus to an
unexpected neighbour; that is judged in the device test (`PAD-8`, `PAD-13`) and fixed in
`focusMove.ts`, not per screen.

**Hint bar**: while the pad is active, every screen shows a bar at its bottom with glyphs:
"[A] Select [B] Back", plus "[◄►] Change" while a slider is focused. Part B adds the
inventory's hints. The bar is not in the document while the pad is inactive.

**Screens in Part A** and what they mark:

| Screen / view                                           | `data-pad-default`                          | `data-pad-back`                     |
| ------------------------------------------------------- | ------------------------------------------- | ----------------------------------- |
| World menu, list                                        | Play button                                 | – (Back leaves the page, 5.7)       |
| World menu, "New world" form                            | "Create"                                    | "Back" (if there is a list)         |
| World menu, delete confirmation                         | "Keep"                                      | "Keep"                              |
| Pause menu                                              | Continue button                             | Continue button                     |
| Settings page (from the world menu)                     | first slider                                | "Back to worlds"                    |
| Performance test: start, running, result, "Interrupted" | "Start" / "Cancel" / "Back" / "Start again" | "Back" / "Cancel" / "Back" / "Back" |

### 5.7 Back guard

- Outside test mode, whenever anything but the world list is shown (a world is played or
  paused, the "New world" form, the confirmation, the settings page, a performance test
  screen, the inventory), the page has pushed one history entry (`history.pushState`).
- On `popstate` the entry is pushed again and the game acts as for the pad's B: in play →
  pause menu; inventory → close it; pause menu → continue; sub-views → back to the world
  list; a running performance test → cancel. On the world list no entry is held, so Back
  leaves the page (the autosave already writes on `pagehide`).
- If a browser sends the pad's B both as a button and as Back, the two must not act twice:
  a `popstate` within `BACK_PAIR_MS` (150) after a B press only re-arms the guard.
- The guard is a separate module with no knowledge of the screens; `Game` gives it "armed"
  and an `onBack` callback.

### 5.8 Settings and the pause menu

- New settings: `padSensitivity` (0.2–3, default 1) and `padInvertY` (default false), stored
  only once changed (the rule of `touchSensitivity`), validated like the others.
- The settings rows "Controller sensitivity" (slider) and "Invert controller look" (switch)
  appear once a pad has been seen during this visit of the page. Without a pad the pause
  screen and its reference stay unchanged.
- While the pad is active the controls list shows the pad's lines (with glyphs) instead of
  the mouse or touch lines; Gathering leaves out the fly lines as the others do.
- The Brightness slider and all other sliders are reached and changed with the pad (5.6).
- "Fullscreen" by pad: whether a pad press counts as a user gesture differs between
  browsers. Pressing it is tried; if the browser refuses, the existing message shows. Nothing
  else depends on a gesture from the pad.

### 5.9 Glyphs

Drawn on canvases by `padGlyphs.ts`, monochrome (light lines and letters on a dark disc, no
vendor colours): A, B, X, Y as a circle with the letter; LB and RB as a rounded bar with the
letters; LT and RT as a trigger outline with the letters; the sticks as a circle with "L" or
"R" (with a small arrow for the click); the D-pad as a cross with the used arm filled; Start
as a pill with three short lines. The letters use the page's normal font. `pad-glyphs`
(reference screenshot) shows all of them on one sheet (built from a test page of the
existing preview kind, `scripts/iconPreview.ts` style, or an e2e page with `test=1`).

### 5.10 Performance

The pad adds one `getGamepads()` call and one `PadMapper.update` per rendered frame, and a
focus lookup only when the focus moves. No scenario is added: the performance test replaces
all input with its script, so a scenario could not exercise the pad, and the cost is
microseconds (AC1.6 pins it in Node). The focus frame is one element moved per frame while
a screen is open and the pad is active, which is never during a measured run.

### 5.11 Test API

- `getState().pad`: `{ connected: number, active: boolean, polls: number, unsupported:
boolean }` (`polls` counts the polls, so tests can wait for the next ones).
- `getState().ui.focus`: a short description of the focused element (its `aria-label`, its
  text, or its `data-*` name), or null.
- `getState().settings` has `padSensitivity` and `padInvertY`.

## 6. Test strategy

### 6.1 Layers

| Layer       | What                                                                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (Node) | `padMapping.test.ts` (dead zone, curve, ramp, edges, first press, hysteresis, sprint latch, navigation repeat), `focusMove.test.ts`, settings |
| Browser     | A fake pad (6.2) drives play, switching, connecting, the menus and (Part B) the inventory                                                     |
| Device      | Real controllers by the owner (section 9)                                                                                                     |

### 6.2 The fake pad

`e2e/gamepad.ts` installs, with `page.addInitScript`, a replacement for
`navigator.getGamepads` that returns pads held in `window.__fakePads` (each with `id`,
`index`, `connected`, `mapping`, `timestamp`, `buttons` as `{ pressed, touched, value }` and
`axes`). The helper `Pad` has `connect()`, `disconnect()` (both dispatch
`gamepadconnected` / `gamepaddisconnected` events whose `gamepad` property is the fake),
`press(button)`, `release(button)`, `tap(button)`, `stick('left' | 'right', x, y)` and
`trigger(button, value)`. Every call returns only after `getState().pad.polls` has grown by
at least two, so the game has seen it. A pad with `mapping: ''` tests the unsupported case.
Tests never wait on fixed sleeps.

### 6.3 Reference screenshots

New: `pad-glyphs`, `pad-world-menu` (focus frame on the play button, hint bar), `pad-pause`
(pad controls list, the two controller rows, focus on the Brightness slider). Part B:
`pad-inventory` (focus on a slot with a picked slot), `pad-recipe-list`. Every existing
reference stays byte-identical (no pad connected in those tests).

### 6.4 Limits of automation

Real pads, Bluetooth, the B-as-Back behaviour of real browsers, whether a pad press counts
as a user gesture, the feel of the sticks and drift cannot be tested here. The fake pad
proves the game's logic only; the device list covers the rest.

## 7. Implementation steps

### Part A – The pad in play, the focus system, the menus (steps 1–4)

### Step 1 – The pure core

- `src/input/padMapping.ts` with `PadMapper` and `PadFrame`; `src/input/focusMove.ts`;
  constants in `config.ts` (`PAD_*`, `BACK_PAIR_MS`); settings fields `padSensitivity` and
  `padInvertY`.

Acceptance criteria:

- **AC1.1** Dead zone: any stick position with magnitude ≤ 0.15 gives zero movement and zero
  look; magnitude 0.575 gives 0.5 movement in the same direction; magnitude 1 gives 1.
- **AC1.2** Look: rate at full deflection equals `PAD_LOOK_MAX_RAD_PER_S` × sensitivity
  before the ramp; at half of the rescaled range it is a quarter of that; signs as in 5.4;
  invert flips only the vertical axis.
- **AC1.3** Ramp: held at full horizontal deflection the rate is unchanged until 250 ms,
  1.6 times at 650 ms and after; dropping below 0.95 resets it.
- **AC1.4** Buttons: a press reports one press event and the held state until the value
  falls below 0.35; values between 0.35 and 0.5 never start a press; a button already down
  in the first snapshot after a reset reports nothing until released and pressed again.
- **AC1.5** Sprint latch: the stick click sets `sprint`; it stays while the left stick is
  outside the dead zone and clears when it returns inside; the mapping table of 5.3 is pinned
  by one table-driven test.
- **AC1.6** 10 000 `update` calls with a full snapshot take less than 20 ms
  (`expectFasterThan`).
- **AC1.7** `nextFocus`: on grids, rows of different widths, a single column and with gaps it
  chooses the expected neighbour; returns −1 when nothing lies in the direction; no
  wrap-around; `nearestFocus` returns the closest rectangle. Navigation repeat: first move at
  once, the second after 400 ms, then every 120 ms; a change of direction restarts it.
- **AC1.8** Settings: the two fields default, clamp and survive storing; the stored text of a
  player who never changed them is unchanged (as `settings.test.ts` checks for touch).

### Step 2 – The pad in play

- `GamepadSource`, `Input.addTurn`, `padActive` in `Game`, the switching rules of 5.5,
  notices, auto-pause on disconnect, unsupported pads, test API, `e2e/gamepad.ts`.

Acceptance criteria (browser, fake pad, `test=1` unless said otherwise):

- **AC2.1** Left stick forward for 60 steps moves the player forward; inside the dead zone
  (0.1) for 60 steps does not move it.
- **AC2.2** Right stick right turns right, up looks up; with "invert" stored (`save=1` or a
  settings stub) up looks down. Pitch stays clamped.
- **AC2.3** RT held breaks the target block (Creative); in Gathering it breaks after the
  block's break time, like the mouse; LT places; LB/RB and D-pad left/right change the
  selected slot with wrap-around; A jumps; X toggles flying in Creative and is refused in
  Gathering; B descends while flying; the stick click sprints until the stick is released.
- **AC2.4** Y opens the inventory; Start opens the pause menu (without `test=1`).
- **AC2.5** The wake-up press: connecting a pad with A already down does not jump.
- **AC2.6** Without `test=1`, mouse mode: with the pad active the game plays without pointer
  lock and does not pause; the canvas cursor is hidden; a mouse click on the canvas switches
  back (pad inactive), requests the lock and breaks nothing.
- **AC2.7** Touch mode (`touch=1`): pad use covers the touch controls; a finger on the view
  uncovers them and acts on nothing; pixel ratio and render distance stay the touch values.
- **AC2.8** Disconnecting the pad in use while RT, LT and the stick are held releases all of
  them; without `test=1` the game pauses. "Controller connected" / "Controller disconnected"
  show. A pad with another mapping shows "This controller is not supported" and does
  nothing.
- **AC2.9** All browser tests that existed before pass unchanged.

### Step 3 – The focus system, the menus, the back guard

- `FocusManager`, the focus frame, `PadHints`, `padGlyphs`, the attributes of 5.6 on the
  world menu, the form, the confirmation, the pause menu and settings page, the performance
  test screens; the controller rows and the pad controls list; `backGuard.ts`.

Acceptance criteria (browser, without `test=1`, fake pad):

- **AC3.1** From a fresh browser: the pad alone creates a world (form opens because there is
  none, the default name is kept, D-pad to "Gathering", A on "Create"), plays, opens the
  pause menu with Start, goes back to the worlds, selects the world in the list and plays it
  again. No mouse, key or finger is used.
- **AC3.2** The focus frame is visible over the focused element (its rectangle within 4 px of
  the element's) only while the pad is active; moving the mouse hides it.
- **AC3.3** D-pad and left stick move the focus on every screen of the table in 5.6 to the
  geometrically expected element; B does what the table says; the default focus is as listed.
- **AC3.4** Sliders: left/right on the Brightness slider change the setting by one step each
  (holding repeats); the picture changes as with the mouse; up/down leave the slider. The
  debug switch toggles with A. Text fields are never focused.
- **AC3.5** The controller rows appear after the first pad press and not before; the pad
  controls list replaces the mouse/touch list while the pad is active.
- **AC3.6** Performance test with the pad: start the quick suite with A, cancel with B; the
  "Interrupted" screen is focused on "Start again"; from the result screen B goes back. The
  scripted run is not disturbed by stick input.
- **AC3.7** Back guard: in play `page.goBack()` opens the pause menu and the URL stays the
  game's; in the "New world" form it returns to the list; on the world list it leaves the
  page. A B press followed within 150 ms by `popstate` acts once.
- **AC3.8** References `pad-glyphs`, `pad-world-menu`, `pad-pause` created and looked at;
  all others unchanged.

### Step 4 – Hardening, documentation, pull request

- A soak: 2 000 seeded pad frames (random sticks, buttons, connects and disconnects) in play
  and in the menus without a console message; ends with `verifyLight()` 0.
- `README.md` (section "Controller"), `CLAUDE.md` (structure, the active source, the focus
  attributes, the fake pad, test API), `docs/device-tests.md` (section "Controller", ids
  `PAD-1` to `PAD-12`, origin 5A), `docs/phase-5a-report.md`.

Acceptance criteria:

- **AC4.1** The soak passes; nothing throws when the pad disconnects in any screen.
- **AC4.2** Hard rule 1 checked: no vendor names in code, UI or docs beyond neutral words
  ("controller", A/B/X/Y, LB/RB/LT/RT, Start); glyphs drawn by code; `repoHygiene.test.ts`
  counts the new references.
- **AC4.3** `npm run check:all` passes; CI green; one pull request into `main`.

### Part B – Inventory, palette, recipe list (steps 5–7)

Starts after Part A is merged and after the polishing session of the inventory and recipe
list is merged, or when the owner says there will be none.

### Step 5 – Inventory and Creative palette

- The inventory screen joins the focus system: slots, palette blocks, bin, tabs and "Close"
  are buttons already. Marks: `data-pad-default` on the selected bar slot (Gathering) or the
  first palette block (Creative); `data-pad-back` on "Close".
- B: if a slot is picked, it is put down (the pick is cancelled); otherwise the screen
  closes. Y closes. Start closes and opens the pause menu. LB/RB switch the tabs in
  Gathering.
- The click guard of the inventory (a click counts only after a press on the open screen)
  counts `padpress` as a press.
- Hint bar: "[A] Pick / Put [B] Back [Y] Close", plus "[LB][RB] Tabs" in Gathering.

Acceptance criteria:

- **AC5.1** With the pad alone: move a stack from a bar slot to a grid slot, merge two
  stacks, swap two, throw one into the bin; the inventory matches the actions the mouse
  would have submitted.
- **AC5.2** Creative: A on a palette block puts it into the selected bar slot; picking a bar
  slot first and then a block puts it there.
- **AC5.3** The Y press that opens the inventory does not also act inside it; B with a picked
  slot only cancels the pick; LB/RB switch tabs; closing with Y returns to play without
  pointer lock.

### Step 6 – Crafting tab

- `RecipeList` listens to `padpress` / `padrelease` on "Craft" exactly as to
  `pointerdown` / pointer release, so holding A repeats every `CRAFT_REPEAT_MS` and the click
  after a hold that already crafted does not craft once more (existing rule).
- The focus follows the "Craft" button when the list reorders; when the focused button hides
  (no longer craftable, furnace bar) the focus goes to the nearest one. The right stick
  scrolls the list (also to recipes that cannot be made, which have no button).

Acceptance criteria:

- **AC6.1** A on "Craft" makes the recipe once; holding A for the time of three repeats makes
  it four times; releasing makes nothing more.
- **AC6.2** A furnace recipe starts the bar with A; the bar fills; closing with Y cancels it as
  with the mouse.
- **AC6.3** After a craft that reorders the list the focus is still on the same recipe's
  button, or on the nearest button if it disappeared; the frame is on screen.
- **AC6.4** References `pad-inventory` and `pad-recipe-list` created and looked at; all
  others unchanged.

### Step 7 – Hardening, documentation, pull request

- The soak of AC4.1 includes the inventory and the recipe list.
- `CLAUDE.md`, `README.md`, `docs/device-tests.md` (`PAD-13` to `PAD-15`, origin 5B),
  `docs/phase-5b-report.md`.
- **AC7.1** `npm run check:all` passes; CI green; one pull request into `main`.

## 8. Risks and fallbacks

| Risk                                                                                       | Fallback                                                                                                                                         |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chrome on Android sends B as Back and the guard does not catch it (e.g. it closes the tab) | Device test `PAD-3` shows it. Then B in play is moved to another button in a small session; B as "back" in menus keeps working through the guard |
| The pad is reported only after its first press                                             | The hint "Press a button on the controller"; the wake-up press does nothing (5.2)                                                                |
| Firefox or Safari report a mapping other than `standard`, or no pad                        | Notice "not supported"; Chrome and Edge are the targets; Firefox is an optional device test (`PAD-11`)                                           |
| Stick drift larger than 0.15                                                               | `PAD_DEADZONE` is one constant; the owner's report from `PAD-5` decides a new value. Drift never activates the pad by itself (threshold 0.5)     |
| A pad press does not count as a user gesture (fullscreen, pointer lock)                    | The pad never needs one: no pointer lock in pad play, fullscreen by pad is tried and may show the existing message                               |
| `getGamepads()` returns stale objects in some browsers                                     | Call it once per poll and read the returned array, never keep a `Gamepad` object between polls                                                   |
| Spatial navigation moves to an unexpected neighbour on a changed layout                    | Fixed in `focusMove.ts` (with a unit test of the case), never with a per-screen path                                                             |
| The fake pad behaves unlike a real one                                                     | The fake only replaces `getGamepads()` and the two events; everything after it is the real code. Real pads are judged in section 9               |

## 9. Tests on real devices (to be added to `docs/device-tests.md`)

Part A adds a section "Controller" with these entries (origin 5A); Part B adds PAD-13 to
PAD-15 (origin 5B). Wording may be sharpened by the implementing session.

- **PAD-1** PC, Chrome, USB: the notice appears after the first press; play a few minutes.
- **PAD-2** Android phone and tablet, Chrome, Bluetooth: the same.
- **PAD-3** Phone: B during play and in menus never leaves the page; the phone's back gesture
  opens the pause menu in play and goes back in menus.
- **PAD-4** Look: dead zone, speed, the ramp when turning fully; which "Controller
  sensitivity" feels right (can become the default)? Is "Invert" needed?
- **PAD-5** Lay the pad down for a minute during play: nothing moves or turns.
- **PAD-6** Switching: pad → finger → pad on the phone; pad → mouse click → pad on the PC.
  Does it happen when expected and never by itself?
- **PAD-7** Turn the pad off during play: the game pauses; turn it on, press a button, go on.
- **PAD-8** The whole menu flow without touching the screen or mouse: create a world, play,
  pause, change Brightness, back to worlds, play again. Is the focus frame always visible
  and where you expect?
- **PAD-9** "Fullscreen" in the pause menu with the pad (phone).
- **PAD-10** Start and cancel the performance test with the pad.
- **PAD-11** (optional) Firefox and Edge on the PC.
- **PAD-12** The glyphs and the hint bar: readable, understood (also by a child)?
- **PAD-13** (5B) Inventory: move, merge, swap stacks and use the bin with the pad.
- **PAD-14** (5B) Crafting: hold A to repeat, the furnace bar, scrolling the list.
- **PAD-15** (5B) Creative palette: put blocks into the bar.

## 10. Notes for later phases

- **Multiplayer (Phase 6)**: the pad feeds `Input` like the other sources; nothing about it
  goes over the network. Name and room-code fields need typing; the pad cannot type, so the
  join screen must stay usable with the default name and a pasted or tapped code.
- **Personalization (Phase 7)**: a remapping screen would replace the table of 5.3 by stored
  data; `PadMapper` takes its table as an option to keep that cheap.
- **Vibration** can be added later in `GamepadSource` with feature detection
  (`vibrationActuator.effects` includes `dual-rumble`).
