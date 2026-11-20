# Phase 6 part B report – together in Creative

Plan: `docs/phase-6-plan.md`, steps 3–7. This part makes the game playable by up to four
people in one Creative world on the home network: a host opens the world it plays from
its pause menu, the others join from the world menu (a list of open worlds at home, a
room code or a join link), the host validates and applies every action, and every player
sees the others as a figure with a name tag.

**Precondition.** The owner's NET-1 to NET-4 in `docs/device-tests.md` passed on build
a7b0df5: PC, phone and tablet connect host to host over IPv6 with and without STUN, and
discovery lists all three devices. STUN stays configured as a safety net.
`sync/status.md` in the owner's `pi-infra` repository was reachable and read (read only):
it confirms the Pi side of Part A (build variables, signaling with discovery and CORS,
STUN) and that Part B may start. Nothing was copied from it.

## What was built

- **Pure core (`src/net/`, Node-tested, in the coverage scope and the ESLint boundary)**
  - `protocol.ts`: every message of plan 5.5 as a type, `encodeMessage`, and one
    validating decoder per direction (`decodeGuestMessage`, `decodeHostMessage`) that never
    throws: types, finite numbers, integer ranges, string lengths, the total length
    (`MAX_MESSAGE_BYTES`), actions through `decodeAction`, records through the save
    format's `decodePlayer` (now exported, with `encodePlayer`). `validPose` holds the
    host's bounds for poses.
  - `roomCode.ts`: room codes, `normalizeRoomCode`, room, guest and network-test peer ids
    (`peerPrefix` and `codeFromBytes` moved here from `netTest.ts`, which re-exports them),
    `roomOfAnyBuild` (the version message), player names (`normalizePlayerName`,
    `uniqueName`), player keys.
  - `snapshot.ts`: `splitEdits` (no part longer than `SNAPSHOT_PART_BYTES` as a message; a
    chunk with many edits is spread over parts), `joinParts`, `worldHash` (order
    independent).
  - `HostSession.ts`: the room. One member per player (the host is member 1 without a
    connection), with its record, last pose and an outgoing queue that watches
    `bufferedAmount`. `accept(connection)`, `update(now)` (relay, queues, heartbeat,
    strangers), `local` (the host's own `Session`), `timeOfDay`/`setTime`,
    `broadcastBlocks`, `close`. Admission: `info`, `reject` (`full`, `build`, `duplicate`,
    `closed`), `welcome` + snapshot parts + `ready` queued in one go, `joined` to the others.
    Every action goes through `applyAction` with the actor's record and pose, the poses of
    all players and the `FarReader`. Records of guests who left are kept while the room is
    open (`departed`), so a reconnect gets its items back.
  - `ClientSession.ts`: join (signaling, connect, `hello`, terrain checksum, snapshot,
    `ready`), the `Session` (sequence numbers, `result`, `record`, `blocks`), poses at
    most 20 per second and only when changed, pings every second, the heartbeat, the time
    of day between pongs, reconnecting every 2 s for 10 s, `leave`, `dropConnection`.
  - `interpolation.ts`: `PoseBuffer` (100 ms in the past, linear, yaw the short way round,
    snaps beyond 8 blocks or on the teleport flag, holds when starved) and `RemoteRoster`.
  - `authority.ts`: `FarReader`, the first version of plan 5.6: a loaded chunk, or the chunk
    generated on the side with the world's edits, in a cache of 32 chunks (least recently
    used), updated together with every edit the host applies.
