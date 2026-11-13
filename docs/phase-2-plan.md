# Phase 2 plan – Multiplayer and touch controls

> **Status (November 2026):** Part A (touch controls) is implemented and merged. Part B
> (multiplayer) was postponed by the owner: it becomes Phase 4 and will be re-planned on
> top of the Phase 3 gameplay (`docs/phase-3-plan.md`). Do not implement Part B from this
> document; it stays here as reference.

Read `CLAUDE.md` and `docs/phase-1-report.md` first. This plan is executed autonomously:
do not ask the owner questions. Where this plan leaves a detail open, choose the simplest
option and note it in the report of the part being implemented.

**The phase has two parts, each implemented in its own cloud session with its own branch,
report and pull request:**

| Part | Content        | Steps | Report                    | Starts when                           |
| ---- | -------------- | ----- | ------------------------- | ------------------------------------- |
| A    | Touch controls | 1–3   | `docs/phase-2a-report.md` | Now, from `main`                      |
| B    | Multiplayer    | 4–12  | `docs/phase-2b-report.md` | After Part A's pull request is merged |

A session implements exactly one part; the owner's starting prompt says which. The
Definition of Done in `CLAUDE.md` applies to each part separately. The owner merges Part A
and tests it on real devices from GitHub Pages while Part B is being implemented.

Rules for Part B:

- Precondition: `src/input/TouchControls.ts` exists on the session's branch (Part A is
  merged). If it does not, write that into `docs/phase-2b-report.md`, commit it and stop.
- Read `docs/phase-2a-report.md` first.
- Do not change touch behaviour beyond what the Part B criteria require. Fixes from the
  owner's touch testing are handled in separate small sessions.
- Before opening the pull request, merge the current `main` into the branch (touch fixes
  may have landed) and run `npm run check:all` again.

## 1. Goal

Up to four players build together in one world. One player opens their current world to
others and gets a short room code; the others join with that code or a join link. The
host's browser tab is the authority for block edits and the time of day. Connections are
set up through a public signaling service and then carry game data directly between the
browsers (WebRTC data channels). The game stays a static site without an own server, and
single-player works exactly as in Phase 1 without any network access.

The game also becomes playable on Android phones and tablets with on-screen touch
controls, because those are the devices the owner's fellow players use. Touch controls are
built first, so they are usable in single-player even before multiplayer exists.

The networking is the foundation of Phase 3 (gathering, crafting, inventory): every change
to the world is a game action that the host validates, in single-player too.

## 2. Decisions made with the owner

| Topic              | Decision                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base game          | The Phase 1 creative game: flying, unlimited blocks, instant break and place                                                                     |
| Topology           | Star: every guest connects only to the host; the host relays                                                                                     |
| Signaling          | `peerjs` library with its free public server; behind a small interface, server address configurable                                              |
| Helper servers     | One public STUN server; no TURN relay, so game data never passes a third party                                                                   |
| Authority          | Host validates and applies all block edits and owns the time of day. Each client owns its own position and look direction                        |
| Edits on guests    | Applied only after the host confirmed them (no prediction, no rollback)                                                                          |
| Hosting            | "Open world to others" from the menu, at any time, for the world that is currently loaded                                                        |
| Joining            | 6-character room code, or a join link `?join=CODE`. Joining replaces the guest's current world                                                   |
| Player limit       | 4 including the host                                                                                                                             |
| Host leaves / drop | Guests try to reconnect for 10 s, then keep their copy of the world as a single-player game; any of them can open it again under a new room code |
| Other players      | Placeholder figure in one of four colours with a name tag; no collision between players                                                          |
| Pause              | The menu does not pause the world while a room is open or joined; in single-player it pauses as before                                           |
| Extras             | Name field, player list, join/leave notices, network lines in the debug overlay, world consistency check, reload confirmation                    |
| Touch devices      | Android phone and tablet with Chrome, landscape. Stick to move, drag to look, buttons for break, place, up, down, fly and menu                   |
| Touch hosting      | Allowed; the menu hints that the room closes when the device locks or the browser is left                                                        |
| Delivery           | Two parts with separate sessions and pull requests: A touch controls, B multiplayer (see the top of this plan)                                   |
| Browsers           | Desktop Chrome, Edge, Firefox; Chrome on Android. Safari (macOS, iPhone, iPad) best effort. Automated tests run on Chromium only                 |

### Why PeerJS

Three options were compared:

| Criterion       | PeerJS + public PeerJS server                                             | Trystero (public Nostr relays)        | Public MQTT broker + own signaling               |
| --------------- | ------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------ |
| Reliability     | One donation-funded server, no SLA, occasional slowdowns reported         | Many relays, no single operator       | Public test brokers are not meant for production |
| Limits          | None published                                                            | Per relay, not published              | Connection and rate caps per broker              |
| Privacy         | Server sees IP addresses and handshake data, never game data              | Handshake on public relays, encrypted | Topics readable by anyone unless encrypted by us |
| Dependency      | `peerjs` (88 kB minified), loaded only when multiplayer is used           | `trystero`                            | `mqtt` (large) or a hand-written client          |
| Fit             | Host/client with a chosen ID: the room code is the host's ID              | Built for full-mesh rooms             | Neutral, most own code                           |
| Local test stub | Official `peer` server as dev dependency; verified in the cloud container | Needs a local relay; not verified     | Needs a local broker; not verified               |

PeerJS needs the least code and is the only option whose test setup was verified during
planning (two headless Chromium contexts connected through a local `peer` server in about
60 ms, without browser flags). Its weakness is the single public server. Mitigation: all
signaling sits behind the `Signaling` interface (4.3), and the server address can be
changed in `config.ts` or with the `signal` URL parameter.

## 3. Changes to the original scope

The owner's starting scope was challenged during planning. Agreed changes:

| #   | Change                                                                                                                                                             | Reason                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "The host is authoritative" is narrowed: the host decides block edits and time; each client owns its position and look direction. The host only sanity-checks them | Host-simulated movement needs prediction and reconciliation, the largest risk in game networking. Its only gain is cheat protection, irrelevant for a creative game among acquaintances |
| 2   | Hosting is not a separate mode chosen at start but "open my current world to others", available at any time                                                        | Makes single-player and host one code path, and makes change 3 nearly free                                                                                                              |
| 3   | When the host is gone, guests keep their copy of the world and can open it again. No host migration                                                                | Every guest already holds seed and all edits. Without saving (Phase 3) the world would otherwise die with the host's tab                                                                |
| 4   | Fixed limit of 4 players                                                                                                                                           | Keeps relay load and test effort bounded; a full room is covered by automated tests                                                                                                     |
| 5   | A public STUN server is used, a TURN relay is not                                                                                                                  | STUN makes connection setup more robust and lets internet play work on many connections. A relay would route game data through a third party, against the peer-to-peer goal             |
| 6   | Added: join link `?join=CODE`                                                                                                                                      | Easier than typing a code on a second device                                                                                                                                            |
| 7   | Added: player list in the menu and join/leave notices                                                                                                              | Players need to see who is connected; gives tests visible facts                                                                                                                         |
| 8   | Added: network lines in the F3 overlay                                                                                                                             | Diagnosing problems at home                                                                                                                                                             |
| 9   | Added: world consistency check on joining, and an engine-independent gradient table in the noise                                                                   | `Math.sin`/`Math.cos` are not guaranteed bit-identical across browser engines; terrain could differ silently between e.g. Chrome and Safari                                             |
| 10  | Added (implied by the scope): player name field; menu does not pause a networked world; reload confirmation while networked; 10 s automatic reconnect              | Name tags need names; a paused or reloaded host must not freeze or destroy the world for everyone                                                                                       |

| 11 | Added: touch controls for Android phones and tablets, moved here from Phase 3 and built before the multiplayer steps | The owner's second devices are phones and tablets; without touch controls multiplayer could not be tried or used at home |
| 12 | Touch devices may host; a hint explains the risk. The screen is kept awake while a room is open or joined | Two tablets without a computer should be able to play; a locked screen suspends the tab and would close the room |
| 13 | The phase is delivered in two parts with separate pull requests: touch controls first, multiplayer after it is merged | The game is deployed from `main` only, so touch controls must be merged before they can be tried on a phone; the owner tests them while multiplayer is implemented |

Clarifications of the original scope, stated so nobody is surprised:

- **Internet is needed to connect.** All devices need it to load the page and to reach the
  signaling server. Only the game data stays in the local network. Once players are
  connected, a signaling outage does not affect them.
- **The real public services are never contacted by automated tests.** Cloud sessions
  cannot reach them. The first test against the public PeerJS and STUN servers is the
  owner's manual test (list in the report).
- **Nothing is saved.** A world lives only in open tabs until Phase 3 adds persistence.

## 4. Out of scope (do not build)

Saving and loading, inventory and item counts, crafting, timed breaking, survival
mechanics, gamepad controls, a portrait layout, customisable touch layouts, haptic
feedback, installing as an app (PWA), support promises for iPhone and iPad, text or voice chat, TURN relays, an own server,
accounts or passwords, host migration, kicking or banning players, spectator mode,
collision between players, player animations (walk cycle, arm swing), a real character
design, showing which block another player holds, movement prediction or lag compensation,
cheat protection beyond the checks listed in 5.4, Web Workers, sound. Internet play
outside the LAN is not a goal and is not tested.

## 5. Specification

All numbers are starting values in `src/game/config.ts` and may be tuned; record changes
in the report. Acceptance criteria refer to the final values.

### 5.1 Architecture

```
src/net/                 pure core (no three, no DOM, no peerjs); unit-tested in Node
  protocol.ts            message types, PROTOCOL_VERSION, encode/decode with validation
  actions.ts             game actions and validateAction() → block changes or a reason
  roomCode.ts            generate, normalise and validate room codes; player names
  snapshot.ts            split the edit log into parts and join them again
  transport.ts           Connection and Signaling interfaces
  memoryTransport.ts     in-memory implementation with seeded delays, for tests
  Session.ts             Session interface + LocalSession (single-player)
  HostSession.ts         authority: players, validation, relay, time, heartbeats
  ClientSession.ts       guest state machine: connect, sync, play, reconnect, end
  interpolation.ts       buffered poses of remote players → pose at render time
src/input/TouchControls.ts  touch source for Input: stick, look area, buttons
src/ui/TouchHud.ts          on-screen stick and buttons
src/game/peerTransport.ts   Signaling implemented with peerjs (dynamic import)
src/render/RemotePlayers.ts figures and name tags
src/ui/                  multiplayer section of the menu, Notices.ts, overlay lines
scripts/signalServer.mjs local signaling stub for tests and development
e2e/multiplayer.ts       helper that opens several players in separate contexts
```

- `src/net/` joins the pure core: add it to the ESLint boundary rule (also forbidding
  `peerjs`) and to the coverage scope. Time reaches it as a parameter (`nowMs`).
- **One pipeline.** `Game` no longer changes blocks for player actions itself. It hands
  actions to a `Session`:
  - `LocalSession` validates and applies synchronously. Single-player behaves exactly as
    in Phase 1.
  - `HostSession` does the same and broadcasts the result.
  - `ClientSession` sends the action and applies the result when the host confirms it.
- **Host logic is event-driven.** The host validates, applies and relays inside message
  handlers and a 1 s timer, never inside the render loop. Browsers stop
  `requestAnimationFrame` in hidden tabs; a hidden or minimised host must keep serving.

### 5.2 Rooms and connection setup

- Room code: 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no I, O, 0, 1),
  generated with `crypto.getRandomValues`. Input is normalised: upper-cased, spaces and
  hyphens removed. The host's signaling ID is `markuscraft-<PROTOCOL_VERSION>-<CODE>`. If
  the ID is taken, a new code is generated (up to 5 times).
- Signaling server: the PeerJS default (public server) unless overridden by
  `SIGNALING_URL` in `config.ts` or the URL parameter `signal=<url>`, for example
  `signal=http://127.0.0.1:9000/` (protocol decides TLS).
