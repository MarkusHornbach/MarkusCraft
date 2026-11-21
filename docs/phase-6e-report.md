# Phase 6 part E report – Measure and harden

Plan: `docs/phase-6-plan.md`, steps 14–16. Branch: `claude/pensive-bohr-ufdsmv` (the
branch assigned to the cloud session). With this part Phase 6 is complete.

**Precondition.** Part D was merged (pull request #33, main 14954ce). `sync/status.md` in
the owner's `pi-infra` repository was reachable and read (read only); nothing was copied
from it. The owner ran NET-5 to NET-25 (Parts B, C and D) on real devices, all passed
(owner, 2026-11-21); this part ticked them in `docs/device-tests.md` with that result, as
a documentation-only change in its first commit.

## What was built

**Step 14 – overlay and hidden host.**

- `src/net/traffic.ts` (pure): `TrafficMeter` counts messages and bytes in and out of a
  peer's connections and gives rates over the last 2 s (`TRAFFIC_WINDOW_MS`);
  `countedNetwork` wraps a `Network` so every connection its signalings make or accept is
  counted. It also lists the open connections for their statistics.
- Round trips on the host: a guest's `ping` carries its last round trip (`rtt`, optional,
  validated 0–60 000 ms); `HostSession.roundTrips()` lists each guest's last report.
- `linkKind` (`src/net/netTest.ts`): "direct (host → host)", "via STUN (srflx → host)" or
  "relay (…)" from the candidate pair of `getStats()`.
- `Multiplayer.debugInfo`: role, status, room code, players, round trips, links (stats read
  every 2 s), signaling state and traffic. `ClientSession.signalState` exposes the guest's
  signaling state. The traffic and stats code is part of the lazy session chunk.
- The F3 overlay (`src/ui/DebugOverlay.ts`) has five more rows – Room, Round trip, Link,
  Signaling, Traffic – shown only while a room is open or joined (`netRows`, pure).
- **Compact poses**: relayed poses are cut to millimetres and 1e-4 rad (`compactPose`) and
  leave out the flags `tp`, `fly`, `busy` when they are false (the decoder reads a missing
  flag as false). This took the host's traffic with four moving players from 25.5 kB/s to
  12.9 kB/s (AC14.6 asks for less than 20).

**Step 15 – the scenario `players`.**