- **Shell**
  - `src/game/multiplayer.ts`: `Multiplayer` opens a room (up to five codes if one is
    taken), joins one (texts of every failure), leaves or closes it, drives the session
    from frames and a 250 ms timer, keeps the notices, the screen wake lock and the room
    list (one registration per world menu visit, `info` per room with a 3 s timeout).
    `HostSession`, `ClientSession` and `protocol.ts` are loaded with a dynamic import.
  - `src/game/playerIdentity.ts`: player key and name in `markuscraft.player.v1`.
  - `Game`: the session swap (`useSession`), the guest's world (`openGuestWorld`, never
    saved), the world going on behind the pause menu while networked, the room's time,
    `leaveGuestWorld`, `joinFromMenu`, `openRoomFromMenu`, `copyJoinLink`, the room list
    timer, the HUD notices, the test API of plan 5.13.
  - `src/render/RemotePlayers.ts`: the figure (body 0.6 × 1.3 × 0.4 and head 0.5 boxes,
    1.8 tall), lit by the terrain's rule from the light at its eyes, the daylight and the
    Brightness floor, fogged with the chunk fog; the head's front is darker and tilts with
    pitch; the name tag is a sprite with a canvas texture, hidden by terrain. Three draw
    calls per figure.
  - `src/ui/JoinSection.ts` ("Join a world": name, "Open worlds at home", code, status
    line, "Join world CODE"), `src/ui/RoomPanel.ts` ("Playing together": "Open to others",
    room code, player list, "Copy join link", "Close to others", the phone hint),
    `PauseScreen` ("Leave world" for a guest), `WorldMenu.addSection`, `Hud.setNetNotices`.
  - URL parameters `join=` and `name=`.
- **Tests**: `protocol.test.ts`, `roomCode.test.ts`, `snapshot.test.ts`,
  `sessions.test.ts` (host and guests over the memory transport, `src/testing/netRig.ts`),
  `interpolation.test.ts`; browser tests `e2e/mpRooms.spec.ts` (step 5),
  `e2e/mpPlayers.spec.ts` (step 6), `e2e/mpMenus.spec.ts` (step 7).

## Acceptance criteria

| AC           | Where / how                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC3.1        | `src/net/protocol.test.ts` "every guest/host message survives encode → decode"                                                                      |
| AC3.2        | `src/net/protocol.test.ts` "protocol decoder (Phase 6 AC3.2)" (types, NaN, infinities, fractions, lengths, actions, records, 10 000 random strings) |
| AC3.3        | `src/net/roomCode.test.ts` "room codes"                                                                                                             |
| AC3.4        | `src/net/roomCode.test.ts` "names and player keys"                                                                                                  |
| AC3.5        | `src/net/snapshot.test.ts`                                                                                                                          |
| AC4.1        | `src/net/sessions.test.ts` "joining"                                                                                                                |
| AC4.2–4.4    | `sessions.test.ts` "actions"                                                                                                                        |
| AC4.5        | `sessions.test.ts` "admission" (also the version message, the terrain check, an unreachable server)                                                 |
| AC4.6        | `sessions.test.ts` "poses"                                                                                                                          |
| AC4.7        | `sessions.test.ts` "time" (60 s without host frames)                                                                                                |
| AC4.8, AC4.9 | `sessions.test.ts` "convergence" (2 000 seeded actions, a guest joining midway; edits during a snapshot)                                            |
| AC4.10       | `sessions.test.ts` "protocol errors"                                                                                                                |
| AC4.11       | `sessions.test.ts` "the guest state machine"                                                                                                        |
| AC4.12       | `src/net/interpolation.test.ts`                                                                                                                     |
| AC4.13       | `sessions.test.ts` "far chunks"                                                                                                                     |
| AC4.14       | Line coverage of `src/net/` 97 % (`npm run test:coverage`, see "Measured numbers")                                                                  |
| AC5.1–5.12   | `e2e/mpRooms.spec.ts`, one test each ("Phase 6 AC5.x")                                                                                              |
| AC6.1–6.7    | `e2e/mpPlayers.spec.ts`; AC6.8 in `sessions.test.ts` "an unchanged pose is not sent again …"                                                        |
| AC6.9        | References `remote-player` and `remote-player-night`, looked at (below)                                                                             |
| AC7.1–7.13   | `e2e/mpMenus.spec.ts`, one test per criterion (AC7.4 and AC7.6 share one)                                                                           |
| AC7.14       | References `join-section`, `room-panel`; changed references regenerated (below)                                                                     |
| AC7.15       | `README.md` "Playing together", `CLAUDE.md`, `docs/device-tests.md` (NET-5 to NET-12), this report, the pull request                                |

No criterion was cut: AC7.12 (the controller), the version message of AC7.2 and "Copy
join link" are all built and tested.

## Decisions and deviations