- ICE servers: `stun:stun.l.google.com:19302`. No TURN. With `test=1` the list is empty.
- One reliable, ordered data channel per guest. Messages are JSON text.
- `peerjs` is loaded with a dynamic `import()` the first time a room is opened or joined.
  Until then the page makes no request outside its own origin.
- Timeouts: joining fails after `JOIN_TIMEOUT_MS = 15000`.
- If the host loses the signaling server, existing connections keep working; the host
  retries the signaling connection every 5 s so new players can join again.

### 5.3 Protocol

Every message is `{ t: <type>, ... }`. `PROTOCOL_VERSION = 1`. The decoder validates
every field of every incoming message (types, finite numbers, integer ranges, string
lengths, total size ≤ `MAX_MESSAGE_BYTES = 65536`) and never throws. A peer that sends
`MAX_PROTOCOL_ERRORS = 20` invalid messages is disconnected.

| Direction    | Message        | Content                                                                                           |
| ------------ | -------------- | ------------------------------------------------------------------------------------------------- |
| guest → host | `hello`        | protocol version, player name                                                                     |
| host → guest | `reject`       | reason: `full`, `version`; then the connection closes                                             |
| host → guest | `welcome`      | own player id and colour slot, seed, time, frozen flag, terrain checksum, players, snapshot parts |
| host → guest | `snapshot`     | part number and edits of some chunks                                                              |
| host → guest | `ready`        | snapshot complete                                                                                 |
| guest → host | `action`       | sequence number, action kind and its fields                                                       |
| host → guest | `actionResult` | sequence number, ok or a reason; only to the sender                                               |
| host → all   | `blocks`       | block changes `(x, y, z, id)` and the id of the player who caused them                            |
| guest → host | `pose`         | x, y, z, yaw, pitch, teleport flag                                                                |
| host → guest | `poses`        | poses of all other players that changed                                                           |
| host → all   | `playerJoined` | id, name, colour slot                                                                             |
| host → all   | `playerLeft`   | id                                                                                                |
| host → all   | `time`         | time of day, frozen flag                                                                          |
| both         | `ping`, `pong` | timestamp of the sender; used for the heartbeat and the round-trip time                           |
| both         | `bye`          | deliberate leave or room closed                                                                   |

Phase 3 extends this without changing the envelope: new action kinds (start/stop
breaking, craft, move item), new result payloads, and per-player state in `welcome`.

### 5.4 Actions and validation

- Phase 2 action kinds: `break {x, y, z}` and `place {x, y, z, block}`.
- `validateAction(world, actor, players, action)` is one pure function used by all three
  session types. It returns block changes or a reason. Rules:
  - coordinates are integers within the height range;
  - the block centre is within `REACH + REACH_TOLERANCE` (5 + 1.5) of the actor's eye,
    using the last pose the host knows (the tolerance covers pose lag);
  - `break`: the Phase 1 rules (`breakResult`), including the water rule;
  - `place`: the block id is one of the placeable blocks, the cell is replaceable, and the
    cell intersects no player's box (the actor's or anyone else's).
- The host must validate in chunks it has not loaded. `World` gets an authoritative read
  that returns terrain plus edits for any position, using a small cache of generated
  chunk data (`AUTHORITY_CACHE_CHUNKS = 32`) separate from the loaded chunks.
- A guest runs the same validation locally before sending, to avoid pointless requests,
  but changes its world only when `blocks` arrives.
- Rate limit: more than `ACTION_RATE_LIMIT = 30` actions per second from one guest are
  rejected with reason `rate`.
- Simultaneous actions on the same cell are decided by arrival order at the host.
- Pose checks on the host: finite numbers, `|x|, |z| ≤ 30 000 000`, `-64 ≤ y ≤ 512`,
  pitch clamped. Invalid poses are dropped.

### 5.5 Joining and the snapshot

1. The guest connects, sends `hello`.
2. The host answers `reject`, or `welcome` followed by all `snapshot` parts and `ready`,
   queued in one go so no later `blocks` message can overtake them. A part is at most
   `SNAPSHOT_PART_BYTES = 16384` long.
3. The guest replaces its world: new seed, the received edits, the host's time. Terrain is
   generated locally from the seed. The guest appears at the world's spawn point. This
   happens in place, without a page reload, and frees the old chunk meshes.
4. The host announces `playerJoined` to everyone else.

Duplicate names get a suffix (`Anna (2)`). Names are 1–16 characters after trimming and
removing control characters; an empty name becomes `Player <4 digits>`.

**Consistency check.** `welcome` carries a checksum (32-bit FNV-1a) over the generated
block data of the 3 × 3 chunks around the origin. The guest computes the same; on a
mismatch it still joins but shows a lasting notice: "Your browser generates this world
differently from the host's. Some blocks may not match." To make a mismatch unlikely, the
noise gradient table is written with literal values (0, ±0.5, ±√3/2 via `Math.sqrt`, ±1)
instead of `Math.sin`/`Math.cos`.

### 5.6 Players and movement

- Each client simulates its own player as in Phase 1 and sends its pose at
  `POSE_SEND_HZ = 20`, only while it changes. A teleport (respawn, test API) sets the
  teleport flag.
- The host relays changed poses at 20 Hz, bundled per recipient, never back to the sender.
- Remote players are drawn `INTERP_DELAY_MS = 100` in the past, linearly interpolated
  between received poses. If no newer pose exists, the last one is held. A jump of more
  than `SNAP_DISTANCE = 8` blocks or a teleport flag snaps.
- Figure: a body box and a head box, 1.8 blocks tall and 0.6 wide like the collision box,
  in the player's colour (4 fixed colours by slot), with a darker face side on the head.
  The figure turns with yaw, the head tilts with pitch. It is shaded by the daylight
  factor and fogged like terrain. Colours are code, no image files.
- Name tag: the name on a dark rounded plate above the head, always facing the camera,
  hidden by terrain, drawn from a canvas texture created at runtime.
- The own figure is not drawn. Players do not collide with each other.

