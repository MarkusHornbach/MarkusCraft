# Tests on real devices

The one list of everything only a person with a real device can judge. It replaces the
"For the owner to try" lists that were spread over the phase reports (the reports keep
their lists as a record of what was asked at the time; this file is the one to fill out).
It holds the open tests; passed and obsolete ones are in `docs/device-tests-done.md`.
New tests from Phase 8 part B3 on go into `docs/device-tests-2.md` (this file is full).

**How to use it**

- Tick a box when the test is done and write what you saw after "Result:". A short note is
  enough ("ok", "too slow", "slider ends up at 70 %").
- Devices: **PC** = computer with keyboard and mouse, **Phone** and **Tablet** = Android
  with Chrome, landscape. Where a test names devices, do it on each of them.
- Use a world with **seed 1337** for everything that is measured or compared, so runs on
  different versions and devices see the same terrain. Since Phase 7 part A create it with
  the form's defaults (Terrain "Balanced", Trees "Few"), or as the test says. Its start
  point is on open grass by a lake (north and west), with a wood to the south-west and
  south and hills rising to the south-east. Worlds created before Phase 7 are "Classic" and
  keep their old terrain (there the start point is in a wood, a rocky hill to the south).
- Debug overlay: F3 on the PC, the "Debug overlay" switch in the pause menu on touch
  devices.

**How it is kept up to date** (for sessions; the root `CLAUDE.md` points here)

- Every phase part adds its new tests here, in the section they belong to, with an id
  (`LIGHT-9`, `TOUCH-12`, …) and the part as origin (for example "4B"). Its report names
  the ids it added. Ids are never reused.
- This file lists open tests only. When the owner has ticked a test, the next session that
  touches this file moves it unchanged to "Passed" in `docs/device-tests-done.md`.
- A test that a later change makes pointless is moved to "Obsolete" in
  `docs/device-tests-done.md` with one line of reason; it is not deleted silently.
- Results the owner wrote down (after "Result:" or into a table) are never changed or
  removed by a session. A test whose subject changed gets a new entry; the old one, with
  its result, moves to "Obsolete".
- Read `docs/device-tests-done.md` when a test's history matters. Update "Last updated"
  below whenever the open list changes.
- Findings that led to a change are noted in the report of the part that made the change.

Last updated: Phase 8 part B2b (PLACE-1 to PLACE-6; RADAR-3 and RADAR-5 obsolete); 2026-11-27.

---

## 1. Performance (decides about Web Workers, Phase 4 part C)

Performance is measured by the game itself: the **performance test** plays fixed scenarios
(standing, walking, flying, building; at render distance 5 and 8) in a throwaway world,
judges them with traffic lights and hands the numbers over as a pre-filled GitHub issue.
Nothing has to be read off the debug overlay any more.

**What decides about Part C (Web Workers):** the line "Web Workers (Part C): recommended /
borderline / not needed" of the **phone's** run (PERF-4), together with your own
impression while watching it (PERF-5). Runs on the computer and the tablet are recorded
for comparison; their line reads "decided on phones and tablets" on the computer.

Once, before the first run:

- The label `perf-run` must exist in the repository (Issues → Labels). It does: it was
  created before Part P was built. Without it the issues would arrive without a label and
  be found by their title "Performance run: …" only.
- The browser must be logged in to GitHub: log in once in Chrome on the phone and on the
  tablet. Otherwise GitHub shows its login page first; the pre-filled text usually
  survives that, and "Copy result" is the way out if it does not (paste the text into a
  new issue by hand).
- Bookmark `https://markushornbach.github.io/MarkusCraft/?bench=1` on each device.

- [ ] **PERF-4** (4P) Run the performance test (world menu → "Performance test", or the
      bookmark `…/?bench=1`) with the charger in and other apps closed, and leave the
      device alone for about four minutes. On the result screen press "Open GitHub issue"
      and submit it. The issue is public; the result screen shows its exact text under
      "Show text" before anything leaves the device. _PC, Phone, Tablet._
      Result: (issue numbers)
