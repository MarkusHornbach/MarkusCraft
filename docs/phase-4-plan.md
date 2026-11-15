# Phase 4 plan – Light & Torches

Read `CLAUDE.md` and the reports of Phase 3 (`docs/phase-3a-report.md`,
`docs/phase-3b-report.md`, `docs/phase-3c-report.md`) first, in particular their "Decisions
and deviations". This plan is executed autonomously: do not ask the owner questions. Where
this plan leaves a detail open, choose the simplest option and note it in the report of the
part being implemented.

**The phase has four parts, each implemented in its own cloud session with its own branch,
report and pull request:**

| Part | Content                                                                   | Steps | Report                    | Starts when                                     |
| ---- | ------------------------------------------------------------------------- | ----- | ------------------------- | ----------------------------------------------- |
| A    | Light: engine, chunk pipeline, rendering, Brightness setting, measurement | 1–5   | `docs/phase-4a-report.md` | Now, from `main`                                |
| P    | Performance test run on real devices (own plan: `docs/phase-4p-plan.md`)  | P1–P4 | `docs/phase-4p-report.md` | After Part A is merged                          |
| B    | Torch: block, recipe, warm light, darker night, tuning                    | 6–9   | `docs/phase-4b-report.md` | After Part P is merged                          |
| C    | Web Workers for generation, light and meshing (optional)                  | 10–11 | `docs/phase-4c-report.md` | Only if the owner's starting prompt asks for it |

A session implements exactly one part; the owner's starting prompt says which. The
Definition of Done in `CLAUDE.md` applies to each part separately.

**Part P was added after Part A** (planned with the owner, see `docs/phase-4p-plan.md`,
"Changes to the original scope"). It builds no light and no torch: it is the standardized
performance test that replaces the manual measurements of section 9, items 1 and 2, and
whose results decide about Part C. Its four steps are in its own plan (called P1–P4
here; its tests name their criteria "Phase 4P AC…"), so the step numbers of this plan
stay as they are.

Rules for parts P, B and C:

- Precondition: the report of the previous required part exists on the session's branch (P
  needs `phase-4a-report.md`; B needs `phase-4a-report.md` and `phase-4p-report.md`; C
  needs `phase-4a-report.md` and `phase-4p-report.md`). If it does not, write that into
  the own report, commit it and stop.
- Read the reports of the earlier parts first, in particular "Decisions and deviations".
- Before opening the pull request, merge the current `main` into the branch and run
  `npm run check:all` again.
- Part C replaces Phase 3 Part D, which was never started. The owner starts it only if a
  real device shows hitches: a run of the performance test on the phone whose line "Web
  Workers (Part C)" says "recommended" (`docs/phase-4p-plan.md`, section 5.6), or the
  owner's own judgment. If it is never started, Phase 4 is complete with Part B.
- Part B adds the scenario `torches` to the performance test (step 9, AC9.8).

**Size, estimated honestly.** The phase is about as large as Phase 3 parts B and C
together, and each of those needed two sessions. Part A is the delicate one: it touches the
chunk pipeline, the mesher and the shader, and it changes every picture of the world; in
risk it compares with Phase 3 Part A, in volume it is somewhat smaller. Part B is about the
size of Phase 3 Part C: little new machinery, but the first block that is not a cube
touches the block table, the mesher, the raycast, the action rules and the icons. Part C is
small but risky, as Part D was. Each part has a cut list in section 8.

## 1. Goal

The world gets real light. Every block cell has two light values: **sky light**, which
falls from above and fades under roofs, in tunnels, under trees and in deep water, and
**block light**, which comes from light-emitting blocks. Tunnels and closed rooms are dark,
also by day. The night becomes noticeably darker.

The player's answer to darkness is the **torch**: a small placeable block, the first one
that is not a cube, made from a stick and coal. It gives warm light, has no collision and
breaks at once.

Light is computed from the blocks and never saved. Existing worlds open unchanged and
simply have light. Everything works with keyboard and mouse and with the touch controls.

## 2. Decisions made with the owner

| Topic            | Decision                                                                                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phase order      | Phase 4 = Light & Torches, Phase 5 = Gamepad controls, Phase 6 = Multiplayer (re-planned on top of Phases 3–5), Phase 7 = Personalization                                                                                            |
| Delivery         | Parts A and B with separate pull requests; Part C (workers) is optional and last                                                                                                                                                     |
| Light model      | Two channels per cell, each 0–15: sky light and block light. The usual model of the genre                                                                                                                                            |
| Open shafts      | Full sky light falls straight down any open column. A vertical shaft is bright at noon and dark at night; tunnels, staircases and roofed rooms are dark by day                                                                       |
| Storage          | Light is derived from the blocks and never saved. No new save format version, no new generator version                                                                                                                               |
| Performance      | Light runs on the main thread inside the existing per-frame budget, written as pure functions that fit a worker unchanged. Workers are built only if device numbers ask for them                                                     |
| Measurement      | The debug overlay shows chunk-work time and long frames, so the owner's device test yields numbers. Since Part P the numbers are taken by the performance test and arrive as GitHub issues with the label `perf-run`                 |
| Edits            | The chunk of an edit is remeshed in the same frame, as today. Other chunks whose light changed follow in the next frames                                                                                                             |
| Torch            | Floor only: it stands on top of a solid block. No wall torches, no block orientation                                                                                                                                                 |
| Torch support    | Breaking the block under a torch removes the torch in the same action. In Gathering it goes into the breaker's inventory if there is room, otherwise it is lost                                                                      |
| Torch recipe     | 1 stick + 1 coal → 4 torches, without a station (also craftable in a tunnel). New worlds start empty as before                                                                                                                       |
| Light sources    | The torch is the only one. The furnace does not glow                                                                                                                                                                                 |
| Night            | Night drops from 25 % to about 10 % brightness (Part B). Places without any light are almost black                                                                                                                                   |
| Brightness       | A "Brightness" slider in the settings raises the darkest levels for phones and bright rooms. It changes the picture only, never the light values                                                                                     |
| Transparent ones | Glass lets light through unchanged; leaves and water dim it a little per block                                                                                                                                                       |
| Caves later      | The light functions work on any block data, not on the assumption "solid below the surface"; that is tested with artificial caves. Caves themselves come with generator version 2 in a later phase                                   |
| References       | All references with the world in them are regenerated once in Part A and judged against the old pictures side by side with a written checklist; Part B regenerates only those the night and the new block change (sections 6.4, 6.5) |

