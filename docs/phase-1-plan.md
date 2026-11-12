# Phase 1 plan – Core

Read `CLAUDE.md` first. This plan is executed autonomously in one cloud session: do not
ask the owner questions. Where this plan leaves a detail open, choose the simplest option
and note it in `docs/phase-1-report.md`.

## 1. Goal

A playable first-person voxel world in the browser: endless procedurally generated terrain
with hills, water, beaches and trees; walking, jumping, sprinting, flying and swimming with
solid collision; breaking and placing blocks; a day/night cycle; a start/pause screen with
settings; and a debug overlay. Fully covered by headless tests and deployed to GitHub Pages.

## 2. Decisions made with the owner

| Component | Decision |
|---|---|
| Stack | TypeScript + Vite + Three.js |
| World | Infinite horizontally, fixed height; chunks load/unload around the player |
| Terrain | Seeded heightmap hills, sea-level water, sand beaches, simple trees. No biomes, no caves |
| Block look | Procedurally generated 32×32 textures in an atlas |
| Lighting | Per-face shading + ambient occlusion + distance fog. No light propagation |
| Movement | Walk, jump, sprint, fly toggle, swimming |
| Building | Instant break, instant place, 9-slot block selector with unlimited blocks |
| Platform | Desktop, keyboard + mouse |
| Performance | Generation and meshing on the main thread with a per-frame time budget; code kept pure so it can move to workers later |
| UI | Crosshair, block selector bar, debug overlay, start/pause screen, settings |
| Seed | Random per visit, `?seed=` overrides |
| Sky | Day/night cycle with sun and moon |
| Sound | None in Phase 1 |
| UI language | English |
| Visual tests | Rule-based checks plus committed reference screenshots |
| Automation | CI on every push, auto-deploy `main` to GitHub Pages |

## 3. Out of scope (do not build)

Inventory and item counts, saving/loading the world, crafting, timed breaking and block
hardness, flowing water, light propagation and torches, caves, biomes, ores, mobs and
other characters, player model, health/hunger/damage, sound, touch and gamepad controls,
Web Workers, multiplayer, clouds, weather.

## 4. Specification

All numbers below are starting values in `src/game/config.ts`. They may be tuned if play
feels wrong; record changes in the report. Acceptance criteria refer to the final values.

### 4.1 World and chunks

- Chunk size 16 × 128 × 16 (X × Y × Z). `WORLD_HEIGHT = 128`, `SEA_LEVEL = 48`.
- Storage: one `Uint8Array(16*128*16)` of block ids per chunk, index `x + z*16 + y*256`.
- `World` offers `getBlock(x, y, z)` and `setBlock(x, y, z, id)` in world coordinates.
  Reads outside the vertical range return air above and bedrock below. Reads in chunks
  that are not loaded return air for rendering and "solid" for physics (the player must
  never fall through terrain that has not generated yet).
- Chunk lifecycle: `requested → generated → meshed → unloaded`. A chunk is meshed only
  once all four horizontal neighbours are generated, so border faces are correct.
- Load radius = render distance `R` in chunks (default 8, range 2–16). Chunks farther than
  `R + 1` are unloaded and their GPU resources disposed. Load order is nearest first.
- Per frame at most `CHUNK_BUDGET_MS = 6` is spent on generating and meshing; at least one
  job per frame is always processed so progress is guaranteed.
- Edits are kept in memory in a `Map<chunkKey, Map<index, blockId>>` and re-applied when
  an unloaded chunk is generated again, so changes survive walking away and back. They are
  lost on page reload (persistence is Phase 2; this map is its future input).

### 4.2 Blocks

| Id | Name | Solid | Render | Placeable (slot) | Notes |
|---|---|---|---|---|---|
| 0 | air | no | none | – | |
| 1 | grass | yes | opaque | 1 | distinct top / side / bottom tiles |
| 2 | dirt | yes | opaque | 2 | |
| 3 | stone | yes | opaque | 3 | |
| 4 | sand | yes | opaque | 4 | |
| 5 | log | yes | opaque | 5 | distinct end / bark tiles |
| 6 | leaves | yes | cutout | 6 | alpha-tested holes |
| 7 | planks | yes | opaque | 7 | |
| 8 | bricks | yes | opaque | 8 | |
| 9 | glass | yes | cutout | 9 | frame with see-through centre |
| 10 | water | no | translucent | – | static, not breakable, replaceable |
| 11 | bedrock | yes | opaque | – | layer `y = 0`, unbreakable |