### 5.7 Time of day

- In a networked session the host's clock is authoritative and advances by wall-clock
  time (`tick(nowMs)` from the frame loop and from the 1 s timer), so it continues while
  the host's tab is hidden or the host's menu is open.
- The host sends `time` every `TIME_SYNC_INTERVAL_MS = 5000` and immediately when the time
  is set. Guests advance locally in between and adopt the host's value on arrival.
- `freeze=1` on the host freezes time for everyone.
- Single-player time is unchanged: advanced by simulation steps, paused by the menu.

### 5.8 Leaving, drops and reconnecting

- Heartbeat: `ping` every `PING_INTERVAL_MS = 1000`. A peer that sent nothing for
  `HEARTBEAT_TIMEOUT_MS = 5000` counts as lost.
- **Guest leaves** ("Leave world" or closing the tab, which sends `bye` on `pagehide`):
  the host removes the player, the others see "<name> left". The leaver keeps the world
  as a single-player game.
- **Guest is lost** (timeout): same for the others.
- **Host closes the room** ("Close room" or closing the tab): guests receive `bye`, show
  "The host closed the world. You keep a copy and can open it to others.", and continue in
  single-player with all edits. No reconnect attempts.
- **Host is lost** without `bye` (crash, sleep, network): each guest shows "Connection
  lost. Reconnecting…" and retries the same room code every 2 s for
  `RECONNECT_WINDOW_MS = 10000`. While reconnecting, the player can move but actions are
  not sent or applied. On success the guest joins afresh (full snapshot, new player id).
  On failure it continues as after a closed room.
- **Re-hosting**: "Open world to others" works in any single-player state, so a former
  guest can open the kept copy under a new room code and the others join it.
- While a room is open or joined, a `beforeunload` handler asks the browser to confirm
  leaving the page.

### 5.9 UI

Start/pause screen, new section "Multiplayer":

- Name field (stored in `localStorage` with the settings).
- Offline: button "Open world to others"; code field with "Join" button. If the current
  world has edits, "Join" needs a second click on "Join and discard my world".
- Hosting: the room code in large type, "Copy join link", player list, "Close room".
- Joined: room code, player list, "Leave world".
- Player list: colour, name, markers "(host)" and "(you)".
- A status line for progress and errors: "Connecting…", "Room not found", "Room is full",
  "Different game version. Reload the page on both devices.", "Could not reach the
  connection service. Check the internet connection."
- A page opened with `?join=CODE` shows "Join world CODE" as its main button.

In game:

- Notices at the top left: "<name> joined", "<name> left", connection messages. Each
  disappears after `NOTICE_MS = 5000`; at most 4 are shown.
- While networked, Esc opens the menu without pausing: the world, time and other players
  continue, and the own player receives no input.
- F3 overlay, additional lines: role, room code, player count, round-trip time to the
  host, connection type (direct or not, from the WebRTC statistics), signaling state.

### 5.10 URL parameters

| Parameter      | Effect                                                                          |
| -------------- | ------------------------------------------------------------------------------- |
| `join=<code>`  | Offers to join that room; with `test=1` joins immediately                       |
| `name=<text>`  | Player name for this visit (overrides the stored one, is not stored)            |
| `touch=1`      | Forces touch mode (shows the touch controls without a touch on the play button) |
| `signal=<url>` | Signaling server to use instead of the default                                  |

### 5.11 Touch controls

- **Mode.** The game runs in mouse mode or touch mode. Activating the play button by
  touch selects touch mode, by mouse selects mouse mode; `touch=1` forces touch mode. In
  touch mode there is no pointer lock: "Tap to play" hides the menu, the menu button
  opens it.
- **Input.** Pointer events with `pointerType` `touch`; at least three simultaneous
  touches (stick, look, one button). `TouchControls` feeds the existing `Input`
  abstraction, so the game logic sees the same held and press actions as on desktop.
- **Layout** (landscape):

  ```
  +--------------------------------------------+
  | [menu]                             [fly]   |
  |                                            |
  |                     +                      |
  |                                     [up]   |
  |   ( o )                      [break]       |
  |   stick                  [place]  [down]   |
  |        [1][2][3][4][5][6][7][8][9]         |
  +--------------------------------------------+
  ```

- **Stick** (left): appears where the left thumb touches the lower left half; analog
  direction, dead zone `TOUCH_STICK_DEADZONE = 0.15`, radius `TOUCH_STICK_RADIUS = 60` px.
  Pushed beyond `TOUCH_SPRINT_THRESHOLD = 0.9` the player sprints. `MoveInput.forward` and
  `strafe` become analog values in [-1, 1].
- **Look**: dragging anywhere on the right half that is not a button; own sensitivity
  setting "Touch sensitivity" in the menu.
- **Buttons**: `break` and `place` act on the block at the crosshair and repeat while
  held, exactly like the mouse buttons. `up` jumps when walking and rises when flying or
  swimming; `down` descends when flying; `fly` toggles fly mode; `menu` opens the menu.
  Tapping a slot of the block bar selects it.
- **Sizes**: every touch target is at least 48 × 48 CSS px; sizes scale with the shorter
  screen side so the layout fits a 640 × 360 phone and a 1280 × 800 tablet.
- **Portrait**: an overlay asks to rotate the device; the game is not playable in portrait.
- **Browser gestures** are suppressed on the game: no page zoom, scroll, text selection,
  long-press menu or pull-to-refresh (`touch-action: none`, viewport meta, `contextmenu`).
- **Menu in touch mode**: a "Fullscreen" button (Fullscreen API), a "Debug overlay"
  switch replacing F3, and the controls list shows the touch controls.
- **Defaults in touch mode**: render distance `TOUCH_RENDER_DISTANCE_DEFAULT = 5` when no
  setting is stored; device pixel ratio capped at `TOUCH_PIXEL_RATIO_MAX = 1.5`.
- **Multiplayer on touch devices**: all menu functions work by touch and with the
  on-screen keyboard. While hosting in touch mode the menu shows: "This room closes if
  the screen locks or you leave the browser. A computer is the more reliable host."
