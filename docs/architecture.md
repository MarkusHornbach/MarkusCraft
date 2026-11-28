# Architecture

Read on demand. The invariants every session needs are in the root `CLAUDE.md`; the rules
of one directory are in that directory's `CLAUDE.md`. This file holds the overview, the
rules that span several areas, and the file lists of the directories without a nested
file.

## Data flow

```
input (keys, mouse, fingers, controller) ──► Input ──► Game (fixed 60 Hz steps)
                                                          │ builds an action
                                                          ▼
                       Session (LocalSession │ HostSession.local │ ClientSession)
                                                          │ applyAction (pure)
                                                          ▼
                       onBlocks / onPlayer / onResult ──► World.setBlock ──► light update
                                                          │
                       ChunkManager (generate → light → mesh) ──► ChunkMeshes ──► Renderer
```

- `src/main.ts` reads URL parameters, checks WebGL2 and starts `Game`
  (`src/game/Game.ts`), which owns the loop: the fixed timestep with an accumulator,
  rendering that interpolates, the screens and the world loading.
- Input from every source ends in `Input` (`src/input/CLAUDE.md`); game logic never asks
  which source or mode it came from.
- Every change to blocks or items is an action through the session
  (`src/actions/CLAUDE.md`). In a room the host's `HostSession` applies the actions of all
  players and sends the results; a guest only applies what the host sends
  (`src/net/CLAUDE.md`).
- The world's chunks go through the stages generated → lit → meshed
  (`src/world/CLAUDE.md`); light is derived from the blocks and never saved. Meshes and
  the shader turn light into colour (`src/render/CLAUDE.md`).
- Saving: `Autosave` decides, `IdbStore` writes `WorldMeta` and edited chunks
  (`src/save/CLAUDE.md`).

## Rules that span several areas

- **`Game.ts`** touches every area. When changing it, read the nested file of each area the
  change reaches: screens and multiplayer shell (`src/game/CLAUDE.md`), input and focus
  (`src/input/CLAUDE.md`), the inventory and recipe list (`src/ui/CLAUDE.md`), the
  performance test's side-effect rules (`src/bench/CLAUDE.md`), the break flow in rooms
  (`src/net/CLAUDE.md`, "Gathering together").
- **Timed breaking** spans `src/actions/` (the rule and the action clock), `src/items/`
  (break times, tools, gating), `src/net/` (host clock, grace rule) and `src/ui/Hud.ts` /
  `src/render/BreakOverlay.ts` (progress and cracks).
- **The torch** spans `src/world/` (flags, support rule, light, aim box), `src/render/`
  (`emitTorch`, the painted icon) and `src/items/` (recipe 20).
- **The figure** spans `src/player/` (looks, motion), `src/render/` (geometry, atlas, draw
  calls), `src/net/` (protocol), `src/ui/` ("Your player") and `src/game/` (identity).
- **The back guard** lives in `src/game/backGuard.ts`; its rule is in
  `src/input/CLAUDE.md`, as it pairs with the pad's B.

## CI jobs

`.github/workflows/ci.yml`; the summary and the rules for sessions are in the root
`CLAUDE.md`, section "CI".

- `changes` (always): `full`: push to `main` yes; pull request yes unless only `.md` files;
  other pushes no.
- `checks` (always): npm ci, actionlint (pinned, SHA-256 checked), lint, docs
  budget, type check, unit tests with coverage, unit tests with time limits.
- `build` (`full`): `npm run build`, uploads `dist/` (artifact `dist`).
- `e2e-game` (`full`, after `build`): four shards, `--project=game` with the specs of
  `e2e/shards.json`, blob report each.
- `e2e-mp` (`full`, after `build`): three shards, `--project=multiplayer` with the specs of
  `e2e/shards.json`, each with its own signaling server.
- `report` (`full`, after the shards): merges the blobs into HTML and JSON, timing summary
  in the job summary, artifacts `e2e-timings` (90 days) and, when a shard failed,
  `playwright-report` (14 days).
- `CI result` (always): the one required check: green only if every job that had to run
  passed and the others were skipped.

**Rebalancing:** a session that sees a green run above 25 minutes, or a shard above 15,
rebalances (`node scripts/ci/timings.mjs --assign <shard>=<json>... > e2e/shards.json`,
then `npm run format`) or adds a shard in its own part, and records it in its report.
Timing data: the `report` job's summary and its artifact `e2e-timings`.

Time limits per job: `changes` 5, `checks` 15, `build` 10, each shard 30, `report` 10,
`CI result` 5 minutes. **Spec lists per shard:** `e2e/shards.json` is made by `--assign` from the `e2e-timings`
JSON, longest spec first onto the shard with the least time; `timings.mjs --files <project> <n>`
gives a shard job its list; a new spec file needs nothing (it runs in the last shard of its
project until the next rebalancing places it). The artifact `e2e-timings` holds one JSON
per shard, `game-N.json` / `mp-N.json`, the merged `merged.json` and `summary.md`.

## Files of directories without a nested `CLAUDE.md`

