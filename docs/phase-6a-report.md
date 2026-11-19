# Phase 6 part A report – connection test

Plan: `docs/phase-6-plan.md`, steps 1–2. This part adds the network layer under the game
(transport interfaces, an in-memory transport, the PeerJS transport, the configuration
from build variables) and the **network test**, a screen the owner runs on phone, tablet
and computer at home before any multiplayer game is built on top of it (Part B starts only
when NET-1 to NET-4 show a working connection).

## What was built

- **`src/net/` (pure core, Node-tested, in the coverage scope and the ESLint boundary)**
  - `transport.ts`: `Connection` (text messages, `bufferedAmount`, `stats`), `Signaling`
    (`open(id)`, `connect(id)`, `onConnection`, `onStateChange`), `RoomDirectory`
    (`list()` → ids, or `off` / `unreachable`), `Network`, `SignalError` with the reasons
    `unreachable`, `taken`, `not-found`, `timeout`.
  - `memoryTransport.ts`: `MemoryNetwork` with a fake clock (`advance(ms)`), seeded delays,
    per-connection order (a later message never overtakes an earlier one), closing reported
    to both ends after the messages sent before it, `reachable` and `discovery` switches and
    `lose()` for a lost signaling server. Part B's sessions and Part D's simulated guests
    build on it.
  - `netTest.ts`: test ids `mc-<build>-t-<code>` (4 characters of the room alphabet),
    the messages of the test and their validating decoder, `NetTestRun` (hello, 20 pings
    one after the other, 1 MB in 64 messages of exactly 16 384 characters, acknowledgement,
    the numbers sent back so both devices show the same), `selectedPair` (the candidate pair
    in use from `getStats()` entries, with the remote address cut to two parts and mDNS
    names recognised), `browserName`, `verdict` and `resultText`.
- **Shell**
  - `src/game/netConfig.ts`: `NetConfig` from `VITE_SIGNAL_URL` / `VITE_STUN_URLS` and the
    URL parameters `signal` / `stun` (pure parser, unit-tested); `discoveryUrl`.
  - `src/game/buildCommit.ts`: the build id, now `BUILD_COMMIT` first, then `GITHUB_SHA`,
    then git, then `dev` (used by `vite.config.ts`).
  - `src/game/peerTransport.ts`: `Signaling`, `Connection` and `RoomDirectory` with the
    `peerjs` client (reliable data channel, `raw` serialization, so strings pass unchanged;
    `debug: 0`, so the client logs nothing). Timeouts: 15 s to register, 15 s for a data
    channel; a registered peer that loses the server tries again every 5 s. Own chunk,
    loaded with a dynamic import.
  - `src/ui/NetTestScreen.ts`: the screen of plan 5.4 (build, availability, signaling host,
    ICE servers, signaling state, discovery, own code; "Others testing now" with
    "Connect"; candidate pair, round trip, throughput, the other device's browser; one
    verdict line; "Use STUN", "Copy result", "Back"). Own chunk as well, loaded the first
    time "Network test" is pressed.
  - "Network test" on the settings page (`PauseScreen`, settings kind only); the new screen
    `nettest` in `Game` (focus system, back guard and Back return to the settings page).
  - Test API: `getState().net` `{ role, available, build, test }` and `__mc.netNetwork()`.