- **Screen wake lock**: while a room is open or joined, the page requests a screen wake
  lock (any device), re-requests it when the page becomes visible again, and ignores
  failures silently.
- All button symbols are drawn by code (CSS or canvas); no image or font files.

## 6. Test strategy

The rules of Phase 1 stay in force: unit tests in Node, browser tests against the
production build, state-based waiting, console hygiene, rule-based checks plus reference
screenshots, review of screenshots by eye.

### 6.1 Layers

1. **Unit tests** for all of `src/net/` with the in-memory transport: one host and up to
   three guests in one Node process, a fake clock, seeded message delays. Coverage scope
   and the 85 % threshold are extended to `src/net/`.
2. **Browser tests with several players.** `e2e/multiplayer.ts` opens each player in its
   own browser context and attaches the console-hygiene checks to every page. All
   contexts talk to a local signaling stub; no test contacts an external host.
3. **Rule-based visual checks** for figures and name tags, and two new reference
   screenshots.

### 6.2 Local signaling stub

`scripts/signalServer.mjs` starts the official `peer` server (dev dependency) on
`127.0.0.1:9000`. Bind to `127.0.0.1` explicitly: the cloud container has no IPv6 and the
default bind address fails. Playwright's `webServer` becomes a list (preview server and
stub). Tests pass `signal=http://127.0.0.1:9000/`. Room codes are random per test, so
parallel tests share the stub safely. Add `npm run signal` to start the stub for manual
two-tab testing with `npm run dev`.

### 6.3 Test API additions

`getState().net`:

```
{ role: 'off' | 'host' | 'guest',
  status: 'offline' | 'connecting' | 'syncing' | 'online' | 'reconnecting',
  roomCode: string | null, selfId: number | null,
  players: [{ id, name, slot, self, host, x, y, z, yaw, pitch, renderX, renderY, renderZ }],
  rttMs: number | null, editCount: number, worldHash: number,
  lastError: string | null, notices: string[] }
```

`worldHash` is an order-independent hash of the edit log; equal hashes on all players mean
equal worlds. New members:

| Member                     | Purpose                                                                    |
| -------------------------- | -------------------------------------------------------------------------- |
| `net.host(options?)`       | Opens a room; resolves with the code. In test mode a fixed code can be set |
| `net.join(code, options?)` | Joins; resolves when synced, rejects with the error reason                 |
| `net.leave()`              | Leaves or closes the room                                                  |
| `net.sendAction(action)`   | Sends an arbitrary action, bypassing the local pre-check                   |
| `net.dropConnection()`     | Kills the transport without `bye` (simulates a crash or network loss)      |
| `suspendFrames(on)`        | Makes the frame loop skip all work (simulates a hidden tab)                |

`setBlock` on a host is broadcast like a host edit; on a guest it throws. `step(n)` still
advances only the own simulation; network messages are processed whenever they arrive.
Tests wait with polling on `getState()`, never with fixed sleeps.

### 6.4 Reference screenshots

- `remote-player` – a guest's view of the host's figure with name tag at a fixed pose, noon.
- `multiplayer-menu` – the menu while hosting with two players and a fixed room code.
- `pause-screen` is regenerated because the menu gains a section.

Screenshots containing text may use `maxDiffPixelRatio` 0.05 as in Phase 1. The seven
WebGL references of Phase 1 must still match without regeneration after steps 5 and 9; if
the gradient table change (step 5) moves pixels beyond the tolerance, regenerate, review
and record it.

### 6.5 Touch tests

Touch tests run in Chromium contexts with `hasTouch: true` and `isMobile: true`. Touch
sequences with several fingers are sent through the DevTools protocol
(`Input.dispatchTouchEvent`), wrapped in helpers in `e2e/touch.ts` (`touchDown`,
`touchMove`, `touchUp` with a finger id). Behaviour tests use `test=1&touch=1` at the
fixed 960 × 540 view; layout tests run without `test=1` at 640 × 360 and 1280 × 800. New
reference screenshot: `touch-controls` (game view with the touch HUD).

### 6.6 Limits of automation

Not automatable in the cloud session and therefore listed in the report for the owner:
the public PeerJS and STUN servers, two real devices in one Wi-Fi, other browser engines,
a really hidden or sleeping host tab, real Android devices (feel of the stick and look
sensitivity, frame rate, on-screen keyboard, fullscreen, wake lock), iPhone and iPad.

## 7. Implementation steps

Work in order within the part. After each step: `npm run check:all` passes, commit, push.
All acceptance criteria (AC) are verified by automated tests unless marked _(manual)_.
Tests name their AC in the title.

### Part A – Touch controls (steps 1–3)

### Step 1 – Touch movement and look

`TouchControls` as a second source for `Input`, mode selection, the stick, the look area,
analog movement, menu flow without pointer lock.

- AC1.1 Unit: stick deflection maps to analog `forward`/`strafe` with the dead zone;
  beyond the sprint threshold `sprint` is set; releasing returns to zero. Walking speed
  scales with deflection (half deflection gives 50 % ± 10 % of walking speed).
- AC1.2 E2E (touch): holding the stick forward for 60 steps moves the player along the
  facing direction; dragging on the right half changes yaw and pitch with the same signs
  as the mouse; pitch stays clamped.
- AC1.3 E2E (touch): stick and look drag work at the same time with two fingers.
- AC1.4 E2E (touch, without `test=1`): tapping "Tap to play" starts the game without
  pointer lock and shows the touch HUD; the `menu` button opens the menu and pauses.
- AC1.5 E2E: in mouse mode no touch control is in the DOM, and all Phase 1 tests pass
  with unchanged assertions.

### Step 2 – Touch buttons and block bar

`TouchHud` with `break`, `place`, `up`, `down`, `fly`, and the tappable block bar.

- AC2.1 E2E (touch): `break` removes the block at the crosshair and `place` puts the
  selected block there; holding `break` for 40 steps breaks at least two blocks.