- **Tests with several game pages run in a Playwright project of their own with one
  worker** (`multiplayer`, files `e2e/mp*.spec.ts`), next to the `game` project. With
  three workers each running two or more software-rendered pages, the container's four
  cores starve WebRTC: measured in this session, opening a data channel took 1.5 s with
  one test at a time and more than 15 s (the join timeout) with three, so joins failed at
  random. One test at a time is reliable. The plan's risk table foresaw serial tests for
  three and four players; this applies it to all of them.
- **No `src/game/wakeLock.ts`.** The wake lock is a few lines in `Multiplayer`
  (`requestWake`, asked again when the page becomes visible, released when the room ends,
  every failure ignored).
- **The room list keeps one signaling registration** (`mc-<build>-l-<hex>`) while the world
  menu is shown and asks every listed room for `info` on each refresh. Neither the host
  nor the asker closes an `info` connection at once: the asker closes it when the answer
  is there (closing at once could drop the answer in the data channel), and the host
  closes connections that never said `hello` after `JOIN_TIMEOUT_MS`. The same holds for
  `reject`: the guest closes.
- **A reconnect is quicker than the heartbeat.** A guest that reconnects says `hello` with
  the same player key while the host may still hold its old, silent connection. The host
  refuses a second connection of a key only if the first was heard within
  `DUPLICATE_STALE_MS` (2.5 s); otherwise it drops the old one as lost and admits the new
  one. A guest that gets `duplicate` while reconnecting simply tries again.
- **Poses outside the world** (beyond the bounds of plan 5.6) are dropped by the host
  without counting as a protocol error: a player flying very high is no attacker. The
  decoder itself only requires finite numbers.
- **The host relays poses from every incoming message**, not only from incoming poses
  (still at most every 50 ms): a guest that stopped moving has its last pose relayed by
  its next ping at the latest, also when the host gets no frames.
- **The host's own player** is member 1 with no connection; its pose is read through a
  callback whenever it matters (actions, relay, start poses), and `Game.setPlayer` marks a
  teleport.
- **The guest's world** is a `WorldMeta` with id `guest`, the host's world name, seed,
  mode and generator version, and the welcome's record and start pose. After a reconnect
  the world is loaded again from the fresh snapshot, but the player keeps its own pose and
  movement mode.
- **Leaving in test mode** (no menus) loads a fresh test world, as at the start.
- **Gathering worlds** cannot be opened in Part B: the button is disabled with the
  reason, and `net.host()` refuses with the same text.
- **Names**: a suffix (" (2)") may make a name longer than 16 characters; the decoder
  allows 24. The host's default name, like a guest's, takes its four digits from the
  player key.
- **The player key is stored only once it is needed** (a room opened or joined, a name
  typed). The first full browser run showed that storing it on page load broke the
  performance test's rule that a run leaves nothing but its result in local storage.
- **Joining errors** have two texts the plan does not name: "You are already in this world
  in another tab." (`duplicate`) and "The host did not answer." (`timeout`).
- **`getState().net`** has three members the plan does not list: `lastResult` (the host's
  last answer, also to raw messages: AC5.7), `figures` (figures drawn: AC7.6) and the
  `status` of the host (always `online`).
- **Join link**: "Copy join link" keeps the page's `signal` and `stun` parameters next to
  `join`, so a link from a page that names its servers in the URL works the same. Pi
  builds have no such parameters.
- **Entry chunk.** The protocol and the sessions are a chunk of their own; the menus,
  `Multiplayer`, the figures and the wiring stay in the entry chunk (+35 kB, see below).
  The plan has no size limit for Part B.
- **The name tag** is drawn readable at night too (it is a label, not part of the
  world); the figure itself is lit like the terrain.

## Reference screenshots

- `remote-player` (new): the guest's view of the host "Ada" four blocks away on a stone
  platform in front of a stone wall, noon. Looked at: the red figure stands upright on the
  platform, body and head with the darker face side towards the viewer, the name tag
  "Ada" readable above the head, the crosshair on the head.
- `remote-player-night` (new): the same at midnight. Looked at: the figure is dark like the
  wall and the floor, it does not glow; the name tag stays readable.
- `join-section` (new): the join section with two listed rooms ("Castle" by Ada,
  "Harbour" by Bo, both "Creative · 1/4" with "Join"), the name field and the code field.
  Looked at: nothing cut off, the rows aligned.
