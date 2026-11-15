# Phase 4 part E plan – Edits without hitches

Part E of Phase 4, after Part P and before Part B (overview: [`phase-4-plan.md`](phase-4-plan.md)).
Read `CLAUDE.md`, `docs/phase-4-edit-cost.md` (the analysis this part comes from),
`docs/phase-4a-report.md` and `docs/phase-4p-report.md` ("Decisions and deviations")
first. This plan is executed autonomously in one cloud session: do not ask the owner
questions. Where this plan leaves a detail open, choose the simplest option and note it in
`docs/phase-4e-report.md`.

Tests name their acceptance criterion in the title as "Phase 4E AC1.1".

## 1. Goal

The first performance runs (issues #13–#16) are green everywhere except the scenario
`edit` on phone and tablet. The cause is measured (`docs/phase-4-edit-cost.md`): an edit on
a chunk border remeshes up to four whole chunks in the same frame, about 10 ms each on the
phone. Light costs 1 % of an edit.

After this part an edit remeshes **only the chunk that holds the edited block** in its
frame. The other chunks it touches follow in the next frames through the existing urgent
queue, within the per-frame chunk budget. On the phone the largest frame of an edit is then
about one chunk mesh instead of up to four.

## 2. Decisions made with the owner

| Topic         | Decision                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approach      | Spread the remeshes of one edit (option 1 of `docs/phase-4-edit-cost.md`). No sections, no mesher rewrite, no workers                                                     |
| Placement     | A small part of its own with branch, report and pull request, before Part B                                                                                               |
| Accepted cost | For one or a few frames a neighbour chunk shows its old mesh: its shading lags, and after breaking a block on a border one face of the neighbour can be missing that long |
| Proof         | The owner runs the performance test again on phone and tablet (`PERF-6`); Part E is judged by `edit` on the phone, not by numbers from a cloud session                    |

## 3. Changes to the original scope

| #   | Change                                                                                                                                        | Reason                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Part E added to Phase 4                                                                                                                       | The device runs show a red `edit` on phone and tablet. Part C (workers) was meant to answer a red Web Workers line, but it would not fix this cause                     |
| 2   | Phase 4 plan, "Chunk stages": the chunks of `chunksAffectedByEdit` other than the edited block's own are no longer remeshed in the same frame | That rule makes up to four chunk meshes in one frame. The Phase 4 risk table already said "Do not delay the edited chunk": the edited chunk keeps its same-frame remesh |

## 4. Out of scope (do not build)

- Sections (meshes smaller than a chunk column), a faster mesher, Web Workers.
- Any change to the performance test: scenarios, versions, thresholds, the Web Workers
  rule. `BENCH_SUITE_VERSION` stays 1, so runs before and after Part E compare row by row.
- Any change to light, the mesher's output, the shader or the reference screenshots.

## 5. Specification

### 5.1 Remeshing after an edit

- `Game.remeshAround(x, z)` remeshes the chunk of block `(x, z)` at once, as now. Every
  other chunk of `chunksAffectedByEdit(x, z)` is handed to the chunk manager's urgent
  queue through a new method `ChunkManager.queueRemesh(cx, cz)` (ignored for a chunk
  without a mesh, like `remesh`).
- The urgent queue is unchanged otherwise: nearest chunk to the centre first, before any
  loading job. Chunks queued by an edit and chunks queued by a light change are the same
  kind of entry.

### 5.2 The chunk budget of a frame

- `Game.updateChunks` gives the chunk manager what is left of `CHUNK_BUDGET_MS` after the
  edits of the frame (`chunkWorkMs` so far). If nothing is left, `ChunkManager.update` is
  not called in that frame; otherwise it runs as now (at least one job, then until the
  budget is used up). The centre is set every frame either way.
- Progress stays guaranteed: edits repeat at most every `ACTION_REPEAT_MS` (250 ms), so
  most frames have the full budget.

### 5.3 What does not change

- `World.setBlock` and the light invariant: `verifyLight()` is 0 after every edit, as
  before. Only the time at which a mesh shows the new state changes.
- `whenIdle` and `isReady` already wait for the urgent queue (`relight`); tests that wait
  on them see the same final meshes as before.
- The test tool `setBlock` goes through `remeshAround` too and behaves the same way.

## 6. Test strategy

- Node: `ChunkManager` with a fake listener — an edit on the corner of four chunks meshes
  one chunk at once and queues three; after the queue is drained every mesh equals a mesh
  built from scratch, and `verifyLight()` is 0.
- Node: `update` with a budget of 0 is not called by `Game` (covered by an e2e test below,
  since `Game` is shell); `queueRemesh` on a chunk without a mesh does nothing.
- Browser: an edit on a chunk corner in test mode; right after the step three chunks wait in
  the queue (`chunks.relight`), after `whenIdle` all four show the edit (state facts, not pixels). Existing
  reference screenshots must match without regeneration.
- The quick performance suite still runs to its result screen (existing `e2e/bench.spec.ts`).
- `scripts/editCost.ts` measures the new "edit frame" in Node: the frame of an edit holds
  at most one chunk mesh. Its numbers go into the report, marked as Node numbers.

## 7. Implementation steps

### Step E1 – Spread remeshes and the frame budget

- `ChunkManager.queueRemesh`, `Game.remeshAround` and `Game.updateChunks` as in 5.1–5.2.
- `scripts/editCost.ts` replays the new behaviour (edited chunk at once, the rest through
  the queue under the remaining budget) and prints the largest number of chunk meshes in
  one frame.

Acceptance criteria:

- AC1.1 Node: an edit on the corner of four chunks remeshes exactly one chunk before the
  next `update`; `relight` is 3 then, and after draining it every affected mesh equals a
  freshly built one; `verifyLight()` is 0.
- AC1.2 Node: an edit inside a chunk (not on a border) queues nothing.
- AC1.3 Node: `queueRemesh` on a chunk without a mesh changes nothing.
- AC1.4 E2E: in test mode, an edit on a chunk corner — immediately after the step `chunks.relight`
  is 3 (the edited chunk was remeshed, three wait), after `whenIdle` the edit is
  visible from all four chunks' sides and `verifyLight()` is 0.
- AC1.5 E2E: all existing reference screenshots match without regeneration.
- AC1.6 `npm run check:all` passes.

### Step E2 – Report, device tests, pull request

- `docs/phase-4e-report.md`: what was built, decisions and deviations, the Node numbers of
  `editCost.ts` before and after, known issues.
- `docs/device-tests.md`: add
  - **PERF-6** (4E) Run the performance test again on phone and tablet and submit the
    issues. Is `edit` at render distance 5 green or yellow now? Result: (issue numbers)
  - **EDIT-1** (4E) Build and break blocks along a chunk border (F3 shows chunk
    coordinates): do you see a flicker, a hole for a moment, or shading that jumps late?
    Result:
- `CLAUDE.md`: the rule in "Chunk stages" (only the edited block's chunk is remeshed in the
  same frame), the status line of Part E.
- Merge `main`, run `npm run check:all`, open one pull request into `main`.

## 8. Risks and fallbacks

| Risk                                                                    | Fallback                                                                                                                                              |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| A missing face after breaking on a border is visible as a flash         | Accepted by the owner for one or a few frames (section 2). Record what the e2e test and the screenshots show in the report; `EDIT-1` checks it by eye |
| A test relies on all affected meshes being new in the frame of the edit | It must wait with `whenIdle`; change the test, not the behaviour, and note it in the report                                                           |
| On the phone one chunk mesh alone exceeds 30 ms in some frames          | Not fixable in this part. Report it; the next step would be a faster mesher or sections (`docs/phase-4-edit-cost.md`, options 2 and 3)                |

## 9. For the owner

After the pull request is merged: run the performance test on the phone and the tablet
again (`PERF-6`) and try building along a chunk border (`EDIT-1`). Then Part B starts as
planned.