- AC2.2 E2E (touch): `up` jumps in walk mode; `fly` switches the mode; `up` and `down`
  change height in fly mode.
- AC2.3 E2E (touch): tapping slot 5 of the block bar selects slot 5.
- AC2.4 E2E (touch): three fingers at once: the stick moves the player, a drag turns the
  view and `break` breaks the targeted block.
- AC2.5 E2E (touch): a drag that starts on a button does not turn the view, and a finger
  on the stick or in the look area triggers neither `break` nor `place`.

### Step 3 – Phone and tablet adaptation

Scaling layout, portrait overlay, gesture suppression, fullscreen, touch defaults, menu
additions for touch mode.

- AC3.1 E2E: at 640 × 360 and at 1280 × 800 every touch control and every menu button is
  inside the viewport, at least 48 × 48 CSS px, and no two controls overlap.
- AC3.2 E2E: in a portrait viewport (360 × 640) the rotate overlay is visible and the
  simulation is paused; back in landscape it disappears.
- AC3.3 E2E (touch): a two-finger pinch and a vertical swipe on the game change neither
  the page zoom (`visualViewport.scale` stays 1) nor the scroll position; a long press
  opens no context menu.
- AC3.4 E2E (touch): the menu shows "Fullscreen", "Debug overlay" and "Touch
  sensitivity"; the debug switch shows the overlay; doubling the sensitivity doubles the
  yaw change of the same drag (± 5 %); the controls list names the touch controls.
- AC3.5 E2E (touch): without stored settings the render distance is 5 and the renderer's
  pixel ratio is at most 1.5; a stored render distance wins.
- AC3.6 Hygiene: no image or font file was added for the controls.
- AC3.7 Reference screenshot `touch-controls` created and reviewed by eye: controls do not
  cover the crosshair or the block bar, symbols are recognisable.

- AC3.8 `README.md` explains the touch controls and names the supported devices.
- AC3.9 `CLAUDE.md` is updated: structure, URL parameter `touch=1`, touch testing, status
  "Phase 2 part A: implemented".
- AC3.10 `docs/phase-2a-report.md` is written per the Definition of Done, including the
  manual test list for the owner on the Android phone and tablet: feel of the stick and
  the look sensitivity, reachability of the buttons, frame rate at render distance 5,
  fullscreen, rotate overlay, pinch and pull-to-refresh and long press doing nothing.
- AC3.11 CI is green on the final commit and one pull request into `main` is open.

### Part B – Multiplayer (steps 4–12)

### Step 4 – Tooling and connection proof

Add `peerjs` (runtime) and `peer` (dev). Create the signaling stub, the Playwright
`webServer` list, `npm run signal`, the ESLint boundary and coverage scope for `src/net/`.
Prove the pipeline with a test that does not use game code yet.

- AC4.1 A Playwright test opens two browser contexts, loads the `peerjs` browser bundle
  into both, connects them through the local stub and exchanges a message in both
  directions within 10 s.
- AC4.2 The CI run of the step-4 commit is green, proving WebRTC between contexts works on
  GitHub Actions (check through the GitHub tools).
- AC4.3 ESLint fails when a file under `src/net/` imports `three` or `peerjs` or uses
  `window`, `document`, `Math.random` or `Date.now` (proven once by a temporary violation;
  mention in the report).
- AC4.4 `npm run check:all` passes and all Phase 1 tests are unchanged.

### Step 5 – Action pipeline in single-player

`actions.ts`, `Session.ts` with `LocalSession`, the authoritative world read, the literal
gradient table and the terrain checksum. `Game` routes break and place through the session.

- AC5.1 Unit: `validateAction` accepts and rejects according to every rule in 5.4, one
  test per rule, including placing into another player's box and a non-placeable block id.
- AC5.2 Unit: the authoritative read returns the same block as a loaded chunk for 10 000
  seeded random positions, with and without edits, and holds at most 32 cached chunks.
- AC5.3 Unit: breaking next to water yields water, as in Phase 1.
- AC5.4 Unit: the literal gradient table equals the `Math.sin`/`Math.cos` values within
  1e-7. The terrain checksum is deterministic, differs between seeds, and equals a
  constant recorded in the test for seed 1337.
- AC5.5 E2E: the checksum computed in the browser for seed 1337 equals the Node constant.
- AC5.6 All Phase 1 unit and browser tests pass with unchanged assertions; the Phase 1
  reference screenshots match (see 6.4 for the exception procedure).

### Step 6 – Protocol, room codes, snapshot, memory transport

- AC6.1 Unit: every message type survives encode → decode unchanged.
- AC6.2 Unit: the decoder returns an error, without throwing, for wrong field types, NaN
  and infinite numbers, non-integer block coordinates, over-long strings, unknown types,
  oversized messages, and for 10 000 seeded random byte strings.
- AC6.3 Unit: 1 000 generated room codes have 6 characters from the alphabet; lower case,
  spaces and hyphens are normalised; codes with other characters or lengths are invalid.
- AC6.4 Unit: names are trimmed, stripped of control characters, cut to 16 characters,
  and replaced by a default when empty.
- AC6.5 Unit: an edit log of 50 000 edits in 200 chunks survives split → join unchanged,
  and no part exceeds 16 384 bytes. An empty log yields zero parts.
- AC6.6 Unit: the memory transport delivers in order per connection under seeded random
  delays and reports closing to both ends.

### Step 7 – Host and client sessions

`HostSession`, `ClientSession`, tested entirely in Node with the memory transport and a
fake clock.

- AC7.1 After joining, the guest's seed, time, frozen flag and edit log equal the host's.
- AC7.2 A valid guest action changes every player's world and returns `ok` to the sender.
  An invalid one changes no world and returns its reason. The guest's world does not
  change before `blocks` arrives (checked with a delayed transport).
- AC7.3 A host action reaches all guests.
- AC7.4 A fifth player is rejected with `full`, another protocol version with `version`;
  a duplicate name gets a suffix.
- AC7.5 A pose reaches every other player within one relay tick and never its sender;
  invalid poses are dropped; an unchanged pose is not sent again.
