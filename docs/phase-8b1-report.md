# Phase 8 part B1 report – the radar

Plan: `docs/phase-8b1-plan.md` (acceptance criteria Phase 8B1 AC1.1–AC7.4). Built on the
cloud session's branch `claude/wizardly-volta-0v520p`, which held the plan on top of
`main`.

## What was built

- **Generation** (`src/world/generation/`): the vein walk of `ores.ts` is shared
  (`walkVein`; `veinCells(kind, kindSeed, cellX, cellY, cellZ, out)` for the radar,
  `placeKind` for generation). `TerrainSource.oreHost(x, y, z)` in versions 1 and 2: stone
  from 1 to `stoneTop` (a rock column's height, else `h − DIRT_DEPTH − 1`); the rock rule
  is one method `rockOf` used by the chunk loop and `isRock`; `stoneTop` is cached per
  column (`columnCache.ts`, 4 096 slots, direct-mapped). Output unchanged.
- **The radar core** (`src/radar/`, pure, in the purity rules and the coverage scope):
  `kinds.ts`, `veins.ts` (`VeinIndex`), `scan.ts` (`scanRadar`, hints, `worldProbe`),
  `focus.ts`, `map.ts`, `schedule.ts` (scan and draw pacing, the F3 text). Constants
  `RADAR_*` in `config.ts`.
- **The unlock** (`src/progress/`): `FEATURE_UNLOCKS` (`radar` → task 8),
  `featureUnlocked`, `featuresOfTask` / `featuresOfLevel`, `features` in the `unlocked`
  and `levelUp` outcomes (steps and guests), "Unlocked: Radar", `featureLockText`, the
  static check's feature rules.
- **The bot** (`src/bot/`, `scripts/progressRun.ts`): the radar checks at tasks 12 and 16,
  `radarUnlocked`, `radarAtMs`, the "Radar" section (`formatRadar`).
- **The circle** (`src/ui/RadarCircle.ts`, `src/ui/radarDraw.ts`, `src/game/Radar.ts`,
  `Game`): heading-up, top-right (touch: below the bag button), the setting "Radar
  circle", the F3 row "Radar", `getState().radar`.
- **The Map tab** (`src/ui/MapTab.ts`, `InventoryScreen`): the fourth tab, locked text,
  north-up map with the loaded terrain, rings, veins, rim arrows and a legend;
  `getState().map`.
- **Rooms**: nothing new in the protocol; `e2e/mpRadar.spec.ts`.
- **Bench**: scenario `radar` (version 1), `BENCH_SUITE_VERSION` 4, `Scenario.radar`,
  `Scenario.yaw`, `BenchHost.setYaw`.
- **Docs**: `src/radar/CLAUDE.md`; the nested files of world, progress, ui, input, bench,
  bot, game; `docs/testing.md`; root `CLAUDE.md`; device tests RADAR-1 to RADAR-7.

## Acceptance criteria

| Criterion | Where                                                                      | Result                                                    |
| --------- | -------------------------------------------------------------------------- | --------------------------------------------------------- |
| AC1.1     | `src/radar/agreement.slow.test.ts` (4 seeds × 13 generators × 2 squares)   | passes, prediction equals the ores cell by cell           |
| AC1.2     | `src/radar/scan.test.ts`                                                   | passes, `verifyLight()` 0                                 |
| AC1.3     | `scan.test.ts` (order, borders 24.01 / 24 / 12.01 / 12, "=")               | passes                                                    |
| AC1.4     | `scan.test.ts`                                                             | passes                                                    |
| AC1.5     | `src/radar/focus.test.ts`                                                  | passes                                                    |
| AC1.6     | checksum tests untouched, both generation speed solo tests                 | pass                                                      |
| AC1.7     | `src/radar/scanCost.solo.test.ts`                                          | passes (numbers below)                                    |
| AC2.1     | `src/progress/features.test.ts`, `tables.test.ts`                          | passes                                                    |
| AC2.2     | `features.test.ts` (`stepProgress`, `noticeTexts`, `outcomesOfBook`)       | passes                                                    |
| AC2.3     | `features.test.ts`                                                         | passes                                                    |
| AC2.4     | `src/bot/bot.slow.test.ts`                                                 | passes                                                    |
| AC2.5     | `npx vite-node scripts/progressRun.ts` (below)                             | 12/12, radar agrees in every run                          |
| AC3.1     | `e2e/radar.spec.ts` (play, inventory, pause, Creative, fresh, setting off) | passes                                                    |
| AC3.2     | `radar.spec.ts` (PC), `e2e/radarTouch.spec.ts` (640 × 360, 1280 × 720)     | passes                                                    |
| AC3.3     | `radar.spec.ts` (`entries[].screen`)                                       | passes                                                    |
| AC3.4     | `radar.spec.ts`, `src/radar/schedule.test.ts`                              | passes                                                    |
| AC3.5     | `radar.spec.ts` (menu flow, reload), `src/ui/settings.test.ts`             | passes                                                    |
| AC3.6     | `radar.spec.ts`                                                            | passes                                                    |
| AC3.7     | references `radar-circle`, `radar-circle-touch`                            | looked at                                                 |
| AC4.1     | `e2e/radarMap.spec.ts` (mouse, tap, Creative), `gamepadInventory.spec.ts`  | passes                                                    |
| AC4.2     | `radarMap.spec.ts`                                                         | passes                                                    |
| AC4.3     | `radarMap.spec.ts`                                                         | passes                                                    |
| AC4.4     | `radarMap.spec.ts` (every cell mined through `startBreak` / `break`)       | passes                                                    |
| AC4.5     | `radarMap.spec.ts`, references `map-tab`, `map-tab-touch`                  | passes, looked at                                         |
| AC5.1     | `e2e/mpRadar.spec.ts`                                                      | passes                                                    |
| AC5.2     | `src/net/protocol.ts` not touched; its tests unchanged                     | holds                                                     |
| AC6.1     | `scenarios.test.ts`; `e2e/bench.spec.ts` quick run; a local run (below)    | passes                                                    |
| AC6.2     | `docs/device-tests.md`, section 11                                         | added                                                     |
| AC7.1     | `npm run check`, `npm run build`, the specs below                          | pass, no console messages                                 |
| AC7.2     | `SAVE_FORMAT_VERSION` 5, save tests untouched; the unlock reads the book   | holds (generator 1 worlds work: AC1.1 covers generator 1) |
| AC7.3     | older specs, changed only as listed below                                  | pass                                                      |
| AC7.4     | `src/radar/CLAUDE.md`, root `CLAUDE.md`, `npm run docs:budget`             | passes                                                    |

Browser specs run locally (alone, `MC_CONTAINER_GPU_STALL=1`): `radar`, `radarTouch`,
`radarMap`, `mpRadar`, `gamepadInventory`, `padSoak`, `leaves`, `gamepadMenus`, `ui`,
`touchLayout`, `taskTracker`, `progress`, `progressTouch`, `playerSection`,
`inventoryScreen`, `crafting`, `light`, `night`, `torch`, `worldMenu`, `bench`.

## Decisions and deviations

| Topic                      | Decision                                                                                                                                                 | Why                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Shared vein walk           | Shared: `walkVein` writes the box offsets, `placeKind` and `veinCells` both call it (no second copy)                                                     | Both generation speed solo tests pass with it                                                                                 |
| "Taken by an earlier kind" | A cell of an earlier kind's vein (within its height range) in the 3 × 3 ore cell columns around; the cell itself must be an ore host anyway              | Equals "that kind already turned the stone to ore" without a recursion; the agreement test proves it                          |
| `beyond`                   | The nearest counting cell of the kind by 3D distance, if that distance is at most 96                                                                     | The plan leaves the metric open; 3D matches the entries' distance                                                             |
| One scan for both surfaces | The scan always takes 8 per kind of every kind; the circle shows the first 4 of its kinds (all, or the focus)                                            | The 4 nearest are the first 4 of the 8 nearest; the map needs no second scan                                                  |
| Circle scale               | Cube root of the horizontal distance (the rim is still 48), not linear                                                                                   | Linear crowded the nearest veins (usually 3–10 blocks) into the middle fifth of the circle (looked at in the first reference) |
| Labels                     | Written nearest first; a label that would cover one already written is left out (the symbol stays)                                                       | Eight labels on 88 px overlapped                                                                                              |
| Map background             | The top block that is not air, leaves included (`topBlockOf` on the chunk data), not `World.surfaceY`                                                    | `surfaceY` skips leaves; with them forests show as forests. Also faster (chunk arrays, no per-cell lookups)                   |
| Map scale and legend       | Linear (rings at 16, 32, 48); the legend always beside the map                                                                                           | Rings mean distances; the panel (524 × 284, touch 300) is always wider than tall                                              |
| Loaded chunks changed      | Looked at when the world's chunk count changes: a signature of the loaded chunks within `ceil(98 / 16)` chunks                                           | Cheap per step; a scan only when the chunks around actually changed                                                           |
| Test tool `setBlock`       | Also tells the radar and the Map tab (as `onBlocks` does)                                                                                                | Specs that build with it see a correct radar                                                                                  |
| Room spec: the host mines  | With the test tool `setBlock` (it broadcasts like an action)                                                                                             | Timed breaks of a whole vein through a room take long; the guest's side (what AC5.1 checks) is the same                       |
| Touch layout specs         | Use the menu flow (`openTouchAdventure` in `e2e/radar.ts`) and `setProgress`                                                                             | Test mode keeps the page at 960 × 540, so phone layouts are not real there                                                    |
| Settings on phones         | The switch rows ("Collide with leaves", "Radar circle", "Debug overlay") stand two per line on screens up to 480 px high                                 | With the new row the pause menu was 20 px taller than 360 px (`touchLayout` AC3.1)                                            |
| `features` in outcomes     | Present only when non-empty                                                                                                                              | Older outcome tests stay as they were; JSON stays the same for tasks without a feature                                        |
| Static check               | A stuck chapter names only features of its own stuck tasks; after the book, any feature whose task was not done or level not reached                     | A stuck chapter 1 would otherwise name the radar too, changing older failure texts                                            |
| F3 row                     | Counts what the circle shows ("4 coal · 4 iron"), the last scan and draw time                                                                            | The plan's example counts the circle                                                                                          |
| Files                      | Extra: `src/radar/schedule.ts` (pure pacing), `src/game/Radar.ts`, `src/ui/radarDraw.ts`, `src/world/generation/columnCache.ts`; spec `radarMap.spec.ts` | The pacing is unit-tested in Node; the AC4 specs got a file of their own next to `radar.spec.ts`                              |
| Bench `radar`              | The walk input with the view turning 1.5° per step: the player walks a circle of about 3.6 blocks radius                                                 | The heading-up circle draws at its cap and the feet cell changes, so it scans too                                             |
| `getState().radar.draws`   | Counts the circle's draws; the Map tab's are `getState().map.draws`                                                                                      | AC3.4 is about the circle                                                                                                     |

### Tests changed on purpose

- `src/ui/settings.test.ts`: the expected settings objects have `radar: true`.
- `src/bench/BenchRunner.test.ts`: the fake host has `setYaw`; the quick suite has 15
  entries, `radar` walks like `walk` (moving steps), its catch-up time is null.
- `src/bench/scenarios.test.ts`: the full and quick suites have `radar` after `players`.
- `src/util/repoHygiene.test.ts`: 52 reference screenshots (four new).
- `src/bench/scenarios.test.ts`: the table pin has `radar`, `BENCH_SUITE_VERSION` 4.
- `e2e/crafting.spec.ts` Phase 3 AC12.1 and AC12.5: four tab buttons ("Map").
- `e2e/gamepadInventory.spec.ts` Phase 5 AC5.3: RB reaches "Map" after "Tasks" and stays
  there; LB goes back through Tasks.
- `e2e/padSoak.spec.ts` Part B: the tabs seen contain items, crafting and tasks and may
  contain map (the seeded walk reaches it only with one more RB in a row).
- `e2e/touchLayout.spec.ts` Phase 3 AC12.6: five header buttons (four tabs and "Close").
- `e2e/bench.spec.ts`: the full order and the quick run have 15 entries (suite 4); the
  sample result keeps its 13 rows.

### References

New: `radar-circle`, `radar-circle-touch`, `map-tab`, `map-tab-touch` (all looked at:
coal dots and iron diamonds apart, hints upright, the circle clear of the buttons; on the
map water, beach, grass and forest apart, rings and legend readable). Regenerated and
looked at, with a real change: `gathering-hud`, `stations` (the circle top-right),
`inventory`, `inventory-touch`, `item-icons`, `pad-inventory`, `pad-recipe-list`,
`recipe-list`, `recipe-list-locked`, `recipe-list-touch`, `tasks-tab`, `tasks-tab-touch`
(the fourth tab), `pause-screen`, `pad-pause` (the "Radar circle" row). Regenerated in the
same run without a real change (under 0.2 % of the pixels, rendering noise) and left as
they were: `pad-glyphs`, `palette`, `progress-notice`, `room-window`, `torch-closeup`,
`torch-night`, `torch-tunnel`, `touch-controls`, `tree-shade`, `tunnel-day`.

## Known issues

- A cold scan (new area, empty vein index) costs about 19 ms in Node, several times that
  on a phone; it happens once when a world opens and in small parts while walking into new
  ore cell columns. RADAR-2 decides whether that is felt.
- The map shows the loaded chunks only (render distance + 2); at render distance 2 that is
  enough for its 48 blocks.

## Measured performance

Node (this container, `scanCost.solo.test.ts`, seed 1337 balanced/few, all chunks within
64 blocks loaded, 30 rounds after 20 warm-up rounds): warm index best 1.46 ms, median
1.74 ms; cold index best 16.0 ms, median 19.3 ms. Limits: 10 ms and 80 ms (more than three
times the medians). The agreement test takes about 3 s.

Browser in this container (software WebGL, never evidence): the F3 row showed "scan 32.7
ms · draw 9.1 ms" for the first, cold scan.

The goal bot (`npx vite-node scripts/progressRun.ts`, 12 runs, unchanged book): every run
complete, total 32.3 minutes median (38.0 maximum), as before.

```
Radar (12 runs)

Unlocked in 12 runs: median 8.9 min, max 11.8 min

| At the start of | Kind | Runs | Distance: median | dy: median | Agrees with brute force |
| --- | --- | ---: | ---: | ---: | --- |
| 12 Mine 32 coal | coal | 12 | 6.1 | -4.5 | yes |
| 16 Mine 20 iron ore | iron | 12 | 6.8 | 1 | yes |
```

Local bench (`node scripts/benchRun.mjs 1`, full suite 4, this container's SwiftShader, a
smoke check only, never evidence): the run completed every scenario. `radar` 16.7 fps at
render distance 5 and 10.0 at 8, next to `walk` 10.8 and 7.6 (the radar walks a small
circle, so it loads less than `walk`; its chunk work max 7.4 and 8.5 ms). The comparison
that counts is RADAR-1 on the phone.

## Tests on real devices

New in `docs/device-tests.md`, section 11 "Radar (Phase 8 part B1)": RADAR-1 to RADAR-7.
None became pointless.

## Hard rule 1

All symbols, colours, the map tiles and the arrows are drawn by code; no images were
added except the four new test references. The labels are generic words ("Radar", "Map",
"Coal", "Iron"). No third-party names or assets.

## For the Pi side

Nothing new: no build variables, packages, signaling requests or lazy chunks; the room
protocol is unchanged. The PR preview and, after the merge, the main build are built as
usual. The Pi must stay resumed while the pull request is open, so the owner can play the
preview.

## Suggestions for the next part

- B2 (caves, special places): a generator with caves adds its cave test to its `oreHost`;
  special places can be a second provider of radar entries next to `VeinIndex`.
- If RADAR-2 shows the cold scan on a phone, build the index columns over several steps
  (nearest first) instead of in one scan.
- RADAR-4 and the bot's distances (about 6–7 blocks to the nearest vein at tasks 12 and 16) can tune `RADAR_EXACT_DIST` and the number of veins on the circle.
