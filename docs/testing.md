# Testing reference

Read on demand. The rules for writing browser specs are in `e2e/CLAUDE.md`; the short list
every session needs is in the root `CLAUDE.md`, "Headless testing".

The game exposes a test API on `window.__mc` (`src/game/testApi.ts`) and accepts URL
parameters so tests are deterministic. Details are specified in `docs/phase-1-plan.md`
(section "Test strategy"); this file is the current reference.

## Unit tests

`npm test` takes about half a minute: the four `lightEdits*.slow.test.ts` files check the
light against the slow reference after each of 2 000 random edits. The three passes and
`expectFasterThan`: root `CLAUDE.md`, "Project structure".

## URL parameters

- `?seed=<int>` fixes the world, `?time=<0..1>` sets the time of day, `?freeze=1` stops
  the clock, `?test=1` runs without menus and pointer lock and with fixed settings,
  `?touch=1` forces touch mode (shows the touch controls without a touch on the play
  button).
- With `test=1` the world lives in memory (`MemoryStore`) and is never stored. `save=1`
  (with `test=1`) uses IndexedDB and opens the world named by `world=<name>` (default
  "Test"), creating it from `seed`. Each Playwright test has its own browser context and
  therefore an empty IndexedDB; persistence tests reload inside one context.
- `mode=gathering` or `mode=creative` (with `test=1`; default Creative) sets the game mode
  of the test world.
- `terrain=flat|balanced|hilly` and `trees=none|few|normal|many` (with `test=1`, Phase 7
  part A) make the test world generator 2 with these options; a missing one takes its
  default (Balanced, Few), an invalid value is ignored. Without both the test world is
  generator 1, so `?test=1&seed=1337` keeps the terrain of every older spec and reference.
- `gen=2|3|4` (with `test=1`, Phase 8 parts B2a, B3b) picks the test world's generator;
  with `terrain` and `trees` or their defaults. `gen=3` alone is generator 3, balanced, few
  trees (caves and mine shafts), `gen=4` the same with loot chests; without `gen` the rule
  above holds. In specs: `openGame(page, { gen: 3 })`.
- `progress=all|fresh` (with `test=1`, Phase 8 part A): the task book of an Adventure test
  world (`mode=gathering`). Default `all`: every task done and the player at the maximum
  level, so older specs that craft keep working; `fresh` starts the book. Worlds made by
  the form are always fresh, in tests too (a spec that crafts beyond level 1 there calls
  `setProgress` first).