- AC7.6 Guest time is within 0.001 of host time after a sync. Host time advances by
  `tick(nowMs)` alone, and stays fixed when frozen.
- AC7.7 A silent peer is removed after 5 s and the others receive `playerLeft`.
- AC7.8 Convergence: one host and three guests perform 2 000 seeded random actions under
  random delays, with one guest joining midway; afterwards all `worldHash` values are equal.
- AC7.9 Edits made while a snapshot is in transit are present on the joining guest.
- AC7.10 The rate limit rejects the 31st action within one second; 20 invalid messages
  close the connection.
- AC7.11 Client state machine: `bye` ends without reconnecting; a lost host leads to
  retries every 2 s for 10 s and then to `offline` with the edit log intact; a host that
  returns within the window leads back to `online` with the host's current edits.
- AC7.12 Line coverage of `src/net/` is at least 85 %.

### Step 8 – Real transport, game wiring, world replacement

`peerTransport.ts`, session handling in `Game`, replacing the world in place, the test API
of 6.3, the URL parameters, `e2e/multiplayer.ts`. No figures and no menu yet.

- AC8.1 E2E: a host opens a room; `net.role` is `host` and the code is well-formed. A
  guest with another seed joins by code; within 15 s both list two players and the guest's
  seed equals the host's.
- AC8.2 E2E: edits the host made before the join exist on the guest, including one
  320 blocks away from spawn (checked after teleporting there).
- AC8.3 E2E: a real left click on the host breaks the targeted block on host and guest
  within 2 s; a real right click on the guest places a block on both. On the other
  player's screen the centre pixels change (rule-based).
- AC8.4 E2E: with three players, an edit by guest A reaches guest B.
- AC8.5 E2E: after `setTime(0.75)` on the host, the guest's time is within 0.005 within
  2 s and the guest's frame is at most half as bright as at noon.
- AC8.6 E2E: joining an unknown code fails with "Room not found" within 15 s and leaves
  the guest's world untouched. With `signal` pointing to a closed port, opening a room
  fails with the unreachable message and the game keeps working.
- AC8.7 E2E: `net.sendAction` with an out-of-reach break from a guest changes no world and
  yields the reason `reach`.
- AC8.8 E2E: loading and playing in single-player requests nothing outside the page's
  origin and does not fetch the chunk containing `peerjs`. The entry chunk is at most
  640 kB (Phase 1: 588 kB).
- AC8.9 E2E: after a join, `chunks.loaded` is 81 and the geometry count is at most 110 %
  of a fresh load (no leak from the replaced world).

- AC8.10 E2E: a guest in touch mode joins a desktop host; the guest's `break` button
  breaks a block on both, and the host's edit appears on the guest.

### Step 9 – Remote players

Pose sending, relay, interpolation, figures and name tags.

- AC9.1 Unit: interpolation is linear between two poses, never overshoots, holds the last
  pose when starved, snaps beyond 8 blocks and on the teleport flag, and takes the short
  way around for yaw.
- AC9.2 E2E: the host walks forward for 60 steps; within 2 s the guest's entry for the
  host is within 0.05 blocks and 0.01 rad of the host's own state.
- AC9.3 E2E: a guest looking at the host from 4 blocks sees the host's colour dominate
  the region where the figure is projected, and light pixels in the name-tag region; both
  are gone after the host teleports away.
- AC9.4 E2E: turning the host by 180° changes the head region on the guest's screen (face
  side visible or not).
- AC9.5 E2E: the own figure is never drawn (looking straight down while standing shows
  the ground, as in Phase 1).
- AC9.6 E2E: placing a block into the cell where another player stands is refused on all
  players.
- AC9.7 E2E: each remote player adds at most 4 draw calls.
- AC9.8 Unit: a motionless player sends no `pose` for 3 s; a moving one at most 21 per second.
- AC9.9 Reference screenshot `remote-player` created and reviewed by eye: figure upright,
  standing on the ground, name readable, not glowing at night (check one night pose).

### Step 10 – Menu, notices, overlay

- AC10.1 E2E (without `test=1`): the start screen shows the Multiplayer section with name
  field, "Open world to others", code field and "Join". The name survives a reload.
- AC10.2 E2E: "Open world to others" shows a 6-character code and a join link containing
  `join=<code>`. A second context opening that link sees "Join world <code>"; clicking it
  joins.
- AC10.3 E2E: typing the code in lower case with a space joins as well.
- AC10.4 E2E: the player list on every player shows all names with "(host)" and "(you)"
  on the right entries and follows joins and leaves within 2 s.
- AC10.5 E2E: "<name> joined" and "<name> left" notices appear and are removed after 5 s;
  a fifth notice pushes out the oldest.
- AC10.6 E2E (without `test=1`): while the host's menu is open, the host's time advances, a
  guest's edit is confirmed within 2 s, and the host's player does not move. In
  single-player the menu still pauses (Phase 1 AC11.1 unchanged).
- AC10.7 E2E: the F3 overlay shows role, room code, player count and a numeric round-trip
  time.
- AC10.8 E2E: a cancelable `beforeunload` event is prevented while hosting or joined, and
  not in single-player.
- AC10.9 E2E: with edits in the own world, "Join" asks for the second click; without
  edits it joins directly.
- AC10.10 E2E: a fifth player sees "Room is full".
- AC10.11 Reference screenshots `multiplayer-menu` created and `pause-screen` regenerated;
  both reviewed by eye.

- AC10.12 E2E (touch, 640 × 360): the Multiplayer section is fully reachable by scrolling
  the menu, its buttons are at least 48 × 48 CSS px, and a room can be opened and joined
  using taps and typed text only.
- AC10.13 E2E: the hosting hint of 5.11 is shown while hosting in touch mode and not in
  mouse mode.
- AC10.14 E2E: with a stubbed `navigator.wakeLock`, a wake lock is requested when a room
  is opened or joined and released when the session ends; a rejecting stub causes no
  console message.

### Step 11 – Leaving, drops, re-hosting

