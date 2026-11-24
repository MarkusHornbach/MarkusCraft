# src/bot/ — the goal bot (Phase 8 part A)

Pure core like `src/progress/` (no `three`, DOM, `Math.random`, `Date.now`; in the coverage
scope). The seed of the bot and balancing tool later parts extend.

## Files

- `Bot.ts` (`Bot`, `runBot`, `playerMinutes`), `report.ts` (median and maximum per task,
  chapter and level-up, the balance targets, Markdown), `bot.slow.test.ts` (seed 1337,
  balanced, few trees: the book completes, every recipe unlocked, light invariant holds)
- `scripts/progressRun.ts` runs it: `npx vite-node scripts/progressRun.ts` (12 runs: seeds
  1, 1337, 42, 2024 × flat, balanced, hilly, trees "Few"; about a minute), `--quick` (seed
  1337 balanced only).

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

## Time model and the table

Bot time: break times from `breakTimeMs` with the tool held, walking distance ×
`BOT_TIME.pathFactor` / `walkSpeed`, a pillar block per `1 / pillarSpeed` s, `smeltMs` per
furnace craft, `craftRepeatMs` per other craft, `actionRepeatMs` per placed block.
Estimated player time = bot time × `humanFactor` (2.5, to be calibrated by device test
PROG-1). The script prints, per task, chapter and level-up, the median and maximum
estimated minutes over the runs and checks the targets: total 30–45 minutes, no task above
5, no chapter above 12, no gap between level-ups above 8 (medians). A task's time is the
time since the previous task was finished, so a task done as a by-product shows near 0.
