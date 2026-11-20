# Tests on real devices

The one list of everything only a person with a real device can judge. It replaces the
"For the owner to try" lists that were spread over the phase reports (the reports keep
their lists as a record of what was asked at the time; this file is the one to fill out).

**How to use it**

- Tick a box when the test is done and write what you saw after "Result:". A short note is
  enough ("ok", "too slow", "slider ends up at 70 %").
- Devices: **PC** = computer with keyboard and mouse, **Phone** and **Tablet** = Android
  with Chrome, landscape. Where a test names devices, do it on each of them.
- Use a world with **seed 1337** for everything that is measured or compared, so runs on
  different versions and devices see the same terrain. The start point is in a wood, with
  a lake and shore close by and a rocky hill to the south.
- Debug overlay: F3 on the PC, the "Debug overlay" switch in the pause menu on touch
  devices.

**How it is kept up to date** (for implementation sessions, see `CLAUDE.md`)

- Every phase part adds its new tests here, in the section they belong to, with the part
  as origin (for example "4B").
- A test that a later change makes pointless is moved to "Obsolete" at the end with one
  line of reason; it is not deleted silently.
- Results the owner wrote down are never changed or removed by a session. A test whose
  subject changed gets a new entry; the old one, with its result, moves to "Obsolete".
- Findings that led to a change are noted in the report of the part that made the change.

Last updated: Phase 6 part A (the network test: section 10, NET-1 to NET-4 added);
2026-11-19.

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
- [ ] **PERF-3** (1) PC only: 60 FPS at render distance 8 on a mid-range laptop? Try 16 as
      well (render distance 16 is not part of the performance test; use the debug overlay,
      F3). Result:

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

- [ ] **MOVE-1** (1) Feel of movement: walking and sprint speed, jump height, air control,
      swimming and climbing out of water, fly speed. Result:
- [ ] **LOOK-1** (1) Look of the textures, and of the sky at sunrise and sunset. Result:
- [ ] **LOOK-2** (3A) Rocky hills: is the change from grass to rock natural? Are the black
      nuggets of coal ore easy to spot from some blocks away? Is the blue-grey clay in a
      lake recognisable? Result:
- [ ] **EDIT-1** (4E) Build and break blocks along a chunk border (the debug overlay shows
      the chunk you stand in; walk until the number changes). Since Part E the chunk on the
      other side of the border gets its new mesh a frame or two later: do you see a
      flicker, a hole for a moment, or shading that jumps late? _Phone, PC._ Result:

## 4. Mouse and keyboard

- [ ] **MOUSE-1** (1, 3A) "Click to play" captures the mouse, Esc opens the pause menu,
      "Click to continue" resumes. The mouse sensitivity slider works. Result:
- [ ] **MOUSE-2** (2A) `?touch=1` on the computer shows the touch controls; they react to
      real touches only, not to the mouse. Result:

## 5. Touch controls (phone and tablet)

- [ ] **TOUCH-1** (2A) Start: tapping the play button shows the controls. No button is cut
      off or hidden behind the system bars or a camera notch. Result:
- [ ] **TOUCH-2** (2A) Feel of the stick: does the thumb find it, is the dead zone right,
      is the travel right, does sprinting at full push happen when intended? Result:
- [ ] **TOUCH-3** (2A) Look sensitivity: is a comfortable drag enough to turn around? Which
      "Touch sensitivity" feels right (it can become the default)? Result:
- [ ] **TOUCH-4** (2A) Reachability: break, place, up and down with the right thumb while
      the left thumb is on the stick; fly and menu at the top. Too small, too close, wrong
      place? Result:
- [ ] **TOUCH-5** (2A) Three fingers: walk with the stick, turn with one finger and break
      with another. Result:
- [ ] **TOUCH-6** (2A) Holding break or place repeats four times a second (Creative).
      Result:
- [ ] **TOUCH-7** (2A) Block bar: tapping a slot selects it; no block is broken by the
      tap. Result:
- [ ] **TOUCH-8** (2A, 3A) Fullscreen: a tap on a play button hides the address bar. After
      "Exit fullscreen" in the menu, "Tap to continue" does not enter fullscreen again; the
      "Fullscreen" button still does. Does the rotate overlay flash when fullscreen starts
      (it should not)? Result:
- [ ] **TOUCH-9** (2A) Rotate overlay: turning the device upright shows "Please rotate
      your device to landscape."; turning back shows the menu. Result:
- [ ] **TOUCH-10** (2A) Gestures that must do nothing during play: pinch (no zoom), pull
      down from the top edge (no reload), swipes from the edges, a long press on the view
      or a button (no menu, no text selection). Result:
- [ ] **TOUCH-11** (2A, 4A) The menu by touch: sliders can be dragged (Brightness too),
      the debug switch toggles, "Copy link to this world" works. Result:

## 6. Worlds and saving