- AC11.1 E2E: a guest clicks "Leave world": within 2 s the others' lists shrink and the
  figure disappears; the leaver has `role` `off`, the same `worldHash` as before, and can
  edit locally.
- AC11.2 E2E: the host closes the room: within 2 s every guest has `role` `off`, the notice
  of 5.8, an unchanged `worldHash`, and the menu pauses again.
- AC11.3 E2E: the host's page is closed abruptly: every guest reaches `reconnecting` and
  then `offline` within 17 s, with an unchanged `worldHash`.
- AC11.4 E2E: `dropConnection()` on a guest while the host lives: the guest is `online`
  again within 10 s, has the edits the host made meanwhile, and all lists are complete.
- AC11.5 E2E: while reconnecting, a click changes no block and the reconnect notice shows.
- AC11.6 E2E: after AC11.2, a former guest opens a room and gets a different code; the
  other former guest joins and has all edits of the first session plus a new one.
- AC11.7 E2E: with a signaling stub started by the test itself and stopped after two
  players connected, edits and movement still sync between them.
- AC11.8 Unit and E2E: a guest whose checksum differs (forced through a test option) joins
  and shows the consistency notice; with equal checksums it does not appear.

### Step 12 – Hardening, documentation, pull request

- AC12.1 E2E soak: four players; each performs 50 actions and moves; one guest leaves and
  rejoins midway. At the end all four `worldHash` values are equal, no page logged an
  error or warning, and the host's JS heap grew by less than 50 MB.
- AC12.2 E2E: a guest joins a host with 50 000 edits and has the host's `worldHash`
  within 20 s.
- AC12.3 E2E: with `suspendFrames(true)` on the host, a guest's edit is confirmed within
  2 s, guest A sees guest B move, and unfrozen time advances on the guests.
- AC12.4 Node: validating and applying an action takes less than 0.2 ms on average over
  10 000 actions; one relay tick for 4 moving players takes less than 1 ms.
- AC12.5 Node: with 4 moving players the host sends less than 20 kB per second in total
  (measured in the memory transport; the number goes into the report).
- AC12.6 Hygiene test of Phase 1 (AC12.4) still passes; no new binary files except the
  reference screenshots; hard rule 1 checked for the figure, colours and all texts.
- AC12.7 `README.md` explains: how to play together, what needs internet, which third
  parties see what (signaling server and STUN server see IP addresses and handshake data,
  players see each other's IP addresses, game data goes directly), and troubleshooting
  (guest networks that isolate devices, VPNs, firewalls).
- AC12.8 `CLAUDE.md` is updated: structure, commands, tech stack (`peerjs`, `peer`),
  headless testing with several players, status "Phase 2: implemented".
- AC12.9 `docs/phase-2b-report.md` is written per the Definition of Done, including the
  manual test list for the owner: two devices in one Wi-Fi through the public services;
  Chrome with Firefox and with Safari; join link; minimised host tab; reload confirmation;
  sleeping guest laptop; frame rate with four players; on the Android phone and tablet:
  typing the room code, joining a desktop host, screen staying awake, hosting from the
  tablet, locking the screen while hosting.
- AC12.10 CI is green on the final commit and one pull request into `main` is open.

## 8. Risks and fallbacks

| Risk                                                                   | Fallback (decide without asking)                                                                                                                                                   |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WebRTC between contexts fails in CI although it works in the container | Add `--disable-features=WebRtcHideLocalIpsWithMdns` and `--allow-loopback-in-peer-connection` to the launch arguments; record what was needed                                      |
| Several software-rendered pages make tests slow or flaky               | Give multiplayer tests a 180 s timeout; run the 3- and 4-player tests serially; as a last step add a test-only `rd=<n>` URL parameter and use render distance 2 for them           |
| `peerjs` does not pass plain strings unchanged                         | Use its JSON serialisation, or send `Uint8Array` of UTF-8 text; the `Connection` interface stays string-based                                                                      |
| The `peer` stub behaves differently from the public server             | Keep to documented PeerJS behaviour only (chosen IDs, `unavailable-id`, `peer-unavailable` errors); list the public-server test first in the owner's manual list                   |
| The gradient table change moves reference pixels                       | Procedure in 6.4                                                                                                                                                                   |
| Closing a tab does not deliver `bye`                                   | The heartbeat timeout covers it; AC11.3 tests exactly this path                                                                                                                    |
| A very large snapshot stalls the data channel                          | Send parts while watching `bufferedAmount`, keeping order with a per-guest queue that also holds later `blocks` messages                                                           |
| Replacing the world in place proves fragile                            | Recreate world, chunk manager and chunk meshes behind one `loadWorld` method; do not reload the page (the connection would be lost)                                                |
| Timers of a hidden host tab are throttled to one per second            | By design the timer only drives time sync and heartbeats (1 s is enough); relaying happens in message handlers                                                                     |
| Multi-finger input cannot be produced through the DevTools protocol    | Dispatch synthetic `PointerEvent`s with `pointerType: 'touch'` from the page in the affected tests; keep at least one test with real emulated touches (single finger)              |
| Gesture suppression differs in emulation and on real devices           | Keep the automated checks of AC3.3; put pinch, pull-to-refresh and long press on the owner's manual list                                                                           |
| Part A runs out of room                                                | Cut the fullscreen button first, then the "Touch sensitivity" setting; record every cut                                                                                            |
| Step 7 or 8 turns out larger than planned                              | Keep the order; do not cut tests. Cut in this order if the session cannot finish: AC11.7, the join-discard confirmation (AC10.9), the connection-type line in F3. Record every cut |

## 9. Notes for Phase 3

- Persistence: the host's edit log, time and (new) per-player state are the save file.
  Guests' copies make "save a copy" possible for them too.
- Inventory: per-player state lives in `HostSession`, travels in `welcome`, and changes
  through action results. `place` then consumes an item; `break` yields one.
- Timed breaking: `startBreak`/`stopBreak` actions; the host checks elapsed time against
  block hardness.
- Touch controls exist already. Timed breaking fits the `break` button, which already
  repeats while held; an inventory screen needs a touch layout.
