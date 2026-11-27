# Phase 8 part B2a report – Generator 3 (caves and mine shafts)

Plan: `docs/phase-8b2-plan.md` (sections 6.1–6.9, AC1–AC4). Branch
`claude/beautiful-cerf-06nl4f` (the session's branch, which also holds the plan).

## What was built

- **Generator 3** (`src/world/generation/terrainV3.ts`): version 2's terrain for the same
  seed and options, then carving and mine shafts between the ores and the trees. Version
  2's chunk was split into phases (`fillBase`, ores, `placeTreesPhase`, tree hooks) without
  changing its output (the twelve V2 checksums and the speed solo test are untouched).
  Every new world gets it (`GENERATOR_VERSION` 3, both modes); the world list says
  "· Caves", F3 "Generator 3 · balanced · few". The `?test=1` world and the bench world stay
  generator 1; `gen=2|3` makes a test world of another generator.
- **Tunnels, chambers, ravines** (`caves.ts`): per 64 × 64 region 0–4 tunnels (70 %
  entrances), chains of capsules rasterized once per region into column spans; a carve
  mask per chunk (bits, cached). Entrances start on dry land and descend 0.4–0.55 per
  block to 16–30; deep tunnels wander at 10–36. Water, soil and bedrock rules drop a
  tunnel as a whole; a crossing rule keeps every entrance's floor whole. Ravines: one per
  256 × 256 at 50 %, 64–80 long, V-shaped, ends rising 0.9 per block.
- **Mine shafts** (`shafts.ts`): a 7 × 7 footprint with a 3 × 3 well, a central log
  column, a spiral of plank steps with a torch every 4 steps, a log frame with a plank
  lintel, a stone-brick chamber at 10–14 with two torches. One per 160 × 160 grid cell at
  70 % where it fits, plus the spawn shaft 24–128 blocks from the spawn.
- **Spawn, trees**: the spawn wants no carved cell within 2 columns and 8 below; no tree or
  leaf over a carved column or in a shaft footprint. `findSpawn` returns the terrain's own
  `spawnPoint()` (computed without the shafts, which depend on it).
- **Radar**: `TerrainV3.oreHost` excludes carved and shaft cells; nothing in `src/radar/`
  changed. `agreementV3.slow.test.ts` covers the twelve presets, four seeds, two squares,
  the spawn shaft and a ravine per preset.
- **Walk check** (`src/bot/walk.ts`, `caveWalks.ts`): a breadth-first search over
  standing cells with an optional torch-light floor; checks entrances, ravines and the
  spawn shaft (slow test, and a "Generator 3" section of `scripts/progressRun.ts`).
- **Bot**: `scripts/progressRun.ts` runs generator 3 by default, `--gen 2` for comparison;
  `botV3.slow.test.ts` is a generator 3 run.
- **Bench**: scenario `caves` (version 1), suite version 5.
- **Browser**: `e2e/caves.spec.ts` (form, F3, world list, `gen=3`, checksum, light after
  breaking into a tunnel through actions, three references), `e2e/mpCaves.spec.ts` (room).
  Test API `caveSites()`.
- **Docs**: `src/world/generation/CLAUDE.md` (new; took the section "Generator version" of
  `src/world/CLAUDE.md`, which shrank from 7.4 KB to 4.6 KB), nested files of bot, bench,
  radar, `docs/testing.md`, device tests CAVE-1 to CAVE-6, root status row.

## Measured numbers (Node, this container; never device evidence)

Faces per chunk, 9 × 9 chunks at the origin, trees "few" (`caveCost.slow.test.ts`):

| Seed | Flat                 | Balanced             | Hilly                |
| ---- | -------------------- | -------------------- | -------------------- |
| 1    | 880 → 995 (1.13 ×)   | 924 → 1060 (1.15 ×)  | 963 → 1099 (1.14 ×)  |
| 42   | 433 → 557 (1.29 ×)   | 442 → 566 (1.28 ×)   | 466 → 589 (1.27 ×)   |
| 1337 | 707 → 810 (1.15 ×)   | 758 → 870 (1.15 ×)   | 802 → 898 (1.12 ×)   |
| 2024 | 1046 → 1228 (1.17 ×) | 1090 → 1269 (1.16 ×) | 1093 → 1260 (1.15 ×) |

Median 1.15 × (budget 1.5 ×), largest 1.29 × (budget 2 ×). Carved share of the solid cells
below y 45: 0.45–0.94 % (median about 0.65 %).

| Budget                                            | Generator 2    | Generator 3                    | Ratio (limit)             |
| ------------------------------------------------- | -------------- | ------------------------------ | ------------------------- |
| Generation per chunk, 15 × 15 chunks, spawn known | 0.27 ms        | 0.36 ms                        | 1.29–1.32 × (1.35)        |
| First chunk of a world (spawn and spawn shaft)    | –              | median 7–22 ms, worst 21–36 ms | limit 400 ms              |
| Light per chunk (`lightChunk`)                    | 0.69 ms        | 0.74–0.76 ms                   | 1.08–1.10 × (1.5)         |
| Meshing per chunk with light                      | 3.66–3.76 ms   | 3.77–3.90 ms                   | 1.02–1.04 × (1.5)         |
| Radar scan warm / cold (B1's set-up)              | 1.07 / 11.6 ms | 1.05 / 12.3 ms                 | 0.98 / 1.06 × (1.3 / 1.5) |

Per 1 000 × 1 000 blocks (12 worlds, seeds 1, 42, 1337, 2024 × shapes, few trees): 118
entrances, 107 deep tunnels, 3.4 ravines, 7.9 mine shafts (most grid candidates do not fit:
dry land, flat enough, no cave near).

Spawn shaft distances over the 48 cases (4 seeds × 12 presets): 24–32 blocks, all within
24–64 (AC1.5: at least 44 of 48; none needed the outer rings up to 128).

Walk checks (`caveWalks.slow.test.ts`, 48 worlds): 166 entrances within 96 blocks of the
spawn walked down to y ≤ 30 and back, 36 ravines' floors reached, 48 spawn shafts walked
top → chamber → top on block light above 4.

### The bot (`scripts/progressRun.ts`, 12 runs each)

All 12 runs complete on both generators. Estimated player minutes (medians, max):

| What                          | Generator 2 | Generator 3 |
| ----------------------------- | ----------- | ----------- |
| 6 Mine 64 stone               | 4.3 (4.5)   | 4.3 (4.5)   |
| 11 Make 16 coal               | 3.2 (4.7)   | 3.2 (4.4)   |
| 12 Mine 32 coal               | 4.4 (5.8)   | 4.3 (5.8)   |
| 14 Reach depth 30             | 1.7 (2.4)   | 1.4 (2.4)   |
| 16 Mine 20 iron ore           | 3.4 (3.9)   | 3.3 (4.5)   |
| 19 Make 24 glass              | 4.4 (6.2)   | 4.2 (6.1)   |
| Chapter 3 Stone and fire      | 8.4 (9.1)   | 7.8 (9.1)   |
| Chapter 4 Into the dark       | 6.8 (8.0)   | 6.4 (8.2)   |
| Chapter 5 Iron                | 8.0 (9.7)   | 7.7 (9.5)   |
| Total                         | 32.3 (38.0) | 31.7 (37.8) |
| Largest gap between level-ups | 7.4 (11.3)  | 7.5 (11.3)  |

Every other task is the same on both (≤ 0.1 min apart). The targets hold on generator 3
(total 30–45, no task median over 5, no chapter over 12, level gap ≤ 8).

Dark breaks before a light source (tasks 1–11), identical on both generators:

| Task                   | All: median | All: max | Ores: median | Ores: max |
| ---------------------- | ----------: | -------: | -----------: | --------: |
| 6 Mine 64 stone        |          20 |       47 |            0 |         0 |
| 7 Make a stone pickaxe |           0 |        1 |            0 |         0 |
| 8 Climb to height 64   |           0 |       64 |            0 |         3 |

AC3.5's limit (generator 3 at most 2 above generator 2 per task) holds with 0. Radar at
tasks 12 and 16: agrees with brute force in all runs on both generators (iron: median
distance 4.4 blocks on generator 3, 6.8 on generator 2). Generator 3 section: 43 of 43
entrances near the spawns and 12 of 12 spawn shafts walked; the walk from the spawn to the
spawn shaft's chamber takes a median of 69 steps.

## Decisions and deviations

1. **Density is lower than the plan's "about 2 %"**: carved 0.45–0.94 %. The face budget
   had room (1.15 ×), but generation did not: caves cost noise heights for the water rule
   and a region's ring around the loaded area. With 0–6 tunnels per region generation
   came to 1.38–1.44 ×; 0–4 with 70 % entrances (the plan's fallback: prefer entrances)
   gives about 1.3 ×. Entrances per area were kept high (118 per km²).
2. **Generation is measured over 15 × 15 chunks** (what the phone's default render
   distance 5 generates) with the spawn known for both generators. Over 9 × 9 chunks the
   regions around the area weigh more (about 1.3 ×). The 1.35 × limit has little room
   (1.29–1.32 × here); see "Known issues".
3. **Crossing rule** (not in the plan): where another tunnel cut an entrance's floor, the
   way back up broke (a drop of more than one block). A deep tunnel that touches an
   entrance is dropped, of two touching entrances the earlier stays. It is decided on the
   entrances' candidate shapes (before the water rule), so it needs no heights of the
   neighbouring regions and never depends on the order regions are worked out.
4. **Cheap, proven water test**: the water rule skips columns far on the land side of the
   continent noise. Two bounds, each with a unit test: c ≥ 0 means a height of at least 50
   for every shape (`LAND_MIN_HEIGHT`), and c changes by at most 0.12 per block
   (`CONTINENT_SLOPE`, from the simplex kernel's gradient bound); checksums of generators 1
   and 2 are unaffected (only generator 3 calls it).
5. **Capsules are rasterized per column**: a column within the radius of a segment's
   ground projection carves one interval around the axis height above its nearest point
   (down 0.75 × radius, up 1 × radius, shrinking towards the rim). The floor follows the
   axis exactly, which keeps entrances walkable, and costs one interval per column.
6. **Bedrock rule as a clamp**: carving never reaches y ≤ 2 (spans are clipped). Tunnels
   are at 8 and above, so the clamp only trims chamber floors; dropping whole tunnels for
   it was not needed.
7. **Water rule**: "within 2 blocks horizontally and above" is read as: a cell is
   forbidden if a column within 2 (Chebyshev) has its top at or below sea level and the
   cell lies at most 2 below that top. Ravines are dropped if any column lies within 2 of
   such a column.
8. **Tunnels never carve a shaft footprint**: rather than cutting tunnels at shafts, a shaft
   site needs no carved cell within one column of its footprint (at any height). So the
   spawn (which needs the carve mask) never depends on shafts, and AC1.3's "no carved cell
   in a shaft footprint" holds by construction.
9. **Shaft layout**: 7 × 7 footprint (the well 3 × 3, its wall ring, the chamber's outer
   ring); collar at the lowest height of the footprint (higher columns are cut down to it,
   so no part floats); lintel 4 above the collar; the stairs' entry chosen so the last step
   lands next to the chamber corner. Torches stand in the step cells (every 4 steps, on the
   plank below); the chamber's floor is stone bricks.
10. **Spawn shaft search**: rings every 4 blocks from 24 to 128, sites every 6 blocks of
    arc, from a hashed angle. All 48 cases found a site at 24–32.
11. **Ravine parameters**: 64–80 long (plan 40–80) and ends rising 0.9 per block (plan "at
    most 1"); shorter ravines never reached their floor height. The floor of 14–24 is
    reached only where the ends allow it; the shape records its lowest floor cell.
12. **Walk check details**: a jump needs the cell above the head free; drops of any height
    are allowed; water and leaves are never entered. Entrances are walked in their own
    cells and on the surface within 6 blocks beside them (a tunnel may come out of a
    hillside and go on across a valley), never in another cave or a shaft; the way back is
    checked from the highest deep cell that returns. Ravines: from a standing cell at the
    first end (up to 3 columns aside where a tree stands) down to the lowest floor cell.
13. **`getState().world.generator`**: the existing `getState().world.generatorVersion`
    carries the version; no new field.
14. **Bench `caves`**: appended at the end of the table (not next to `walk`), so the
    runner loads its generator 3 world inside the block without a ready time and the next
    block starts fresh in the bench world. The start page says "Takes about 5 minutes"
    (the suite is now 300 s of measured steps).
15. **Bot fix**: on generator 3 the bot failed twice placing a pillar block into a cell
    holding a torch (its own); it now takes a torch out of its feet cell first.
16. **`ColumnCache`** keeps 4 096 effective slots whatever its size (its slot uses the top
    12 bits). A fix made generation slower (larger arrays); left as is, noted here.
17. **Checksums**: "flat/many" and "balanced/many" of generator 3 equal generator 2's (their
    spawn and spawn shaft lie far from the origin and no tunnel touches the 3 × 3 chunks);
    the Node tests and the room spec cover chunks with caves.

## Tests changed on purpose

- `src/save/saveFormat.test.ts`, `src/world/generation/terrainV1.test.ts`,
  `worldOptions.test.ts`: generator 3 is known now; the "newer"/"unknown" cases use 4.
- `src/util/repoHygiene.test.ts`: 55 reference screenshots (three new ones).
- `src/radar/agreement.slow.test.ts`: the comparison moved to
  `src/testing/radarAgreement.ts` (same checks).
- `src/bench/scenarios.test.ts`, `BenchRunner.test.ts`, `e2e/bench.spec.ts`: the table, the
  suites (17 entries), suite version 5, the loads (`caves` loads its own world), the hint.
- `e2e/worldMenu.spec.ts`, `e2e/inventory.spec.ts`: worlds of the form are generator 3
  ("· Caves"; "Phase 7 AC5.1" now checks generator 3's checksum and spawn).

## Known issues

- **Generation's margin is small** (1.29–1.32 × against 1.35 ×). If the solo test proves
  flaky in CI, the fix is a test of the same budget over more rounds, not a change of
  generator 3 (frozen).
- The walk check judges reachability, not comfort: some entrances have 2-block drops a
  player cannot climb back (another way back exists); CAVE-2 judges how it feels.
- `e2e/mpRooms.spec.ts` "Phase 6 AC5.5: the time of day follows the host" failed once in a
  parallel local run and passed alone (screen brightness under load; not touched here).

## For the Pi side

Nothing new: no build variables, packages, signaling requests or lazy chunks; the room
protocol is unchanged. A guest on an older build refuses a generator 3 room ("Saved by a
newer version"), so host and guest must use the same build (the PR preview, or the main
build after the merge). `sync/status.md` of the Pi repository was not read (the session
had no access to that repository).

## Device tests

CAVE-1 to CAVE-6 in `docs/device-tests.md`, section 12. None became pointless.

## Suggestions for the next part

- B2b can take places from `TerrainV3.caves.shapesIn` (entrance mouths: `startX/Y/Z`) and
  `shafts.shaftsIn` (top cell: `shaftTopCell`); `caveSites` shows how.
- If CAVE-1 shows the phone struggling, a renderer change (hiding cave faces nobody can
  see) helps every cave generator; a generator 4 with fewer tunnels is the other way.
