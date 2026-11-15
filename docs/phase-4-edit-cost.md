# Phase 4: why the `edit` scenario is red on phone and tablet

Finding of 2026-11-15, written after the owner's first performance runs. It is an analysis
only: nothing in the game was changed. The decision about what to build is the owner's.

## The runs

Build aef8349, suite 1, all four issues with the label `perf-run`:

| Issue | Device                                 | Web Workers line              | Not green                    |
| ----- | -------------------------------------- | ----------------------------- | ---------------------------- |
| #13   | Phone, PowerVR D-Series, 924×412       | recommended                   | `edit` red at 5 and at 8     |
| #14   | PC, AMD Radeon (integrated), 2560×1440 | decided on phones and tablets | nothing                      |
| #15   | Tablet, Mali-G72, 4 GB, 1334×800       | recommended                   | `edit` red at 5, yellow at 8 |
| #16   | Same tablet, second run                | recommended                   | `edit` red at 5, yellow at 8 |

- `stand`, `walk` and `fly` are green on every device at both render distances: 60 FPS,
  p99 16.8 ms. `fly` loading is green (nearest missing mesh 5.7 of 5, 8.6 of 8 chunks
  away on average, catch-up 0 s); its chunk work never exceeded 30 ms. No device throttled.
- **"recommended" comes from `edit` alone.** The rule (`docs/phase-4p-plan.md`, 5.6) takes
  the worst of the loading and chunk-work lights of `fly` and `edit` at render distance 5;
  only `edit`'s chunk-work light is red: frames with more than 30 ms of chunk work were
  4.7 % of the frames on the phone (40 of 845, largest 54 ms), 2.0 % and 2.5 % on the tablet.

Chunk work per frame in `edit` at render distance 5 (frames per bin, from the histograms
in the issues):

| ms     | < 1 | 1–8 | 8–12 | 12–16 | 16–30 | 30–50 | 50–100 |
| ------ | --- | --- | ---- | ----- | ----- | ----- | ------ |
| Phone  | 651 | 0   | 61   | 50    | 43    | 37    | 3      |
| Tablet | 672 | 42  | 45   | 34    | 52    | 17    | 0      |

## Where an edit's time goes

`scripts/editCost.ts` replays the 150 edits of `edit` (seed 1337, render distance 5, the
corner of four chunks) in Node and times each part. Run it bundled, as below: under
`vite-node` every imported table is read through a module getter and the mesher looks
about five times slower than it is (this also applies to `scripts/perf.ts`).

```bash
npx esbuild scripts/editCost.ts --bundle --platform=node --format=esm --outfile=/tmp/editCost.mjs
```

```bash
node /tmp/editCost.mjs
```

Result in a cloud session (Xeon 2.1 GHz, best of 5 rounds):

| Part                                                   | Average | Largest | Share |
| ------------------------------------------------------ | ------- | ------- | ----- |
| Light update (`updateLight`)                           | 0.03 ms | 0.08 ms | 1 %   |
| Remesh of `chunksAffectedByEdit`, same frame           | 1.45 ms | 4.29 ms | 71 %  |
| Remesh of chunks whose light changed (`urgent`, later) | 0.56 ms | 2.86 ms | 28 %  |

- One chunk mesh costs 0.94 ms here (whole column, 16 × 128 × 16). The phone's histogram
  puts one chunk at about 8–12 ms, two at 16–30, four at 30–54: roughly ten times this
  machine, including what `Game` does with a mesh (`ChunkMeshes`, buffer geometry).
- Of the 150 edits, 86 remesh one chunk, 56 two and 8 four at once: the scenario sits on
  the corner of four chunks on purpose, so it is the worst case. Away from chunk borders an
  edit remeshes one chunk, about 10 ms on the phone, which stays below the limit.
- Profile of the replay (self time): `meshChunk` 45 %, `fillPadded` 14 %, light from
  scratch at load 13 % + 11 %, `MeshBuilder.finish` 5 %.

**Conclusion.** Light is not the cause (1 %). The cost is remeshing whole chunk columns,
up to four in one frame, on the main thread. Web Workers as planned for Part C move
generation, light and meshing for _loading_ off the main thread; loading is already green,
and the plan itself keeps the remesh after an edit on the main thread
(`docs/phase-4-plan.md`, section 3, item 2). Part C would therefore most likely leave
`edit` red.

## Options

1. **Spread the remeshes of one edit.** The edited block's chunk is remeshed at once (as
   the plan demands); neighbour chunks across a border go into the urgent queue, one per
   frame. Largest frame on the phone: one chunk, about 10–16 ms. Small change. Cost: for
   one or two frames the border can show a missing face or an AO step. Deviates from
   "the chunks of `chunksAffectedByEdit` are remeshed in the same frame".
2. **Sections: mesh 16 × 16 × 16 instead of whole columns.** An edit remeshes only the one
   or two sections it touches (one eighth of a column or less), in the same frame; light
   changes report sections too. Removes the hitch without any seam and makes loading jobs
   smaller. Cost: a larger change (mesher, `ChunkMeshes`, chunk manager, light masks), more
   draw calls (empty sections are skipped), all world references regenerated.
3. **A faster mesher.** `fillPadded` copies neighbour strips cell by cell; `finish` copies
   every buffer. Perhaps 1.5–2× overall, helps loading too, but alone it does not bring four
   chunks below 30 ms on the phone.
4. **Web Workers (Part C) as planned.** Do not fix `edit` (see above).
5. **Accept it.** The scenario is the worst case; normal building away from chunk borders
   stays below the limit. Part B (torches) goes ahead and the hitch stays.

Options 1 and 3 can be combined; 2 makes 1 unnecessary.