## 3. Changes to the original scope

The owner's starting scope was challenged during planning. Agreed changes:

| #   | Change                                                                                                                                                                  | Reason                                                                                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "Shafts become dark, also by day" is narrowed: an open vertical shaft stays bright by day; only what has something above it becomes dark                                | That is what sky light means. A rule that darkens narrow shafts makes odd cases (a 2 × 2 shaft bright, a 1 × 1 shaft dark, a chimney darkening a room) and costs more to compute and test                                                          |
| 2   | Web Workers are not built first and not as a fixed part. They are an optional Part C, which replaces Phase 3 Part D                                                     | Measured in planning (section 5.7): light adds 20–30 % to loading a chunk. Workers help loading only; the cost that is new with light is remeshing after an edit, which stays on the main thread in every design. No device measurement exists yet |
| 3   | Added: a readout of chunk-work time and long frames in the debug overlay                                                                                                | No frame rate was ever measured on a real device. With the readout the owner's test gives numbers that decide about Part C                                                                                                                         |
| 4   | Added: a "Brightness" setting                                                                                                                                           | "Noticeably darker" and "playable on a phone screen" pull in opposite directions, and a phone screen cannot be judged from a cloud session. The slider lets both hold                                                                              |
| 5   | The phase is delivered in parts A and B (and C). The darker night belongs to Part B                                                                                     | Size. Between the parts the game is deployed with dark tunnels but without torches; keeping the night at 25 % until the torch exists limits that to places the player dug or built                                                                 |
| 6   | Torches are floor-only                                                                                                                                                  | A torch has no collision, so a floor torch never blocks a tunnel. Wall torches can be added later as four more block ids, without a block-state system, a new save format or rework                                                                |
| 7   | Added: a rule for the block under a torch (the torch comes off with it)                                                                                                 | The brief did not say what holds a torch up. A floating torch looks wrong; refusing to break the block under it needs explaining                                                                                                                   |
| 8   | The torch recipe needs no station                                                                                                                                       | Torches are needed underground, where no workbench stands                                                                                                                                                                                          |
| 9   | "Transitions are smooth" means smooth in space: light is blended per vertex, so there are no steps between cells. A light change itself appears at once, without a fade | A fade over time needs per-vertex animation state; nothing in the phase needs it                                                                                                                                                                   |

Proposed and declined by the owner: a faintly glowing furnace; four starting torches in a
new Gathering world.

Clarifications, stated so nobody is surprised:

- **Between Part A and Part B there is darkness without torches.** Tunnels and closed
  rooms are dark; the Brightness slider is the only remedy until Part B is merged. The
  night stays at 25 % until then.
- **Without caves, light shows in fewer places than one might expect:** in tunnels and
  rooms the player made, under trees (a light shade), in deep water and at night.
- **The time of day needs no light computation.** Sky light says how much of the sky
  reaches a cell; the daylight factor is multiplied in the shader. Dusk costs nothing.
- **A torch in the hand lights nothing** (out of scope), and a torch can be placed under
  water, where it burns on. The game is peaceful and has no fire rules.
- **Deep lake beds get dim.** Clay stays findable in the shallow parts; the acceptance
  criteria pin how much light reaches a bed under three blocks of water.

## 4. Out of scope (do not build)

Caves or any change to terrain generation (the generator version stays 1 and the recorded
terrain checksum must not change), gamepad controls, multiplayer and network code, coloured
lights other than the torch tint, a held torch lighting the surroundings, sun shadows or
any light that depends on the sun's direction, light that fades in over time, creatures or
anything that spawns in the dark, sound, graphics fixes (anti-aliasing, leaves, water
blending), wall torches, block orientation or any other block state, other light-emitting
blocks (a glowing furnace, lamps), torches that burn out, fire, flame animation or
particles, a darker sky or fog underground, a new save format version, saved light, starting
items in new worlds, changes to break times, gating or existing recipes. Part C only: no
`SharedArrayBuffer`, no OffscreenCanvas.

## 5. Specification

All numbers are starting values in `src/game/config.ts` and may be tuned; record changes
in the report. Acceptance criteria refer to the final values.

### 5.1 Architecture

```
src/world/light/     pure, in the coverage scope:
  lightRules.ts      levels, packing of two channels into one byte, the step rule
  lightChunk.ts      light of one chunk from the blocks of its 3 × 3 chunks (from scratch)
  lightUpdate.ts     update of stored light after block changes (adds and removes)
  lightCheck.ts      slow reference implementation, used by tests and `verifyLight`
```

- `Chunk` gets `light: Uint8Array | null` (one byte per cell: sky light in the high four
  bits, block light in the low four; `null` until the chunk is lit).
- The block table gets `opacity` (0–15) and `emission` (0–15) with lookup arrays like the
  existing ones.
- `mesher.ts` reads light next to the blocks and writes it into the vertex data.
- `ChunkManager` gets the stage "lit" between "generated" and "meshed".
- `World.setBlock` keeps the stored light correct and reports which chunks changed.
- Nothing in `src/world/light/` imports `three` or touches the DOM (the existing lint rule
  covers `world/`).

### 5.2 Light rules

- Every cell has sky light and block light, each 0–15. Above the world sky light is 15;
  below it everything is opaque.
- Opacity: air 0, glass 0, torch 0, leaves 1, water 1, every other block 15 (opaque).
  Unknown block ids behave like air, as in the other lookup arrays.
- **Step rule.** Light going from a cell into a neighbour (six directions) arrives with
  `level − 1 − opacity(neighbour)`, never below 0, and never enters an opaque cell.
  One exception: sky light of level 15 going straight down into a cell of opacity 0 stays 15.
- **Sky light** of a cell is the largest value that reaches it by the step rule, starting
  from the 15 above the world.
- **Block light** of a cell is the largest of its own block's emission and what reaches it
  by the step rule from other cells. An opaque block that emits has its emission as block
  light (none exists in this phase; the rule is there for later blocks).
- These rules have exactly one solution for given blocks. Light is therefore a pure
  function of the blocks: it does not depend on the order in which chunks were loaded or
  edits were made, and it is the same on every machine (integers only). `lightCheck.ts`
  computes it in the slowest, most obvious way and is what the fast code is tested against.
- Consequences to pin in tests: an open column is 15 down to the first block that is not
  air or glass; a tunnel loses one level per block; a leaf block under open sky has 13 and
  the air cell below it 12 from above (or more from the side); under three blocks of water
  the bed's top face sees sky light 9; a closed room has sky light 0; a torch (emission 14) lights
  cells up to 13 steps away.

