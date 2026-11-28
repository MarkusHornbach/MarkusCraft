# Phase 8 part B3b report – Loot in mine shafts

Plan: `docs/phase-8b3b-plan.md`. Branch `ccr-37a5341d-hg2yak` (the session's branch), started
from `main` with the plan merged (after pull request #48).

## What was built

- **Generator 4** (6.1): `TerrainV4 extends TerrainV3` (`src/world/generation/terrainV4.ts`)
  puts `Block.CHEST` into every shaft's chest cell, `shaftChestCell(s)` = (x − 3, floor,
  z + 3), the chamber corner without a torch. `GENERATOR_VERSION` 4 for new worlds in both
  modes; the world list says "· Caves · Loot", F3 "Generator 4 · balanced · few"; `gen=4`
  makes a test world. `placesIn` adds one `chest` place per shaft. Generators 1–3 are
  untouched (all their checksums pass).
- **Loot** (6.2, `src/world/loot.ts`): `LOOT_TABLES` (starter, rich) and `lootOf`, a pure
  draw from the seed and the cell; `TerrainSource.lootAt`; `initialState` returns the
  derived loot for a chest cell. Nothing is generated or stored until a player touches the
  chest. `LOOT_CHECKSUM_1337_V4` pins tables and draw.
- **Rooms** (6.4): host and guest diff and patch `chest` messages against
  `World.stateFor` (stored, else derived) instead of "stored, else empty".
- **Radar** (6.6): the place kind `chest` ("Chest", a filled amber square with a dark band),
  `ChestProbe` / `worldChestProbe` hides emptied or broken chests, `Radar.noteStates`
  rescans after `onStates`. The kind exists only in generator 4 worlds.
- **Bot** (6.7): chests in the way are emptied and broken (`accidentalLoots`); `--loot`
  (trips before task 1 and at chapter 4, each its own row) and a control run (`take:
false`: the same trips, nothing taken); `compareLoot` with the limits;
  `scripts/progressRun.ts` defaults to generator 4. Walk check `walkShaftChest`.
- **Crosshair hint** (6.8): `Hud.setChestHint` ("Right click: Open", "Place: Open", the LT
  glyph with "Open"), from `Game.chestHintInput` on the raycast target; hidden while a
  break is in progress.
- **Test API** (6.9): `lootSites()`, `terrainChecksum(cx, cz)`.
- **Specs**: `e2e/loot.spec.ts`, `e2e/chestHint.spec.ts`, `e2e/mpLoot.spec.ts`; adapted
  `e2e/caves.spec.ts`, `e2e/worldMenu.spec.ts`, `e2e/inventory.spec.ts`,
  `e2e/radarPlaces.spec.ts` (the menu world is generator 4).
- **Docs** (section 12): `src/net/CLAUDE.md`'s "Measure and harden" and
  `src/radar/CLAUDE.md`'s "On screen" moved to `docs/architecture.md` ("Network overlay and
  traffic", "Radar on screen"); generator 4 in `src/world/generation/CLAUDE.md`; device
  tests LOOT-1 to LOOT-7.

## Acceptance criteria

| AC    | Where                                                                                                             |
| ----- | ----------------------------------------------------------------------------------------------------------------- |
| AC1.1 | `terrainV4.test.ts`, `worldOptions.test.ts`, `urlParams.test.ts`, `e2e/caves.spec.ts` (form, list, F3)            |
| AC1.2 | `terrainV4.slow.test.ts` (identity, twelve presets), `terrainV4.test.ts` (chest cell on stone bricks)             |
| AC1.3 | `terrainV4.test.ts` (Node), `e2e/caves.spec.ts` (browser, `terrainChecksum(cx, cz)`)                              |
| AC1.4 | `src/bot/caveWalks.slow.test.ts` (48 spawn shafts to the chest in torch light and back)                           |
| AC1.5 | `terrainV3Speed.solo.test.ts` (third side), `caveCost.slow.test.ts` (generator 4 column)                          |
| AC2.1 | `src/world/loot.test.ts` (tables, determinism, starter/rich, `LOOT_CHECKSUM_1337_V4`), `e2e/loot.spec.ts`         |
| AC2.2 | `src/world/loot.test.ts` (no tool, no natural block, items exist, counts, 27 slots)                               |
| AC2.3 | `src/actions/loot.test.ts` (take one, take all, reload, unload, Adventure break or `full`, Creative `notEmpty`)   |
| AC2.4 | `src/actions/loot.test.ts` (1 000 actions, both modes; `verifyLight` 0)                                           |
| AC3.1 | `src/net/lootNet.test.ts`                                                                                         |
| AC3.2 | `e2e/mpLoot.spec.ts`; every `mp*.spec.ts` touched by chests or caves run (below)                                  |
| AC4.1 | `src/save/lootSave.test.ts`, `e2e/loot.spec.ts` (`save=1`), `saveFormat.test.ts` (generator 5 is `newer`)         |
| AC5.1 | `src/radar/scanPlaces.test.ts`, `e2e/radarPlaces.spec.ts` (touch map), `e2e/mpLoot.spec.ts` (circle)              |
| AC5.2 | `scanPlaces.test.ts` (generator 3 lists no chest), `e2e/radar.spec.ts`, `e2e/radarPlaces.spec.ts` (gen 1–3 tests) |
| AC5.3 | `placesAgreement.slow.test.ts`, `scanCost.solo.test.ts`, `e2e/mpLoot.spec.ts` (guest radar)                       |
| AC5.4 | reference `map-tab-loot`, looked at                                                                               |
| AC6.1 | `scripts/progressRun.ts --loot` (below)                                                                           |
| AC6.2 | `bot.slow.test.ts`, `botV3.slow.test.ts`, `botLoot.slow.test.ts`                                                  |
| AC7.1 | `e2e/chestHint.spec.ts`, reference `chest-hint`                                                                   |
| AC7.2 | `e2e/loot.spec.ts`, reference `loot-chest`                                                                        |
| AC7.3 | the specs above ran with the console checks of `e2e/fixtures.ts`                                                  |
| AC8.1 | `docs/device-tests-2.md` section 14; `npm run docs:budget` passes, no limit raised                                |

## Measured numbers (Node and Chromium in this container; never device evidence)

- **Generation** (15 × 15 chunks, best of 20 rounds, three runs): generator 3 1.30 × and
  generator 4 1.29–1.32 × generator 2 (0.26 ms per chunk). Generator 4 is measured in a test
  of its own (generator 2 against 4): with all three in one loop, generator 3 (unchanged
  code, B2a's 1.29–1.32 ×) came to 1.35–1.38 × in two full check runs. The rounds went from
  12 to 20, the plan's fallback.
- **Faces**: generator 4 equals generator 3 within 1 % for the 12 seed and shape pairs (one
  chest per shaft, inside a closed chamber).
- **Radar scan** (generator 4, places without → with the chest kind): warm 1.03 → 1.03 ms,
  cold 11.49 → 11.54 ms (limit 1.2 ×).
- **Save**: an untouched loot chest writes no chunk record at all (`src/actions/loot.test.ts`);
  a touched one costs what a chest costs.
- **Bot** (`scripts/progressRun.ts --loot`, 12 worlds × plain, loot and control run; all 36
  complete, light errors 0):

  | Chapter          | Plain (min) | Control: trips, nothing taken | Loot (min) |
  | ---------------- | ----------: | ----------------------------: | ---------: |
  | 1 First wood     |         3.7 |                           3.8 |        3.8 |
  | 2 Tools          |         5.2 |                           5.2 |        5.2 |
  | 3 Stone and fire |         7.9 |                           7.9 |        7.9 |
  | 4 Into the dark  |         6.6 |                           6.1 |        6.1 |
  | 5 Iron           |         7.7 |                           6.7 |        6.7 |
  | Total            |        31.9 |                          30.0 |       30.0 |

  Tasks 11, 12, 16, 17 differ by at most 0.0 minutes between loot and control. Trip 1 found
  the spawn chest in 12 of 12 worlds (median 23.7 blocks away), trip 2 a rich chest within
  192 in 5 of 12 (median 96 blocks). Accidental loots: none in 36 runs (the bot never dug
  through a chamber corner). Dark breaks of tasks 6–8 are unchanged (20 / 47, 0 / 1, 0 / 64;
  ores 0 / 0, 0 / 0, 0 / 3): the bot holds looted torches but never places one outside a
  task. Trip 1 climbs out of the chamber in the dark (task 1 of the loot run shows 0 / 77
  dark breaks); its time is not part of any task.

## References

New: `loot-chest` (the chamber, see deviations), `chest-hint`, `map-tab-loot` (640 × 360,
the Map tab of the menu world with a Chest row). Removed: `map-tab-places` (the same screen,
now with the Chest row; it became `map-tab-loot`). All three looked at: the chest stands in
the lit corner on stone bricks; the hint is one short line under the crosshair; on the map
the filled amber chest with its band is told apart from the hollow shaft square at once.
`radar-circle-touch` and the other menu-world references did not change.

## Browser specs run in this container

`loot`, `chestHint`, `radarPlaces`, `radar`, `radarTouch`, `radarMap`, `caves`, `chest`,
`chestScreen`, `chestTouch`, `chestPad`, `taskTracker`, `worldMenu`, `inventory` (game);
`mpLoot`, `mpCaves`, `mpChest`, `mpChestScreen`, `mpRadar`, `mpRooms` (multiplayer). All
pass. Three `worldMenu` tests timed out once while unit tests ran beside them and passed
alone (the known load effect).

## Decisions and deviations

- **The loot limits are checked against a control run, not the plain run.** Against the
  plain run the loot run was 1.9 minutes shorter in total and 1.0 in chapter 5 (limits 1.5
  and 1.0). Lowering the stone bricks (the plan's fallback) changed nothing; a run with the
  same trips taking nothing gave exactly the same task times as the loot run. So the whole
  difference comes from the trips' own staircases and tunnels, which later walks reuse, not
  from the items: the bot always crafts what a craft task counts, and looted torches, coal
  or ingots never replace a counted action. `--loot` prints both comparisons; the limits
  hold against the control (0.0 minutes everywhere). The stone bricks went back to the
  owner's 8–16. What the bot cannot measure (a player placing looted torches early, or
  feeling less need to mine) is device test LOOT-2.
- **Starter sticks 1–3 instead of 4–8** (a real finding, not a bot artefact). Chapters 1–2
  give exactly 125 XP (level 3) only with the first crafts of planks, sticks, workbench and
  both pickaxes. With 4–8 looted sticks the stick is never crafted, the player reaches "Make
  a furnace" with 120 XP, and the furnace recipe (level 3) is locked: 7 of 12 loot runs
  stopped there. With at most 3 sticks the two pickaxes (4 sticks) need one stick craft.
  `loot.test.ts` keeps it so. The plan allowed changing the tables before the merge.
- **Each trip walks back** to where it started, so the next task starts from the same place
  as in the plain run (without it chapters 1–2 of the loot run were 2.7 minutes longer, the
  bot climbing out of the chamber inside task 1).
- **`TERRAIN_CHECKSUMS_1337_V4`** hash the 3 × 3 chunks around the spawn chest's chunk
  (`terrainChecksumAt`); the origin checksum (`terrainChecksum`, also the room's `welcome`)
  is unchanged in meaning. `__mc.terrainChecksum(cx, cz)` checks them in the browser.
- **The chest is written after the trees** in `TerrainV4.generateChunk` (generator 3's code
  stays as it was); no tree or leaf reaches a chamber, and the identity test proves the
  result equals "after the shafts".
- **The room fix changed no outcome.** The old base ("stored, else empty") was consistent
  too: the host sent every filled slot of the first touched state and the guest patched an
  empty chest to the same 27 slots. With the derived base the first message carries only
  the changed slots. Both are covered by `lootNet.test.ts`.
- **The radar's chest probe** never derives loot: a listed chest without a stored state is
  the generated one, whose loot is never empty.
- **Light and meshing "within 1 %"** (6.10) is checked through the faces per chunk (a
  deterministic count); timing light within 1 % cannot be measured reliably here.
- **The `loot-chest` reference** looks from the chamber corner beside the landing (2, 2):
  from the landing itself (2, −2) the shaft's log column stands between eye and chest.
- **`map-tab-places` became `map-tab-loot`**: the touch test of `e2e/radarPlaces.spec.ts`
  uses the menu world, which is generator 4 now; it checks five legend rows. The generator
  3 tests of that file are unchanged.
- **The hint element is `.crosshair-hint`**: the chest screen already has a `.chest-hint`
  line, whose rules would have hidden it.
- **The hint** is a line of its own where the break bar shows (it never shows with it), above
  the HUD message line.
- **`getState().world.chests`** counts stored states only (documented in `docs/testing.md`).
- **`botLoot.slow.test.ts` runs seed 1337 flat**, not balanced: with the walk back, the
  balanced world has no rich chest within 192 blocks at the start of chapter 4, so "both
  trips found a chest" could not hold there.
- **Creative worlds** get generator 4 and loot, as both modes use `GENERATOR_VERSION`.

## Tests changed on purpose

- Generator version 4 is known now: tests that used 4 as "unknown" use 5
  (`saveFormat.test.ts`, `terrainV1.test.ts`, `worldOptions.test.ts`, `urlParams.test.ts`).
- `pipeline.test.ts`: `src/world/loot.ts` may build chest states (the derived loot).
- `repoHygiene.test.ts`: 62 reference pictures.
- `terrainV3Speed.solo.test.ts`: 20 rounds; a second test for generator 4 against 2.
- `e2e/caves.spec.ts`, `e2e/worldMenu.spec.ts`, `e2e/inventory.spec.ts`: new worlds are
  generator 4 ("· Caves · Loot", checksum and spawn of generator 4).

## Known issues

- The generation budget keeps little room: generator 3 (unchanged) measured 1.30–1.38 ×
  against 1.35 × while a third generator ran in the same loop; in its own two-sided test it
  is 1.30 × again.
- Device test CAVE-1 (generator 3's caves on a phone) is still open; generator 4 adds no
  render cost of its own.
- Trip 2 of the loot run finds a rich chest within 192 blocks in only 5 of 12 worlds at the
  start of chapter 4 (grid shafts are one per 160 × 160 at 70 %, never within 48 of the
  spawn shaft).

## For the Pi side

Nothing new to configure: no build variables, packages, signaling requests or lazy chunks;
the room protocol is unchanged. Host and guests must run the same build. **Rollback:** a
world made by this build is generator 4. An older build lists it as "Saved by a newer
version", does not open it and never writes it; back on this build it opens unchanged.
Generator 3 worlds stay generator 3 and open on both builds. Rolling the Pi's main build
back loses no data, but shared worlds made by this build cannot be played until it
returns.

## Device tests

New in `docs/device-tests-2.md`, section 14: LOOT-1 to LOOT-7 (origin "8B3b"). None became
pointless; nothing was ticked in either open list.

## Suggestions for the next part

- If LOOT-2 shows the rich loot is not worth the walk (the bot cannot tell), a generator 5
  could raise counts; the tables of generator 4 are frozen with this merge.
- A furnace with contents is a new state kind and so a new save format (B3a1's rule).
- The bot could place held torches while digging, to measure what looted torches do to the
  dark breaks.
