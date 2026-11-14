# Phase 3 part C report – Crafting (hand-over, not finished)

Plan: [`phase-3-plan.md`](phase-3-plan.md), Part C (steps 10–13). Branch
`claude/phase-3-part-c-crafting-zzb5fk`. The owner stopped the session during step 12.
This file is a hand-over for the session that finishes the part; rewrite it as the final
report then. No pull request is open yet.

## Status per step

| Step                                    | Status                                                | Notes                                                                                                                                                                                                                                                               |
| --------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10 – items, recipes, stations (core)    | Done, commit `99653ff`, pushed                        | `npm run check:all` passed (112 browser tests) after `palette.png` was regenerated and looked at                                                                                                                                                                    |
| 11 – tools and gating                   | Done, commit `f59c354`                                | `npm run check` passes. The full browser run was stopped with the session: 112 of 116 tests had passed, none had failed. The four new tests of this step and the adapted ones passed in a separate run. **Run `npm run check:all` once more before building on it** |
| 12 – recipe list                        | In progress, commit "ui: recipe list … (in progress)" | Code written, passes `npm run check` (types, lint, unit tests). **Never run in a browser, no browser test, no reference screenshot**                                                                                                                                |
| 13 – hardening, documents, pull request | Not started                                           | –                                                                                                                                                                                                                                                                   |

Starting point: `npm ci`, `npm run check` and the browser suite were green on `main`
(two menu tests timed out only while unit tests ran in parallel, and passed alone).

## To do, in order

1. `npm ci`, `npm run check:all` (alone, nothing else running). Fix what step 12's
   unfinished code breaks in existing tests (expected: none; `getState().ui` gained `tab`).
2. Step 12: open the game (`?test=1&mode=gathering`), press `E`, choose "Crafting" and
   look at it (`node scripts/shot.mjs`); fix layout at 960 × 540 and at 640 × 360 touch
   (the list is 524 × 256 px, 246 px on low screens; tabs sit in the header between title
   and "Close"). Then write the browser tests AC12.1–AC12.6 (in `e2e/crafting.spec.ts`,
   touch layout in `e2e/touchLayout.spec.ts`) and the references `recipe-list`,
   `recipe-list-touch`, `item-icons` (plan: give every item, open the inventory, capture
   the panel), `stations` (workbench and furnace placed). Update the image count in
   `src/util/repoHygiene.test.ts` (15 → 19). Look at every reference.
3. Step 13: play-through AC13.1 and soak AC13.2 (`e2e/soak.spec.ts` or
   `gathering.spec.ts`; add `craft` to the random mix), hygiene check, `README.md` ("How
   to play Gathering": first steps, recipe table, tool table), `CLAUDE.md` (structure:
   `items/recipes.ts`, `ui/RecipeList.ts`, `scripts/iconPreview.ts`; actions: `craft`,
   reason `station`; tools and gating; test API `recipes`, `smelting`, `ui.tab`; status
   "Phase 3: implemented (parts A–C)"), this report in its final form with the manual list
   and "Notes for Phase 4".
4. Merge `main`, `npm run check:all`, one pull request into `main`, wait for green CI.

## What exists

- **Blocks** (ids appended): workbench 15, furnace 16, stone bricks 17, iron block 18; six
  new tiles (16–21) painted in `render/textures/tiles.ts`. All four are in the Creative
  palette.
- **Items**: stick 257, iron ingot 258, wooden / stone / iron pickaxe, axe, shovel 259–267
  (`ItemDef.tool = { class, tier }`, stack size 1). Icons in `render/textures/itemIcons.ts`;
  `npx vite-node scripts/iconPreview.ts out.png` writes an enlarged sheet.
- **Recipes** (`items/recipes.ts`): 19 recipes with stable ids 1–19, `stationsNear`,
  `recipeStatus`, `craftable`, `missing`, `listRecipes` (craftable first).
- **Action `craft { recipe }`**: Gathering only (`mode` in Creative); `invalid` for an
  unknown recipe, then `station`, `missing`, `full`. It clears a running break and
  returns no notices.
- **Tools and gating** (`items/hardness.ts`): `breakTimeMs(block, held)`,
  `toolSpeed`, `missingTool`, `dropOf(block, held)`. HUD hint "Needs a pickaxe" / "Needs a
  stone pickaxe" (`Game.toolHint`), shown unless "Inventory full" is showing.