### 5.3 Light in the chunk pipeline

- **From scratch.** `lightChunk` takes the block data of a chunk and its eight neighbours
  and returns the chunk's light. Light travels at most 15 cells, a chunk is 16 wide, so the
  3 × 3 chunks are all a chunk's light can depend on. The function seeds sky light only
  where a lit column touches an unlit cell, so open terrain costs little.
- **Stages.** A chunk is generated, then lit (needs its 3 × 3 chunks generated), then
  meshed (needs its 3 × 3 chunks lit, because vertex light reads one cell into the
  neighbours). To mesh radius `R`, radius `R + 1` is lit and radius `R + 2` generated.
  Jobs keep running nearest-first inside `CHUNK_BUDGET_MS`; one job generates, lights or
  meshes one chunk. `getState().chunks` gets `lit`; `loaded` keeps its meaning.
- **Edits.** `World.setBlock` updates the stored light of lit chunks with the usual two
  floods (remove what the old block let through or emitted, then let light flow in again),
  across chunk borders, for both channels. It reports the chunks in which a light value
  changed, plus neighbours whose mesh reads a changed border cell.
- **Edits next to chunks that are not lit.** Such a chunk needs nothing: it is lit from
  scratch later, with the edit in its blocks. If the update would have to read light from
  it, the lit chunks at that border are recomputed with `lightChunk` instead, or marked
  unlit if their 3 × 3 chunks are not all generated. Near the player this does not occur.
- **Invariant**, the centre of the test strategy: after any sequence of edits, loads and
  unloads, the stored light of every lit chunk equals what `lightCheck` computes from the
  blocks.
- **Remeshing after an edit.** The chunks that `chunksAffectedByEdit` names are remeshed in
  the same frame, as today. The other reported chunks go into an urgent queue that
  `ChunkManager.update` serves before loading jobs: at least one per frame, more while the
  budget lasts. `whenIdle` also waits for this queue; `getState().chunks.relight` is its
  length. A light change can reach three chunks per axis, so one edit can queue up to
  eight chunks; a torch in the open typically three or four, an edit in a tunnel none or
  one.
- **Memory.** Light doubles the data per chunk (32 kB more), and one more ring of chunks is
  generated. At render distance 5 that is about 14 MB of chunk data instead of 5 MB, at 8
  about 28 MB instead of 12 MB. Record the real numbers in the report.

### 5.4 Rendering

- **Vertex data.** The three colour components of a vertex were all the same value. They
  become: red = face shade × ambient occlusion (as before), green = sky light, blue =
  block light, both as level ÷ 15. No new attribute, no more memory.
- **Smooth light.** A vertex gets the average light of the up to four cells that touch it
  in front of its face (the face's own cell and the three cells that ambient occlusion
  already looks at); opaque cells are left out, and the diagonal cell is left out when both
  side cells are opaque. Faces that share a vertex in the same plane therefore agree, also
  across chunk borders. The choice of a quad's diagonal takes the light into account like
  it takes ambient occlusion today.
- **Shader.** With `curve(l) = l ^ LIGHT_GAMMA` (start: 1.5; `l` is the interpolated level
  ÷ 15), per fragment and per colour channel:

  ```
  lit   = max(curve(sky) × daylight, curve(block) × TORCH_TINT)
  lit   = max(lit, minLight)
  color = texel × (shade × lit) ^ 2.2
  ```

  `TORCH_TINT` starts at (1.0, 0.86, 0.62). Values are perceptual, as the face shades are.
  Fog and the underwater tint stay as they are.

- **Brightness setting.** `Settings.brightness` 0–1, default 0.5, a slider "Brightness" on
  the settings page. It sets `minLight` linearly from 0.02 to 0.20 (default 0.11; tune by
  eye). Test mode uses the default. The stored settings key stays; a missing field takes
  the default.
- **Night** (Part B): `DAYLIGHT_MIN` 0.25 → 0.10. Sky colours, stars and moon stay.
- The crack overlay and the target outline are not lit; they stay as they are.

### 5.5 The torch (Part B)

- **Block table.** `solid` is split: `solid` keeps meaning "collides with the player"
  (physics, `isSolidAt`), the new `targetable` means "the crosshair can hit it" (raycast,
  break, place against). A new `shape` is `cube` or `torch`; `needsSupport` marks blocks
  that stand on the block below. `isPlaceable` becomes "targetable and breakable".
- **Block 19 `torch`**, label "Torch": not solid, targetable, breakable, not replaceable,
  render pass cutout, casts no ambient occlusion, opacity 0, emission 14 (`TORCH_LIGHT`),
  shape `torch`, needs support. Tile 22 `torch`.
- **Item.** The torch is item 19, like every placeable block; stack size 99. Its icon is a
  painted icon (`itemIcons.ts`), not a cube. It is in the Creative palette (17 blocks).
- **Shape.** A stick 2/16 wide and about 10/16 high in the middle of the cell, with a
  flame at its top; at most twelve quads, painted by code. Its vertices take the light of
  its own cell without averaging.
- **Aiming.** The raycast tests shaped blocks against a box inside the cell (start: 6/16
  wide, 12/16 high, so a finger can hit it); a ray that misses the box goes on to the
  blocks behind. The target outline has the size of that box. Placing against a torch
  works like against any block (into the cell next to the face that was hit).
- **Placing.** New refusal reason `support` ("Needs a block underneath"): a torch needs a
  solid cube directly below its cell. Blocks that are not solid may be placed into a cell
  a player stands in. Water is replaceable, so a torch can stand under water.
- **Breaking.** Break time 0 and no tool class. In Gathering the `break` follows the
  `startBreak` in the same simulation step; no cracks, no progress bar. The torch yields
  itself.
- **Support.** A `break` whose cell has a block with `needsSupport` directly above it
  returns two block changes: the broken cell, then the cell above (to air, or to water by
  the existing water rule). In Gathering the torch is added to the inventory if it fits
  and appears in `notices`; otherwise it is lost. The `full` check of `startBreak` and
  `break` still looks at the broken block's own item only.
- **Recipe 20:** 1 stick + 1 coal → 4 torches, no station; appended to the recipe table
  (ids 1–19 unchanged).

### 5.6 Test API and dev tools