- **Tooling**: `peerjs` ^1.5.5 (runtime), `peer` 1.0.2 (dev, the Pi's version),
  `scripts/signalServer.mjs` and `npm run signal`, Playwright's `webServer` as a list
  (preview server and signaling server), `e2e/multiplayer.ts` (players in their own browser
  contexts with the console checks), `e2e/netTest.spec.ts`.
- **Docs**: `README.md` "Playing together (in preparation)", `CLAUDE.md`,
  `docs/device-tests.md` section 10 (NET-1 to NET-4).

## Acceptance criteria

| AC    | Where / how                                                                                                                                                                  |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1.1 | `src/game/netConfig.test.ts`                                                                                                                                                 |
| AC1.2 | `e2e/netTest.spec.ts` "Phase 6 AC1.2"                                                                                                                                        |
| AC1.3 | `e2e/netTest.spec.ts` "Phase 6 AC1.3" (two contexts, both directions, the directory lists both ids)                                                                          |
| AC1.4 | CI run of the step's last commit; see "CI" below                                                                                                                             |
| AC1.5 | Proven once with a temporary `src/net/violation.ts` importing `three` and `peerjs` and using `window`, `document`, `Math.random`, `Date.now`: ESLint reported all six errors |
| AC1.6 | `src/net/memoryTransport.test.ts`                                                                                                                                            |
| AC1.7 | `e2e/netTest.spec.ts` "Phase 6 AC1.7"; sizes under "Measured numbers"                                                                                                        |
| AC1.8 | `src/game/buildCommit.test.ts` (Node test of `buildCommit`)                                                                                                                  |
| AC2.1 | `e2e/netTest.spec.ts` "Phase 6 AC2.1, AC2.5, AC2.7"                                                                                                                          |
| AC2.2 | `e2e/netTest.spec.ts` "Phase 6 AC2.2" (signal on port 9, then back to the world menu, create a world, play)                                                                  |
| AC2.3 | `e2e/netTest.spec.ts` "Phase 6 AC2.3" (a PeerJS server without discovery started by the test on port 9002)                                                                   |
| AC2.4 | `e2e/netTest.spec.ts` "Phase 6 AC2.4" (`net.test.iceServers` 2 → 0)                                                                                                          |
| AC2.5 | `e2e/netTest.spec.ts` "Phase 6 AC2.1, AC2.5, AC2.7" (clipboard permission, text read back)                                                                                   |
| AC2.6 | `e2e/netTest.spec.ts` "Phase 6 AC2.6" (touch at 640 × 360: every button scrolled into view lies inside it and is ≥ 48 × 48; the fake pad walks to "Connect", A connects)     |
| AC2.7 | Reference `e2e/screenshots/net-test.png`, looked at (below)                                                                                                                  |
| AC2.8 | `README.md`, `CLAUDE.md`, `docs/device-tests.md`, this report, the pull request                                                                                              |

## Decisions and deviations

- **The network test's screen is loaded lazily as well, not only `peerjs`.** With the screen
  and `netTest.ts` in the entry chunk it grew by 19.6 kB (minified), over the 10 kB of AC1.7.
  Now only `netConfig.ts` and the wiring stay in it (+4.8 kB); `NetTestScreen` is a chunk of
  its own, loaded when "Network test" is pressed. AC1.7 checks that neither chunk is
  requested in single-player.
- **`getState().net` in Part A** is `{ role, available, build, test }`: the plan says "role
  and test only", but AC1.2 and AC1.8 need `available` and `build`, so they are there from
  Part A. `role` is always `off` until Part B. `test` is null while the screen is closed;
  while open it has `state` (`unavailable`, `connecting`, `unreachable`, `ready`, `testing`,
  `done`, `failed`), `code`, `signaling`, `discovery`, `others` (codes), `useStun`,
  `iceServers` (count in use), `candidate` (the pair as text, e.g. "host → host (IP
  127.0._._)"), `rttMs`, `mbPerS`, `remoteBrowser` and `verdict`.
- **`__mc.netNetwork()`** was added (not in plan 5.13) so AC1.3 can drive `peerTransport`
  directly from the page without the screen.
- **"Use STUN" is a button with `role="switch"`** ("Use STUN: on" / "off") rather than a
  checkbox: it is then a 48 × 48 control in touch mode like the other buttons and the focus
  system handles it as any button. Switching it stops the test and starts it again under a
  new code, with or without the ICE servers.
- **The test**: the device that presses "Connect" pings 20 times, one ping after the pong of
  the one before (median round trip), then sends 64 messages of 16 384 characters
  (1 MiB) at once; the other side acknowledges when it has all 64, and the throughput is
  1 MiB divided by the time from the first send to the acknowledgement (so it includes one
  round trip). The numbers go back to the other device so both show the same. A run must be
  done within 30 s (`NET_TEST_RUN_TIMEOUT_MS`). A device in the middle of a test refuses a
  second incoming connection; a finished test is replaced by the next one.
- **Verdict lines** (one at a time, the most important first): "Signaling server
  unreachable. Is this device on the home network?", "Direct connection OK", "Test failed:
  <reason>.", "No ICE candidate pair within 15 s: the devices cannot reach each other.",
  "The other device is no longer testing.", "The connection closed before the test was
  done.", "Lost the connection to the signaling server.", "Discovery off: other devices are
  not listed on this server."
- **Peer ids in tests**: AC1.3 uses ids `mc-<build>-x-…`, which no screen lists, so it does
  not appear in the network tests running alongside.
- **Tests running alongside see each other.** All browser tests use one build and one local
  server, so the "Others testing now" list of one test can hold devices of another. Tests
  therefore look for their own codes. The `net-test` reference, which shows the list, uses a
  PeerJS server of its own on port 9003 (`ownServer`), as AC2.3 does on 9002.
- **Chromium's own console messages.** A refused WebSocket (AC2.2) and the 401 of a
  discovery list that is off (AC2.3) are logged by Chromium itself; those two tests allow
  exactly that message (`allowConsole` in `e2e/multiplayer.ts`). The game logs nothing. The
  pages of AC2.1 and AC2.3 are closed before their own server stops, whose retries the
  browser would otherwise log as refused connections.
- **This container's "GPU stall due to ReadPixels".** As recorded in
  `docs/fix-pad-flaky-report.md`, the cloud container's Chromium logs it in every test.
  Instead of an uncommitted local change, `e2e/fixtures.ts` now allows that one message
  only when `MC_CONTAINER_GPU_STALL=1` is set; CI runs without it and stays strict.
- **`vite.config.ts` imports `src/game/buildCommit.ts` with its extension**
  (`allowImportingTsExtensions` in `tsconfig.json`), which avoids Vite's warning about
  imports without an extension in the config.
- **The status line under "Copy result"** has its own class `net-status`; reusing
  `.bench-status` made a locator of the performance test's tests match two elements.
- **The `net-test` reference allows 8 % of its pixels to differ** (the menu references
  allow 5 %). CI's browser draws the text with another font than the cloud container, which
  makes every row of this dense screen a pixel or two taller; the first CI run measured 6 %.
  What the screen shows is checked by the rule-based assertions of the same test.
- **AC1.7 plays in a world of seed 1337** and walks and jumps until the player moved half
  a block: with a random seed the player could face a trunk, and the first CI run timed out.
- **`focusOn`** moved from `e2e/gamepadInventory.spec.ts` to `e2e/gamepad.ts`, so the
  network test's controller test uses the same walk.
- **No WebRTC launch flags were needed**: two contexts connect with host candidates in the
  container (risk table, first row); see "CI" for GitHub Actions.

## Reference screenshots

- `net-test` (new): the network test of one of two devices after "Direct connection OK", at
  960 × 540, with build, own code, the other's code, candidate pair, round trip, throughput
  and the other device masked. Looked at: title, the info rows, one row under "Others
  testing now" with "Connect", the connection rows, the green verdict, the three buttons;
  nothing cut off.
- The settings page has a new button "Network test" next to "Back to worlds". No existing
  reference shows the settings page (`pause-screen` and `pad-pause` show the pause menu of a
  world, which has no such button), so no other reference changed; the full browser run
  reported no difference.

## Known issues

- Software WebGL in the container and CI: round trip and throughput of the browser tests are
  numbers between two tabs on one machine and say nothing about the home network.
- The PeerJS client keeps retrying a lost signaling server (every 5 s) while the network
  test is open; Chromium logs each refused attempt. Not seen by players; only tests with a
  server that stops would notice (they close their pages first).

## Measured numbers

- **Entry chunk** (`dist/assets/index-*.js`, minified): last Phase 5 build (`main` at
  32299bc) **737.23 kB** (gzip 200.79 kB); this part **742.06 kB** (gzip 202.69 kB):
  **+4.83 kB**. The new chunks: `NetTestScreen` 15.45 kB, `peerTransport` (with `peerjs`)
  90.99 kB, both only loaded by the network test.
- **Unit tests** of the new code: line coverage of `src/net/`, `netConfig.ts` and
  `buildCommit.ts` 99.7 %.

## CI

AC1.4: see the pull request; the CI run of the step's last commit is named here once it is
green.

## For the Pi side

What the Pi must do or verify for the preview of this pull request (no addresses here):

1. **Build variables.** The PR build must run with `BUILD_COMMIT` (seven characters of the
   PR's head commit), `VITE_SIGNAL_URL` (the Pi's signaling server as a `wss://` URL with
   the path the server is mounted at, `/` today) and `VITE_STUN_URLS` (the Pi's STUN server
   as `stun:<host>:3478`). This is the first build that reads them. Check: the built
   `assets/index-*.js` contains the signaling host name and the STUN URL, and the 7-character
   commit (the game shows it as "Build" on the network test).
2. **`npm ci` installs two new packages**: `peerjs` (runtime) and `peer` 1.0.2 (dev
   dependency; the same version as the Pi's server). Both come from the public npm registry;
   the build itself needs no network.
3. **Signaling server**: the game connects to `wss://<signal host>/peerjs?key=peerjs&id=…`
   (PeerJS default key) and fetches the discovery list from
   `https://<signal host>/peerjs/peers` (`allow_discovery` on) every 3 s while the network
   test is open. CORS must allow the PR preview's origin for that list (the WebSocket needs
   no CORS). Ids look like `mc-<build>-t-<4 characters>`.
4. **STUN server**: UDP 3478 reachable from phones, tablet and computer in the home Wi-Fi.
5. **Then the owner runs NET-1 to NET-4** (`docs/device-tests.md`, section 10) on the PR
   preview. Their result decides whether Part B may start; a failure points at the Pi
   (certificate, CORS, discovery, STUN) or the network, and the test is repeated after the
   fix.

## Tests on real devices

Added to `docs/device-tests.md`, section 10 "Multiplayer (Phase 6)": **NET-1, NET-2,
NET-3, NET-4** (6A). No test became obsolete.

## Suggestions for later phases

- Part B can build `HostSession` / `ClientSession` directly on `MemoryNetwork` (its
  `advance` clock and seeded delays are what AC4.x need) and on `Signaling` /
  `Connection` as they are. The `info` exchange of the room list fits a short-lived
  `connect` as in the network test.
- `PeerConnection.bufferedAmount()` reads the data channel's own counter; the per-guest
  queue of plan 5.5 can watch it.
- If NET-3 shows that connections work without STUN at home, STUN can stay as a safety net;
  if they fail without it, the report of Part B should say which devices needed it.