- `src/bench/scenarios.ts`: `Scenario.guests` (a `GuestScript`: looks, pose and action of
  each guest per step) and the scenario `players` (version 1, 1 200 steps, label "four
  players"), appended to the table; `BENCH_SUITE_VERSION` 3. The player stands at the start
  point looking south-south-west (`PLAYERS_YAW` 195°); three guests in looks 2, 5 and 8
  (Ember, Moss, Plum) walk arcs of radius 3.5, 6.5 and 9.5 blocks, at most 45° to either
  side of the view, at walking speed, on the terrain's height. Every 30 steps each guest
  places a block on the ground outside its arc and breaks it again with its next edit; it
  holds break (`busy`) for the 15 steps before a break. A window ends with every block
  broken again.
- `src/bench/simGuests.ts`: `SimRoom` – a `HostSession` on the run's world and three
  `ClientSession`s over a `MemoryNetwork` without delay. The room's clock is simulation
  time: it advances by one step per simulation step, so every device plays the same.
  Joining happens in the frames of the `settle` phase.
- `BenchRunner` and `BenchHost`: `openGuests` when a scenario with guests is prepared,
  `guestsReady` as part of `settle`, `stepGuests` with every step (warm-up included),
  `closeGuests` when it ends or the run is interrupted.
- `Game`: loads the `simGuests` chunk when a run starts; draws the room's roster with the
  room's clock; passes guest edits to `onBlocksChanged` (meshes); `getState().bench.figures`
  is the most figures drawn at once during the run.

**Step 16 – documentation.** `README.md` (the new scenario; "What goes where"; the
overlay's network rows), `CLAUDE.md` (Phase 6 complete, structure, conventions, test
API), `docs/device-tests.md`, this report.

## Acceptance criteria

| AC     | Where / how                                                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC14.1 | `e2e/mpHarden.spec.ts` "Phase 6 AC14.1" (both pages: room, round trip, `direct (host → host)`, signaling `open`, traffic); `DebugOverlay.test.ts` |
| AC14.2 | `e2e/mpHarden.spec.ts` "Phase 6 AC14.2" (host with `suspendFrames(true)`: edit confirmed in < 2 s, A sees B move, time advances on both guests)   |
| AC14.3 | `e2e/mpHarden.spec.ts` "Phase 6 AC14.3" (four players, 50 actions each with moves, one leaves and rejoins; hashes equal; heap; console clean)     |
| AC14.4 | `e2e/mpHarden.spec.ts` "Phase 6 AC14.4" (50 000 edits, the guest's `worldHash` equal within 20 s)                                                 |
| AC14.5 | `src/net/hardening.test.ts` (10 000 actions, best of three rounds; 300 relays of four moving players)                                             |
| AC14.6 | `src/net/hardening.test.ts` (ten seconds of four players walking, guests editing twice a second, counted by `TrafficMeter`)                       |
| AC15.1 | `src/bench/scenarios.test.ts` (table, suites, `BENCH_SUITE_VERSION = 3`), `src/bench/simGuests.test.ts` (same actions every run, all accepted)    |
| AC15.2 | `e2e/bench.spec.ts`, the quick run: 13 rows with `players`, `getState().bench.figures` is 3                                                       |
| AC15.3 | `e2e/bench.spec.ts`, the quick run: no request outside the origin, nothing stored but the result and the settings, no world                       |
| AC16.1 | Hard rule 1 below                                                                                                                                 |
| AC16.2 | `README.md`, `CLAUDE.md`, `docs/device-tests.md`, this report, the pull request                                                                   |

## Decisions and deviations

- **Round trip on the host.** The host sends no pings of its own (it needs no timer, plan
  5.1), so it shows what each guest reports: the guest's ping carries its last round trip
  (`ping.rtt`). The overlay lists them per guest ("Anna 6 ms, Ben 9 ms").
- **The overlay's network rows are hidden in single-player**, so the overlay keeps its
  size there (the touch layout tests check that it does not cover the menu button).
- **"Candidate type"** is shown as the link of each connection: "direct" for host
  candidates on both sides, "via STUN" when one side is `srflx` or `prflx`, "relay" for
  `relay`, with the pair in brackets. Statistics are asynchronous and read every 2 s.
- **Traffic is counted in characters of the message text** (the protocol is ASCII JSON,
  so characters are bytes), on the room's connections only (the room list's short
  queries are not counted).
- **Compact poses (AC14.6).** The first measurement was 25.5 kB/s with full doubles and
  all flags in every relayed pose. Rounding and leaving out false flags were the smallest
  change that met the limit with room to spare; positions keep millimetres, which no
  figure shows. Poses a guest sends are not rounded (the host's records keep full values).
- **AC14.5 measures the host's own action path** (`HostLocalSession.submit`: decode,
  `applyAction`, `setBlock` with light, broadcast to three guests). A guest's action adds
  only the JSON decode. The test lights two chunks around every edit: an edit next to a
  chunk that is generated but not lit lights that chunk afresh (7 ms each), which the
  game never does because its chunks around the player are lit.
- **AC14.2** uses `suspendFrames(true)` as the plan says; the host's 250 ms timer still
  runs. A really hidden tab throttles timers; the message handlers carry the room then
  (Part B), and NET-9 passed on real devices.
- **AC14.3 plays in Creative.** The Part C report suggested Gathering; Gathering breaks
  take seconds of real time each and the host times them on its clock, so 200 actions
  would take minutes under software WebGL. The Gathering rules are covered by Part C's
  tests (the grace rule with 500 breaks under jitter, the rate limit).
- **AC14.3 heap.** Measured with the DevTools protocol after a forced garbage collection
  before and after (`HeapProfiler.collectGarbage`, `Runtime.getHeapUsage`).
- **AC14.4 edits** lie in chunks far from every player (3000, 140–152, 3000): they are
  snapshot data like any other and need no light or meshes on either side. The 50 000
  `setBlock` calls run before the room is opened.
- **The simulated guests run over a memory network without delay**, driven by the
  simulation's steps; joining needs a few frames (each `await` of the join is one
  microtask turn) and happens in `settle`. Their terrain checksum is 0 on both sides (no
  generation for a check that cannot fail here).
