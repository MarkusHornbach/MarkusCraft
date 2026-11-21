# Phase 6 plan – Multiplayer

Read `CLAUDE.md` first, then the "Decisions and deviations" of `docs/phase-3a-report.md`
(action layer, saving, world menu), `docs/phase-3c-report.md` (recipes, stations),
`docs/phase-4b-report.md` (torch, support rule) and `docs/phase-5a-report.md` (focus
system, back guard). `docs/phase-2-plan.md`, Part B, is the earlier multiplayer design;
this plan replaces it and takes over what still fits. Do not implement Part B of the
Phase 2 plan.

Phase 6 has five parts with separate sessions, branches, reports and pull requests:

| Part | Content              | Steps | Report                    | Starts when                                                    |
| ---- | -------------------- | ----- | ------------------------- | -------------------------------------------------------------- |
| A    | Connection test      | 1–2   | `docs/phase-6a-report.md` | Now, from `main`                                               |
| B    | Together in Creative | 3–7   | `docs/phase-6b-report.md` | After A is merged **and** the owner's NET tests of A succeeded |
| C    | Gathering together   | 8–10  | `docs/phase-6c-report.md` | After B is merged                                              |
| D    | Player figure        | 11–13 | `docs/phase-6d-report.md` | After C is merged                                              |
| E    | Measure and harden   | 14–16 | `docs/phase-6e-report.md` | After D is merged                                              |

Part D was inserted after Part C had been merged (change 14 in section 3). Until then the
part "Measure and harden" was Part D with steps 11–13 and criteria AC11.1–AC13.2; it is now
Part E with steps 14–16 and criteria AC14.1–AC16.2, unchanged in content. Reports of
Parts B and C that name "Part D" or "AC11.x" mean Part E and AC14.x.

Each part is implemented autonomously in one cloud session: do not ask the owner
questions. Where this plan leaves a detail open, choose the simplest option and note it in
the part's report, section "Decisions and deviations". The owner tests every part from the
Pi's preview build of its pull request on real devices before merging it.

Tests name their acceptance criterion in the title as "Phase 6 AC1.1".

**Never commit the owner's home domain or any address of the Pi** (code, tests, docs,
commit messages, pull requests). The repository is public. The addresses reach the game
only through build variables and URL parameters (5.2). Docs say "the Pi's signaling
host".

## 1. Goal

Up to four people play together in one world on the home network. A player opens the
world they are playing to others. The others pick it from a list of open worlds at home,
or join with a room code or a join link. The host's browser tab decides about every change
to the world and to every player's items, and it owns the time of day. Each player's own
device moves that player. Game data goes directly between the browsers over WebRTC data
channels. Connections are set up through the owner's own PeerJS server on the Raspberry
Pi, with a STUN server on the Pi for local addresses. No public service is used and the
internet is not needed.

The world belongs to the host: it is saved on the host's device with every guest's items
and position, and a guest who comes back finds them again. Creative and Gathering worlds
can both be shared. The world's game mode applies to everyone.

Single-player works exactly as before, without any network access. Builds that do not
know a signaling server (GitHub Pages, CI) show multiplayer as unavailable.

The protocol and the host's logic are pure code, independent of the browser, so a
dedicated host in Node on the Pi could be added in a later phase without a rewrite. It is
not built now.

## 2. Decisions made with the owner

| Topic               | Decision                                                                                                                                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where it is played  | From the Pi-served builds (the main build and the PR previews), which are secure contexts. **The Pi's main build becomes the home of shared worlds.** Worlds live per site (origin): GitHub Pages stays a single-player site, every PR preview starts with an empty world list. Moving worlds between sites is not part of this phase             |
| Players             | Up to 4 including the host, on the home network                                                                                                                                                                                                                                                                                                   |
| Topology            | Star over WebRTC data channels: every guest connects only to the host; the host relays                                                                                                                                                                                                                                                            |
| Signaling           | The `peerjs` client against the owner's own PeerJS server on the Pi (`wss`, behind the existing wildcard certificate). Its address comes from the build variable `VITE_SIGNAL_URL`, overridable by the URL parameter `signal`. No address in the repository                                                                                       |
| ICE servers         | A STUN server on the Pi (`VITE_STUN_URLS`, URL parameter `stun`), so the devices learn their real LAN addresses even where `.local` names (mDNS) cannot be resolved. No TURN, no public STUN                                                                                                                                                      |
| Finding a room      | A list "Open worlds at home" on the world menu, from the PeerJS server's discovery list (`allow_discovery`). Only rooms of the same build are listed. The room code and the join link `?join=CODE` remain as a fallback                                                                                                                           |
| Handshake           | Joining needs the same build id (the commit, `__BUILD_COMMIT__`) and the same terrain checksum, computed at runtime on both devices                                                                                                                                                                                                               |
| Authority           | The host validates and applies every action through `applyAction`, for each player against that player's own `PlayerRecord`, and owns the time of day. Each device owns its player's position and look; the host only sanity-checks poses                                                                                                         |
| Far chunks          | The host reads blocks it has not loaded "on the side": terrain generated into a small cache plus the recorded edits, with no light and no meshes (5.6)                                                                                                                                                                                            |
| Smelting            | The two seconds of the furnace stay a progress bar in the client, as today. The host does not enforce them                                                                                                                                                                                                                                        |
| Identity            | Each device keeps a random player key and a name in local storage. The host keys its guest records by the player key; names may change and collide                                                                                                                                                                                                |
| When the host goes  | Guests keep nothing. They see why and return to the world list. A lost connection is retried for 10 s first. Items and positions stay in the host's save                                                                                                                                                                                          |
| Menus               | Hosting: "Open to others" in the pause menu of an open world. Joining: a section "Join a world" on the world menu (room list, code field, name field). Joining never replaces an open world. While a room is open or joined, the pause menu does not pause the world                                                                              |
| Where a guest shows | A new guest appears next to the host; a returning guest (Part C) where they left                                                                                                                                                                                                                                                                  |
| Other players       | Part B: a placeholder figure (body and head box) in one of four colours with a name tag. Part D: a blocky figure (head, body, two arms, two legs) with code-generated textures, one of eight looks chosen by the player, animated from the received movement, the slot colour as an accent. No held item, no cracks of others' breaking (Phase 7) |
| Phones as host      | Allowed. While a room is open or joined the page holds a screen wake lock. In touch mode the host sees a hint that the world closes for everyone if the screen locks or the app changes                                                                                                                                                           |
| Performance test    | A new scenario `players`: the page is the host of three simulated guests that run inside it over an in-memory connection, walk and edit around the player (Part E)                                                                                                                                                                                |
| Parts               | Five parts: **A** connection test, **B** together in Creative, **C** Gathering together, **D** player figure, **E** measure and harden                                                                                                                                                                                                            |

## 3. Changes to the original scope

The owner's starting scope was challenged during planning. Agreed changes:

