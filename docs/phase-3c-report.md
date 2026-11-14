# Phase 3 part C report – Crafting

Plan: [`phase-3-plan.md`](phase-3-plan.md), Part C (steps 10–13). Branch
`claude/phase-3-part-c-crafting-zzb5fk`. Implemented in two cloud sessions: the first was
stopped by the owner during step 12, the second finished steps 12 and 13. With this part
Phase 3 is implemented (parts A–C); part D (Web Workers) is optional.

## What was built

- **Blocks** (ids appended): workbench 15, furnace 16, stone bricks 17, iron block 18; six
  new tiles (16–21) painted in `render/textures/tiles.ts`. All four are in the Creative
  palette.
- **Items**: stick 257, iron ingot 258, wooden / stone / iron pickaxe, axe, shovel 259–267
  (`ItemDef.tool = { class, tier }`, stack size 1). Icons in `render/textures/itemIcons.ts`;
  `npx vite-node scripts/iconPreview.ts out.png` writes an enlarged sheet.
- **Recipes** (`items/recipes.ts`): the 19 recipes of plan 5.6 with stable ids 1–19,
  `stationsNear`, `recipeStatus`, `craftable`, `missing`, `listRecipes` (craftable first).
- **Action `craft { recipe }`**: Gathering only (`mode` in Creative); `invalid` for an
  unknown recipe, then `station`, `missing`, `full`. It clears a running break and
  returns no notices.
- **Tools and gating** (`items/hardness.ts`): `breakTimeMs(block, held)`, `toolSpeed`,
  `missingTool`, `dropOf(block, held)`. HUD hint "Needs a pickaxe" / "Needs a stone
  pickaxe" (`Game.toolHint`), shown unless "Inventory full" is showing.
- **Recipe list** (`ui/RecipeList.ts`): the tab "Crafting" of the inventory screen in a
  Gathering world. One row per recipe with result icon, name, count, ingredients as
  "have / need" (red when short), a note for a missing station or a full inventory, and a
  "Craft" button on craftable rows. Craftable rows come first. Holding the button repeats
  four times a second.
- **Furnace**: a progress bar in the row for two seconds, then the `craft` action; closing
  the screen cancels it. The furnace has no state in the world.
- **Test API**: `getState()` has `recipes [{ id, name, craftable, missing, stationMissing }]`
  in list order, `smelting { recipe, progress } | null` and `ui.tab`.
- **Test helpers**: `e2e/sites.ts` (nearest tree, beach and bare rock; shared by both
  play-throughs), `swipe` in `e2e/touch.ts` (a finger drag that the browser may take over
  for scrolling).
- **References**: `recipe-list`, `recipe-list-touch` (640 × 360), `item-icons`, `stations`
  (new); `palette` regenerated in step 10 (16 blocks). All were opened and judged by eye:
  every icon is told apart without its label (pickaxe, axe and shovel by their heads, the
  tiers by the head colour: brown, grey, white), short ingredients stand out in red, no
  text overflows, the half row at the bottom shows that the list goes on.
- **Documents**: `README.md` ("How to play Gathering": first steps, recipe table, tool
  table), `CLAUDE.md`.

## Acceptance criteria

| Criteria       | Where                                                                                                                                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC10.1, AC10.2 | `src/items/recipes.test.ts`, `src/actions/actions.test.ts` (AC10.1 with the deviation below)                                                                                                                                                         |
| AC10.3         | `src/actions/ironPickaxePath.test.ts`                                                                                                                                                                                                                |
| AC10.4         | `src/render/textures/itemIcons.test.ts`                                                                                                                                                                                                              |
| AC10.5         | `e2e/crafting.spec.ts`                                                                                                                                                                                                                               |
| AC10.6         | `src/save/saveFormat.test.ts` (a literal Part B record)                                                                                                                                                                                              |
| AC11.1, AC11.2 | `src/items/hardness.test.ts`, `src/actions/breaking.test.ts`                                                                                                                                                                                         |
| AC11.3–AC11.5  | `e2e/crafting.spec.ts`                                                                                                                                                                                                                               |
| AC12.1–AC12.5  | `e2e/crafting.spec.ts`                                                                                                                                                                                                                               |
| AC12.6         | `e2e/touchLayout.spec.ts` (640 × 360 and 1280 × 800: sizes, scrolling, taps) and `e2e/crafting.spec.ts` (a drag that starts on a "Craft" button)                                                                                                     |
| AC12.7         | `e2e/crafting.spec.ts` (`recipe-list`, `item-icons`, `stations`), `e2e/touchLayout.spec.ts` (`recipe-list-touch`)                                                                                                                                    |
| AC13.1, AC13.2 | `e2e/gathering.spec.ts`                                                                                                                                                                                                                              |
| AC13.3         | `repoHygiene.test.ts` passes (19 images, all test references). Checked by hand: item names, icons, tiles and recipes are plain descriptive words and shapes painted by code; a search for protected names in code, texts and documents found nothing |
| AC13.4–AC13.6  | `README.md`, `CLAUDE.md`, this file                                                                                                                                                                                                                  |
| AC13.7         | See the pull request                                                                                                                                                                                                                                 |