- **The guests' route and cells are pure functions of the scenario** (terrain heights of
  generator version 1, and the generated chunk data for the cells), so they are the same
  in every run. A cell is on free ground (two free cells above it, so no leaves), within
  5.5 blocks of the guest where it places and where it breaks, and away from the other
  guests; the search turns the cell along the arc where a tree is in the way.
- **The view of `players`.** A first version looked north from the start point, where
  the woods hid the figures (seen in a screenshot of the run). A search over directions
  chose 195° (south-south-west), where the guests are in view. The world of a block still
  has the torches of the scenario before it; that is part of the world the scenario
  measures in, as for every scenario.
- **`getState().bench.figures`** (most figures drawn at once during the run) was added for
  AC15.2: the quick window of `players` lasts about a second, too short to catch reliably
  by polling.
- **The sample result** (`bench=sample`) gained two `players` rows, so the result screen
  shows the new scenario; the `bench-result` reference was regenerated (9.5 % of pixels
  changed: the new row, and the rows below it moved down). `bench-start` did not change.

- **CI's time limit is 110 minutes** (was 80). The first CI run of this pull request was
  cut off at 80 minutes during the multiplayer tests: Parts D and E added about 15
  minutes of them. In that run the soak (AC14.3) had failed on the slower runner; it now
  waits until the host knows every player's pose after the long jump to the columns,
  instead of a fixed 300 ms, since the host checks reach against the last pose it got.

- **Part D's timing test AC11.6 moved into a solo file**
  (`src/player/figureMotionSpeed.solo.test.ts`). The second CI run of this pull request
  measured 20.98 ms against its limit of 20 ms in the pass where 70 files run side by
  side; `CLAUDE.md` puts tight wall-clock limits into solo files, which run alone. The
  test itself is unchanged.

## Known issues

- Software WebGL in the container and CI: the timings of the browser tests (joins, the
  soak) say nothing about real devices. The scenario's numbers on real devices come with
  PERF-8 / NET-18.
- The overlay's "Link" stays "–" for the first 2 s of a room (the first statistics).
- A guest's round trip on the host is its last report: it lags its ping by one second.
- `mpMenus.spec.ts` "Phase 6 AC7.10" fails in this container on `main` as well (see
  "Full browser run") but passes in CI: a limit of this container, not touched here.
- The Part C report's suggestion to show the time between `startBreak` and `break` in the
  overlay was not built: it is not part of AC14.1, and NET-13 showed no failing breaks.

## Measured numbers

- **AC14.5** (container, Node): **11.4 µs** per action of the host (limit 200 µs);
  **20.6 µs** per relay of four moving players to three guests (limit 1 ms).
- **AC14.6**: with four moving players and three guests editing twice a second the host
  sends **12.9 kB/s** in about 85 messages per second (before compact poses: 25.5 kB/s).
- **AC14.3** (browser, software WebGL): the host's heap **6.1 MB → 6.6 MB** after 200
  actions of four players, a leave and a rejoin.
- **AC14.4**: a guest joined a host with 50 000 edits and had its world hash in
  **11.9 s** (limit 20 s) in the container.
- **Entry chunk** (`dist/assets/index-*.js`, minified): Part D 798.03 kB; this part
  **803.96 kB** (+5.9 kB: the overlay rows, `debugInfo`, the guest script, the runner's
  hooks). Lazy chunks: `HostSession` 11.6 → 11.8 kB, `ClientSession` 7.5 → 7.6 kB,
  `protocol` 4.9 → 5.5 kB, new `traffic` 1.8 kB and `simGuests` 5.0 kB.
