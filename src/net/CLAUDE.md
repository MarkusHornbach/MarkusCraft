# src/net/ — multiplayer: protocol, host and guest sessions

Pure core (Phase 6; see "Architecture invariants" in the root `CLAUDE.md`). Time reaches
`src/net/` as `nowMs`, randomness as bytes (`crypto.getRandomValues` in the shell). The
browser side (PeerJS, `Multiplayer`, build variables) is in `src/game/CLAUDE.md`.

## Files

- `transport.ts` (Connection, Signaling, RoomDirectory, Network), `memoryTransport.ts`
  (fake clock, seeded delays), `netTest.ts` (ids, messages and one run of the network test,
  candidate pair, texts), `protocol.ts` (messages, `encodeMessage`, validating decoders per
  direction, `validPose`), `roomCode.ts` (codes, peer ids, names, player keys)
- `snapshot.ts` (edits → snapshot parts → edits, `worldHash`), `HostSession.ts` (the host:
  players, `applyAction` per player, relay, time of day; `local` is the host's own
  `Session`), `ClientSession.ts` (the guest: join, sync, pose, ping, reconnect; a
  `Session`), `interpolation.ts` (`PoseBuffer`, `RemoteRoster`), `authority.ts`
  (`FarReader`: blocks of chunks the host has not loaded)
- `breakTiming.ts` (`breakDueMs`: the grace for early breaks; `BreakClock`: break starts on
  the screen's clock), `traffic.ts` (`TrafficMeter`, `countedNetwork`: messages and bytes
  of a room's connections)

## Rooms (Phase 6 part B)

`Game.session` is a `LocalSession` in single-player, the host's `HostSession.local` while
hosting, or the guest's `ClientSession` (the swap: `src/game/CLAUDE.md`). The host's
world, mode and record go into `HostSession`; every action of every player (the host's
own too) goes through `applyAction` there, with the acting player's record and last pose
and a `FarReader` for chunks the host has not loaded. A guest applies only what the host
sends (`blocks`, `record`, `result`); it never checks actions itself.

**A guest's world is never saved** (the autosave writes nothing while `role` is `guest`,
no world lock; `Game.openGuestWorld` loads it with `loadWorld`, after a reconnect at the
player's own pose). The host keeps every guest's record, pose and movement mode
(`HostSession` `departed` and `guestEntries()`), saved with the world's meta
(`currentMeta` asks the room; closing the room hands them to `Game.keepGuests`); a
returning key gets them back in `welcome` (`moveMode` there, `fly` in `pose`), a new one
starts next to the host. The host relays poses from frames and from its message handlers
(at most every 50 ms) and answers pings. `HostSession`, `ClientSession` and `protocol.ts`
are a chunk of their own, loaded the first time a room is opened, joined or listed.

## Gathering together (Phase 6 part C)

While a room is open the action clock of every player, the host's own too, is the host's
`performance.now()`; records' `breaking` from before the room is cleared. The screens
measure break progress on their own simulation clock: `BreakClock` (in `ClientSession`
and `HostLocalSession`) replaces a record's `breaking.startMs` with the screen's time of
the `startBreak`.

**The grace rule:** a `break` that reaches the host at most `NET_BREAK_GRACE_MS` (400)
before it is due is held (`breakDueMs`) and decided in the next message handler, `update`
or local action after the due time; the player's later actions wait behind it in order.
Earlier is `early`, as before; `Game` then starts the break over. `Game` sends one
`startBreak` or `break` at a time (`breakInFlight`, cleared by its answer or a new
session). More than `ACTION_RATE_LIMIT` (30) actions of a guest within one second are
refused `rate` (the host's own player has no limit). Every guest action reads blocks
through `FarReader` (reach, water, support, tools, stations within 5), also far from the
host. Smelting stays on the guest's screen.

## The figure in the protocol (Phase 6 part D)

`look` in `hello`, `welcome` and `joined`; `profile` (`name`, `look`; counts towards the
rate limit; the host applies the name suffix again and tells everyone, the sender too);
`busy` in `pose`, `fly` and `busy` in `poses`. The look is not saved with the world (every
`hello` brings it); a saved guest entry gets the new name. The figure itself:
`src/render/CLAUDE.md` and `src/player/CLAUDE.md`.

## Measure and harden (Phase 6 part E)

The F3 overlay has five network rows, shown only in a room (`netRows`,
`Multiplayer.debugInfo`): role, status, code and players; the round trip (a guest's own; on
the host what each guest reports in `ping.rtt`); the link of each connection from
`getStats()` every 2 s (`linkKind`: "direct", "via STUN", "relay"); the signaling state;
messages and bytes per second in and out over the last 2 s, counted by a `TrafficMeter`
around the room's network (`countedNetwork`). `traffic.ts` and the stats code are in the
lazy session chunk. Relayed poses are cut to millimetres and 1e-4 rad (`compactPose`) and
leave out flags that are false: with four moving players the host sends about 13 kB/s
(AC14.6, limit 20). The scenario `players`: `src/bench/CLAUDE.md`.

## The network test (Phase 6 part A)

A screen of its own (`nettest`), opened by "Network test" on the settings page; "Back"
returns there. Its test id is `mc-<build>-t-<4 characters>`; it lists the others from
PeerJS discovery every 3 s, connects with "Connect", runs 20 pings and 1 MB in 16 kB
messages (`NetTestRun`), reads the candidate pair from `getStats()` and gives one verdict
line.

Before changing the network layer read the "Decisions and deviations" of
`docs/phase-6a-report.md` to `docs/phase-6e-report.md` (sessions and protocol: 6B; timed
breaking and the save: 6C; the figure: 6D; overlay and relayed poses: 6E).
