# Phase 4 part A report – Light

Plan: [`phase-4-plan.md`](phase-4-plan.md), Part A (steps 1–5). Branch
`claude/funny-babbage-tw8vgx`, implemented in one cloud session. Part B (torch, darker
night) starts after this part is merged; Part C (Web Workers) is optional.

## What was built

- **Light rules** (`src/world/light/lightRules.ts`): two channels per cell, each 0–15,
  packed into one byte; the step rule (`stepLight`); the tables of opacity and emission.
  The block table has `opacity` (air and glass 0, leaves and water 1, everything else 15)
  and `emission` (0 for every block until Part B), with lookup arrays.
- **Light from scratch** (`lightChunk.ts`): the light of a chunk from the blocks of its
  3 × 3 chunks. Open columns need no work; sky light spreads only from where an open
  column touches something that is not open.
- **Reference** (`lightCheck.ts`): the rules in the plainest form, for a box of any size.
  Every test of the fast code compares with it, and so does `verifyLight`.
- **Light after an edit** (`lightUpdate.ts`): the two floods (take away what no longer
  holds, let light flow back) for both channels, on the stored light of the nine chunks
  around the edit. It returns which chunks have to be meshed again.
- **World and chunk manager**: `Chunk.light`; `World.setBlock` keeps the light right and
  reports changed chunks; the stage "lit" between "generated" and "meshed"; a queue of
  urgent remeshes that is served before anything is loaded; `whenIdle` waits for it.
- **Light on screen**: the mesher writes smooth light into the vertex colours (green =
  sky, blue = block light); the chunk shader applies the curve, the daylight, the warm
  tint of block light and the floor of the Brightness setting.
- **Brightness setting**: a slider in the settings (0–100 %, default 50 %), stored with
  the other settings; it changes the picture only.
- **Measurement**: `getState().perf` and four new rows in the debug overlay (jobs, chunk
  work per frame, frames and long frames of the last ten seconds, light at the eye).
  `scripts/perf.ts` also measures light, meshing with and without light, loading with
  memory, and single edits.
- **Test API**: `getLight`, `verifyLight`, `lightChecksum`; `getState()` has `chunks.lit`,
  `chunks.relight`, `settings.brightness`, `perf`.
- **Dev tool**: `scripts/compareShots.mjs` (old reference next to the new one).
- **References**: all regenerated and judged (table below); three new ones: `tunnel-day`,
  `room-window`, `tree-shade`. 22 images in the repository.
- **Documents**: `README.md` ("Light and darkness"), `CLAUDE.md` (structure, the
  invariant, the stages, light on screen, the test API, how regenerated references are
  judged), this file.

Saved worlds are untouched: light is never stored, `SAVE_FORMAT_VERSION` and
`GENERATOR_VERSION` are still 1, and the terrain checksum is unchanged.

## Acceptance criteria

