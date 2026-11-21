# Phase 6 part D report – Player figure

Plan: `docs/phase-6-plan.md`, steps 11–13, sections 5.14 and 5.15. Branch:
`claude/laughing-mayer-o2fwkw` (the branch the plan was committed on).

The coloured boxes of Part B are replaced by a blocky figure: head, body, two arms and two
legs, in one of eight looks painted by code, animated from what the other device sends,
with the slot colour as the belt and as a stripe on the name tag. Every player picks name
and look in **Settings → Your player**, which shows a turning preview of the own figure.

## What was built

**Step 11 – looks, texture, motion (pure).**

- `src/player/looks.ts`: the append-only table of looks (ids 1–8: Fern, Ember, Pebble,
  River, Moss, Dune, Frost, Plum; skin, hair colour and style, top colour and pattern,
  sleeves, trousers or skirt, shoes), `lookForKey` (1 + first key byte mod 8),
  `resolveLook`, `isLookChoice`. Pinned by `looks.test.ts`.
- `src/render/textures/figureTexture.ts`: a pure painter like `tiles.ts` that writes all
  eight looks into one 128 × 128 RGBA atlas (one cell of 64 × 32 per look; each part's six
  faces side by side, one texel per figure texel), with seeded noise in cloth and hair,
  eyes and a mouth, four hair styles, four top patterns, a belt marked as accent. Also the
  head icon (the head's front) and `figureView` (a look from the front or the back, for
  the sheet). Its checksum is recorded in `figureTexture.test.ts`.
- `src/player/figureMotion.ts`: `FigureMotion.step(input, out)` – no allocation per call.
  Walking speed and direction are smoothed (40 ms); the leg amplitude follows the speed up
  to `FIGURE_LEG_SWING` (0.6 rad at walking speed) at a bounded rate, so the limbs rest
  200 ms after a stop; the step phase follows the distance walked (`FIGURE_STRIDE` 1.6
  blocks per cycle); arms swing against the legs at half the amplitude. Flying keeps the
  legs still. The body turns towards the walking direction (walking backwards: away from
  it) at most 8 rad/s and is clamped to 45° from the head. The right arm swings every
  300 ms while `busy`, and once for a block change.
- `src/game/playerIdentity.ts`: the stored record gets `look` (0–8); `parseIdentity` is
  pure and unit-tested; `saveIdentity` leaves a record that already says the same alone.
- Constants in `config.ts` under "Player figure (Phase 6 part D)".

**Step 12 – the figure in the game and over the network.**

- Protocol (`src/net/protocol.ts`): `look` in `hello`, in every player of `welcome` and in
  `joined`; `profile` in both directions; `busy` in `pose`; `fly` and `busy` in every entry
  of `poses`. All validated like the other fields.
- `HostSession`: looks and flags per member, `setHostProfile`, `profile` from guests
  (counted by the rate limit, the name normalised and suffixed again, sent to everyone
  including the sender, the saved guest entry carries the new name), a change of `busy` or
  `fly` alone is a pose change, the host's own flags come from `hostFlags`. Block changes
  a guest caused count in the roster (`edits`).
- `ClientSession`: `look` in `hello` (also after a reconnect, with the newest name and
  look), `setProfile`, flags in `setPose`, `profile` and `edits` into the roster.
- `RemoteRoster` / `PoseBuffer`: look, fly, busy, edits per player; `snapsAt` counts the
  snaps the drawn pose went through.
- `src/render/figureModel.ts`: one `BufferGeometry` of six boxes with a part index and a
  pivot per vertex; the vertex shader turns head (yaw, then pitch) and limbs (about x) and
  places the look in the atlas; the fragment shader tints accent texels with the slot
  colour, applies the face shade, the light and the fog of the terrain.
- `src/render/RemotePlayers.ts` rewritten on it: one mesh and one name tag per figure (two
  draw calls), one motion step and a few uniform writes per frame, the tag redrawn when
  the name changes, a stripe of the slot colour at the tag's left edge.
- `Game`: `busy` while break is held on a targeted block; the test API of 5.13.

**Step 13 – "Your player", player list.**

- `src/ui/PlayerSection.ts`: name field (the same value as in "Join a world", both ways),
  preview with the look's name under it, nine look buttons with head icons in a 3 × 3
  grid. Shown on the settings page and in the pause menu, after "Settings".
- `src/render/FigurePreview.ts`: its own `WebGLRenderer` on a WebGL2 context asked for
  first (a failure logs nothing), created when the section is shown and in view, drawing
  at most 30 pictures a second while in view, disposed with `forceContextLoss` when the
  page closes. Without WebGL the section shows the head icon.
- `src/ui/figureIcons.ts`: head icons and the figure sheet on 2D canvases.
- Room panel: the head icon of each player's look next to the swatch.
- URL parameters `look=<0–8>` and `previewgl=0`; `scripts/figurePreview.ts` writes a sheet
  of all looks for judging them by eye.

## Acceptance criteria