- `getLight(x, y, z)` → `{ sky, block }`, or `null` in a chunk that is not lit.
- `verifyLight()` → the number of cells in lit chunks whose stored light differs from
  `lightCheck` (0 is correct). Slow; for tests.
- `lightChecksum()` → 32-bit FNV-1a over the light of the 3 × 3 chunks around the origin.
- `getState()` gains `chunks.lit`, `chunks.relight`, `settings.brightness`, and
  `perf { chunkWorkAvgMs, chunkWorkMaxMs, longFrames, frames }` over the last ten seconds
  (a long frame takes more than 33 ms).
- Debug overlay (F3): the same four numbers, the jobs done (generate / light / mesh), and
  "Light: sky 15, block 0" for the cell of the player's eye.
- `scripts/perf.ts` also prints light per chunk, meshing per chunk with light, and the
  cost of single edits (section 5.7).

### 5.7 Performance: numbers and budget

Measured in the planning session (Node 22, cloud container, seed 1337, a throwaway
prototype outside the repository):

| Work                                                    | Time                                            |
| ------------------------------------------------------- | ----------------------------------------------- |
| Generate a chunk                                        | 0.3–0.8 ms                                      |
| Mesh a chunk (today)                                    | 4.5–7.4 ms                                      |
| Sky light of a chunk from scratch (from 3 × 3 chunks)   | about 0.55 ms, plus 0.3–0.8 ms to copy the nine |
| Flood of one torch in open air (3 303 cells, the worst) | 0.1 ms                                          |

Estimated, not measured: reading light per vertex makes meshing 10–15 % slower. Together
light adds 20–30 % to loading a chunk. A phone is assumed to be two to four times slower
than this container; nobody has measured it.

- **Loading.** Walking needs about three chunks per second, flying fast in Creative up to
  about fourteen at render distance 5. If loading stutters on a phone today, it stutters a
  quarter more with light; if it does not, light does not change that. Part C is the remedy
  and stays optional.
- **Editing.** The light update itself is far below a millisecond. What costs is
  remeshing: one chunk per edit today, up to nine after a light change (section 5.3). The
  edited chunk stays immediate; the others follow one or more per frame.
- **Budgets** (acceptance criteria use limits relative to meshing, as Phase 3 AC1.10 did,
  because absolute times differ per machine): light from scratch at most 40 % of the time
  of meshing the same chunk; meshing with light at most 25 % slower than before; a single
  edit's light update at most 0.5 ms on average and 5 ms in the worst case tested.

## 6. Test strategy

The rules of the earlier phases stay in force: unit tests in Node, browser tests against
the production build, state-based waiting, console hygiene, rule-based checks plus
reference screenshots, review of screenshots by eye, touch tests with emulated fingers.

### 6.1 Layers

1. **Unit tests** for `src/world/light/` (in the coverage scope), the mesher's light, the
   block table, the torch rules of the action layer and the recipe. The light of the game
   is fully testable without a browser: fast code against `lightCheck`.
2. **Property tests** with seeded random edits: after every edit the stored light equals
   `lightCheck` (the invariant of 5.3).
3. **Browser tests** for wiring, pixels and persistence: `getLight` and `verifyLight`
   through the test API, brightness measured in screenshots with `e2e/helpers.ts`.
4. **Reference screenshots** (6.4).

### 6.2 Test mode and URL parameters

No new parameters in parts A and B. Test mode uses the default Brightness. Part C adds
`workers=0` (main-thread path), as Phase 3 planned.

### 6.3 Building test scenes

Light scenes are built with the direct tool `setBlock` in Creative test mode at fixed
places of seed 1337 (extend `e2e/sites.ts`): a **tunnel** (1 wide, 2 high, 20 long, driven
sideways into a hill), a **room** (5 × 5 × 3 inside, closed, one glass block as a window),
a **roof over a chunk corner** (a 9 × 9 slab three blocks above ground, across four
chunks). Until Part B has a torch, block light is tested in Node with an emission table
passed into the light functions.

### 6.4 Reference screenshots

- **Part A regenerates** every reference that shows the world: `spawn-noon`,
  `overview-noon`, `shore`, `underwater`, `build`, `night`, `sunset`, `rocky-hill`,
  `stations`, `gathering-hud`, `inventory`, `palette`, `recipe-list`, `touch-controls`.
  **New in Part A:** `tunnel-day` (looking into the tunnel from its mouth), `room-window`
  (inside the room, the window in view), `tree-shade` (under a tree at noon).
- **Part B regenerates** `night` and `sunset` (darker night), `palette`, `recipe-list`,
  `recipe-list-touch` and `item-icons` (one more block, item and recipe). **New in Part
  B:** `torch-night` (three torches on open ground at midnight), `torch-tunnel` (the
  tunnel with one torch in the middle), `torch-closeup` (a torch from two blocks away, by
  day).
- **Part C:** none new; every reference must match without regeneration.
- The hygiene test's count of images is updated with every new reference.

### 6.5 How regenerated references are judged

Light changes nearly every picture, so "regenerate and glance" is not enough.

1. **Before** changing the mesher or the shader, copy `e2e/screenshots/` to a folder
   outside the repository and record for `spawn-noon` and `overview-noon` the mean
   brightness of the picture's lower half (`e2e/helpers.ts`).
2. Regenerate with `--update-snapshots=all`.
3. Build a sheet per reference with the old picture next to the new one (a small dev
   script under `scripts/`; the sheets are not committed) and open each with the Read tool.
4. Judge each pair against this checklist and write one line per reference into the
   report (changed as expected / unchanged / what was fixed):
   - Open ground at noon is as bright as before (rule-based too: AC3.6).
   - No seams or steps of brightness along chunk borders.
   - No black or sparkling faces, no light leaking through walls or closed corners.
   - Shade under trees is soft, not blotchy; leaves themselves are not black.
   - Water gets darker with depth without bands; the bed near the shore is clearly visible.
   - Ambient occlusion is still visible in bright places and does not double up into
     black corners in dim ones.
   - The HUD, the bar's block icons and all texts are unchanged.
5. A picture that changed in a way the checklist does not explain is a defect to fix, not
   a reference to accept.

### 6.6 Limits of automation

Not automatable in the cloud session and therefore on the manual list (section 9): how
dark night and tunnels are on a real phone screen, indoors and in daylight; the frame rate
and hitches while loading and after placing a torch; whether a child finds the torch
recipe and understands what torches are for; hitting a torch with a finger.

## 7. Implementation steps