| Criteria     | Where                                                                                                                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1.1        | `src/world/light/lightRules.test.ts`                                                                                                                                                                  |
| AC1.2        | `src/world/light/lightCheck.slow.test.ts` (one test per rule), `lightRules.test.ts` (the exception)                                                                                                   |
| AC1.3–AC1.7  | `src/world/light/lightChunk.slow.test.ts`; the checksum constant is in `src/testing/lightChecksum.ts`                                                                                                 |
| AC2.1, AC2.2 | `src/world/ChunkManagerLight.slow.test.ts`                                                                                                                                                            |
| AC2.3, AC2.5 | `src/world/light/lightEdits1…4.slow.test.ts` (500 edits each, see deviation 4), `lightEdits4.slow.test.ts` (30 more edits that reach the top of the world), `lightUpdate.slow.test.ts` (single cases) |
| AC2.4, AC2.6 | `src/world/light/lightUpdate.slow.test.ts`                                                                                                                                                            |
| AC2.7        | `e2e/light.spec.ts`                                                                                                                                                                                   |
| AC2.8        | Full browser run on the commit of step 2: 131 tests passed, no reference regenerated. Adapted counts: see deviation 7                                                                                 |
| AC2.9        | The lint rule covers `src/world/`; `src/actions/pipeline.test.ts` ("stored light is written only by the world and its light functions")                                                               |
| AC3.1–AC3.4  | `src/world/meshing/mesherLight.test.ts`, `mesherSpeed.solo.test.ts` (AC3.4, deviation 18)                                                                                                             |
| AC3.5–AC3.10 | `e2e/light.spec.ts` (AC3.9, first half: the existing tests of `e2e/interaction.spec.ts`, unchanged)                                                                                                   |
| AC3.11       | The table "References" below                                                                                                                                                                          |
| AC4.1        | `src/ui/settings.test.ts`                                                                                                                                                                             |
| AC4.2        | `e2e/light.spec.ts`                                                                                                                                                                                   |
| AC4.3        | `e2e/light.spec.ts` (mouse), `e2e/touchLayout.spec.ts` (finger, 640 × 360 and 1280 × 800, sizes); `pause-screen` regenerated and looked at                                                            |
| AC4.4        | `src/game/perfStats.test.ts`, `e2e/light.spec.ts`                                                                                                                                                     |
| AC4.5        | `scripts/perf.ts`; numbers below                                                                                                                                                                      |
| AC5.1        | `e2e/soak.spec.ts` (Phase 3 AC5.2), `e2e/gathering.spec.ts` (Phase 3 AC9.2 and AC13.2): each ends with `verifyLight()` = 0                                                                            |
| AC5.2        | `e2e/light.spec.ts` (a literal Part C record with edits in three chunks)                                                                                                                              |
| AC5.3        | Unchanged tests: `src/world/generation/terrainV1.test.ts`, `e2e/terrain.spec.ts`                                                                                                                      |
| AC5.4        | `e2e/light.spec.ts` (with deviation 14)                                                                                                                                                               |
| AC5.5        | `repoHygiene.test.ts` passes with 22 images. Checked by hand: nothing new but code, tests and three screenshots of the game itself; no asset, name or look of others                                  |
| AC5.6, AC5.7 | `README.md`, `CLAUDE.md`, this file; the pull request                                                                                                                                                 |

## References (AC3.11)

Judged with `scripts/compareShots.mjs` (old left, new right) against the checklist of plan
section 6.5. "Pixels" is the share of pixels that differ visibly; "lower half" the mean
brightness (0–255) of the lower half of the picture, old → new.