- [ ] **PERF-5** (4P) Watch one run on the phone: does what you see match the lights (a
      visible stutter where a light is red, smooth where it is green; does terrain appear
      late in the flying scenario where "Loading" is yellow or red)? This checks the
      thresholds against a person's eye. Result:
- [ ] **PERF-6** (4E) After Part E is deployed: run the performance test again on the phone
      and the tablet and submit the issues. Is `edit` at render distance 5 green or yellow
      now (it was red in #13, #15 and #16)? _Phone, Tablet._
      Result: (issue numbers)
- [ ] **PERF-7** (4B) After Part B is deployed: run the performance test once more on the
      phone (and the tablet if you like) and submit the issue. The suite now has eleven
      scenarios: the new one, "torches at night", places and breaks a row of torches at
      midnight and then flies past them. Is it green, and does placing the torches look
      smooth while you watch? _Phone, Tablet._
      Result: (issue numbers)

## 2. Light (Phase 4 part A)

- [ ] **LIGHT-1** (4A) An old world opens as it was, now with light. _PC, Phone._ Result:
- [ ] **LIGHT-2** (4A) Dig a tunnel sideways into a hill by day. Does it get dark evenly?
      Is it too dark to find the way back (there are no torches yet)? Result:
- [ ] **LIGHT-3** (4A) The Brightness slider on the phone, indoors and outside in
      daylight: is the range enough at both ends? Which position do you like? Result:
- [ ] **LIGHT-4** (4A) Build a small house with a door opening and a glass window. Is the
      inside pleasantly dim or just murky? Does light fall in through the window? Result:
- [ ] **LIGHT-5** (4A) Under trees and at the shore: does the shade look natural? Result:
- [ ] **LIGHT-6** (4A) Diving: is clay still easy to find in shallow water? Is the bottom
      of a deep lake too dark? Result:
- [ ] **LIGHT-7** (4A) Anything flickering, or stripes along straight lines every 16
      blocks? Light through walls or closed corners, black or sparkling faces? Result:
- [ ] **LIGHT-8** (4A) Break and place blocks quickly at a tunnel mouth: does it still
      feel immediate? _Phone._ Result:

## 2b. Torches and the night (Phase 4 part B)

- [ ] **NIGHT-1** (4B) A night on the phone at the default Brightness: is it "dark, but I
      can walk", or a black screen? Then move the Brightness slider: which position do you
      like at night? Tell me the position; it can become the default. _Phone._ Result:
- [ ] **TORCH-1** (4B) Place torches at night and in a tunnel: is the lit area large
      enough to be useful (about 13 blocks)? Is the warm tint pleasant or too orange? Do
      stone and grass still look like themselves? Result:
- [ ] **TORCH-2** (4B) Place a torch with the phone: is there a hitch? Place ten in a row
      along a tunnel. _Phone._ Result:
- [ ] **TORCH-3** (4B) Break a torch with a finger, and aim past a torch at the wall
      behind it: does the crosshair go where you expect? _Phone._ Result:
- [ ] **TORCH-4** (4B) Break the block under a torch: is it understood that the torch
      comes along (it goes into the inventory in a Gathering world)? Result:
- [ ] **TORCH-6** (4B) Dig for iron with torches (as in CRAFT-6): is mining
      more fun now? Result:
- [ ] **TORCH-7** (4B) A torch under water, a torch on glass and on leaves: does anything
      look broken? (A torch in the top layer of a shallow lake stands in a small square well:
      its cell holds no water; see the Part B report.) Result:
- [ ] **TORCH-8** (4B) The inventory opens with the bag button on the phone in a Creative
      world and stays open (it used to be possible that the same tap closed it again).
      _Phone._ Result:

## 3. Movement and look of the world

- [ ] **EDIT-1** (4E) Build and break blocks along a chunk border (the debug overlay shows
      the chunk you stand in; walk until the number changes). Since Part E the chunk on the
      other side of the border gets its new mesh a frame or two later: do you see a
      flicker, a hole for a moment, or shading that jumps late? _Phone, PC._ Result:

## 4. World options (Phase 7 part A)

New worlds choose "Terrain" (Flat, Balanced, Hilly) and "Trees" (None, Few, Normal, Many)
in the "New world" form; the defaults are Balanced and Few. "None" is for Creative only.
"Collide with leaves" is a switch on the settings page (off by default).

- [ ] **GEN-1** (7A) Create three worlds with seed 1337: Flat, Balanced and Hilly (Trees:
      Few). Fly around each for a minute. Does each look like its name: Flat gentle lowland
      with small hills, Balanced mostly plains with a few lower hills, Hilly like the old
      worlds with mountains and bare rock? Is there still enough water (lakes, shores) in
      all three? _PC, Phone._ Result:
- [ ] **GEN-2** (7A) A Gathering world with the defaults (Balanced, Few): is wood within
      easy reach of the start point (a few steps, not a long search)? Walking around: do
      you see forests and groves with open meadows between them, rather than single trees
      everywhere? Try Normal and Many too: is the difference clear? Result:
- [ ] **GEN-3** (7A) The "New world" form on the phone in landscape: can you reach the
      Terrain and Trees rows and "Create and play" by scrolling, and is nothing covered?
      Then with the controller on the PC or the phone: does the frame move into both rows,
      does A select, and is "None" skipped while Gathering is chosen? Is the hint "No trees
      only in Creative: Gathering needs wood." understood? _Phone, PC._ Result:
- [ ] **GEN-4** (7A) From a PR preview on the Pi: host a world created with Hilly and None
      (Creative), and join it from a second device whose own worlds are Classic. Does the
      guest see the same hills and no trees, and does the world list of the guest stay
      unchanged afterwards? _PC, Phone._ Result:
- [ ] **LEAF-1** (7A) With "Collide with leaves" off (the default): walk into a tree, jump
      onto a canopy, stand above one. Does passing through the leaves feel right, or do you
      miss standing on tree tops? Turn the setting on: are leaves solid again at once?
      Result:
- [ ] **LEAF-2** (7A) Inside a canopy the view is full of leaves. How does it look on the
      PC and the phone: confusing, fine, or nice? Should a later phase add an effect for the
      view inside leaves (darker, a tint), or a "slow down in leaves"? Result:

## 8. Crafting and tools

- [ ] **CRAFT-12** (P1) The recipe list keeps one fixed order; what can be made is green
      and counted on the tab ("Crafting 3"). PC, Phone: are the craftable rows found,
      also those further down (furnace rows, torch)? Is the number on the tab noticed and
      understood? Result:
- [ ] **CRAFT-13** (P1) Holding "Craft" now makes the first item after half a second, then
      four per second. By mouse (PC) and by finger (Phone): does a short press still feel
      immediate? Does scrolling the list on the phone, starting on a "Craft" button, never
      craft? Result:
- [ ] **CRAFT-14** (FA1) With the mouse (PC) and with a finger (Phone), smelt several
      items in a row (coal from logs at a furnace): the "Craft" button stays where it is,
      with the bar filling it. Is it clear that the furnace is busy, and that a press during
      the bar does nothing? _PC, Phone._ Result:

## 9. Controller (Phase 5)

A controller with the common layout (two sticks, A/B/X/Y, bumpers, triggers, D-pad,
Start). Press any button once after connecting it: browsers report a controller only
after a press. The buttons are listed in the pause menu while the controller is in use.

- [ ] **PAD-1** (5A) PC, Chrome, controller by USB: "Controller connected" appears after
      the first press (and that press does nothing). Play a few minutes: walk, look,
      break, place, change the slot, open the inventory, pause. _PC._ Result:
- [ ] **PAD-2** (5A) The same on the phone and the tablet, Chrome, controller by
      Bluetooth. _Phone, Tablet._ Result:
- [ ] **PAD-3** (5A) Phone: B during play (flies down, does nothing while walking) and in
      the menus (goes back) never leaves the page. The phone's back gesture opens the pause
      menu in play and goes back one page in the menus; on the world list it leaves the
      game. _Phone._ Result:
- [ ] **PAD-4** (5A) Look with the right stick: is the dead zone right (no creeping, fine
      aiming possible)? Is the speed right, and the speed-up when holding fully sideways?
      Which "Controller sensitivity" feels best (it can become the default)? Is "Invert
      controller look" needed? Result:
- [ ] **PAD-5** (5A) Lay the controller down for a minute during play: nothing moves or
      turns by itself. Result:
- [ ] **PAD-6** (5A) Switching: controller → finger on the screen → controller on the phone;
      controller → mouse click → controller on the PC. Does the switch happen when expected,
      and never by itself (e.g. a bumped mouse)? _PC, Phone._ Result:
- [ ] **PAD-7** (5A) Switch the controller off during play: the game pauses with
      "Controller disconnected". Switch it on, press a button, press A on "continue": play
      goes on. Result:
- [ ] **PAD-8** (5A) The whole menu flow without touching the screen or the mouse: create a
      world, play, pause, change Brightness, back to the worlds, play the world again. Is
      the white frame always visible and where you expect it after each press? Result:
- [ ] **PAD-9** (5A) "Fullscreen" in the pause menu, chosen with the controller: does the
      browser go fullscreen, or does it say "Fullscreen is not available"? _Phone._ Result:
- [ ] **PAD-10** (5A) Start the performance test with A and cancel it with B. _PC or
      Tablet._ Result:
- [ ] **PAD-11** (5A, optional) Firefox and Edge on the PC: is the controller reported, or
      does "This controller is not supported" show? _PC._ Result:
- [ ] **PAD-12** (5A) The button pictures in the pause menu and the bar at the bottom of the
      menus ("A Select, B Back"): readable from the sofa, understood without explanation?
      Result:
- [ ] **PAD-13** (5B) Inventory in a Gathering world, controller only: Y opens it with the
      frame on the selected bar slot. Move a stack (A on it, then A on another slot), merge
      two stacks of the same item, swap two, throw one into the bin. B puts a picked stack
      down first, then closes; Y closes at once. Does the frame always go where you expect
      in the grid, along the bar and to the bin? On the phone: is the bar at the bottom
      readable and nothing hidden under it? _PC, Phone._ Result:
- [ ] **PAD-14** (5B) Crafting tab with the controller: RB opens it, LB goes back. Hold A on
      "Craft": the first item after half a second, then four a second; letting go stops.
      A furnace recipe shows its bar; Y closes and cancels it. Scroll the list with the right
      stick, also to recipes that cannot be made yet. Does the frame stay on "Craft" after a
      craft, and go somewhere sensible when the button disappears? _PC, Phone._ Result:
- [ ] **PAD-15** (5B) Creative palette with the controller: A on a block puts it into the
      selected bar slot; A on a bar slot first and then on a block puts it into that slot.
      Is the frame easy to follow over the many blocks? Result:
- [ ] **PAD-16** (FIX) Phone, Chrome, controller by Bluetooth: pause, then press B ten
      times in a row on the pause menu (play, pause with Start, B again), also right after
      breaking a block in a crowded spot. Each B continues the game once and never pauses it
      again by itself. Then, in play, B followed about a second later by the phone's back
      gesture: the gesture pauses. _Phone._ Result:
- [ ] **PAD-17** (FA1) With the controller, smelt coal several times in a row: the frame
      stays on "Craft" during and after each smelt; A again makes the next one; holding A
      keeps the furnace going. _PC, Phone._ Result:

## 10. Progression (Phase 8 part A)

An Adventure world (the mode that was called Gathering) has a task book: the third tab
"Tasks" of the inventory, levels that unlock recipes, and a notice at the top for every
finished task, chapter and level.

- [ ] **PROG-1** (8A1) Play a fresh Adventure world (seed 1337, the form's defaults)
      through the whole book on the PC, as you would play it. Note the minutes per chapter
      (the F3 row "Progress" says which chapter is open) and the total. The goal bot
      estimates 32 minutes in total (chapters about 4, 5, 8, 7 and 8); your times calibrate
      its "human factor". Were any tasks boring, too long or unclear? _PC._ Result:
- [ ] **PROG-2** (8A1) The Tasks tab on the phone: level, XP bar, "Next level", the open
      chapter's tasks with their counts. Readable at arm's length? Does it scroll with a
      finger where needed? _Phone._ Result:
- [ ] **PROG-4** (8A1) The notices ("Task done: …", "Chapter done: …", "Level 3 · Unlocked:
      …", "First find: Coal ore …"): noticed, but not annoying? Do they ever hide something
      you need to see? _PC, Phone._ Result:
- [ ] **PROG-6** (8A2) Two players on two devices (PC and phone) in a fresh Adventure world
      of the PC, opened to others on the PR preview: finish chapter 1 together (one mines
      logs, the other makes planks). Both see "Task done: … (name) · +10 XP" for every task,
      "Chapter done: First wood" and their own "Level 2 · Unlocked: …"; both Tasks tabs show
      the same counts. Does it feel like one shared book? _PC, Phone._ Result:
- [ ] **PROG-7** (8A2) In that room the phone's player leaves ("Leave world") and joins
      again: its level, XP bar and the recipes it unlocked are as before; the book is where
      the room left it. Then the PC saves and goes back to the worlds, opens the world again
      and opens it to others: the phone's player still has its level. _PC, Phone._ Result:
- [ ] **PROG-8** (P2) The task tracker on the phone ("Mine 32 logs 0 / 32", top left,
      below the menu button): readable at arm's length, never in the way of a button, the
      bar or the notice at the top? In a room, do "Anna joined" and the other room notices
      sit below it without crowding the corner? _Phone._ Result:
- [ ] **PROG-9** (P2) Choosing the tracked task in the Tasks tab: a click on a row (PC), a
      tap (phone), and with the controller D-pad down from the tab, then A. The row shows
      "Tracked" and the tracker follows; choosing the tracked row again hides the tracker,
      any row shows it again. Is it clear that the rows can be chosen and which one is
      tracked? Done rows ("✓") cannot be chosen. _PC, Phone, controller._ Result:
- [ ] **PROG-10** (P2) In a room of two each player tracks a different task: each sees
      its own tracker, both counts follow the shared book. One leaves and joins again, and
      the host saves, goes back to the worlds and opens the room again: each still tracks
      its own task. _PC, Phone._ Result:
- [ ] **PROG-11** (FA1) A fresh Adventure world (seed 1337, the form's defaults) on the PC,
      played from chapter 3: before "Make 16 coal" is done the torch row says "Task: Make 16
      coal"; finishing it shows "Unlocked: Torch". Then "Mine 32 coal" with torches. Was any
      task before the torch too dark to do comfortably, by day or at night? Did it feel
      unfair that the torches made and placed in chapter 3 did not count for chapter 4's
      torch tasks? _PC._ Result:
- [ ] **PROG-12** (FA1) A locked recipe row ("Level 3" or "Task: Make 16 coal" instead of
      "Craft"): is it clear why it cannot be made and what to do about it? (Replaces
      PROG-5.) _PC._ Result:

## 11. Radar (Phase 8 part B1)

An Adventure player who has finished task 8 "Climb to height 64" gets the radar: a circle
at the top right (on the phone below the bag button) and a fourth inventory tab "Map". It
shows the nearest coal veins (dark dots) and iron veins (tan diamonds) and how far up or
down they are ("5↓", "↑", "="). The settings page switches the circle ("Radar circle").

- [ ] **RADAR-1** (8B1) Performance test on the phone: compare the new `radar` row with the
      `walk` row (frame time and lights). _Phone._ Result:
- [ ] **RADAR-2** (8B1) On the phone in an Adventure world with the radar: the F3 row "Radar"
      while walking and turning (scan and draw times). Does the game feel as smooth with the
      circle on as with it off? _Phone._ Result:
- [ ] **RADAR-4** (8B1) Finding ore with the radar (seed 1337, the form's defaults, from
      task 12 on): do the hints lead to coal and iron without making it trivial? How long
      did "Mine 20 iron ore" take compared with before? _PC._ Result:
- [ ] **RADAR-6** (8B1) Tracking "Mine 20 iron ore" makes the circle show iron only: is that
      understandable, or confusing? _PC._ Result:
- [ ] **RADAR-7** (8B1) Walk on the surface away from the start point until the circle shows
      an arrow on its rim for a kind (no vein of it within 48 blocks): is it clear where to
      go? _PC._ Result:

## 12. Caves and places (Phase 8 part B2)

New worlds (both modes) get generator 3: the world list says "· Caves". Tunnels wind
through the underground; some open on dry land and slope down to iron depth, deep ones
connect chambers. A few ravines cut down from the surface. A mine shaft with a log frame,
plank stairs and torches leads down to a chamber at about height 12; one lies 24–64
blocks from the start point of every new world (seed 1337 with the form's defaults: about
24 blocks north-east of the start point). Older worlds keep
their terrain.

- [ ] **CAVE-1** (8B2a) Performance test on the phone: the new `caves` row against `walk`
      (frame time, lights). _Phone._ Result:
- [ ] **CAVE-2** (8B2a) A new Adventure world: follow an entrance tunnel down to iron depth
      with torches and back up. Is it easy to find the way, too dark, too bright? _PC,
      Phone._ Result:
- [ ] **CAVE-3** (8B2a) Walk the surface of a new world: do cave mouths and ravines look
      natural? Any hole beside water, floating tree, odd edge? _PC._ Result:
- [ ] **CAVE-4** (8B2a) The mine shaft near the start point: found without the radar?
      Stairs easy to walk down and up (touch and controller too)? Is the torch light
      enough? _PC, Phone, controller._ Result:
- [ ] **CAVE-5** (8B2a) "Mine 20 iron ore" in a new world: how long, compared with RADAR-4?
      Did the caves or the shaft make it more fun, or too easy? _PC._ Result:
- [ ] **CAVE-6** (8B2a) A room in a new world: does the guest see the same caves and shaft?
      _PC + Phone._ Result:

In a world with caves the radar also shows the nearest mine shafts (light brown hollow
squares, "Shaft") and cave entrances (grey downward triangles, "Cave"), with arrows on the
rim for those up to 192 blocks away. The Map tab fills the screen (on the phone the tabs
sit beside the map); the settings page has "Radar circle size" (Small, Medium, Large).

- [ ] **PLACE-1** (8B2b) The circle with shaft and cave symbols: told apart from coal and
      iron at a glance? Too crowded? _PC, Phone._ Result:
- [ ] **PLACE-2** (8B2b) The Map tab's legend with four rows on the phone: readable? _Phone._
      Result:
- [ ] **PLACE-3** (8B2b) Follow the radar from the start point to the nearest cave entrance
      and down to iron: does it lead there? _PC._ Result:
- [ ] **PLACE-4** (8B2b) The rim arrow of a shaft far away (up to 192 blocks): clear where
      to go? _PC._ Result:
- [ ] **PLACE-5** (8B2b) "Radar circle size": is Medium a good default? Does Large hide too
      much of the view? On the phone it never covers a button (on small phones Large stays
      at Medium's size): ok? _PC, Phone._ Result:
- [ ] **PLACE-6** (8B2b) The Map tab filling the screen with mouse, touch and controller:
      big enough now, the terrain recognisable, the legend clear? On the phone the tabs move
      beside the map: still easy to switch tabs? _PC, Phone, controller._ Result:
