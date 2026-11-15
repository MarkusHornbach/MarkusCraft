# Phase 4 part P plan – Performance test run

Part P of Phase 4, between parts A and B (overview: [`phase-4-plan.md`](phase-4-plan.md)).
Read `CLAUDE.md`, `docs/phase-4a-report.md` ("Decisions and deviations", "Performance")
and `docs/device-tests.md` first. This plan is executed autonomously in one cloud session:
do not ask the owner questions. Where this plan leaves a detail open, choose the simplest
option and note it in `docs/phase-4p-report.md`.

Tests name their acceptance criterion in the title as "Phase 4P AC1.1".

## 1. Goal

The owner starts one standardized test run by hand on a device (computer, Android phone,
Android tablet). The run plays fixed scenarios by itself, judges them with a traffic light
and hands the numbers to the repository as a pre-filled GitHub issue: the owner only
presses "Submit". Later sessions read these issues and compare devices and builds.

The run answers the question Part A left open: no frame rate was ever measured on a real
device, and loading costs 50–65 % more with light than without. Its result decides about
Part C (Web Workers).

Nothing about the game itself changes: no optimisation, no change to gameplay, light or
rendering.

## 2. Decisions made with the owner

| Topic            | Decision                                                                                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Placement        | Phase 4 part P with its own plan (this file) and report (`docs/phase-4p-report.md`). Part B needs P's report and adds a scenario; Part C is decided by P's results                                                                   |
| Start            | A button "Performance test" in the world menu and the link `?bench=1` both lead to one start page with hints and a "Start" button. Nothing is measured before that tap                                                               |
| World            | A throwaway Creative world in memory, seed 1337, noon, clock frozen, default settings. No world is ever stored; the player's stored settings are not changed                                                                         |
| Scenario unit    | A scenario is a fixed number of simulation steps with scripted input, driven by the real game loop: the same route and the same chunks on every device. Wall time is measured, not prescribed                                        |
| Judging          | Absolute thresholds on each run's own numbers. There is no comparison with a version before light: that baseline was never measured and light is deployed                                                                            |
| Display rate     | The refresh rate is estimated in the standing scenario and recorded. Lights use frame times in milliseconds, never FPS against a device's cap                                                                                        |
| Throttling       | The first scenario runs once more at the very end. If it is clearly slower, the result says "device slowed down during the run"                                                                                                      |
| Disturbance      | Tab hidden, portrait, a resize or leaving fullscreen stops the run at once: "Interrupted – nothing was recorded", with "Start again". No partial results                                                                             |
| Results          | A pre-filled GitHub issue (label `perf-run`, title starting "Performance run:") with a table for people and a JSON block for sessions. Plus "Copy result", and the last result is kept in the browser until the next run replaces it |
| Public data      | The repository is public, so issues are. The issue has user agent, GPU name, screen, cores and memory; the result screen shows the exact text before anything leaves the device                                                      |
| Raw data         | Two histograms per scenario (frame times, chunk work per frame), so later sessions can judge old runs with new thresholds                                                                                                            |
| Web Workers line | One overall line "Web Workers (Part C): recommended / borderline / not needed", decided only by a run in touch mode at render distance 5                                                                                             |
| CI               | The same run in a shortened form (`?bench=quick`) is an ordinary Playwright test. Its numbers mean nothing; it proves the run completes and produces a valid issue                                                                   |

## 3. Changes to the original scope

The owner's starting scope was challenged during planning. Agreed changes:

| #   | Change                                                                                                                                                                  | Reason                                                                                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The decision rule no longer compares with a baseline before light (PERF-1). The run is judged by absolute thresholds                                                    | Part A is merged and deployed and PERF-1 was never filled in: the baseline cannot be measured any more. Workers help or not whatever caused the cost                                                                       |
| 2   | Scenarios are counted in simulation steps, not in seconds                                                                                                               | A slow device simulates at most five steps per frame and falls behind: in "20 seconds of flying" it would cover less ground and load fewer chunks than a fast one, and the loading numbers could not be compared           |
| 3   | Lights use frame times (p99, long frames), and the estimated refresh rate is recorded; "average FPS" is shown but judges nothing                                        | Displays cap at 60, 90 or 120 Hz, so the same FPS means different things on different devices                                                                                                                              |
| 4   | Added: the standing scenario is repeated at the end as a throttling check                                                                                               | Phones heat up within minutes and slow down. Without the check the late scenarios (render distance 8) look worse than they are and nobody can tell                                                                         |
| 5   | `?bench=1` does not start the run by itself; it opens a start page with a "Start" button                                                                                | Fullscreen on touch devices and telling mouse from touch need a real tap, as the play button does                                                                                                                          |
| 6   | A disturbed run is thrown away as a whole instead of being marked invalid                                                                                               | "Clearly invalid" is simplest when no invalid issue can exist                                                                                                                                                              |
| 7   | Added: "Copy result" and keeping the last result in the browser's local storage                                                                                         | The issue route fails if the owner is not logged in on the phone or the phone discards the game tab while GitHub is open; a run of four minutes would be lost. "Never saves anything" now means: no world, one result text |
| 8   | Added: the title prefix "Performance run:" next to the label                                                                                                            | A link can only attach a label that exists, and sessions cannot create labels. The owner creates `perf-run` once (section 10); without it issues are still found by title                                                  |
| 9   | Added: histograms of frame times and of chunk work per scenario                                                                                                         | "Regularly above 30 ms" becomes an exact share of frames, and thresholds can be changed later without repeating runs                                                                                                       |
| 10  | "How far loading lags behind" is measured as the distance to the nearest chunk without a mesh, next to the count of pending chunks; plus the catch-up time after flying | The pending count depends on the render distance and says little about what the player sees. The distance is what shows as "the world ends over there"                                                                     |
| 11  | Added: the overall line about Web Workers, decided only in touch mode at render distance 5                                                                              | The Phase 4 plan's rule says "on the phone"; 5 is the touch default. A weak laptop at distance 8 must not trigger Part C                                                                                                   |
| 12  | Added: `?bench=sample` shows the result screen with a built-in sample result                                                                                            | A real result has different numbers every time; reference screenshot and layout tests need a fixed one                                                                                                                     |
| 13  | Added: `scripts/perfRuns.ts` prints a comparison table from saved issue bodies (first on the cut list)                                                                  | "Later sessions compare runs" should not start with writing a parser again                                                                                                                                                 |

Clarifications, stated so nobody is surprised:

- **The run needs GitHub in the same browser.** On the phone and the tablet the owner must
  be logged in to GitHub in Chrome once. Otherwise GitHub shows its login page first; the
  pre-filled text usually survives that, and "Copy result" is the way out if it does not.
- **A run takes three to four minutes** on a device that keeps up, longer on one that
  does not (a scenario is cut off at three times its nominal duration and counts as red).
- **Numbers of different builds are comparable only with the same suite version.** A
  scenario that changes gets a new version; a new scenario leaves the old ones comparable.
- **Software WebGL numbers are meaningless**, in CI and in cloud sessions. Never judge
  performance from them.

## 4. Out of scope (do not build)

Web Workers or any optimisation; a change to `CHUNK_BUDGET_MS`, to gameplay, light,
rendering or the chunk pipeline (one read-only getter on the chunk manager is the
exception, section 5.4); a server, any upload without the owner's click, tokens or
credentials in the client, the GitHub API from the client; a comparison of several runs
inside the game; automating tests of feel and usability; iPhone and iPad; a new runtime
dependency; the night-with-torches scenario (Part B adds it); changes to `PerfStats` or to
what the debug overlay shows; running the test in Gathering mode.

## 5. Specification

All numbers are starting values in `src/game/config.ts` (prefix `BENCH_`) and may be
tuned by the implementing session; record changes in the report. Thresholds of the lights
(5.6) are part of what the owner agreed to: change them only by the rule in section 8.

### 5.1 Architecture

```
src/bench/           pure, in the coverage scope and under the no-three/no-DOM lint rule:
  scenarios.ts       the scenario table (id, version, steps, script) and the suites
  benchStats.ts      collects the frames of one measurement window: sums, exact p99,
                     histograms
  verdict.ts         numbers → lights, the throttling flag, the Web Workers line
  benchReport.ts     the result record; → JSON, → issue text, → issue URL; parse and
                     validate (never throws)
  BenchRunner.ts     the state machine of a run; time and the game come in as parameters
src/game/benchEnv.ts reads the environment record from the browser (shell)
src/ui/BenchScreen.ts start page, progress line, result screen, interrupted screen
```

