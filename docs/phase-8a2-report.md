# Phase 8 part A2 report – Shared progress in rooms

Plan: `docs/phase-8a-plan.md`, section 5.12 and the 8A2 steps of section 8 (acceptance
criteria AC8.1–AC8.7). Part A1 (single-player progression, sections 5.1–5.11) is merged;
its tables stay as tuned.

## What was built

- **The host owns the book** (`src/net/HostSession.ts`): `HostSession` holds the world's
  `WorldProgress` from the moment the room opens and runs `eventsOf` / `stepProgress` for
  every accepted action of every player (its own too) and for every pose: a guest's from
  its `pose` messages, the host's own from `HostLocalSession.notePose` (which `Game` calls
  once per simulation step, as in single-player). `present` is the host and every guest in
  the room at that moment. A finished task's XP goes to all of them, first finds and first
  crafts to the actor; guests' XP, finds and crafts live in their records and therefore in
  their guest entries (kept when they leave, saved with the world). Each player's `craft`
  is locked by that player's own level.
- **Protocol** (`src/net/protocol.ts`): `welcome.progress`; the host message `progress {
progress, done: [{ task, by }] }`, sent to every guest when the book changes (at most
  once per action, before the records it changed); validating decoders with the save
  format's limits. The refusal `locked` is now known to the guest's decoder (it was
  missing: a guest would have dropped the answer to a locked craft).
- **Guest side** (`src/net/ClientSession.ts`): the book from `welcome` and `progress`,
  reported through `onProgress`; the guest's own level-ups and first finds are derived from
  its record updates. Two pure helpers in `src/progress/progress.ts`: `outcomesOfBook`
  (finished tasks with the player's name, task unlocks, finished chapters) and
  `outcomesOfRecord` (first finds, XP, every level passed). A guest's world opens with the
  room's book (`Game.openGuestWorld`).
- **Notices with names**: a finished task in a room says "Task done: Mine 32 logs (Anna) ·
  +10 XP" for everyone, the host too; "Chapter done" for everyone; level-ups and first finds
  only for their player (`noticeTexts` with the outcome's `by`).
- **"Open to others"** is enabled in Adventure worlds again; the 8A1 note is gone.
- **Test tools**: `setProgress` takes `counts` too; on a host it reaches every guest
  (`HostLocalSession.replaceProgress`).
- **Tests**: `src/net/progressNet.test.ts` (AC8.1, AC8.2, AC8.6 and the traffic rules of
  5.12, over the memory transport with 2 and 4 players), `src/net/protocol.test.ts`
  (AC8.3), `src/progress/progress.test.ts` and `view.test.ts` (the helpers, named notices),
  `e2e/mpProgress.spec.ts` (AC8.4), `e2e/mpMenus.spec.ts` (AC8.5).

## Acceptance criteria

| AC    | Where                                                                                                                                                                                                                                                                                                                                                                 |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC8.1 | `progressNet.test.ts` "shared progress in rooms": a guest's breaks advance the shared task; 2 and 4 players all get the task XP (also when the host finishes it); a guest who left gets nothing; first finds and first crafts to the actor only; locks per player; reach tasks from guest and host poses; Creative counts nothing                                     |
| AC8.2 | `progressNet.test.ts` "guests see the shared book": mid-book join gets the book in `welcome`; leave and return keeps XP, finds and crafts (a new key starts at level 1); the host's meta through `encodeMeta` / `decodeMeta` keeps the book and every guest entry's progress, and a rejoining guest gets them back; notices for everyone and for the player concerned |
| AC8.3 | `protocol.test.ts`: 13 malformed books (in `progress` and in `welcome`), 9 malformed `done` lists and a missing `done` are refused; the fuzz pieces include `progress`, `done`, `counts`; round trips of both new forms and of `locked`                                                                                                                               |
| AC8.4 | `e2e/mpProgress.spec.ts`: the guest (Anna) mines the last of 32 logs with real mouse input; both pages show "Task done: Mine 32 logs (Anna) · +10 XP", the Tasks tab with "✓" and "10 / 50 XP"; both XP values went 0 → 10                                                                                                                                            |
| AC8.5 | `e2e/mpMenus.spec.ts` Phase 6 AC7.10: the button is enabled in an Adventure world, no note, and the room opens                                                                                                                                                                                                                                                        |
| AC8.6 | `progressNet.test.ts` "the traffic of an Adventure room": four moving players, each guest places a stone brick twice a second with "Place 64 stone bricks" open, so every place changes the book: the host sends 16.5 kB/s (limit 20; the Creative scenario of Phase 6 AC14.6 sends 12.9)                                                                             |
| AC8.7 | All `mp*.spec.ts` (project `multiplayer`): 48 of 49 here, the one failure as in 8A1, see "Known issues"; CI runs all                                                                                                                                                                                                                                                  |

## Decisions and deviations

| Topic                           | Decision                                                                                                                                                                      | Why                                                                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Progress ids in rooms           | The screen's own player is `local` (`LOCAL_PLAYER_ID`) in every session, guests are their member id as text                                                                   | `Game` keeps calling `noticeTexts(outcomes, LOCAL_PLAYER_ID)` unchanged in single-player, as host and as guest                                                |
| The player's name in notices    | `taskDone` outcomes get an optional `by` (the actor's name), set by `HostSession` and `ClientSession`; single-player has none                                                 | The plan's text "(Anna)" needs a name; ids are not names, and a guest knows only the name the host sends                                                      |
| `HostOptions.progress`          | A value (the book when the room opens), no longer a getter of `Game`'s book; `Game` follows the host's `onProgress`                                                           | The host owns the book (5.12); `Game` keeps its copy for the save, the screens and the single-player session after the room closes                            |
| Order of messages               | Per action: `blocks`, then `progress` to every guest, then the changed `record`s, then the `result`                                                                           | A guest shows "Task done" before its own "Level 2", as the host's step orders them                                                                            |
| Guest's `onProgress` on records | Also when only the XP changed (no level, no find), with no notices                                                                                                            | `Game.onPlayerChanged` does not refresh the Tasks tab; the XP bar must move                                                                                   |
| First crafts on the guest       | Silent: `outcomesOfRecord` reports their XP as `xp` only                                                                                                                      | As in single-player (plan 5.7)                                                                                                                                |
| Guests never step the book      | A guest never steps the book; `ClientSession` has no `notePose`                                                                                                               | The host receives the guest's poses anyway (plan 5.12)                                                                                                        |
| `setProgress` `counts`          | Added: `setProgress({ counts })` sets the open tasks' counts (validated by the save's `decodeProgress`); `done` without `counts` still clears them                            | AC8.4 needs "one log short of 32" without 31 real breaks; plan 5.8 lists the tool's fields, this one only adds a field                                        |
| `setProgress` on a host         | Replaces the host's book and sends a `progress` with an empty `done` to every guest                                                                                           | Plan 5.12 says tests use `setProgress` in rooms; the guests must see the same book                                                                            |
| `locked` in the protocol        | Added to the decoder's refusal reasons                                                                                                                                        | A bug of 8A1: the guest dropped the answer of a locked craft as malformed. Found by AC8.1's lock test                                                         |
| AC8.6 scenario                  | A unit test over the memory transport, like Phase 6 AC14.6, with every guest action changing the book (the worst case for `progress` messages), not a new bench scenario      | The bench scenario `players` runs in Creative and measures frames; the limit concerns the host's bytes, which the meter counts the same way in Node           |
| AC8.6 cells                     | Each guest places 3–5 blocks above its own feet; at least 50 of the 60 places must be accepted, and every accepted one must count once and reach each guest as one `progress` | Cells near a moving guest are always in reach; a cell placed earlier on the circle can be occupied, which the test tolerates without hiding a missing message |

## Known issues

- The full run of the project `multiplayer` in this container: 48 of 49 passed (23.8
  minutes). `e2e/mpMenus.spec.ts` Phase 6 AC7.10 fails here as in 8A1 (on its base commit
  too): the fifth player's second join stays at "Connecting…", so the new check of AC8.5
  at the end of that test is not reached in this container. CI decides.
- `e2e/mpRooms.spec.ts` Phase 6 AC5.5 (the time of day follows the host) failed in two of
  four runs in this container (it passed in the full run): a brightness comparison under
  software WebGL, untouched by this part. CI decides.

## Measured performance

- Host traffic with four moving players whose every action changes the book: 16.5 kB/s in
  106 messages/s (AC8.6, Node, memory transport); the Creative room of AC14.6: 12.9 kB/s in
  85 messages/s.
- A pose step without an open reach task returns at once (8A1 AC2.5); the host now runs it
  for every received pose and for its own once per simulation step. No new measurement;
  numbers from software WebGL are not evidence of frame rates.

## Tests on real devices

Added to `docs/device-tests.md`, section "Progression (Phase 8 part A)": PROG-6 (two
players finish chapter 1 together) and PROG-7 (leave and rejoin keeps the level; the save
keeps it). No test became pointless; none was ticked.

## Hard rule 1

Checked: the new texts are plain English words and player names; no images were added.

## For the Pi side

The room protocol changed (`welcome.progress`, the message `progress`); devices must run the
same build, which the build id ensures. No new build variables, packages or requests on the
signaling server. PROG-6 and PROG-7 need the PR preview of this part running while its pull
request is open.

## Suggestions for the next part

- Recalibrate `HUMAN_FACTOR` and the counts after PROG-1; in a room of two the book goes
  about twice as fast (one task each), which PROG-6 can tell.
- Later parts add event kinds (`eat`, `kill`, `open`): the host runs them through the same
  `runProgress`; a guest needs nothing new unless the event comes from the guest's screen.