- [ ] **SAVE-1** (3A) Worlds survive: build something, pause, wait for "Saved", close the
      browser completely, reopen: the world is in the list and the building is there.
      Repeat after a restart of the device. _PC, Phone, Tablet._ Result:
- [ ] **SAVE-2** (3A) Closing without pausing: build, close the tab right away, reopen: at
      most the last few seconds are missing. Result:
- [ ] **SAVE-3** (3A) The "New world" form with the on-screen keyboard: the name field
      stays visible, typing works, "Create and play" can be reached. Does the rotate
      overlay appear while the keyboard is open? _Phone, Tablet._ Result:
- [ ] **SAVE-4** (3A) The world list: the world played last is on top and selected. On the
      phone the list scrolls with a finger; a tap selects a row. Result:
- [ ] **SAVE-5** (3A) "Delete" asks "Delete this world for ever?"; "Keep" keeps it. Result:
- [ ] **SAVE-6** (3A) Two tabs: the world that is open in the first tab cannot be played
      in the second ("This world is open in another tab."). Result:
- [ ] **SAVE-7** (3A) "Copy link to this world": the link opens the form with the seed;
      the new world has the same terrain, without the buildings. Result:
- [ ] **SAVE-8** (3A) A private window: the game either saves until the window is closed
      or says "Worlds cannot be saved in this browser window." Result:
- [ ] **SAVE-9** (3B, 3C) A Gathering world keeps its inventory, tools, workbench and
      furnace after "back to worlds" and a restart of the browser. Result:
- [ ] **SAVE-10** (3B, 3C) Worlds from earlier versions open with what was built and
      gathered. Result:

## 7. Gathering: breaking and the inventory

- [ ] **GATH-1** (3B) The mode choice in the "New world" form: is it clear what Gathering
      and Creative mean? The list names the mode of each world. Result:
- [ ] **GATH-2** (3B, 3C) Break times with the mouse: leaves 0.25 s, sand and dirt 0.6 s,
      a log 2 s, stone 3 s by hand; 1.5 s, 0.75 s and under 0.4 s with a wooden, stone and
      iron pickaxe. Fun or tedious? Does the first pickaxe feel like a reward? Is a log by
      hand too long? Result:
- [ ] **GATH-3** (3B) Break times by finger: is it comfortable to hold the break button
      for three seconds while the other thumb looks around? A short tap breaks nothing.
      _Phone, Tablet._ Result:
- [ ] **GATH-4** (3B) Cracks and progress bar: are the cracks visible on dark blocks and
      in the evening? Is the small bar under the crosshair noticed? Result:
- [ ] **GATH-5** (3B) Pickup notice ("+1 Dirt"): readable on the phone, gone soon enough?
      Result:
- [ ] **GATH-6** (3B) "Inventory full": is it understood why the block no longer breaks?
      Result:
- [ ] **GATH-7** (3B) The inventory with the mouse: `E` opens it; click a stack, then
      another slot: move, merge, swap; the bin throws away. Closing returns to the game
      with the mouse captured. `Esc` closes too but usually shows the pause menu: is that
      acceptable? Result:
- [ ] **GATH-8** (3B) The inventory on the phone: are the slots large enough for a finger,
      is everything on screen, are the counts readable? Result:
- [ ] **GATH-9** (3B) The bag button: is the symbol recognised, is its place good? Result:
- [ ] **GATH-10** (3B) Creative as before: flying, instant breaking, unlimited blocks; the
      inventory key shows all blocks and they can be put into the bar. Result:

## 8. Crafting and tools

- [ ] **CRAFT-2** (3C) Is the recipe list understood without reading: icons, "2 / 3" in
      red, the greyed rows, "Needs a workbench nearby", that the list scrolls? Result:
- [ ] **CRAFT-4** (3C) "Needs a pickaxe": is the hint noticed before the three seconds are
      spent? Should stone without a pickaxe not break at all instead? Result:
- [ ] **CRAFT-5** (3C) Is coal findable (dark specks in bare rock on hills)? If not: is it
      discovered that the furnace turns two logs into coal? Result:
- [ ] **CRAFT-6** (3C) Is iron findable? It lies deep and needs a stone pickaxe: is
      digging the shaft fun or tedious, and does one get out again? (With light the shaft
      is dark at the sides; torches come with Phase 4 part B.) Result:
- [ ] **CRAFT-7** (3C) The furnace's two seconds: does the bar feel like "it is cooking"?
      Is it understood that closing the bag cancels it and that holding goes on? Result:
- [ ] **CRAFT-9** (3C) The recipe list on the phone: are tabs, rows and buttons easy to
      hit, does scrolling work without crafting something, is the text readable? Result:
- [ ] **CRAFT-10** (3C) The icons: are pickaxe, axe and shovel told apart in the bar on
      the phone, and wood, stone and iron by colour? Do workbench and furnace look like
      what they are once placed? Result:
