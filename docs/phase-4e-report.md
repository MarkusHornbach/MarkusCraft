# Phase 4 part E report – Edits without hitches

Plan: [`phase-4e-plan.md`](phase-4e-plan.md). Analysis it comes from:
[`phase-4-edit-cost.md`](phase-4-edit-cost.md). Planned with the owner and implemented in
the same cloud session, on the branch that also holds the analysis and the plan.

## What was built

- `ChunkManager.queueRemesh(cx, cz)`: puts a meshed chunk into the urgent queue (the queue
  that light changes already used). Chunks without a mesh are ignored.
- `ChunkManager.remeshAfterEdit(x, z)`: remeshes the chunk that holds block `(x, z)` at
  once and queues the other chunks of `chunksAffectedByEdit(x, z)`.
- `Game.remeshAround` calls `remeshAfterEdit` instead of remeshing every affected chunk.
- `Game.updateChunks` gives the chunk manager what is left of `CHUNK_BUDGET_MS` after the
  edits of the frame and skips `update` when nothing is left. The centre is still set
  every frame.
- `scripts/editCost.ts` replays the 150 edits of the scenario `edit` with the new
  behaviour. An optional argument replaces the budget, so that a slower device can be
  imitated.

Nothing else changed: light, the mesher's output, the shader, the performance test
(scenarios, versions, thresholds) and the reference screenshots are as before.

## Acceptance criteria

| AC    | How it is checked                                                                                                                                                                                                                          | Result |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| AC1.1 | `ChunkManager.test.ts`: corner edit meshes `-1,-1` only, `relight` is 3, the queue comes before loading. `ChunkManagerLight.slow.test.ts`: after ten edits on chunk borders every mesh equals one built from scratch, `verifyLight()` is 0 | passed |
| AC1.2 | `ChunkManager.test.ts`: an edit inside a chunk meshes that chunk and queues nothing                                                                                                                                                        | passed |
| AC1.3 | `ChunkManager.test.ts`: `queueRemesh` ignores unknown and unmeshed chunks, and a chunk queued twice counts once                                                                                                                            | passed |
| AC1.4 | `e2e/light.spec.ts`: place and break on a chunk corner — `chunks.relight` is 3 right after each edit, 0 after `whenIdle`; `verifyLight()` is 0                                                                                             | passed |
| AC1.5 | The full browser suite with the existing references, no regeneration (155 passed in 11.6 min)                                                                                                                                              | passed |
| AC1.6 | `npm run check:all`                                                                                                                                                                                                                        | passed |

## Decisions and deviations

- **The rule lives in `ChunkManager`, not in `Game`.** The plan put the split (own chunk at
  once, the rest queued) into `Game.remeshAround`. It is `ChunkManager.remeshAfterEdit`
  instead, so the Node tests check it without the shell; `Game` calls it.
- **AC1.4 checks state, not pixels.** "After `whenIdle` the edit is visible from all four
  chunks' sides" is checked in Node, where the final mesh of every chunk is compared with
  a fresh one (AC1.1, slow file). In the browser the renderer's triangle count is only
  read after the next rendered frame, so it cannot show the state between the edit and
  that frame; the e2e test checks the queue and the light instead, and the reference
  screenshots check the picture.
- **A mutation check of the slow test:** without draining the queue the mesh comparison
  fails, so it does test the queued chunks. The e2e test would read 0 instead of 3 with the
  code from before Part E.
- **"One chunk per frame" depends on the device.** The frame of an edit gives the chunk
  manager what is left of the 6 ms budget. On a fast machine that is enough for the
  queued neighbours in the same frame (as before, but now within the budget); on the
  phone, where one chunk mesh takes about 10 ms, the edit's own chunk uses the whole
  budget and each neighbour gets a frame of its own. If an edit leaves a little budget,
  `update` still runs at least one job, so the worst frame is the own chunk plus one more.
- `chunksAffectedByEdit` is unchanged; `Game` no longer imports it.

## Measured (Node, not evidence)

`scripts/editCost.ts`, bundled with esbuild, on the cloud session's Xeon 2.1 GHz, best of
5 rounds, 150 edits of `edit` at render distance 5. Numbers from a cloud session are not
evidence of performance on a device; they show the shape of the change.

| Behaviour                  | Budget | Chunk meshes in the frame of an edit | Largest edit frame |
| -------------------------- | ------ | ------------------------------------ | ------------------ |
| Before Part E              | 6 ms   | 1 (86 edits), 2 (56), 4 (8)          | 4.29 ms            |
| Part E                     | 6 ms   | 1 (70), 2 (34), 4 (46)               | 3.96 ms            |
| Part E, device 10× as slow | 0.6 ms | 1 (all 150)                          | 1.25 ms            |

The 0.6 ms row imitates the phone: there one chunk mesh is about ten times as long as
here (`phase-4-edit-cost.md`), so 6 ms on the phone is about 0.6 ms on this machine. The
total work per edit is unchanged (1.9 ms here); it is spread over more frames.

## Known issues

- For a frame or two after an edit on a chunk border, the chunk on the other side shows
  its old mesh: shading lags, and after breaking a block one face of the neighbour can be
  missing. Accepted in the plan; `EDIT-1` asks whether it can be seen.
- On the phone one chunk mesh alone (8–16 ms) is below the 30 ms limit, but the frame
  also draws the picture. If `edit` stays yellow or red in `PERF-6`, the next step is a
  faster mesher or sections (`phase-4-edit-cost.md`, options 2 and 3).
- `scripts/perf.ts` reports the mesher about five times too slow when run with
  `vite-node` (module getters); bundle it as described in `phase-4-edit-cost.md`.

## Tests on real devices

Added to `docs/device-tests.md`: **PERF-6** (rerun the performance test on phone and
tablet) and **EDIT-1** (building along a chunk border). Nothing became obsolete.

## Suggestions

- After merging, run `PERF-6`. If `edit` turns green or yellow, Part B can start; the line
  "Web Workers (Part C)" then follows `fly`, which was green on every device.
- If the mesher is ever made faster, the bundled `editCost.ts` and `perf.ts` give the
  before and after in Node.
