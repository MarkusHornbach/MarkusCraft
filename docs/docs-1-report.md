# Docs 1 report: a small CLAUDE.md, area rules where they are needed

Plan: `docs/docs-1-plan.md`. A round of work on the documentation, not a game phase. Game
code, the tests' content and the reference screenshots are unchanged.

## 1. What was built

- **The root `CLAUDE.md`** in the layout of plan section 4.2: title and what the game is,
  hard rules 1–7 (unchanged), tech stack as a list with "Playwright in cloud sessions",
  project structure at directory level with the unit test rules, the architecture
  invariants, "Where the rules are" (the index of every nested file and the two docs),
  commands, CI, headless testing (the rules every session needs), tests on real devices,
  "Docs hygiene" (new), Definition of Done with item 11 (new), owner decisions (unchanged)
  and the status table with "Open" and "Reading older docs".
- **Twelve nested `CLAUDE.md` files**, each starting with the file list of its directory:
  `src/world/CLAUDE.md`, `src/actions/CLAUDE.md`, `src/items/CLAUDE.md`,
  `src/save/CLAUDE.md`, `src/net/CLAUDE.md`, `src/input/CLAUDE.md`,
  `src/bench/CLAUDE.md`, `src/render/CLAUDE.md`, `src/player/CLAUDE.md`,
  `src/ui/CLAUDE.md`, `src/game/CLAUDE.md`, `e2e/CLAUDE.md`.
- **`docs/architecture.md`**: the data flow, the rules that span several areas (`Game.ts`,
  timed breaking, the torch, the figure, the back guard), the CI jobs in full, and the file
  lists of `src/main.ts`, `src/util/`, `src/testing/`, `scripts/`, `scripts/ci/`,
  `.github/workflows/` and `docs/`.
- **`docs/testing.md`**: the test API (URL parameters, `window.__mc`, `getState()` per
  phase), the controller and multiplayer test API, the performance test in tests and by
  hand, regenerating world references, `shot.mjs`, the unit test duration.
- **`docs/device-tests.md`** with the open tests only, and **`docs/device-tests-done.md`**
  with "Passed" (PERF-8, NET-1 to NET-25, with the intros of the multiplayer section) and
  "Obsolete" (unchanged).
- **`scripts/ci/docsBudget.mjs`** (`// @ts-check`, no dependencies) with 17 unit tests in
  `scripts/ci/docsBudget.test.ts`: size limits (root 25 000, warn 22 500; nested 8 000,
  warn 7 200; `docs/device-tests.md` warns above 25 000), the link check of backtick paths
  in every `CLAUDE.md`, annotations under GitHub Actions, exit code 1 on an error.
  `npm run docs:budget`, part of `npm run check`; the step "Docs budget" after "Lint" in
  `checks`.
- **`scripts/docsCoverage.mjs`**: lists the backtick names and bold bullet titles of an old
  `CLAUDE.md` that appear in none of today's rule files.

## 2. Decisions and deviations

- **The root was 82 429 bytes, not 82 135** (the plan's count was taken before the last
  commits on `main`). After this round it is 22 214 bytes.
- **Root files in the link check.** Plan section 4.6 says a path token "contains `/` or ends
  in `.md`, and starts with one of the prefixes or is a root file". The first run flagged
  `summary.md` (an artifact file name in the CI section, not a repository file). The check
  therefore looks at tokens that start with `src/`, `e2e/`, `docs/`, `scripts/` or
  `.github/`, and at a fixed list of root files (`ROOT_FILES`: `CLAUDE.md`, `README.md`,
  `package.json`, `vite.config.ts`, …); a bare `.md` name outside that list is not checked.
  A path relative to a nested file's directory (`Game.ts`, `world/raycast.ts`) is not
  checked either; the nested files name cross-area paths from the root.
- **Fenced code blocks are skipped by the link check** (their backticks are no inline code);
  `docs/architecture.md`'s data flow diagram is the only fenced block and is not checked
  anyway.
- **The coverage tool compares with whitespace collapsed** (Prettier wraps long names and
  titles) and drops a trailing period or colon of a bold title.
- **The root's CI section is shorter than planned:** the job list became one paragraph,
  and the per-job time limits, the artifact details, the spec list mechanics and the
  rebalancing command moved to `docs/architecture.md`, "CI jobs". Without that the root was
  22 492 bytes after step 6, eight bytes below the warning; a later part's status row would
  have warned at once. Nothing was dropped: the root keeps every rule a session acts on
  (triggers, the time budget and that a slow run means rebalancing, the local rule, the
  required check) and points to the details.
