# CI 1 report: parallel browser tests, triggers, timing

Plan: `docs/ci-1-plan.md`. Pull request: #35. The game, the tests' content, the reference
screenshots and `deploy.yml` are unchanged.

## 1. What was built

- **`.github/workflows/ci.yml`** in the layout of plan section 4: `changes`, `checks`,
  `build`, `e2e-game` (four shards), `e2e-mp` (three shards), `report`, `CI result`.
  Triggers `push` and `pull_request` (`opened`, `synchronize`, `reopened`,
  `ready_for_review`); concurrency group `ci-<event>-<ref>`, never cancelled on `main`;
  time limits per job (5 / 15 / 10 / 30 / 10 / 5 minutes).
- **actionlint 1.7.12** in `checks`: the release archive is downloaded and checked against
  its SHA-256 in the workflow (`ACTIONLINT_VERSION`, `ACTIONLINT_SHA256`). It also runs
  shellcheck on the `run:` blocks and lints `deploy.yml`. Zero findings.
- **`scripts/ci/`**, plain Node modules without dependencies, with `// @ts-check` and unit
  tests next to them (Vitest's `include` gained `scripts/ci/**/*.test.ts`):
  - `changes.mjs`: `decideFull` (push to `main` → full; pull request → full unless every
    changed file ends in `.md`; other pushes → not full; an empty or unreadable list is not
    docs-only). A pull request's files are `git diff --name-only HEAD^1 HEAD` of the merge
    commit the checkout holds.
  - `ciResult.mjs`: `ciVerdict(needs)` (every job that had to run succeeded, the others
    were skipped; anything failed, cancelled, missing or unexpected is a problem named with
    its job) and `jobsAtFault` (names the failed shard from the run's job list, e.g.
    "e2e-game (2/4): failure").
  - `timings.mjs`: the timing summary (totals per project, test time per shard, every spec
    longest first, the 20 slowest tests, failed or flaky tests with their shard);
    `--assign` (spec lists per shard, longest spec first onto the least loaded shard);
    `--files <project> <n>` (the specs of one shard job, plus every spec of the project
    that `e2e/shards.json` does not name in the last shard).
- **`e2e/shards.json`**: the spec lists per shard (step 5; section 4).
- **`playwright.config.ts`**: in CI the reporter is `list` + `blob`. Nothing else changed.
- **`CLAUDE.md`**: the section "CI" (jobs, triggers, time budget, spec lists, timing data,
  the local rule), the tech stack row, rule 4, the commands table, Definition of Done items
  2 and 3, the project structure (`scripts/ci/`) and the current status.

## 2. Decisions and deviations

- **`checks` does not wait for `changes`.** The diagram of plan section 4 draws `changes`
  before `checks`, but `checks` needs nothing from it; running both at once saves the
  20 s of `changes` on the way to the fast result.
- **Per-shard timings from per-shard merges.** Playwright 1.63's merged JSON carries no
  shard index (the type has an optional `shardIndex`, the merge does not fill it). The
  `report` job therefore also merges each shard's blob alone into `e2e-timings/<project>-<n>.json`
  and passes them as `<n>=<path>` to `timings.mjs`; the merged `merged.json` (for the count
  of AC1.2) and the HTML report come from all blobs together. The artifact `e2e-timings`
  holds all of them and `summary.md`.
- **`CI result` names the shard through the REST API.** The `needs` context has one result
  per matrix job, not per shard. The verdict comes from `needs` alone; for the names the
  job reads the run's job list with `actions: read` (only this job has it). Without the
  API the verdict is the same, only without shard numbers.
- **The actionlint checksum** was taken from the archive the first CI run downloaded and
  compared with the release's own `actionlint_1.7.12_checksums.txt` in the same run (equal:
  `8aca8db9…a3d8`); the cloud container reaches no GitHub release downloads. Locally
  actionlint 1.7.12 was built from the Go module proxy for the same checks.
- **`tsconfig.json` has `allowJs`.** The unit tests import the `.mjs` scripts; with
  `allowJs` and `// @ts-check` in the three CI scripts the type check covers them too.
  Other `.mjs` files are not checked (no `checkJs`).
- **The blob reports keep apart by themselves:** Playwright names them
  `report-<hash of the command>-<n>.zip`, and each shard uploads its own artifact
  (`blob-game-<n>`, `blob-mp-<n>`); the `report` job downloads them into one folder each.
