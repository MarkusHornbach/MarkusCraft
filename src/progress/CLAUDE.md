# src/progress/ — task book, experience, recipe unlocks (Phase 8 part A)

Pure core (see "Architecture invariants" in the root `CLAUDE.md`): no `three`, DOM,
`Math.random` or `Date.now`. Used in Adventure worlds only (internal mode id `gathering`).

## Files

- `tables.ts` (chapters, tasks, levels, recipe unlocks, first-find and first-craft XP,
  `NATURAL_BLOCKS`, the bot's time model `BOT_TIME`), `check.ts` (static check),
  `progress.ts` (`WorldProgress`, levels, unlocks, `stepProgress`), `events.ts`
  (`eventsOf`), `view.ts` (what the screens show: Tasks tab, tracker, notices, F3 row, lock
  texts), `book.ts` (book versions: `upgradeBook` brings an older world's book, saved as
  `progress.book`, up to `BOOK_VERSION`, now 2; Phase 8 part B3a)

## Tables

Plain data; tuning never touches logic. Chapter and task ids are written into saves:
append-only, never reused or renumbered (pinned by `tables.test.ts`, like recipe ids). A
saved task id this build does not know is ignored. Every recipe has exactly one unlock,
`{ level }` or `{ task }`; level 1 recipes are open from the start. The torch (recipe 20)
comes with task 11 "Make 16 coal" (coal from logs, no light needed; Fix Adventure 1).
`recipeUnlocked` also returns true for a recipe in the player's `crafted`: a recipe made
once is never locked again, whatever a later table says (in a room, each player's own
record decides). The static check does not use that rule. Task types: `mine`
(items received from breaking, target an item id), `craft` (items made, the result count),
`place` (a block id), `reachBelow` / `reachAbove` (a feet Y, count 1), `store` (Phase 8
part B3a2: items a player moves from its own slots into a chest by `chestMove` or
`quickMove`, what the chest gained of the target item; not `takeAll`, not moves inside the
chest; event `{ kind: 'store', item, count }`). The chest (recipe 21) comes with task 6.
Counts, XP and the
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
task unlocks, chapters) and `outcomesOfRecord` (its own finds, XP and level-ups). **Feature unlocks** (Phase 8 part B1): `FEATURE_UNLOCKS` gives each `Feature` (only
`radar`, task 8) one unlock; features are not saved. `featureUnlocked` reads the level from
the record and the task from the world's book (in a room everyone has it); the outcomes
`unlocked` and `levelUp` carry `features` only when there are some ("Unlocked: Torch,
Radar"); `featureLockText` ("Task: Climb to height 64"); `checkTables` checks one unlock
per feature and names a feature whose task is never done. **Extension points** for later parts: a new event
kind is one union member in `events.ts`; a new task type one member of `TaskType` and one
`case` in `advance` (`progress.ts`), one in `check.ts` and one skill in the bot.

## Book versions and later task additions (Phase 8 part B3a)

Task 21 "Store 32 stone in a chest" joined chapter 3 after task 12 (book order is the
table's order, not id order). Book 2's rule (`BOOK_UPGRADES`): a book 1 with tasks 9–12
done gets task 21 done, without XP or notice; otherwise nothing changes. `decodeMeta` runs
it, so a host's room always opens upgraded. **The rule for later additions:** a task added
to an existing chapter raises `BOOK_VERSION` and adds one rule (the chapter's other tasks
done → the new one done); no save format change.

## The tracked task (Polish 2)

`trackedTask(record, progress)` is what the HUD tracker shows: null if `record.track` is
`-1` or the book is complete; the chosen task while it is an open task of the open
chapter; otherwise the first open task of the open chapter after the chosen one in table
order, wrapping around (with `track` 0, or an unknown id: the chapter's first open task).
Nothing is written when the shown task moves on. `trackerText` / `trackerCount` give the
line ("Mine 32 logs 12 / 32", "–" for a reach task).

## Static check

`checkTables(tables)` checks the structure (unique ids, known chapters, items, blocks,
levels and tasks, 1–6 tasks per chapter, rising levels, one unlock per recipe), then plays
the book abstractly: per open chapter it completes every task whose requirement can be
produced from `NATURAL_BLOCKS` with the gating of `hardness.ts` and the recipes unlocked so
far, adding the task's XP and the first crafts and finds the task cannot avoid (an item
with one recipe and no natural source, an ore that is the only source). It returns the
guaranteed XP and the unlocked recipes after each chapter; failures name the task or
recipe. A `store` task needs its item and a chest.

**The light rule** (Fix Adventure 1): `DARK_BLOCKS` (`darkBlocks` in the tables: coal and
iron ore) are found only in the dark. A light source is a recipe whose result block emits
light (`isLightSource`; the torch). Until one is unlocked and can be made, dark blocks are
no source and a `reachBelow` task cannot be done; a stuck task then says `needs light
(coal ore), no light source before it`. So no unlock may need the thing it unlocks.