| Criterion                                                                           | Where                                                                                               |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| AC11.1                                                                              | `src/player/looks.test.ts`                                                                          |
| AC11.2                                                                              | `src/render/textures/figureTexture.test.ts`                                                         |
| AC11.3–AC11.6                                                                       | `src/player/figureMotion.test.ts`                                                                   |
| AC11.7                                                                              | `src/game/playerIdentity.test.ts`                                                                   |
| AC12.1                                                                              | `src/net/protocol.test.ts`                                                                          |
| AC12.2, AC12.3                                                                      | `src/net/profiles.test.ts`                                                                          |
| AC12.4                                                                              | `e2e/mpPlayers.spec.ts` (one other player, ≤ 2) and `e2e/mpFigure.spec.ts` (three guests, ≤ 6)      |
| AC12.5–AC12.8, AC12.10, AC12.11 (sheet)                                             | `e2e/mpFigure.spec.ts`                                                                              |
| AC12.9, AC12.11 (`remote-player`, `remote-player-night`)                            | `e2e/mpPlayers.spec.ts`                                                                             |
| AC13.1, AC13.2, AC13.4, AC13.5, AC13.6 (choosing stores), AC13.8 (`player-section`) | `e2e/playerSection.spec.ts`                                                                         |
| AC13.6 (single-player and the quick run leave nothing)                              | `e2e/bench.spec.ts`, the quick run: local storage holds only the result and the settings afterwards |
| AC13.3, AC13.7, AC13.8 (`room-panel`)                                               | `e2e/mpMenus.spec.ts`                                                                               |
| AC13.9                                                                              | this report, `README.md`, `CLAUDE.md`, `docs/device-tests.md`                                       |

**How the Part B tests of the figure were adapted:** AC6.2 "the host's colour dominates"
now checks the top of the host's look (the host opens with `look=2`, Ember, whose red and
orange stripes dominate the same way) in a region of the figure's upper body. AC6.6 (at
most 4 draw calls) became AC12.4 (at most 2). AC6.7 and AC6.9 are unchanged in content and
run on the new figure; the test is also named AC12.9. Every test whose picture shows a
figure or a head icon now fixes the look with `look=`: the look from the random player
key would otherwise change the references from run to run.

## Decisions and deviations

- **`getState().player` keeps the pose and gets `name`, `choice` and `look`.** The plan
  names `getState().player { name, choice, look }`, but `player` already holds the pose
  that hundreds of tests read. The three fields were added to it instead of replacing it.
- **Snaps reach the motion.** A teleport (`setPlayer`, a start pose) of fewer than
  `SNAP_DISTANCE` blocks was seen by the motion as one very fast step and made the legs
  swing. `PoseBuffer.snapsAt(now)` counts the snaps the drawn pose has gone through, and
  `FigureMotion` treats a change of that count like a long jump: no movement, no swing.