- `src/main.ts`: entry point: reads URL params, checks WebGL2, starts the game.
- `src/util/`: `rng.ts`, `noise.ts`, `math.ts` (pure).
- `src/testing/` (helpers for tests only): `timing.ts`, `terrainChecksum.ts`,
  `sampleWorld.ts`, `lightChecksum.ts`, `lightScenes.ts` (tables with emitters, artificial
  volumes), `lightEdits.ts` (a lit test world, random edits), `netRig.ts` (a host and
  guests over the memory transport with a fake clock), `terrainMeasure.ts` (plains, water,
  trees, open land, ores per terrain; Phase 7 part A), `startingTables.ts` (the progress
  tables with the plan's starting values, so engine tests do not follow the tuning).
- `scripts/` (dev tools): `signalServer.mjs` (local PeerJS server, `npm run signal`),
  `figurePreview.ts` (sheet of all looks, front and back), `shot.mjs`, `atlasPreview.ts`,
  `iconPreview.ts` (sheet of all item icons), `terrainStats.ts` (terrain statistics per
  generator preset and generation time), `progressRun.ts` (the goal bot over 12 worlds:
  `src/bot/CLAUDE.md`), `perf.ts` (generation, light, meshing, edits), `compareShots.mjs` (old
  reference next to new), `benchRun.mjs` (plays the performance test headlessly),
  `perfRuns.ts` (comparison table from saved `perf-run` issues), `editCost.ts` (where an
  edit's time goes on the `edit` route; run it bundled), `docsCoverage.mjs` (names of an
  old `CLAUDE.md` missing from today's rule files).
- `scripts/ci/` (the CI jobs' logic, no dependencies): `changes.mjs` (does the run need the
  full suite), `ciResult.mjs` (the verdict of `CI result`), `timings.mjs` (blob reports'
  JSON → timing summary; `--assign`: spec lists per shard; `--files`: the specs of one
  shard job), `docsBudget.mjs` (sizes of the `CLAUDE.md` files and the device test list,
  the link check); unit tests `*.test.ts` next to them. Before changing them or `ci.yml`
  read the "Decisions and deviations" of `docs/ci-1-report.md`.
- `.github/workflows/`: `ci.yml`, `deploy.yml`.
- `docs/`: phase plans and reports, `ci-1-plan.md` and `ci-1-report.md` (CI round 1),
  `docs-1-plan.md` and `docs-1-report.md` (Docs round 1), `device-tests.md` (the open
  tests on real devices, filled out by the owner) and `device-tests-done.md`,
  `architecture.md` (this file), `testing.md` (the test API).

## Network overlay and traffic

Moved from `src/net/CLAUDE.md` (Phase 6 part E, "Measure and harden").

The F3 overlay has five network rows, shown only in a room (`netRows`,
`Multiplayer.debugInfo`): role, status, code and players; the round trip (a guest's own; on
the host what each guest reports in `ping.rtt`); the link of each connection from
`getStats()` every 2 s (`linkKind`: "direct", "via STUN", "relay"); the signaling state;
messages and bytes per second in and out over the last 2 s, counted by a `TrafficMeter`
around the room's network (`countedNetwork`). `traffic.ts` and the stats code are in the
lazy session chunk. Relayed poses are cut to millimetres and 1e-4 rad (`compactPose`) and
leave out flags that are false: with four moving players the host sends about 13 kB/s
(AC14.6, limit 20). The scenario `players`: `src/bench/CLAUDE.md`.

## Radar on screen

Moved from `src/radar/CLAUDE.md` (Phase 8 parts B1, B2b, B3b).

The circle (`RadarCircle`, in the HUD, so it hides with it): heading-up, a cube-root
distance scale (near veins spread out; the rim is 48), coal a dark dot with a light rim,
iron a tan diamond, a shaft a light brown hollow square, a cave a grey downward triangle, a
chest a filled amber square with a dark band;
hint labels upright, nearest first, one that would cover another is left out; `beyond`
arrows on the rim. Size: the setting "Radar circle size" (`settings.radarSize`, 0–2,
default 1 Medium): PC 112 / 168 / 224 px, top-right 12 px; touch 88 / 128 / 168 px below
the bag button, never larger than the room down to 4 px above the highest right-hand
button (`Game.touchCircleRoom`; never below Small); symbols and labels grow with √(size /
Small). The bench keeps Small. Shown in Adventure while playing, unlocked, with the setting
"Radar circle" on, or in the bench scenario `radar`. The Map tab (`MapTab`): north-up,
linear, rings at 16/32/48, a background of the loaded chunks' top blocks (leaves included,
shaded by height, cached per chunk while the tab is open, redone on `onBlocks` or a
reloaded chunk), the player arrow, up to 8 veins and 4 places per kind and one legend row
per kind shown ("Shaft · 24 blocks · far", "Cave · none within 192"). On the Map tab the
panel fills the screen (12 px margin); the canvas is the largest square leaving the legend
200 px; symbols and labels grow with the square (up to 2.2 ×). On screens up to 480 px high
the header (tabs in two rows, Close) moves beside the map above the legend, so the square
is as high as the screen (640 × 360: 348 px). F3 row "Radar".

## Reading older docs

Multiplayer was "Phase 4" in the Phase 3 documents and "Phase 2, Part B" in
`docs/phase-2-plan.md` (now Phase 6; never implement 2B); Phase 3 part D (Web Workers) is
now Phase 4 part C (never implement 3D); personalization was Phase 5; "Part D" and
"AC11.x" in the reports of 6B and 6C mean Part E and AC14.x (Part D, the figure, was
inserted later); Polish 1 and 2 name their criteria "Polish 1 AC1.1", "Polish 2 AC1.1"
and their device tests' origins "P1", "P2".
