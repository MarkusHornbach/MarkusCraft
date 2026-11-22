# src/save/ — the save format and the store interface

Pure core (see "Architecture invariants" in the root `CLAUDE.md`). The browser side lives
in `src/game/`: `idbStore.ts` (`WorldStore` on IndexedDB), `autosave.ts` (pure: when to
write what), `worldLock.ts` (one tab per world).

## Files

- `saveFormat.ts` (records with the world's guests, validation, names, seeds),
  `WorldStore.ts` (interface + `MemoryStore`)

## Saving

A world is one `WorldMeta` record plus one record per edited chunk (`save/saveFormat.ts`,
`SAVE_FORMAT_VERSION`, now 2). Decoding validates every field and never throws; a change
to the format needs a new format version and a migration.

Version 2 (Phase 6 part C) adds `guests`: `{ key, name, record, pose, moveMode,
lastSeenMs }` per player who played in the world as a guest, at most `GUESTS_MAX` (32,
newest by `lastSeenMs`, one per key); a guest entry that does not check out is dropped and
never makes the world damaged. Version 1 records load with no guests and are written back
as version 2 (decoded metas always carry the current version). How the host fills
`guests`: `src/net/CLAUDE.md`, "Rooms".

Stores implement `WorldStore`: `IdbStore` (database `markuscraft`, stores `worlds` and
`chunks`) in normal play and with `save=1`, `MemoryStore` in test mode. `Autosave`
decides when to write; `Game` marks chunks and the meta record dirty.
`Game.loadWorld(meta, edits)` swaps world, chunk manager, meshes, player and session in
place. Until a world is open `Game` holds an empty placeholder world.

The autosave writes nothing while a performance test runs (`src/bench/CLAUDE.md`) or while
the player is a guest in a room (a guest's world is never saved).

An unknown stored item id still loads and shows as "Unknown item"; a newer build must never
make a world "damaged".

Before changing the save format read the "Decisions and deviations" of
`docs/phase-3a-report.md` and `docs/phase-6c-report.md`.