- **A snap also turns the body under the head.** After a teleport that turned the player
  (a test's `setPlayer`, a start pose), the 45° rule alone left the body at 45° from the
  head, so a figure placed facing the camera showed its side. A jump carries its own
  facing; walking and looking around follow the rules of 5.14 as planned.
- **`FIGURE_MAX_FRAME_MS` is 1 000 ms**, not the 100 ms first chosen: software-rendered
  pages draw a few pictures a second, and a short clamp slowed the figures' clock down
  there (limbs took far longer than 200 ms of real time to come to rest).
- **Accent in the texture's alpha.** The painter's texels are all opaque (AC11.2); the GPU
  copy marks accent texels with alpha 128 and the shader draws every texel opaque. No
  second texture is needed.
- **No mipmaps for the figure atlas** (nearest filtering): the figure's texels are large;
  shimmer at a distance was not visible in the container. NET-20 covers real screens.
- **Arm swing shape.** One swing goes forward and up, then down past the hip
  (`FIGURE_SWING_ANGLE · sin(2πt)`, 1.1 rad), so the angle changes sign twice per swing, as
  AC12.7 asks.
- **Preview size 140 × 180 CSS px** (plan: "about 160 × 200"), so the preview and the look
  grid fit side by side in the settings column on a computer; at 640 × 360 the grid wraps
  below the preview. The preview's look name is under it as planned.
- **The preview runs its own animation frame loop** (not `Game.frame`), at most 30 pictures
  a second, only while the section is shown and intersects the view
  (`IntersectionObserver`). A new preview (and WebGL context) is made per visit of the
  page; no hitch was seen in the container (risk table: create once per page if a phone
  shows one).
- **AC13.2's "one context again"** is checked as: `ui.preview` is null and no preview
  canvas is left in the document; the preview calls `forceContextLoss` when it is
  disposed. Counting a page's live contexts has no browser API.
- **AC13.6, single-player and the quick run:** the existing quick-run test already asserts
  that local storage holds exactly the result and the settings after a single-player world
  and a run; it carries the AC13.6 tag now. The second half ("choosing a look sets it") is
  its own test.
- **AC12.5 time bound.** The browser test allows 1.1 s between the guest's last step and
  all limbs below 0.01 rad on the host: 0.1 s interpolation delay, 0.2 s settling, the
  relay, and a software-rendered page's slow last frames. The 200 ms rule itself is pinned
  by the unit test (AC11.3).
- **AC12.8 region.** Pebble's top is grey with a darker vest stripe in the middle; the test
  measures beside the stripe and compares with the top colour times the front face shade.
- **The `profile` of a guest beyond the rate limit is dropped** without an answer (there is
  no sequence number to answer); the next change goes through.
- **The look is resolved before sending**: `hello` and `profile` carry 1–8, never 0, as the
  plan says; the host keeps no "Automatic".

## Known issues

- Nothing measured on real devices yet: NET-20 to NET-25.
- The preview turns at a fixed rate; with the controller the focus frame can sit next to a
  moving picture, which is intended.

## Measured numbers

- **Entry chunk** (`dist/assets/index-*.js`, minified): Part C **778.67 kB**; this part
  **798.03 kB** (+19.4 kB: painter, motion, figure model, preview, "Your player").
  `HostSession` 10.7 → 11.6 kB, `ClientSession` 7.0 → 7.5 kB, `protocol` 4.7 → 4.9 kB,
  `interpolation` 1.8 → 2.2 kB.
- **AC11.6**: 30 000 motion steps (three figures, 10 000 frames) take **9.4 ms** in the
  container (best of six rounds; the limit is 20 ms); a step allocates nothing.
- **Draw calls**: one other player adds 2 (AC12.4); three guests add at most 6.
- **Line coverage**: all files 98.4 %, `src/net/` 97.6 %, `figureMotion.ts` 98.8 %,
  `looks.ts` 100 % (`npm run test:coverage`, 655 unit tests).
- The atlas checksum of AC11.2 is `256304708`.

## Full browser run

The whole browser suite ran once in the container (`MC_CONTAINER_GPU_STALL=1`, 278
tests, 38 minutes): 271 passed, 7 failed. All seven were caused by this part and are fixed:
two layout checks of the pause menu (touch layout and the world menu by touch, each on
phone and tablet) now leave out "Your player" like "Playing together" (both are reached by
scrolling, and "Your player" moved after the World section in the pause menu), the
references `pause-screen` and `pad-pause` were regenerated with the preview and the
Automatic icon masked, and the three-guest test now waits for the figures to stand still
(and a snap puts the body under the head, see above). The failed specs and every Part D
spec were then run again: all passed (`touchLayout`, `worldMenu`, `ui`, `gamepadMenus`:
57; `mpFigure`, `mpPlayers`, `mpMenus`: 26; `playerSection`: 7).

References looked at (old left, new right, `scripts/compareShots.mjs`):

| Reference                   | Changed        | Judgement                                                                                                                       |
| --------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `remote-player`             | 2.0 %          | The figure in Ember's look, upright on the platform, facing the camera; red belt (slot 1), tag with a red stripe, name readable |
| `remote-player-night`       | 0.1 %          | The figure dark like the wall behind it, no glow; tag readable                                                                  |
| `room-panel`                | 13.3 %         | Head icons next to the swatches                                                                                                 |
| `pause-screen`, `pad-pause` | 33.4 %, 24.5 % | "Your player" below "World"; preview and Automatic icon masked                                                                  |
| `figure-sheet` (new)        | –              | Eight clearly different looks, front and back, with names                                                                       |
| `player-section` (new)      | –              | Name, masked preview, the 3 × 3 picker with Moss marked                                                                         |

## For the Pi side

Nothing new to configure: no new packages, the same build variables, the same signaling
and STUN. The protocol changed (`look`, `profile`, `busy`, `fly`), so devices must run the
same build as before (the build id check already ensures that).

## Hard rule 1

Checked for the proportions (legs 4 × 11, body 8 × 11 × 5, arms 3 × 10, head 7 × 7 × 7:
smaller head, thinner arms, deeper body than the best-known blocky figure), the texture
layout (each part's faces in one row per part, 64 × 32 cells in a 128 × 128 atlas, not the
64 × 64 skin layout of another game), the colours (no turquoise top with blue trousers and
short brown hair, no orange hair with a green top; a unit test guards both) and the names
(plain words: Fern, Ember, Pebble, River, Moss, Dune, Frost, Plum). The figure sheet was
looked at: eight clearly different looks, none like a well-known figure of another game.
All textures are painted by code; the only new images are the test references
`figure-sheet` and `player-section`.

## Tests on real devices

Added to `docs/device-tests.md`, section 10: NET-20 to NET-25 (origin 6D). None became
pointless; the Part B tests of the figure (NET-7) stay as they are, as they were run on
Part B's figure.

## Suggestions for the next part

- Part E's scenario `players` can give its three simulated guests looks 2, 5 and 8 and set
  `busy` while they break; nothing has to be built ahead (`HostSession`, the roster and
  `RemotePlayers` take them as they are).
- If NET-24 shows a cost on the phone: skip the motion step for figures farther than 32
  blocks (they keep their last angles); the draw calls stay at two.
- Phase 7's character editor can replace a table entry by parameters sent in `profile`;
  the painter already takes a `Look` record.
