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

Last updated: Phase 8 part B3a2 (CHEST-1 to CHEST-8); 2026-11-28.

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