- **Other byte savings in the root:** the commands table became a list (the clarification
  of plan section 3 allows it); the status table's last column header is "Before changing"
  with short cells (the full "Decisions and deviations" sentence is in the index's intro);
  the tech stack's "Multiplayer" row is folded into the dependencies paragraph, which says
  the same.
- **The back guard is in full in `src/input/CLAUDE.md`** (it fitted), with a line in
  `src/game/CLAUDE.md` and in `docs/architecture.md`; no overflow was needed for any nested
  file (largest: `e2e/CLAUDE.md`, 6 442 bytes).
- **Device test intros.** Section 1 (performance) keeps its intro, as open tests remain;
  PERF-8 moved under a heading "1. Performance" in the done file without the intro.
  Section 10 (multiplayer) had no open test left and moved as a whole, with its intros,
  as "10. Multiplayer (Phase 6)" under "Passed". The intro of `docs/device-tests.md` and
  "How it is kept up to date" say where ticked and obsolete tests go now; nothing after
  "Result:" changed.
- **Steps 4 and 5 are two commits as planned,** but the coverage fixes of step 5 were found
  while finishing the root, so the root commit (4ebb492) already points to the "CI jobs"
  section that the next commit (b53477c) adds.
- **This report was committed as a draft in step 5,** because the root's status table
  links it and the link check (wired in in step 6) would otherwise fail.

## 3. Results of the checks

### Sizes (`wc -c`, bytes)

| File                        | Before |  After | Limit                |
| --------------------------- | -----: | -----: | -------------------- |
| `CLAUDE.md`                 | 82 429 | 22 214 | 25 000 (warn 22 500) |
| `docs/device-tests.md`      | 32 725 | 20 705 | warn 25 000          |
| `docs/device-tests-done.md` |      – | 12 749 | none                 |
| `e2e/CLAUDE.md`             |      – |  6 442 | 8 000                |
| `src/input/CLAUDE.md`       |      – |  6 353 | 8 000                |
| `src/net/CLAUDE.md`         |      – |  5 617 | 8 000                |
| `src/world/CLAUDE.md`       |      – |  4 907 | 8 000                |
| `src/bench/CLAUDE.md`       |      – |  4 293 | 8 000                |
| `src/game/CLAUDE.md`        |      – |  3 922 | 8 000                |
| `src/ui/CLAUDE.md`          |      – |  3 805 | 8 000                |
| `src/actions/CLAUDE.md`     |      – |  3 201 | 8 000                |
| `src/render/CLAUDE.md`      |      – |  3 090 | 8 000                |
| `src/save/CLAUDE.md`        |      – |  1 943 | 8 000                |
| `src/items/CLAUDE.md`       |      – |  1 942 | 8 000                |
| `src/player/CLAUDE.md`      |      – |  1 529 | 8 000                |
| `docs/architecture.md`      |      – |  7 096 | none                 |
| `docs/testing.md`           |      – |  7 964 | none                 |

A session that touches one area now loads the root (22 214) plus one or two nested files
(2–6 KB each) instead of 82 429 bytes.

### `docsBudget` (AC1.1–AC1.4)

- Step 1, by hand on the old tree: `error: CLAUDE.md: 82429 bytes, above the limit of
25000`, `warning: docs/device-tests.md: 32725 bytes, above the limit (25000)`, and one
  false positive, `summary.md` (decision above). No real broken path.
- Now: no error and no warning; `docs budget: CLAUDE.md 22214/25000, e2e/CLAUDE.md
6442/8000, …, docs/device-tests.md 20705/25000`. AC1.3's CI annotation is checked by the
  unit tests (`::error file=…::`, `::warning file=…::`) and the first CI run of `checks`.

### `docsCoverage` (AC2.1)

`node scripts/docsCoverage.mjs <git show 49ae84e:CLAUDE.md>`: 701 names in the old file,
2 not found, both dropped history:

- `First runs (issues #13–#16, build aef8349)`: the bold title of the first performance
  runs. Their content stays in `docs/phase-4p-report.md`, `docs/phase-4e-report.md` and
  `docs/phase-4-edit-cost.md`; the root keeps the conclusion ("all green, issue #18, Web
  Workers not needed"), `src/world/CLAUDE.md` links the edit-cost analysis.
- `The phase order changed with Phase 4`: the bold title of the renumbering note, replaced
  by "Reading older docs" in the status section (plan section 4.3).

The first run (after step 4) listed 15 names; the other 13 were added: the CI details to
`docs/architecture.md`, `e2e/helpers.ts` and the heading "Multiplayer tests" to
`e2e/CLAUDE.md`, `lightEdits*.slow.test.ts` to `docs/testing.md`, the scenario `torches`
to `src/bench/CLAUDE.md`, `docs/phase-4-edit-cost.md` to `src/world/CLAUDE.md`.

### Word for word (AC2.3)

Script comparing the blocks of `git show 49ae84e:CLAUDE.md` and the new root:

```
Hard rule 1: identical (317 bytes)
Hard rules 1-7: identical (2423 bytes)
Owner decisions: identical (1376 bytes)
Home domain rule: identical (324 bytes)
```

### Device test split (AC3.1)

Throwaway script over the old and the two new files (an entry is a `- ` line with its
indented continuation lines; tests are `- [ ] **…` / `- [x] **…`, plus the bullets under
"Obsolete"):

```
old entries 119 new 119
equal as multisets: True
open file all unticked: True 84
done file passed all ticked: True 26
obsolete unchanged: True
```

84 open tests, 26 passed (PERF-8, NET-1 to NET-25), 9 obsolete entries.

### Changed files (AC5.1)

`git diff --name-only 49ae84e`: `.github/workflows/ci.yml`, `CLAUDE.md`,
`docs/architecture.md`, `docs/device-tests-done.md`, `docs/device-tests.md`,
`docs/docs-1-report.md`, `docs/testing.md`, `e2e/CLAUDE.md`, `package.json`,
`scripts/ci/docsBudget.mjs`, `scripts/ci/docsBudget.test.ts`, `scripts/docsCoverage.mjs`
and the eleven `src/*/CLAUDE.md`. Only Markdown files, the two scripts with the test, and
the two wiring files.

### Local runs (AC5.2)

`npm run check` (now with `docs:budget`) and `npm run build` pass with zero warnings after
every step. No browser spec is affected (docs and CI only); the pull request runs the full
suite.

## 4. Where every section ended up (AC2.2, plan section 5)

- [x] Title, first paragraph → root, unchanged
- [x] Vision: world, static site, devices → root, second paragraph
- [x] Vision: the phases → root status table and "Reading older docs"
- [x] Hard rules 1–7 → root, unchanged (diff above)
- [x] Tech stack → root, as a list (the multiplayer row folded into the dependencies
      paragraph)
- [x] Playwright in cloud sessions → root, Tech stack
- [x] Project structure: tree → root one line per directory; file lines in each nested
      file, the rest in `docs/architecture.md`
- [x] Unit tests, `expectFasterThan`, three passes → root, Project structure
- [x] Pure core, thin shell → root invariant with the list of pure files
- [x] One pipeline for changes → root invariant; exceptions in `src/actions/CLAUDE.md`
- [x] Actions and reasons → `src/actions/CLAUDE.md`; root one sentence and the pointer
- [x] Block flags and shapes → `src/world/CLAUDE.md`; `emitTorch` and the painted icon also
      in `src/render/CLAUDE.md`
- [x] Light → root invariant; levels, opacity, `TORCH_LIGHT`, `TEST_LIGHT`,
      `LIGHT_CHECKSUM_1337_V1` in `src/world/CLAUDE.md`
- [x] Chunk stages → `src/world/CLAUDE.md`
- [x] Light on screen → `src/render/CLAUDE.md`
- [x] Performance test → `src/bench/CLAUDE.md`; named in `src/game/CLAUDE.md`, Screens
- [x] Performance results → `src/bench/CLAUDE.md`; root status keeps `perf-run` and
      "software WebGL is never evidence"
- [x] Scenarios and versions → `src/bench/CLAUDE.md`
- [x] Game modes → `src/actions/CLAUDE.md`
- [x] Tools and gating → `src/items/CLAUDE.md`
- [x] Crafting → `src/items/CLAUDE.md` (table, answers, stations, furnace);
      `src/ui/CLAUDE.md` (table order, fixed rows, hold, scroll)
- [x] Stable ids → root, unchanged
- [x] Generator version → root, unchanged (also in `src/world/CLAUDE.md`)
- [x] Saving → root invariant; records, `guests`, `GUESTS_MAX`, stores, autosave,
      `loadWorld` in `src/save/CLAUDE.md`
- [x] Screens → `src/game/CLAUDE.md`; the inventory part in `src/ui/CLAUDE.md`
- [x] Mouse mode and touch mode → `src/input/CLAUDE.md`
- [x] The controller → `src/input/CLAUDE.md`
- [x] The focus system → `src/input/CLAUDE.md`; `src/ui/CLAUDE.md` points to it
- [x] The controller on the inventory → `src/input/CLAUDE.md`; `src/ui/CLAUDE.md` points
      to it
- [x] Back guard → `src/input/CLAUDE.md`; a line in `src/game/CLAUDE.md`
- [x] Multiplayer configuration → `src/game/CLAUDE.md`; the owner decision in the root
- [x] Rooms → `src/net/CLAUDE.md` (sessions, saving guests); `src/game/CLAUDE.md`
      (`useSession`, no pause, 250 ms timer, notices)
- [x] Gathering together → `src/net/CLAUDE.md`
- [x] The player figure → `src/render/CLAUDE.md` (boxes, atlas, draw calls),
      `src/player/CLAUDE.md` (looks, `FigureMotion`), `src/net/CLAUDE.md` (`look`,
      `profile`, `busy`, `fly`)
- [x] "Your player" → `src/ui/CLAUDE.md`; identity storage in `src/game/CLAUDE.md`
- [x] Measure and harden → `src/net/CLAUDE.md` (overlay rows, traffic, compact poses);
      `src/bench/CLAUDE.md` (scenario `players`)
- [x] The network test → `src/net/CLAUDE.md`
- [x] Determinism, fixed timestep, coordinates, constants, style, comments, hot paths,
      in-game text → root, unchanged
- [x] Commands → root (as a list), plus `docs:budget`
- [x] CI → root, shorter (decision above); job details in `docs/architecture.md`
- [x] Headless testing: URL parameters, test API, `getState()`, bench, `save=1`, `mode=` →
      `docs/testing.md`
- [x] Controller tests → `e2e/CLAUDE.md` (names the helpers); full API in `docs/testing.md`
- [x] Touch tests, `Fingers`, `swipe` → `e2e/CLAUDE.md`
- [x] Tests with several pages, multiplayer tests, `allowConsole`, own PeerJS server →
      `e2e/CLAUDE.md`; the `net` test API in `docs/testing.md`
- [x] Cloud Chromium's GPU stall → root (short) and `e2e/CLAUDE.md`
- [x] References → root ("look at produced screenshots"); rules in `e2e/CLAUDE.md`;
      regeneration in `docs/testing.md`
- [x] Waits, `step(n)`, console errors, run alone, the full run's hour → root (short) and
      `e2e/CLAUDE.md`
- [x] Recipe-list tests, `data-ready` → `e2e/CLAUDE.md`
- [x] Tests on real devices → root, adjusted (two files)
- [x] Definition of Done → root, plus item 11 (item 8 names the done file)
- [x] Owner decisions → root, word for word
- [x] Current status → root status table, "Open" and "Reading older docs"

## 5. Nested loading (step 7)

In this cloud session, reading `src/net/roomCode.ts` and `src/items/items.ts` with the Read
tool did **not** bring `src/net/CLAUDE.md` or `src/items/CLAUDE.md` into the context: no
extra context appeared next to the files. The nested files were created during this
session, after it started; a session that starts on a checkout that already holds them may
behave differently. Either way the root's "Where the rules are" names every nested file,
so a session that does not get them loaded reads them from the index. **For the next
session:** read a file in one area early and note whether its `CLAUDE.md` appeared by
itself; if not, read the nested file named in the index before changing the area.

## 6. Known issues

- The root is 22 214 bytes, 286 below the warning. Each finished part adds a status row
  (about 110 bytes); after two or three parts the warning comes, and the next part must
  move detail out of the root (Docs hygiene), not raise the limit.
- The link check does not see paths relative to a nested file's directory (`Game.ts`,
  `world/raycast.ts`), nor bare file names; a renamed file named that way is not caught.
- `docs/architecture.md` and `docs/testing.md` have no size limit and are not
  link-checked (the plan limits the check to `CLAUDE.md` files).

## 7. Suggestions for a later round

- Merge the reports' "Decisions and deviations" into the nested files of their areas (plan
  section 10, out of scope here); the status table's last column could then shrink.
- Extend the link check to `docs/architecture.md` and `docs/testing.md`.
- If nested files turn out not to load in cloud sessions, a short line at the top of the
  root ("read the nested file of the directory you change") may be worth its bytes.

## 8. Device tests

No device test was added or changed in content. The ticked tests and "Obsolete" moved to
`docs/device-tests-done.md` (section 3). The owner's triage of the 45 open tests with an
origin before Phase 4 is asked for in the pull request (plan section 3, change 7);
step 9 records its result here.