| #   | Change                                                                                                                                                                                                                                                                                                                          | Reason                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A STUN server on the Pi is added (a pi-infra task); the game takes a configurable list of ICE servers. Still no TURN and no internet                                                                                                                                                                                            | Without STUN, Chrome offers only host candidates hidden behind random `.local` names. Some Android versions, mesh Wi-Fi systems and routers that filter multicast cannot resolve them, and the connection fails silently. A STUN server inside the LAN reports each device's real LAN address |
| 2   | Part A is a small connection test that the owner runs on phone, tablet and computer before the game is built on top of it                                                                                                                                                                                                       | The network at home (Wi-Fi, Pi, mDNS, certificates, discovery) is the largest unknown and cannot be tested in a cloud session. Finding a problem after a large part would waste it                                                                                                            |
| 3   | The signaling and STUN addresses come from build variables (`VITE_SIGNAL_URL`, `VITE_STUN_URLS`), not from `config.ts`. Builds without them show multiplayer as unavailable                                                                                                                                                     | The repository is public; an address in `config.ts` would publish the owner's private home domain in the code and in every GitHub Pages build                                                                                                                                                 |
| 4   | Added: a list of open worlds at home from the PeerJS server's discovery list; room codes and `?join=CODE` stay as a fallback                                                                                                                                                                                                    | Room codes are awkward on a phone keyboard and cannot be typed with a controller (Phase 5 notes). The server is the owner's own, so discovery can be switched on                                                                                                                              |
| 5   | Answer to an open question: guests keep no copy when the host goes; they return to the world list. The host saves each guest's items and position, keyed by a random player key per device                                                                                                                                      | Worlds are saved since Phase 3; a copy would fork the world into two diverging versions. With the guest's records in the host's save nothing is lost, and a returning guest gets their items back. A name alone can collide or change                                                         |
| 6   | The handshake compares the build id and a runtime terrain checksum instead of protocol, generator, recipe and light versions                                                                                                                                                                                                    | A build id is stricter and simpler: it also catches a changed block or item table, PR previews of different branches and stale tabs. The runtime terrain checksum catches what a build id cannot: a browser engine that computes the terrain differently                                      |
| 7   | Hosting from the pause menu of an open world, joining from the world menu only. A new guest appears next to the host                                                                                                                                                                                                            | Joining from the world menu never discards or replaces an open world, and it needs no "discard my world" confirmation. Starting next to the host is what players at home want                                                                                                                 |
| 8   | Answer to an open question: the smelting time stays client-side                                                                                                                                                                                                                                                                 | Every player runs the same code, so everyone waits. Smelting changes only the smelter's own items, never the shared world; protection against modified clients is not a goal at home                                                                                                          |
| 9   | Answer to an open question: the host reads chunks it has not loaded on the side (generated terrain plus edits in a small cache)                                                                                                                                                                                                 | Guests may explore apart. Loading and lighting the areas of all guests would cost up to four times the host's chunk work, too much for a phone host. The read on the side needs no light and no meshes and also suits a later Node host                                                       |
| 10  | Answer to an open question: phones and tablets may host, with a wake lock and a hint                                                                                                                                                                                                                                            | Two tablets should be able to play without a computer. Android freezes a page when the screen locks or another app comes to the front; the wake lock prevents auto-locking, and the hint explains the rest                                                                                    |
| 11  | The other players are shown as the figure alone: no held item, no cracks of their breaking                                                                                                                                                                                                                                      | Keeps the phase smaller; both fit better with real characters in Phase 7                                                                                                                                                                                                                      |
| 12  | The multiplayer scenario of the performance test plays three simulated guests inside the page over an in-memory connection                                                                                                                                                                                                      | The test must run on one device without a second person or the network, and give comparable numbers on every device                                                                                                                                                                           |
| 13  | Four parts: A connection test, B together in Creative, C Gathering together, D measure and harden (five since change 14)                                                                                                                                                                                                        | Each part can be tried on real devices from its PR preview. Gathering needs the most host-side rules (break timing over the network, far chunks, saved guest records), so it gets its own part; Creative play together is useful before that                                                  |
| 14  | **Renumbering (owner, 2026-11-21).** A new Part D "Player figure" (steps 11–13) is inserted. The former Part D "Measure and harden" becomes Part E (steps 14–16, criteria AC14.1–AC16.2), unchanged in content; its device tests NET-17 to NET-19 keep their ids. The real figure, listed as Phase 7 before, moves into Phase 6 | The figure is what players see of each other in multiplayer, and Part E's scenario `players` should measure the real figure, not the placeholder                                                                                                                                              |
| 15  | The slot colour stays on the figure as an accent (the belt) and on the name tag plate (a stripe); the room panel keeps its swatch. Two players may choose the same look                                                                                                                                                         | With free looks two players can look the same; the accent tells them apart without taking a look away from anyone                                                                                                                                                                             |
| 16  | A player who never chose a look gets one derived from the player key ("Automatic"): the same device always looks the same, different devices usually differ. Old stored identities load as "Automatic"                                                                                                                          | One fixed default would make every player who never opens the picker look alike                                                                                                                                                                                                               |
| 17  | The picker is a section "Your player" on the settings page with the name field and the look; the name field of "Join a world" stays and shows the same name. Both are stored in `markuscraft.player.v1`, only once chosen                                                                                                       | Name and look belong together; the settings page is reachable from the world menu and from the pause menu of a world, so a host can change them without leaving                                                                                                                               |
| 18  | Name and look can be changed during a room: a new message `profile` updates every device within a second; the host applies the name suffix again                                                                                                                                                                                | The settings page is reachable while a room is open; a change that shows only after rejoining would look broken                                                                                                                                                                               |
| 19  | The pose carries a flag `busy` (the player holds break on a block); the relayed poses carry `busy` and `fly`. The arm swings while `busy`, and once per block change the player caused                                                                                                                                          | In Gathering a break takes seconds and the others learn of it only when the block changes; without the flag the arm would swing only at the end. `fly` keeps the legs still in flight                                                                                                         |
| 20  | The head takes the received yaw and pitch; the body turns towards the walking direction and otherwise follows the head once it is more than 45° off                                                                                                                                                                             | Turning the whole body with every look around looks mechanical; the rule is small and pure                                                                                                                                                                                                    |
| 21  | Eight looks with short names (Fern, Ember, Pebble, River, Moss, Dune, Frost, Plum) plus "Automatic", in a 3 × 3 grid of head icons                                                                                                                                                                                              | Names make the choice readable for the controller focus and for screen readers; 3 × 3 fits mouse, touch and pad                                                                                                                                                                               |
| 22  | The player list of "Playing together" shows a head icon of each player's look next to the swatch                                                                                                                                                                                                                                | The look becomes recognisable in the list; the icon is drawn from the same generated texture                                                                                                                                                                                                  |
| 23  | Each figure costs two draw calls (figure and name tag): the six parts are one mesh whose limbs the vertex shader turns. AC6.6 of Part B (at most 4) is tightened to 2                                                                                                                                                           | Six meshes would be seven draw calls per figure; four players on a phone must stay smooth                                                                                                                                                                                                     |
| 24  | The rotating preview uses a small WebGL renderer of its own while the settings page shows it; without WebGL there it shows the head icon                                                                                                                                                                                        | The game's canvas lies under the menus; a second small context is the simplest and is released when the page closes                                                                                                                                                                           |

Changes 15–22 were agreed with the owner in the planning of Part D (2026-11-21). Changes 23
and 24 are technical choices of that planning, shown to the owner with the plan; so is one
sentence added to Part E's step 15: its simulated guests use three different looks and set
`busy` while they break, so the scenario measures the animated figure.

Clarifications, stated so nobody is surprised:

- **Worlds are per site.** A world made on GitHub Pages cannot be opened to others on the
  Pi. Every PR preview has its own world list, settings and player key; test PRs with a
  fresh world there.
- **Every device must reach the Pi**: the page, the signaling server and the STUN server
  are on it. Once players are connected, a signaling outage does not affect them, but
  nobody new can join.
- **Guest networks that isolate devices** (client isolation) prevent direct connections;
  all devices must be in the same home network.
- **Gathering worlds** can be opened to others from Part C on. In Part B "Open to others"
  is shown disabled in a Gathering world with a short reason.

## 4. Out of scope (do not build)

Internet play; TURN relays; public signaling or STUN servers; accounts and passwords; text
or voice chat; host migration; kicking or banning; the Pi or a Node process as host (only
keep the code ready for it, 5.1); several controllers or players on one device; for the
figure (Part D): the held item, other players' cracks, a third-person camera, the own hand
or arm in the first-person view, a free character editor (single parts or colours), custom
or uploaded skins, any figure, skin or name like another game's (all Phase 7 or never);
moving
worlds between sites (export/import); a copy of the world on guests; host-side smelting
time; prediction or rollback of edits on guests; movement prediction or lag compensation;
collision between players; spectators; protection against modified clients beyond the
checks in 5.6; Web Workers; sound; a `beforeunload` confirmation; iPhone and iPad
(best effort only); any server code (the servers are a separate task in the owner's
`pi-infra` repository, section 5.12).

## 5. Specification

All numbers are starting values in `src/game/config.ts` and may be tuned; record changes
in the part's report. Acceptance criteria refer to the final values.

### 5.1 Architecture

```
src/net/                 pure core (no three, no DOM, no peerjs); unit-tested in Node
  transport.ts           Connection, Signaling and RoomDirectory interfaces
  memoryTransport.ts     in-memory implementation with seeded delays, for tests and the
                         performance test's simulated guests
  netTest.ts             (A) the messages and numbers of the network test
  protocol.ts            (B) message types, encode/decode with validation
  roomCode.ts            (B) room codes, peer ids, player names, player keys
  snapshot.ts            (B) the world's edits split into parts and joined again
  HostSession.ts         (B) the host: players, applyAction per player, relay, time
  ClientSession.ts       (B) the guest: join, sync, play, reconnect, end; a Session
  interpolation.ts       (B) buffered poses of other players → pose at render time
  authority.ts           (C) blocks of chunks the host has not loaded, on the side
  breakTiming.ts         (C) a guest's break checked on the host's clock
src/game/netConfig.ts    (A) build variables and URL parameters → NetConfig
src/game/peerTransport.ts (A) Signaling and RoomDirectory with peerjs (dynamic import)
src/game/wakeLock.ts     (B) the screen wake lock while networked
src/render/RemotePlayers.ts (B) figures and name tags
src/ui/NetTestScreen.ts  (A) the network test
src/ui/JoinSection.ts    (B) "Join a world" on the world menu
src/ui/RoomPanel.ts      (B) "Open to others" and the player list in the pause menu
src/player/looks.ts      (D) the table of looks, `lookForKey`, `resolveLook`
src/player/figureMotion.ts (D) received movement → angles of head, body and limbs
src/render/textures/figureTexture.ts (D) the looks painted into one atlas (pure)
src/ui/PlayerSection.ts  (D) "Your player": name, look picker, rotating preview
src/bench/               (E) the scenario `players` and its simulated guests
scripts/signalServer.mjs (A) local PeerJS server for tests and development
e2e/multiplayer.ts       (A, B) opens several players in separate browser contexts
```

- `src/net/` joins the pure core: the ESLint boundary rule (also forbidding `peerjs`,
  `window`, `document`, `Math.random`, `Date.now`) and the coverage scope. Time reaches it
  as a parameter (`nowMs`), randomness as bytes passed in (`crypto.getRandomValues` in the
  shell).
- **A later Node host.** `HostSession` depends only on `World` (pure), `applyAction`, the
  `Connection` interface and a clock. Nothing in `src/net/` may assume a rendered frame,
  a DOM or that the host is also a player; the host's own player is one of its players
  with a local connection. Not tested in Node beyond the unit tests; no server is built.
