# src/actions/ — the action layer

Pure core (see "Architecture invariants" in the root `CLAUDE.md`). Every change to the
world or a player's items goes through here, so the host of a room can apply the actions
of every player (`src/net/CLAUDE.md`).

## Files

- `actions.ts` (types, `decodeAction`), `apply.ts` (`applyAction`), `Session.ts`
  (`Session`, `LocalSession`), `playerRecord.ts`
- `pipeline.test.ts` guards the rules below.

## One pipeline for changes (action layer)

`Game` and the UI never change blocks, the selected slot or the inventory themselves.
They build a plain action (`{ kind, ... }`, JSON-safe) and call `session.submit(action)`;
the world and the screen change when the session's listener reports back (`onBlocks`,
`onPlayer`, `onResult`). Never read a result from `submit`'s return: a later session may
answer asynchronously. `applyAction` is pure and never mutates its inputs;
`PlayerRecord`s are immutable.

`src/actions/pipeline.test.ts` fails if `.setBlock(` is called anywhere but in
`actions/Session.ts`, `net/HostSession.ts` (the host applies an action),
`net/ClientSession.ts` (a guest applies the host's blocks) and once in `Game.ts` (the
test API tool), if a slot-changing inventory function is called outside `src/actions/`
(one call in `Game.ts` for `give`), or if `replaceRecord` is called outside the two test
tools. Slots in actions and records count from 0; keys, HUD and
`getState().selectedSlot` count from 1.

## Actions and reasons

`break`, `place`, `selectSlot`, `startBreak`, `moveStack`, `discard`, `setBarSlot`
(Creative only), `craft { recipe }` (Gathering only). A refusal carries a short reason
(`reach`, `unbreakable`, `occupied`, `full`, `early`, `missing`, `mode`, `station`,
`support`, `rate`, `invalid`) that the UI maps to a text (`rate`, a room's limit for
guests, has none); `ActionResult.notices` is a list of `{ item, count }`, not of strings.
A `break` may return two block changes: the broken cell, then the cell above it if a
block that needs support stands there (the support rule: `src/world/CLAUDE.md`). Break
time 0: `Game` submits `break` in the step in which the `startBreak` was accepted.

## Game modes

A world is Creative or Gathering for ever (`WorldMeta.mode`). Creative: flying,
unlimited blocks, instant breaking, the palette. Gathering: no flying (key, touch button,
`setPlayer` and controls list), placing takes the item from the selected slot, breaking is
timed: `startBreak` records `record.breaking`, `break` is accepted once `breakTimeMs` of
simulation time has passed (otherwise `early`) and puts `dropOf(block)` into the
inventory (`full` if it has no room; then the block stays). `selectSlot`, `moveStack`,
`discard`, `craft` and a Gathering `place` clear `record.breaking`.

The action clock is the simulation time (`simSteps × 1000 / 60`), so notices and break
times are deterministic in test mode. In a room it is the host's clock instead
(`src/net/CLAUDE.md`, "Gathering together"). Tools, gating and recipes:
`src/items/CLAUDE.md`.

Before changing actions read the "Decisions and deviations" of `docs/phase-3a-report.md`;
for the break rules `docs/phase-3b-report.md` and `docs/phase-3c-report.md`.