- `BenchRunner` talks to the game through a small interface that `Game` implements
  (`BenchHost`): load a fresh world at a render distance, set the player, set the scripted
  input, submit an action, and read `simSteps`, `chunksIdle`, pending chunks and the
  distance to the nearest missing mesh. The runner is tested in Node with a fake host.
- `Game` calls `runner.frame(nowMs, frameMs, chunkWorkMs)` once per rendered frame, with
  the same two values it gives to `PerfStats`. `PerfStats` itself is not changed.
- Scripted input goes through `Input` (`setMove`, `setHeld`, look angles through
  `setPlayer`), edits through `session.submit`: the run uses the real physics, the real
  action layer and the real chunk pipeline. During a run `Input` ignores keyboard, mouse
  and fingers, as it does while the inventory is open; the touch controls are `covered`.
- A run never asks for the pointer lock. In touch mode it runs in fullscreen.

### 5.2 Start, modes and URL parameters

- World menu: a button "Performance test" below the world list, reachable by mouse and by
  finger.
- `bench=1` (without `test=1`): the page opens on the start page instead of the world
  menu. `bench=quick`: the same with the quick suite (5.3). `bench=sample`: the result
  screen with a built-in sample result; no run. With `test=1` the parameter is ignored.
- **Start page.** Title "Performance test"; hints: "Takes about 4 minutes", "Plug in the
  charger", "Close other apps and tabs", "Switch battery saver off", "Do not touch the
  screen during the test", "The result can be sent as a public GitHub issue"; buttons
  "Start", "Show last result" (only if one is stored) and "Back" (to the world menu).
- **Start.** The pointer type of the tap on "Start" selects mouse or touch mode exactly as
  a play button does (`touch=1` and `pointer: coarse` count as before); touch mode enters
  fullscreen inside the tap and gets its pixel ratio cap. The page requests a screen wake
  lock (`navigator.wakeLock`, where it exists) and releases it when the run ends.
- **During the run** the normal view is shown with the HUD, without debug overlay, with
  one line "Performance test – scenario 3 of 9: flying" and a "Cancel" button (`Esc` on
  the computer). Cancel leads back to the start page; nothing is recorded.
- **Settings.** The run uses the default settings (field of view, Brightness) and its own
  render distances. It neither reads nor writes the stored settings, creates no world
  record, and takes no world lock.

### 5.3 Scenarios (suite version 1)

The full suite runs the block below at render distance 5, then at 8, then `stand` once
more at 5: nine measured scenarios. Each block starts with a **fresh world** (seed 1337,
generator version 1, Creative, noon, frozen clock), so both distances start from the same
state and the time until ready is comparable.

| Id      | Steps | What happens                                                                                                                                                                                               |
| ------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stand` | 600   | Stand at the start point, looking along a fixed direction                                                                                                                                                  |
| `walk`  | 1 200 | Walk and sprint on the ground along a fixed heading with jump held, from a fixed start position                                                                                                            |
| `fly`   | 1 200 | Fly mode, fixed height above all terrain on the route, sprint-fly straight (20 blocks per second, about 400 blocks, 25 chunks), looking slightly down. Then stop and wait until all chunk work is done     |
| `edit`  | 900   | Hover at a fixed place and submit one `place` or `break` every 6 steps (150 actions): a slab across a chunk corner is built and taken away again, cell by cell, so that light changes reach several chunks |

- Before each scenario: put the player in place, wait until the chunks are idle, then 120
  steps of warm-up with the scenario's own input. Only the steps after that are measured.
- **Time until ready** is measured once per block: from loading the fresh world until all
  chunks of the render distance are meshed.
- **Catch-up time** is measured after `fly`: from the stop until the chunks are idle.
- Start position, heading, height and the cells of `edit` are constants chosen by the
  implementing session with a Node script or test on seed 1337 and pinned by AC1.2–AC1.4.
- **Cut-off.** A measurement window that takes longer than three times its nominal
  duration (steps ÷ 60 s) is ended; the scenario is marked `cut` and is red. Waiting for
  idle chunks is limited to 120 s; after that the run goes on and the scenario is `cut`.
- **Versions.** `BENCH_SUITE_VERSION` is 1. Every scenario has its own version (1). A
  change to a scenario's script, steps or warm-up raises that scenario's version; adding
  a scenario or changing the order raises the suite version. Both are in every result.
- **Quick suite** (`bench=quick`): the same scenarios and order at render distance 2 and
  3, with a twentieth of the steps (at least 20) and 6 warm-up steps. Results carry
  `quick: true`, the title starts "Performance run (quick):", and the Web Workers line
  reads "not a measurement".
- **Extending.** A scenario is one entry in the table of `scenarios.ts` plus its script (a
  function from the step number to input and actions). Part B adds `torches` this way.

### 5.4 What is measured

Per rendered frame inside a measurement window the runner records: the frame time (the
difference of the `requestAnimationFrame` times), the chunk work of the frame, the number
of pending chunks, and the **distance to the nearest missing mesh**: the Chebyshev
distance in chunks from the player's chunk to the nearest chunk inside the render distance
that has no mesh, or render distance + 1 if there is none. `ChunkManager` gets one
read-only getter for it (pure, unit-tested); it is called only during a run.

Per scenario:

| Number             | Meaning                                                                    |
| ------------------ | -------------------------------------------------------------------------- |
| `ms`, `frames`     | Wall time and frames of the window                                         |
| `fps`              | frames ÷ time (shown, judges nothing)                                      |
| `p99`, `max`       | 99th percentile (exact, from all frame times) and longest frame time, ms   |
| `long`             | Frames longer than `LONG_FRAME_MS` (33 ms)                                 |
| `cwAvg`, `cwMax`   | Average and largest chunk work per frame, ms                               |
| `cwOver`           | Frames whose chunk work exceeded `BENCH_CHUNK_WORK_LIMIT_MS` (30 ms)       |
| `lagAvg`, `lagMin` | Average and smallest distance to the nearest missing mesh, chunks          |
| `pendMax`          | Largest number of pending chunks                                           |
| `catchUpMs`        | `fly` only                                                                 |
| `heap`             | `performance.memory.usedJSHeapSize` at the end, MB; null where unsupported |
| `fh`, `ch`         | Histograms: frames per bucket of frame time, and of chunk work             |
| `cut`              | The window was cut off                                                     |

Histogram bucket edges (ms): frame time 9, 12, 17, 22, 33, 50, 100, 250 (nine buckets);
chunk work 1, 2, 4, 6, 8, 12, 16, 30, 50, 100 (eleven buckets). The edges are in the
result, so they may change with a new format version.

Per run: format version, suite version, `quick`, build commit, date (UTC, ISO), time
until ready per render distance, the throttling flag, the Web Workers line, and the
environment: user agent (cut to 200 characters), WebGL renderer (through
`WEBGL_debug_renderer_info` where available), screen size in CSS pixels, device pixel
ratio, the pixel ratio in use, canvas size in pixels, input mode, `hardwareConcurrency`,
`deviceMemory` (null where unsupported), the estimated refresh rate (1000 ÷ median frame
time of the first `stand`, rounded to a whole number), whether the wake lock was granted.

**Build commit.** `vite.config.ts` defines `__BUILD_COMMIT__`: the first seven characters
of `GITHUB_SHA` in Actions, otherwise of `git rev-parse HEAD`, otherwise `dev`.

### 5.5 When a run is thrown away

From the tap on "Start" until the result screen, any of these ends the run with the
screen "Interrupted – nothing was recorded" (with the reason, "Start again" and "Back"):

- `visibilitychange` to hidden (tab switched, screen off, app in the background);
- portrait orientation in touch mode;
- a change of the canvas size (window resized, fullscreen left, address bar moved);
- "Cancel".

A lost wake lock alone ends nothing (the page is hidden then anyway). A single very long
frame ends nothing either: it is what the run is there to record.

### 5.6 Lights and the Web Workers line

Per scenario three lights; the scenario's light is the worst of them. `cut` is red.

| Light      | Applies to | Green                             | Yellow                            | Red       |
| ---------- | ---------- | --------------------------------- | --------------------------------- | --------- |
| Smoothness | all        | long frames ≤ 1 % and p99 ≤ 33 ms | long frames ≤ 5 % and p99 ≤ 50 ms | otherwise |
| Loading    | `fly`      | `lagAvg` ≥ render distance − 1    | `lagAvg` ≥ render distance ÷ 2    | otherwise |
| Chunk work | all        | `cwOver` ≤ 0.1 % of the frames    | `cwOver` ≤ 1 % of the frames      | otherwise |

"The largest chunk work regularly above 30 ms" of the Phase 4 plan is the red chunk-work
light: more than 1 % of a scenario's frames.

- **Throttling flag:** the average frame time of the last `stand` is more than 20 % above
  that of the first. The result screen then says "The device slowed down during the run;
  the later scenarios may look worse than they are."
- **Web Workers (Part C)**, only for a full run in touch mode, from the loading and
  chunk-work lights of `fly` and `edit` at render distance 5: **recommended** if one is
  red, **borderline** if one is yellow, otherwise **not needed**. In mouse mode the line
  reads "decided on phones and tablets"; in a quick run "not a measurement".

### 5.7 Result screen, issue and stored result

- **Result screen.** One row per scenario (name, render distance, coloured light with a
  letter G / Y / R so it reads without colour, FPS, p99, longest frame, long frames,
  largest chunk work, loading), the Web Workers line, the throttling note, time until
  ready, and the buttons "Open GitHub issue", "Copy result", "Show text" (the exact issue
  text), "Run again" and "Back". The table scrolls inside the panel on small screens; the
  buttons stay visible.
- **Issue link.** `https://github.com/MarkusHornbach/MarkusCraft/issues/new` with
  `title`, `labels=perf-run` and `body`, opened in a new tab by a real click. The
  repository is a constant in `config.ts`.
  - Title: `Performance run: <touch|mouse>, <width>×<height>, build <commit>`.
  - Body: the Web Workers line and notes, the table of the result screen in Markdown, the
    environment as a short list, then the marker `<!-- markuscraft-perf v1 -->` and one
    fenced `json` block with the whole result record.
  - The JSON is compact: scenarios are rows of numbers under one list of column names,
    numbers are rounded to at most one decimal.
  - **Length.** The whole URL is at most `BENCH_ISSUE_URL_MAX` (7 000) characters after
    encoding. If a result would exceed it, the link carries the body without the JSON
    block and the line "Full data: paste the copied result as a comment."
