# Phase 4 part P report – Performance test run

Plan: [`phase-4p-plan.md`](phase-4p-plan.md). Tests on real devices:
[`device-tests.md`](device-tests.md), PERF-4 and PERF-5.

## What was built

The game can now measure itself. "Performance test" in the world menu, or `?bench=1`,
opens a start page; "Start" plays nine fixed scenarios in a throwaway world, judges them
with traffic lights and offers the result as a pre-filled GitHub issue.

- **Scenarios** (`src/bench/scenarios.ts`, suite version 1): `stand` (600 steps), `walk`
  (1 200), `fly` (1 200) and `edit` (900) at render distance 5, the same four at 8, then
  `stand` once more at 5. Each block starts in a fresh Creative world of seed 1337 at
  noon with the clock stopped. Scenarios are counted in simulation steps, so every device
  walks and flies the same route.
- **The runner** (`src/bench/BenchRunner.ts`) is a state machine without browser code:
  load the world, wait for idle chunks, warm up, measure, and after flying wait until the
  chunks have caught up. `Game` implements its small interface (`BenchHost`) with the real
  loop, physics, action layer and chunk pipeline.
- **Numbers** per scenario (`benchStats.ts`): wall time, frames, FPS, exact 99th
  percentile and longest frame, long frames, chunk work (average, largest, frames above
  30 ms), the distance to the nearest missing mesh (average, smallest), the largest number
  of pending chunks, the catch-up time after flying, the heap, and two histograms.
- **Lights** (`verdict.ts`): smoothness, loading (flying only) and chunk work per
  scenario with the thresholds of the plan, the throttling flag, and the line about Web
  Workers, which only a full run in touch mode decides.
- **Result** (`benchReport.ts`): one record, written as an issue text (verdict, table,
  environment, then a marker and compact JSON), as a link to a pre-filled issue with the
  label `perf-run`, and read back by `parseIssueBody`. "Copy result", "Show text", and
  the last finished result kept in the browser.
- **What throws a run away:** a hidden page, portrait in touch mode, a changed canvas
  size, "Cancel" or Esc. The screen then says "Interrupted – nothing was recorded".
- **No side effects:** no world is stored, no world lock taken, the stored settings are
  neither used nor changed.
- **Tools:** `scripts/benchRun.mjs` plays a suite in headless Chromium,
  `scripts/perfRuns.ts` prints a comparison table from saved issues.

Nothing about the game itself changed: no optimisation, no change to gameplay, light,
rendering, the chunk pipeline or `PerfStats`.

## Acceptance criteria

