# src/progress/ — task book, experience, recipe unlocks (Phase 8 part A)

Pure core (see "Architecture invariants" in the root `CLAUDE.md`): no `three`, DOM,
`Math.random` or `Date.now`. Used in Adventure worlds only (internal mode id `gathering`).

## Files

- `tables.ts` (chapters, tasks, levels, recipe unlocks, first-find and first-craft XP, the
  bot's time model `BOT_TIME`), `check.ts` (static check: ids, references, reachability by
  fixed point)

## Tables

Plain data; tuning never touches logic. Chapter and task ids are written into saves:
append-only, never reused or renumbered (pinned by `tables.test.ts`, like recipe ids). A
saved task id this build does not know is ignored on load. Every recipe has exactly one
unlock, `{ level }` or `{ task }`; level 1 recipes are open from the start. Task types:
`mine` (items received from breaking, target an item id), `craft` (items made, the result
count), `place` (a block id), `reachBelow` / `reachAbove` (a feet Y, count 1).

## Static check

`checkTables(tables)` checks the structure (unique ids, known chapters, items, blocks,
levels and tasks, 1–6 tasks per chapter, rising levels, one unlock per recipe), then plays
the book abstractly: per open chapter it completes every task whose requirement can be
produced from `NATURAL_BLOCKS` with the gating of `hardness.ts` and the recipes unlocked so
far, adding the task's XP and the first crafts and finds the task cannot avoid (an item
with one recipe and no natural source, an ore that is the only source). It returns the
guaranteed XP after each chapter; failures name the task or recipe.