## Decisions and deviations

| Topic                                                         | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                    | Why                                                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| AC10.1 "no two recipes have the same ingredients and station" | Not met as written: plan 5.6 gives pickaxe and axe of a tier the same ingredients. The recipe table of 5.6 was kept; the test checks that no two recipes are the same in ingredients, station **and result**, and that these three pairs are the only ones sharing ingredients                                                                                                                                                              | The table is the decision made with the owner; a list (no grid) tells recipes apart by their result                       |
| Recipe order                                                  | Table order follows progress: planks, sticks, workbench, wooden tools, stone tools, furnace, coal, iron ingot, iron tools, stone bricks, glass, bricks, iron block                                                                                                                                                                                                                                                                          | The list shows each group "in table order"                                                                                |
| Recipe ids                                                    | Numbers 1–19 in that order, pinned by a test; `decodeAction` accepts 1–65535 and `applyAction` answers `invalid` for an unknown one                                                                                                                                                                                                                                                                                                         | As item ids                                                                                                               |
| Taking ingredients                                            | From the last slots first (`takeItems`), so the bar keeps its stacks longest                                                                                                                                                                                                                                                                                                                                                                | –                                                                                                                         |
| Station distance                                              | Centre of the station block within 5.0 of the eye, in all three directions                                                                                                                                                                                                                                                                                                                                                                  | Plan 5.2                                                                                                                  |
| `craft` notices                                               | None (no "+4 Planks")                                                                                                                                                                                                                                                                                                                                                                                                                       | The HUD is hidden while the list is open                                                                                  |
| Furnace tiles                                                 | The opening is on all four sides; top and bottom show a flue                                                                                                                                                                                                                                                                                                                                                                                | Blocks have no direction                                                                                                  |
| Gated block and full inventory                                | `startBreak` checks room only for what the held item would yield                                                                                                                                                                                                                                                                                                                                                                            | AC11.2                                                                                                                    |
| AC10.3 path                                                   | `src/actions/ironPickaxePath.test.ts`, seed 1337: 9 logs by hand (3 → planks, 6 → 3 coal in the furnace), workbench, wooden pickaxe, 11 stone, stone pickaxe, furnace, 3 iron ore at y 22, iron pickaxe. 129 actions, 62.1 s of breaking, about 24 blocks walked. Walking is not an action: the script moves the pose, only into free cells, and breaks only blocks that lie open. Going up stands for stacking blocks and is not simulated | "A scripted sequence of valid actions only"                                                                               |
| AC10.6                                                        | Unit test with a literal Part B record (`saveFormat.test.ts`); the format is unchanged (version 1)                                                                                                                                                                                                                                                                                                                                          | –                                                                                                                         |
| Hold "Craft"                                                  | A press starts a hold; every 250 ms of simulation time it crafts (the first time after 250 ms). A quick click or tap crafts once, on release. A hold ends when the recipe can no longer be made; letting go after a hold that crafted does not craft once more                                                                                                                                                                              | AC12.4                                                                                                                    |
| Furnace                                                       | One item at a time; the `craft` action is sent when the bar is full; closing the screen forgets it. Holding "Craft" on a furnace row starts the next item when one is done                                                                                                                                                                                                                                                                  | Plan 5.6                                                                                                                  |
| A second press after the list reordered                       | For 250 ms of simulation time after a craft, a press on **another** recipe is ignored; the same recipe can be pressed again at once. Not in the plan                                                                                                                                                                                                                                                                                        | "The order updates" (AC12.1) moves another button under the pointer: one log → planks, and a double click made sticks too |
| Height of the list                                            | 284 px (five rows and half of the sixth); 246 px on screens up to 480 px high. The first session had 256 px, exactly five rows                                                                                                                                                                                                                                                                                                              | With whole rows only, nothing showed that the list goes on                                                                |
| Count on a recipe's result                                    | Own class `recipe-result-count` instead of the slots' `slot-count`                                                                                                                                                                                                                                                                                                                                                                          | Three Part B tests count `.slot-count` on the whole page; the recipe rows exist in the document also while hidden         |
| AC12.6, the finger that scrolls                               | Split in two. At 640 × 360 and 1280 × 800 (real loop) the drag starts on a row, next to its button. The drag that starts **on** a "Craft" button is tested in test mode at 960 × 540, where the simulation clock stands still during the gesture                                                                                                                                                                                            | With the real loop under software WebGL, the time between finger down and first move is not under the test's control      |
| `item-icons` reference                                        | The inventory panel with one of each of the 28 items, the world behind it hidden                                                                                                                                                                                                                                                                                                                                                            | Plan step 12 hand-over; the sheet from `scripts/iconPreview.ts` stays a tool                                              |
| AC13.1 play-through                                           | Real input and the real list: three logs by hand, planks ×3, sticks, workbench (placed by right click where the foot of the trunk was), wooden pickaxe, three stone from bare rock 19 blocks away, stone pickaxe, reload. Nothing is given. The way to the rock and back is a `setPlayer`, as in Part B                                                                                                                                     | "Walking" by held keys over 19 blocks of hills would make the test long and fragile                                       |
| AC13.2 soak                                                   | 1 000 actions with `craft` in the mix (recipes 0–20, of which 0 and 20 do not exist); the furnace is removed after 600 actions. After every action the count of **every item** is compared with what the accepted action says, crafting against a second copy of the recipe table written out in the test                                                                                                                                   | Stricter than a total: a recipe that took the wrong ingredient would not change the sum                                   |
| Part B's soak (AC9.2)                                         | Kept as it is next to the new one                                                                                                                                                                                                                                                                                                                                                                                                           | –                                                                                                                         |

