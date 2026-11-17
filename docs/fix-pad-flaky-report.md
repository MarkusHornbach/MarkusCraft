# Fix: flaky controller tests

Two tests in `e2e/gamepadMenus.spec.ts` failed on CI now and then, with no change to the game
code. Both had a cause in the game, not in the test: something the game did "at the next
frame" or "within 150 ms", which slow frames under software WebGL stretch. Both are fixed in
the game; no test was skipped or loosened.

## 1. Phase 5 AC3.1: the focus was cleared one frame late

**Seen:** after the pad created and opened a world, `getState().ui.focus` was still
"Create and play" (PR #27, docs only).

**Cause:** `FocusManager.description` reports the focus of the screen it saw at its last
`update()`, and `update()` ran only once per rendered frame (`Game.frame`) and in the pad's
frame handler. A world opens when its IndexedDB load resolves, in a promise between two frames:
`setPaused(false)` shows the game, but until the next frame the focus manager still held the
world menu and its focused button. `untilPlaying` returns as soon as `paused` is false, so the
test read the state inside that gap whenever a frame was slow. On screen it meant the same:
the focus frame stayed over a hidden menu for one frame.

**Fix:** `Game.showScreen`, `openInventory` and `hideInventory` call `syncFocus()` (one
`focus.update()`), so the focus follows every screen change at once, wherever it happens.

**Regression test:** "Phase 5 AC3.1: the focus leaves a screen in the same moment as the
screen" clicks "Continue" on the pause menu and reads the state in the same task, so no frame
can pass in between. Before the fix it got `focus: "Press A to continue"` with `paused: false`
every time; now `null`.

## 2. Phase 5 AC3.7: B followed by a browser Back acted twice

**Seen:** timeout on `waitForFunction(() => !paused)` (main at 6e0408a).

**Cause:** `BackGuard` pairs a browser Back with a B press if the `popstate` comes within
`BACK_PAIR_MS` (150 ms) of the poll that saw B, measured in wall-clock time. The `popstate`
is a task, so it waits until the frame in which the poll saw B has finished drawing. Under
software WebGL a frame can take several hundred milliseconds; the Back then came more than
150 ms after the poll although nothing happened in between. B continued the game, the
"unpaired" Back paused it again at once, and the test, which polls once per frame, never saw
the short unpaused moment. A real device with a slow frame (a big edit, a phone under load)
could do the same: one press, pause menu still there.

**Fix:** the guard also counts frames (`update()` once per frame). A Back is paired with B if
it comes within `BACK_PAIR_MS` **or** before the end of the frame after the B frame
(`BackGuard.pairedWithPadBack`). At 60 fps that is about 33 ms, inside the 150 ms anyway, so
fast devices behave as before; a slow frame no longer counts against the window.

**Tests:** `src/game/backGuard.test.ts` (unit, with a fake clock and fake history: pairing
on a fast device, after 400 ms frames, and a Back two frames and 150 ms later that acts).
The new e2e test "Phase 5 AC3.7: B and a browser Back held up by a slow frame act once"
busy-waits 600 ms after the poll that saw B before calling `history.back()`; before the fix it
timed out at the same line as on CI, now it passes.

## 3. Phase 5 AC6.3: the second craft pressed "Close"

**Seen (this container, 4 of 5 runs; not seen on CI):** line 381 expects 4 sticks after A on
"Craft Stick" and gets 0.

**Cause (in the test):** the test empties the inventory (`clearInventory`) and then gives
two planks and a log, in two separate page calls. With an empty inventory no row has a
"Craft" button, so a frame in between rightly moves the focus to the nearest focusable
element, "Close"; it does not jump back when the button returns. A then closed the
inventory. Whether a frame fell between the two calls depended on timing: with slow frames
(CI) it rarely did, with fast frames (this container) almost always. A probe showed the
focus on "Close" right before A in every failing run.

**Fix:** after the planks are back the test moves the focus onto "Craft Stick" again
(`focusOn`) and checks it is there before pressing A. What the step checks (the craft makes
the button go, the focus moves to the nearest one) is unchanged.

## 4. Phase 5 AC2.2: the right stick turned more than half a turn

**Seen (this container, 2 of 5 runs):** after "turn right" the yaw was about +2.7 to +3.1
instead of below −0.01.

**Cause (in the test):** the yaw is kept in (−π, π]. The right stick turns by
3 rad/s × frame time for as long as it is out, and the test put it out and back with two
separate calls (`stick`, `polls(page, 3)`, `stick`). The time in between is round trips
between Playwright and the page, which a busy machine stretches past a second; the player
then turned by more than π and the yaw wrapped to a positive value. Slow frames do the same
(each frame turns up to 0.75 rad, and the two calls span at least five polls).

**Fix:** `Pad.stickFor(which, x, y, count)` (`e2e/gamepad.ts`) puts the stick out for
exactly `count` polls inside one page call, the way `tap` holds a button for one poll. The
test turns and looks up with `stickFor(…, 3)`: at most 3 × 0.75 rad, which cannot wrap. The
part that holds the stick up until the pitch limit is unchanged.

## How it was reproduced and checked

- A local-only fixture (not committed) ended every animation frame with a 300 ms busy wait.
  With it the old build failed the original AC3.7 test 3 of 3 times at line 420, exactly as
  on CI; the fixed build passed 6 of 6 runs of AC3.1 and AC3.7. CPU throttling through the
  DevTools protocol was tried first and only ran the container out of memory.
- Both new e2e tests fail on the old build and pass on the new one.
- Stability: `e2e/gamepad.spec.ts`, `e2e/gamepadMenus.spec.ts` and
  `e2e/gamepadInventory.spec.ts` with `--repeat-each 5 --workers 2`. The first run (after
  fixes 1 and 2) gave 184 passed, 6 failed: every run of AC3.1, AC3.7 and the two new tests
  passed, and the 6 failures were two other tests that fail the same way on the old build
  in this container (old build, 5 runs each: AC6.3 5 failed, AC2.2 1 failed). With the
  owner's agreement they were fixed too (sections 3 and 4); result of the second run: see
  "Stability" below.

## Stability

Second run, after all four fixes: the three controller files with `--repeat-each 5
--workers 2` (38 tests × 5): **190 passed, 0 failed** (11.4 minutes). AC6.3 also passed
2 of 2 and AC2.2 2 of 2 with 300 ms frames (the local slow-frame fixture).

## Known issues

- **This cloud container's Chromium logs "GPU stall due to ReadPixels"** as a console warning
  in every e2e test (WebGL on SwiftShader over Vulkan), which `e2e/fixtures.ts` turns into a
  failure for every test, also for tests unrelated to the controller. CI installs its own
  browser and is not affected. For the local runs above that one message was allowed in a
  local, uncommitted change to `fixtures.ts`; the committed fixture is unchanged. If a later
  session sees the same, it is the container, not the game.
- A Back that the browser delivers _before_ the poll that sees the same B press is still not
  paired (the guard only knows of B once the poll saw it). No test or device report shows it;
  it was not part of this fix.