The registry is a data table (`src/world/blocks.ts`) so later phases can add blocks without
touching the mesher or physics.

### 4.3 Terrain generation

- Pure function `generateChunk(seed, cx, cz) → Uint8Array`. No dependence on neighbouring
  chunks' data or on generation order.
- Seeded RNG (e.g. mulberry32) and own 2D gradient/simplex noise implementation.
- Height = fractal noise (4–5 octaves) shaped by a low-frequency "continent" noise, giving
  flat areas, hills up to about `y = 100`, and basins below sea level. Target range 24–100.
- Column layers: bedrock at `y = 0`; stone; 3 dirt; top block grass. Columns whose surface
  is within 2 blocks of sea level use sand instead of grass/dirt (beaches and lake beds
  down to 3 blocks deep; deeper beds are dirt). Air below sea level becomes water.
- Trees: decided per column by a hash of `(seed, x, z)`, on grass above the beach band,
  density about 1 per 60 columns, minimum spacing 3. Trunk 4–6 logs, leaf canopy about
  5×5×3 with trimmed corners plus a 3×3 cap. A chunk also evaluates tree origins up to 2
  columns outside its border so canopies crossing chunk borders are complete on both sides.
- Spawn: column `(0, 0)`; if it is under water, search outward in a spiral for the nearest
  dry column. The player starts standing on the surface there.

### 4.4 Textures

- Each tile is 32×32 RGBA, painted by a pure function `(rng) → Uint8ClampedArray` with no
  canvas dependency, seeded with a fixed constant (textures do not vary with the world seed).
- Tiles: grass top, grass side, dirt, stone, sand, log end, log bark, leaves, planks,
  bricks, glass, water, bedrock. Original designs; aim for a soft, slightly painterly look
  with visible structure (grain, speckles, mortar lines), not flat colour.
- Atlas: tiles packed into one texture (e.g. 8×8 grid = 256×256), uploaded as a
  `DataTexture`, nearest filtering for magnification, sRGB colour space. Prevent bleeding
  between tiles (inset UVs by half a texel, or 1–2 px of duplicated border padding, or no
  mipmaps). Pick whichever looks clean at distance and document it.
- The 9 hotbar icons are rendered from the same tile data onto small canvases.

### 4.5 Meshing and lighting

- Pure function: chunk data + neighbour access → typed arrays (position, uv, colour, index)
  for three passes: **opaque**, **cutout** (alpha test), **translucent** (water).
- Only faces adjacent to a non-occluding block are emitted. Opaque blocks occlude; cutout
  blocks do not occlude others; a water face is emitted only against air (not against
  water, and not against solid blocks).
- Water's top surface is lowered by 1/8 block when the block above is not water.
- Face shading baked into vertex colours: top 1.0, north/south 0.8, east/west 0.65, bottom 0.5.
- Ambient occlusion per vertex with the standard 3-neighbour rule (levels 0–3 mapped to
  about 1.0 / 0.8 / 0.65 / 0.5), multiplied into the vertex colour. Flip the quad diagonal
  when needed to avoid the anisotropy artefact.
- No greedy meshing in Phase 1 (it conflicts with atlas UVs and per-vertex AO).
- At most 3 draw calls per chunk. Materials are shared across chunks.
- Fog: linear, from `0.6 × R × 16` to `R × 16` blocks, colour equal to the sky horizon colour.
- An edit remeshes its chunk, plus neighbouring chunks when the block is on a chunk border
  (including diagonal neighbours where AO needs it). Remeshing after an edit is done
  immediately in the same frame, outside the budget.

### 4.6 Player and physics

- Collision box 0.6 × 1.8 × 0.6, eye height 1.62. Camera FOV default 75°.
- Fixed 60 Hz step. Movement is resolved axis by axis (Y, then X, then Z) against solid
  block boxes, so the player slides along walls and cannot tunnel at any reachable speed
  (clamp fall speed to 50 blocks/s).
- Walking: 4.3 blocks/s, sprinting 5.6, with quick acceleration and ground friction;
  reduced air control. Gravity 28 blocks/s². Jump reaches about 1.25 blocks (clears one
  block, not two). No auto-step.
