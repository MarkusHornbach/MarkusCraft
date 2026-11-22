# CI 1: parallel browser tests, triggers, timing

A round of work on the build pipeline, not a game phase. It is planned here and built in one
implementation session with one pull request (CLAUDE.md, rule 5); the report is
`docs/ci-1-report.md`. The game does not change, and no test is removed or changed in
content.

## 1. Starting point

- `.github/workflows/ci.yml` has one job, `check`, triggered by every `push`: npm ci, lint,
  type check, unit tests with coverage, unit tests with time limits, build, Chromium
  install, `npx playwright test` (both projects, 2 workers; the `multiplayer` project one
  test at a time), report upload on failure. Time limit 110 minutes.
- `playwright.config.ts`: projects `game` (241 tests) and `multiplayer` (47 tests, files
  `mp*.spec.ts`, `workers: 1`); web servers `npm run preview` (port 4173) and
  `npm run signal` (port 9000); reporter `list` + `html` in CI.
- `deploy.yml` builds `main` for GitHub Pages. It is not touched by this round.

**Measured (run #163, `main` after PR #34, 2026-11-21, green):**

| Step                                 | Time     |
| ------------------------------------ | -------- |
| npm ci                               | 32 s     |
| Lint + type check                    | 16 s     |
| Unit tests with coverage             | 1 min 38 |
| Unit tests with time limits          | 50 s     |
| Build                                | 4 s      |
| Chromium install                     | 24 s     |
| Browser tests (288 tests, 2 workers) | 39.3 min |
| **Whole run**                        | 43 min   |

Sum of test durations: `game` 39.5 min, `multiplayer` 19.4 min. The per-spec numbers are in
the appendix (the "before" baseline of this round).

**A corrected assumption.** The starting prompt says one run takes over 100 minutes. Green
runs take 35–43 minutes (#162, #163). The long runs were **failing** runs: #161 failed
after 70 minutes, and #159 was cut off at 80. A failing browser test waits out its own
limit (most of the long tests have 180–240 s), and these waits add up in one job. Sharding
helps there too: a failure costs only its own shard's time. The goals of this round stay
as they are. Without the round, the next phase would push even green runs towards the limit.

## 2. Goals

- The fast checks (lint, type check, both unit runs) are visible as a result within
  **8 minutes** of a push.
- A pull request run is **green or red within 25 minutes** (expected: about 15).
- No test is removed, skipped or changed in content; no check is weakened.
- Every run records how long each spec and each test took, and shows a summary.

## 3. Changes to the original scope

The owner agreed to each of these in the planning session (2026-11-22).

1. **Separate `build` job instead of building in `checks`.** The build takes 4 s. If the
   shards took it from `checks`, every shard would first wait 4–5 minutes for lint and the
   unit tests. A small `build` job (npm ci + build, about 1 minute) runs next to `checks`
   and uploads `dist/`. All shards test this one build.
2. **Four shards of `game` and three of `multiplayer`.** These numbers are sized from the
   measured run: about 5–7 minutes of tests per shard, about 12–15 minutes for a green run.
3. **Triggers.** Every `push` to a branch other than `main` runs only `checks`. The
   `pull_request` event runs everything, with the types `opened`, `synchronize`,
   `reopened` and `ready_for_review`. `reopened` is added so that a reopened pull request
   does not keep a pending required check. A push to `main` runs everything. On a pull
   request `checks` therefore runs twice (push and pull request): accepted, because the
   runners are free and this needs no API lookup.
4. **Docs-only** means every changed file of the pull request ends in `.md` (anywhere:
   `docs/`, `CLAUDE.md`, `README.md`). Then `build`, the shards and `report` are skipped.
   `checks` still runs, because Prettier checks Markdown. A push to `main` always runs the
   full suite, docs-only or not.
5. **Timing through Playwright's blob reports.** No reporter of our own. Playwright's
   built-in `--shard` is used first. A spec list per shard from a committed timing file
   comes only if the measured runs show a shard taking more than 1.3 times the mean
   (step 6).
6. **Runs on `main` are never cancelled** by a later push. Other runs still are.
7. **Time limits per job** instead of one limit of 110 minutes: `changes` 5, `checks` 15,
   `build` 10, each shard 30, `report` 10, `CI result` 5 minutes. A hanging job fails
   early, and each shard keeps at least twice its measured time as margin.
8. **actionlint in `checks`.** It catches broken `needs`, `if` and matrix expressions
   before they can leave the required check pending. It uses a pinned release, checked
   against its SHA-256, and only in CI; `npm run lint` stays as it is.
9. **The workflow is tested on its own pull request** with throwaway commits (section 7).
   Nothing of them stays in the final diff.
10. **The local rule for cloud sessions** (section 6) changes Definition of Done item 2:
    the full browser suite runs in CI, and a session runs the affected specs locally.

Not changed: everything listed as out of scope in section 8.

## 4. The new layout

```
push (not main) ──► changes ─► checks ─────────────────────────────► CI result
pull_request / push main:
          changes ─┬─► checks ──────────────────────────────────────┐
                   └─► build ─┬─► e2e-game  [1/4 … 4/4] ─┐          ├─► CI result
                              └─► e2e-mp    [1/3 … 3/3] ─┴─► report ┘
```

| Job         | Runs when                            | Does                                                                                                                                                                                                                                                           |
| ----------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `changes`   | always                               | Decides `full`: true for a push to `main`; for a pull request, true unless every changed file (base…head) ends in `.md`; false for other pushes. An empty or unreadable list counts as not docs-only.                                                          |
| `checks`    | always                               | npm ci, actionlint, lint, type check, unit tests with coverage, unit tests with time limits.                                                                                                                                                                   |
| `build`     | `full`                               | npm ci, `npm run build`, uploads `dist/` (artifact `dist`, 3 days).                                                                                                                                                                                            |
| `e2e-game`  | `full`, after `build`                | Matrix `shard: [1, 2, 3, 4]`, `fail-fast: false`. npm ci, Chromium, downloads `dist/`, `npx playwright test --project=game --shard=N/4`. Always uploads its blob report.                                                                                       |
| `e2e-mp`    | `full`, after `build`                | Matrix `shard: [1, 2, 3]`, the same with `--project=multiplayer --shard=N/3`. Playwright's `webServer` starts the local signaling server on each runner, so every shard has its own.                                                                           |
| `report`    | `full`, after the shards, `always()` | Merges the blob reports (`npx playwright merge-reports`) into HTML and JSON, writes the timing summary to the job summary, uploads the timing JSON every run (90 days), and uploads the merged HTML report on failure (14 days, artifact `playwright-report`). |
| `CI result` | always (`if: always()`)              | The only required check. Green only if `changes` and `checks` succeeded and, when `full` is true, `build`, every shard and `report` succeeded. When `full` is false, those jobs must be `skipped`. Anything failed, cancelled or missing is red.               |

- `playwright.config.ts`: in CI the reporter becomes `list` + `blob`. The merged report
  carries the attachments (diff images), so the shards need no `test-results/` upload of
  their own. Workers, projects, time limits and web servers stay as they are.
- The shards run `npm run preview` against the downloaded `dist/`. The build id
  (`__BUILD_COMMIT__`) is the one of the `build` job, so all shards see the same build.
- Concurrency: group `ci-<event>-<ref>`; `cancel-in-progress` unless the ref is `main`.
- The job logic of `changes` and `CI result` lives in small Node scripts without
  dependencies (`scripts/ci/changes.mjs`, `scripts/ci/ciResult.mjs`). The pure functions
  are unit-tested (`scripts/ci/*.test.ts`; Vitest's `include` gains `scripts/ci/**`).
  `scripts/ci/timings.mjs` turns the merged JSON into the summary.
- **Owner action after the pull request's first full run:** in the repository settings,
  require the status check **"CI result"** for `main` (branch protection or ruleset). If
  the old check `check` is required today, remove it, or every pull request waits on it
  for ever. The implementation session writes this into the pull request description.

**Runner pool.** One run uses up to 11 runners (changes, checks, build, 4 + 3 shards,
report, CI result), at most 9 at the same time. GitHub's free plan allows 20 concurrent
jobs; two pull request runs at once still fit.

## 5. Steps

Each step ends with a commit and a push. Rule 4 applies (`npm run check` before each
commit). Steps 2–5 are proven on the branch's own pull request, which the session opens
after step 2 and watches (owner decision of 2026-11-16).

1. **Device tests.** In `docs/device-tests.md`, tick NET-17, NET-18, NET-19 and PERF-8
   with "Result: passed (owner, 2026-11-21)", and update "Last updated". _(Done in the
   planning session.)_
2. **Helper scripts and tests.** `scripts/ci/changes.mjs` (file list → `full`),
   `scripts/ci/ciResult.mjs` (the `needs` results and `full` → pass, or fail with the
   names of the jobs at fault), `scripts/ci/timings.mjs` (merged Playwright JSON →
   Markdown: totals per project, every spec with its test count and total time sorted
   longest first, the 20 slowest tests, and the sum of test time per shard where the JSON
   carries it). Each has unit tests with small fixed inputs, including a docs-only list,
   a mixed list, an empty list, a cancelled shard, a skipped shard while `full` is true,
   and a JSON with a failed and a skipped test.
3. **The workflow.** Rewrite `ci.yml` as in section 4: triggers, concurrency, the seven
   jobs, time limits, actionlint (pinned version and checksum in the workflow), the blob
   reporter in `playwright.config.ts`. Open the pull request.
4. **Workflow scenarios** (section 7, S1–S5) on the pull request. Fix what they show.
5. **Measure and balance.** Take three green full runs of the pull request (S1 and later
   pushes count). Record per run: time to the result of `checks`, each shard's job time,
   the whole run, from the job timestamps and the summary. If a shard's mean is more than
   1.3 times the mean of its project's shards, switch that project to spec lists per
   shard: a committed `e2e/shards.json`, made by `scripts/ci/timings.mjs --assign` from
   the timing JSON (longest spec first onto the shard with the least time). Then measure
   again.
6. **CLAUDE.md and report.** Apply section 6 to `CLAUDE.md`. Write
   `docs/ci-1-report.md`: what was built, decisions and deviations, the "after" numbers
   next to the "before" baseline of the appendix (per step, per shard, per spec), known
   issues, and suggestions for the second round (section 8). Mark the pull request ready.

## 6. CLAUDE.md after this round

The implementation session makes these changes:

- **Tech stack**, row "CI / deploy": "GitHub Actions: `checks` on every push; the full
  suite (build, four `game` and three `multiplayer` shards, merged report) on pull
  requests and `main`; one required check, `CI result`; deploy `main` to GitHub Pages".
- **A new section "CI"** after "Commands", with the job table of section 4 in short and
  these rules:
  - **Time budget:** `checks` within 8 minutes, a pull request run within 25 minutes. A
    session that sees a green run above 25 minutes, or a shard above 15, rebalances
    (`scripts/ci/timings.mjs --assign`) or adds a shard in its own part, and records it in
    its report.
  - A new spec file needs nothing: built-in sharding picks it up (or, once
    `e2e/shards.json` exists, the assignment script places it, and a spec missing from
    the file runs in the last shard so it is never lost).
  - Timing data: the `report` job's summary and its artifact `e2e-timings` (90 days).
  - Docs-only pull requests (`.md` files only) skip the browser tests; `CI result` is
    still green.
- **The local rule** (rule 4, Definition of Done item 2, and "Headless testing"):
  - After each plan step, run `npm run check` and `npm run build`, plus the browser specs
    the step touches or could affect (`npx playwright test <files>`). Name them in the
    commit message body or the report. Rule 4's "every commit passes `npm run check`"
    stays.
  - The full browser suite runs in CI. The local full run (`npm run check:all`) is only
    needed to regenerate reference screenshots, or to chase a failure that shows only in
    CI.
  - Definition of Done item 2 becomes: "`npm run check` and `npm run build` pass locally
    with zero warnings, and the affected specs pass locally"; item 3 becomes "`CI result`
    is green on the part's pull request".
  - Commands table: `check:all` keeps its meaning; its note says "full local run, needed
    only for references and CI-only failures".
- The comment about time limits in the old `ci.yml` goes away; the time budget replaces it.

## 7. Test strategy for the workflow itself

**Static.** actionlint over `.github/workflows/*.yml` in `checks`. It also runs
shellcheck on `run:` blocks, which the runner image ships. `deploy.yml` is linted too, but
not changed.

**Unit tests.** `scripts/ci/*.test.ts` (step 2) cover the decisions that could leave a
required check pending or green by mistake.

**Scenarios on the pull request.** Each one is a commit or an event on the branch of this
round. The throwaway commits are reverted, and the final diff contains none of them.

| Id  | Scenario                                                                                                | Expected                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S0  | Pushes before the pull request exists (steps 2–3)                                                       | Only `changes`, `checks` and `CI result` run; `CI result` is green.                                                                                                                      |
| S1  | The workflow commit on the pull request                                                                 | All jobs run; the 7 shards together run 288 tests (the same count as `npx playwright test --list`); `report` shows the summary; `CI result` green.                                       |
| S2  | Throwaway commit changing only a `.md` file                                                             | `build`, shards and `report` are skipped; `CI result` green; the run takes under 8 minutes.                                                                                              |
| S3  | Throwaway commit adding `e2e/ciProbe.spec.ts` with one failing test (and a reference it does not match) | That one shard is red, the other shards finish (`fail-fast: false`), `CI result` is red and names the shard, and the artifact `playwright-report` shows the failure with its diff image. |
| S4  | Throwaway commit breaking a unit test                                                                   | `checks` red, `CI result` red; the browser jobs still run and report.                                                                                                                    |
| S5  | Two pushes in quick succession                                                                          | The first run is cancelled; its `CI result` is not green; the second run decides.                                                                                                        |
| S6  | Revert of S2–S4                                                                                         | Back to S1: all green.                                                                                                                                                                   |

After the merge, the owner sees the run on `main`: full suite, not cancelled by a later
merge. The report notes it as checked by the first session after the merge.

## 8. Out of scope

- Tagging or tiering tests (for example soak tests not on every pull request).
- Moving logic from browser tests to unit tests; replacing multiplayer pages with
  simulated guests.
- Retries or quarantine of flaky tests; affected-test selection in CI.
- Paid or self-hosted runners (the Pi is not a runner for this public repository).
- Any change to `deploy.yml`, to test contents, or to the game.
- Anything from the owner's `pi-infra` repository.

These are candidates for a second round, once the timing data of this round exists.

## 9. Acceptance criteria

- **AC1.1** On a push to a branch without a pull request, only `changes`, `checks` and
  `CI result` run (S0).
- **AC1.2** On a pull request and on `main`, all jobs of section 4 run, and the shards
  together run as many tests as `npx playwright test --list` lists, each exactly once
  (S1; counted from the merged JSON).
- **AC1.3** A docs-only pull request skips `build`, the shards and `report`, and
  `CI result` ends green (S2). A pull request with any other file runs everything.
- **AC1.4** `CI result` is red if any needed job failed or was cancelled, or if a browser
  job was skipped while `full` was true (S3, S4, S5, unit tests).
- **AC1.5** A failing browser test produces one merged artifact `playwright-report` with
  that test and its attachments, and the other shards still finish (S3).
- **AC2.1** In three green pull request runs, the `checks` job's result is there within 8
  minutes of the run's start.
- **AC2.2** In the same three runs the whole run is green within 25 minutes.
- **AC2.3** In those runs no shard's mean job time is more than 1.3 times the mean of its
  project's shards (after balancing, if step 5 needed it).
- **AC3.1** Every full run's `report` job writes the timing summary of step 2 into the job
  summary and uploads the timing JSON as `e2e-timings`.
- **AC3.2** `docs/ci-1-report.md` has the "before" baseline (appendix) and the "after"
  numbers in the same form.
- **AC4.1** actionlint passes with zero findings in `checks`.
- **AC4.2** `git diff main` of the pull request changes no `e2e/*.spec.ts`, no reference
  screenshot, no file in `src/`, and no line of `deploy.yml`. The only Playwright change
  is the CI reporter; `e2e/shards.json` may be added by step 5.
- **AC5.1** `CLAUDE.md` describes the new CI layout, the time budget and the local rule of
  section 6.
- **AC5.2** NET-17 to NET-19 and PERF-8 are ticked as passed in `docs/device-tests.md`
  (step 1).

## 10. Risks

- **Built-in sharding cuts by test count, not by time.** Tests take from 4 s to 114 s, and
  the long `mp` tests lie close together (`mpFigure`, `mpHarden`, `mpMenus`). Step 5
  measures this and switches to spec lists if needed. A single spec (`mpMenus`, 6.3
  minutes) is the smallest unit of a spec list. Its `describe` groups stay together in any
  case.
- **A runner per shard is less loaded than today's shared runner.** Timing windows of tests
  that passed only under load, or failed only under load, can shift. Such a failure is
  reported and fixed in the test's own spec only if the fix keeps the test's content (for
  example a wait on state instead of a time). Otherwise it is listed as a known issue for
  the owner. No retries.
- **The required check must be switched by the owner** (section 4). Until then a pull
  request shows the new checks, but none is required.
- **Queue time** on GitHub's free runners counts towards AC2.1 and AC2.2. The report gives
  queue and run time separately where they differ.

## Appendix: baseline before CI 1 (run #163, sum of test durations per spec)

From the `list` reporter's per-test times; 288 tests, 2 workers, browser step 39.3 min.

| Project     | Spec                     | Seconds |
| ----------- | ------------------------ | ------: |
| multiplayer | mpMenus.spec.ts          |     380 |
| multiplayer | mpRooms.spec.ts          |     216 |
| game        | padSoak.spec.ts          |     210 |
| multiplayer | mpFigure.spec.ts         |     198 |
| game        | crafting.spec.ts         |     182 |
| game        | light.spec.ts            |     164 |
| multiplayer | mpHarden.spec.ts         |     147 |
| game        | save.spec.ts             |     135 |
| multiplayer | mpGathering.spec.ts      |     127 |
| game        | touchLayout.spec.ts      |     123 |
| game        | touch.spec.ts            |     116 |
| game        | interaction.spec.ts      |     104 |
| game        | bench.spec.ts            |      95 |
| multiplayer | mpPlayers.spec.ts        |      95 |
| game        | torch.spec.ts            |      94 |
| game        | sky.spec.ts              |      91 |
| game        | worldMenu.spec.ts        |      90 |
| game        | gamepad.spec.ts          |      89 |
| game        | gathering.spec.ts        |      83 |
| game        | breaking.spec.ts         |      82 |
| game        | gamepadInventory.spec.ts |      81 |
| game        | inventory.spec.ts        |      74 |
| game        | inventoryScreen.spec.ts  |      70 |
| game        | world.spec.ts            |      62 |
| game        | netTest.spec.ts          |      60 |
| game        | night.spec.ts            |      58 |
| game        | gamepadMenus.spec.ts     |      56 |
| game        | soak.spec.ts             |      48 |
| game        | torchSoak.spec.ts        |      42 |
| game        | ui.spec.ts               |      39 |
| game        | fullscreen.spec.ts       |      31 |
| game        | terrain.spec.ts          |      28 |
| game        | player.spec.ts           |      28 |
| game        | smoke.spec.ts            |      13 |
| game        | playerSection.spec.ts    |      12 |
| game        | actions.spec.ts          |       9 |

Totals: `game` 241 tests, 2 370 s; `multiplayer` 47 tests, 1 163 s. Slowest single tests:
padSoak AC4.1 Part B (114 s), mpFigure AC12.4/AC12.8 (102 s), padSoak AC4.1 (96 s),
mpMenus AC7.10 (90 s), mpHarden AC14.3 soak (78 s), mpMenus AC7.5 (72 s).
