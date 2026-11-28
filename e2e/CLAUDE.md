# e2e/ — Playwright browser tests

The test API (`window.__mc`, URL parameters, `getState()` fields) and the procedures for
references and the performance test are in `docs/testing.md`.

## Files

- `fixtures.ts` (fails any test whose page logs a console error or warning), `game.ts`
  (opens the game and wraps the test API), `e2e/helpers.ts` (measures pixels), `touch.ts`,
  `gamepad.ts` (the fake controller), `sites.ts` (tree, beach and rock near the start
  point), `lightScenes.ts` (tunnel, room with a window, roof over a chunk corner),
  `recipeRows.ts` (recipe rows that never move), `chests.ts` (a chest ahead, the chest
  screen's slots), `screenshots/`
- `multiplayer.ts` (several players in their own contexts, `netQuery`, `openNetTest`,
  `openTestPlayer`, `hostRoom`, `joinRoom`, `untilNet`), `mp*.spec.ts` (tests with several
  game pages; project `multiplayer`; `mpHarden.spec.ts`: overlay, host without frames,
  soak, large world; `mpFigure.spec.ts`: the figure of others), `playerSection.spec.ts`
  ("Your player"), `leaves.spec.ts` ("Collide with leaves"), `shards.json` (spec lists per
  CI shard)

## Rules

- Tests wait on game state (`__mc.isReady()`, `__mc.whenIdle()`), never on fixed sleeps.
  In test mode the simulation only advances through `__mc.step(n)`; rendering and chunk
  loading keep running. Tests without `test=1` cover the start screen and the real loop.
- **This cloud container's Chromium** logs "GPU stall due to ReadPixels" in every test
  (CI's browser does not). Run the browser tests here with `MC_CONTAINER_GPU_STALL=1`,
  which allows exactly that message (`ALLOWED_CONSOLE` in `e2e/fixtures.ts`); CI runs
  without it.
- Run the browser suite alone: a build or `npm run check` in parallel makes menu tests
  time out. The full e2e run takes about an hour in a cloud session and runs in CI; locally
  run the affected specs, long commands in the background.
- Without `test=1` the page starts in the world menu and `?seed=` only pre-fills the "New
  world" form. Such tests use `openMenu`, `createWorld`, `pauseWithMouse` and
  `backToWorlds` from `e2e/game.ts`. `openMenu` stores a render distance of 2 first: three
  parallel browsers with software WebGL render at only 1 to 7 frames per second, so keep
  these tests light and never assert on wall-clock time without taking the best of several
  rounds. The "New world" form is reset when the list of stored worlds arrives:
  `WorldMenu` sets `data-ready` then, and `openMenu` waits for it. `createWorld` chooses
  Creative unless told otherwise.
- Every visual feature gets both a rule-based assertion (measurable pixel or state facts)
  and, where useful, a reference screenshot comparison (`e2e/screenshots/`). Text-only
  reference screenshots use `maxDiffPixelRatio` 0.05, which is loose enough to miss a whole
  button: after changing a menu, regenerate with `--update-snapshots=all` and look at the
  result. After changing anything visual, open the produced screenshots with the Read tool
  and judge them by eye. World references: `docs/testing.md`, "Regenerating references of
  the world".
- A test that changes blocks should end with `verifyLight()` being 0. Brightness of pixels
  is compared as gamma-encoded values (`meanLuminance`) or as linear light
  (`linearBrightness`); say which. Light scenes are built by `e2e/lightScenes.ts`.

## Touch tests

Touch tests run in contexts with `hasTouch` and `isMobile` (`test.use(TOUCH_DEVICE)` from
`e2e/touch.ts`). `Fingers` sends several fingers through the DevTools protocol
(`touchDown`, `touchMove`, `touchUp` with a finger id) and returns only once the page has
seen the event; Chromium delivers touch moves with its next frame. `Fingers` therefore
hangs on a gesture the browser takes over for scrolling; use `swipe` from `e2e/touch.ts`
for those (`swipe` takes a `rest` callback for a finger that rests before it moves).
Behaviour tests use `openTouchGame` (`test=1&touch=1`, fixed 960 × 540 view); layout tests
run without `test=1` at 640 × 360 and 1280 × 800. A look drag is applied by the next
rendered frame: wait with `whenIdle` before reading the angles. A vertical finger drag
that starts on the inventory overlay is a scroll gesture for the browser and cancels the
touch; tests drag sideways there.

## Recipe-list tests

Rows are in table order, so a row further down (furnace rows, the torch) must be scrolled
to; `e2e/recipeRows.ts` walks the list through the states that must not move a row. A held
"Craft" crafts first after 30 steps, then every 15.

## Controller tests

Controller tests call `installFakePads(page)` (`e2e/gamepad.ts`) before `goto`; the `Pad`
helpers, `stickFor` and `focusOn` are described in `docs/testing.md`, "Controller". Menu
tests read `getState().ui.focus`; a focus move is one `tap` of the D-pad.

## Tests with several game pages

Files named `mp<Name>.spec.ts`. They run in the Playwright project `multiplayer` with one
worker, next to the `game` project: with more software-rendered pages at once, WebRTC
connections between them starve on a 4-core machine and take more than 15 s. They use
`test` from `e2e/multiplayer.ts`: `players.open()` makes a player in its own browser
context with the console checks. Playwright starts the local PeerJS server
(`npm run signal`, `127.0.0.1:9000`, discovery on) next to the preview server; pages pass
`netQuery()` (`signal=http://127.0.0.1:9000/&stun=none`). Room tests use `openTestPlayer`
(test mode, seed 1337, noon, frozen, the local server), `hostRoom`, `joinRoom` (waits until
the guest's world is ready), `joinError` and `untilNet`. Room codes in tests must use the
code alphabet (no I, O, 0, 1).

## Multiplayer tests

Every build's ids carry its build id, so tests running alongside see each other's
devices: a test that needs a list of only its own devices (the `net-test` reference)
starts a PeerJS server of its own on another port (`ownServer` in `e2e/netTest.spec.ts`)
and closes its pages before stopping it. A test whose page reaches a closed port or a
server without discovery allows exactly the message Chromium itself logs for it
(`allowConsole`). Tests whose pictures show a figure or a head icon fix the look with
`look=`. A guest in Gathering whose breaks are timed steps with `stepPaced(page, n)` (no
faster than real time). The `net` test API: `docs/testing.md`, "Multiplayer".

Before changing the touch tests read the "Decisions and deviations" of
`docs/phase-2a-report.md`; for the multiplayer tests `docs/phase-6a-report.md` and
`docs/phase-6b-report.md`.
