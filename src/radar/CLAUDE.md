# src/radar/ — the radar (Phase 8 parts B1, B2b and B3b)

Pure core like `src/progress/` (no `three`, DOM, `Math.random`, `Date.now`; in the ESLint
purity rules and the coverage scope). Adventure worlds only, from task 8 "Climb to height
64" (`FEATURE_UNLOCKS`, `src/progress/CLAUDE.md`). Plans: `docs/phase-8b1-plan.md`,
`docs/phase-8b2-plan.md` (B2b: places).

## Files

- `kinds.ts` (`RADAR_KINDS`: key, category `ore` or `place`, ore block, label, shape,
  colours), `veins.ts` (`VeinIndex`: the veins per ore cell column), `places.ts`
  (`PlaceIndex`), `scan.ts` (`scanRadar`, `hintOf`, `hintLabel`, `worldProbe`), `focus.ts`
  (`radarFocus`, `circleKinds`, `mapKinds`, `circleScan`), `map.ts` (the Map tab's colours,
  relief shade, top block of a column, legend texts), `schedule.ts` (`ScanPacer`,
  `DrawPacer`, the F3 text)
- Elsewhere: `src/game/Radar.ts` (the shell: one scan for the circle and the Map tab),
  `src/ui/RadarCircle.ts`, `src/ui/MapTab.ts`, `src/ui/radarDraw.ts` (symbols, hints,
  arrows drawn by code)
- Tests: `agreement.slow.test.ts` (AC1.1), `scan.test.ts`, `focus.test.ts`,
  `schedule.test.ts`, `scanCost.solo.test.ts` (AC1.7, B2b AC5.4, B3b AC5.3); B2b:
  `places.test.ts`, `placesAgreement.slow.test.ts` (AC5.1, B3b AC5.3), `scanPlaces.test.ts`
  (AC5.2, B3b AC5.1)

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

## Places (Phase 8 part B2b)

Mine shafts and cave entrances, generator 3 only: `TerrainSource.placesIn` (absent in
versions 1 and 2) lists the places whose cell lies in an area, worked out like generation
without blocks: a shaft's cell is its log column at the collar's height (`top`), an
entrance's the lowest carved cell of its start column (open to the sky). `PlaceIndex(seed,
gen)` caches them per `PLACE_REGION` (64) square, at most `PLACE_INDEX_REGIONS` (256).
Places are permanent: no world correction (a mined frame still marks its shaft); a guest's
places equal the host's. Ravines are not places.

**Chests** (Phase 8 part B3b, generator 4): `placesIn` adds one `chest` per shaft (its chest
cell); `PlaceIndex.hasChests` is true where the generator has `lootAt`, and only then do
`mapKinds` and `circleKinds` add the kind (generators 1–3 list what they did). Symbol: a
filled amber square with a dark band (`radarDraw.ts`). A listed chest counts only while
`ChestProbe` says so (`worldChestProbe`: the cell is a chest, by a loaded chunk's block or
else its edit, none meaning the generated chest, and its state, stored or derived, holds
an item), so an emptied or broken one leaves the radar for good; guests hold all edits and
states and agree. A change of chest states within the far radius + 2 (`Radar.noteStates`,
from `onStates`) makes a scan due. The agreement test proves every
listed place exists in the blocks and every shaft and tunnel opening near the spawn and the
spawn shaft belongs to a listed place.

## Selection and hints

Per kind the N nearest veins by 3D distance from the feet cell to the vein's nearest
counting cell, whose horizontal distance is at most `RADAR_RADIUS` (48); order: d², then
`dy`, `dx`, `dz`. N is 8 for the scan (the Map tab); the circle shows the first 4 of each
of its kinds. A kind with none in range gets `beyond`: the direction and 3D distance of
its nearest counting cell up to `RADAR_FAR_RADIUS` (96), else nothing. Place kinds follow
the same rule with their own numbers: 4 per kind on the map (`RADAR_MAP_PLACES`), 2 on the
circle (`RADAR_CIRCLE_PLACES`), `beyond` up to `RADAR_PLACE_FAR_RADIUS` (192). Hints relative to
the feet: 3D distance over 24 none; 12–24 coarse (`up`, `level` within ±3, `down`; "↑",
"=", "↓"); up to 12 the exact difference ("5↓", "2↑", "=" at 0). The Map tab's legend says
"Coal · 7 blocks · 2 below", "Iron · 70 blocks · far", "Iron · none within 96".

`radarFocus(tracked)`: a tracked `mine` task whose target an ore drops (through the drop
table) narrows the circle's ore kinds to that kind ("Mine 20 iron ore" → iron); places
always show (`circleKinds`); the map shows all. Worlds without places (generators 1 and 2)
scan, draw and list exactly B1's kinds (`mapKinds`); the F3 row counts the kinds shown.

## Scan and draw rules (counted in simulation steps)

`Radar.step` runs at the end of every simulation step. A scan runs at most once per
`RADAR_SCAN_STEPS` (15) and only after a change: the feet cell, a block within
`RADAR_FAR_RADIUS` + 2 (`onBlocks`, and the test tool `setBlock`), the loaded chunks within
that distance (looked at when the world's chunk count changes), the focus, the unlock or the
setting. The circle and the Map tab each draw at most once per `RADAR_DRAW_STEPS` (4),
after a scan with a changed result or a turn of `RADAR_TURN_DEG` (2°). Nothing is scanned
while neither shows. Standing still draws and scans nothing.

## On screen

The circle, its sizes, the symbols and the Map tab's layout: `docs/architecture.md`, "Radar
on screen".

## Extension points

- A new ore kind: one row in `ORE_KINDS` and one in `RADAR_KINDS`.
- A generator with caves (or any other change to where stone lies) adds its test to its
  own `oreHost`; the radar does not change.
- Another place kind: a `Place` kind from `placesIn` and a `place` row in `RADAR_KINDS`
  with its own shape; one the world can remove gets a probe like `ChestProbe`.
