# Tests on real devices, part 2

The open tests only a person with a real device can judge, from Phase 8 part B3 on. The
first file, `docs/device-tests.md`, holds the open tests of the earlier parts; passed and
obsolete tests of both files are in `docs/device-tests-done.md`.

**How to use it** (in short; the full rules, the devices and the seed 1337 conventions are
in the header of `docs/device-tests.md`)

- Tick a box when the test is done and write what you saw after "Result:".
- Devices: **PC** (keyboard and mouse), **Phone** and **Tablet** (Android, Chrome,
  landscape), **controller** (a standard pad on the PC or the phone).
- Measured or compared tests use a new world with **seed 1337** and the form's defaults.
- Sections continue the numbering of the first file. Sessions keep this file as the first
  file's "How it is kept up to date" says (ids never reused, ticked tests move to
  "Passed", pointless ones to "Obsolete", results never changed).

Last updated: Phase 8 part B3b (LOOT-1 to LOOT-7); 2026-11-28.

---

## 13. Chests (Phase 8 part B3)

The chest is made at a workbench from 8 planks once "Mine 64 stone" is done (in Creative
it is in the palette). Right click, the touch button "place" or the controller's place
trigger on a chest opens it; building against a chest means aiming at another block. The
screen shows the chest's 27 slots, the inventory and the bar: choose a slot, then another
to move a stack; choose a slot twice quickly (or press X on the controller) to move it to
the other side; "Take all" empties the chest. Breaking a chest puts it and everything in it
into the inventory, or is refused if not everything fits. Chapter 3 has a new task "Store
32 stone in a chest".

- [ ] **CHEST-1** (8B3a2) Open a chest, move items in and out with clicks and double clicks,
      "Take all": does it feel quick and clear? _PC._ Result:
- [ ] **CHEST-2** (8B3a2) The chest screen at the phone's size: slots and counts readable,
      taps hit the slot meant, does a double tap work without moving a wrong stack? _Phone._
      Result:
- [ ] **CHEST-3** (8B3a2) Open with the place trigger, walk the D-pad through both grids,
      move with A, A and X: is the focus path sensible? _Controller._ Result:
- [ ] **CHEST-4** (8B3a2) Two players, one chest: both move items; does "Also open: …" show
      on both screens; does anything disappear or double? _PC + Phone._ Result:
- [ ] **CHEST-5** (8B3a2) A guest joins a world with filled chests: are the contents the
      same? _PC + Phone._ Result:
- [ ] **CHEST-6** (8B3a2) Break a filled chest: does everything arrive in the inventory?
      With a full inventory the break is refused: does the text say why? _PC._ Result:
- [ ] **CHEST-7** (8B3a2) An old world (made before this part) that is past chapter 3 opens
      in its chapter; one still in chapter 3 gets the new task. _PC._ Result:
- [ ] **CHEST-8** (8B3a2) Task 21 "Store 32 stone in a chest": is it clear what to do (that
      the place input opens a chest)? _PC, Phone._ Result:

---

## 14. Loot (Phase 8 part B3b)

New worlds use generator 4: generator 3's caves and mine shafts, plus one chest in the
stone-brick chamber at the bottom of every mine shaft, in the corner opposite the stairs.
The shaft near the spawn (about 25–30 blocks away) holds a small starter chest (torches,
coal, a few sticks, planks); every other shaft holds a richer one (torches, coal, iron
ingots, glass, bricks, stone bricks, rarely an iron block). Once taken, loot never comes
back. The radar shows a loot chest as an amber square with a dark band ("Chest" in the
Map tab's legend) while it still holds items. On any chest, a line under the crosshair says
how to open it. Older worlds keep their generator and have no loot.

- [ ] **LOOT-1** (8B3b) A new Adventure world: find the chest in the shaft near the spawn. Is
      the starter loot worth the short trip? Is it clear it is a chest? _PC._ Result:
- [ ] **LOOT-2** (8B3b) After task 8, follow the radar's Chest symbol to a far shaft. Is the
      rich loot worth the walk? Does the book still feel paced (nothing skipped)? _PC._
      Result:
- [ ] **LOOT-3** (8B3b) On the circle and the map, can you tell Chest from Shaft at a
      glance? Does the chest disappear after "Take all" and stay when one stack is left?
      _PC, Phone._ Result:
- [ ] **LOOT-4** (8B3b) A room: both open the same untouched loot chest and the guest takes
      one stack. Do both see the same rest? Does a third player who joins later see it too?
      _PC + Phone._ Result:
- [ ] **LOOT-5** (8B3b) The hint under the crosshair on a chest ("Right click: Open",
      "Place: Open", the LT glyph): is it readable, does it help, is it in the way? _PC,
      Phone, controller._ Result:
- [ ] **LOOT-6** (8B3b) An emptied loot chest stays empty after leaving and reopening the
      world. _PC._ Result:
- [ ] **LOOT-7** (8B3b) An old world (generator 3) opens unchanged, without loot chests. A new
      one shows "· Caves · Loot" in the world list. _PC._ Result:
