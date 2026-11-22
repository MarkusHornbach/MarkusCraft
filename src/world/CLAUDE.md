# src/world/ — blocks, chunks, terrain, light, meshing

Pure core (see "Architecture invariants" in the root `CLAUDE.md`): no `three`, no DOM, no
`Math.random` / `Date.now`; tested in Node.

## Files

- `blocks.ts` (block + tile table), `chunk.ts`, `World.ts`, `ChunkManager.ts`,
  `raycast.ts`, `dayNight.ts` (time → sun, sky colours, daylight)
- `generation/`: `terrain.ts` (heights, rock, layers, checksum), `ores.ts` (veins, clay),
  `trees.ts`, `spawn.ts`
- `light/`: `lightRules.ts` (levels, packing, the step rule), `lightChunk.ts` (light of a
  chunk from scratch), `lightUpdate.ts` (after an edit), `lightCheck.ts` (slow reference;
  tests and `verifyLight`)
- `meshing/`: `mesher.ts` (pure: block data in, typed arrays out), `atlasLayout.ts`

## Block flags and shapes

`solid` means "collides with the player" (physics, `isSolidAt`); `targetable` means "the
crosshair can hit it" (raycast, break, place against); `shape` is `cube` or `torch`;
`needsSupport` marks blocks that stand on the block below. `isPlaceable` = targetable and
breakable; `isSupport` = solid and a cube. The torch (block 19) is the one block that is
targetable but not solid, not a cube, and needs support.

**The support rule:** placing a block with `needsSupport` needs a solid cube directly
below (otherwise `support`, "Needs a block underneath"); breaking the block under it
removes it in the same action (to air, or water by the water rule), and in Gathering it
goes into the inventory if it fits, otherwise it is lost; the `full` checks look at the
broken block's own item only. Blocks that are not solid may be placed into a cell a
player stands in.

A block that is not a cube is aimed at through its box (`aimBox` in `world/raycast.ts`:
the torch 6/16 × 14/16); a ray that misses the box goes on, and the target outline has the
box's size. The mesher draws a torch with `emitTorch` (ten quads, the light of its own
cell, no ambient occlusion). Its icon is painted (`itemIcons.ts`, see
`src/render/CLAUDE.md`).

## Light

Every cell has sky light and block light, each 0–15, in one byte (`Chunk.light`, null
until the chunk is lit). The rules are in `light/lightRules.ts`: a step into a neighbour
costs one level plus the neighbour's `opacity` (air and glass 0, leaves and water 1,
everything else 15); full sky light going straight down into a clear cell stays full.
Light is a pure function of the blocks: it is never saved, and needs no save format or
generator version.

**The invariant:** after any edits, loads and unloads the stored light of every lit chunk
equals what the slow reference (`lightCheck.ts`) works out from the blocks.
`World.verifyLight()` counts the cells that differ; tests of anything that touches blocks
or chunks end with it being 0. If fast code and reference disagree, the reference
decides. Stored light is written only by `World.light` (the lighting job, `lightChunk`)
and `World.setBlock` (`updateLight`, or `lightChunk` again where a chunk around the edit
is not lit); `pipeline.test.ts` guards that.

The torch emits 14 (`TORCH_LIGHT`); tests of other emitters pass `TEST_LIGHT`
(`src/testing/lightScenes.ts`) with a lamp and a glowing rock through
`World.lightTables`. `LIGHT_CHECKSUM_1337_V1` changes only with the rules or an opacity.
How light reaches the screen: `src/render/CLAUDE.md`.

## Chunk stages

generated → lit (needs its 3 × 3 chunks generated) → meshed (needs its 3 × 3 chunks lit).
To mesh radius `R`, radius `R + 1` is lit and `R + 2` generated; meshes are dropped
beyond `R + 1`, data beyond `R + 2`. One job handles one chunk. `World.setBlock` reports
chunks whose mesh shows changed light through `World.onLightChange`; the chunk manager
remeshes them before it loads anything (`relight`). After an edit only the edited block's
own chunk is remeshed in the same frame (`ChunkManager.remeshAfterEdit`); the other
chunks of `chunksAffectedByEdit` join that queue (`queueRemesh`), and the frame of an edit
gives the chunk manager only what is left of `CHUNK_BUDGET_MS` (Phase 4 part E).
`whenIdle` and `isReady` wait for both.

## Generator version

Every world stores the version of the terrain generator it was created with
(`GENERATOR_VERSION`, now 1). `generateChunk(seed, cx, cz, version)` must keep producing
the same blocks for an old version for ever: a change to generation adds a new version
and leaves the old code path working. The recorded checksum
(`src/testing/terrainChecksum.ts`) must never change; it is checked in Node and in the
browser.

Hot paths here (meshing, generation) avoid per-block allocations; use typed arrays. Before
changing light, the chunk manager or the mesher read the "Decisions and deviations" of
`docs/phase-4a-report.md` and `docs/phase-4e-report.md`; for the torch and block flags
`docs/phase-4b-report.md`; for generation `docs/phase-3a-report.md`.