- **One pipeline.** `Game` and the UI keep handing actions to a `Session`. A guest's
  session is a `ClientSession` (sends, applies what the host reports). The host's own
  player's session is a local door into `HostSession`. `LocalSession` stays for
  single-player and is untouched. `pipeline.test.ts` gets `src/net/` as the third place
  allowed to call `.setBlock(` (the guest applying the host's changes) and the host's
  apply path.
- **The host needs no timer.** Everything the host sends is an answer to a message (the
  guest's ping drives the heartbeat and the time sync, 5.9) or happens in a frame or in a
  message handler. A hidden host tab, which gets no frames and throttled timers, keeps
  serving. A 1 s timer only removes silent guests and is allowed to be late.

### 5.2 Configuration and build id (Part A)

- `NetConfig = { signal: { host, port, path, secure } | null, iceServers: { urls }[] }`.
  `netConfig.ts` reads `import.meta.env.VITE_SIGNAL_URL` (for example `wss://<host>/` or
  `wss://<host>:443/peerjs`) and `VITE_STUN_URLS` (comma-separated `stun:` URLs). The URL
  parameters `signal=<url>` and `stun=<urls>` override them; `stun=none` empties the list.
  The parser is pure and unit-tested; an invalid value counts as not set.
- `signal` null: the multiplayer buttons and the network test say "Multiplayer is not
  available in this build." and nothing else changes.
- **The build id** is `__BUILD_COMMIT__` (exists since Phase 4 part P). `buildCommit()` in
  `vite.config.ts` first reads the environment variable `BUILD_COMMIT` if set, so a build
  without `.git` and without `GITHUB_SHA` (a Pi build from an archive) still has an id.
  `dev` builds match only `dev` builds.
- `peerjs` is loaded with a dynamic `import()` the first time the network test, a room or
  the room list is used. Until then the page requests nothing outside its own origin.

### 5.3 Peer ids, rooms, discovery (Parts A and B)

- PeerJS key: the server default (`peerjs`). Every id this game uses starts with
  `mc-<build>-`, so different builds never see each other.
- Hosts: `mc-<build>-r-<CODE>`. Room code: 6 characters from
  `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no I, O, 0, 1), from `crypto.getRandomValues`. Input
  is normalised: upper-cased, spaces and hyphens removed. If the id is taken, a new code is
  generated (up to 5 times).
- Guests: `mc-<build>-g-<random>`. Network test: `mc-<build>-t-<4 characters>`.
- **Room list.** `RoomDirectory.list()` fetches `https://<signal host>/<path>/peerjs/peers`
  (PeerJS discovery), keeps the ids with the prefix `mc-<build>-r-`, and asks each room
  for its details with a short connection: the guest sends `info`, the host answers
  `info { hostName, worldName, mode, players, max }` and the connection closes. A room that
  does not answer within `INFO_TIMEOUT_MS = 3000` is left out. The list is refreshed every
  `ROOM_LIST_REFRESH_MS = 3000` while the world menu is visible. If discovery is off (HTTP
  401), the section says "No room list on this server. Use a room code." and the code
  field works as before.
- Joining by code when the room is not found: if discovery works and a room with the same
  code but another build is listed, the message is the version message (5.10), otherwise
  "Room not found".
- One reliable, ordered data channel per guest. Messages are JSON text.
- Timeouts: joining fails after `JOIN_TIMEOUT_MS = 15000`. If the host loses the signaling
  server, existing connections keep working; the host retries every 5 s so new players can
  join again.

### 5.4 The network test (Part A)

A screen of its own, opened by the button "Network test" on the settings page (the pause
screen without its world parts, reachable from the world menu). It exists so the owner can
check the home network before the game depends on it, and stays in the game afterwards for
troubleshooting.

- It shows the build id, whether multiplayer is available, the signaling host (host name
  only), the ICE server list, the state of the signaling connection, whether discovery
  works, and its own test code.
- "Others testing now": every device with the network test open on the same build, from
  discovery. "Connect" next to one opens a data channel.
- Once connected, it shows on both devices: the candidate pair in use from `getStats()`
  (type `host`, `srflx` or `relay`, and whether the remote address is an mDNS name or an
  IP; the address itself is masked to its first two parts), the median round-trip time of
  20 pings, and the throughput of 1 MB sent in 16 kB messages (MB/s). Then a one-line
  verdict: "Direct connection OK" or what failed (signaling unreachable, discovery off,
  no ICE candidate pair within 15 s).
- A switch "Use STUN" (default on) repeats the test without the ICE servers, to find out
  whether STUN is needed at home.
- "Copy result" copies a short text with all numbers (the build, both devices' browsers,
  candidate types, round-trip time, throughput) for `docs/device-tests.md`.
- Reachable with mouse, touch and controller (the focus system works on it as on every
  screen; it has no text field).

### 5.5 Protocol (Part B, extended in C and D)

Every message is `{ t: <type>, ... }`. Compatibility is decided by the build id
(decision 6), so the protocol has no version number of its own. The decoder validates every field (types, finite numbers, integer ranges, string lengths,
total size ≤ `MAX_MESSAGE_BYTES = 65536`) and never throws. A peer that sends
`MAX_PROTOCOL_ERRORS = 20` invalid messages is disconnected. Actions inside messages are
decoded with the existing `decodeAction`.

| Direction    | Message    | Content                                                                                                                                    |
| ------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| guest → host | `info`     | asks for the room's details (room list); nothing else follows                                                                              |
| host → guest | `info`     | host name, world name, mode, player count, maximum; then the host closes                                                                   |
| guest → host | `hello`    | build id, player key, name                                                                                                                 |
| host → guest | `reject`   | reason: `full`, `build`, `duplicate` (that player key is already in the room), `closed`; then the connection closes                        |
| host → guest | `welcome`  | own player id and colour slot, world name, seed, generator version, mode, terrain checksum, time, frozen flag, players, record, start pose |
| host → guest | `snapshot` | part number and the edits of some chunks                                                                                                   |
| host → guest | `ready`    | snapshot complete                                                                                                                          |
| guest → host | `action`   | sequence number, action                                                                                                                    |
| host → guest | `result`   | sequence number, the `ActionResult` without the record (ok + notices, or a reason); only to the sender                                     |
| host → guest | `record`   | the guest's new `PlayerRecord`; only to its owner                                                                                          |
| host → all   | `blocks`   | block changes `(x, y, z, id)` and the id of the player who caused them                                                                     |
| guest → host | `pose`     | x, y, z, yaw, pitch, teleport flag                                                                                                         |
| host → guest | `poses`    | poses of the other players that changed                                                                                                    |
| host → all   | `joined`   | id, name, colour slot                                                                                                                      |
| host → all   | `left`     | id, reason (`leave`, `lost`)                                                                                                               |
| guest → host | `ping`     | the guest's timestamp                                                                                                                      |
| host → guest | `pong`     | the guest's timestamp, the time of day and the frozen flag                                                                                 |
| both         | `bye`      | deliberate leave or room closed                                                                                                            |

- Records travel in the save format's encoding (`encodeMeta`'s record part), decoded and
  validated with the same code.
- The `welcome`, all `snapshot` parts and `ready` are queued in one go, so no later
  `blocks` can overtake them. A part is at most `SNAPSHOT_PART_BYTES = 16384` long; the
  host watches the channel's `bufferedAmount` and keeps order with one queue per guest.

### 5.6 Actions on the host

- `HostSession` keeps one `PlayerRecord` and one last pose per player and calls
  `applyAction` with that player's record and pose, `players` = the last poses of all
  players, the world's mode and the host clock (5.7). Blocks are set in the host's world,
  sent to everybody as `blocks`, the record to its owner, the result to the sender.
  Simultaneous actions on one cell are decided by arrival order at the host.
- The host's own player goes through the same path (a local connection without a network).
- **Pose checks:** finite numbers, `|x|, |z| ≤ 30 000 000`, `-64 ≤ y ≤ 512`, pitch
  clamped; invalid poses are dropped. The reach check (5 + 1.5) uses the last pose the
  host knows; the tolerance covers the pose lag.
- **Far chunks (Part C).** `authority.ts` gives the host a `BlockReader` for any position:
  the loaded chunk if there is one, otherwise the chunk generated on the side
  (`generateChunk` plus `World.edits`) in a cache of `AUTHORITY_CACHE_CHUNKS = 32` chunks
  (least recently used). It is used for every guest's `applyAction` (reach, water rule,
  support rule, tools, stations within 5). An edit in a cached chunk updates the cache
  together with `World.setBlock`, which already records edits in chunks that are not
  loaded. In Part B guests in Creative may already act far away: Creative has no stations,
  but the water and support rules read blocks there, so B uses a first version of the same
  reader and C completes it (cache bounds, stations, tests).
- **Rate limit (Part C):** more than `ACTION_RATE_LIMIT = 30` actions in one second from
  one guest are refused with the new reason `rate` (no text on screen).
- The guest does not check actions itself before sending. It shows only what the host
  reports (as today: the UI waits for `onResult`, `onPlayer`, `onBlocks`).

### 5.7 Clocks and timed breaking (Part C)

- While a room is open, the host's action clock is wall-clock time (`performance.now()`,
  passed in as `nowMs`), for its own player too. Records' `breaking` from before the room
  opened is cleared when it opens.
- **The guest's clock.** A guest's UI measures break progress on its own simulation clock.
  `ClientSession` remembers the local time at which it submitted each `startBreak`; when
  the host's record arrives, `breaking.startMs` is replaced by that local time, so
  `Game`'s break progress works unchanged. The host keeps its own times.
- **Network jitter.** The host measures a guest's break from the arrival of `startBreak` to
  the arrival of `break`. Wi-Fi jitter can shorten that by a few hundred milliseconds. A
  `break` that arrives early by at most `NET_BREAK_GRACE_MS = 400` is not refused: the host
  holds it and decides it when it is due (in the next message handler, frame or timer
  after the due time). Earlier than that it is `early`, as today. `breakTiming.ts` is the
  pure rule; unit tests use seeded delays of 0–300 ms.
- The furnace stays client-side (decision 8): the guest's `Game` waits `SMELT_MS` and then
  submits `craft`, as today.

### 5.8 Joining

1. The guest connects to the room id and sends `hello`.
2. The host answers `reject`, or `welcome` with all `snapshot` parts and `ready`.
3. The guest checks the terrain checksum: it computes the checksum of the 3 × 3 chunks
   around the origin for the received seed and generator version (the existing function)
   and compares it with the host's. On a mismatch it sends `bye` and shows "This browser
   generates the world differently from the host's. Try another browser." Otherwise it
   opens the world: `Game.loadWorld` with a meta built from `welcome` and the received
   edits. **A guest's world is never saved** (no store, no autosave, no world lock).
4. The guest appears at the start pose from `welcome`: a new player next to the host (the
   first free standing place on solid ground within 3 blocks of the host, else the host's
   position); from Part C a returning player where they left.
5. The host announces `joined` to everyone else.

Names are 1–16 characters after trimming and removing control characters; an empty name
becomes `Player <4 digits>`. Duplicate names in one room get a suffix (`Anna (2)`) on the
host. The **player key** is 16 random bytes in hex, created once per device (and site) and
stored with the name in local storage (`markuscraft.player.v1`). A second tab of the same
device joining the same room gets `duplicate`.

### 5.9 Players, movement, time