- **A shard job's spec list goes through a command substitution** (`list=$(…)`): if the
  script failed inside `< <(…)`, the list would be empty and Playwright would run the whole
  project; `shardFiles` also refuses a shard with no specs.
- **Spec lists were needed** (step 5): see section 4. The assignment uses the sum of test
  time over two runs, since one run's spec times differ by up to half from the next.
- **S2 cannot be shown on this pull request.** `changes` looks at the whole pull request
  (base … merge commit), and this one changes non-Markdown files; a commit that changes only
  a `.md` file still runs everything here, as AC1.3's second sentence wants. The docs-only
  path is covered by the unit tests of `changes.test.ts` (docs-only, mixed, empty and
  unreadable lists) and by `CI result` passing a run with skipped browser jobs (every push
  run of this branch, AC1.1). The first docs-only pull request after the merge shows it on
  GitHub; see "For the next session".
- **S3 and S4 ran as one throwaway commit**, to spend one run instead of two: the probe spec
  and the broken unit test at once. Each scenario's expectation can be read from that one
  run (section 5). That commit is the one commit of the branch that does not pass
  `npm run check`, on purpose; it was reverted in the next commit.
- **S5 came by itself**: pushing f8566e8 two minutes after 449a74a cancelled both runs of
  449a74a (section 5).
- **`report` uses `always()`** as the plan says, so it also runs, and fails, in a cancelled
  run (no blob reports to merge). Such a run is red anyway; see "Known issues".

## 3. Workflow scenarios (plan section 7)

| Id  | Run(s)                                  | Result                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S0  | push runs of 1684512, b78aef0, 5dc51ed  | Only `changes`, `checks` and `CI result` ran; the browser jobs were skipped. On 5dc51ed `CI result` was green (on b78aef0 `checks` failed on purpose: the first run printed the actionlint checksum).                                                                        |
| S1  | #168 (5dc51ed, the workflow on the PR)  | All jobs ran; the shards ran 241 + 47 = 288 tests, as `npx playwright test --list`; `report` wrote the summary. Two tests failed (section 5), so `CI result` was red and named `e2e-game (2/4)` and `e2e-game (3/4)`. Green full runs followed (#174 and later).             |
| S2  | not shown on this PR                    | See "Decisions and deviations": the pull request as a whole is not docs-only. Covered by unit tests; the first docs-only pull request after the merge checks it.                                                                                                             |
| S3  | probe commit 6abdbf5                    | `e2e-game (4/4)` red (the probe, a spec not in `e2e/shards.json`, ran there, as the last-shard rule says), every other shard finished green; `CI result` red, naming `e2e-game (4/4)`; the artifact `playwright-report` holds the test with expected, actual and diff image. |
| S4  | probe commit 6abdbf5                    | `checks` red (the failing unit test), the browser jobs still ran and `report` reported; `CI result` red, naming `checks`.                                                                                                                                                    |
| S5  | 449a74a, then f8566e8 two minutes later | Both runs of 449a74a were cancelled (`checks` "cancelled"); their `CI result` was red ("checks: cancelled"); the runs of f8566e8 decided.                                                                                                                                    |
| S6  | revert of the probe (with this report)  | The tree equals 2fab5e9 again (`git diff` empty). Its run: section 4.                                                                                                                                                                                                        |

Unit tests (`scripts/ci/*.test.ts`, 38 tests) cover the decisions of AC1.3 and AC1.4: a
docs-only, a mixed, an empty and an unreadable file list; a cancelled shard, a skipped shard
while `full` is true, a failed `checks`, a browser job that ran while `full` was false, a
missing job, a `changes` without decision; a JSON with a failed and a skipped test; the
spec lists (every spec exactly once, a new spec in the last shard, a vanished spec dropped,
no empty shard).

## 4. Measured performance

All times are from the job timestamps of the GitHub API. Queue time was below 5 s for every
job (each job started within 5 s of its creation), so queue and run time are not shown
apart.

### Before and after, per step (`checks`)

