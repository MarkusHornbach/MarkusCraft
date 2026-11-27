# src/bench/ — the performance test

Pure core (see "Architecture invariants" in the root `CLAUDE.md`). The screen is
`src/ui/BenchScreen.ts`; `Game` drives a run. How tests and sessions start a run:
`docs/testing.md`, "Performance test".

## Files

- `scenarios.ts` (scenario table, scripts, suites, the guests' script of `players`),
  `simGuests.ts` (`SimRoom`: the simulated guests over the memory transport),
  `benchStats.ts` (numbers of one measurement window), `verdict.ts` (lights, throttling
  flag, Web Workers line), `benchReport.ts` (result record ⇄ issue text, issue link,
  `parseIssueBody`), `BenchRunner.ts` (state machine of a run, `BenchHost`),
  `sampleResult.ts` (what `bench=sample` shows), `compare.ts` (table of several runs)
- Elsewhere: `src/game/perfStats.ts` (pure: frames and chunk work of the last ten
  seconds), `src/game/benchEnv.ts` (browser, GPU and screen for a result),
  `scripts/benchRun.mjs`, `scripts/perfRuns.ts`.

## Performance test

`Game` runs it as a screen of its own next to menu, game and pause (`benchPhase`:
`start`, `running`, `result`, `interrupted`). A run is a `BenchRunner` that `Game` feeds
twice: `runner.step()` before every simulation step (sets the scripted input through
`Input.setScript` and submits the step's action through the session) and
`runner.frame(now, frameMs, chunkWorkMs)` once per rendered frame, with the values
`PerfStats` gets. Scenarios are counted in simulation steps, so every device takes the
same route. While a script is set, `Input` ignores keys, mouse and fingers. The run plays
in a fresh Creative world of seed 1337 (`BENCH_` constants in `config.ts`) with default
settings and its own render distances.

**It must stay free of side effects:** the autosave writes nothing while `Game.bench` is
set, no world lock is taken, the stored settings are neither read into the run nor
written, and the settings in use before come back when it ends. The only thing kept is the
text of the last finished result in local storage (`markuscraft.lastPerfRun.v1`). A hidden
page, portrait in touch mode, a changed canvas size or "Cancel" throws the run away as a
whole.

## Performance results

Performance on real devices is measured by the performance test and reported as GitHub
issues with the label `perf-run` and a title starting "Performance run:". A session reads
them with the GitHub tools, saves each issue (JSON or body text) as a file and uses
`parseIssueBody` or `npx vite-node scripts/perfRuns.ts <folder>`. The issue body ends with
the marker `<!-- markuscraft-perf v1 -->` and one `json` block holding the whole record
(`BenchResult`); lights are not stored but worked out from the numbers (`verdict.ts`), so
old runs can be judged by new thresholds. The thresholds of the lights are the owner's
decision. Numbers from software WebGL (cloud sessions, CI) are never evidence.

## Scenarios and versions

A phase part that adds something with a cost of its own (a new kind of block, creatures,
workers) adds a scenario: one entry in `SCENARIOS` with its script, and its row appears by
itself. A changed scenario (script, steps, warm-up) gets a new version; adding a scenario
or changing the order raises `BENCH_SUITE_VERSION`. Results of different versions of a
scenario are never compared (`compare.ts` keeps them in separate rows).
`scenarios.test.ts` pins the table. Scenarios added by later parts: `torches` (Phase 4
part B, suite version 2), `players` (below, suite version 3) and `radar` (Phase 8 part B1,
suite version 4: the `walk` input with the view turning 1.5° per step, `Scenario.yaw`
through `BenchHost.setYaw`, and the radar circle shown in the bench's Creative world,
`Scenario.radar`) and `caves` (Phase 8 part B2a, suite version 5: the `walk` input from
the spawn of a generator 3 world of seed 1337, balanced, few trees; `Scenario.gen`, last
in the table, so the runner loads that world inside the block without taking a ready
time, and the next block starts in the bench world again).

## The scenario `players` (Phase 6 part E)

The scenario `players` (suite version 3) hosts a `SimRoom` in the run's world: three
`ClientSession`s over a memory network with no delay, joined during `settle`
(`BenchHost.guestsReady`), stepped with the simulation (`stepGuests`, the room's clock is
simulation time, which the figures are drawn by), closed when the scenario ends; its chunk
is loaded when a run starts. The guests walk arcs in front of the player
(`BENCH_GUEST_RADII`) and place and break a block every 30 steps in looks 2, 5 and 8.

Before changing the performance test, `Input` or how `Game` switches screens read the
"Decisions and deviations" of `docs/phase-4p-report.md` (also "How a later session reads
the results" and "For Part B: adding a scenario"); for `players` `docs/phase-6e-report.md`.