- Each device simulates its own player and sends its pose at `POSE_SEND_HZ = 20`, only
  while it changes. A teleport (start, test API) sets the teleport flag.
- The host relays changed poses at 20 Hz in its frames and, when it gets no frames, from
  the message handler of incoming poses (at most every 50 ms), bundled per recipient,
  never back to the sender.
- Other players are drawn `INTERP_DELAY_MS = 100` in the past, linearly interpolated
  between received poses; yaw takes the short way round. If no newer pose exists, the last
  one is held. A jump of more than `SNAP_DISTANCE = 8` blocks or a teleport flag snaps.
- **Figure (Part B; replaced in Part D by 5.14):** a body box and a head box, 1.8 blocks tall and 0.6 wide like the collision
  box, in the player's colour (4 fixed colours by slot), with a darker face side on the
  head. It turns with yaw, the head tilts with pitch. It is lit like the terrain at its
  position (sky and block light of the cell at its eyes, daylight, the Brightness floor)
  and fogged like the terrain. Colours and shapes are code, no image files.
- **Name tag:** the name on a dark rounded plate above the head, always facing the camera,
  hidden by terrain, drawn from a canvas texture made at runtime.
- The own figure is not drawn. Players do not collide with each other; a solid block
  cannot be placed into any player's cell (the existing `players` check), a torch can.
- **Time of day.** While a room is open, the host's time advances by wall-clock time (it
  continues while the host's tab is hidden or its menu is open). The host's `pong` carries
  the time; a guest pings every `PING_INTERVAL_MS = 1000`, advances its time locally in
  between and adopts the host's value on each `pong`. `freeze=1` on the host freezes time
  for everyone. Single-player time is unchanged.
- **Heartbeat.** A peer that sent nothing for `HEARTBEAT_TIMEOUT_MS = 5000` counts as lost.

### 5.10 Leaving, losing the host, reconnecting

- **Guest leaves** ("Leave world" in the pause menu, or closing the tab, which sends `bye`
  on `pagehide`): the others see "<name> left"; the guest returns to the world list.
- **Guest is lost** (heartbeat): the others see "<name> left". The host keeps that guest's
  record in memory while the room is open, so a reconnect gets it back (Part B); from
  Part C it is also saved with the world (step 8).
- **Host closes the room** ("Close to others", "Save and back to worlds", or closing the
  tab): guests get `bye` and return to the world list with the notice "The host closed the
  world." The host plays on in single-player.
- **Host is lost** without `bye`: each guest shows "Connection lost. Reconnecting…" and
  retries the same room every `RECONNECT_INTERVAL_MS = 2000` for
  `RECONNECT_WINDOW_MS = 10000`. Meanwhile the player can move but nothing is sent. On
  success the guest joins afresh with the same player key (full snapshot; the host still
  has its record). On failure it returns to the world list with "Lost the connection to
  the host."
- **Pause.** While a room is open or joined, the pause menu and the inventory do not pause
  the world: steps, time and other players continue; the own player gets no input while
  the pause menu is open. In single-player the menu pauses as before.
- **Wake lock.** While a room is open or joined the page requests a screen wake lock,
  requests it again when the page becomes visible, and ignores failures silently.

### 5.11 User interface

World menu, new section "Join a world" (Part B):

- Name field (stored with the player key).
- "Open worlds at home": one row per room: host name, world name, mode, players (2/4),
  "Join". A row of a full room has no "Join". An empty list says "No open worlds right
  now."
- Code field with "Join", and the status line for progress and errors: "Connecting…",
  "Room not found", "Room is full", "Different game version. Reload the page on both
  devices.", "Could not reach the connection service. Is this device on the home
  network?", "Multiplayer is not available in this build."
- A page opened with `?join=CODE` shows "Join world CODE" as the main button of the world
  menu.
- Every button and row is reachable with the controller (the focus system); the name and
  code fields are not (they keep their text), so a controller player joins from the list.

Pause menu of an open world (Part B):

- "Open to others" (disabled with the reason "Gathering worlds can be shared from a later
  version." in Part B; enabled for both modes from Part C).
- While hosting: the room code in large type, "Copy join link", the player list (colour,
  name, "(host)", "(you)"), "Close to others". In touch mode the hint: "The world closes
  for everyone if this screen locks or you switch apps. A computer is the more reliable
  host."
- While a guest: the room code, the player list, "Leave world" in place of "Save and back
  to worlds".

In play:

- Notices "<name> joined", "<name> left" and the connection notices, in the existing notice
  area, `NET_NOTICE_MS = 5000` each, at most 4.
- F3 overlay (Part E): role, room code, players, round-trip time to the host, candidate
  type (direct, via STUN), signaling state, messages and bytes per second in and out.

### 5.12 What pi-infra must provide (not built in this repository)

The owner builds the servers in the `pi-infra` repository. This plan relies on:

1. A PeerJS server (`peer` 1.0.x) reachable as `wss://<signal host>/` behind the wildcard
   certificate, with `allow_discovery: true`, the default key `peerjs`, and CORS allowing
   the game's origins (the main build and every PR preview).
2. A STUN server (for example coturn with STUN only, no relay), UDP 3478, reachable from
   the home network.
3. The Pi's builds of the game set `VITE_SIGNAL_URL`, `VITE_STUN_URLS` and `BUILD_COMMIT`
   (the commit of the build) when running `npm run build`.
4. Part A's network test is the check that 1–3 work; its result decides whether Part B
   may start.

### 5.13 Test API

`getState().net` (Part A: `role` and `test` only):

```
{ role: 'off' | 'host' | 'guest',
  status: 'offline' | 'connecting' | 'syncing' | 'online' | 'reconnecting',
  available: boolean, build: string, roomCode: string | null, selfId: number | null,
  players: [{ id, name, slot, self, host, x, y, z, yaw, pitch, renderX, renderY, renderZ }],
  rttMs: number | null, worldHash: number, lastError: string | null, notices: string[],
  test: { state, candidate, rttMs, mbPerS } | null }
```

`worldHash` is an order-independent hash of the world's edits; equal on all players means
equal worlds. New members of `__mc.net`:

| Member                     | Purpose                                                                     |
| -------------------------- | --------------------------------------------------------------------------- |
| `net.host(options?)`       | Opens a room; resolves with the code. In test mode a fixed code can be set  |
| `net.join(code, options?)` | Joins; resolves when synced, rejects with the error reason                  |
| `net.rooms()`              | The room list as the world menu shows it                                    |
| `net.leave()`              | Leaves or closes the room                                                   |
| `net.sendRaw(message)`     | Sends any message to the host, bypassing the encoder (tests of the decoder) |
| `net.dropConnection()`     | Kills the transport without `bye` (a crash or network loss)                 |
| `suspendFrames(on)`        | The frame loop skips all work (a hidden tab)                                |

`setBlock` on a host is broadcast like a host edit; on a guest it throws. `step(n)` still
advances only the own simulation; network messages are handled whenever they arrive.
`join=<code>` and `name=<text>` work with `test=1` too (join at once). Multiplayer test
pages pass `signal=http://127.0.0.1:9000/` and `stun=none`.

Part D adds: `getState().player { name, choice, look }` (the stored choice 0–8 and the
resolved look); in `getState().net.players` per player `look`, `busy`, `fly` and
`anim { bodyYaw, headYaw, headPitch, leftArm, rightArm, leftLeg, rightLeg }` (the angles
drawn in the last frame); `getState().ui.preview { frames } | null` (frames the preview
drew; null while it does not exist); `__mc.figureSheet()` shows every look from the front
and the back on one page (reference `figure-sheet`, like `glyphSheet()`). The URL
parameter `look=<0–8>` works with `test=1` too.

### 5.14 The player figure (Part D)

What a player sees of every other player. The own figure is drawn only in the preview of
"Your player" (5.15); the first-person view does not change.

**Shape.** Six boxes: head, body, two arms, two legs, measured in figure texels and
scaled so that the figure is `PLAYER_HEIGHT` (1.8) tall. Starting values (`config.ts`):
legs 4 × 11 × 4 (width × height × depth), body 8 × 11 × 5, arms 3 × 10 × 3, head 7 × 7 × 7,
29 texels in all. These proportions are this game's own and differ on purpose from the
best-known blocky figure (hard rule 1): a smaller head, thinner arms, a deeper body. The
pivots are the hips, the shoulders and the neck.

**Looks.** `src/player/looks.ts` holds the table: ids 1–8 with a name and the colours and
styles the painter uses (skin tone, hair colour and style, top colour and pattern,
trousers or skirt, shoes). Starting names: Fern, Ember, Pebble, River, Moss, Dune, Frost,
Plum. Choice 0 is "Automatic". The ids travel in the protocol and are stored on the device:
the table is append-only and pinned by `looks.test.ts`, like block and item ids.

- `lookForKey(key)` is 1 + (the first byte of the player key mod 8): the same device looks
  the same every time.
- `resolveLook(choice, key)`: a choice of 1–8 is the look; 0 or anything invalid is
  `lookForKey(key)`.
- The looks cover a range of skin tones and both short and long hair; none of them uses
  the colour scheme of a well-known default skin (a turquoise top with blue trousers and
  short brown hair, or its orange-haired variant with a green top).

**Texture.** `src/render/textures/figureTexture.ts` is a pure painter like `tiles.ts`:
seeded, no DOM, it writes RGBA into a typed array. It paints every look into one atlas
with a texture layout of this game's own (not the 64 × 64 layout of another game): faces
of each part side by side, one texel per figure texel, a little seeded noise in cloth and
hair, eyes and a mouth on the head's front, hair on top, back and sides. The belt (a band
at the bottom of the body) is marked as accent in the atlas and tinted with the player's
slot colour in the shader, so one atlas serves every slot. Nearest filtering, no mipmaps
beyond what keeps distant figures free of shimmer. The same painter gives the head icon
(the front of the head) for the picker and the player list.

**Motion.** `src/player/figureMotion.ts` (pure, no allocations per call) turns what a figure
receives into angles, once per rendered frame per figure. Input: the drawn pose (the
interpolated pose of 5.9), the frame time, `fly`, `busy` and the count of block changes
the player caused. Output: body yaw, the head's yaw relative to the body and its pitch,
and the angles of both arms and legs. Starting values in `config.ts`:

- **Walking.** The horizontal speed comes from the drawn pose's movement, smoothed. Legs
  swing in opposite directions; the amplitude rises with the speed up to
  `FIGURE_LEG_SWING = 0.6` rad at walking speed and no further; the phase advances with
  the distance walked (`FIGURE_STRIDE`), so faster walking means faster steps. Arms swing
  against the legs at half the amplitude. When the player stops, the limbs come to rest
  within `FIGURE_SETTLE_MS = 200`. A snap (5.9) counts as no movement.
- **Flying** (`fly`): the legs stay still and the arms hang; only the swing below moves.
- **Head and body.** The head takes the received yaw and pitch. While walking the body
  turns towards the walking direction (walking backwards: towards the opposite of it), at
  most `FIGURE_BODY_TURN` rad/s. Standing, the body follows only when the head is more
  than `FIGURE_HEAD_YAW_MAX = 45°` off. The head is never more than 45° off the body.
- **Swing.** While `busy`, the right arm swings in a cycle of `FIGURE_SWING_MS = 300`; a
  block change caused by the player starts one swing if none is running. The swing
  replaces the walking movement of that arm.

**Rendering** (`src/render/RemotePlayers.ts`, rewritten). One geometry for all figures:
the six boxes with UVs into the atlas, the face shade as vertex colour (as today) and a
part index. The vertex shader turns each part about its pivot by per-figure uniforms
(limb angles, head yaw and pitch, the look's place in the atlas, the accent colour); the
body yaw is the object's rotation. One `ShaderMaterial` per figure, the atlas and geometry
shared. **Two draw calls per figure**: the figure and its name tag. Light as in Part B
(one sample at the eyes, daylight, Brightness floor), fogged like the terrain; at night
the figure is dark where the terrain is dark and does not glow. The name tag stays as it
is, with a stripe of the slot colour at its left edge; it is drawn again when the name
changes. Per frame and figure: one motion step and a few uniform writes, no allocation.

**Protocol additions** (same build id on both sides, so no versioning):

| Direction    | Message             | Change                                                                               |
| ------------ | ------------------- | ------------------------------------------------------------------------------------ |
| guest → host | `hello`             | `look` (1–8, resolved on the device before sending)                                  |
| host → guest | `welcome`, `joined` | every player entry has `look`                                                        |
| guest → host | `profile`           | new: `name`, `look`; counts towards the rate limit                                   |
| host → all   | `profile`           | new: `id`, `name` (with the suffix of 5.8 applied again), `look`; also to the sender |
| guest → host | `pose`              | `busy` (boolean)                                                                     |
| host → guest | `poses`             | every entry has `fly` and `busy`                                                     |

The host's own player changes its profile through `HostSession` (no message). A saved
guest entry gets the new name; the look is not saved with the world (every `hello` brings
it). The decoders validate the new fields like all others: `look` an integer 1–8, `busy`
and `fly` booleans, names as in 5.8.

**Busy.** `Game` sets `busy` while the player holds break on a targeted block (a break in
progress in Gathering; in Creative, where breaking is instant, while the button is held
and the crosshair is on a block). The host's own player's `busy` is read like its pose.

### 5.15 "Your player" (Part D)

A section on the settings page (the pause screen without its world parts, reachable from
the world menu, and the settings of the pause menu of a world):

- **Name**: the same value as the name field of "Join a world"; changing one changes the
  other. Normalised as in 5.8 when it is used.
- **Preview**: a canvas of about 160 × 200 CSS px showing the own figure in the chosen look,
  walking on the spot and turning once every 8 s, lit evenly, with the accent of slot 1.
  It uses a small `WebGLRenderer` of its own, created when the section becomes visible and
  disposed when the settings page closes, drawing at most 30 frames per second and only
  while visible. If WebGL cannot be created there, the preview shows the look's head icon
  and nothing is logged. The look's name is written under it.
- **Look picker**: nine buttons in a 3 × 3 grid, "Automatic" first, then the eight looks,
  each a head icon with the name under it; "Automatic" shows the icon of the look it
  resolves to. The chosen button is marked. `aria-label` "Look: Fern" and "Look: Automatic
  (Fern)" (what `ui.focus` reports). At least 48 × 48 CSS px in touch mode. With the
  controller the buttons take part in the focus system like any button; the name field is
  a text field and is not focusable, as in "Join a world".
- **Storage**: `markuscraft.player.v1` gets `look` (0–8). A stored record without it (Part
  B and C) or with an invalid value loads as 0 (Automatic). As before nothing is stored
  until a room is opened or joined, a name typed, or a look chosen; single-player and the
  performance test leave no trace.
- **During a room**: a new look is sent at once, a new name when the field is left or
  Enter is pressed (`profile`). The others' figure, name tag and player list change
  within a second.
- **Player list** of "Playing together": each row gets the head icon of the player's look
  next to the slot swatch.
- URL parameter `look=<0–8>` (like `name=`), for tests and for trying looks.

**For Part E.** Nothing has to be built ahead for the scenario `players`: its simulated
guests go through the same `HostSession`, roster and `RemotePlayers`, so their figures are
animated by what they send. Part E's script should give them three different looks and
set `busy` while they break. Part D adds the Node timing of the motion rule (AC11.6) and the
draw call bound (AC12.4) that the scenario then measures on real devices.

## 6. Test strategy

The rules of `CLAUDE.md` stay in force: unit tests in Node, browser tests against the
production build, state-based waiting, console hygiene, rule-based checks plus reference
screenshots, screenshots looked at by eye.

### 6.1 Layers

1. **Unit tests** for all of `src/net/` with the memory transport: one host and up to three
   guests in one Node process, a fake clock, seeded delays. Coverage scope and the 85 %
   threshold include `src/net/`.
2. **Browser tests with several players.** `e2e/multiplayer.ts` opens each player in its
   own browser context with the console checks of `e2e/fixtures.ts` on every page. All
   contexts talk to the local PeerJS server; no test contacts an outside host. Tests with
   three or four players run serially (`test.describe.configure({ mode: 'serial' })`) and
   use render distance 2.
3. **Rule-based visual checks** for figures and name tags, and reference screenshots.
4. **Real devices** through the NET tests (section 9) on the Pi's PR preview, before each
   merge.

### 6.2 The local PeerJS server

`scripts/signalServer.mjs` starts the `peer` server (dev dependency, the same major version
as the Pi's) on `127.0.0.1:9000` with `allow_discovery: true`. Bind to `127.0.0.1`
explicitly (the cloud container has no IPv6). Playwright's `webServer` becomes a list
(preview server and this server). Room codes are random per test, so parallel tests share
it safely; tests of the room list use their own build-independent check (they filter by
their room codes). `npm run signal` starts it for trying two tabs with `npm run dev`
(`?signal=http://127.0.0.1:9000/&stun=none`).

### 6.3 Reference screenshots

- `net-test` (A): the network test after a connection, with the numbers masked.
- `remote-player` (B): a guest's view of the host's figure with name tag, noon, fixed pose;
  `remote-player-night` (B): the same at midnight (the figure must not glow).
- `join-section` (B): the world menu with two rooms listed; `room-panel` (B): the pause
  menu while hosting with two players and a fixed code.
- `figure-sheet` (D): all eight looks from the front and the back, from
  `__mc.figureSheet()`; `player-section` (D): "Your player" with a chosen look (the preview
  masked or stopped at a fixed angle).
- Part D regenerates `remote-player` and `remote-player-night` (the new figure, standing,
  at the same pose) and `room-panel` (head icons).
- Regenerate the world menu, pause and settings references the new sections change, and
  look at each (`CLAUDE.md`, text-only references).

### 6.4 Limits of automation

Not testable in a cloud session, so they are NET tests for the owner: the Pi's PeerJS and
STUN servers, certificates and CORS, two real devices in one Wi-Fi, mDNS on Android, other
browser engines, a really hidden or locked host, the wake lock, frame rate with four real
players.

## 7. Implementation steps

Work in order within the part. After each step: `npm run check:all` passes, commit, push.
All acceptance criteria (AC) are verified by automated tests unless marked _(manual)_.

### Part A – Connection test (steps 1–2)

### Step 1 – Tooling and transport

`peerjs` (runtime) and `peer` (dev), `scripts/signalServer.mjs`, `npm run signal`, the
Playwright `webServer` list, ESLint boundary and coverage for `src/net/`, `netConfig.ts`,
`BUILD_COMMIT`, the `Connection`/`Signaling`/`RoomDirectory` interfaces, the memory
transport, `peerTransport.ts`.

- AC1.1 Unit: `netConfig` parses `wss://h/`, `wss://h:8443/peerjs`, `http://127.0.0.1:9000/`
  into host, port, path and TLS; a list of `stun:` URLs; `stun=none`; invalid values count
  as not set; URL parameters win over build variables.
- AC1.2 E2E: a build without `VITE_SIGNAL_URL` reports `net.available` false, and the
  settings page's "Network test" shows "Multiplayer is not available in this build."
- AC1.3 E2E: two browser contexts connect through the local server with `peerTransport`
  and exchange a message in both directions within 10 s; the list of the directory
  contains both test ids.
- AC1.4 The CI run of the step's last commit is green, proving WebRTC between contexts on
  GitHub Actions (checked with the GitHub tools; named in the report).
- AC1.5 ESLint fails when a file under `src/net/` imports `three` or `peerjs` or uses
  `window`, `document`, `Math.random` or `Date.now` (proven once by a temporary violation;
  named in the report).
- AC1.6 Unit: the memory transport delivers in order per connection under seeded delays
  and reports closing to both ends.
- AC1.7 E2E: loading and playing in single-player requests nothing outside the page's
  origin and does not load the chunk containing `peerjs`. The entry chunk grows by at most
  10 kB over the last Phase 5 build (both sizes in the report).
- AC1.8 `BUILD_COMMIT=abc1234 npm run build` produces a build whose `getState().net.build`
  is `abc1234` (Node test of `buildCommit` or a check of the built file).

### Step 2 – The network test, report, pull request

`NetTestScreen` (5.4), its button on the settings page, `getState().net.test`.

- AC2.1 E2E: two contexts open the network test; each lists the other within 10 s; one
  clicks "Connect"; both show a candidate type, a numeric round-trip time and a numeric
  throughput, and the verdict "Direct connection OK".
- AC2.2 E2E: with `signal` pointing to a closed port the screen says the signaling server
  cannot be reached within 15 s; the game keeps working (back to the world menu, create a
  world, play).
- AC2.3 E2E: with a server started by the test without discovery, the screen says
  "discovery off" and still shows its own test code.
- AC2.4 E2E: "Use STUN" off removes the ICE servers (checked through the state).
- AC2.5 E2E: "Copy result" puts a text with the build id, candidate type, round-trip time
  and throughput on the clipboard (Playwright clipboard permission).
- AC2.6 E2E: the screen can be used with the fake controller (focus moves to "Connect" and
  A connects) and at 640 × 360 in touch mode every control is inside the view and at least
  48 × 48 CSS px.
- AC2.7 Reference screenshot `net-test` created and looked at.
- AC2.8 `README.md` has a short "Playing together (in preparation)" with the network test
  and what the Pi must provide (5.12, without addresses). `CLAUDE.md`: structure, tech
  stack (`peerjs`, `peer`), the rule about addresses, headless testing with the local
  server, status. `docs/device-tests.md` gets the section "Multiplayer" with NET-1 to NET-4.
  `docs/phase-6a-report.md` per the Definition of Done. One pull request into `main`.

### Part B – Together in Creative (steps 3–7)

Precondition: the owner's NET-1 to NET-4 results in `docs/device-tests.md` show a working
connection between at least a computer and a phone. If they do not, write that into
`docs/phase-6b-report.md`, commit it and stop.

### Step 3 – Protocol, rooms, names (pure)

`protocol.ts`, `roomCode.ts`, `snapshot.ts`.

- AC3.1 Unit: every message type survives encode → decode unchanged.
- AC3.2 Unit: the decoder returns an error, without throwing, for wrong field types, NaN
  and infinite numbers, non-integer coordinates, over-long strings, unknown types,
  oversized messages, invalid actions and records, and for 10 000 seeded random strings.
- AC3.3 Unit: 1 000 generated codes have 6 characters from the alphabet; lower case,
  spaces and hyphens are normalised; other characters or lengths are invalid. Peer ids
  carry the build prefix; an id of another build is not recognised as a room.
- AC3.4 Unit: names are trimmed, stripped of control characters, cut to 16 characters,
  replaced by a default when empty, and get a suffix when taken. Player keys are 32 hex
  characters; anything else is refused.
- AC3.5 Unit: 50 000 edits in 200 chunks survive split → join unchanged; no part exceeds
  16 384 bytes; no edits give zero parts.

### Step 4 – Host and client sessions (pure)

`HostSession`, `ClientSession`, `interpolation.ts`, a first `authority.ts`, entirely in
Node with the memory transport and a fake clock.

- AC4.1 After joining, the guest's seed, mode, time, frozen flag and edits equal the
  host's; the guest's start pose is within 3 blocks of the host and not inside a solid
  block.
- AC4.2 A valid guest action changes every player's world and gives the sender `ok`; an
  invalid one changes no world and gives its reason. The guest's world does not change
  before `blocks` arrives (delayed transport). The guest's `onResult` gets the action it
  submitted (sequence numbers), also with two actions in flight.
- AC4.3 Each player has its own record: a guest's `selectSlot` and `setBarSlot` change
  only that guest's record; the host's record is untouched.
- AC4.4 A host action reaches all guests.
- AC4.5 A fifth player gets `full`, another build `build`, a second connection with the
  same player key `duplicate`; a duplicate name gets a suffix. `info` answers without
  making a player.
- AC4.6 A pose reaches every other player within one relay and never its sender; invalid
  poses are dropped; an unchanged pose is not sent again. A guest that sends nothing for
  5 s is removed and the others get `left`.
- AC4.7 Guest time is within 0.001 of host time after a `pong`. Host time advances by the
  clock alone and stays fixed when frozen. The host advances and relays without frames
  (no frame calls in the test).
- AC4.8 Convergence: one host and three guests perform 2 000 seeded random actions under
  random delays, one guest joining midway; afterwards all `worldHash` values are equal.
- AC4.9 Edits made while a snapshot is in transit are present on the joining guest.
- AC4.10 20 invalid messages close the connection.
- AC4.11 Client state machine: `bye` ends without reconnecting; a lost host leads to
  retries every 2 s for 10 s and then to `offline`; a host that returns within the window
  leads back to `online` with the host's current edits and the same record.
- AC4.12 Interpolation is linear between two poses, never overshoots, holds the last pose
  when starved, snaps beyond 8 blocks and on the teleport flag, and takes the short way
  around for yaw.
- AC4.13 A guest breaking next to water 300 blocks from the host gets water, read on the
  side, with the host's chunk not loaded.
- AC4.14 Line coverage of `src/net/` is at least 85 %.

### Step 5 – The game as host and guest

`peerTransport` sessions in `Game`, the guest's unsaved world through `Game.loadWorld`,
pause that does not pause, the test API of 5.13, URL parameters `join` and `name`. No
figures and no menus yet.

- AC5.1 E2E: a host opens a room; `net.role` is `host` and the code is well-formed. A
  guest joins by code; within 15 s both list two players and the guest's seed and mode
  equal the host's.
- AC5.2 E2E: edits the host made before the join exist on the guest, including one 320
  blocks away from spawn (checked after teleporting there).
- AC5.3 E2E: a real left click on the host breaks the targeted block on host and guest
  within 2 s; a real right click on the guest places a block on both; on the other
  player's screen the centre pixels change (rule-based). `verifyLight()` is 0 on both.
- AC5.4 E2E: with three players, an edit by guest A reaches guest B.
- AC5.5 E2E: after `setTime(0.75)` on the host, the guest's time is within 0.005 within
  2 s and the guest's frame is at most half as bright as at noon.
- AC5.6 E2E: joining an unknown code fails with "Room not found" within 15 s; with `signal`
  pointing to a closed port, joining fails with the unreachable message; the guest's menu
  keeps working.
- AC5.7 E2E: `net.sendRaw` with an out-of-reach `break` from a guest changes no world and
  yields `reach`.
- AC5.8 E2E: the guest's world is never saved: after leaving, the guest's world list and
  IndexedDB contain no new world. The host's guest edits are saved by the host's autosave
  (reload the host, the edit is there).
- AC5.9 E2E: after a join, the chunk counts match a fresh load and the geometry count is at
  most 110 % of it (no leak from the replaced world).
- AC5.10 E2E: a guest in touch mode joins a desktop host; its `break` button breaks a block
  on both.
- AC5.11 E2E (without `test=1`): while the host's pause menu is open, the host's time
  advances and a guest's edit is confirmed within 2 s; in single-player the menu still
  pauses.
- AC5.12 E2E: the terrain check: with a forced mismatch (test option), the guest refuses
  the world, shows the message and stays on the world menu.

### Step 6 – Other players

Pose sending and relay, `RemotePlayers` (figures, name tags).

- AC6.1 E2E: the host walks forward for 60 steps; within 2 s the guest's entry for the
  host is within 0.05 blocks and 0.01 rad of the host's own state.
- AC6.2 E2E: a guest looking at the host from 4 blocks sees the host's colour dominate the
  projected region of the figure and light pixels in the name-tag region; both are gone
  after the host teleports away.
- AC6.3 E2E: turning the host by 180° changes the head region on the guest's screen.
- AC6.4 E2E: the own figure is never drawn (looking straight down shows the ground).
- AC6.5 E2E: placing a solid block into another player's cell is refused on all players; a
  torch is allowed.
- AC6.6 E2E: each other player adds at most 4 draw calls.
- AC6.7 E2E: at midnight the figure in an unlit place is at most a third as bright
  (linear) as at noon; next to a torch it is brighter than without.
- AC6.8 Unit: a motionless player sends no `pose` for 3 s; a moving one at most 21 per
  second.
- AC6.9 Reference screenshots `remote-player` and `remote-player-night` created and looked
  at: the figure upright, standing on the ground, the name readable, not glowing at night.

### Step 7 – Menus, room list, leaving, report, pull request

`JoinSection`, `RoomPanel`, notices, leaving and losing the host, the wake lock, the touch
hint.

- AC7.1 E2E (without `test=1`): the world menu shows "Join a world" with name field, room
  list and code field. The name survives a reload.
- AC7.2 E2E: while a host has a room open, a second context's room list shows it within
  6 s with host name, world name, mode and "1/4"; "Join" joins. A room of another build
  (forced build id in the test) is not listed, and joining its code by hand gives the
  version message.
- AC7.3 E2E: "Copy join link" yields a link with `join=<code>`; a context opening it sees
  "Join world <code>"; clicking it joins. A code typed in lower case with a space joins.
- AC7.4 E2E: the player list on every player shows all names with "(host)" and "(you)" on
  the right entries and follows joins and leaves within 2 s.
- AC7.5 E2E: "<name> joined" and "<name> left" notices appear and are gone after 5 s; a
  fifth pushes out the oldest.
- AC7.6 E2E: a guest's "Leave world": within 2 s the others' lists shrink and the figure
  disappears; the leaver is on the world list with `role` `off`.
- AC7.7 E2E: the host's "Close to others": within 2 s every guest is on the world list with
  the closed notice; the host plays on and its pause menu pauses again.
- AC7.8 E2E: the host's page is closed abruptly: every guest reaches `reconnecting` and
  then the world list with the lost notice within 17 s.
- AC7.9 E2E: `dropConnection()` on a guest while the host lives: the guest is `online`
  again within 10 s with the edits made meanwhile and the same bar (record).
- AC7.10 E2E: a fifth player sees "Room is full"; in a Gathering world "Open to others" is
  disabled with its reason.
- AC7.11 E2E: with a stubbed `navigator.wakeLock`, a lock is requested when a room is
  opened or joined and released when it ends; a rejecting stub logs nothing. The hosting
  hint shows in touch mode only.
- AC7.12 E2E: with the fake controller, a guest joins a listed room from the world menu and
  leaves it from the pause menu without mouse or keyboard.
- AC7.13 E2E (touch, 640 × 360): the join section and the room panel are fully reachable by
  scrolling; their buttons are at least 48 × 48 CSS px.
- AC7.14 Reference screenshots `join-section` and `room-panel` created; the changed
  references regenerated; all looked at.
- AC7.15 `README.md` "Playing together" (how to open, join, leave; what the Pi provides;
  troubleshooting: guest Wi-Fi, VPN, the network test). `CLAUDE.md`, `device-tests.md`
  (NET-5 to NET-12), `docs/phase-6b-report.md`. One pull request into `main`.

### Part C – Gathering together (steps 8–10)

### Step 8 – Guests in the host's save

`SAVE_FORMAT_VERSION = 2`: `WorldMeta` gets `guests`, a list of
`{ key, name, record, pose, moveMode, lastSeenMs }` (at most `GUESTS_MAX = 32`; the oldest
by `lastSeenMs` is dropped). Version 1 records load with an empty list (migration).

- AC8.1 Unit: a version 1 meta (the fixture of Part A of Phase 3 and one written by the last
  Phase 5 build) decodes into version 2 with no guests; every other field unchanged.
- AC8.2 Unit: encode → decode keeps guests; invalid entries (bad key, bad record) are
  dropped without making the world damaged; more than 32 keep the newest.
- AC8.3 Unit: the host stores a guest's record and pose when the guest leaves or is lost,
  and on every autosave while connected; a returning key gets them back in `welcome`.
- AC8.4 E2E: a guest changes its Creative bar and walks away, leaves, joins again: same bar,
  start pose where it left (within 0.1 blocks). Also after the host reloaded the world.
- AC8.5 E2E: a world saved by the Phase 5 build (fixture in IndexedDB) still opens.

### Step 9 – Gathering rules over the network

"Open to others" in Gathering worlds; the host clock; `breakTiming.ts`; the guest's clock
translation; `authority.ts` complete; stations on the host; rate limit.

- AC9.1 Unit: with seeded delays of 0–300 ms on each message, 500 guest breaks of various
  blocks and tools, each sent when the guest's own clock says the time is up, are all
  accepted; a `break` sent 600 ms early is refused `early`.
- AC9.2 Unit: tool gating, `full`, the torch carried with its support block and the drop
  of a carried torch work for a guest as in single-player (one test each).
- AC9.3 Unit: the authority cache holds at most 32 chunks; for 10 000 seeded positions with
  and without edits it reads the same block as a loaded chunk.
- AC9.4 Unit: a guest crafts at a workbench 300 blocks from the host (host's chunk not
  loaded); without the workbench it gets `station`.
- AC9.5 Unit: the 31st action within one second is refused `rate`; the next second accepts
  again.
- AC9.6 E2E: in a Gathering world a guest breaks a log with real input; the item arrives in
  the guest's inventory, not the host's; the host sees the block gone; the guest's break
  progress shows as in single-player.
- AC9.7 E2E: a guest crafts planks and a workbench, places it, crafts a pickaxe at it, and
  smelts at a furnace with the 2 s bar; the host's world has both stations.
- AC9.8 E2E: a guest places a torch on stone and breaks the stone: both disappear on both
  players, the torch is in the guest's inventory.
- AC9.9 E2E: a guest cannot fly in a Gathering world (key, touch button).

### Step 10 – Report and pull request

- AC10.1 `CLAUDE.md` (save format version 2, guests in the save, the host clock, the grace
  rule), `device-tests.md` (NET-13 to NET-16), `docs/phase-6c-report.md`. One pull request
  into `main`.

### Part D – Player figure (steps 11–13)

Precondition: Part C is merged. Read 5.14 and 5.15 first. Tests of Part B that check the
figure (AC6.2 "the host's colour dominates", AC6.6 "at most 4 draw calls", AC6.7, AC6.9)
are adapted to the new figure; say how in the report.

### Step 11 – Looks, texture, motion (pure)

`src/player/looks.ts`, `src/render/textures/figureTexture.ts`, `src/player/figureMotion.ts`,
the constants in `config.ts`, the identity record with `look`.

- AC11.1 Unit: `looks.test.ts` pins the table (ids 1–8, names, order). `lookForKey` gives
  1–8 and the same look for the same key; over 10 000 seeded random keys every look gets
  between 9 % and 16 %. `resolveLook` returns a choice of 1–8 unchanged and
  `lookForKey(key)` for 0, 9, −1, 2.5 and non-numbers.
- AC11.2 Unit: the painter is deterministic (a recorded checksum of the atlas, set once in
  this step; like the terrain checksum it changes only with an intended change of the
  looks, noted in the report). Every texel a part uses is opaque; every look has accent
  texels on the body; the head and body texels of any two looks differ in at least 20 %
  of their texels.
- AC11.3 Unit (motion, walking): a figure standing still has all limb angles 0; walking at
  walking speed the legs swing in opposite directions with an amplitude of at least 80 % of
  `FIGURE_LEG_SWING`, never more than it at any speed, with a step period that halves when
  the speed doubles; the arms swing against the legs; after stopping, all limb angles are
  below 0.01 rad within 200 ms; a snap of 20 blocks gives no swing.
- AC11.4 Unit (motion, head and body): the head's yaw relative to the body never exceeds
  45° (10 000 seeded random pose sequences); standing, a head turn of 30° leaves the body
  where it is, one of 90° turns it until 45° remain; walking, the body faces the walking
  direction within 0.5 s, and walking backwards it faces the head's direction; `fly`
  keeps the legs at 0.
- AC11.5 Unit (motion, swing): while `busy` the right arm swings with a period of 300 ms
  (± one frame); one block change starts exactly one swing; a block change during a
  swing starts no second one.
- AC11.6 Unit: 30 000 motion steps (three figures, 10 000 frames) take less than 20 ms
  (`expectFasterThan`); the step allocates nothing (it writes into an object it is given).
- AC11.7 Unit: an identity record of Part B (`{ key, name }`) parses with choice 0; an
  invalid `look` (9, −1, "3", 2.5) parses as 0; `{ key, name, look }` survives a round
  trip.

### Step 12 – The figure in the game and over the network

The protocol additions of 5.14, `HostSession` and `ClientSession` with looks, `profile`,
`busy` and `fly`; `RemotePlayers` rewritten; `Game` sets `busy`; the test API of 5.13.

- AC12.1 Unit: the new and changed messages survive encode → decode; the decoder rejects,
  without throwing, `look` 0, 9 or 2.5, `busy` or `fly` that are not booleans, a `profile`
  with an invalid name, and the 10 000 random strings of AC3.2.
- AC12.2 Unit (memory transport): every player's look reaches everyone in `welcome` and
  `joined`; a guest's `profile` reaches the host and all others within one relay, and the
  host's own profile change reaches all guests; a name taken in the room gets its suffix
  again and the sender learns it; the host's saved guest entry carries the new name;
  `profile` counts towards the rate limit.
- AC12.3 Unit: `busy` and `fly` reach every other player in `poses`; a change of `busy`
  alone is sent as a changed pose, an unchanged pose with an unchanged `busy` is not.
- AC12.4 E2E: each other player adds at most 2 draw calls (replaces AC6.6); with three
  guests the host's draw calls grow by at most 6.
- AC12.5 E2E: a guest walks forward for 60 steps; on the host, during the walk the
  guest's `anim` has leg angles of opposite sign and more than 0.2 rad, the pixels of the
  legs' region on the host's screen change between two frames 100 ms apart, and within
  0.5 s after the stop every limb angle is below 0.01 rad.
- AC12.6 E2E: the host, standing, turns by 90° and looks down 0.6 rad; on the guest the
  host's `anim.headYaw` is at most 45° off the body, the body has turned, and
  `anim.headPitch` is within 0.01 of the host's pitch.
- AC12.7 E2E: in a Gathering world a guest holds break on a log; on the host the guest is
  `busy` and its right arm angle changes sign at least twice within one second; in a
  Creative world one placed block gives one swing on the other player.
- AC12.8 E2E: a guest opened with `look=3` is listed with look 3 on the host and the
  projected region of its body on the host's screen is dominated by look 3's top colour;
  two guests with the same look have different accent colours (state), and the belt
  region shows each one's slot colour.
- AC12.9 E2E: AC6.7 for the new figure: at midnight in an unlit place it is at most a
  third as bright (linear) as at noon; next to a torch it is brighter than without.
- AC12.10 E2E: a page whose local storage holds an identity record of Part B joins with
  the look `lookForKey(key)`, and the record is not rewritten until something changes.
- AC12.11 References `remote-player`, `remote-player-night` regenerated and `figure-sheet`
  created; looked at: the figure upright on the ground, head, arms and legs in place,
  the look's colours and the belt visible, not glowing at night, the name readable; the
  sheet shows eight clearly different looks, none of them like a well-known figure of
  another game.

### Step 13 – "Your player", player list, report, pull request

`PlayerSection` on the settings page, the preview, the head icons in the room panel,
the URL parameter `look`.

- AC13.1 E2E (without `test=1`): the settings page from the world menu shows "Your
  player" with the name field, the preview and nine look buttons; choosing "Ember" marks
  it, `getState().player` reports it, and it survives a reload. A name typed there shows
  in "Join a world" and the other way round.
- AC13.2 E2E: while the section is visible, `ui.preview.frames` grows and two pictures of
  the preview 1 s apart differ; after closing the settings page `ui.preview` is null and
  the preview's WebGL context is gone (the page has one context again). With WebGL made
  unavailable for the preview (test option), the head icon shows and nothing is logged.
- AC13.3 E2E: during a room a guest changes its look and its name in the settings of its
  pause menu; within 2 s the host lists the new look and name, the host's room panel shows
  the new name and head icon, and the figure's name tag was drawn again.
- AC13.4 E2E: with the fake controller only, from the world menu: open the settings, move
  the focus to a look, A chooses it, B goes back; `ui.focus` reports "Look: …" on the way.
- AC13.5 E2E (touch, 640 × 360): the section is reachable by scrolling, the look buttons
  are at least 48 × 48 CSS px, and a tap chooses a look.
- AC13.6 E2E: playing single-player and running the quick performance test leave
  `markuscraft.player.v1` unset; choosing a look sets it.
- AC13.7 E2E: every row of the room panel's player list has the head icon of its
  player's look.
- AC13.8 References `player-section` created, `room-panel` and the changed settings and
  pause references regenerated; all looked at.
- AC13.9 Hard rule 1 checked for the proportions, the texture layout, the colours and the
  names of the looks (in the report). `README.md` ("Playing together": your look),
  `CLAUDE.md`, `device-tests.md` (NET-20 to NET-25), `docs/phase-6d-report.md`. One pull
  request into `main`.

### Part E – Measure and harden (steps 14–16)

### Step 14 – Overlay and hidden host

- AC14.1 E2E: the F3 overlay shows role, room code, player count, a numeric round-trip time,
  the candidate type and messages per second, on host and guest.
- AC14.2 E2E: with `suspendFrames(true)` on the host, a guest's edit is confirmed within
  2 s, guest A sees guest B move, and unfrozen time advances on the guests.
- AC14.3 E2E soak: four players; each performs 50 actions and moves; one guest leaves and
  rejoins midway. At the end all four `worldHash` values are equal, no page logged an error
  or warning, and the host's JS heap grew by less than 50 MB.
- AC14.4 E2E: a guest joins a host with 50 000 edits and has the host's `worldHash` within
  20 s.
- AC14.5 Node: validating and applying an action on the host takes less than 0.2 ms on
  average over 10 000 actions; one relay of 4 moving players less than 1 ms.
- AC14.6 Node: with 4 moving players the host sends less than 20 kB per second in total
  (measured in the memory transport; the number goes into the report).

### Step 15 – Performance test scenario `players`

Three simulated guests inside the page: `HostSession` with three `ClientSession`s over the
memory transport, driven by the scenario script (walk routes around the player, break and
place blocks at a fixed rate), with the figures of Part D drawn and animated (three
different looks, `busy` while breaking). Suite version 3.

- AC15.1 Unit: `scenarios.test.ts` pins the new scenario (id `players`, version 1, steps,
  script) and `BENCH_SUITE_VERSION = 3`; the guests' actions are the same in every run
  (seeded).
- AC15.2 E2E: the quick suite runs through with the new row; the record has the scenario;
  three figures were drawn during it (state).
- AC15.3 The run stays free of side effects as before (no save, no network: nothing
  outside the origin is requested during the run).

### Step 16 – Documentation, report, pull request

- AC16.1 Hard rule 1 checked for all texts of Part E (the figure was checked in Part D).
- AC16.2 `README.md` complete ("Playing together", what goes where: the Pi sees addresses
  and handshake data, players see each other's LAN addresses, game data goes directly).
  `CLAUDE.md` with Phase 6 complete, `device-tests.md` (NET-17 to NET-19, PERF line for the
  new scenario), `docs/phase-6e-report.md`. One pull request into `main`.

## 8. Risks and fallbacks

| Risk                                                                   | Fallback (decide without asking)                                                                                                                                                        |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WebRTC between contexts fails in CI although it works in the container | Add `--disable-features=WebRtcHideLocalIpsWithMdns` and `--allow-loopback-in-peer-connection` to the launch arguments; record what was needed                                           |
| The owner's NET tests of Part A fail at home                           | Part B does not start. The report of A lists what the test showed; the fix is in pi-infra (STUN, CORS, discovery, certificates) or the network, and the network test is repeated        |
| Discovery is off or unreliable on the Pi                               | The room code and join link work without it; the room list says so                                                                                                                      |
| Several software-rendered pages make tests slow or flaky               | 180 s timeout for multiplayer tests; three- and four-player tests serial; render distance 2                                                                                             |
| `peerjs` does not pass plain strings unchanged                         | Use its JSON serialisation, or send UTF-8 bytes; the `Connection` interface stays string-based                                                                                          |
| The local `peer` server behaves differently from the Pi's              | Keep to documented PeerJS behaviour (chosen ids, `unavailable-id`, `peer-unavailable`, `/peers`); the NET tests cover the Pi                                                            |
| A very large snapshot stalls the data channel                          | Send parts while watching `bufferedAmount`, keeping order with a per-guest queue that also holds later messages                                                                         |
| A hidden host tab's timers are throttled to once a minute              | By design the host needs no timer (5.1); the guest's ping drives heartbeat and time. If guests are still dropped, measure in the report                                                 |
| Wi-Fi jitter beyond the grace makes guests' breaks fail                | Raise `NET_BREAK_GRACE_MS` (a constant); the unit test of AC9.1 shows the margin                                                                                                        |
| Replacing the world in place for a guest proves fragile                | Use `Game.loadWorld` (it already swaps world, chunk manager, meshes, player and session); never reload the page                                                                         |
| The preview's own WebGL context fails or is lost on a phone            | The preview shows the head icon (5.15); the picker works without it. If creating it costs a visible hitch, create it once per page instead of per visit and record it                   |
| Animated figures cost too much on the phone (NET-24, Part E's numbers) | Figures farther than 32 blocks keep their last angles and skip the motion step; record it. The draw calls stay at two                                                                   |
| The new figure reads as a copy of a well-known one                     | Change proportions and colours until it does not (hard rule 1); the AC11.2 checksum is set again and the change is noted                                                                |
| Part D turns out larger than one session                               | Keep the order; do not cut tests. Cut in this order and record each cut: the head icons in the room panel (AC13.7), the live name change (keep the live look), the preview's walking    |
| Part B turns out larger than one session                               | Keep the order; do not cut tests. Cut in this order and record each cut: AC7.12 (controller join), the version message for codes of other builds (AC7.2, second half), "Copy join link" |

## 9. Tests on real devices (to be added to `docs/device-tests.md`)

A new section "Multiplayer (Phase 6)". All on the Pi's PR preview of the part. Wording may
be sharpened by the implementing session.

- **NET-1** (6A) PC and phone: the network test connects; note the candidate type,
  round-trip time and throughput ("Copy result").
- **NET-2** (6A) Phone and tablet, and tablet and PC: the same.
- **NET-3** (6A) The same pairs with "Use STUN" off: does it still connect?
- **NET-4** (6A) Each device lists the others under "Others testing now".
- **NET-5** (6B) Open a Creative world on the PC; join from phone and tablet through the
  room list. Build together for ten minutes: do edits appear at once, does anything
  differ?
- **NET-6** (6B) Join with a room code typed on the phone, and with the join link.
- **NET-7** (6B) The figures and name tags: readable, moving smoothly, at night?
- **NET-8** (6B) Host on the tablet, the phone and the PC join. Lock the tablet's screen:
  what do the others see?
- **NET-9** (6B) Minimise the host's browser on the PC for a minute: can the others go on
  building?
- **NET-10** (6B) Turn Wi-Fi off on a guest phone for 5 s and on again; and for 30 s.
- **NET-11** (6B) Join and leave with a controller only.
- **NET-12** (6B) Frame rate with four players on the phone (F3 or the feel).
- **NET-13** (6C) A Gathering world: two players gather, craft and smelt; do breaks ever
  fail ("Too early")?
- **NET-14** (6C) Leave and rejoin: are your items and your place back? After the host
  closed and reopened the world?
- **NET-15** (6C) Two players far apart (300 blocks) both break and craft.
- **NET-16** (6C) Torches placed and broken by a guest look the same on all devices.
- **NET-17** (6E) The F3 network lines on host and guest during play.
- **NET-18** (6E) Performance test with the new scenario on PC, phone and tablet (PERF
  tests).
- **NET-19** (6E, optional) A second browser (Firefox) as guest.
- **NET-20** (6D) The eight looks on "Your player" and as figures a few blocks away: are
  they clearly different, do they look good, does any of them remind you of a figure from
  another game? Do two players with the same look stay apart by the belt and the name
  tag stripe?
- **NET-21** (6D) Animation of another player: walking, running into a wall, jumping,
  flying, standing and looking around (does the body follow the head naturally?), looking
  up and down, breaking in Gathering (the arm swings all the time) and placing (one
  swing). Anything jerky or odd?
- **NET-22** (6D) "Your player" with mouse, touch (phone and tablet) and the controller:
  choose a look and type a name; does the preview turn smoothly, is every look button
  easy to hit, is the choice still there after a reload?
- **NET-23** (6D) During a room, change look and name in the pause menu's settings: do
  the others see the new figure, name tag and player list entry within a second?
- **NET-24** (6D) Frame rate on the phone with three animated figures in view (four
  players), compared with single-player and with Part B's figures if you remember them
  (F3 or the feel).
- **NET-25** (6D) At night: is a figure in the dark dark, lit next to a torch, and its name
  tag readable?

## 10. Notes for later phases

- **A dedicated host on the Pi** (later phase): run `HostSession` in Node with `World`, a
  file-based `WorldStore` and a WebRTC library for Node (or a WebSocket transport through
  the Pi, since the Pi is on the LAN anyway). The host's own player becomes optional; the
  world's owner would no longer need to be online.
- **Personalization (Phase 7):** the figure of Part D is one class (`RemotePlayers`) with a
  table of looks (`looks.ts`) and a pure painter (`figureTexture.ts`). A free character
  editor would replace the table entry by stored parameters sent in `profile`; the held
  item and other players' cracks extend `RemotePlayers`. Names and looks already travel in
  the protocol.
- **Moving worlds between sites:** an export/import of one world file would let worlds go
  from GitHub Pages or a PR preview to the Pi's main build.
- **Internet play** would need TURN or a relay and is a separate decision.
