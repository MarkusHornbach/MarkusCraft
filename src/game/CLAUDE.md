# src/game/ — the loop, wiring, screens, storage, multiplayer shell

Shell. `autosave.ts`, `perfStats.ts`, `netConfig.ts` and `buildCommit.ts` follow the pure
discipline (no DOM, unit-tested in Node, in the coverage scope). `Game.ts` touches almost
every area: rules that span several are in `docs/architecture.md`.

## Files

- `Game.ts` (loop, wiring, screens, world loading), `config.ts` (all constants),
  `testApi.ts`, `urlParams.ts`, `Radar.ts` (the radar in the shell: `src/radar/CLAUDE.md`)
- `autosave.ts` (pure: when to write what), `idbStore.ts` (WorldStore on IndexedDB),
  `worldLock.ts` (one tab per world)
- `perfStats.ts` (pure: frames and chunk work of the last ten seconds), `benchEnv.ts`
  (browser, GPU and screen for a performance test result)
- `backGuard.ts` (one history entry, so the browser's Back stays in the game; the rule is
  in `src/input/CLAUDE.md`, "Back guard")
- `netConfig.ts` (pure: build variables and URL parameters → NetConfig), `multiplayer.ts`
  (`Multiplayer`: opens or joins a room, drives the session from frames and a 250 ms timer,
  notices, wake lock, room list; loads the session code lazily), `playerIdentity.ts`
  (player key, name and look in local storage, stored only once multiplayer is used, a
  name typed or a look chosen; `parseIdentity` is pure), `buildCommit.ts` (pure: the build
  id; used by `vite.config.ts`), `peerTransport.ts` (Signaling, Connection, RoomDirectory
  with peerjs; own chunk, dynamic import)

## Screens

Outside test mode: world menu → (play) → game ⇄ pause menu → "Save and back to worlds".
The settings page is the pause screen without its world parts. The performance test is a
screen of its own next to menu, game and pause (`src/bench/CLAUDE.md`). The inventory lies
over the running game (`src/ui/CLAUDE.md`). Play buttons request the pointer lock (mouse)
or fullscreen (touch) synchronously inside the click. `Game.loadWorld` and the stores:
`src/save/CLAUDE.md`.

## Multiplayer configuration (Phase 6)

The signaling and STUN addresses reach the game only through the build variables
`VITE_SIGNAL_URL` (e.g. `wss://<host>/`) and `VITE_STUN_URLS` (comma-separated `stun:`
URLs), overridden by the URL parameters `signal` and `stun` (`stun=none` empties the
list); an invalid value counts as not set. Never write an address of the Pi or the
owner's domain anywhere in the repository; docs say "the Pi's signaling host". Without a
signaling server the build says "Multiplayer is not available in this build." The build
id `__BUILD_COMMIT__` comes from `BUILD_COMMIT`, else `GITHUB_SHA`, else git, else `dev`;
every peer id starts with `mc-<build>-`, so only the same build sees each other.
Single-player loads neither `peerjs` nor the network test's chunk and requests nothing
outside its origin (AC1.7).

## Rooms in the shell (Phase 6 part B)

`Multiplayer` swaps `Game.session` through `useSession` (`Game` never asks which kind it
is; the sessions: `src/net/CLAUDE.md`). While a room is open or joined, the pause menu and
the inventory do not pause the world (the frame still steps; `Input` gives no input while
paused), the time of day comes from the room (`Multiplayer.timeOfDay`: the host's wall
clock, the guest's last pong), and a 250 ms timer keeps the session answering in a hidden
tab. The host needs no timer of its own. Both modes can be opened to others. Notices
("Anna joined") use wall-clock time (`NET_NOTICE_MS`, at most `NET_NOTICES_MAX`).

## Player identity

The player key and name (`markuscraft.player.v1`) are stored only once multiplayer is used
or a name typed: single-player leaves no trace. `markuscraft.player.v1` holds
`{ key, name, look }`; a record without a valid look loads as 0, and `saveIdentity`
leaves a stored record that says the same untouched.

"Your player" (pause screen, after "Settings"; `src/ui/PlayerSection.ts`): the name (the
same value as the field of "Join a world"; sent to the room on `change`), a preview
(`FigurePreview`, its own WebGL2 context, created when the section is shown and in view,
at most 30 pictures a second, disposed with `forceContextLoss` when the page closes;
without WebGL the head icon) and nine look buttons (`aria-label` "Look: Fern", "Look:
Automatic (Fern)"). A new look is sent at once.

Before changing how `Game` switches screens or loads worlds read the "Decisions and
deviations" of `docs/phase-3a-report.md` and `docs/phase-4p-report.md`; for rooms
`docs/phase-6b-report.md`.
