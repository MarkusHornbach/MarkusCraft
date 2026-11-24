# src/progress/ — task book, experience, recipe unlocks (Phase 8 part A)

Pure core (see "Architecture invariants" in the root `CLAUDE.md`): no `three`, DOM,
`Math.random` or `Date.now`. Used in Adventure worlds only (internal mode id `gathering`).

## Files

- `tables.ts` (chapters, tasks, levels, recipe unlocks, first-find and first-craft XP,
  `NATURAL_BLOCKS`, the bot's time model `BOT_TIME`), `check.ts` (static check),
  `progress.ts` (`WorldProgress`, levels, unlocks, `stepProgress`), `events.ts`
  (`eventsOf`), `view.ts` (what the screens show: Tasks tab, notices, F3 row, lock texts)

## Tables

Plain data; tuning never touches logic. Chapter and task ids are written into saves:
append-only, never reused or renumbered (pinned by `tables.test.ts`, like recipe ids). A
saved task id this build does not know is ignored. Every recipe has exactly one unlock,
`{ level }` or `{ task }`; level 1 recipes are open from the start. Task types: `mine`
(items received from breaking, target an item id), `craft` (items made, the result count),
`place` (a block id), `reachBelow` / `reachAbove` (a feet Y, count 1). Counts, XP and the
level thresholds are tuned with the goal bot (`src/bot/CLAUDE.md`); the tuning rounds are
in `docs/phase-8a1-report.md`. Engine tests use the plan's starting values
(`src/testing/startingTables.ts`) so that tuning does not touch them.

## Progress and the step

`WorldProgress { done, counts }` belongs to the world (saved in `WorldMeta.progress`);
the open chapter is derived (the first with a task not done). XP, first finds (`found`) and
first crafts (`crafted`) live in the `PlayerRecord`. `eventsOf(action, result, ctxBefore)`
turns an accepted action into events (`mine` with the broken block's drop only, `craft`
with the result, `place`); the pose step is `{ kind: 'pose', y }`, which returns the same
objects unless a reach task is open. `stepProgress(world, actor, event, present)` counts
only for tasks of the open chapter, never carries a surplus, gives a finished task's XP to
everyone in `present` and first finds and crafts to the actor, and reports outcomes
(`taskDone`, `chapterDone`, `xp`, `firstFind`, `levelUp`, `unlocked`). It is called only by
the sessions (`src/actions/CLAUDE.md`). A guest of a room never steps: it rebuilds what to
show from the host's messages, `outcomesOfBook` (finished tasks with the player's name,
task unlocks, chapters) and `outcomesOfRecord` (its own finds, XP and level-ups). **Extension points** for later parts: a new event
kind is one union member in `events.ts`; a new task type one member of `TaskType` and one
`case` in `advance` (`progress.ts`), one in `check.ts` and one skill in the bot.

## Static check

`checkTables(tables)` checks the structure (unique ids, known chapters, items, blocks,
levels and tasks, 1–6 tasks per chapter, rising levels, one unlock per recipe), then plays
the book abstractly: per open chapter it completes every task whose requirement can be
produced from `NATURAL_BLOCKS` with the gating of `hardness.ts` and the recipes unlocked so
far, adding the task's XP and the first crafts and finds the task cannot avoid (an item
with one recipe and no natural source, an ore that is the only source). It returns the
guaranteed XP after each chapter; failures name the task or recipe.