- **Copy result** puts the full issue text (always with JSON) on the clipboard and says
  "Copied"; where the clipboard is refused, "Show text" lets the owner select it.
- **Stored result.** The last finished result record is written to local storage under
  `markuscraft.lastPerfRun.v1` and replaced by the next finished run. Reading validates
  with the parser of the issue format; a broken entry counts as none. Interrupted runs
  and `bench=sample` store nothing.
- **Reading back.** `parseIssueBody(text)` returns the validated record or null. The same
  function serves the tests, the stored result and `scripts/perfRuns.ts`, which reads
  issue bodies from files (one JSON file per issue, as the GitHub tools return them) and
  prints one comparison table: a row per scenario and render distance, a column per run.

### 5.8 Test API

`getState()` gains `bench`: null outside the test, otherwise
`{ phase: 'start' | 'running' | 'result' | 'interrupted', suite, index, total, scenario,
reason }`. `window.__mc.benchResult()` returns the result record of the result screen or
null. No other test hook: the run is driven by its own buttons.

## 6. Test strategy

The rules of the earlier phases stay in force: unit tests in Node, browser tests against
the production build, state-based waiting, console hygiene, screenshots looked at by eye.

1. **Unit tests** carry the logic: statistics, lights, the report with its round trip and
   its length limit, the runner against a fake host, and the scenario scripts against the
   real pure core (physics, actions, light) in a Node world.
2. **Browser tests** prove the wiring: the quick run from the start page to a valid issue
   link, by mouse and by finger; every way to interrupt; that nothing is stored but the
   last result; the layout at phone size.
3. **Reference screenshots** (text-only, `maxDiffPixelRatio` 0.05): `bench-start` and
   `bench-result` (from `bench=sample`). The image count of the hygiene test goes from 22
   to 24. Regenerate with `--update-snapshots=all` and look at both.
4. **Not automatable:** whether the numbers and lights match what a person sees on the
   device. That is the new entry PERF-5 in `docs/device-tests.md`.

Browser tests of the run work without `test=1` (the real loop) at 1 to 7 frames per
second: keep them to the quick suite, wait on `getState().bench`, give the run test a
timeout of four minutes, and never assert on a measured time or light. The existing
suite must not get more than about two minutes longer.

## 7. Implementation steps

Work in order. After each step: `npm run check:all` passes, commit, push.

### Step 1 – The pure core: scenarios, statistics, lights, report

`src/bench/` with `scenarios.ts`, `benchStats.ts`, `verdict.ts`, `benchReport.ts`; the
lint rule and the coverage scope include the folder; the `BENCH_` constants.

- AC1.1 Unit: `benchStats` gives the numbers of 5.4 for hand-made frame lists: exact p99
  (for 1, 99, 100, 101 and 1 000 frames), longest frame, long frames, chunk-work average
  and maximum, `cwOver`, lag average and minimum, both histograms (a value on an edge
  falls into the upper bucket; the buckets sum to the frame count). It allocates nothing
  per recorded frame.
- AC1.2 Unit, in a Node world of seed 1337 with the real physics: the `walk` script moves
  the player at least 60 blocks from its start and across at least three chunk borders,
  and the player is not in water at the end; two runs give identical positions.
- AC1.3 Unit: the `fly` script moves the player between 380 and 400 blocks in a straight
  line, and its height is at least 8 blocks above the highest block of every chunk it
  crosses.
- AC1.4 Unit, through `applyAction` and a lit Node world: all 150 actions of the `edit`
  script are accepted; at least half of them change light in two or more chunks; after
  the script the blocks equal the blocks before it and `verifyLight()` is 0.
- AC1.5 Unit: the scenario table is pinned (ids, versions, steps, order of the full and
  the quick suite, suite version 1); the quick suite has the same ids in the same order.
- AC1.6 Unit, one test per row and boundary of the table in 5.6: the three lights, `cut`
  is red, a scenario's light is its worst one, the throttling flag at 19 % and 21 %, the
  Web Workers line for touch (red, yellow, green), for mouse and for a quick run; lights
  at render distance 8 never change the line.
- AC1.7 Unit: a result record survives record → issue text → `parseIssueBody` unchanged;
  the parser returns null, without throwing, for 200 seeded damaged texts (cut off,
  fields removed, wrong types, wrong version) and for a text without the marker.
- AC1.8 Unit: for a worst-case result (nine scenarios, every number at its largest
  plausible width, a user agent and GPU name of 200 characters with characters that need
  encoding) the issue URL is at most 7 000 characters and parses back; for an artificial
  result that cannot fit, the URL has the table and the "Full data" line, no JSON, and is
  at most 7 000 characters. The URL names the repository, the label `perf-run` and a
  title starting "Performance run:".
- AC1.9 Unit: the modules of `src/bench/` import neither `three` nor DOM types (the lint
  rule) and never call `Math.random` or `Date.now`.

### Step 2 – The runner and its wiring into the game

`BenchRunner.ts`, the `BenchHost` implementation in `Game`, the getter on `ChunkManager`,
`benchEnv.ts`, the rules of 5.5, the wake lock, `__BUILD_COMMIT__`, the test API of 5.8.
The start is a temporary plain button until step 3.

- AC2.1 Unit (fake host): the runner goes through fresh world → idle → warm-up → window
  for every scenario of a suite in order, measures only the steps of the window, reports
  progress (index, total, scenario), records the time until ready once per block and the
  catch-up time after `fly`, and ends with a complete record.
- AC2.2 Unit (fake host): a window that takes more than three times its nominal duration
  is cut and the run goes on; so is a wait for idle of more than 120 s.
- AC2.3 Unit (fake host): `interrupt(reason)` in every phase ends the run without a
  record; afterwards the runner ignores frames.
- AC2.4 Unit: the getter of the nearest missing mesh gives render distance + 1 when all
  is meshed, the right distance after the centre moved by one, two and five chunks, and
  never changes the manager.
- AC2.5 E2E (`bench=quick`, mouse): started by a click, the run reaches the result
  without a console message; `benchResult()` validates, has nine scenarios in the pinned
  order with `quick: true`, frames > 0 in each, the render distances 2 and 3, a build
  commit, a date, and an environment with user agent, renderer, screen, pixel ratios,
  input mode "mouse" and cores.
- AC2.6 E2E: during the run real keys and mouse movement do not move the player (the
  position after the run equals that of a run without them, within the scripted route),
  and `Esc` cancels.
- AC2.7 E2E, one test per reason: a `visibilitychange` to hidden, a change of the
  viewport size and "Cancel" each lead to `phase: 'interrupted'` with that reason, and
  `benchResult()` is null. Portrait is tested in touch mode (AC3.4).
- AC2.8 E2E: after a finished quick run the stored settings are byte for byte what they
  were, IndexedDB has no world, and leaving the test shows the world menu with the same
  worlds as before; a world opened afterwards starts at the stored render distance.
- AC2.9 E2E: without `bench`, `getState().bench` is null, and all existing browser tests
  and references pass unchanged.

### Step 3 – Screens: start page, progress, result, issue

`BenchScreen.ts`, the menu button, `bench=1 | quick | sample`, "Open GitHub issue",
"Copy result", "Show text", the stored result.

- AC3.1 E2E: the world menu has "Performance test"; it and `?bench=1` both show the
  start page with the hints of 5.2; "Back" shows the world menu. `world-menu` is
  regenerated and looked at.
- AC3.2 E2E (`bench=quick`): the progress line names the scenario and "n of 9" and
  counts up; the result screen has nine rows, each with a light that carries a letter,
  the Web Workers line "not a measurement", and the five buttons.
- AC3.3 E2E: the `href` of "Open GitHub issue" starts with
  `https://github.com/MarkusHornbach/MarkusCraft/issues/new?`, is at most 7 000
  characters long, carries the label and the title prefix, and its decoded body parses
  to exactly `benchResult()`. The test does not follow the link.
- AC3.4 E2E (touch, `TOUCH_DEVICE`, `bench=quick`): a tap on "Start" runs the test in
  touch mode (input mode "touch" and a pixel ratio of at most 1.5 in the record), the
  touch controls take no input, and turning the view to portrait interrupts the run.
- AC3.5 E2E: "Copy result" puts a text on the clipboard that parses to `benchResult()`;
  "Show text" shows the same text.
- AC3.6 E2E: after a finished run and a reload, the start page offers "Show last result"
  and shows the same record; an interrupted run does not replace it; a damaged stored
  entry shows no button and logs nothing.
- AC3.7 E2E (`bench=sample`, 640 × 360 and 1280 × 800, touch): start page and result
  screen fit without scrolling the page; all buttons are visible and have the existing
  minimum touch size; the table scrolls inside its panel at 640 × 360.
- AC3.8 References `bench-start` and `bench-result` created, `world-menu` regenerated,
  all three looked at with the Read tool; the hygiene test counts 24 images.

### Step 4 – Reading results, documentation, pull request

- AC4.1 `npx vite-node scripts/perfRuns.ts <folder>` prints the comparison table for the
  issue files in a folder and skips files that do not parse, naming them. A unit test
  covers the table for two sample records.
- AC4.2 The full suite was run once in the cloud session by a script (not part of the
  test suite); it completes, and the report records its duration and the length of its
  issue URL. Its performance numbers are not reported as findings.
- AC4.3 `docs/device-tests.md` is rewritten as section 9 says; nothing the owner wrote is
  changed; "Last updated" is set.
- AC4.4 `README.md` (the performance test: how to start it, what is sent, that it is
  public), `CLAUDE.md` (structure, the conventions of section 9 of this plan, URL
  parameters, test API, status) and `docs/phase-4p-report.md` are written. The report has
  "How a later session reads the results" (the label, the title prefix, the marker,
  `parseIssueBody`, `scripts/perfRuns.ts`) and "For Part B: adding a scenario".
