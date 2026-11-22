# Docs 1 plan: a small CLAUDE.md, area rules where they are needed

A round of work on the documentation, not a game phase. Planned with the owner on
2026-11-22; implemented in one session, on one branch, with one pull request.

## 1. Goal

`CLAUDE.md` is 82 135 bytes (about 20 000 tokens) and is loaded into every session. Most of
it is detail that only one area needs, and much of "Vision" and "Current status" is history.
`docs/device-tests.md` (32 725 bytes) mixes open tests with tests that passed long ago.

After this round:

- the root `CLAUDE.md` holds only what every session needs, describes the current state,
  and is at most **25 000 bytes**;
- the rules of one area live in a **nested `CLAUDE.md`** in that area's directory. Claude
  Code loads a nested file by itself as soon as a session reads a file in that directory.
  Rules that span several areas live in `docs/architecture.md` and `docs/testing.md`,
  which the root's index points to;
- a check in `npm run check` and in the CI job `checks` keeps the sizes and the links
  honest;
- `docs/device-tests.md` lists open tests only.

No rule or invariant may get lost in the move (section 5 maps every current section;
AC2.x makes that measurable).

## 2. The owner's starting scope (summary)

- Principle: `CLAUDE.md` describes only the current state. History stays only where a
  later session needs it to read older docs correctly, or where a decision might be
  revisited. Git and the reports keep the rest.
- `CLAUDE.md` at most 25 KB. It keeps: hard rules, tech stack, the architecture invariants
  (pure core, action layer, stable ids, determinism, generator and save versions, the
  light invariant), commands, CI summary, Definition of Done, owner decisions, and a short
  index "before changing X, read Y".
- Move the detail to docs read on demand (`docs/architecture.md`, `docs/testing.md`).
  Shorten "Project structure" to directory level. Use plain references, not `@`-imports.
- "Vision" and "Current status" become one compact table: phase/part | report | read
  before changing ….
- `docs/device-tests.md` keeps only open tests; passed and obsolete tests move, with the
  owner's results unchanged, to `docs/device-tests-done.md`.
- An automatic size check, `scripts/ci/docsBudget.mjs` (no dependencies, unit-tested),
  runs in the `checks` job. It fails above 25 KB and warns above 90 %. A limit for
  `docs/device-tests.md` should be considered.
- A new section "Docs hygiene" and a new Definition of Done item.
- Out of scope: game code, the tests' content, reference screenshots, rewriting old plans
  and reports (only links that move are updated), merging all reports' "Decisions and
  deviations" into one document.
- Hard rule 1, the owner decisions and the rule about the home domain and the Pi's
  addresses stay in `CLAUDE.md`.

## 3. Changes to the original scope

Agreed with the owner in the planning session on 2026-11-22.

1. **Hybrid placement.** Rules tied to one directory go into a nested `CLAUDE.md` there (e.g. `src/net/CLAUDE.md`, `e2e/CLAUDE.md`). `docs/architecture.md` takes the rules that span several areas, plus the file lists of small directories. `docs/testing.md` takes the full test API reference.
   _Reason:_ The biggest risk of the move is that a session never opens the detail. A nested file loads by itself once a session touches its directory; an index line is only read if a session looks for it. Rules that span several areas (`Game.ts` touches almost everything) need a docs file.
2. **Budgets for nested files too.** The root `CLAUDE.md` fails above 25 000 bytes; every nested `CLAUDE.md` fails above 8 000 bytes; each warns at 90 %. `docs/device-tests.md` only warns, above 25 000 bytes.
   _Reason:_ A nested file loads every time its directory is touched; one that keeps growing would bring the problem back. The device test list is not loaded by itself, so a warning is enough.
3. **Link check.** `docsBudget.mjs` also fails when a repository path written in backticks in any `CLAUDE.md` does not exist.
   _Reason:_ The index is only worth something if its targets exist. A later session that moves or renames a doc or a source file sees the broken reference at once.
4. **In `npm run check`.** The check runs locally as part of `npm run check`, not only in CI.
   _Reason:_ A session sees the failure before it pushes; every commit passes `npm run check` anyway (hard rule 4).
5. **Coverage check.** `scripts/docsCoverage.mjs <old file>` lists every name in backticks and every bold bullet title of the old `CLAUDE.md` that appears in none of the new files. The result goes into the report.
   _Reason:_ It makes "no rule may get lost" measurable instead of a matter of trust.