- **Step 12 code (untested in a browser)**: `ui/RecipeList.ts`; tabs "Items" / "Crafting"
  in `InventoryScreen` (Gathering only); in `Game`: `craft`, `continueCrafting` (furnace
  progress for `SMELT_MS` on the simulation clock, hold-to-repeat every `CRAFT_REPEAT_MS`),
  `stopCrafting` on close; `getState()` has `recipes`, `smelting`, `ui.tab`.

## Decisions and deviations so far

| Topic                                                         | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                    | Why                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| AC10.1 "no two recipes have the same ingredients and station" | Not met as written: plan 5.6 gives pickaxe and axe of a tier the same ingredients. The recipe table of 5.6 was kept; the test checks that no two recipes are the same in ingredients, station **and result**, and that these three pairs are the only ones sharing ingredients                                                                                                                                                              | The table is the decision made with the owner; a list (no grid) tells recipes apart by their result |
| Recipe order                                                  | Table order follows progress: planks, sticks, workbench, wooden tools, stone tools, furnace, coal, iron ingot, iron tools, stone bricks, glass, bricks, iron block                                                                                                                                                                                                                                                                          | The list shows each group "in table order"                                                          |
| Recipe ids                                                    | Numbers 1–19 in that order, pinned by a test; `decodeAction` accepts 1–65535 and `applyAction` answers `invalid` for an unknown one                                                                                                                                                                                                                                                                                                         | As item ids                                                                                         |
| Taking ingredients                                            | From the last slots first (`takeItems`), so the bar keeps its stacks longest                                                                                                                                                                                                                                                                                                                                                                | –                                                                                                   |
| Station distance                                              | Centre of the station block within 5.0 of the eye, in all three directions                                                                                                                                                                                                                                                                                                                                                                  | Plan 5.2                                                                                            |
| `craft` notices                                               | None (no "+4 Planks")                                                                                                                                                                                                                                                                                                                                                                                                                       | The HUD is hidden while the list is open                                                            |
| Furnace tiles                                                 | The opening is on all four sides; top and bottom show a flue                                                                                                                                                                                                                                                                                                                                                                                | Blocks have no direction                                                                            |
| Gated block and full inventory                                | `startBreak` checks room only for what the held item would yield                                                                                                                                                                                                                                                                                                                                                                            | AC11.2                                                                                              |
| AC10.3 path                                                   | `src/actions/ironPickaxePath.test.ts`, seed 1337: 9 logs by hand (3 → planks, 6 → 3 coal in the furnace), workbench, wooden pickaxe, 11 stone, stone pickaxe, furnace, 3 iron ore at y 22, iron pickaxe. 129 actions, 62.1 s of breaking, about 24 blocks walked. Walking is not an action: the script moves the pose, only into free cells, and breaks only blocks that lie open. Going up stands for stacking blocks and is not simulated | "A scripted sequence of valid actions only"                                                         |
| AC10.6                                                        | Unit test with a literal Part B record (`saveFormat.test.ts`); the format is unchanged (version 1)                                                                                                                                                                                                                                                                                                                                          | –                                                                                                   |
| Hold "Craft" (step 12, as coded)                              | Press starts a hold; every 250 ms of simulation time it crafts; a quick click or tap crafts once on release. A press that the browser turns into scrolling crafts nothing                                                                                                                                                                                                                                                                   | AC12.4, AC12.6                                                                                      |
| Furnace (step 12, as coded)                                   | One item at a time; the `craft` action is sent when the bar is full; closing the screen forgets it                                                                                                                                                                                                                                                                                                                                          | Plan 5.6                                                                                            |

Part B tests adapted: `breaking.test.ts` (coal and stone need a pickaxe; random run
counts notices), `hardness.test.ts`, `items.test.ts`, `blocks.test.ts`,
`itemIcons.test.ts` (opaque share from 0.15: the stick is thin), `actions.test.ts`,
`pipeline.test.ts` (`takeItems`, `takeIngredients`; `recipes.ts` may ask what would be
left), `e2e/breaking.spec.ts` (coal ore with a wooden pickaxe: 105 steps),
`e2e/gathering.spec.ts` (soak: `craft` is a real action now; breaks count their notices),
`e2e/inventoryScreen.spec.ts` (16 palette blocks; `palette.png` regenerated and looked at).

## Known issues and open points

- The recipe list reorders after every craft (plan: "the order updates"): a second quick
  tap can land on another recipe's button. To be judged in step 12 and listed for the
  owner.
- Assumption: Part B's break times and inventory are used as they are; the owner has not
  tried them on a device yet.
- Never run two heavy things at once: unit tests during the browser suite made two menu
  tests time out.