- AC4.5 Hard rule 1 checked; no token, key or credential anywhere in the client; the
  client makes no network request of its own (an E2E test of the quick run records the
  requests: only the page's own files).
- AC4.6 CI is green on the final commit and one pull request into `main` is open.

## 8. Risks and fallbacks

| Risk                                                                             | Fallback (decide without asking)                                                                                                                                                                             |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The walking route gets stuck (trees, a slope of two blocks, the lake)            | Search headings and start points near the start in Node (AC1.2) and pin the best. As a last step let the script turn at fixed steps. Never help the player with teleports inside a window                    |
| Scripted `place` and `break` are refused (reach, the player's own box)           | Hover within `REACH` of all cells and outside them; choose the cells in Node (AC1.4). Use only valid actions: a refused action in a run is a bug, not noise                                                  |
| The quick run takes too long under software WebGL                                | Shrink the quick suite's steps further (at least 10) or use render distance 2 for both blocks; never shorten the full suite for the sake of CI                                                               |
| The issue URL is too long                                                        | Round harder, shorten column names, cut the user agent to 160 characters. The fallback without JSON (5.7) stays as the last net                                                                              |
| GitHub ignores the label or the body of the link                                 | Nothing to fix in the client. The title prefix and "Copy result" cover it; note it in the report and in PERF-4                                                                                               |
| A light threshold turns out senseless in the cloud run (e.g. loading always red) | Thresholds are the owner's decision: keep them, record the observation and a proposal in the report. Software WebGL is no evidence. A bug in a measured number is fixed, of course                           |
| The resize rule interrupts runs on Android without cause (the address bar moves) | Fullscreen is entered before the first window; compare the canvas size only from the first warm-up on. If it still fires in the emulated tests, ignore changes of less than 2 % and record it                |
| The wake lock is refused or missing                                              | The run goes on; `wake: false` is in the record. A screen that turns off interrupts the run by the visibility rule                                                                                           |
| Measuring disturbs what it measures                                              | No allocation per frame (AC1.1), the getter of the nearest missing mesh stops at the first hit, the progress line changes only between scenarios                                                             |
| Wiring into `Game.ts` (1 580 lines) breaks the start flow of the menus           | The run is a screen of its own next to menu, game and pause; reuse `loadWorld` and `setMode` unchanged. AC2.9 guards the rest                                                                                |
| The part runs out of room                                                        | Cut in this order and record it: `scripts/perfRuns.ts` (AC4.1), "Show text", the heap number, `bench-start`. Never cut: the interrupt rules, the round trip and length tests, the quick run in CI, section 9 |

## 9. `docs/device-tests.md` and conventions that stay

Rewrite section 1 of `docs/device-tests.md` (step 4):

- **PERF-4** (4P): "Run the performance test (world menu → 'Performance test', or the
  bookmark `…/?bench=1`) with the charger in and other apps closed. On the result screen
  press 'Open GitHub issue' and submit it. _PC, Phone, Tablet._ Result: (issue numbers)".
  With the note that the label `perf-run` must exist once and that the browser must be
  logged in to GitHub.
- **PERF-5** (4P): "Watch one run on the phone: does what you see match the lights (a
  visible stutter where a light is red, smooth where it is green; does terrain appear
  late in the flying scenario where 'Loading' is yellow or red)? Result:". It checks the
  thresholds against a person's eye.
- **PERF-1** and **PERF-2** move to "Obsolete" with their empty tables removed (the owner
  wrote nothing into them) and the reason: the baseline before light can no longer be
  measured; the numbers of PERF-2 are taken by the performance test (PERF-4).
- **PERF-3** stays: render distance 16 is not part of the run.
- The section's introduction says what decides about Part C: the Web Workers line of the
  phone's run, and the owner's own impression (PERF-5).

Conventions for `CLAUDE.md` (step 4 writes them out):

- Performance on real devices is measured by the performance test and reported as issues
  with the label `perf-run`; a session reads them with the GitHub tools, saves the bodies
  and uses `parseIssueBody` or `scripts/perfRuns.ts`. Numbers from software WebGL are
  never evidence.
- A phase part that adds something with a cost of its own (a new kind of block, creatures,
  workers) adds a scenario; a changed scenario gets a new version; old versions' results
  are not compared with new ones.
- The test must stay free of side effects: no world stored, stored settings untouched.

## 10. For the owner

Once, before the first run:

1. Create the label **`perf-run`** in the repository (Issues → Labels → New label). Without
   it the issues arrive without a label and are found by their title only.
2. Log in to GitHub in Chrome on the phone and on the tablet.
3. Bookmark `https://markushornbach.github.io/MarkusCraft/?bench=1` (or the address the
   game is deployed at) on each device.

Then, per device: charger in, other apps closed, start the test, leave the device alone
for about four minutes, press "Open GitHub issue", press "Submit".

## 11. Notes for parts B and C

- **Part B** adds the scenario `torches` (midnight, torches placed and broken by scripted
  actions along a fixed line, then walking past them), raises the suite version to 2 and
  adds the row to the result screen; its report says how the new scenario compares on
  the cloud machine only in terms of "runs and completes". The manual items of Part B
  about hitches when placing torches stay as tests of feel.
- **Part C** is started by the owner when a phone's run says "recommended" (or by their
  own judgment). Its before-and-after measurement (Phase 4 plan AC11.1, AC11.3) is two
  runs of this test on the owner's phone, one issue each; the record then also carries
  whether workers were on (`workers=0` runs the test on the main-thread path).