- [ ] **CRAFT-11** (3C) Building blocks: are stone bricks, glass, bricks and the iron
      block worth their recipes? Result:
- [ ] **CRAFT-12** (P1) The recipe list keeps one fixed order; what can be made is green
      and counted on the tab ("Crafting 3"). PC, Phone: are the craftable rows found,
      also those further down (furnace rows, torch)? Is the number on the tab noticed and
      understood? Result:
- [ ] **CRAFT-13** (P1) Holding "Craft" now makes the first item after half a second, then
      four per second. By mouse (PC) and by finger (Phone): does a short press still feel
      immediate? Does scrolling the list on the phone, starting on a "Craft" button, never
      craft? Result:

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

---

## 10. Multiplayer (Phase 6)

All on the Pi's preview build of the part's pull request (GitHub Pages has no multiplayer),
with every device in the home Wi-Fi (not a guest network). Open the world menu, then
**Settings → Network test**, on both devices of a pair at the same time. Paste the text of
**Copy result** after "Result:", or note candidate pair, round trip and throughput.

- [x] **NET-1** (6A) PC and phone: each shows "Signaling: Connected" and its test code;
      press **Connect** next to the other device on one of them. Both show a candidate
      pair, a round trip, a throughput and "Direct connection OK". _PC, Phone._ Result:
      passed (2026-11-20, build a7b0df5, Chrome 157 on Windows and on Android). Two runs
      with STUN on: candidate pair host → host over the global IPv6 address, round trip
      6.0 ms and 5.5 ms (median of 20), throughput 6.00 MB/s and 8.59 MB/s, "Direct
      connection OK".
- [x] **NET-2** (6A) The same for phone and tablet, and for tablet and PC. _Phone, Tablet,
      PC._ Result: passed (2026-11-20, build a7b0df5). Tablet and PC with STUN on: host →
      host over IPv6, round trip 6.0 ms, throughput 5.97 MB/s, "Direct connection OK".
      Phone and tablet: passed (owner, no numbers recorded).
- [x] **NET-3** (6A) The pairs of NET-1 and NET-2 with **Use STUN: off** on both devices
      (press it, wait for "Connected", connect again): does it still connect? Which
      candidate pair is used now? Result:
      passed (2026-11-20, build a7b0df5). PC and phone with STUN off: still host → host
      over IPv6, round trip 5.8 ms, throughput 4.65 MB/s, "Direct connection OK". Tablet
      and PC, phone and tablet: passed (owner, no numbers recorded). STUN is not needed on
      this home network; it stays as a safety net for devices without IPv6.
- [x] **NET-4** (6A) With all three devices on the network test: each lists the other two
      under "Others testing now" within a few seconds, and "Discovery" says "On". Result:
      passed (2026-11-20): PC, phone and tablet each listed the other two, "Discovery"
      showed "On".

---

## Obsolete

Tests that no longer need doing, with the reason.

- (1) "Deployment: set Settings → Pages → Source to GitHub Actions once." Reason: a
  one-time setup step, not a test; it is described in `README.md`.
- (2A) "Frame rate at render distance 5 and 8 on the phone." Reason: merged into PERF-1
  and PERF-2.
- (3A) "Frame rate and hitches – this decides whether Part D (Web Workers) is started."
  Reason: Phase 3 part D was never started; the question is now Phase 4 part C and is
  answered by PERF-1 and PERF-2.
- **PERF-1** (4A) "FPS standing, walking, flying fast, at render distance 5 and at 8, on
  the version before light. Does the picture stutter when new terrain appears?" Never
  filled in. Reason: light is merged and deployed, so the baseline before light can no
  longer be measured; the performance test judges each run by its own numbers instead.
- **PERF-2** (4A) "The same test with light, plus 'Chunk work: avg, max' and 'Frames: … in
  10 s, … long' from the overlay." Never filled in. Reason: these numbers are taken by the
  performance test (PERF-4), on the same route on every device.
- **TORCH-5** (4B) "Give the device to a child in a Gathering world at dusk without
  explaining anything: do they find "Torch" in the recipe list, understand that coal is
  needed, and use torches?" Never filled in. Reason: Dropped 2026-11-16: no tests with
  children.
- **CRAFT-1** (3C) "Can a child reach the wooden pickaxe without help, told only "break a
  tree and look into the bag"? Do they find the "Crafting" tab, understand the green rows,
  put the workbench down and stand next to it?" Never filled in. Reason: Dropped
  2026-11-16: no tests with children.
- **CRAFT-3** (3C) "The list reorders after every craft (what can be made moves up).
  Helpful or confusing?" Never filled in. Reason: polishing session 1 keeps the list in
  table order; CRAFT-12 asks about the fixed order.
- **CRAFT-8** (3C) "Holding "Craft", by mouse and by finger: four per second. Too fast for
  the player?" Never filled in. Reason: polishing session 1 delays the first repeat to
  half a second; CRAFT-13 asks about the new timing.