6. **The file-level structure list goes into the nested files.** Each nested `CLAUDE.md` starts with the file list of its directory (from today's "Project structure"); directories without a nested file get theirs in `docs/architecture.md`. The root keeps one line per directory.
   _Reason:_ The file descriptions are useful exactly when a session works in that directory, and that is when the nested file loads.
7. **The owner triages old open device tests in the pull request.** The pull request lists the open tests whose origin is before Phase 4 (origins 1, 2A, 3A–3C). The owner names the tests to drop in a comment; the session (which watches the pull request) moves those to "Obsolete" in `docs/device-tests-done.md` with the reason "Dropped by the owner, <date>".
   _Reason:_ More than 60 open tests from Phases 1–5 have no result. Only the owner can decide that one is no longer needed; a session never decides it.

Clarifications that are not scope changes:

- "25 KB" is checked as **25 000 bytes** (`wc -c`), the stricter reading.
- Hard rule 1, the section "Owner decisions" and the home domain rule are kept **word for
  word**, not only in meaning (stricter than the brief).
- Wide Markdown tables in the root file become lists where that saves bytes. Prettier pads
  every row of a table to its widest cell: the tech stack table is 3.7 KB mostly because
  of its CI row. This changes formatting only, not content.

## 4. Target layout

### 4.1 Files

- `CLAUDE.md` (fail > 25 000, warn 90 %): rules, invariants, stack, commands, CI summary, DoD, owner decisions, docs hygiene, the index, the status table
- `src/world/CLAUDE.md` (fail > 8 000): files of `world/` (with `generation/`, `light/`, `meshing/`); block flags and shapes (the support rule); light in full; chunk stages; generator version in detail
- `src/actions/CLAUDE.md` (fail > 8 000): files of `actions/`; the action layer in full (`pipeline.test.ts` guards), actions and reasons, game modes, the action clock
- `src/items/CLAUDE.md` (fail > 8 000): files of `items/`; tools and gating; the recipe table (ids, `craft` answers, stations, `SMELT_MS`)
- `src/save/CLAUDE.md` (fail > 8 000): files of `save/`; the save format, version 2 with `guests`, migration, stores, autosave
- `src/net/CLAUDE.md` (fail > 8 000): files of `net/`; rooms; Gathering together (host clock, grace rule, rate limit); the protocol parts of the figure (`look`, `profile`, `busy`, `fly`); measure and harden (compact poses, traffic); the network test
- `src/input/CLAUDE.md` (fail > 8 000): files of `input/`; mouse mode and touch mode; the controller; the focus system; the controller on the inventory; the back guard
- `src/bench/CLAUDE.md` (fail > 8 000): files of `bench/`; the performance test; performance results (`perf-run` issues); scenarios and versions; the scenario `players`
- `src/render/CLAUDE.md` (fail > 8 000): files of `render/` and `render/textures/`; light on screen (vertex colours, shader, Brightness floor); the figure's geometry, atlas and draw calls
- `src/player/CLAUDE.md` (fail > 8 000): files of `player/`; looks (append-only table, "Automatic"); `FigureMotion`
- `src/ui/CLAUDE.md` (fail > 8 000): files of `ui/`; the recipe list's rules (table order, fixed rows, hold to craft, scroll); "Your player"; pointers to the focus system in `src/input/CLAUDE.md`
- `src/game/CLAUDE.md` (fail > 8 000): files of `game/`; screens; multiplayer configuration (build variables, build id, lazy chunks); `Multiplayer`, the session swap and the 250 ms timer
- `e2e/CLAUDE.md` (fail > 8 000): files of `e2e/`; rules for writing browser specs (waits, console, cloud Chromium, references, touch, controller and multiplayer helpers, `mp*.spec.ts`)
- `docs/architecture.md` (no limit, read on demand): an overview of the data flow (input → `Game` → session → world → meshes); the cross-cutting rules that do not fit one directory; the file lists of `util/`, `testing/`, `scripts/`, `scripts/ci/`
- `docs/testing.md` (no limit, read on demand): the full test API (`window.__mc`, URL parameters, `getState()` fields per phase), regenerating world references, `compareShots`, the bench run by hand
- `docs/device-tests.md` (warn > 25 000): how to use it, how it is kept up to date, the open tests
- `docs/device-tests-done.md` (no limit): passed tests and "Obsolete", entries unchanged

The exact split between a nested file and `docs/architecture.md` may move during
implementation when a nested file would exceed 8 000 bytes. The overflow then goes into
`docs/architecture.md` under a heading for that area, and the nested file points to it.
The report records every such move.

### 4.2 The root `CLAUDE.md`, in order

1. Title and two sentences on what the game is (from "Vision"; the phase list moves into
   the status table).
2. **Hard rules** 1–7, unchanged. Rule 1 word for word.
3. **Tech stack** as a list, with the Playwright pin rule ("Playwright in cloud sessions").
4. **Project structure** at directory level: one line per directory with what it is for
   and whether it is pure. The sentences on unit test placement, `expectFasterThan` and
   the three passes of `npm test` stay here (they apply to every area).
5. **Architecture invariants**: pure core and thin shell (which directories and files are
   pure, the ESLint rules); one pipeline for changes (no direct `setBlock`, no reading
   `submit`'s return, immutable records, slots count from 0); stable ids (append-only
   tables, unknown item ids load); generator version and its checksum; save format
   versions and decoding that never throws; the light invariant (`verifyLight()` is 0,
   the reference decides); determinism; fixed timestep; coordinates; constants in
   `config.ts`; style, comments, hot paths, in-game text. Each invariant is a short
   paragraph; its detail is in the area's nested file.
6. **Where the rules are**: the index. One line per area: "Before changing X, read Y",
   naming the nested file, `docs/architecture.md` or `docs/testing.md` section, and the
   reports whose "Decisions and deviations" matter.
7. **Commands** (table, unchanged).
8. **CI**: the jobs as a short list, triggers, time budget and the rebalancing command,
   spec lists and the last-shard rule, docs-only pull requests, the local rule, the
   required check. The job table becomes a list.
9. **Headless testing**, short: the five rules every session needs (wait on game state,
   console errors fail, `MC_CONTAINER_GPU_STALL=1` here, run the browser suite alone,
   look at produced screenshots); the rest is in `e2e/CLAUDE.md` and `docs/testing.md`.
10. **Tests on real devices**: the adjusted rule (section 4.4).
11. **Docs hygiene** (new, section 4.5).
12. **Definition of Done** with the new item 11.
13. **Owner decisions**, word for word.
14. **Status**: the table (section 4.3), the note "Reading older docs", and what is open.

### 4.3 The status table

One row per finished part, in the order they were done:

| Part | Plan | Report | Read its "Decisions and deviations" before changing |
| ---- | ---- | ------ | --------------------------------------------------- |

Rows: 1, 2A, 3A, 3B, 3C, 4A, 4P, 4E, 4B, 5A, Polish 1, 5B, 6A, 6B, 6C, 6D, 6E, CI 1, the
two fix rounds, Docs 1. The last column keeps today's "Read its 'Decisions and
deviations' before changing …" texts, shortened to their objects.

Under the table:

- **Open:** Phase 4 part C (Web Workers) is optional and is built only if the owner's
  starting prompt asks for it; Phase 7 (personalization) is not yet planned. At the start
  of a session, look for issues with the label `perf-run`; the latest runs are all green
  (issue #18) and the Web Workers line says "not needed".
- **Reading older docs** (the only history that stays): multiplayer was "Phase 4" in the
  Phase 3 documents and "Phase 2, Part B" in `docs/phase-2-plan.md` (now Phase 6, do not
  implement 2B); Phase 3 part D (Web Workers) is now Phase 4 part C; personalization was
  Phase 5, now Phase 7; in Phase 6, "Part D" and "AC11.x" in the reports of parts B and C
  mean Part E and AC14.x (Part D, the figure, was inserted later); the criteria of
  Polish 1 are named "Polish 1 AC1.1".

### 4.4 Device tests

- `docs/device-tests.md` keeps "How to use it", "How it is kept up to date", the line
  "Last updated", and every test whose box is not ticked, in its section and order. The
  intro texts of sections stay where open tests remain under them (performance, the
  controller); intros of sections with no open test left move with the tests.
- `docs/device-tests-done.md` gets two sections, "Passed" (the ticked tests: PERF-8,
  NET-1 to NET-25, in today's order, with their section intros) and "Obsolete" (today's
  section, unchanged). Every entry is moved byte for byte; nothing the owner wrote changes.
- The rule in `CLAUDE.md` becomes: a phase part adds its tests to `docs/device-tests.md`;
  when the owner has ticked a test, the next session that touches the file moves it to
  "Passed" in `docs/device-tests-done.md` unchanged; a test made pointless moves to
  "Obsolete" there with one line of reason; ids are never reused; nothing after "Result:"
  is ever changed. Read the open list at the start of a session, and the done file when
  a test's history matters.

### 4.5 Docs hygiene (new section of `CLAUDE.md`)

- `CLAUDE.md` and the nested `CLAUDE.md` files describe the current state only. History
  stays only where a later session needs it to read older docs correctly, or where a
  decision might be revisited; the reports and git keep the rest.
- A finished part adds one row to the status table and its detail to the nested file of
  its area, `docs/architecture.md` or `docs/testing.md`, never a paragraph in the root.
- A new rule goes where a session working on it will read it: the nested file of its
  directory if it has one, else `docs/architecture.md`, with a line in the index if it
  is new ground.
- Paths are written in backticks, so the link check sees them. References are plain
  paths, never `@`-imports (those would load the file into every session again).
- `node scripts/ci/docsBudget.mjs` (part of `npm run check`) must pass: root at most
  25 000 bytes, each nested file at most 8 000, no missing path.

Definition of Done, new item 11: "Docs hygiene holds: `CLAUDE.md` describes the current
state, the finished part is one row in the status table, its details are in the nested
file or docs of its area, and the docs budget check passes."

### 4.6 `scripts/ci/docsBudget.mjs`

Plain Node module with `// @ts-check`, no dependencies, like the other `scripts/ci/` files,
with unit tests in `scripts/ci/docsBudget.test.ts`.

- Finds `CLAUDE.md` at the root and every nested `CLAUDE.md` (skipping `node_modules`,
  `dist`, `coverage`, `test-results`, `playwright-report` and `.git`).
- Sizes in bytes: root fails above 25 000 and warns above 22 500; nested fails above 8 000
  and warns above 7 200; `docs/device-tests.md` warns above 25 000. Limits are constants at
  the top of the file.
- Link check: every token in backticks in a `CLAUDE.md` that looks like a repository path
  (contains `/` or ends in `.md`, and starts with one of `src/ e2e/ docs/ scripts/
.github/` or is a root file such as `CLAUDE.md`, `package.json`) must exist. Skipped:
  tokens with `<`, `>`, `*`, `…`, `{` or a space, and the documented placeholders
  `phase-N-…` and `-Na-`. A path with a `:line` suffix is checked without it.
- Output: under GitHub Actions (`GITHUB_ACTIONS=true`) `::error file=…::` and
  `::warning file=…::` lines, so they show as job annotations; locally plain lines. Exit
  code 1 on any error, 0 with warnings only. One summary line with every file's size and
  limit.
- Pure functions (`checkSizes(files)`, `findPathRefs(text)`, `checkLinks(refs, exists)`,
  `formatFinding(finding, ci)`) are exported for the tests; the file system is touched
  only in `main`.
- Wired in: `package.json` `check` becomes `npm run typecheck && npm run lint && npm run
docs:budget && npm run test` with `"docs:budget": "node scripts/ci/docsBudget.mjs"`, and
  `checks` in `ci.yml` gets a step "Docs budget" after "Lint". It is wired in only in the
  step after the root file has shrunk, so every commit passes `npm run check`.

### 4.7 `scripts/docsCoverage.mjs`

A dev tool (like `scripts/compareShots.mjs`), committed so the owner can re-run it:
`node scripts/docsCoverage.mjs <old CLAUDE.md>`. It collects every token in backticks and
every bold bullet title (`- **…**`) of the old file and prints the ones that appear in none
of: the root `CLAUDE.md`, the nested `CLAUDE.md` files, `docs/architecture.md`,
`docs/testing.md`. The old file is taken with `git show <base>:CLAUDE.md`, where `<base>` is
the commit the branch started from.

## 5. Where every current section ends up

Root = root `CLAUDE.md`; nested files are named by directory.

- Title, first paragraph → root, unchanged
- Vision: first-person world, static site, devices → root, title paragraph (two sentences)
- Vision: the seven phases and their parts → root status table (one row per part) and the note "Reading older docs"; the narratives stay in the plans and reports
- Hard rules 1–7 → root, unchanged (rule 1 word for word)
- Tech stack (table) → root, as a list, same content
- Playwright in cloud sessions → root, Tech stack
- Project structure: tree → root: one line per directory; per-file lines: the nested file of the directory, or `docs/architecture.md` for `util/`, `testing/`, `scripts/`, `scripts/ci/`
- Project structure: unit tests, `expectFasterThan`, three passes of `npm test` → root, Project structure
- Pure core, thin shell → root (invariant, with the list of pure files)
- One pipeline for changes (action layer) → root (invariant: the rule); `src/actions/` (`pipeline.test.ts` exceptions in full)
- Actions and reasons → `src/actions/` (root: one sentence and the pointer)
- Block flags and shapes (support rule, aim box, torch) → `src/world/`; the mesher's `emitTorch` and the painted icon also named in `src/render/`
- Light → root (the invariant, `verifyLight()`, "the reference decides", who writes stored light); `src/world/` (levels, opacity, `TORCH_LIGHT`, `TEST_LIGHT`, `LIGHT_CHECKSUM_1337_V1`)
- Chunk stages → `src/world/` (the chunk manager is in `world/`)
- Light on screen → `src/render/`
- Performance test → `src/bench/` (with the `Game` side: `benchPhase`, side effects); `src/game/` names it
- Performance results → `src/bench/`; root status keeps "look for `perf-run` issues at the start of a session" and "software WebGL numbers are never evidence"
- Scenarios and versions → `src/bench/`
- Game modes → `src/actions/`
- Tools and gating → `src/items/`
- Crafting → `src/items/` (recipe table, `craft` answers, stations, furnace); `src/ui/` (the recipe list keeps table order, fixed rows, hold, scroll position)
- Stable ids → root (invariant), unchanged
- Generator version → root (invariant), unchanged
- Saving → root (format version, decoding never throws, migration needed); `src/save/` (records, `guests`, `GUESTS_MAX`, stores, autosave, `loadWorld`)
- Screens → `src/game/`; the inventory part also in `src/ui/`
- Mouse mode and touch mode → `src/input/`
- The controller (Phase 5) → `src/input/`
- The focus system → `src/input/` (the focus system as a whole); `src/ui/` points to it, as `FocusManager.ts` lives there
- The controller on the inventory (Phase 5 part B) → `src/input/`; `src/ui/` points to it
- Back guard → `src/input/` (with a line in `src/game/`, as `backGuard.ts` lives there)
- Multiplayer configuration (Phase 6) → `src/game/` (build variables, URL parameters, build id, lazy loading, AC1.7); root keeps the owner decision on addresses
- Rooms (Phase 6 part B) → `src/net/` (host and guest sessions, saving guests); `src/game/` (`useSession`, pause does not pause, 250 ms timer, notices)
- Gathering together (Phase 6 part C) → `src/net/`
- The player figure (Phase 6 part D) → `src/render/` (boxes, atlas, draw calls); `src/player/` (looks, `FigureMotion`); `src/net/` (`look`, `profile`, `busy`, `fly`)
- "Your player" (Phase 6 part D) → `src/ui/`; identity storage in `src/game/`
- Measure and harden (Phase 6 part E) → `src/net/` (traffic, compact poses, overlay rows); `src/bench/` (scenario `players`)
- The network test (Phase 6 part A) → `src/net/`
- Determinism, fixed timestep, coordinates, constants, style, comments, hot paths, in-game text → root (invariants), unchanged
- Commands → root, unchanged; plus `docs:budget`
- CI (jobs, triggers, budget, spec lists, timing data, local rule, required check) → root, as a shorter list; nothing dropped
- Headless testing: URL parameters, test API, `getState()` fields (per phase), bench in tests, `save=1`, `mode=` → `docs/testing.md`
- Headless testing: controller tests (`installFakePads`, `Pad`, `stickFor`, `focusOn`) → `e2e/` (helpers); full API in `docs/testing.md`
- Headless testing: touch tests, `Fingers`, `swipe` → `e2e/`
- Headless testing: tests with several pages, multiplayer tests, `allowConsole`, own PeerJS server → `e2e/`; the `net` test API in `docs/testing.md`
- Headless testing: cloud Chromium's GPU stall message → root (short) and `e2e/`
- Headless testing: references (`maxDiffPixelRatio`, regenerating world references, `compareShots`, checklist 6.5, look at screenshots) → root: "look at produced screenshots"; `e2e/`: the rules; `docs/testing.md`: the regeneration procedure
- Headless testing: waits, `step(n)`, console errors fail, run the suite alone, full run takes an hour → root (short list) and `e2e/`
- Headless testing: recipe-list tests, "New world" form `data-ready` → `e2e/`
- Tests on real devices → root, adjusted (section 4.4)
- Definition of Done → root, plus item 11
- Owner decisions → root, word for word
- Current status (all bullets) → root status table, "Open" and "Reading older docs" (section 4.3). The first runs of the performance test (#13–#16, #18) and the run on `main` after CI 1 (#188) stay in their reports; the root keeps only the current conclusion

## 6. Steps

Every step ends with `npm run check` and a commit (`docs: …` or `ci: …`), then a push.
No step changes game code, a spec's content or a reference screenshot, so no browser spec
is affected; the commit bodies say so ("no browser spec affected: docs only").
`npm run build` runs after steps 1 and 6 (the steps that touch `package.json` and
`scripts/`).

1. **The two scripts.** `scripts/ci/docsBudget.mjs` with `docsBudget.test.ts` (section
   4.6), not yet wired in. `scripts/docsCoverage.mjs` (section 4.7). Run `docsBudget` by
   hand: today it must fail on the root (82 135 bytes) and report today's broken paths, if
   any. Note the findings for the report.
2. **Device tests.** Split `docs/device-tests.md` into the open list and
   `docs/device-tests-done.md` (section 4.4). Check with a short throwaway script that the
   union of the entries of the two new files equals the entries of the old file, byte for
   byte (AC3.1). Update the line "Last updated".
3. **Nested files and docs.** Write the nested `CLAUDE.md` files, `docs/architecture.md`
   and `docs/testing.md` from today's text (section 5), keeping the wording where it
   still holds. Check each nested file's size with `docsBudget`; move overflow as section
   4.1 says. Prettier formats them.
4. **The root file.** Rewrite `CLAUDE.md` to the layout of section 4.2, with the status
   table, the index, "Docs hygiene" and the new DoD item. Hard rule 1, the home domain
   rule and "Owner decisions" are copied, not retyped.
5. **Coverage.** Run `node scripts/docsCoverage.mjs` against the old `CLAUDE.md` of the
   branch's base. Every name it lists is either added to the right file or listed in the
   report with the reason it was dropped (only history may be dropped, e.g. issue numbers
   of old performance runs). Repeat until the list holds only such reasons. Check every
   row of section 5 against the new files and tick it in the report.
6. **Wire in the check.** `docs:budget` in `package.json` and in `check`; the step "Docs
   budget" in `checks` (`ci.yml`). Update the root's Commands, CI and structure lines for
   the two scripts. `npm run check` and `npm run build`.
7. **Nested loading.** In this session, read a file in `src/net/` and record whether
   `src/net/CLAUDE.md` was loaded (it appears as context next to the file). If it is not
   loaded in a cloud session, the index still names every nested file. Record which case
   applies in the report; no change to the layout.
8. **Report and pull request.** `docs/docs-1-report.md` (what was built, decisions and
   deviations, the coverage result, the sizes before and after, known issues, suggestions
   for a later round). Open the pull request into `main`, with the triage list of
   section 3, change 7: every open device test with an origin before Phase 4, by id and
   title, and the request to name the ones to drop. Watch the pull request.
9. **Triage.** When the owner names tests to drop, move them to "Obsolete" in
   `docs/device-tests-done.md` with "Dropped by the owner, <date>", unchanged otherwise;
   update the report's numbers. If the owner names none, nothing moves.

## 7. Acceptance criteria

- **AC1.1** The root `CLAUDE.md` is at most 25 000 bytes. _Checked by:_ `wc -c CLAUDE.md`; `docsBudget` in `checks`
- **AC1.2** Every nested `CLAUDE.md` is at most 8 000 bytes. _Checked by:_ `docsBudget`
- **AC1.3** `docsBudget` runs in `npm run check` and in `checks`; it fails above a limit, warns above 90 % (as a job annotation in CI), and fails on a path that does not exist. _Checked by:_ unit tests (limits ±1 byte, warning band, missing path, placeholder skip, annotation format); a CI run of `checks`
- **AC1.4** `docs/device-tests.md` is at most 25 000 bytes, or `docsBudget` warns. _Checked by:_ `docsBudget` output in the report
- **AC2.1** No rule lost: `docsCoverage` lists no name from the old `CLAUDE.md`, except names the report explains as dropped history. _Checked by:_ `docsCoverage` output in the report
- **AC2.2** Every row of section 5 is found in its new place. _Checked by:_ one ticked line per row in the report
- **AC2.3** Hard rule 1, the section "Owner decisions" and the home domain rule are unchanged, word for word. _Checked by:_ `diff` of those blocks between the old and the new root file, in the report
- **AC2.4** The root index names every nested `CLAUDE.md`, `docs/architecture.md` and `docs/testing.md`, and every reference resolves. _Checked by:_ `docsBudget` link check; review
- **AC3.1** `docs/device-tests.md` holds only unticked tests; `docs/device-tests-done.md` holds every ticked test and the whole "Obsolete" section; the union of both files' entries equals the old file's entries, byte for byte. _Checked by:_ throwaway script in step 2, result in the report
- **AC3.2** The rule "Tests on real devices" in `CLAUDE.md` describes the two files. _Checked by:_ review
- **AC4.1** `CLAUDE.md` has the section "Docs hygiene" and Definition of Done item 11. _Checked by:_ review
- **AC4.2** The status table has one row per finished part with plan, report and "read before changing"; no narrative of renumbering beyond the note "Reading older docs". _Checked by:_ review
- **AC5.1** Nothing outside docs and CI changed: `git diff --name-only <base>` lists only `*.md` files, `scripts/ci/docsBudget.*`, `scripts/docsCoverage.mjs`, `package.json`, `.github/workflows/ci.yml`. _Checked by:_ `git diff --name-only`, in the report
- **AC5.2** `npm run check` and `npm run build` pass with zero warnings; `CI result` is green on the pull request. _Checked by:_ local runs; the pull request
- **AC5.3** The pull request carries the triage list of section 3, change 7. _Checked by:_ the pull request

## 8. Test strategy

- **Unit tests** (`scripts/ci/docsBudget.test.ts`, run by `npm test` like the other
  `scripts/ci/` tests): a root file of exactly 25 000 bytes passes, 25 001 fails; 22 500
  passes silently, 22 501 warns; the same for a nested file at 8 000 / 7 200; the device
  test list warns above 25 000 and never fails; nested files are found and the skipped
  directories are skipped; path tokens are found in backticks, with `:line` suffixes
  stripped and placeholders skipped; a missing path fails with its file named; the
  annotation format under `GITHUB_ACTIONS=true` and the plain format otherwise; exit code
  1 on an error, 0 with warnings only.
- **Checks by script, not committed:** the device test split (AC3.1) and the diff of the
  word-for-word blocks (AC2.3); their output goes into the report.
- **`docsCoverage`** (AC2.1), output in the report.
- **No browser tests** are affected: no game code, spec or screenshot changes (AC5.1). The
  pull request runs the full suite anyway, as it changes non-Markdown files; `CI result`
  must be green.
- **Coverage threshold:** `scripts/ci/` is not in the coverage scope (`vite.config.ts`
  `coverage.include`), as for the other CI scripts; nothing changes there.

## 9. Risks

- **A nested file is not loaded in some session** (another client, or a session that only
  greps). The index in the root still names it, and the invariants in the root are enough
  to avoid the worst mistakes. Step 7 records how a cloud session behaves.
- **A rule is moved into the wrong area** and a session changing that area misses it.
  Section 5 places the rules that span two areas in both (a sentence and a pointer), and
  `docs/architecture.md` is the fallback for anything that spans several.
- **The root grows again** with the next part. The budget check fails at 25 000 bytes and
  "Docs hygiene" says where new detail goes.
- **The link check gives false positives** on things that look like paths but are not
  (placeholders, URLs). The skip rules are listed in section 4.6 and covered by unit
  tests; a new kind of placeholder is added there, not worked around in the docs.

## 10. Out of scope

- Game code, the content of tests, reference screenshots.
- Rewriting old plans and reports; they stay as the record. Only references to moved
  content in living files (the root and the nested files, `docs/device-tests*.md`) are
  updated.
- Merging all reports' "Decisions and deviations" into one architecture document (a
  possible later round).
- Deciding on its own that an open device test is no longer needed (only the owner does,
  section 3, change 7).
