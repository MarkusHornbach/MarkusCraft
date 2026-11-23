# src/player/ — player state, physics, interaction, looks, figure motion

Pure core (see "Architecture invariants" in the root `CLAUDE.md`). Physics is a hot path:
no per-step allocations.

## Files

- `player.ts` (state), `physics.ts`, `interaction.ts` (break/place rules), `looks.ts` (the
  table of the figure's looks, `lookForKey`, `resolveLook`), `figureMotion.ts`
  (`FigureMotion`: pose, time, fly, busy, edits → angles)

## Looks (Phase 6 part D)

Looks are the append-only table `player/looks.ts` (ids 1–8, pinned by `looks.test.ts`;
choice 0 is "Automatic" = `lookForKey(key)`, 1 + first key byte mod 8). The atlas they are
painted into: `src/render/CLAUDE.md`. Where the choice is stored and picked: "Your player"
in `src/ui/CLAUDE.md`.

## FigureMotion

`FigureMotion` (pure, no allocation per step) gives the angles once per rendered frame:
legs swing with the distance walked up to `FIGURE_LEG_SWING`, rest within
`FIGURE_SETTLE_MS`, none while flying or after a snap (a jump beyond `SNAP_DISTANCE` or a
teleport, `PoseBuffer.snapsAt`); the body turns towards the walking direction (backwards:
away from it) and is never more than 45° from the head; the right arm swings every
`FIGURE_SWING_MS` while `busy` and once per block change the player caused
(`RemotePlayer.edits`). `busy` is `Game.holdingBreak()`: break held, a block targeted, not
paused.

## Leaves and movement (Phase 7 part A)

The setting "Collide with leaves" (`Settings.collideLeaves`, default off) changes movement
only. `Game` steps physics on a `MovementWorld` (made once per world) whose `isSolidAt`
reads `BLOCK_SOLID_PASSABLE_LEAVES` (leaves 0) while the setting is off and `BLOCK_SOLID`
while it is on, through `World.isSolidIn`; no allocation per step. `World.isSolidAt` keeps
the block table's `solid`: leaves stay a support, the place rule, light, mesher, raycast and
the save are unchanged. Physics tests only cells the player newly enters, so a player inside
leaves who turns the setting on is not moved and can walk out. Each player's own setting
applies to its own movement in rooms (the host checks only `validPose`).

Before changing physics or the break/place rules read the "Decisions and deviations" of
`docs/phase-1-report.md`; for the figure `docs/phase-6d-report.md`.