- Flying: no gravity, 10 blocks/s (20 while sprinting), vertical movement with keys,
  collision stays on.
- Swimming (centre of the player's box in water): horizontal speed 2.2 blocks/s, gravity reduced to a slow sink of
  about 2 blocks/s, holding jump rises at about 3 blocks/s, and jumping at the surface next
  to a bank lets the player climb out onto a block one higher than the water surface.
- When the camera is inside water, a blue full-screen tint is shown and fog is shortened.
- Falling below `y = -20` (should be impossible) teleports the player back to spawn.

### 4.7 Controls

| Input | Action |
|---|---|
| Mouse | Look (pointer lock); pitch clamped to ±89° |
| W A S D | Move |
| Space | Jump / swim up / fly up |
| Shift | Sprint (Ctrl is avoided because Ctrl+W closes the browser tab) |
| F | Toggle fly mode |
| C | Fly down |
| Left click | Break targeted block |
| Right click | Place selected block (context menu suppressed) |
| 1–9, mouse wheel | Select block slot |
| F3 | Toggle debug overlay (browser default suppressed) |
| Esc | Release mouse and open pause screen |

Input goes through one `Input` abstraction that exposes state ("is move-forward held",
"look delta this frame"). The test API can feed look deltas without pointer lock.

### 4.8 Block interaction

- Voxel ray traversal (Amanatides–Woo DDA) from the eye along the view direction, reach
  5 blocks. Water and air are passed through; the first other block is the target.
- The target gets a thin dark outline box, slightly inflated to avoid z-fighting.
- Break: target becomes air (or water if any of its 4 horizontal neighbours or the block above
  is water, so holes dug at the shore fill in a simple, non-flowing way). Bedrock cannot
  be broken.
- Place: the selected block goes into the cell in front of the hit face, if that cell is
  air or water, lies within `0 ≤ y < 128`, and does not intersect the player's box.
- Holding a mouse button repeats the action every 250 ms.

### 4.9 Sky and day/night

- Time of day `t ∈ [0, 1)`: 0 = sunrise, 0.25 = noon, 0.5 = sunset, 0.75 = midnight.
  Full cycle 20 minutes real time. New games start at `t = 0.1` (morning).
- Sky dome with a horizon-to-zenith gradient; colours interpolated between key frames for
  sunrise, day, sunset and night. Fog colour follows the horizon colour.
- Sun and moon are procedurally textured quads on opposite sides, moving on an arc; the
  moon is a simple disc with original shading (no copied phases artwork). Stars (random
  points from the seeded RNG) fade in at night.
- World brightness: a daylight factor from 1.0 (day) to 0.25 (night), smoothly blended
  around sunrise and sunset, applied as a multiplier on the chunk materials. Night stays
  bright enough to play because there are no light sources yet.

### 4.10 UI

DOM elements layered over the canvas; styles in `src/ui/ui.css`; system font stack.

- **Crosshair**: small centred plus, readable on bright and dark backgrounds.
- **Block selector bar**: 9 slots at the bottom centre with block icons, the selected
  slot highlighted, and the selected block's name shown briefly on change.
- **Start / pause screen**: title "MarkusCraft", "Click to play" button, controls
  list, settings, and the current seed with a "copy link to this world" button. Shown on
  load and whenever pointer lock is lost. While it is shown the simulation is paused.
- **Settings** (persisted in `localStorage` under `markuscraft.settings.v1`, validated on
  load, applied live): render distance 2–16 (default 8), mouse sensitivity, field of view
  60–110 (default 75).
- **Debug overlay** (F3): FPS, position, facing direction, chunk coordinates, loaded and
  pending chunk counts, draw calls and triangles, seed, time of day, movement mode,
  targeted block.
- If WebGL2 is unavailable, show a readable message instead of a blank page.

### 4.11 URL parameters

| Parameter | Effect |
|---|---|
| `seed=<int>` | World seed (otherwise random 32-bit) |
| `time=<0..1>` | Initial time of day |
| `freeze=1` | Day/night clock does not advance |
| `test=1` | Test mode: no pointer lock needed, start screen skipped, settings ignored (render distance 4, FOV 75), fixed 960×540 logical resolution at pixel ratio 1, `preserveDrawingBuffer` on |

## 5. Test strategy

### 5.1 Layers

1. **Unit tests (Vitest, Node)** for everything in `world/`, `player/`, `util/` and the
   texture painters. Target: at least 85 % line coverage for those folders (enforced via
   Vitest coverage thresholds).
2. **Browser tests (Playwright, Chromium with software WebGL)** against the production
   build served by `vite preview`. They cover wiring, rendering and input.
3. **Reference screenshots** via `expect(page).toHaveScreenshot()` for a small fixed set of
   scenes, stored in `e2e/`.
4. **Self-review by eye**: the session opens the produced screenshots with the Read tool
   after every step that changes visuals and fixes what looks wrong.

### 5.2 Headless WebGL

Launch Chromium with software rendering flags (start with
`--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`; adjust in
step 1 until a Three.js scene renders). Viewport 960×540, device scale factor 1.
`@playwright/test` is pinned to 1.63.0; do not run `playwright install` in the cloud session.
Software rendering is slow: tests use render distance 4 and generous timeouts (60 s per
test), and wait on state rather than sleeping.

### 5.3 Test API (`window.__mc`)

Always present (it is harmless), implemented in `src/game/testApi.ts`:

| Member | Purpose |
|---|---|
| `isReady()` | True once all chunks within the load radius are meshed and one frame was rendered |
| `whenIdle()` | Promise resolving when no chunk jobs are pending and a frame was rendered |
| `getState()` | `{ seed, time, player: {x,y,z,yaw,pitch,mode,onGround,inWater}, chunks: {loaded, pending}, render: {drawCalls, triangles}, selectedSlot, target }` |
| `setPlayer({x,y,z,yaw,pitch,mode})` | Teleport / orient / set walk or fly mode |
| `look(dx, dy)` | Feed a look delta as if the mouse moved |
| `getBlock(x,y,z)` / `setBlock(x,y,z,id)` | World access |
| `surfaceY(x,z)` | Highest non-air, non-leaf block in a column |
| `setTime(t)` | Set time of day |
| `step(n)` | Advance exactly `n` fixed simulation steps and render once (for deterministic physics checks in test mode) |

Keyboard and mouse button behaviour is tested with real Playwright key and mouse events.

### 5.4 Rule-based visual checks

Helpers in `e2e/helpers.ts` read pixels from a screenshot (decode the PNG in Node) and
assert measurable facts, for example:

- The frame is not blank: more than 50 distinct colours, and no single colour covers more
  than 60 % of the pixels.
- Looking straight up at noon: the centre region is blue-dominant (`b > r` and `b > g`).
- Looking straight down from 3 blocks above grass: the centre region is green-dominant.
- After `setBlock` of bricks directly in front of the camera: the centre region's mean
  colour changes by more than a threshold and is red-dominant.
- Noon versus midnight from the same pose: mean luminance at noon is at least 2× midnight.
- Under water: the frame's mean colour is blue-dominant.

### 5.5 Reference screenshots

Fixed scenes with `?test=1&seed=1337&freeze=1`, each after `whenIdle()`:

1. `spawn-noon` – spawn pose, `time=0.25`
2. `overview-noon` – flying 30 blocks above spawn, pitched 30° down
3. `shore` – a pose showing water, beach and trees (find coordinates once, hard-code them)
4. `sunset` – overview pose at `time=0.5`, facing the sun
5. `night` – overview pose at `time=0.75`, showing moon and stars
6. `underwater` – camera inside a lake
7. `build` – a small structure placed via `setBlock` using all 9 placeable blocks, close up
8. `pause-screen` – without `test=1`, showing the start screen (canvas masked)

Tolerance `maxDiffPixelRatio: 0.02`, `threshold: 0.2`. References are generated in the
cloud container and committed. If CI renders differently although the pinned Playwright
version matches: first raise `maxDiffPixelRatio` up to 0.05; if that is still not enough,
run the reference comparisons only when `VISUAL=1` is set (locally in the cloud session),
keep all rule-based checks in CI, and record this in the report. Never loosen or remove
rule-based checks to get CI green.

### 5.6 Console hygiene

A shared Playwright fixture fails any test in which the page logs a console error or
warning or throws an uncaught exception (allow-list only messages proven to come from
software WebGL itself, each with a comment).

## 6. Implementation steps

Work in order. After each step: `npm run check:all` passes, commit, push. Each step lists
its acceptance criteria (AC); all are verified by automated tests unless marked *(manual)*.

### Step 1 – Scaffold, tooling, headless WebGL proof

Create the Vite + TypeScript project, ESLint/Prettier, Vitest, Playwright config, npm
scripts from `CLAUDE.md`, `.nvmrc`, `.gitignore`, the folder structure, and a placeholder
scene (one lit, textured cube) to prove the headless pipeline. Use the latest stable
versions of `three`, `vite`, `vitest`, `typescript` and ESLint at install time.

- AC1.1 `npm run check:all` exits 0 on a fresh clone after `npm ci`.
- AC1.2 A Playwright test loads the built page and the screenshot passes the "not blank" rule.
- AC1.3 ESLint fails if a file under `src/world`, `src/player` or `src/util` imports `three`
  (proven once by a temporary violation; mention in the report).
- AC1.4 The console-hygiene fixture is active.

### Step 2 – CI and deployment

`ci.yml`: on every push (all branches) – `npm ci`, lint, typecheck, unit tests with
coverage, build, install Chromium, e2e; upload the Playwright report and diff images as an
artifact on failure. `deploy.yml`: on push to `main` – build and deploy `dist/` with the
official Pages actions. Use current major versions of the official actions.

- AC2.1 The CI run for the pushed step-2 commit is green (check through the GitHub tools).
- AC2.2 `dist/index.html` references assets with relative URLs (works under `/MarkusCraft/`).
- AC2.3 `README.md` explains how to play, develop and test, and states that the owner must
  set *Settings → Pages → Source* to "GitHub Actions" once.

### Step 3 – Utilities and block registry

Seeded RNG, hash functions, 2D noise with fractal helper, math helpers, block table.

- AC3.1 Same seed → identical RNG sequence; different seeds → different sequences.
- AC3.2 Noise output stays in [-1, 1] over 100 000 samples, is continuous (adjacent samples
  0.01 apart differ by < 0.1), and its mean is within ±0.1 of 0.
- AC3.3 Every block id in the table has complete properties; every referenced tile exists.

### Step 4 – Chunk data, world access, terrain generation

- AC4.1 `generateChunk` is deterministic: same `(seed, cx, cz)` gives byte-identical data;
  another seed gives different data.
- AC4.2 Over a 16×16-chunk area for 3 seeds: every column has bedrock at `y = 0`; surface
  heights lie within 20–110; no air below a column's surface except under tree canopies; every air
  cell at or below sea level that is open to the sky is water; between 10 % and 60 % of
  columns are under water (averaged over the seeds).
- AC4.3 Heights are continuous across chunk borders (neighbouring columns differ by ≤ 3 on
  at least 99 % of border pairs).
- AC4.4 Trees: every log column stands on dirt or grass; a tree whose canopy crosses a
  chunk border has identical leaves whether the two chunks are generated in either order;
  tree density is within 0.5–3 per 100 grass columns.
- AC4.5 `getBlock`/`setBlock` round-trip for positive and negative coordinates, including
  across chunk borders; out-of-range reads behave as specified in 4.1.
- AC4.6 Generating one chunk takes < 15 ms on average in Node (measured over 50 chunks).
- AC4.7 The spawn search returns a dry column for 20 different seeds.

### Step 5 – Procedural textures and atlas

- AC5.1 Every tile painter returns 32×32×4 bytes and is deterministic.
- AC5.2 Opaque tiles are fully opaque; leaves and glass contain both fully transparent and
  fully opaque pixels; water alpha is between 0.5 and 0.85.
- AC5.3 Each tile has visible structure: at least 8 distinct colours (glass: at least 3).
- AC5.4 Mean colours are plausible: grass top green-dominant, water blue-dominant, sand
  light and yellowish, bricks red-dominant, stone near neutral grey.
- AC5.5 Atlas UV lookup returns rectangles inside the atlas that do not overlap.
- AC5.6 *(manual)* An atlas preview image (written by a small dev script to the scratchpad,
  not committed) was viewed and the tiles look distinct and pleasant.

### Step 6 – Mesher

- AC6.1 A single block in empty space yields 6 faces, 24 vertices, 36 indices.
- AC6.2 Two adjacent opaque blocks yield 10 faces; a fully solid 16³ region surrounded by
  solid neighbours yields 0 faces inside.
- AC6.3 Faces at chunk borders are culled using the neighbour chunk's data.
- AC6.4 Pass routing: stone → opaque; leaves and glass → cutout; water → translucent;
  water against water and water against stone emit no face; stone against water does.
- AC6.5 AO: a block on a flat floor has darkened floor vertices around its base with the
  expected levels; an isolated block has no AO darkening. Triangle winding faces outward
  (normal test) for all six directions.
- AC6.6 All UVs fall inside the tile assigned to that block face.
- AC6.7 Meshing one generated terrain chunk takes < 20 ms on average in Node.

### Step 7 – Renderer, chunk manager, test API

Three.js scene, shared materials, chunk meshes, fog, load/unload around the player with
the time budget, `window.__mc`, URL parameters. Camera can be positioned via the test API.

- AC7.1 With `test=1&seed=1337`, `isReady()` becomes true within 60 s and
  `chunks.loaded == (2·4+1)² = 81`, `chunks.pending == 0`.
- AC7.2 After teleporting 320 blocks away and `whenIdle()`, loaded is 81 again, and the
  renderer's geometry count has not grown by more than 10 % (no GPU leaks). Repeat 5 times.
- AC7.3 Unit test of the chunk manager with a fake clock: no more than one job runs after
  the budget is exhausted; jobs run nearest first; a chunk is not meshed before its
  neighbours are generated.
- AC7.4 `render.drawCalls ≤ 3 × loaded chunks + 10`.
- AC7.5 Rule-based checks pass: sky blue looking up, grass green looking down at spawn.
- AC7.6 Reference screenshots `spawn-noon` and `overview-noon` created and reviewed by eye:
  no gaps between chunks, no texture bleeding lines, AO visible at block corners, fog
  hides the world edge.

### Step 8 – Player physics and controls

- AC8.1 Unit: dropped from 5 blocks above flat ground, the player lands with feet exactly
  on the surface (±0.001) and `onGround` true; no sinking after 600 more steps.
- AC8.2 Unit: walking into a wall for 120 steps never penetrates it; moving diagonally
  into a wall slides along it at > 50 % of walking speed.
- AC8.3 Unit: a jump peaks between 1.1 and 1.4 blocks; the player can jump onto a 1-block
  step and cannot get onto a 2-block step.
- AC8.4 Unit: measured ground speeds are 4.3 ± 0.2 (walk) and 5.6 ± 0.2 (sprint) blocks/s.
- AC8.5 Unit: at 50 blocks/s fall speed the player does not pass through a 1-block floor.
- AC8.6 Unit: in fly mode with no input, height is unchanged after 300 steps; collision
  still blocks movement into solid blocks.
- AC8.7 Unit: in water with no input the player sinks slower than 3 blocks/s; holding jump
  rises to the surface and stays there; the player can exit onto a bank one block above the water surface.
- AC8.8 Unit: a 2-block-high, 1-block-wide tunnel can be walked through; a 1-block-high
  gap cannot be entered.
- AC8.9 E2E: holding W for a number of steps moves the player along the facing direction;
  Space raises `y` then returns to ground; F switches `mode` to fly; `look()` changes yaw
  and pitch and pitch is clamped to ±89°.
- AC8.10 E2E: with terrain not yet loaded under the player (teleport far away), the player
  does not fall below the eventual surface.

### Step 9 – Block interaction and selector bar

- AC9.1 Unit: the raycast returns the correct block and face for rays along all six axes
  and for diagonal rays; returns nothing beyond reach 5; passes through water.
- AC9.2 Unit: placement is refused inside the player's box, outside the height range and
  into occupied cells; allowed into water. Bedrock is not breakable.
- AC9.3 E2E: aimed at the ground, a left click turns the targeted block into air and the
  centre pixels change; a right click then puts the selected block there again.
- AC9.4 E2E: keys 1–9 and wheel change `selectedSlot` (wheel wraps around) and the
  highlighted slot in the DOM follows.
- AC9.5 E2E: editing a block on a chunk border leaves no hole or stale face (compare a
  screenshot rule on both sides of the border, and unit-test the remesh set).
- AC9.6 E2E: an edited block is still there after teleporting 320 blocks away and back.
- AC9.7 E2E: the target outline is visible (pixel difference with and without a target).
- AC9.8 Reference screenshot `build` created and reviewed.

### Step 10 – Sky and day/night cycle

- AC10.1 Unit: sky colours and the daylight factor are continuous over `t` (no jump larger
  than 0.02 per 0.001 step, including the wrap from 1 to 0); factor is 1.0 at noon and
  0.25 at midnight; sun height is maximal at `t = 0.25` and the moon is opposite.
- AC10.2 Unit: with `freeze` off, 20 minutes of simulated steps advance `t` by exactly one
  cycle; with `freeze` on, `t` does not change.
- AC10.3 E2E: noon mean luminance ≥ 2 × midnight from the same pose; at midnight the
  terrain is still distinguishable (mean luminance of the lower half > 12 of 255).
- AC10.4 E2E: the sun is visible at `t = 0.25` looking up (bright warm region in the
  frame) and the moon at `t = 0.75`.
- AC10.5 Reference screenshots `sunset`, `night`, `shore`, `underwater` created and reviewed.

### Step 11 – UI: start/pause screen, settings, debug overlay

- AC11.1 E2E (without `test=1`): the start screen is visible on load with title, play
  button and controls list; the simulation is paused while it is shown (`time` and player
  position do not change over 30 frames).
- AC11.2 E2E: changing render distance in settings to 2 results in 25 loaded chunks after
  `whenIdle()`; changing FOV changes the camera's FOV; values survive a page reload;
  corrupt `localStorage` content falls back to defaults without errors.
- AC11.3 E2E: F3 toggles the overlay; it shows position values matching `getState()`.
- AC11.4 E2E: without a `seed` parameter two page loads get different seeds; with
  `seed=42` the seed is 42 and the "copy link" URL contains `seed=42`.
- AC11.5 E2E: crosshair and selector bar are visible during play and hidden behind the
  pause screen.
- AC11.6 Reference screenshot `pause-screen` created and reviewed.
- AC11.7 *(manual)* The pointer-lock path (click to play, Esc to pause) is implemented
  with the standard API; it is exercised in Playwright as far as headless Chromium allows,
  and any part that cannot be automated is listed in the report for the owner to try.

### Step 12 – Hardening, performance, documentation, pull request

- AC12.1 Soak test (E2E): fly in a straight line for 2 000 blocks in test mode via
  repeated teleports of 64 blocks with `whenIdle()`; afterwards loaded chunks = 81, no
  console errors, and JS heap growth is below 50 MB (via `performance.memory` when available).
- AC12.2 Frame-time proxy: in Node, generating + meshing 81 chunks takes < 3 s in total.
- AC12.3 Coverage thresholds from 5.1 are met and enforced in CI.
- AC12.4 A repo-wide search finds no occurrence of "minecraft" or "mojang" outside
  `CLAUDE.md`, `README.md` and `docs/` (where they only appear in the asset rule), and no
  image, audio or font files other than the e2e reference screenshots.
- AC12.5 `docs/phase-1-report.md` is written (contents per Definition of Done) including a
  short list of things only a human can judge: feel of movement, real-GPU frame rate
  (target 60 FPS at render distance 8 on a mid-range laptop), pointer lock, look of textures.
- AC12.6 `CLAUDE.md` is updated (structure, commands, status line "Phase 1: implemented").
- AC12.7 CI is green on the final commit and one pull request into `main` is open.

## 7. Risks and fallbacks

| Risk | Fallback (decide without asking) |
|---|---|
| Headless WebGL does not start with the given flags | Try `--use-gl=angle`, `--use-gl=swiftshader`, headed mode under `xvfb-run`; record what works |
| Software rendering too slow for tests | Lower test render distance to 3 and viewport to 640×360; adjust chunk-count expectations accordingly |
| Reference screenshots differ between container and CI | Procedure in 5.5 |
| Translucent water sorting artefacts | Render water after everything else with depth write off; accept minor artefacts between overlapping water chunks |
| Texture bleeding at tile borders | Options listed in 4.4 |
| Chunk loading stutters on the main thread | Lower `CHUNK_BUDGET_MS`, split generate and mesh into separate jobs; workers stay out of scope |
| Pointer lock not testable headlessly | Covered by `test=1` mode; manual item in the report |
| Deploy workflow cannot be verified before merge | Verify that `npm run build` output works via `vite preview` under a sub-path; state in the PR that Pages must be enabled |