| Criteria      | Where                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------- |
| AC1.1         | `src/bench/benchStats.test.ts`                                                                  |
| AC1.2 – AC1.5 | `src/bench/scenarios.test.ts`                                                                   |
| AC1.6         | `src/bench/verdict.test.ts`                                                                     |
| AC1.7, AC1.8  | `src/bench/benchReport.test.ts`                                                                 |
| AC1.9         | `src/bench/purity.test.ts` and the lint rule for `src/bench/**`                                 |
| AC2.1 – AC2.3 | `src/bench/BenchRunner.test.ts`                                                                 |
| AC2.4         | `src/world/ChunkManager.test.ts`                                                                |
| AC2.5 – AC2.9 | `e2e/bench.spec.ts`; AC2.9 also by the unchanged existing suite                                 |
| AC3.1 – AC3.8 | `e2e/bench.spec.ts`, references `bench-start`, `bench-result`, `world-menu`                     |
| AC4.1         | `scripts/perfRuns.ts`, `src/bench/compare.test.ts`                                              |
| AC4.2         | See "The full suite in the cloud session" below                                                 |
| AC4.3, AC4.4  | `docs/device-tests.md`, `README.md`, `CLAUDE.md`, this report                                   |
| AC4.5         | The run test records all requests (only the page's own files); no key or token is in the client |

## Decisions and deviations

1. **The start values of the scenarios** were found by a search in Node on seed 1337 and
   are pinned by the tests:
   - `walk` starts at the start point (−0.5, 57, 4.5) heading 165° (south, slightly east)
     with forward, sprint and jump held. It covers 80 blocks in the window, crosses six
     chunk borders and never touches water. The player bumps into steps and trees on the
     way (jump is held for that); the route is the same every time.
   - `fly` goes north (−Z) from above the start point at height 100. The highest block
     under the route is at 86, so the clearance is at least 13 blocks.
   - `edit` hovers at (0, 70, 0), the corner of four chunks, looking down. The slab is
     the 75 cells nearest to the corner out of 8 × 10, two blocks below the feet.
2. **`fly` lets go of the keys 20 steps before its window ends** (`BENCH_FLY_STOP_STEPS`).
   The player then stands still when the window closes, the window covers 396.5 blocks
   (AC1.3 asks for 380 to 400), and the catch-up time really starts "from the stop".
3. **`edit` breaks the slab in reverse order** (the outermost cell first). With the same
   order as placing, 74 of the 150 actions changed light in two or more chunks, one short
   of AC1.4; in reverse order it is 80.
4. **Scripted steps are driven by a second call, `runner.step()`**, before every
   simulation step, next to the planned `runner.frame()` per rendered frame. A slow device
   plays up to five steps in one frame; only a per-step call gives every device the same
   input at the same step. For the same reason the runner counts the steps itself instead
   of reading `simSteps` from the host.
5. **Scripted input lives in `Input`** as `setScript(input | null)`. While a script is
   set, `isHeld` and `moveAxes` answer from it and keys, mouse buttons, mouse movement,
   the wheel and the touch source are ignored (the plan's "as while the inventory is
   open"). `Game` additionally ignores `E`, covers the touch controls and does not apply
   look drags.
6. **A window covers whole frames.** It opens with the first frame after the last warm-up
   step and closes with the first frame after its last step, so its wall time is the sum
   of the recorded frame times. On a device that plays several steps per frame the window
   can therefore be up to one frame longer than its steps.
7. **Player in the way of unloaded terrain.** Chunks without data count as solid for the
   physics, as everywhere in the game. A device whose loading falls far behind while
   flying is stopped by the edge of the loaded world; its route is then shorter. That is
   what a player would see on that device, the loading light is red in that case, and it
   is left as it is.
8. **Time until ready is taken three times,** once per fresh world: at render distance 5,
   at 8 and for the last `stand` at 5 again. The last scenario needs a fresh world anyway,
   so that it starts from the same state as the first; its ready time is a second hint at
   throttling and costs nothing.
9. **"Cancel" leads to the "Interrupted" screen** (plan 5.5 and AC2.7), not straight to
   the start page (plan 5.2, which contradicts them). The screen has "Start again" and
   "Back".
10. **A run starts 0.8 s after the tap** (`BENCH_START_DELAY_MS`). Fullscreen settles in
    that time; the canvas size is remembered with the first frame after it and compared
    from then on. A tap on "Start" in portrait is interrupted at once.
11. **The Web Workers line looks at the loading and chunk-work lights only,** as the plan
    words it. A `fly` or `edit` window that was cut off is red as a scenario but does not
    by itself make the line say "recommended"; its numbers still do if they are bad.
12. **The record is rounded when it is built** (times to whole milliseconds, the other
    measured values to one decimal), so that record → text → record is exactly the same
    record. Lights are not stored; they are worked out from the numbers whenever a result
    is shown, so later sessions can judge old runs with new thresholds.
13. **The JSON block is one object** with `cols` (18 names) and `rows`; each row is the
    18 numbers followed by the 9 frame-time buckets and the 11 chunk-work buckets. The
    scenario id is an index into `ids`; "none" is −1 (catch-up time, heap, cores, memory).
14. **The issue link leaves commas, colons, slashes and `@` unencoded.** They are allowed
    in a query as they are, and it saves about a third of the JSON's length. Semicolons
    stay encoded: some servers read them as separators.
15. **The stored last result is the issue text** under `markuscraft.lastPerfRun.v1`, read
    back with `parseIssueBody`. A broken entry counts as none.
16. **`bench=sample` shows a full run in touch mode** with invented numbers that produce
    all three lights, a throttling note and "borderline" (`sampleResult.ts`, build
    "sample").
17. **The button "Performance test" is in both button rows of the world menu** (list and
    "New world" form). A browser without any world shows the form, and the test must be
    reachable there too.
18. **The temporary start button of step 2 was never built.** Steps 2 and 3 were
    implemented together, with the real screens from the start.
19. **`__BUILD_COMMIT__`** is declared in `src/buildInfo.d.ts` and used only in `Game`
    (the shell); the pure core gets the commit and the date through the runner's `info`.
20. **Percentile kept for 16 384 frames.** A window keeps that many frame times for the
    exact 99th percentile (the longest window stays below it even at 240 frames per
    second); beyond it frames still count for everything else.
21. **No starting value of the plan was changed**, and no threshold.

## Reference screenshots

| Reference      | Change                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `bench-start`  | New: title, six hints, "Start" and "Back". Looked at                                             |
| `bench-result` | New: the sample result with nine rows, lights G / Y / R, five buttons. Looked at                 |
| `world-menu`   | Fourth button "Performance test" in the row under the play button; nothing else moved. Looked at |

All other references were regenerated in the same run and are unchanged byte for byte.

## The full suite in the cloud session (AC4.2)

FULL_RUN_TEXT

Its frame times and lights come from software WebGL and are no findings.

## Known issues

- **The issue route depends on GitHub.** Whether GitHub keeps the pre-filled text through
  its login page, and whether it applies the label for someone who may not label issues,
  cannot be tested from here. The title prefix "Performance run:" and "Copy result" cover
  both cases (PERF-4).
- **Android's address bar.** Outside fullscreen a moving address bar changes the canvas
  size and interrupts a run. Touch mode enters fullscreen with the tap on "Start", so it
  should not happen; if runs are interrupted without cause on the phone, the fallback of
  the plan (ignore changes below 2 %) is the next step.
- **Firefox** may log a deprecation note for `WEBGL_debug_renderer_info`; the run and the
  result are not affected.
- **A very slow device** takes much longer than four minutes: a window is cut off at
  three times its nominal duration, a wait for idle chunks after two minutes.

## Tests on real devices

Added to `docs/device-tests.md`: **PERF-4** (run the test on PC, phone and tablet and
submit the issues) and **PERF-5** (do the lights match what you see on the phone).
PERF-1 and PERF-2 moved to "Obsolete"; PERF-3 stays.

## How a later session reads the results

1. List the issues with the label **`perf-run`** with the GitHub tools (`list_issues`
   with `labels: ["perf-run"]`). If the label is missing on an issue, look for titles
   starting **"Performance run:"** (quick runs: "Performance run (quick):"; they are not
   measurements).
2. Save each issue into a folder, one file per issue: the JSON the tool returns (it has a
   `body`) or just the body text. A text from "Copy result" works the same way.
3. `npx vite-node scripts/perfRuns.ts <folder>` prints one table: a row per scenario,
   version and render distance, a column per run, with light, FPS and 99th percentile,
   plus build, date, device, ready times, the Web Workers line and the throttling flag.
   Files without a valid result are named and skipped.
4. For anything else use `parseIssueBody(text)` from `src/bench/benchReport.ts`: it
   returns the validated `BenchResult` or null. The record follows the marker
   `<!-- markuscraft-perf v1 -->` in one fenced `json` block. Lights come from
   `src/bench/verdict.ts` (`scenarioLight`, `smoothnessLight`, `loadingLight`,
   `chunkWorkLight`); the histograms `fh` and `ch` with the edges `frameEdges` and
   `chunkEdges` allow other thresholds without a new run.
5. Compare only runs of the same scenario version; `suite` and each row's `v` are in the
   record. Check `throttled`, `env.input`, `env.hz` and `cut` before drawing conclusions.

## For Part B: adding a scenario

1. Append an entry to `SCENARIOS` in `src/bench/scenarios.ts`: `id` (lower-case letters),
   `version: 1`, `label`, `steps`, `start` (pose and move mode), `input(step, steps)` and
   `action(step, steps)`. Warm-up steps are negative and get input but no actions;
   measured steps count from 0. Actions go through the session, so they must be valid: a
   refused action in a run is a bug.
2. The scenario needs midnight: the test world is created at `BENCH_TIME` (noon) with the
   clock stopped. Give `Scenario` an optional time of day and let `BenchHost.setPlayer`
   (or a new host call) set it; `Game` has `this.time`.
3. `buildSuite` puts every entry of `SCENARIOS` into both blocks by itself. Raise
   `BENCH_SUITE_VERSION` to 2 and update the pinned tables in `scenarios.test.ts`, the
   scenario order in `e2e/bench.spec.ts` (`ORDER`, "of 9" becomes "of 11") and
   `SAMPLE_RESULT` (then regenerate `bench-result`).
4. Choose the cells and the route in Node first and pin them with a unit test like
   AC1.2 – AC1.4 (all actions accepted, `verifyLight()` 0, blocks restored).
5. The row appears on the result screen, in the issue and in `scripts/perfRuns.ts`
   without further work. Whether the Web Workers line should look at the new scenario is
   a decision for the plan of Part B (`workersVerdict` in `verdict.ts`).
6. A torch is not a cube: check that the issue link still fits (`benchReport.test.ts`
   builds a worst case of nine scenarios; make it eleven).

## Suggestions

- After the first real runs: look at the histograms before touching a threshold, and
  record the owner's impression (PERF-5) next to the numbers.
- If phones turn out to be interrupted by small size changes, apply the 2 % rule of the
  plan's risk table.
- Part C can add `workers` to the record with a new format version; `parseIssueBody`
  refuses versions it does not know, so the old parser never misreads a new record.
