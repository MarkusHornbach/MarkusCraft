# Phase 8 part B2b report – Places on the radar, and a larger map

Plan: `docs/phase-8b2-plan.md` (sections 6.10–6.13, AC5–AC6). Branch
`claude/bold-curie-w4jeu8` (the session's branch).

## What was built

- **Places provider**: `TerrainSource.placesIn(minX, minZ, maxX, maxZ, out)` (generator 3;
  absent in 1 and 2) lists mine shafts and cave entrance mouths from the same decision code
  as generation, without blocks (`TerrainV3.placesIn`). No generation change: every
  checksum is untouched. `PlaceIndex` (`src/radar/places.ts`) caches them per 64 × 64
  region (at most 256 regions).
- **Radar kinds and scan**: `RADAR_KINDS` has a `category` and two place rows, `shaft`
  ("Shaft", light brown hollow square) and `cave` ("Cave", grey downward triangle).
  `scanRadar` merges the places per kind: in range (horizontal ≤ 48) by 3D distance, 4 per
  kind on the map, 2 on the circle; `beyond` up to 192. A task focus narrows the ore kinds
  only. Generators 1 and 2 scan, draw and list exactly B1's kinds.
- **On screen**: both symbols with hints on the circle and the Map tab; legend rows for the
  kinds shown (place rows only in generator 3 worlds); the F3 row counts them.
- **The owner's finding "the map is far too small on every device"** (agreed in this
  session; see "Changes to the scope"):
  - The Map tab fills the screen; the map is the largest square that leaves the legend
    200 px; symbols and labels grow with it. On screens up to 480 px high the header (tabs
    in two rows and Close) moves beside the map, above the legend, so the map is as high as
    the screen.
  - A new setting "Radar circle size" (Small, Medium, Large; default Medium) on the
    settings page, below "Radar circle". On touch the circle never covers a button: on a
    small phone Large is cut down to the room there is.
- **Bot**: at the start of task 16 the generator 3 run compares the radar's nearest shaft
  and cave with a brute-force search of `placesIn` over 192 blocks;
  `scripts/progressRun.ts` prints a "Places" table (distances from the spawn, agreement).
- **Browser**: `e2e/radarPlaces.spec.ts` (AC6.1–AC6.3, the size setting, the touch room),
  a room test in `e2e/mpCaves.spec.ts` (AC6.4).
- **Docs**: `src/radar/CLAUDE.md` (places, sizes, the full-screen map), `src/ui/CLAUDE.md`,
  `docs/testing.md`, device tests PLACE-1 to PLACE-6, root status row.

## Changes to the scope

| #   | Change                                                                                                                        | Reason                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Added: the Map tab fills the screen; on short screens the header moves beside the map                                         | The owner's finding after B1: the map was far too small on every device. The owner chose "fill the screen" (over a size setting or zoom buttons) |
| 2   | Added: setting "Radar circle size" (Small 112 / Medium 168 / Large 224 px on the PC; 88 / 128 / 168 on touch), default Medium | The same finding covered the circle; the owner chose a setting with three sizes and Medium as default                                            |

Both were agreed with the owner at the start of this session.

## Measured numbers (Node and Chromium in this container; never device evidence)

Map size (CSS pixels of the square):

| View                    | Before (B1) | Now |
| ----------------------- | ----------: | --: |
| PC 1280 × 800           |         284 | 700 |
| Test view 960 × 540     |         284 | 453 |
| Phone 915 × 412 (touch) |         300 | 400 |
| Phone 640 × 360 (touch) |         288 | 348 |

Circle on touch with Large: 1280 × 720 168 px; 640 × 360 127 px (the room down to the break
button); 915 × 412 Medium 128 px.

