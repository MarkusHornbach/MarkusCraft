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

## Files of directories without a nested `CLAUDE.md`

- `src/main.ts`: entry point: reads URL params, checks WebGL2, starts the game.
- `src/util/`: `rng.ts`, `noise.ts`, `math.ts` (pure).
- `src/testing/` (helpers for tests only): `timing.ts`, `terrainChecksum.ts`,
  `sampleWorld.ts`, `lightChecksum.ts`, `lightScenes.ts` (tables with emitters, artificial
  volumes), `lightEdits.ts` (a lit test world, random edits), `netRig.ts` (a host and
  guests over the memory transport with a fake clock).
- `scripts/` (dev tools): `signalServer.mjs` (local PeerJS server, `npm run signal`),
  `figurePreview.ts` (sheet of all looks, front and back), `shot.mjs`, `atlasPreview.ts`,
  `iconPreview.ts` (sheet of all item icons), `terrainStats.ts` (terrain statistics and
  generation time), `perf.ts` (generation, light, meshing, edits), `compareShots.mjs` (old
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