Work in order within the part. After each step: `npm run check:all` passes, commit, push.
All acceptance criteria (AC) are verified by automated tests unless marked _(manual)_.
Tests name their AC in the title, as "Phase 4 AC1.1".

### Part A – Light (steps 1–5)

### Step 1 – Light rules and light from scratch

`opacity` and `emission` in the block table, `lightRules.ts`, `lightChunk.ts`,
`lightCheck.ts`. Nothing is wired into the game yet.

- AC1.1 Unit: `opacity` and `emission` of every block are pinned by a test; the lookup
  arrays treat unknown ids like air.
- AC1.2 Unit: `lightCheck` gives the values named under "Consequences" in 5.2, one test
  per rule (open column, tunnel, leaves, water, glass, closed room, emitter with a passed
  emission table, the downward exception only at level 15 and opacity 0).
- AC1.3 Unit: `lightChunk` equals `lightCheck` cell by cell for the centre chunk of 30
  seeded artificial 3 × 3 volumes (random heights, overhangs, closed hollows, tunnels
  across chunk borders, leaves, water, glass, random emitters) and for 16 chunks of the
  terrain of seed 1337.
- AC1.4 Unit: the light of a chunk is the same whatever lies beyond its 3 × 3 chunks, and
  two neighbouring chunks agree at their border (each cell obeys the step rule towards
  the cell across the border).
- AC1.5 Unit: `lightChunk` never changes its inputs and allocates only its result.
- AC1.6 Unit: a checksum (32-bit FNV-1a) over the light of the 3 × 3 chunks around the
  origin for seed 1337 equals a constant recorded in `src/testing/`.
- AC1.7 Unit (`expectFasterThan`, best of several rounds): lighting a terrain chunk takes
  at most 40 % of the time of meshing it. Lighting an artificial cave chunk (a third of
  the cells under the surface carved out by noise) takes at most four times a terrain
  chunk. Record all numbers.

### Step 2 – Light in the world and the chunk pipeline

`Chunk.light`, the stage "lit" in `ChunkManager`, `lightUpdate.ts`, `World.setBlock`
keeps light correct and reports changed chunks, the urgent remesh queue. The mesher does
not read light yet: the picture is unchanged.

- AC2.1 Unit: a chunk is lit only when its 3 × 3 chunks are generated and meshed only when
  its 3 × 3 chunks are lit; after loading radius `R` the counts are `(2R+1)²` meshed,
  at least `(2R+3)²` lit, at least `(2R+5)²` generated.
- AC2.2 Unit: lighting chunks in 20 different seeded orders gives identical light;
  unloading and reloading a chunk gives identical light, also with edits in it.
- AC2.3 Unit (property): 2 000 seeded random edits in a world of 5 × 5 chunks (place and
  break opaque blocks, glass, leaves, water and an emitter from a passed table; a third of
  them on chunk borders and corners). After every edit the stored light of all lit chunks
  equals `lightCheck`.
- AC2.4 Unit, one test per case: removing an emitter leaves no light behind; closing the
  top of a shaft darkens it to 0; opening it restores 15; two emitters whose light
  overlaps, one removed; an edit on a chunk corner; an edit next to a chunk that is not
  lit; an edit in a chunk that is not loaded (only the edit is recorded).
- AC2.5 Unit: the set of chunks `setBlock` reports contains every chunk whose light
  changed and every chunk whose mesh reads a changed cell, and nothing else.
- AC2.6 Unit (`expectFasterThan`): the light update of one edit takes at most 0.5 ms on
  average over the edits of AC2.3 and at most 5 ms when the middle block of the roof of a
  dark hall of 31 × 31 × 4 cells is removed.
- AC2.7 E2E: after loading, `verifyLight()` is 0 and `lightChecksum()` equals the Node
  constant of AC1.6; after ten teleports of 64 blocks there are 81 loaded chunks at
  render distance 4, `verifyLight()` is 0 and no job is pending.
- AC2.8 E2E: all existing browser tests pass; all reference screenshots still match
  without regeneration (the picture has not changed yet). Tests that read
  `chunks.generated` are adapted to the new ring and listed in the report.
- AC2.9 Unit: `World` and the light functions never call `Math.random` or `Date.now` (the
  lint rule), and `pipeline.test.ts` still passes: light is changed only inside
  `World.setBlock` and the lighting job.

### Step 3 – Light on screen

The mesher writes light into the vertices, the shader applies the curve of 5.4, the
references are regenerated and judged as 6.5 says. `DAYLIGHT_MIN` stays 0.25.

- AC3.1 Unit: on flat open ground every vertex has sky light 15 and block light 0; in a
  closed hollow every vertex has sky light 0.
- AC3.2 Unit: vertices at the same position on faces in the same plane carry the same
  light, inside a chunk and across the border of two chunks meshed separately (checked for
  all such pairs in four chunk pairs of seed 1337 and in the tunnel scene).
- AC3.3 Unit: vertex positions, texture coordinates and the number of triangles of 16
  chunks of seed 1337 are identical to those before the change (only colours and the
  choice of diagonals may differ).
- AC3.4 Unit (`expectFasterThan`): meshing with light takes at most 25 % longer than
  meshing the same chunks without (the old path kept for tests and dev tools only, as
  Phase 3 did with `TerrainFeatures`).
- AC3.5 E2E, tunnel scene at noon: the mean brightness of the floor, measured in five
  strips from the mouth inwards, falls from strip to strip; the last strip is darker than
  10 % of the first. `getLight` on the tunnel's floor falls by exactly one per block from the mouth
  inwards and is 0 at the end.
- AC3.6 E2E: the mean brightness of the lower half of `spawn-noon` and `overview-noon`
  differs by at most 4 % from the value recorded before the change.
- AC3.7 E2E, room scene: the room is dark with the window bricked up (mean brightness of
  the view below 12 % of the open-ground value) and at least three times as bright with
  the glass block in.
- AC3.8 E2E, roof scene: the shade under the roof has no step along the two chunk
  borders (neighbouring pixel columns across each border differ by no more than
  neighbouring columns elsewhere in the shade).
- AC3.9 E2E: breaking or placing a block changes the picture in the same frame as before
  (existing interaction tests, unchanged); after an edit that changes light across a
  chunk border, `chunks.relight` returns to 0 within eight rendered frames and the
  brightness on the far side of the border has changed.
- AC3.10 E2E: at midnight open ground is as bright as before the change, within 4 % (the
  night changes in Part B).
