# Phase 8 part B3a1 report – Block state and chest storage

Plan: `docs/phase-8b3a-plan.md` (sections 6.1–6.8, AC1–AC4). Branch
`ccr-2edc8251-1rj4du` (the session's branch). No screen: on `main` the chest exists only
through the test API (not craftable, not in the palette, the place input does not open
it). B3a2 builds the screen, opening, recipe, task 21 and the palette entry.

## What was built

- **The chest** (`Block.CHEST = 20`, item 20): an opaque, breakable cube with the tiles
  `CHEST_TOP` (23) and `CHEST_SIDE` (24), painted in `tiles.ts` (darkened planks in a dark
  frame; the side has a band and a metal latch, the top a frame and a rim). Break time and
  tool class as the workbench (1.5 s, axe). `PALETTE_ITEMS` keeps it out of the Creative
  palette; there is no recipe row.
- **Block state** (`src/world/blockState.ts`, `World.states`): `ChestState` with 27 slots,
  `STATE_KIND_OF_BLOCK`, the `initialState` hook (today an empty chest), the rules of 6.2
  (`setBlock` removes a state of another kind, `setState` refuses a loaded cell of another
  kind, stray loaded states are dropped and counted in `droppedStates`).
- **Actions** (`src/actions/apply.ts`): `chestMove`, `quickMove`, `takeAll`, `openChest`,
  `closeChest`; results carry `states`, set by the sessions after the blocks and reported
  through `onStates`. The break rule (Adventure: chest and contents together or `full`;
  Creative: `notEmpty`), a placed chest stores an empty state. New inventory functions
  `transferStack`, `addItemsInOrder`, `fitsAll`. HUD texts "No room for the chest's items"
  and "Empty the chest first".
- **Save format 6**: chunk records with `states`, `progress.book` in the world record,
  `upgradeBook` (`src/progress/book.ts`, tested with test tables; book 1 has no rules);
  formats 1–5 load with book 1 and no states. The autosave writes a chunk's states with its
  edits (`WorldStore.saveChunks(…, states)`).
- **Rooms**: snapshot `states`, `chest` and `viewers` messages, `FarReader.getState`,
  `worldHash(edits, states)`, decoders, viewer tracking on the host (`viewersOf` for tests).
  `SessionListener` has the optional `onStates` and `onViewers` (B3a2's screen uses them).
- **Test API and F3**: `getChest(x, y, z)`, `getState().world.chests`, the F3 row "Chests"
  ("3 chests · 1.2 kB", "· 1 dropped"), shown while the world has block states.
- **Tests**: `blockState.test.ts`, `src/actions/chest.test.ts` (with the AC2.4 soak in both
  modes), `src/save/chestSave.test.ts`, `src/progress/book.test.ts`, chest cases in
  `snapshot.test.ts` and `protocol.test.ts`, `src/net/chestNet.test.ts` (AC3.1–AC3.6),
  pipeline guards; browser `e2e/chest.spec.ts` and `e2e/mpChest.spec.ts` (in
  `e2e/shards.json`: game shard 4, multiplayer shard 3).

## Measured numbers (Node and Chromium in this container; never device evidence)

- **Traffic (AC3.5)**: four moving players, every guest moving a stack into or out of one
  shared chest twice a second: the host sends **14.4 kB/s** (limit 20; 8A2's worst case
  was 16.5 kB/s). `chest` messages carry only the changed slots, so no merging was needed.
- **Save (AC4.4)**: a full chest of 27 different stacks costs 253 bytes in its chunk
  record with item ids 1–27 and 64 per stack, 289 bytes with three-digit ids and full
  stacks of 99 (limit 400).
- **Soak (AC3.3)**: host and three guests, 1 000 random chest actions on two chests (one
  100 blocks away in a chunk the host never loaded): 450 accepted, the rest refused
  (`missing` for stale or empty slots, `full`), item totals equal before and after, every
  guest's hash, chests and record equal to the host's.
- **Soak (AC2.4)**: 2 000 random chest and inventory actions in each mode keep every item
  total (Creative: the chest count changes only by placed and broken chests).
- **Budgets (6.8)**: every generator checksum and the light checksum unchanged; the solo
  speed tests pass unchanged (the chest is an opaque cube; generation, light, mesher and
  radar are untouched).

## Decisions and deviations

- **`book` lives in `WorldMeta.book`, not in `WorldProgress`.** The plan calls it
  `progress.book` and names `upgradeBook(progress)`. In the stored record it is
  `progress.book`, as planned; in memory it is a field of `WorldMeta`, and
  `upgradeBook(progress, book, upgrades?, version?)` returns `{ progress, book }`. Adding
  it to `WorldProgress` would have changed every book literal in tests and the network's
  `progress` message for a value only the host's save needs. B3a2 adds its rule to
  `BOOK_UPGRADES`; decoding applies it (the host's room always opens from a decoded meta,
  so "a host's room opens with an older book" needs no code of its own).
- **The upgrade runs in `decodeMeta`.** A decoded meta always carries `BOOK_VERSION`, like
  `formatVersion`.
- **`states` in chunk records is optional in every format.** A chunk record has no format
  number of its own, and chunks of a format 5 world are rewritten one by one after it is
  opened as 6, so "format 6 records must have `states`" cannot be checked. Absent means
  none; when present it is validated as planned. A chunk written on purpose with neither
  edits nor states becomes an empty record, so no stale state can survive (cannot happen
  today: a chest always has an edit).
- **`ActionContext.states` is optional.** The sessions always pass it; without it every
  chest reads as empty. This kept the many hand-built contexts of older action tests
  unchanged. `LocalHost.world.getState` / `setState` are optional for the same reason.
- **Quick move and take all in Creative merge** into stacks of the same item in the bar
  (only `chestMove` swaps equal items in Creative, as the plan says). A full bar answers
  `full`.
- **A move inside the chest leaves the player's record alone**: such a `chestMove`
  returns `player: null` (a break in progress goes on); every move that touches the
  player's slots clears `breaking`, like `moveStack`.
- **Viewers when a chest breaks**: its viewers get `viewers { ids: [] }` (there is nobody
  else left to tell). A player whose `openChest` replaces another chest makes both chests'
  viewers learn it.
- **`result.notices` takes up to 32** in the guest's decoder (was 16): a broken chest
  reports one notice per item kind, up to 27 kinds, the chest and a carried torch.
- **The pickup notice** still shows one item at a time ("+64 Stone" replaces "+1 Chest");
  the notices are all in the result. B3a2 may show more if the device tests ask for it.
- **`chest` messages** use triples (slot, item, count) with count 0 and item 0 for an
  emptied slot; a freshly placed chest is `slots: []` (the guest stores an explicit empty
  chest).
- **The pipeline guard** counts `.setState(` (also `?.`) outside the three sessions; the
  signaling's own `setState` in `src/game/peerTransport.ts` is skipped by name. Chest slots
  built from slots (`kind: 'chest', slots`) are allowed in `src/actions/`, `blockState.ts`
  (the empty chest) and `ClientSession.ts` (a guest applies the host's slots).
- **Tiles**: the side tile is the same on all four sides (no facing), as planned.
- **Docs**: `src/net/CLAUDE.md`'s section on the network test moved to `docs/testing.md`,
  "Multiplayer"; the nested file is at 7 977 of 8 000 bytes.

## Tests changed on purpose

- `blocks.test.ts`, `items.test.ts`, `hardness.test.ts`, `lightRules.test.ts`: block and
  item 20 pinned (flags, tiles, break time, tool class, opacity).
- Save tests (`guests`, `progressSave`, `saveFormat`, `torchUnlock`, `trackSave`,
  `WorldStore`): format 6, `book: 1` in written records, `states` in decoded chunks and
  worlds; the "newer" fixture of `WorldStore.test.ts` is format 7 now.
- `snapshot.test.ts`, `protocol.test.ts`: snapshot messages have `states`.
- `e2e/save.spec.ts` and `e2e/light.spec.ts`: old worlds are written back as format 6 with
  `book: 1`; `getState().world` has `chests`.

## Known issues

- None found in this part. The three-worker local browser runs still crash pages for lack
  of memory (B2b's known issue); specs were run with one or two workers.

## For the Pi side

Nothing new to configure: no build variables, packages, signaling requests or lazy
chunks. The room protocol changed (snapshot `states`, `chest`, `viewers`, the chest
actions, `notEmpty`); host and guests must run the same build, which the build id ensures.
**Rollback:** worlds opened by this build are written as save format 6. An older build
lists them as "Saved by a newer version", does not open them and never writes them; back
on this build they open unchanged. Worlds this build never opened stay format 5. Rolling
the Pi's main build back loses no data, but shared worlds opened by this build cannot be
played until it returns. `sync/status.md` of the Pi repository was read: nothing there
concerns this part.

## Device tests

None: the chest has no screen yet. CHEST-1 to CHEST-8 (origin "8B3a2") come with B3a2 in
`docs/device-tests-2.md`.

## Suggestions for the next part (B3a2)

- Use `onStates` and `onViewers` from `SessionListener` for the screen's live updates and
  the "Also open" line; `Game` already marks chunks dirty in `onStatesChanged`.
- Add the book 2 rule to `BOOK_UPGRADES` and bump `BOOK_VERSION`; `decodeMeta` applies it.
- Add the chest to `PALETTE_ITEMS` by dropping its filter (the inventory screen reads that
  list).
- `src/net/CLAUDE.md` has 23 bytes left: anything B3a2 writes about rooms belongs in
  `docs/architecture.md` or the report.