| Reference           | Pixels | Lower half    | Verdict                                                                                                                                              |
| ------------------- | ------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spawn-noon`        | 2.2 %  | 82.0 → 79.9   | Changed as expected: the inside of the leaves in front of the camera is a little darker; grass in the open, sky, HUD unchanged                       |
| `overview-noon`     | 2.3 %  | 110.0 → 108.1 | Changed as expected: soft shade on the ground under the trees and under the canopy's rim; no seam, no dark face; the rocky hill is unchanged         |
| `shore`             | 22.8 % | 114.8 → 104.5 | Changed as expected: the water gets darker with depth, without bands; the bed near the shore is clearly visible; beach and trees as before           |
| `underwater`        | 56.1 % | 99.1 → 64.4   | Changed as expected: the lake bed, four to five blocks under the surface, is dim (sky light 5–7); steps of the bed stay readable. See "Known issues" |
| `build`             | 0.0 %  | 121.9 → 121.6 | Unchanged to the eye: the blocks stand in the open; ambient occlusion as before                                                                      |
| `night`             | 0.0 %  | 19.2 → 19.2   | Unchanged (the night changes in Part B)                                                                                                              |
| `sunset`            | 0.0 %  | 152.5 → 152.5 | Unchanged                                                                                                                                            |
| `rocky-hill`        | 0.0 %  | 92.9 → 92.9   | Unchanged                                                                                                                                            |
| `stations`          | 0.0 %  | 125.0 → 125.0 | Unchanged                                                                                                                                            |
| `gathering-hud`     | 0.0 %  | 193.8 → 193.8 | Unchanged                                                                                                                                            |
| `inventory`         | 0.7 %  | 56.3 → 55.6   | Changed as expected: only the world behind the panel (leaves a little darker); slots, icons and texts unchanged                                      |
| `palette`           | 0.0 %  | 53.3 → 52.5   | The same, less visible                                                                                                                               |
| `recipe-list`       | 0.0 %  | 54.9 → 54.2   | The same                                                                                                                                             |
| `touch-controls`    | 2.2 %  | 81.6 → 79.6   | The view of `spawn-noon` with the touch controls: the same change; controls unchanged                                                                |
| `inventory-touch`   | 1.9 %  | 40.0 → 40.0   | Only the world behind the panel                                                                                                                      |
| `pause-screen`      | 4.3 %  | 30.7 → 31.4   | Changed as expected: the new row "Brightness, 50 %"; the world block below moved down by one row; everything fits                                    |
| `recipe-list-touch` | 0.0 %  | 40.6 → 40.6   | Unchanged                                                                                                                                            |
| `item-icons`        | 0.0 %  | 55.6 → 55.6   | Unchanged (not regenerated)                                                                                                                          |
| `world-menu`        | 0.0 %  | 67.0 → 67.0   | Unchanged                                                                                                                                            |
| `tunnel-day`        | new    | –             | The floor fades evenly from the mouth to black; walls and roof with it; no light through the walls; the pit in front is in full daylight             |
| `room-window`       | new    | –             | The room is dim, brightest around the window, darker towards the corners and the floor behind the camera; the bricks stay recognisable               |
| `tree-shade`        | new    | –             | Soft shade under the canopies, no blotches; the leaves themselves are not black; trunk and grass keep their colours                                  |

No picture changed in a way the checklist does not explain.

## Decisions and deviations

1. **The light curve runs in the vertex shader, not per pixel.** The plan's formula is
   computed per vertex (`curve`, daylight, tint, the floor `minLight`, the conversion to
   linear light); a pixel only multiplies. With the formula per pixel the browser tests
   that render under software WebGL took 30–40 % longer and two menu tests timed out; a
   phone GPU pays for the same work. The difference on screen: between the vertices of a
   face light is blended as linear light. Open ground is exactly as before (AC3.6).
2. **AC3.5 compares linear light.** With the floor at 11 % and the first strip of the
   tunnel at about 85 %, "darker than 10 % of the first" cannot hold in gamma-encoded pixel
   values (0.11 / 0.85 = 13 %). In linear light the last strip is about 1 % of the first.
   All other brightness criteria use pixel values, as the plan's numbers assume.
3. **AC3.7: "open-ground value" is the same view of the room without its roof**, measured
   in the lower 60 % of the picture (floor and walls, not the sky above the walls).
4. **AC2.3: the 2 000 edits are four test files of 500** (different seeds and volumes),
   so they run side by side; each edit is followed by the full comparison with the
   reference and by the check of the reported chunks (AC2.5). The test volume is low
   (everything below y = 16) because the reference is slow where much air has to be worked
   through. Six of ten edits fall into the middle chunk (the quick update), the others
   anywhere in the 5 × 5 chunks, including chunks that are not lit. 30 further edits reach
   the top layers of the world. Under coverage, which slows the reference several times
   over, each file does 125 edits (`TIMING_ENFORCED`, as for time limits).
5. **AC2.6: the average is for edits whose nine chunks are lit** (every edit near a
   player): 0.02 ms. Next to a chunk that is not lit the lit chunks around are worked out
   from scratch (about 1.2 ms each); that happens only at the rim of the loaded area.
6. **An edit in a chunk that is not loaded also takes the light of lit chunks next to
   it** (they cannot be worked out without that chunk's blocks) and with it the meshes
   that read it; inside the radius they are rebuilt by the loading jobs. Without a lit
   chunk nearby only the edit is recorded, as AC2.4 says. A player cannot reach such a
   place; the rule keeps the invariant strict.
7. **Rings.** Meshes are kept up to radius + 1 as before, block data and light up to
   radius + 2. At render distance 4 that is 169 generated chunks instead of 121. Adapted
   tests: `e2e/world.spec.ts` (AC7.2), `e2e/soak.spec.ts` (AC12.1), `e2e/save.spec.ts`
   (world switch), and three tests of `src/world/ChunkManager.test.ts` (81 instead of 49
   chunks at radius 2, 49 instead of 25 after shrinking the radius).
8. **The reference stops above the highest block** (sky light is full there; block light
   reaches at most 14 cells up) and uses a work list instead of repeated sweeps. It is
   still the rules and nothing else, with one opaque wall around the box.
9. **`verifyLight` generates the chunks it needs on the side** (terrain plus recorded
   edits) where a lit chunk's neighbours are no longer loaded, without adding them to the
   world. It takes about 50 ms per lit chunk.
10. **AC3.2 is tested for faces that share an edge** (same plane, facing the same way).
    Two faces that touch only in one corner, with two opaque cells between them, may
    carry different light at that corner: the diagonal cell is left out of the average
    there, as the plan says.
11. **Diagonal of a quad.** It follows `shade × ambient occlusion × (1/16 + the larger of
the two lights)`: with even light it is the choice from before (AC3.3 shows that only
    colours and diagonals differ).
12. **Brightness is stored only once it was changed**, like the touch sensitivity, so the
    stored settings of existing players stay byte for byte as they were.
13. **Chunk work** in `perf` is the time of the loading jobs per frame plus the immediate
    remeshes of edits. A frame is recorded while a world is open.
14. **AC5.4 is narrowed (cut list).** The heap is recorded at render distance 4 (test
    mode), not 8: at 8 the software renderer takes minutes. The memory of chunk data at 8
    is measured in Node (below). The geometry check is done back at the start point after
    ten teleports: three.js counts a geometry once it was drawn, so the count depends on
    the view.
15. **The tunnel scene** is dug where the pit in front of its mouth has to be least deep,
    found by a search around the start point; its floor is relaid with stone so the
    measured strips have one texture.
16. **`npm test` runs in three passes.** The first CI run of this branch failed in an old
    test: "generation is at most 20 % slower than the Phase 1 terrain" (Phase 3 AC1.10),
    which has a margin of only a few percent and lost it next to the new, heavy light
    tests. Now the heavy tests are in files named `*.slow.test.ts` and run last, and the
    two comparisons of times with tight limits (that one, and meshing with light) are in
    files named `*.solo.test.ts` that run one after the other with nothing next to them,
    after a warm-up. The limit of the old test is unchanged.
    `npm run test:coverage` still runs everything at once (it enforces no time limits).
17. **`scripts/perf.ts` now takes the best of five rounds** per measurement. The old
    script measured one cold round; its numbers are given below as they were.

18. **AC3.4 is relaxed from 25 % to 37.5 %** (the plan's fallback: "as a last step relax
    a limit by half and record it"). Meshing with light takes 17–19 % longer than without
    on the machine of the first measurements and 20–25 % on a second one, where the limit
    of 25 % failed every few runs. Tried first: the three cells next to a corner are read
    once for ambient occlusion and light. Not tried: reading the eight cells around a
    face once per face instead of per corner, which would rewrite the mesher's inner loop.

## Performance

Node 22, cloud container, seed 1337.

| Work                                    | Before this part       | Now                                 |
| --------------------------------------- | ---------------------- | ----------------------------------- |
| Generate a chunk                        | 0.77–1.11 ms (cold)    | 0.29 ms                             |
| Light a chunk from scratch              | –                      | 1.24 ms                             |
| Mesh a chunk                            | 6.5–8.9 ms (cold), 5.4 | 6.3 ms (5.4 without light)          |
| Load render distance 4 (81 meshes)      | 404–426 ms, 121 chunks | 680–700 ms, 169 chunks              |
| Load render distance 8 (289 meshes)     | 1 370–1 616 ms         | 2 100–2 300 ms                      |
| Blocks and light in memory, distance 4  | 3.9 MB                 | 9.1 MB                              |
| Blocks and light in memory, distance 8  | 11.3 MB                | 25.1 MB                             |
| Light update of an edit, average        | –                      | 0.008 ms (terrain), 0.02 ms (AC2.6) |
| Light update, worst edit at the surface | –                      | 1.9 ms                              |
| Roof of a dark hall of 31 × 31 × 4      | –                      | 0.35 ms (limit 5 ms)                |
| Heap in the browser, render distance 4  | not recorded           | 35.6 MB, the same after 200 edits   |

- AC1.7: lighting a terrain chunk takes 1.2 ms, 22 % of meshing it (limit 40 %); a chunk with caves (37 % of the ground carved out) takes 2.9 ms, 2.4 times a terrain chunk (limit 4).
- AC3.4: meshing with light takes 17–25 % longer than without, depending on the machine
  (limit 37.5 %, see deviation 18).
- **Loading costs more than the plan estimated**: about 50–65 % more time at render
  distance 4 and 8 instead of 20–30 %. Light from scratch takes about 1.2 ms per chunk,
  not the 0.55 ms of the planning prototype (lakes cost most: every water cell is worked
  through), one more ring of chunks is generated, and meshing reads light. The per-frame
  budget is unchanged, so this shows as terrain appearing later, not as longer frames.
  It is the number to hold against the device test when deciding about Part C.

## Known issues

- **Deep water is dim.** Five blocks under the surface the bed has sky light 5 and is
  drawn at about a fifth of full brightness; the `underwater` reference shows it. That is
  the agreed rule (leaves and water take one extra level per block); the opacity of water
  is a constant (`WATER_OPACITY`) that Part B's tuning step may change.
- **No torches yet.** Tunnels and rooms are dark and the Brightness slider is the only
  remedy until Part B, as the plan says.
- **`item-icons` fails under `--update-snapshots=all`** (the screenshot of the panel does
  not come to rest within 30 s in that mode); it passes in a normal run and its reference
  is unchanged. When regenerating, run that test without the flag.
- **Light across the rim of the loaded area** is correct but costs more after an edit
  there (deviation 5). Not reachable in play.
- The unit tests now take about half a minute (the 2 000 checked edits).
- **The coverage run has four minutes per test** instead of one, and the order test
  (AC2.2) and the edits at the top of the world do a part of their rounds under coverage:
  on the CI machine coverage makes the slow tests about 2.5 times slower than here, and
  one CI run failed on the one-minute limit. `npm test` runs them in full.
- **`e2e/world.spec.ts` (AC7.2, ten loads of 81 chunks) has three minutes instead of
  one.** On the CI machine it took just under or just over a minute once loading cost
  more; one CI run failed on that limit. Nothing else about the test changed.

## For the owner to try (plan section 9, after Part A)

These items are now in [`device-tests.md`](device-tests.md), the one checklist for all
tests on real devices (PERF-1, PERF-2, LIGHT-1 to LIGHT-8), together with the open lists
of the earlier phases. Fill that file out; the list below is the record of what this part
asked for.

The baseline (item 1) belongs to the build **before** this part is merged: debug overlay
on, render distance 5 and 8, note the FPS standing, walking and flying fast for a minute.

2. The same test with this part. The overlay now shows "Chunk work: avg … ms, max … ms
   per frame" and "Frames: … in 10 s, … long": note them. If flying stutters clearly more
   than before, or the largest chunk work is regularly above 30 ms on the phone, start
   Part C. Also note how long new terrain takes to appear when flying fast: loading costs
   more than estimated (see "Performance").
3. An old world opens as it was, with light.
4. Dig a tunnel sideways into a hill by day. Does it get dark evenly? Is it too dark to
   find the way back before torches exist? Try the Brightness slider on the phone,
   indoors and outside in daylight: is the range enough at both ends?
5. Build a small house with a door opening and a glass window. Is the inside pleasantly
   dim or just murky? Does light fall in through the window?
6. Under trees, at the shore, diving: does the shade look natural? Is clay still easy to
   find in shallow water? Is the bottom of a deep lake too dark?
7. Does anything flicker or show stripes along straight lines every 16 blocks?
8. Break and place blocks quickly at a tunnel mouth: does it still feel immediate on the
   phone?

The lists of Phase 3 (`phase-3a-report.md`, `phase-3b-report.md`, `phase-3c-report.md`,
each "For the owner to try") are still open.

## Suggestions for Part B

- **The torch is one table entry for light**: `emission: 14` on block 19. Everything else
  is tested with `TEST_LIGHT` (`LAMP`, emission 14, opacity 0) and will work with the real
  block; AC6.8 can reuse `randomEdits` of `src/testing/lightEdits.ts` with the real table.
- **Block light reaches the screen already** (blue vertex channel, `TORCH_TINT` in the
  shader) but no picture has shown it yet: `torch-night` and `torch-tunnel` are the first
  look at the tint and at the curve for block light. Tune `LIGHT_GAMMA` there.
- **Shaped blocks in the mesher.** The torch's vertices take the light of its own cell;
  `paddedLight[p]` is that value. The torch has opacity 0, so the averages of neighbouring
  faces include its cell without change.
- **The night**: only `DAYLIGHT_MIN`. The floor `minLight` (11 % at the default) is above
  the planned night of 10 %: at the default Brightness open ground at midnight would be
  drawn at 11 %, the same as a cave. Either lower the default floor or keep the night a
  little above it; AC8.2 allows 6–14 %.
- **A `break` with two block changes** goes through `World.setBlock` twice; each call
  reports its chunks, the queue takes them as they come.
- **Water**: if lake beds are too dim on the owner's devices, `WATER_OPACITY` 0 with a
  cap, or a gentler curve, is a change of one constant plus the checksum constant
  (`LIGHT_CHECKSUM_1337_V1`) and the `shore` and `underwater` references.
- **`item-icons`** has to be regenerated in Part B (one more item): run it alone.
- If the device test asks for Part C: `lightChunk` and `meshChunk` take plain arrays and
  return plain arrays; `World.light` is the only caller of the first.