- AC3.11 References regenerated, the three new ones created, all judged as in 6.5; the
  report has the table with one line per reference.

### Step 4 – Brightness setting, measurement, tools

`Settings.brightness` with its slider, the `perf` numbers, the debug overlay rows, the
test API of 5.6, `scripts/perf.ts`.

- AC4.1 Unit: `validateSettings` gives the default Brightness for a missing or broken
  field and clamps to 0–1; stored settings from before this phase load unchanged
  otherwise.
- AC4.2 E2E: moving the slider to its ends changes the mean brightness of the dark end of
  the tunnel (highest at least three times lowest) and leaves open ground at noon
  unchanged within 1 %; `getLight` and `verifyLight` are unaffected; the value survives a
  reload.
- AC4.3 E2E: the slider works by mouse and by finger; the settings page fits 640 × 360
  without scrolling the page, with touch targets of the existing minimum size.
  `pause-screen` regenerated and looked at.
- AC4.4 E2E: `getState().perf` reports frames and long frames of the last ten seconds and
  the average and largest chunk-work time per frame; the debug overlay shows them, the job
  counts and the light at the eye.
- AC4.5 `npx vite-node scripts/perf.ts` prints generation, light and meshing per chunk,
  loading at render distance 4 and 8, and the average and worst edit of AC2.6; the numbers
  are in the report next to those measured before this part.

### Step 5 – Hardening, documentation, pull request

- AC5.1 E2E: the existing soak tests (Phase 3 AC5.2, AC9.2, AC13.2) pass and end with
  `verifyLight()` = 0.
- AC5.2 E2E: a world stored by Phase 3 (a literal Part C record written into IndexedDB,
  with edits in three chunks) opens, shows its edits, has `verifyLight()` = 0, and is
  written back in the same format (`SAVE_FORMAT_VERSION` 1, `GENERATOR_VERSION` 1).
- AC5.3 Unit and E2E: the recorded terrain checksum is unchanged.
- AC5.4 E2E: the heap after loading at render distance 8 and after 100 edits with light
  changes is recorded; teleporting ten times does not grow the count of geometries beyond
  110 % of a fresh load.
- AC5.5 Hard rule 1 checked; `repoHygiene.test.ts` passes with the new image count.
- AC5.6 `README.md` (light, Brightness), `CLAUDE.md` (structure, the invariant, the
  stages, the test API, the judging procedure of 6.5) and `docs/phase-4a-report.md` are
  written. The report has the manual list of section 9 (Part A items), the numbers of
  AC1.7, AC2.6, AC3.4, AC4.5 and AC5.4, and "Suggestions for Part B".
- AC5.7 CI is green on the final commit and one pull request into `main` is open.

### Part B – Torch (steps 6–9)

### Step 6 – The torch in the rules

Block flags, block 19, tile id 22, item, break time, recipe 20, the action rules of 5.5.
The torch is drawn as a plain cube of its tile until step 7.

- AC6.1 Unit: the ids of all existing blocks, items and recipes are pinned and unchanged;
  torch is block 19, item 19, recipe 20; `opacity` 0, `emission` 14.
- AC6.2 Unit: `solid`, `targetable`, `shape` and `needsSupport` of every block are pinned;
  physics ignores the torch (a player walks and falls through its cell); the raycast hits
  it; `isPlaceable` is true for it and unchanged for all other blocks.
- AC6.3 Unit, one test per rule: `place` of a torch is refused with `support` over air,
  water and a torch; accepted over every solid cube; accepted
  into a cell the player stands in; accepted into water; `occupied` into a torch's cell.
  Solid blocks are still refused inside a player box.
- AC6.4 Unit: breaking a torch in Gathering is accepted in the same millisecond as its
  `startBreak` and yields one torch; with a full inventory `startBreak` answers `full`.
- AC6.5 Unit: breaking the block under a torch returns both changes in the order of 5.5;
  in Gathering the torch is in the inventory and in `notices`; with no room for the torch
  the break is still accepted and the torch is lost; next to water the torch's cell
  becomes water; in Creative nothing enters the inventory. A stack of two torches cannot
  exist (the upper one has no solid cube below), so only one comes off.
- AC6.6 Unit: recipe 20 takes one stick and one coal and gives four torches without a
  station; the rules `missing` and `full` hold; the recipe table test accepts it.
- AC6.7 Unit: `applyAction` still never changes its inputs (1 000 seeded random actions
  including torches); every action with a torch survives the JSON round trip.
- AC6.8 Unit: with the real block table, placing a torch lights the cells around it as
  5.2 says and breaking it leaves no light; the property test of AC2.3 runs with real
  torches and with the support rule (1 000 edits through `applyAction`).
- AC6.9 Unit: a save record of Part A of this phase loads unchanged; a record containing
  torches survives encode → decode.
- AC6.10 E2E: in Gathering test mode, `give` stick and coal, craft through the recipe
  list, place a torch with a real click, read `getLight` 14 in its cell and 13 next to it,
  break it with one click (gone within two simulation steps, the count is back), break the
  block under a second torch (both gone, torch in the inventory, "+1 Torch" shown).

### Step 7 – The torch on screen

Tile and icon painters, the torch shape in the mesher, the box in the raycast, the
outline, the palette.

- AC7.1 Unit: the torch tile and icon are deterministic, differ from every other tile and
  icon, and the icon passes the existing icon rules (opaque share, visible on a dark slot).
- AC7.2 Unit: the mesher emits at most twelve quads for a torch, all in the cutout pass,
  all inside the cell; blocks next to a torch keep the faces towards it; a torch casts no
  ambient occlusion; its vertices carry the light of its own cell.
- AC7.3 Unit: a ray through the cell that misses the box hits the block behind; a ray
  through the box hits the torch and reports a face; 1 000 seeded rays agree with a
  slow reference test against the box.
- AC7.4 E2E: a torch standing between the player and a wall can be aimed at (target is
  the torch, the outline has the box's size in pixels within 20 %) and aimed past (target
  is the wall).
- AC7.5 E2E: the palette shows 17 blocks, the torch with its painted icon; the bar and
  the inventory show the icon with a count in Gathering.
- AC7.6 E2E: at midnight a patch of ground next to a torch is at least four times as
  bright as the same patch without it, and warm: its mean red exceeds its mean blue by at
  least 25 %. By day the same patch changes by less than 5 %.
- AC7.7 E2E: `torch-closeup` created and judged by eye: recognisable as a torch from two
  and from ten blocks away, the flame is the brightest part, no see-through gaps, no
  dark halo on the ground under it.