| Step                        | Before (run #163, one job) |  After (run #174, `checks`) |
| --------------------------- | -------------------------: | --------------------------: |
| npm ci                      |                       32 s |                        46 s |
| actionlint                  |                          – |                         1 s |
| Lint + type check           |                       16 s |                        22 s |
| Unit tests with coverage    |                   1 min 38 |                    2 min 55 |
| Unit tests with time limits |                       50 s |                    1 min 16 |
| **Result of `checks`**      |  (only at the end, 43 min) | **5.5 min after the start** |

(The unit tests take longer than in #163 on these runners; they did not change. The
browser tests' summed test time also differs from run to run by up to a third, see below.)

### Green full runs of the pull request

| Run  | Head    | `checks` result after start | Whole run (start → `CI result`) | `CI result` |
| ---- | ------- | --------------------------: | ------------------------------: | ----------- |
| #174 | 2fab5e9 |                     5.5 min |                        12.6 min | green       |

### Per shard (job time, minutes) and the 1.3× rule

| Run                            | game 1 | game 2 | game 3 | game 4 | game max ÷ mean | mp 1 | mp 2 | mp 3 | mp max ÷ mean |
| ------------------------------ | -----: | -----: | -----: | -----: | --------------: | ---: | ---: | ---: | ------------: |
| #168 (built-in `--shard`, red) |    7.5 |    8.0 |   14.0 |    5.5 |            1.60 | 14.2 |  9.3 |  6.6 |          1.42 |
| #172 (first lists, red)        |    5.6 |    5.7 |    6.1 |   11.0 |            1.54 | 10.3 |  9.9 |  8.8 |          1.07 |
| #174 (second lists)            |    6.9 |    9.6 |    9.9 |    9.2 |            1.11 |  6.7 | 10.5 |  7.3 |          1.29 |

Run #168 with Playwright's built-in `--shard` broke the 1.3× rule in both projects (both
`padSoak` tests and the long `mp` specs fell together), so step 5 switched to spec lists.
The first lists, from #168 alone, moved the imbalance to `game 4`; the second, from the sum
of #168 and #172, hold the rule.

### Per spec (sum of test durations)

Before: run #163 (`list` reporter, plan appendix). After: run #174 (`e2e-timings`). The
shard is the one in `e2e/shards.json`.

| Project                                                                                     | Spec                     | Tests | Before (s) | After, run #174 (s) | Shard |
| ------------------------------------------------------------------------------------------- | ------------------------ | ----: | ---------: | ------------------: | ----: |
| multiplayer                                                                                 | mpMenus.spec.ts          |    14 |        380 |                 287 |     1 |
| multiplayer                                                                                 | mpRooms.spec.ts          |    12 |        216 |                 209 |     3 |
| game                                                                                        | padSoak.spec.ts          |     2 |        210 |                 296 |     1 |
| multiplayer                                                                                 | mpFigure.spec.ts         |     7 |        198 |                 327 |     2 |
| game                                                                                        | crafting.spec.ts         |    22 |        182 |                 313 |     3 |
| game                                                                                        | light.spec.ts            |    13 |        164 |                 271 |     2 |
| multiplayer                                                                                 | mpHarden.spec.ts         |     4 |        147 |                 152 |     3 |
| game                                                                                        | save.spec.ts             |     7 |        135 |                 256 |     4 |
| multiplayer                                                                                 | mpGathering.spec.ts      |     5 |        127 |                 225 |     2 |
| game                                                                                        | touchLayout.spec.ts      |    17 |        123 |                 198 |     2 |
| game                                                                                        | touch.spec.ts            |    11 |        116 |                 181 |     2 |
| game                                                                                        | interaction.spec.ts      |     9 |        104 |                 158 |     4 |
| game                                                                                        | bench.spec.ts            |    13 |         95 |                 137 |     4 |
| multiplayer                                                                                 | mpPlayers.spec.ts        |     5 |         95 |                  64 |     1 |
| game                                                                                        | torch.spec.ts            |     7 |         94 |                 155 |     3 |
| game                                                                                        | sky.spec.ts              |     7 |         91 |                 150 |     3 |
| game                                                                                        | worldMenu.spec.ts        |    15 |         90 |                  90 |     1 |
| game                                                                                        | gamepad.spec.ts          |    14 |         89 |                 116 |     1 |
| game                                                                                        | gathering.spec.ts        |     4 |         83 |                 132 |     3 |
| game                                                                                        | breaking.spec.ts         |     9 |         82 |                 134 |     2 |
| game                                                                                        | gamepadInventory.spec.ts |     8 |         81 |                  93 |     1 |
| game                                                                                        | inventory.spec.ts        |     6 |         74 |                 139 |     3 |
| game                                                                                        | inventoryScreen.spec.ts  |     8 |         70 |                 104 |     2 |
| game                                                                                        | world.spec.ts            |     4 |         62 |                 123 |     4 |
| game                                                                                        | netTest.spec.ts          |     8 |         60 |                  75 |     4 |
| game                                                                                        | night.spec.ts            |     4 |         58 |                  77 |     2 |
| game                                                                                        | gamepadMenus.spec.ts     |    16 |         56 |                  81 |     4 |
| game                                                                                        | soak.spec.ts             |     2 |         48 |                  61 |     1 |
| game                                                                                        | torchSoak.spec.ts        |     2 |         42 |                  91 |     4 |
| game                                                                                        | ui.spec.ts               |     9 |         39 |                  63 |     3 |
| game                                                                                        | fullscreen.spec.ts       |     5 |         31 |                  40 |     2 |
| game                                                                                        | terrain.spec.ts          |     3 |         28 |                  53 |     3 |
| game                                                                                        | player.spec.ts           |     5 |         28 |                  33 |     1 |
| game                                                                                        | smoke.spec.ts            |     2 |         13 |                   9 |     1 |
| game                                                                                        | playerSection.spec.ts    |     7 |         12 |                  24 |     4 |
| game                                                                                        | actions.spec.ts          |     2 |          9 |                  18 |     3 |
| Totals: before `game` 2 370 s, `multiplayer` 1 163 s; run #174 `game` 3 672 s (61.2 min),   |
| `multiplayer` 1 266 s (21.1 min). Spec times vary a lot between runs of the same code (for  |
| example `padSoak` 486 s in #168, 244 s in #172, 296 s in #174; `crafting` 310, 148, 313 s): |
| a spec slows down when a heavy spec runs on the shard's other worker. Sums of test time are |
| therefore a coarse measure; the job times above are what counts for the budget.             |

## 5. Known issues

- **Three timing-dependent browser tests failed once each** in the runs of this pull
  request, on code this round did not touch; each passed in the other runs:
  - `gamepadMenus.spec.ts` "Phase 5 AC3.7: B and a browser Back held up by a slow frame act
    once" (run #168): still paused after B and Back. The test calls `history.back()` only
    after its 600 ms busy wait; if the `popstate` then arrives more than one frame after the
    frame in which the poll saw B, the guard counts it as a second Back
    (`BackGuard.pairedWithPadBack`). Locally it passed 4 of 4 times, and a probe measured the
    `popstate` 16–49 ms after `history.back()` with no poll in between, so the race needs a
    runner whose frames come faster than the traversal.
  - `netTest.spec.ts` "Phase 6 AC2.1, AC2.5, AC2.7" (run #168): the network test between two
    pages was not done within 30 s.
  - `mpHarden.spec.ts` "Phase 6 AC14.3: soak" (run #172): guest 3 was "reconnecting" during
    its first actions, as described in `docs/phase-6e-report.md`, "The soak on a busy runner".

  `main` had red runs of the same kind before this round (#114, #136). Plan section 10 allows
  a fix in this round only if it keeps the test's content, and AC4.2 allows no change to a
  spec or to `src/` at all, so none was fixed here. They are candidates for a fix session of
  their own (section 6).

- **`report` fails in a cancelled run** (`if: always()` per the plan, but there are no blob
  reports to merge). The run is red anyway; `!cancelled()` would skip the job instead.
- **Skipped matrix jobs show their unexpanded names** ("e2e-game (${{ matrix.shard }}/4)")
  in the checks list of a run without the full suite. This is how GitHub names a skipped
  matrix job; the check that matters is `CI result`.
- **The run on `main` after the merge** (full suite, not cancelled by a later merge) is to
  be checked by the first session after the merge, as the plan says.
- **The required check** is still the owner's step: "CI result" must be made required for
  `main`, and the old "check" removed if it is required (see the pull request).

## 6. For the next session (and a second round)

- After the merge: check that the run on `main` ran the full suite and was not cancelled;
  the first docs-only pull request shows S2 on GitHub (browser jobs skipped, `CI result`
  green). Note both in that session's report.
- Rebalance when the budget rule of `CLAUDE.md` says so:
  `node scripts/ci/timings.mjs --assign <shard>=<json>... > e2e/shards.json` with the
  per-shard JSON of two or more runs from the artifact `e2e-timings` (one run alone misleads,
  section 4), then `npm run format`.
- A fix session for the three timing-dependent tests of section 5 (each in its own spec or,
  for the back guard, in `backGuard.ts`), so that red runs mean a defect.
- Second-round candidates (plan section 8): soak tests (`padSoak`, `mpHarden` AC14.3,
  `torchSoak`) not on every pull request; caching the Chromium download (about 15–25 s per
  shard) and `node_modules`; a fifth `game` shard if the suite grows.