Part B tests adapted: `breaking.test.ts` (coal and stone need a pickaxe; random run
counts notices), `hardness.test.ts`, `items.test.ts`, `blocks.test.ts`,
`itemIcons.test.ts` (opaque share from 0.15: the stick is thin), `actions.test.ts`,
`pipeline.test.ts` (`takeItems`, `takeIngredients`; `recipes.ts` may ask what would be
left), `e2e/breaking.spec.ts` (coal ore with a wooden pickaxe: 105 steps),
`e2e/gathering.spec.ts` (soak: `craft` is a real action now; breaks count their notices;
helpers moved to `e2e/sites.ts`), `e2e/inventoryScreen.spec.ts` (16 palette blocks;
`palette.png` regenerated and looked at).

## Test robustness

- `Fingers` (Phase 2) waits until the page has seen each finger position. A drag that the
  browser turns into scrolling is cancelled for the page, so that wait never ends.
  `swipe` sends the same events and waits one frame each instead.
- Recipe-list tests in test mode step the simulation between two different recipes
  (15 steps), because of the rule above.
- Run the browser suite alone, as before: unit tests in parallel made two menu tests time
  out in the first session.

## Measured numbers

| Measurement                     | Result                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| Production bundle               | 665 kB JavaScript (Part B: 649 kB), 16 kB CSS (Part B: 13 kB)                        |
| Unit tests                      | 316 (Part B: 275), about 7 s; line coverage of the pure core 98.9 %                  |
| Browser tests                   | 129 (Part B: 111), 6.6 minutes with 3 workers                                        |
| Shortest way to an iron pickaxe | 129 actions, 62.1 s of breaking, about 24 blocks walked (AC10.3, Node)               |
| Play-through to a stone pickaxe | 11 s in the browser: 6 s of simulated breaking for three logs, 4.5 s for three stone |
| Soak of 1 000 actions (AC13.2)  | about 9 s in the browser, without a console message; heap growth under 50 MB         |

Frame rates still cannot be measured in the cloud container (software WebGL). Part C adds
no geometry and nothing per frame while the recipe list is closed; while it is open, the
stations around the player are looked for four times a second (a cube of 11 blocks).

## Known issues

- Nothing was tried on a real device (see the list below).
- **A finger that rests on a "Craft" button for a quarter of a second before it scrolls**
  crafts once: the hold has started by then. A quick scroll gesture crafts nothing.
- For a quarter of a second after a craft, another recipe's button does not react (see the
  decisions). A player who is very fast with two different recipes has to press twice.
- The furnace's two seconds are presentation: the action layer would accept a `craft`
  for a furnace recipe at once. For Phase 4 that means a client could skip the wait.
- The furnace does not go on while the screen is closed, and there is no queue: one item
  per press, or hold the button.
