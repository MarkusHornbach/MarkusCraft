# Phase 6 part C report – Gathering together

Plan: `docs/phase-6-plan.md`, steps 8–10. This part lets Gathering worlds be opened to
others and makes the host the keeper of its guests: every guest's items, place and
movement mode are saved with the world (save format version 2), and a returning guest
finds them again, also after the host closed and reopened the world. Timed breaking works
over the network: the host measures every break on its own clock, holds a `break` that
arrives a little early, and each screen still shows the break progress on its own clock.

**Precondition.** Part B was merged (pull request #31, main 3cb9f66); the plan lets Part C
start then. `sync/status.md` in the owner's `pi-infra` repository was reachable and read
(read only): it confirms the Pi side of Part B (no new configuration) and that NET-5 to
NET-12 were still open when it was written. Nothing was copied from it.

## What was built

- **Save format version 2** (`src/save/saveFormat.ts`, `SAVE_FORMAT_VERSION = 2`):
  `WorldMeta.guests`, a list of `GuestEntry { key, name, record, pose, moveMode,
lastSeenMs }`, at most `GUESTS_MAX = 32` (`limitGuests`: one entry per key, newest by
  `lastSeenMs`). Version 1 records decode with an empty list and are written back as
  version 2. A guest entry that does not check out is dropped without making the world
  damaged.
- **Guests in the host** (`src/net/HostSession.ts`): the saved guests are handed to the
  room when it opens (`HostOptions.guests`); a guest who leaves, is lost, or is still in
  the room when it closes is kept with its record (without a break in progress), pose and
  movement mode (`departed`). `guestEntries()` lists everyone the world keeps, those in
  the room as they are now. A returning key gets its record and pose in `welcome`, and its
  movement mode (`welcome.moveMode`; guests report flying with `fly` in `pose`); a new key
  starts next to the host as before. In Gathering everyone walks.
- **The game saves them**: `Game.currentMeta` asks the open room for its guests, closing
  the room hands them back to the world's record (`keepGuests`), and joins, leaves and
  guests playing mark the record unsaved (`guestsChanged`).
- **Gathering rules over the network**
  - `src/net/breakTiming.ts` (pure): `breakDueMs`, the grace rule (a `break` early by at
    most `NET_BREAK_GRACE_MS = 400` is held until it is due), and `BreakClock`, which puts
    a record's `breaking.startMs` on the clock of the player's own screen.
  - `HostSession`: the action clock is its `clock` (the browser's `performance.now()`) for
    every player, the host's own too; held breaks with the player's later actions queued
    behind them (`releaseHeld` in `update`, in every message handler and before every
    local action); the rate limit (`ACTION_RATE_LIMIT = 30` actions per second for each
    guest, refused with the new reason `rate`).
  - `ClientSession` and `HostLocalSession`: `BreakClock` with the screen's clock
    (`actionClock` / `localClock`: `Game`'s simulation time).
  - `Game`: one `startBreak` or `break` in flight at a time (`breakInFlight`); a `break`
    refused as `early` starts over.
  - "Open to others" is enabled in Gathering worlds; the text "Gathering worlds can be
    shared from a later version." is gone.
  - `authority.ts` needed no change: Part B's `FarReader` already bounds its cache and
    serves every guest action, stations included. This part adds its tests (AC9.3, AC9.4).
- **Test tools**: `__mc.give(item, count, player)` on a host gives into a guest's
  inventory (`HostSession.guestRecordDoor`); `stepPaced(page, n)` in `e2e/multiplayer.ts`
  steps a test page no faster than real time.
- **Tests**: `src/save/guests.test.ts` (AC8.1, AC8.2), `src/net/guestRecords.test.ts`
  (AC8.3), `src/net/gatheringNet.test.ts` (AC9.1–AC9.5), browser tests
  `e2e/mpGathering.spec.ts` (AC8.4, AC9.6–AC9.9) and `e2e/save.spec.ts` (AC8.5).

## Acceptance criteria

| AC     | Where / how                                                                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC8.1  | `src/save/guests.test.ts` "version 1 worlds": the Phase 3 part A fixture and one written by the encoder of the last build before this part         |
| AC8.2  | `src/save/guests.test.ts` "guests in the save" (round trip, eleven kinds of bad entries dropped, more than 32 keep the newest, one per key)        |
| AC8.3  | `src/net/guestRecords.test.ts` (leave, lost, while connected, returning key, a reopened world from the saved list, Gathering walks, the host key)  |
| AC8.4  | `e2e/mpGathering.spec.ts` "Phase 6 AC8.4" (the bar and the place within 0.1 blocks, flying; again after the host saved and reloaded)               |
| AC8.5  | `e2e/save.spec.ts` "Phase 6 AC8.5" (the Phase 5 fixture opens with its items and edits, and is saved as version 2 with no guests)                  |
| AC9.1  | `src/net/gatheringNet.test.ts` "500 breaks under seeded delays of 0–300 ms …" and "a break sent 600 ms early …"                                    |
| AC9.2  | `gatheringNet.test.ts` "Gathering rules for a guest" (gating, `full`, the carried torch, a carried torch without room)                             |
| AC9.3  | `gatheringNet.test.ts` "the authority cache" (10 020 positions in 40 chunks, edits before and after caching)                                       |
| AC9.4  | `gatheringNet.test.ts` "stations far from the host" (310 blocks, the host's chunk not loaded)                                                      |
| AC9.5  | `gatheringNet.test.ts` "the rate limit"                                                                                                            |
| AC9.6  | `e2e/mpGathering.spec.ts` "Phase 6 AC9.6" (a held mouse button, progress halfway, the log in the guest's inventory only, `verifyLight` 0)          |
| AC9.7  | `e2e/mpGathering.spec.ts` "Phase 6 AC9.7" (planks, workbench, pickaxe at it, furnace, glass with the 2 s bar; both stations in the host's world)   |
| AC9.8  | `e2e/mpGathering.spec.ts` "Phase 6 AC9.8" (a torch placed by the guest, the stone broken with real input, both gone on both, the torch in its bag) |
| AC9.9  | `e2e/mpGathering.spec.ts` "Phase 6 AC9.9" (the F key; a touch guest has no fly button in the host's Gathering world)                               |
| AC10.1 | `CLAUDE.md`, `docs/device-tests.md` (NET-13 to NET-16), this report, the pull request                                                              |

## Decisions and deviations

- **Decoded worlds carry the current format version.** A version 1 record is migrated
  while it is read (no guests) and written back as version 2 the next time it is saved.
  The tests that pinned "saving again writes the same record" (`saveFormat.test.ts` for
  the Phase 3 and Phase 4 fixtures, `e2e/light.spec.ts` Phase 4 AC5.2) now expect the
  same fields plus `formatVersion: 2` and `guests: []`. A version 2 record without a list
  of guests is damaged (the game never writes one).
- **Two protocol fields the plan does not list**: `welcome.moveMode` and `pose.fly`. The
  saved entry has a movement mode (plan step 8), and only the guest knows whether it
  flies. In Gathering the host ignores `fly` and every returning guest walks.
- **Saved guest names** may be up to 64 characters (a suffix can make a room name longer
  than 16); the host's own key is never taken as a guest's.
- **`lastSeenMs`** comes from `HostOptions.wallClock` (`Date.now()` in the shell); guests
  who are in the room get "now" when the list is taken.
- **The host's own player gets the screen-clock translation too.** Plan 5.7 names it for
  the guest only, but the host's action clock is `performance.now()` while its screen
  measures on its simulation time, so without it the host's own break progress would be
  meaningless. `HostLocalSession` uses the same `BreakClock`.
- **The host's own player goes through the grace rule as well** (one path for every
  player, plan 5.6); it has no network jitter, but a frame hitch can make its simulation
  time run ahead of the wall clock for a moment. It has no rate limit.
- **One break action in flight.** With an answer that comes a moment later, `Game`
  submitted `startBreak` again on every step until the answer arrived, which restarted
  the host's timer and would have run into the rate limit. `Game.breakInFlight` keeps it to
  one `startBreak` or `break` at a time; the answer or a new session clears it. With the
  local session the answer comes inside `submit`, so single-player is unchanged.
- **`early` starts over.** A `break` the host refuses as `early` (more than the grace
  before it is due) makes `Game` submit a new `startBreak`, as a new press would. It never
  happens in single-player.
- **Order behind a held break.** While a player's `break` is held, its later actions wait
  in a queue behind it and are decided in order when it is due; a later `break` may be
  held again. A held break is decided in `update` (frames and the 250 ms timer), in every
  message handler and before the host's own actions: at most 250 ms after it is due on a
  visible host page.
- **The rate limit** counts actions on arrival in windows of one second that start with
  the first action after the last window ended. `rate` is a new `RejectReason` in the
  action layer (results carry it); it has no text on screen.
- **`give` for guests.** The crafting test needs items in a guest's inventory; `give`
  takes a guest's id on the host and replaces that guest's record past the action layer,
  through the same single `replaceRecord` call of `Game.testGive` that `pipeline.test.ts`
  allows.
- **AC9.7** crafts through `__mc.submit` (the action layer, as a click on a row does) and
  smelts through the real recipe row, so the 2 s bar is the screen's.
- **Browser tests of guest breaks step at real time** (`stepPaced`): the host measures a
  guest's break on its own clock, and a test page that steps 60 steps in a few
  milliseconds sends its `break` far too early. `CLAUDE.md` names the helper.
- **AC7.10 of Part B changed**: its second half checked that "Open to others" is disabled
  in a Gathering world; it now checks that the button is enabled and has no note.

## Known issues

- A host whose page is hidden decides a held break only on its timer (throttled by the
  browser) or with the guest's next message (a ping every second at the latest), so a
  guest's break can come up to a second late while the host is hidden. Part D's hidden
  host test (AC11.2) can measure it.
- Smelting time is not checked by the host (plan decision 8).
- A guest whose clock runs much faster than the host's (more than the grace plus 100 ms
  per break) has its breaks start over. Real devices run their simulation at real time;
  NET-13 asks whether it ever happens.
- Software WebGL in the container and CI: connection times and frame rates of the browser
  tests say nothing about real devices.

## Measured numbers

- **Entry chunk** (`dist/assets/index-*.js`, minified): Part B **777.02 kB**; this part
  **778.67 kB** (+1.65 kB). `HostSession` 8.7 → 10.7 kB, `ClientSession` 6.8 → 7.0 kB,
  `protocol` 4.6 → 4.7 kB, `interpolation` 1.3 → 1.8 kB; `peerTransport` and
  `NetTestScreen` unchanged.
- **AC9.1** in the memory transport: 500 breaks under delays of 0–300 ms all accepted;
  with `NET_BREAK_GRACE_MS` set to 0 the first of them is refused (checked once by hand),
  so the grace is what carries them.
- **Line coverage** of `src/net/`: 97.4 % (statements 95.3 %, branches 91.0 %, functions
  96.8 %); all files 98.8 % (`npm run test:coverage`, 612 unit tests).
- Browser tests of this part in the container (one at a time): AC8.4 31 s, AC9.6 19 s,
  AC9.7 18 s, AC9.8 19 s, AC9.9 39 s.

## Full browser run

`MC_CONTAINER_GPU_STALL=1 npx playwright test`, the two projects one after the other on
the last commit of step 9: **game** 234 passed (16.3 min), **multiplayer** 35 passed
(13.1 min). No failures, no console errors or warnings. No reference screenshot changed:
the texts and menus this part touches (the Gathering note of "Open to others") appear in
no reference.

## For the Pi side

What the Pi must do or verify for the preview of this pull request (no addresses here):

1. **Nothing new to configure.** The build uses the same variables as Parts A and B
   (`BUILD_COMMIT`, `VITE_SIGNAL_URL`, `VITE_STUN_URLS`) and no new npm packages
   (`package.json` unchanged).
2. **No new peer ids or requests** on the signaling server; Gathering rooms are listed
   like Creative ones (the room list shows the mode).
3. **Save format version 2.** Worlds saved by this build carry a list of guests and
   format version 2. An older build refuses such a world as "made by a newer version"
   (it is not damaged and opens again in this build). Worlds are per site, so the PR
   preview does not touch the main build's worlds; after the merge, the main build
   migrates each world the first time it saves it, and a rollback of the main build to an
   older commit would show those worlds as newer.
4. **Check of the build**: as before, the served JS contains the 7-character commit and
   the signaling and STUN addresses; the lazy chunks (`HostSession-*.js`,
   `ClientSession-*.js`, `protocol-*.js`, `interpolation-*.js`) are served.
5. **Then the owner runs NET-13 to NET-16** (`docs/device-tests.md`, section 10) on the PR
   preview, and NET-5 to NET-12 of Part B if they are still open.

## Hard rule 1

Checked: no new art, names or texts beyond plain English game text; nothing taken from
another game.

## Tests on real devices

Added to `docs/device-tests.md`, section 10 "Multiplayer (Phase 6)": **NET-13, NET-14,
NET-15, NET-16** (6C). No test became obsolete.

## Suggestions for the next part

- Part D's soak (AC11.3) can play in a Gathering world: the rate limit and the grace are
  the rules most likely to show a difference between devices.
- If NET-13 shows breaks starting over, measure the time between `startBreak` and `break`
  on the host (a number for the F3 overlay of AC11.1) before raising the grace.
- `HostSession.guestEntries()` builds the list on every autosave of the meta record; with
  four players that is nothing, but a later dedicated host could cache it.
