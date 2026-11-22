# src/items/ — items, inventory, break times, recipes

Pure core (see "Architecture invariants" in the root `CLAUDE.md`).

## Files

- `items.ts` (item table, tools), `inventory.ts` (functions on the 36 slots),
  `hardness.ts` (break times, tool speed, gating, drop table), `recipes.ts` (recipe table,
  stations near a player, recipe status)

Item ids and recipe ids are stable (append-only, pinned by `items.test.ts` and
`recipes.test.ts`; see "Stable ids" in the root). Slot-changing inventory functions are
called only inside `src/actions/` (`src/actions/CLAUDE.md`).

## Tools and gating

The item in the selected slot decides: a tool of the block's class (`pickaxe`, `axe`,
`shovel`) divides the hand time by 2, 4 or 8 (wood, stone, iron); everything else counts
as the hand. Stone and coal ore yield their item only with a pickaxe, iron ore only with a
stone or iron one; without it the block breaks at hand speed, yields nothing and is not
refused by a full inventory. The HUD then shows "Needs a pickaxe" / "Needs a stone
pickaxe". Tools have stack size 1 and cannot be placed.

## Crafting

`items/recipes.ts` is the one recipe table (ids 1–20, append-only like item ids, pinned by
`recipes.test.ts`). A recipe has ingredients, one result and optionally a station
(`workbench`, `furnace`): a placed block whose centre lies within `STATION_REACH` (5) of
the eye. `craft` answers `invalid` (unknown recipe), then `station`, `missing`, `full`;
ingredients are taken from the last slots first. The furnace has no state in the world:
its two seconds (`SMELT_MS`) are a progress bar in `Game`, which submits `craft` when the
bar is full and forgets it when the screen closes.

The recipe list on screen (table order, fixed rows, hold to craft, scroll position) is in
`src/ui/CLAUDE.md`.

Before changing recipes, tools or the break rules read the "Decisions and deviations" of
`docs/phase-3b-report.md` and `docs/phase-3c-report.md`.