- **Coverage** (`npm run test:coverage`, 669 unit tests): all files 98.8 % of lines
  (statements 98.1 %, branches 95.7 %, functions 98.0 %); statements of `src/net/`
  95.6 %, of `src/bench/` 98.2 %.

## Full browser run

`MC_CONTAINER_GPU_STALL=1 npx playwright test`, both projects, on the commit before this
report: **286 passed, 2 failed** (54 minutes), no console errors or warnings in the
passing tests.

- `mpRooms.spec.ts` "Phase 6 AC5.5" (the time of day follows the host within 2 s) failed
  once under the load of the full run and passed when run again alone: a timing window
  of the browser tests under software WebGL, not a change of this part.
- `mpMenus.spec.ts` "Phase 6 AC7.10" (a fifth player joining from the menu sees "Room is
  full") fails in this container also when run alone, and fails the same way on `main`
  (checked in a worktree of main 14954ce): the menu's second join of the same page stays
  at "Connecting…". It is not caused by this part; CI decides whether it is the
  container. Listed under "Known issues".

All tests of this part passed: `mpHarden.spec.ts` (AC14.1–AC14.4) and `bench.spec.ts`
(13 tests, AC15.2, AC15.3). References looked at:

| Reference      | Changed | Judgement                                                                  |
| -------------- | ------- | -------------------------------------------------------------------------- |
| `bench-result` | 9.5 %   | The sample's two new `players` rows; the rows below moved down, as planned |

No other reference changed. Screenshots of a quick run during `players` were looked at
by eye: the three figures with their name tags walk on the slope in front of the player;
the first version, looking north, showed only leaves (see "Decisions and deviations").

## For the Pi side

1. **Nothing new to configure**: the same build variables (`BUILD_COMMIT`,
   `VITE_SIGNAL_URL`, `VITE_STUN_URLS`), no new npm packages, no new peer ids or requests
   on the signaling server.
2. **The protocol changed** (`ping.rtt`, compact relayed poses): devices must run the same
   build, which the build id already ensures.
3. **New lazy chunks** to be served with the rest: `simGuests-*.js` (the performance
   test's simulated guests) and `traffic-*.js` (part of the session code); the build
   check that greps the served JS for the commit and the addresses stays as it is.
4. **Then the owner runs NET-17 to NET-19 and PERF-8** (`docs/device-tests.md`) on the PR
   preview (NET-17, NET-19) and after the merge (PERF-8 on the main build, as the earlier
   PERF runs).

## Hard rule 1

Checked for every text of this part: the overlay rows (Room, Round trip, Link, Signaling,
Traffic), the scenario label "four players", the guests' names "Guest 1" to "Guest 3",
the README and the device tests. Plain English; no names, art or texts of another game.
The figures are Part D's (checked there); no new textures or images except the
regenerated test reference `bench-result`.

## Tests on real devices

Added to `docs/device-tests.md`: **NET-17, NET-18, NET-19** (6E, section 10) and
**PERF-8** (6E, section 1). NET-5 to NET-25 were ticked as passed (owner, 2026-11-21). No
test became obsolete.

## Suggestions for the next phase

- Phase 7 (personalization) can extend `profile` for a character editor; the relayed
  poses are now compact, so a larger profile message (sent rarely) costs little.
- If PERF-8 shows `players` red on the phone while `stand` is green, the figures' cost
  is the reason: the risk table's fallback (no motion step beyond 32 blocks) does not help
  there (the guests are within 10 blocks); measure the figure's shader first.
- A dedicated host on the Pi (plan section 10) can reuse `SimRoom`'s pattern: a
  `HostSession` with a `MemoryNetwork` clock is all the scenario needed, so a Node host
  needs only a real `Connection` in its place.
