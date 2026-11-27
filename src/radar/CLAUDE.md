# src/radar/ — the radar (Phase 8 part B1)

Pure core like `src/progress/` (no `three`, DOM, `Math.random`, `Date.now`; in the ESLint
purity rules and the coverage scope). Adventure worlds only, from task 8 "Climb to height
64" (`FEATURE_UNLOCKS`, `src/progress/CLAUDE.md`). Plan: `docs/phase-8b1-plan.md`.

## Files

- `kinds.ts` (`RADAR_KINDS`: key, ore block, label, shape, colours), `veins.ts`
  (`VeinIndex`: the veins per ore cell column), `scan.ts` (`scanRadar`, `hintOf`,
  `hintLabel`, `worldProbe`), `focus.ts` (`radarFocus`), `map.ts` (the Map tab's colours,
  relief shade, top block of a column, legend texts), `schedule.ts` (`ScanPacer`,
  `DrawPacer`, the F3 text)
- Elsewhere: `src/game/Radar.ts` (the shell: one scan for the circle and the Map tab),
  `src/ui/RadarCircle.ts`, `src/ui/MapTab.ts`, `src/ui/radarDraw.ts` (symbols, hints,
  arrows drawn by code)
- Tests: `agreement.slow.test.ts` (AC1.1), `scan.test.ts`, `focus.test.ts`,
  `schedule.test.ts`, `scanCost.solo.test.ts` (AC1.7)

## Data source and the world correction

The veins are a pure function of the seed: `veinCells` (`world/generation/ores.ts`, a
copy of the walk `placeOres` uses inline) gives a vein's cells; a cell becomes ore only where the
generator leaves stone before the ores (`TerrainSource.oreHost`) and no earlier kind's vein
took it (kinds are placed in `ORE_KINDS` order, coal before iron). `VeinIndex(seed, gen)`
holds per ore cell column (6 × 6 blocks) the veins whose origin lies in it, only their ore
cells; at most `VEIN_INDEX_COLUMNS` (2 048) columns, the oldest dropped. It never depends
on the world. The agreement tests prove the index equals `generateChunk`'s ores for four
seeds, generator 1 and the twelve presets of generators 2 and 3 (`agreementV3.slow.test.ts`:
also around the spawn shaft and a ravine; the comparison is `src/testing/radarAgreement.ts`).

`scanRadar` asks a probe per cell: the block of a loaded chunk, or null where the chunk is
not loaded. A cell counts if the probe shows the kind's block or knows nothing; mined cells
drop out, a vein without a counting cell disappears, and an ore block placed by a player
where no vein lies is never shown. Rooms need nothing new: a guest's world holds the host's
edits of loaded chunks.

## Selection and hints

Per kind the N nearest veins by 3D distance from the feet cell to the vein's nearest
counting cell, whose horizontal distance is at most `RADAR_RADIUS` (48); order: d², then
`dy`, `dx`, `dz`. N is 8 for the scan (the Map tab); the circle shows the first 4 of each
of its kinds. A kind with none in range gets `beyond`: the direction and 3D distance of
its nearest counting cell up to `RADAR_FAR_RADIUS` (96), else nothing. Hints relative to
the feet: 3D distance over 24 none; 12–24 coarse (`up`, `level` within ±3, `down`; "↑",
"=", "↓"); up to 12 the exact difference ("5↓", "2↑", "=" at 0). The Map tab's legend says
"Coal · 7 blocks · 2 below", "Iron · 70 blocks · far", "Iron · none within 96".

`radarFocus(tracked)`: a tracked `mine` task whose target an ore drops (through the drop
table) narrows the circle to that kind ("Mine 20 iron ore" → iron); the map shows all.

## Scan and draw rules (counted in simulation steps)

`Radar.step` runs at the end of every simulation step. A scan runs at most once per
`RADAR_SCAN_STEPS` (15) and only after a change: the feet cell, a block within
`RADAR_FAR_RADIUS` + 2 (`onBlocks`, and the test tool `setBlock`), the loaded chunks within
that distance (looked at when the world's chunk count changes), the focus, the unlock or the
setting. The circle and the Map tab each draw at most once per `RADAR_DRAW_STEPS` (4),
after a scan with a changed result or a turn of `RADAR_TURN_DEG` (2°). Nothing is scanned
while neither shows. Standing still draws and scans nothing.

## On screen

The circle (`RadarCircle`, in the HUD, so it hides with it): heading-up, a cube-root
distance scale (near veins spread out; the rim is 48), coal a dark dot with a light rim,
iron a tan diamond; hint labels upright, nearest first, one that would cover another is
left out; `beyond` arrows on the rim. PC top-right 12 px, 112 px; touch below the bag
button, 88 px. Shown in Adventure while playing, unlocked, with the setting "Radar circle"
on, or in the bench scenario `radar`. The Map tab (`MapTab`): north-up, linear, rings at
16/32/48, a background of the loaded chunks' top blocks (leaves included, shaded by
height, cached per chunk while the tab is open, redone on `onBlocks` or a reloaded chunk),
the player arrow, up to 8 veins per kind and the legend. F3 row "Radar".

## Extension points

- A new ore kind: one row in `ORE_KINDS` and one in `RADAR_KINDS`.
- A generator with caves (or any other change to where stone lies) adds its test to its
  own `oreHost`; the radar does not change.
- Other targets (special places, chests) would be another provider of entries next to
  `VeinIndex`, merged in `scanRadar`'s per-kind lists.