- AC7.8 E2E: placing a torch next to a chunk corner updates the edited chunk in the same
  frame and all others within eight frames (`chunks.relight` 0); `verifyLight()` is 0.

### Step 8 – Night, tuning, touch

`DAYLIGHT_MIN` 0.10, final values of `LIGHT_GAMMA`, `TORCH_TINT`, `minLight`, the opacity
of leaves and water. References of 6.4 for Part B.

- AC8.1 Unit: `daylightFactor` is 0.10 at midnight and 1 at noon, and still changes
  smoothly at dusk and dawn (existing tests with the new minimum).
- AC8.2 E2E: at midnight open ground has between 6 % and 14 % of its noon brightness at
  the default Brightness, and at least 18 % with the slider at its top.
- AC8.3 E2E: at midnight at the default Brightness the horizon line between ground and
  sky and the outline of a tree against the sky are measurable (the brightness step
  across each is at least 2 % of full scale): the world is dark but not a black screen.
- AC8.4 E2E (touch, 960 × 540): a torch is selected in the bar, placed with the place
  button and broken with one tap on the break button; aiming at it with a look drag works.
- AC8.5 E2E (touch layout, 640 × 360 and 1280 × 800): the recipe list shows the torch
  row with a reachable "Craft" button; the palette's 17th block is reachable.
- AC8.6 References `night`, `sunset`, `palette`, `recipe-list`, `recipe-list-touch` and
  `item-icons` regenerated; `torch-night` and `torch-tunnel` created; all judged by eye
  as in 6.5, with these additions: torch light fades without rings, the warm tint is
  visible but stone still looks like stone, three torches' pools join without a seam.
  The report states the final values and why.

### Step 9 – Hardening, documentation, pull request

- AC9.1 Node: the scripted path of Phase 3 AC10.3 is extended: after the furnace the
  player makes coal from logs, crafts torches, places one in a tunnel of at least 16
  blocks, and the cell at the tunnel's end has block light of at least 1. Valid actions
  only.
- AC9.2 E2E: a soak of 1 000 seeded actions in Gathering with torches in the mix (place,
  break, break the support, craft) keeps every item count consistent with the accepted
  actions and ends with `verifyLight()` = 0, without a console message.
- AC9.3 E2E: a world with torches survives a reload: the torches are there and
  `getLight` at three recorded cells is the same as before.
- AC9.4 E2E: the Phase 3 play-through (AC13.1) and both older soaks pass unchanged apart
  from the recipe count.
- AC9.5 Hard rule 1 checked: "Torch" is a plain descriptive word, tile and icon are
  painted by code; `repoHygiene.test.ts` passes with the new image count.
- AC9.6 `README.md` (torches, the recipe table, night), `CLAUDE.md` (block flags, shapes,
  the support rule, the reason `support`, status) and `docs/phase-4b-report.md` are
  written, with the full manual list of section 9, measured numbers, and "Notes for
  later phases" (section 10, updated).
- AC9.7 CI is green on the final commit and one pull request into `main` is open.
- AC9.8 (added with Part P) The performance test has the scenario `torches` (midnight;
  scripted actions place torches along a fixed line and break them again, then the player
  walks past them), as `docs/phase-4p-plan.md`, section 11, describes: suite version 2,
  the scenario pinned by unit tests like the others (all actions accepted, light changes,
  `verifyLight()` = 0 afterwards), one more row on the result screen, the quick run in
  the browser tests still passes, `bench-result` regenerated.

### Part C – Web Workers (steps 10–11, optional)

Phase 3 plan section 5.7 and its steps 14–15 apply, with these changes: a worker job
generates a chunk, or lights and meshes one from the blocks of its 3 × 3 chunks and
returns the light with the mesh arrays; the main thread keeps the light update of edits
and the remesh of the edited chunk; the urgent remeshes of other chunks after an edit may
go to workers; `workers=0`, a failing worker start and Node use the main-thread path.

### Step 10 – Worker pool

- AC10.1 Unit: job and result descriptions survive a structured clone; the job functions
  give byte-identical blocks, light and mesh arrays to the direct calls for 64 chunks
  with edits and torches.
- AC10.2 E2E: with workers, the terrain checksum, `lightChecksum()` and `getBlock` and
  `getLight` at 1 000 seeded positions equal the values with `workers=0`; `verifyLight()`
  is 0 after the soak of AC9.2.
- AC10.3 E2E: all reference screenshots match without regeneration, with and without
  workers.
- AC10.4 E2E: breaking and placing change the picture in the same frame as before; AC7.8
  holds.
- AC10.5 E2E: teleporting 64 blocks ten times ends with 81 loaded chunks, no pending
  jobs, and a geometry count of at most 110 % of a fresh load.
- AC10.6 E2E: with the worker script blocked by the test, the game starts on the
  main-thread path without a console error; the production build works from a sub-path.

### Step 11 – Measurement, documentation, pull request

- AC11.1 `scripts/perf.ts` and `getState().perf` measure, while flying 300 blocks at 20
  blocks per second at render distance 8, the main-thread chunk work per frame: the
  largest value is at most 3 ms with workers; both numbers are in the report.
- AC11.2 E2E: the time until `isReady()` is not longer than without workers (± 10 %).
- AC11.3 `CLAUDE.md` and `docs/phase-4c-report.md` are updated, with the device
  measurement before and after: since Part P that is two runs of the performance test on
  the owner's phone (one with `workers=0`), each submitted as an issue; the result record
  says whether workers were on.
- AC11.4 CI is green on the final commit and one pull request into `main` is open.

## 8. Risks and fallbacks