- Tools never wear out (as planned), so one of each is enough for ever; the second tool of
  a kind only takes a slot.
- A station counts through walls and floors: only the distance matters.
- Assumption carried over: Part B's break times and inventory are used as they are; the
  owner has not tried them on a device yet.

## For the owner to try

Open the deployed game after merging and create a new Gathering world. Each item says what
to look for.

1. **Can a child reach the wooden pickaxe without help?** Give the device to a child with
   only "break a tree and look into the bag". Do they find the "Crafting" tab, understand
   that green rows can be made, find out that the workbench has to be put down, and that
   they have to stand next to it?
2. **Is the list understood without reading?** Icons, "2 / 3" in red, the greyed rows.
   Is "Needs a workbench nearby" read at all? Is it clear that the list scrolls?
3. **The list jumps after every craft** (what can be made moves to the top). Helpful or
   confusing? If confusing, the alternative is a fixed order with craftable rows only
   highlighted.
4. **Are the break times fun?** Stone by hand (3 s, and nothing drops) against a wooden
   (1.5 s), stone (0.75 s) and iron pickaxe (under 0.4 s). Does the first pickaxe feel like
   a reward? Is a log by hand (2 s, nine or more of them at the start) too long? An axe
   helps only after the workbench.
5. **"Needs a pickaxe".** Is the hint noticed before the three seconds are spent? Should
   stone without a pickaxe not break at all instead?
6. **Is coal findable?** Dark specks in bare rock on hills. And if not: do they discover
   that the furnace turns two logs into coal?
7. **Is iron findable?** It lies deep (the test found it at height 22, about 35 blocks
   under the start point) and needs a stone pickaxe. Without torches and caves that means
   digging a shaft: is that fun or tedious? Does one get out of the shaft again (stack
   blocks under oneself)?
8. **The furnace's two seconds.** Does the bar feel like "it is cooking", or is it just
   waiting? Is it understood that closing the bag cancels it, and that holding the button
   goes on with the next item?
9. **Holding "Craft"**, by mouse and by finger: four per second; too fast for a child
   (planks turned into sticks by accident)?
10. **The recipe list on the phone** (landscape): are tabs, rows and buttons easy to hit,
    does scrolling by finger work without crafting something, is the text readable?
11. **The icons.** Are pickaxe, axe and shovel told apart in the bar on the phone, and
    wood, stone and iron by their colour? Do workbench and furnace look like what they
    are once placed?
12. **Building.** Stone bricks, glass, bricks and the iron block are the rewards for
    building: are they worth their recipes (4 stone → 4 stone bricks, 9 ingots → 1 block)?
13. **Old worlds.** A Gathering world from before this part opens with its inventory;
    stone that was gathered by hand then is still there.
14. **Saving.** Craft tools, place workbench and furnace, go back to the worlds, close the
    browser, come back: everything is as it was.

## Notes for Phase 4 (multiplayer)

- `craft` is an ordinary action: a host applies it with the same `applyAction` to the
  acting player's record and reads the stations from its own world. It changes no block,
  so it needs no broadcast beyond that player's record.
- The station check reads blocks within 5 of the player. The host must read them
  authoritatively (its own copy of the chunks around that player), like `reach` for
  breaking; the plan's note on chunks the host has not loaded applies.
- The recipe list shows what the **local** record and world say and may be a moment ahead
  of or behind the host. It already waits for the answer (`onResult`, `onPlayer`) and
  never assumes success; a refused `craft` ends a hold.
- The furnace wait, the hold repeat and the quarter-second rule after a craft live in
  `Game` and run on simulation time. With `nowMs` on wall-clock time (plan section 9) they
  follow. If smelting is to cost time for everybody, the host must enforce it (a
  `startSmelt` like `startBreak`), or the furnace becomes a block with state; today a
  modified client could craft furnace recipes without waiting.
- Two players at one workbench or furnace need nothing: stations hold no items.
- Tools are items in the record; the held item is `slots[selectedSlot]`, which the host
  knows. Break times and gating are therefore already host-checkable.
- Recipe ids are part of the protocol like block and item ids: append-only. A handshake
  should compare a version of the recipe table, as it will for the terrain checksum.
- Other players do not see what someone holds or that they are crafting; decide in
  Phase 4 whether the held tool should be visible.

## Suggestions

- If item 3 of the list above turns out confusing: keep the table order fixed and only
  highlight craftable rows; `listRecipes` is the single place that orders.
- Part D (Web Workers) depends on item 3 of Part A's list (hitches on real devices), not
  on anything in this part.