Scan cost (`scanCost.solo.test.ts`, seed 1337 balanced/few, generator 3, best of 30):
ores only warm 1.23 ms, cold 14.25 ms; with places warm 1.24 ms, cold 14.67 ms (1.01 ×
and 1.03 ×, limit 1.2 ×). The cold index is new; the terrain's cave caches are warm in both
(as in B2a's measurement).

### The bot (`scripts/progressRun.ts`, generator 3, 12 runs)

All 12 runs complete the book (light errors 0); the radar's chapters are as in B2a. The
new "Places" table:

| Kind  | Worlds with one within 192 | From the spawn: median |  max | Task 16: radar = brute force |
| ----- | -------------------------: | ---------------------: | ---: | ---------------------------- |
| shaft |                         12 |                   24.4 | 32.4 | yes (12)                     |
| cave  |                         12 |                   39.8 |   63 | yes (12)                     |

Distances are horizontal, from the spawn to the place's cell.

## Decisions and deviations

1. **A shaft's place cell** is its log column at the collar's height (`top`): a frame
   block ("a frame block at a shaft's top cell", AC5.1), stable whatever the entry side of
   the stairs. An entrance's cell is the lowest carved cell of its start column, which is
   open to the sky (checked for every listed mouth).
2. **The reverse check of AC5.1** ("every shaft and tunnel mouth in the generated chunks is
   listed"): in 9 × 9 chunks around the spawn and around the spawn shaft, every stone-brick
   cell (only shafts make them) lies in a listed shaft's footprint, and every column whose
   noise ground is carved belongs to a ravine or to an entrance whose mouth is listed (an
   entrance may come out of a hillside up to 26 blocks from its mouth; it is the same
   tunnel). Deep tunnels never open at the surface.
3. **Hints for places use B1's table**, so a place more than 24 blocks away has no hint and
   its legend row says "far" ("Shaft · 24 blocks · far"). The plan's example "Shaft · 37
   blocks · level" does not fit that table; the table wins.
4. **The AC5.3 assertion lives in `botV3.slow.test.ts`**, the generator 3 run (B2a moved it
   out of `bot.slow.test.ts`). The cave mouth's cell is air there; the shaft's is a log.
   The bot reads the place's block from the generator, so the check never changes the
   bot's world or its later choices.
5. **"Nearest" for the bot check** follows the radar's rule: nearest in range by 3D
   distance, else nearest within 192 (then only direction and distance, `dy` null).
6. **The F3 row counts the kinds shown**: "4 coal · 4 iron · 1 shaft · 1 cave · scan … ·
   draw …" in generator 3, unchanged in generators 1 and 2.
7. **Map layout**: the panel keeps a 12 px margin on larger screens and fills the height
   on screens up to 480 px (4 px side margin). There the map tab and its body use
   `display: contents`, so canvas, header and legend are cells of one grid; the tabs wrap
   into two rows beside Close. `MapTab` sizes the canvas in code (the largest square that
   leaves the legend 200 px, or on a phone the side column 250 px); symbols and labels grow
   with the square up to 2.2 ×.
8. **The circle's touch room**: from one gap below the bag button to 4 px above the highest
   right-hand button (break, place, up, down), measured on resize and when the circle
   shows; never below Small. On a 640 × 360 phone Medium and Large both come to 127 px.
9. **Symbols grow with √(size / Small)** on the circle, so Large keeps the circle's
   proportions without labels covering each other more.
10. **The bench keeps the circle at Small**, so the `radar` scenario stays comparable with
    B1's results (`BENCH_SUITE_VERSION` unchanged).
11. **The setting is stored only when changed**, like the other settings added after Phase
    1; an old profile reads as Medium.
12. **The pause menu on a phone keeps fitting 360 px**: the new slider row pushed "Copy
    link" 22 px below the screen; the title "MarkusCraft" now stands left of the play
    buttons on screens up to 480 px high (touch), which frees one line.
13. **`map-tab-touch` was removed**: since B2a the menu world is generator 3, so B1's touch
    map reference showed the same screen as the new `map-tab-places`. B1's touch test keeps
    its layout checks.

## Tests changed on purpose

- `e2e/radar.spec.ts`: the PC circle is 168 px (Medium) instead of 112; `radar-circle`
  regenerated.
- `e2e/radarTouch.spec.ts`: the touch circle is Medium (120–128 px) instead of 88;
  `radar-circle-touch` regenerated.
- `e2e/radarMap.spec.ts`: the reference clip is the tab's whole box (it fills the panel);
  the legend's texts are read from visible rows; the touch test lost its header-slack check
  and its reference (the header lies beside the map now; `e2e/radarPlaces.spec.ts` checks
  that layout); `map-tab` regenerated.
- `src/radar/scan.test.ts`, `src/testing/radarAgreement.ts`, `scanCost.solo.test.ts`:
  loops over every kind now loop over the ore kinds (`ORE_RADAR_KINDS`).
- References that show an Adventure HUD with the circle (now Medium) or the settings page
  (one more row): `gathering-hud`, `stations`, `pause-screen`, `pad-pause` regenerated and
  looked at.
- `src/ui/settings.test.ts`: the settings carry `radarSize`.
- `src/bot/report.test.ts`: a run carries `places`.
- `src/util/repoHygiene.test.ts`: 56 reference screenshots.
- `e2e/radar.ts`: `openTouchAdventure` takes the settings to store.
- `e2e/shards.json`: `radarPlaces.spec.ts` joined the third game shard (no CI times for
  it yet).

## Known issues

- **Local browser runs with three workers crash pages here** ("Target crashed", the
  kernel killing processes for lack of memory) in `e2e/worldMenu.spec.ts` and the
  five-player room test. `main` (c8fe743) crashes the same way in this container; both
  pass with one worker or alone. Nothing changed in CI's setup.
- On a 640 × 360 phone Large is no larger than Medium (the buttons below leave 127 px).
- The first scan in a fresh session also works out the cave regions up to 192 blocks away
  (the places' far radius): 66–99 ms and 6–8 MB in Node (seeds 1337, 42, 7, a new
  terrain); later scans reuse them (the cold numbers above have the terrain's caches warm).
  The browser heap of a generator 3 Adventure test world is about 5 MB larger than on
  `main` (65 against 60 MB); a Creative world is unchanged.

## For the Pi side

Nothing new: no build variables, packages, signaling requests or lazy chunks; the room
protocol is unchanged (places are a pure function of seed and generator). `sync/status.md`
of the Pi repository was read: nothing there concerns this part. The owner plays this part
on its PR preview.

## Device tests

PLACE-1 to PLACE-6 in `docs/device-tests.md`, section 12. RADAR-3 (the circle's look) and
RADAR-5 (the Map tab) moved to "Obsolete" in `docs/device-tests-done.md`: their subject
changed; PLACE-1, PLACE-5 and PLACE-6 replace them.

## Suggestions for the next part

- Chests (B3) can be a third place kind: a `Place` kind from `placesIn` and a `place` row in
  `RADAR_KINDS`.
- If PLACE-6 finds the phone map still small, zoom steps (32 / 48 / 96 blocks) are the
  remaining lever; the height of a landscape phone is used up.