| Risk                                                                              | Fallback (decide without asking)                                                                                                                                                                                              |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The fast light code disagrees with `lightCheck` in rare cases                     | The invariant decides, never the fast code. Shrink the failing seeded case into a unit test. If the update of edits cannot be made right within the step, recompute the affected chunks with `lightChunk` and record the cost |
| Light from scratch or the mesher exceed their limits (AC1.7, AC3.4)               | Seed less (only at exposure borders), read light from the padded volume by plain index offsets, skip averaging for faces whose four cells are equal. As a last step relax a limit by half and record it                       |
| Seams of brightness at chunk borders                                              | They mean a mesh was built before a neighbour was lit, or a changed border cell was not reported: fix the stage rule or AC2.5, do not blur in the shader                                                                      |
| Remeshing several chunks after one edit hitches                                   | Serve one urgent remesh per frame, nearest to the edit first. Do not delay the edited chunk. Anything more is Part C                                                                                                          |
| Smooth light and ambient occlusion together make corners too dark                 | Raise the darkest `AO_LEVELS` entry (start 0.5) and record it; do not remove ambient occlusion                                                                                                                                |
| Open ground at noon changes (AC3.6)                                               | Sky light 15 must give exactly the old brightness: `curve(1) = 1`. Check the averaging next to opaque cells before touching the curve                                                                                         |
| Dim values look banded or noisy under software WebGL                              | Judge in the reference and by numbers; do not add dithering                                                                                                                                                                   |
| The extra ring of generated chunks breaks counts in existing tests                | Adapt the tests' numbers, list them in the report. `loaded` must keep its meaning                                                                                                                                             |
| Memory at render distance 16 becomes too large                                    | Record it. Light arrays of chunks beyond the lit radius are dropped on unload as blocks are; no further measure in this phase                                                                                                 |
| The torch is too small to hit, with a finger or at all                            | Enlarge the aiming box up to 8/16 × 14/16; the drawn shape stays                                                                                                                                                              |
| The torch is not recognisable at bar size or from ten blocks away                 | Thicker stick (3/16), larger flame, lighter flame colours; the `item-icons` sheet and `torch-closeup` are the tools for judging                                                                                               |
| Night at 10 % is a black screen in the reference, or hardly darker than before    | Tune `DAYLIGHT_MIN` between 0.08 and 0.14 and `minLight` so AC8.2 and AC8.3 both hold; record the values. The owner tunes after trying; do not guess further                                                                  |
| A zero break time conflicts with the `startBreak` / `break` flow or its tolerance | Keep both actions; `Game` submits `break` in the step of the accepted `startBreak`. Do not make the torch a special case in `applyAction` beyond its break time                                                               |
| Part A runs out of room                                                           | Cut in this order and record it: the job counts in the debug overlay, `tree-shade`, AC5.4. Never cut the invariant tests, the judging of references or the perf numbers                                                       |
| Part B runs out of room                                                           | Cut: the aiming box (use the whole cell), AC9.1, `torch-closeup`. Never cut the support rule, the night tests or the manual list                                                                                              |
| Workers (Part C): the worker build fails under `base: './'`, or copies cost more  | As in the Phase 3 plan: try the `?worker` import form; if it does not work within the step, stop Part C, write the finding into its report and open no pull request                                                           |

## 9. Manual test list for real devices

**Since Part P, items 1 and 2 are replaced by the performance test**
(`docs/phase-4p-plan.md`): the baseline of item 1 can no longer be measured, because Part
A is deployed, and the numbers of item 2 are taken by the test run. The rule for starting
Part C is the one in that plan, section 5.6. The other items stay; the list that is filled
out is `docs/device-tests.md`.

The reports repeat the items of their part. The lists of Phase 3 (`phase-3a-report.md`,
`phase-3b-report.md`, `phase-3c-report.md`, each "For the owner to try") are still open
and stay valid.

**Before Part A is merged** (the baseline; five minutes, on the deployed game of today):

1. Phone, tablet and computer, a Creative world, "Debug overlay" on, render distance 5
   and 8: note the FPS standing, walking, and flying fast in a straight line for a minute,
   and whether the picture stutters when new terrain appears. This is item 5 of the Part A
   list of Phase 3. Without it there is nothing to compare light against.

**After Part A:**

2. The same test again. The overlay now also shows chunk work per frame (average and
   largest) and the count of long frames: note them. If flying stutters clearly more than
   in item 1, or the largest chunk work is regularly above 30 ms on the phone, start
   Part C.
3. An old world opens as it was, with light.
4. Dig a tunnel sideways into a hill by day. Does it get dark evenly? Is it too dark to
   find the way back before torches exist? Try the Brightness slider on the phone,
   indoors and outside in daylight: is the range enough at both ends?
5. Build a small house with a door opening and a glass window. Is the inside pleasantly
   dim or just murky? Does light fall in through the window?
6. Under trees, at the shore, diving: does the shade look natural? Is clay still easy to
   find in shallow water?
7. Does anything flicker or show stripes along straight lines every 16 blocks?
8. Break and place blocks quickly at a tunnel mouth: does it still feel immediate on the
   phone?

**After Part B:**

9. A night on the phone: is it "dark, but I can walk", or a black screen? Where does the
   slider end up? Tell me the position you like; it becomes the default.
10. Place torches at night and in the tunnel: is the lit area large enough to be useful
    (about 13 blocks)? Is the warm tint pleasant or too orange? Do stone and grass still
    look like themselves?
11. Place a torch with the phone: is there a hitch? Place ten in a row along a tunnel.
12. Hit a torch with a finger to break it; aim past a torch at the wall behind.
13. Break the block under a torch: is it understood that the torch comes along?
14. Give the device to a child in a Gathering world at dusk without explaining: do they
    find "Torch" in the recipe list, understand that coal is needed, and use torches?
15. Dig for iron (Phase 3 Part C list, item 7) with torches: is mining more fun now?
16. A torch under water, a torch on glass and on leaves: anything that looks broken?

## 10. Notes for later phases

- **Gamepad (Phase 5)** needs nothing from light. The Brightness slider is one more
  setting to reach with a pad.
- **Multiplayer (Phase 6).** Light needs no synchronisation: it follows from the blocks
  on every machine, and `lightChecksum` can prove that in a handshake next to the terrain
  checksum. A `break` can now return two block changes and a new reason `support`
  exists; both go through the existing action layer. Other players' edits arrive through
  `onBlocks` and relight like local ones. The notes in the Phase 3 plan and reports that
  say "Phase 4 (multiplayer)" mean Phase 6 now.
- **Caves (generator version 2).** The light functions make no assumption about terrain;
  AC1.3 and AC1.7 cover hollow ground. Open questions for that phase: lighting a chunk
  full of caves costs several times more (AC1.7 records how much), which may be the
  moment for Part C if it was not built; fog and sky colour should darken when the eye
  has no sky light; torches in generated chunks are not planned.
- **Wall torches** can be appended as block ids 20–23 that all yield item 19, with a
  support rule towards the side. No save format change.
- **More light sources** are one table entry each (`emission`), also on opaque blocks.
- **A held torch** that lights the surroundings would be a moving light outside the cell
  model; it is best done in the shader (a distance term around the player), not in the
  light data.
