# src/save/ — the save format and the store interface

Pure core (see "Architecture invariants" in the root `CLAUDE.md`). The browser side lives
in `src/game/`: `idbStore.ts` (`WorldStore` on IndexedDB), `autosave.ts` (pure: when to
write what), `worldLock.ts` (one tab per world).

## Files

- `saveFormat.ts` (records with the world's guests and block states, validation, names,
  seeds),
  `WorldStore.ts` (interface + `MemoryStore`)

## Saving

A world is one `WorldMeta` record plus one record per edited chunk (`save/saveFormat.ts`,
`SAVE_FORMAT_VERSION`, now 6). Decoding validates every field and never throws; a change
to the format needs a new format version and a migration.

Version 6 (Phase 8 part B3a) adds block states to chunk records, `states: [[index, kind,
[slot, item, count, …]], …]` (the filled slots; left out when a chunk has none), and the
book version `progress.book` (an integer ≥ 1). A chunk record may hold states without
edits; a chunk named for a write is written even when empty, so no stale state survives.
Validation: index in the chunk and once, a kind the format knows (state kinds belong to
the format: a new kind needs a new version), slot 0–26 once, item 1–65 535 (unknown ids
load), count 1–`STACK_SIZE`; a state that does not check out makes the world damaged. A
format 6 record without a valid `book` is damaged, one with a `book` above `BOOK_VERSION`
is "newer". Formats 1–5 load with book 1 and no states and are written back as 6; a
decoded meta's book is upgraded to `BOOK_VERSION` by `upgradeBook` (`src/progress/book.ts`).
A full chest of 27 different stacks costs at most 400 bytes (AC4.4). An older build lists a
format 6 world as "Saved by a newer version" and never writes it.

Version 5 (Polish 2) adds `track` to every player record (the world's player, each guest
entry and network records): an integer from −1 to 65 535; a format 5 record without it,
or with another value, is damaged (a guest entry is dropped). Formats 1–4 load with
`track` 0 (`decodePlayer(value, format)`) and are written back as 5. An unknown task id
loads.

Version 4 (Phase 8 part A) adds `progress` (`{ done, counts }`, stored for both modes,
empty in Creative) and `xp`, `found`, `crafted` to every player record (the world's player
and each guest entry; `decodePlayer` requires them, also in network messages). Limits:
`xp` 0–1e9; `found` at most 256 and `crafted` at most 1 024 distinct ids 1–65 535; `done`
at most 1 024 distinct task ids; `counts` at most 1 024, one per task, counts 1–1e6. A
format 4 record whose progress fields do not check out is damaged; unknown task, block and
recipe ids load. Versions 1–3 load with an empty book and records at 0 XP (`decodePlayer`
with their format) and are written back as the current version: an old Gathering world opens as an Adventure
world at the start of the book.

Version 3 (Phase 7 part A) adds `options` (`{ terrain, trees }`, validated by
`decodeWorldOptions`): stored only for generator 2, `null` in `WorldMeta` for generator 1.
Versions 1 and 2 load as generator 1 with `options: null` and are written back as 3. A
generator 2 record without valid options is damaged, one with an unknown string is
"newer"; a generator 1 record with `options`, or an older format with generator 2, is
damaged. `metaGen(meta)` gives the world's `WorldGen`.

Version 2 (Phase 6 part C) adds `guests`: `{ key, name, record, pose, moveMode,
lastSeenMs }` per player who played in the world as a guest, at most `GUESTS_MAX` (32,
newest by `lastSeenMs`, one per key); a guest entry that does not check out is dropped and
never makes the world damaged. Version 1 records load with no guests and are written back
as version 2 (decoded metas always carry the current version). How the host fills
`guests`: `src/net/CLAUDE.md`, "Rooms".

Stores implement `WorldStore`: `IdbStore` (database `markuscraft`, stores `worlds` and
`chunks`) in normal play and with `save=1`, `MemoryStore` in test mode. `Autosave`
decides when to write; `Game` marks chunks and the meta record dirty.
`Game.loadWorld(meta, edits, states)` swaps world, chunk manager, meshes, player and session in
place. Until a world is open `Game` holds an empty placeholder world.

The autosave writes nothing while a performance test runs (`src/bench/CLAUDE.md`) or while
the player is a guest in a room (a guest's world is never saved).

An unknown stored item id still loads and shows as "Unknown item"; a newer build must never
make a world "damaged".

Before changing the save format read the "Decisions and deviations" of
`docs/phase-3a-report.md` and `docs/phase-6c-report.md`.
