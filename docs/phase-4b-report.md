# Phase 4 part B report – Torch and darker night

Plan: [`phase-4-plan.md`](phase-4-plan.md), Part B (steps 6–9). Implemented in one cloud
session on the branch assigned to it. The preconditions held: the reports of parts A, P
and E exist, and Part E is merged.

## What was built

- **Block flags** (`src/world/blocks.ts`): `solid` now means only "collides with the
  player"; the new `targetable` means "the crosshair can hit it" (raycast, break, place
  against). New `shape` (`cube` or `torch`) and `needsSupport`, each with a lookup array
  (`BLOCK_TARGETABLE`, `BLOCK_SHAPE`, `BLOCK_NEEDS_SUPPORT`). `isPlaceable` is now
  "targetable and breakable"; `isSupport` is "solid and a cube".
- **The torch**: block 19, tile 22, item 19, label "Torch". Not solid, targetable,
  breakable, not replaceable, cutout pass, no ambient occlusion, opacity 0, emission 14
  (`TORCH_LIGHT`), shape `torch`, needs support. Stack size 99. In the Creative palette as
  its 17th block.
- **Recipe 20**: 1 stick + 1 coal → 4 torches, no station.
- **Action rules** (`src/actions/apply.ts`): a new refusal reason `support` ("Needs a block
  underneath", shown in the HUD like "Inventory full"); blocks that are not solid may be
  placed into a cell a player stands in; a `break` whose cell carries a torch returns two
  changes (the broken cell, then the torch's cell, to air or to water by the water rule);
  in Gathering the torch goes into the inventory if it fits and appears in `notices`,
  otherwise it is lost; the `full` checks look at the broken block's own item only. Break
  time 0, no tool class (`src/items/hardness.ts`).
- **Instant breaking in Gathering** (`Game.continueBreak`): when the session accepts a
  `startBreak` of a block with break time 0, `break` follows in the same step. No cracks,
  no progress bar.
- **Shape** (`src/world/meshing/mesher.ts`): a stick 2/16 wide and 10/16 high, and on it a
  flame 4/16 wide from 10/16 to 14/16: ten quads in the cutout pass, all inside the cell.
  Each part shows its piece of tile 22. All vertices take the light of the torch's own
  cell without averaging, and only the face shade (no ambient occlusion).
- **Tile and icon**: tile 22 (`render/textures/tiles.ts`) is horizontal bands: wood with a
  grain, charred at its top, then the flame from orange to a pale yellow core; it is
  opaque everywhere so no mip level can show a gap. The icon (`itemIcons.ts`) is painted:
  a slanted stick with a flame drop; `createItemIcon` uses a painted icon for a block when
  one exists.
- **Aiming** (`src/world/raycast.ts`): the raycast stops at targetable blocks; a block that
  is not a cube is hit only inside its aiming box (`aimBox`, slab method, `hitBox`), and a
  ray that misses the box goes on. The target outline (`Renderer.setHighlight`) has the
  size of that box.
- **Night and tuning**: `DAYLIGHT_MIN` 0.25 → 0.14; the Brightness floor runs from 0.02
  through 0.11 (the default, unchanged) to 0.35 (`MIN_LIGHT_BRIGHTEST`, was 0.20), in two
  linear halves (`minLightFor`). See "Decisions" for why.
- **Performance test**: scenario `torches` (version 1), suite version 2, eleven scenarios;
  a scenario may set the time of day (`Scenario.time`, `BenchHost.setTime`).
- **A fix found by the new touch test**: on a phone in a Creative world the "Close" button
  of the inventory lies where the bag button was, and the click that ends the tap which
  opened the inventory closed it again. The inventory screen now ignores a click until a
  press began on the open screen.
- **Tests**: see the table below. New files: `src/actions/torch.test.ts`,
  `src/world/meshing/mesherTorch.test.ts`, `src/world/light/torchLight.test.ts`,
  `src/world/light/torchEdits.slow.test.ts`, `e2e/torch.spec.ts`, `e2e/night.spec.ts`,
  `e2e/torchSoak.spec.ts`.
- **References**: three new (`torch-closeup`, `torch-night`, `torch-tunnel`), several
  regenerated (table below). 27 images in the repository.

Saved worlds are untouched: `SAVE_FORMAT_VERSION` and `GENERATOR_VERSION` are still 1,
the terrain checksum and `LIGHT_CHECKSUM_1337_V1` are unchanged, and ids 0–18 of blocks,
1–18 and 256–267 of items and 1–19 of recipes are as they were.

## Acceptance criteria

RESULTS_TABLE

## Decisions and deviations

1. **The night is 0.14, not 0.10, and the top of the Brightness slider is 0.35, not
   0.20.** With the plan's values AC8.2 failed: open ground at midnight measured 6.0 % of
   noon at the default Brightness and only 10.6 % with the slider at its top (the
   criterion asks for 6–14 % and at least 18 %). Dark values come out darker in pixels
   than the light factor says, because the sRGB curve is linear near black. The plan's
   risk table allows `DAYLIGHT_MIN` between 0.08 and 0.14 and tuning `minLight`: with
   0.14 open ground at midnight is 7.2 % of noon and a little brighter than an unlit cave
   at the default floor (0.11), and with the top at 0.35 the slider reaches 19.7 %.
2. **The slider is linear in two halves**: 0 → 0.02, 50 % (the default) → 0.11, 100 % →
   0.35. A single straight line from 0.02 to 0.35 would have moved the default floor to
   0.19 and brightened every unlit tunnel of Part A; the default stays what Part A tuned.
3. **The aiming box is 6/16 × 14/16, not 12/16 high.** The flame reaches 14/16; with a box
   of 12/16 the outline cut through the flame, and a ray at the flame went past the torch.
   The risk table allows up to 8/16 × 14/16.
4. **The flame is a box of 4/16 on the stick**, ten quads in all (stick: four sides; flame:
   six faces). `LIGHT_GAMMA` (1.5) and `TORCH_TINT` (1.0, 0.86, 0.62) are unchanged: in
   `torch-night` the light fades without rings, the pools of three torches join without
   a seam, the tint is visible and grass and stone keep their colours.
5. **The Phase 1 night floor and the Part A midnight pin are relaxed.** `sky.spec.ts`
   (Phase 1 AC10.3) asked the lower half of the midnight view for a mean above 12; it is
   above 8 now, and AC8.3 checks that horizon and trees stay visible. `light.spec.ts`
   (Part A AC3.6) pinned open ground at midnight to the brightness before light; it now
   checks that midnight is darker than that (between 30 % and 75 % of it). Noon is still
   pinned exactly.
6. **`torch-night` is built in the air**: a field of grass at height 110 with three
   torches, seen from above. On the terrain near the start point trees hid the torches.
7. **The `torches` scenario** (Phase 4 AC9.8) hovers above a slope south of the start
   point, at midnight, over a line of seven grass cells (z = 7, x = −3 … 3) across the
   chunk border at x = 0, found by a search in Node and pinned by a test. Step 0 puts the
   torch into bar slot 1 (`setBarSlot`); then every six steps the line is placed from
   west to east and broken from east to west, round after round, ending with the line
   placed (119 actions in the full window). In the last 40 % of the window the player
   flies forward and up, over the line and past it. A quick window places five torches.
   The Web Workers line still looks at `fly` and `edit` only: the light update and the
   remesh after placing a torch stay on the main thread in every worker design.
8. **The Phase 3 scripted path (AC9.1) gathers eleven logs instead of nine**: the two more
   become the coal for the torches, crafted at the furnace the path has already set up.
9. **A torch over a torch** is refused with `support`, as the plan's rule says, so a stack
   of two cannot exist; the test checks that breaking a block takes only the torch
   directly above it.
10. **`hold to break` in Gathering** breaks one torch per step while the button is held
    and the crosshair moves over a row of torches, as it breaks any block once its time
    is up. Not changed.

## References

REFERENCES_TABLE

## Performance (Node and cloud browser; not evidence)

PERF_SECTION

## Known issues

- **A torch in the top layer of a lake leaves a hole in the water's surface**: the torch's
  cell holds no water, and water draws faces only towards air. Graphics fixes for water
  are out of scope (`TORCH-7` asks whether it bothers).
- The flame is a box; from close up it reads as a small glowing block on a stick. The
  owner judges it on the phone (`TORCH-1`).
- `item-icons` still fails under `--update-snapshots=all` (Part A known issue); it was
  regenerated by running its test alone.

## Tests on real devices

Added to [`device-tests.md`](device-tests.md): **PERF-7**, **NIGHT-1**, **TORCH-1** to
**TORCH-8** (section "2b. Torches and the night"). Nothing became obsolete; `LIGHT-2`
still applies (its note "there are no torches yet" describes the time it was written).

## Notes for later phases (plan section 10, updated)

- **Gamepad (Phase 5)** needs nothing from light. The Brightness slider is one more
  setting to reach with a pad. Breaking a torch is one press, like in Creative.
- **Multiplayer (Phase 6).** Light needs no synchronisation: it follows from the blocks
  on every machine, and `lightChecksum` can prove that in a handshake next to the terrain
  checksum. A `break` can return two block changes (the torch on top comes along), and
  the reason `support` exists; both go through the action layer. A torch placed into
  another player's cell is allowed (it has no collision). The notes in the Phase 3 plan
  and reports that say "Phase 4 (multiplayer)" mean Phase 6 now.
- **Caves (generator version 2).** The light functions make no assumption about terrain.
  Lighting a chunk full of caves costs about 2.4 times a terrain chunk (Part A AC1.7).
  Fog and sky colour should darken when the eye has no sky light; torches in generated
  chunks are not planned.
- **Wall torches** can be appended as block ids 20–23 that all yield item 19, with a
  support rule towards the side (`needsSupport` plus a direction) and an aiming box per
  direction. No save format change.
- **More light sources** are one table entry each (`emission`), also on opaque blocks;
  shapes other than cubes need an entry in `BLOCK_SHAPE`, a box in `aimBox` and a branch
  in the mesher like `emitTorch`.
- **A held torch** that lights the surroundings would be a moving light outside the cell
  model; it is best done in the shader (a distance term around the player), not in the
  light data.
- **The night** is the owner's to tune (`NIGHT-1`): `DAYLIGHT_MIN` and the three floors of
  the Brightness slider are constants in `config.ts`; AC8.2 and AC8.3 in
  `e2e/night.spec.ts` say whether a new value still keeps the night playable.