- `?bench=1`, `bench=quick`, `bench=sample`: see "Performance test" below.
- `look=<0–8>` and `previewgl=0` (the preview gets no WebGL), Phase 6 part D.
- `join=<code>` (in test mode: join at once; otherwise the world menu's "Join world CODE")
  and `name=<text>`; `signal` and `stun` (`src/game/CLAUDE.md`).
- Without `test=1` the page starts in the world menu and `?seed=` only pre-fills the "New
  world" form.

## Test API

- Base (Phase 1): see `docs/phase-1-plan.md`, "Test strategy" (`step(n)`, `isReady()`,
  `whenIdle()`, `getState()`, …). In test mode the simulation only advances through
  `__mc.step(n)`.
- Beyond Phase 2: `submit(action)` (returns the session's answer), `save()`,
  `openWorld(name, seed, mode?)` (switch worlds in place), `terrainChecksum()`,
  `give(item, count, player?)` (on a host with a guest's id: into that guest's inventory,
  Phase 6 part C), `clearInventory()`; `getState()` has `mode`, `world`,
  `save { dirty, lastError, lastSaveMs, lastLoadMs }`, `inventory`,
  `breaking { x, y, z, progress } | null`, `ui { screen, tab }`,
  `recipes [{ id, name, craftable, missing, stationMissing }]` in table order (ids 1–20),
  and `smelting { recipe, progress } | null`. `setBlock`, `give` and `clearInventory` are
  direct tools past the action layer.
- Light (Phase 4): `getLight(x, y, z)` → `{ sky, block }` or null in a chunk that is not
  lit; `verifyLight()` → number of wrong cells (0 is correct; slow); `lightChecksum()`;
  `getState()` has `chunks.lit`, `chunks.relight`, `settings.brightness` and
  `perf { chunkWorkAvgMs, chunkWorkMaxMs, longFrames, frames }` (last ten seconds).
- Phase 5: `getState().pad { connected, active, polls, unsupported }`, `ui.focus`
  (aria-label, text or id of the focused element; the key is left out while there is no
  focus, so older `toEqual` checks of `ui` hold), `settings.padSensitivity` and
  `settings.padInvertY`; `glyphSheet()` shows all controller glyphs (reference
  `pad-glyphs`).
- Phase 6 part D: `getState().player` also has `name`, `choice` (0–8) and `look`;
  `ui.preview { frames } | null`; `__mc.figureSheet()` (reference `figure-sheet`).
- Phase 7 part A: `getState().world.options` (`{ terrain, trees }`, `null` for generator 1);
  `terrainChecksum()` uses the open world's generator; `getState().settings.collideLeaves`;
  `setCollideLeaves(on)` switches "Collide with leaves" without storing it (test mode has no
  settings page). References `gen2-balanced-few`, `gen2-flat-many`, `gen2-hilly-normal`
  (`e2e/terrain.spec.ts`).
- Phase 8 part B2a: `getState().world.generatorVersion` is 3 in caves worlds;
  `caveSites()` gives generator 3's spawn shaft (`top`, `chamber` standing cells),
  nearest entrance (`mouth`, deep `end`) and ravine (`start`, lowest `floor`), or null for
  older generators (pure: `caveSites` in `terrainV3.ts`). Poses of the references
  `cave-tunnel`, `mine-shaft`, `ravine` come from `src/testing/caveViews.ts`
  (`e2e/caves.spec.ts`); `e2e/mpCaves.spec.ts` is the room of a generator 3 world.
- Phase 8 part A: `openWorld(name, seed, mode?, progress?)` (a new Adventure world's book,
  default `all`); `setProgress({ xp?, done?, counts? }, player?)` sets the XP (on a host with a
  guest's id: that guest's) through the single `replaceRecord` of the test tools, and
  `done` replaces the world's done list and clears the counts (8A2: `counts` sets them; on
  a host every guest learns the new book; a guest never gets `progress=all`); `getState().progress`
  `{ level, xp, nextLevelXp, chapter, done, tasks [{ id, count, goal, done }] (the open
chapter), notice }` or `null` in Creative; `recipes[]` has `locked` and `unlock`
  (`{ level } | { task }`); `ui.tab` may be `tasks`. References `tasks-tab`,
  `tasks-tab-touch`, `recipe-list-locked`, `progress-notice` (`e2e/progress.spec.ts`,
  `e2e/progressTouch.spec.ts`). Part A2: shared progress in a room, `e2e/mpProgress.spec.ts`
  (no references).
- Polish 2: `getState().progress` has `tracked` (`{ id, text } | null`, what the HUD's task
  tracker shows) and `track` (the record's choice: 0 automatic, -1 hidden, or a task id);
  `submit({ kind: 'track', task })` sets it. References `task-tracker` (PC, a clip of the
  top-left corner) and `task-tracker-touch` (640 × 360, the canvas hidden)
  (`e2e/taskTracker.spec.ts`, `e2e/progressTouch.spec.ts`).
- Phase 8 part B1 (the radar): `getState().radar` (null in Creative) is `{ unlocked,
setting, shown, focus, entries, beyond, scans, draws }`; `entries` are what the circle
  drew last (`kind`, `dx`, `dy`, `dz`, `dist`, `hint`, `screen`: the spot relative to the
  circle's centre in CSS pixels, y down), `scans` and `draws` count since the world was
  loaded. `getState().map` exists only while the Map tab is open: `{ locked, entries (all
kinds, 8 each), legend (texts), draws }`; `ui.tab` may be `map`; `settings.radar`.
  `progress=all` unlocks the radar, `progress=fresh` does not; test mode ignores stored
  settings, so the switch is tested from the menu. The test tool `setBlock` also tells the
  radar. Mining a vein through actions: `e2e/radar.ts` (`mineCell`, `veinAt`); touch
  layouts need the menu flow (`openTouchAdventure`), since test mode keeps 960 × 540.
  References `radar-circle`, `radar-circle-touch` (both at the default size Medium),
  `map-tab` (`e2e/radar.spec.ts`, `e2e/radarTouch.spec.ts`, `e2e/radarMap.spec.ts`); rooms:
  `e2e/mpRadar.spec.ts`. Bench scenario `radar`: `src/bench/CLAUDE.md`.
- Phase 8 part B2b (places): in `gen=3` worlds `entries`, `beyond` and `map.legend` also
  hold the kinds `shaft` and `cave` (2 per kind on the circle, 4 on the map);
  `settings.radarSize` (0–2). `openTouchAdventure(page, settings)` stores settings first
  (its world is the menu's, generator 4 since B3b). Reference `radar-places` (PC circle,
  `gen=3`) in `e2e/radarPlaces.spec.ts`; the room check in `e2e/mpCaves.spec.ts`.

- Phase 8 part B3a1 (chests, no screen yet): `give(20, n)` gives chests; `submit` takes
  `chestMove`, `quickMove`, `takeAll`, `openChest`, `closeChest`; `getChest(x, y, z)` gives
  the 27 slots (`{ item, count } | null`) or null where no chest is (also in a chunk that is
  not loaded); `getState().world.chests` counts chests with at least one item;
  `getState().net.worldHash` covers block states. The F3 row "Chests" ("3 chests · 1.2 kB",
  "· 1 dropped") shows while the world has block states. `e2e/chest.spec.ts` (single
  player, `save=1`), `e2e/mpChest.spec.ts` (a room, a late guest).
- Phase 8 part B3a2 (the chest screen): an accepted `openChest` opens the screen, also one
  submitted through `submit`; `ui.screen` is then `chest` and `ui.chest` is `{ x, y, z,
viewers }` (the names of the "Also open" line; left out while closed, like `focus`).
  Specs: `e2e/chestScreen.spec.ts` (mouse, Creative, the play-through of task 21),
  `e2e/chestTouch.spec.ts` (touch, layouts at 640 × 360, 915 × 412, 1280 × 800),
  `e2e/chestPad.spec.ts` (controller), `e2e/mpChestScreen.spec.ts` (a room), with the set-up
  helpers in `e2e/chests.ts`. References `chest-screen`, `chest-screen-touch`,
  `pad-chest-screen` and `chest-block` (in `e2e/chest.spec.ts`).
- Phase 8 part B3b (loot): `lootSites()` gives a generator 4 world's spawn shaft chest
  (`spawn: { chest, stand }`, `stand` a free chamber cell diagonal to it) and the nearest
  grid shaft's chest within 256 (`grid`), or null for older generators; `getChest` reads
  an untouched loot chest's derived contents. `getState().world.chests` and the F3 row
  "Chests" count stored states only: an untouched loot chest is not counted.
  `terrainChecksum(cx, cz)` hashes the 3 × 3 chunks around chunk (cx, cz) (the V4
  checksums around the spawn chest). The Map tab and circle of generator 4 hold the kind
  `chest`. `faceCell` and `spawnLoot` (`e2e/chests.ts`) stand at a cell aiming at another.
  Specs: `e2e/loot.spec.ts` (references `loot-chest`), `e2e/chestHint.spec.ts` (mouse,
  touch, pad; `chest-hint`), `e2e/mpLoot.spec.ts` (a room, a late guest, the guest's
  radar); `e2e/radarPlaces.spec.ts` shows the menu world, now generator 4 (`map-tab-loot`).

## Controller

Controller tests call `installFakePads(page)` (`e2e/gamepad.ts`) before `goto`; it
replaces `navigator.getGamepads` with pads in `window.__fakePads`. `new Pad(page)` has
`connect()` (with a wake-up tap of Select, as a real browser reports a pad only after a
press; `connect({ holding })` connects with buttons down, `wake: false` without the tap),
`disconnect()`, `press`, `release`, `tap`, `trigger(button, value)` and
`stick('left' | 'right', x, y)` (y down). A test that measures how far a stick moved
something uses `stickFor(which, x, y, count)`, which holds it for exactly `count` polls
inside one page call: between two separate calls it stays out as long as the round trips
take. `e2e/gamepadInventory.spec.ts` walks the inventory with `focusOn(page, pad,
selector)`, which taps the D-pad towards an element (rows first) without knowing the
layout. Each call applies the change and reads the poll count in one page call, then waits
until `getState().pad.polls` grew by two; `tap` holds the button for exactly one poll
(held longer, a slow frame could make the D-pad repeat after `PAD_NAV_DELAY_MS`, as it
should). `BUTTON` has the standard indices.

## Multiplayer

- The network test (Phase 6 part A): a screen of its own (`nettest`), opened by "Network
  test" on the settings page; "Back" returns there. Its test id is
  `mc-<build>-t-<4 characters>`; it lists the others from PeerJS discovery every 3 s,
  connects with "Connect", runs 20 pings and 1 MB in 16 kB messages (`NetTestRun`), reads
  the candidate pair from `getStats()` and gives one verdict line.
- Part A: `__mc.netNetwork()` gives a test the page's PeerJS network to drive directly;
  outside a room `getState().net` is `{ role, available, build, test }`, with `test` the
  network test's state while its screen is open.
- Part B: `__mc.net.host({ code?, build? })`, `net.join(code, { name?, checksum?, build?
})` (`checksum` forces a terrain mismatch, `build` another build), `net.rooms()`,
  `net.leave()`, `net.sendRaw(message)`, `net.dropConnection()`, `suspendFrames(on)`;
  `getState().net` has `role`, `status`, `roomCode`, `selfId`, `players` (with
  `renderX/Y/Z/Yaw`, where the figure is drawn), `rttMs`, `lastResult` (the host's last
  answer, also to raw messages), `worldHash`, `lastError`, `notices`, `figures`. `setBlock`
  on a host is sent to the guests; on a guest it throws.
- Part D: `net.players` has `look`, `fly`, `busy`, `anim { bodyYaw, headYaw, headPitch,
leftArm, rightArm, leftLeg, rightLeg }` (the angles drawn in the last frame, null if not
  drawn) and `tagDraws`. Tests whose pictures show a figure or a head icon fix the look
  with `look=`: one from the random player key would change the reference.
- A guest in Gathering whose breaks are timed steps with `stepPaced(page, n)`
  (`e2e/multiplayer.ts`, no faster than real time): the host measures breaks on its own
  clock. A crash without goodbye: `Page.crash` through a CDP session.

## Performance test

`?bench=1` (never with `test=1`, where it is ignored) opens the start page of the
performance test instead of the world menu, `bench=quick` the same with the quick suite
(render distances 2 and 3, a twentieth of the steps; what the browser tests run),
`bench=sample` the result screen with the built-in `SAMPLE_RESULT`. `getState().bench` is
null outside the test, otherwise `{ phase, suite, index, total, scenario, reason,
figures }` (`figures`: most other players' figures drawn at once during the run);
`__mc.benchResult()` returns the record on the result screen or null. The run is driven by
its own buttons (`.bench-start-button`, `.bench-cancel-button`, …). Tests of a run wait on
`getState().bench`, give themselves four minutes and never assert on a measured time or a
light; the rules that throw a run away apply once the progress line shows "scenario 1 of
15" (`untilMeasuring` in `e2e/bench.spec.ts`). To play a suite by hand:
`node scripts/benchRun.mjs [1|quick] [folder]` against the preview server (the full suite
takes about three minutes in a cloud session).

## Regenerating references of the world

Anything that changes light, the mesher or the shader: first copy `e2e/screenshots/` out
of the repository, regenerate with `npx playwright test --update-snapshots=all`, then
`node scripts/compareShots.mjs <old copy> <sheet folder>` writes one sheet per reference
with the old picture left and the new one right, and prints how many pixels changed. Open
every sheet with the Read tool and judge it against the checklist of
`docs/phase-4-plan.md`, section 6.5; the report gets one line per reference. A change the
checklist does not explain is a defect, not a new reference.

For a quick look at any pose: `npm run build`, `npm run preview`, then
`node scripts/shot.mjs "?test=1&seed=1337" out.png`.
