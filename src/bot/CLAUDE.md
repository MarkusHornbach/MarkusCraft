# src/bot/ — the goal bot (Phase 8 part A)

Pure core like `src/progress/` (no `three`, DOM, `Math.random`, `Date.now`; in the coverage
scope). The seed of the bot and balancing tool later parts extend.

## Files

- `Bot.ts` (`Bot`, `runBot`, `playerMinutes`), `report.ts` (median and maximum per task,
  chapter and level-up, the balance targets, Markdown), `bot.slow.test.ts` (seed 1337,
  balanced, few trees: the book completes, every recipe unlocked, light invariant holds),
  `botV3.slow.test.ts` (the same on generator 3), `darkBreak.test.ts`
- `walk.ts` (the walk check), `caveWalks.ts` (entrances, ravines, shafts; the report
  section), `caveWalks.slow.test.ts` (Phase 8 part B2a AC3.1–AC3.3)
- `scripts/progressRun.ts` runs it: `npx vite-node scripts/progressRun.ts` (12 runs: seeds
  1, 1337, 42, 2024 × flat, balanced, hilly, trees "Few", generator 3; about a minute),
  `--quick` (seed 1337 balanced only), `--gen 2` (generator 2, for comparisons).

## How it plays

A `LocalSession` with the real progress engine; every action must be accepted (a refusal
ends the run with the task and position). It knows the world (chunks are generated as it
looks) but breaks every block between itself and a target, stands only in free cells and
falls to the floor after a step; going up is a step onto a block or a pillar of placed
blocks. It plays the open chapter's tasks in table order, one generic skill per task type:
`mineOne` (the nearest block that yields the item, never under water, after making the
tool the gating needs), `craftOnce` through `obtain` (mined if a natural block yields it,
otherwise crafted through the recipe graph), `placeOne`, `digTo` (a staircase down, away
from water) and `climbTo` (a hill nearby, else a pillar). Stations are placed when a recipe
needs one and taken back when the task is done. Junk (leaves, clay, grass, dirt, sand) is
thrown away when the inventory is full; one stack of pillar blocks stays.

## The radar (Phase 8 part B1)

The bot ignores the radar. At the start of tasks 12 and 16 (`RADAR_CHECK_TASKS`) it
generates every chunk within `RADAR_RADIUS` and records the radar's nearest vein of the
task's kind and the nearest ore block of a brute-force scan (`BotRun.radar`); the slow test
wants them equal, and `radarUnlocked` true at the end. `scripts/progressRun.ts` prints a
"Radar" section (`formatRadar`): when the radar unlocks, the median distance and `dy` at
those tasks, and whether every run agreed.

## Time model and the table

Bot time: break times from `breakTimeMs` with the tool held, walking distance ×
`BOT_TIME.pathFactor` / `walkSpeed`, a pillar block per `1 / pillarSpeed` s, `smeltMs` per
furnace craft, `craftRepeatMs` per other craft, `actionRepeatMs` per placed block.
Estimated player time = bot time × `humanFactor` (2.5, to be calibrated by device test
PROG-1). The script prints, per task, chapter and level-up, the median and maximum
estimated minutes over the runs and checks the targets: total 30–45 minutes, no task above
5, no chapter above 12, no gap between level-ups above 8 (medians). A task's time is the
time since the previous task was finished, so a task done as a by-product shows near 0.

## Dark breaks (Fix Adventure 1)

A report, never a failure: a break counts as dark while no light-source recipe is
unlocked for the bot and the brightest of the block's six faces has `max(sky, block)` ≤
`DARK_LIGHT` (4); the bot lights the 3 × 3 chunks around the block first.
`BotRun.darkBreaks` lists them per task and block; `scripts/progressRun.ts` prints the
median and maximum per task, all blocks and `DARK_BLOCKS` only. What it cannot judge: a
player digs open pits where the bot tunnels sideways, the bot ignores the night, and how
dark is too dark on a real screen (device test PROG-11).

## The walk check (Phase 8 part B2a)

`walkTo` (pure) is a breadth-first search over standing cells (air or torch, a solid cube
below, a free cell above) of the blocks as they are: a 4-neighbour at the same height, one
up (with a free cell above the head first) or any drop; never water, a solid block or a
leaf; options: a block-light floor, limits, an `allowed` cell test, the path found. It
proves generator 3's promises without digging: every entrance within 96 of the spawn
reaches y ≤ 30 from its mouth and back (standing in its own cells or on the surface
beside it, never in another cave or a shaft), every ravine's floor from the surface, the
spawn shaft's top to its chamber and back in torch light. The bot does not use caves; on
generator 3 it may fall into one and climbs out with its pillar (it takes a torch out of
its feet cell first). Dark breaks of tasks 1–11 equal generator 2's (`docs/phase-8b2a-report.md`).