- `room-panel` (new): "Playing together" while hosting room HAPPY2 with Ada (host, you)
  and Bo, "Copy join link" and "Close to others". Looked at: code in large type, colour
  swatches red and blue, buttons in one row.
- Changed references (old and new side by side with `scripts/compareShots.mjs`, each
  looked at; no other reference changed, every other one 0.0 %):
  - `world-menu` (39.6 % of pixels): the panel grew by the section "Join a world" (name
    field, "Open worlds at home", code field with "Join"); this test page has no
    signaling server, so the list says "Multiplayer is not available in this build." The
    list of worlds and the buttons above are unchanged.
  - `pause-screen` (26.7 %): "Playing together" with a disabled "Open to others" and its
    reason, as the last section of the right column; everything else unchanged.
  - `pad-pause` (27.8 %): the same section; at 960 × 540 the controller's hint bar now
    covers the last line of the panel (the reason text), which scrolls up from under it.
    Nothing a controller can focus is hidden.

## Known issues

- Software WebGL in the container and CI: frame rates and connection times of the
  browser tests say nothing about real devices.
- A room list refresh connects to every listed room every 3 s while the world menu is
  shown. With few rooms at home this is cheap; Part D's measurements can show whether the
  interval should grow.
- The host keeps the records of guests who left only in memory (Part C saves them).

## Measured numbers

- **Entry chunk** (`dist/assets/index-*.js`, minified): Part A **742.06 kB**; this part
  **777.02 kB** (+34.96 kB). New lazy chunks: `HostSession` 8.7 kB, `ClientSession` 6.8 kB,
  `protocol` 4.6 kB, `interpolation` 1.3 kB (loaded when a room is opened, joined or
  listed); `peerTransport` 91.0 kB and `NetTestScreen` 15.3 kB as in Part A.
- **Line coverage** of `src/net/`: 97.0 % (statements 94.7 %, branches 90.6 %).
- **Connection times in this container** (two software-rendered pages, one test at a time):
  signaling 0.1–0.4 s, data channel 1.1–2.3 s, a whole join with a world of a few edits
  about 2.5 s. With three such tests in parallel the data channel took over 15 s (see
  "Decisions and deviations").
- Real-device numbers come with NET-5 to NET-12.

## Full browser run

The full run (`MC_CONTAINER_GPU_STALL=1 npx playwright test`, 263 tests, both projects
side by side) found eleven failures, all fixed and re-run:

- the player key stored on page load (performance test's storage rule): fixed in the code;
- the room list's request to the unreachable test port 9 (AC2.2, AC5.6): Chromium logs
  `ERR_UNSAFE_PORT` itself; both tests allow exactly that message;
- Phase 6 AC1.7 (see below), Phase 5 AC3.1, AC3.3, AC3.4 (controller paths through the
  world menu, which the join section makes longer: the tests now walk to the button with
  `focusOn`, by position), Phase 2 AC3.1 and Phase 3 AC4.9 (layouts at 640 × 360, see
  below), and the three references above.

The run hit the session's 30-minute limit for background commands after 259 of 263 tests;
the four left (`mpRooms.spec.ts` AC5.9–AC5.12) passed in the runs of their own file.
Afterwards every changed file was run again in full (`gamepadMenus`, `netTest`,
`touchLayout`, `ui`, `worldMenu`, `mpRooms`, `mpMenus`, `mpPlayers`): all passed.

- **Phase 6 AC1.7 is narrowed.** Plan 5.11 lists the open worlds on the world menu every
  3 s, which needs `peerjs` and the discovery list; plan 5.2 already says `peerjs` loads
  when "the room list is used". So a build with a signaling server now fetches both on the
  world menu. The test checks what still holds: a build without a server (GitHub Pages)
  requests nothing outside its origin and never loads `peerjs`, the network test or the
  sessions; and in a build with a server, playing a world alone requests nothing outside
  the origin (the room list stops when the menu is left).
- **Layouts at 640 × 360.** Phase 2 AC3.1 and Phase 3 AC4.9 required the whole pause menu
  and world menu to fit a phone without scrolling. With "Join a world" and "Playing
  together" they do not; the plan's AC7.13 asks for exactly that: reachable by scrolling.
  Both new sections are placed last, so everything that was on screen stays where it was;
  the old tests check everything but the new sections, AC7.13 checks those.

## CI

The first CI run of the pull request (run 44824343396) was cancelled by the job's
45-minute limit while every test so far had passed: the multiplayer project, one test at a
time, started late and needs about 20 minutes.

The second run (44831792708) passed 260 of 263 tests in 50 minutes. Three failed, all
fixed:

- `pad-world-menu` was not regenerated with the other menu references: in the container it
  stayed under its 5 % tolerance, with CI's font it is 6 %. Regenerated and looked at
  (the join section below the world list, the focus frame on "Press A to play").
- `join-section`: CI's font draws the section 6 px shorter, and an element screenshot of
  another size always fails. `join-section` and `room-panel` are now regions of a fixed
  size (472 × 270 and 340 × 140) from the section's top left corner, with 8 % tolerance
  as the `net-test` reference of Part A.
- AC6.3 waited for the received yaw of the host, but the figure is drawn at the
  interpolated pose 100 ms behind; on CI the picture was taken before it turned.
  `getState().net.players` has `renderYaw` now, and the test waits for it.

The third run (44839265136) stopped in the unit tests: Phase 4 AC1.7 ("lighting a terrain
chunk takes at most 40 % of meshing it") measured 2.16 ms against a limit of 1.88 ms. The
code it measures is not touched by this part; the cause is where the test lived: a
comparison of two times with a tight ratio inside `lightChunk.slow.test.ts`, whose files
run side by side with the four heavy light soak tests. `CLAUDE.md` puts such comparisons
into `*.solo.test.ts`. Both timing tests of AC1.7 moved to
`src/world/light/lightSpeed.solo.test.ts` (both sides warmed up, the best of 12 and 16
rounds, the sides in turn); the slow file keeps the check of the cave chunk against the
reference. `.github/workflows/ci.yml` now allows 80
minutes.

## For the Pi side

What the Pi must do or verify for the preview of this pull request (no addresses here):

1. **Nothing new to configure.** The build uses the same variables as Part A
   (`BUILD_COMMIT`, `VITE_SIGNAL_URL`, `VITE_STUN_URLS`) and no new npm packages; `npm ci`
   installs what it did for Part A.
2. **New peer ids on the signaling server**: rooms `mc-<build>-r-<6 characters>`, guests
   `mc-<build>-g-<16 hex>`, the room list `mc-<build>-l-<12 hex>`, besides the network
   test's `mc-<build>-t-…`. Up to four players and one room list per device; each world
   menu fetches the discovery list (`/peerjs/peers`) every 3 s as the network test does.
   The server must keep `allow_discovery` on and CORS for the PR preview's origin.
3. **Worlds are per site.** The PR preview starts with an empty world list; the owner makes
   a Creative world there to test. Nothing a guest plays is stored on the guest.
4. **Check of the build**: as in Part A, the served JS contains the 7-character commit and
   the signaling and STUN addresses from the build variables. The new lazy chunks
   (`HostSession-*.js`, `ClientSession-*.js`, `protocol-*.js`, `interpolation-*.js`) must be
   served next to the entry chunk; the atomic publish of A10 already covers that.
5. **Then the owner runs NET-5 to NET-12** (`docs/device-tests.md`, section 10) on the PR
   preview before merging.

## Hard rule 1

Checked: the figure is two boxes in four colours chosen here, the name tag a dark plate
with the system font, all texts are new; no third-party assets, names or looks.

## Tests on real devices

Added to `docs/device-tests.md`, section 10 "Multiplayer (Phase 6)": **NET-5, NET-6,
NET-7, NET-8, NET-9, NET-10, NET-11, NET-12** (6B). No test became obsolete.

## Suggestions for the next part

- Part C can build on `HostSession.departed`: saving it with the world (save format 2)
  is mostly encoding. `FarReader` already serves every guest action; Part C adds the
  stations' tests and the bound of the cache in the Gathering rules.
- The host's action clock is `performance.now()` already while a room is open
  (`HostSession` takes `clock`); Part C's break timing can use it as it is, and
  `ClientSession` needs the local start time translation of plan 5.7.
- The room list's `info` round per room is the most frequent traffic on the signaling
  server; if Part D measures it as a cost, cache the details of a room for a few refreshes.
