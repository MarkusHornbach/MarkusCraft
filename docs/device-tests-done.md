# Tests on real devices: done

Tests from `docs/device-tests.md` and `docs/device-tests-2.md` that the owner has ticked ("Passed") or that no longer
need doing ("Obsolete"). Every entry was moved here unchanged, with what the owner wrote
after "Result:". Ids are never reused. The open tests, and how both files are kept up to
date, are in `docs/device-tests.md`.

---

## Passed

### 1. Performance (decides about Web Workers, Phase 4 part C)

- [x] **PERF-8** (6E) After Phase 6 part E is deployed: run the performance test on PC,
      phone and tablet and submit the issues. The suite now has thirteen scenarios: the
      new one, "four players", has three simulated players (Ember, Moss and Plum) walk in
      front of you and place and break blocks, played inside the page without any network.
      Is it green on the phone, and do the three figures walk and swing their arms smoothly
      while you watch? _PC, Phone, Tablet._ Result: passed (owner, 2026-11-21)

### 10. Multiplayer (Phase 6)

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

The tests of Part B use a **Creative** world made on the PR preview (worlds are stored per
site, so the preview starts with an empty world list). The host opens it with **Pause →
Open to others**; the others join from **Join a world** on the world menu. Type a name
there on every device first.

- [x] **NET-5** (6B) Open a Creative world on the PC and press **Open to others**. On phone
      and tablet the world appears under **Open worlds at home** within a few seconds;
      press **Join** on both. Build together for ten minutes: do edits of every player
      appear on the others at once (within a second)? Does anything ever differ between
      the devices (a block missing or in the wrong place)? Result: passed (owner, 2026-11-21)
- [x] **NET-6** (6B) Join with the room code typed on the phone (try lower case and a
      space in the middle), and once with the join link (**Copy join link** on the host,
      send it to the tablet, open it there: the world menu shows "Join world CODE").
      Result: passed (owner, 2026-11-21)
- [x] **NET-7** (6B) The other players' figures and name tags: is every name readable
      from a few blocks? Do the figures move smoothly when their players walk, jump and
      fly, and turn their head when they look up or down? At night (wait for it, or open
      the world at night): does a figure in the dark look dark, and lit next to a torch?
      Result: passed (owner, 2026-11-21)
- [x] **NET-8** (6B) Host on the tablet; phone and PC join. Lock the tablet's screen for a
      few seconds: what do the others see ("Connection lost. Reconnecting…", then back, or
      "Lost the connection to the host.")? Does the tablet show the hint "The world closes
      for everyone if this screen locks…" in its pause menu while hosting? Result: passed (owner, 2026-11-21)
- [x] **NET-9** (6B) PC as host, phone as guest. Minimise the host's browser on the PC for a
      minute: can the phone go on building, and do its edits appear on the PC when it is
      back? Does the time of day go on? Result: passed (owner, 2026-11-21)
- [x] **NET-10** (6B) Turn Wi-Fi off on a guest phone for 5 s and on again: does the phone
      show "Connection lost. Reconnecting…" and then play on with its bar as before? And
      for 30 s: does it return to the world list with "Lost the connection to the host."?
      Result: passed (owner, 2026-11-21)
- [x] **NET-11** (6B) With a controller only (no mouse, keyboard or touch): join a listed
      world from the world menu (D-pad to **Join**, A), play, press Start, choose **Leave
      world**. Result: passed (owner, 2026-11-21)
- [x] **NET-12** (6B) Four players (PC host, phone, tablet and a second browser window or
      device): the frame rate on the phone with three figures in view (F3 overlay, or the
      feel compared with single-player). Result: passed (owner, 2026-11-21)

The tests of Part C use a **Gathering** world made on the PR preview, opened to others
like a Creative world (**Pause → Open to others**). They need two players at least; the
host can be any device.

- [x] **NET-13** (6C) Two players gather in a Gathering world for ten minutes: break logs,
      dirt and stone, craft planks, a workbench and a pickaxe, place a furnace and smelt
      something. Does a break ever fail or start over although the button was held (the
      cracks run full and nothing happens, or begin again)? Does the guest's break take as
      long as the host's for the same block and tool? Do the items always land with the
      player who broke the block? Result: passed (owner, 2026-11-21)
- [x] **NET-14** (6C) The guest builds up a bar of items and walks somewhere, then **Leave
      world**, and joins again: are the items and the place back? Then the host chooses
      **Save and back to worlds**, opens the world again and **Open to others**; the guest
      joins the new room: items and place still there? Result: passed (owner, 2026-11-21)
- [x] **NET-15** (6C) Two players about 300 blocks apart (one of them walks there): both
      break blocks and craft at a workbench next to themselves. Does everything work for the one far from the host? Result: passed (owner, 2026-11-21)
- [x] **NET-16** (6C) A guest places torches on stone in a dark place and breaks some of
      the stones under them: do the torches and their light look the same on every device,
      and does a broken torch land in the guest's bag? Result: passed (owner, 2026-11-21)

The tests of Part D are about the player figure that replaced the coloured boxes of Part B,
and about **Settings → Your player** (name and look). NET-17 to NET-19 belong to Part E.

- [x] **NET-20** (6D) Look at the eight looks under **Your player** and as figures of
      other players a few blocks away. Are they clearly different from each other, do
      they look good, and does any of them remind you of a figure from another game? Two
      players choose the same look: do the belt colour and the stripe on the name tag
      keep them apart? Result: passed (owner, 2026-11-21)
- [x] **NET-21** (6D) Watch another player's figure while that player walks, runs into a
      wall, jumps, flies, stands and looks around (does the body follow the head
      naturally?), looks up and down, breaks a block in Gathering (the arm swings all the
      time) and places blocks (one swing each). Is anything jerky or odd? Result: passed (owner, 2026-11-21)
- [x] **NET-22** (6D) **Your player** with the mouse, by touch on phone and tablet, and with
      the controller: choose a look and type a name. Does the preview turn smoothly, is
      every look button easy to hit, is the choice still there after a reload? Result: passed (owner, 2026-11-21)
- [x] **NET-23** (6D) During a room, change look and name in the settings of the pause
      menu: do the others see the new figure, name tag and player list entry within a
      second? Result: passed (owner, 2026-11-21)
- [x] **NET-24** (6D) Frame rate on the phone with three animated figures in view (four
      players), compared with single-player and, if you remember them, with the box
      figures of Part B (F3 overlay, or the feel). Result: passed (owner, 2026-11-21)
- [x] **NET-25** (6D) At night: is a figure in a dark place dark, lit next to a torch, and
      is its name tag readable? Result: passed (owner, 2026-11-21)

The tests of Part E use the Pi's preview of Part E's pull request, like the tests before.

- [x] **NET-17** (6E) The network lines of the debug overlay (F3 on the PC, the "Debug
      overlay" switch in the pause menu on touch devices) on host and guest while two or
      three players build: do "Room", "Round trip", "Link", "Signaling" and "Traffic" show
      sensible values (a round trip of a few milliseconds, "direct (host → host)" or "via
      STUN", traffic that rises while players move)? Note the round trip and the traffic
      with three players. _PC, Phone._ Result: passed (owner, 2026-11-21)
- [x] **NET-18** (6E) The performance test with the new scenario "four players" on PC,
      phone and tablet: see **PERF-8** in section 1 (the issues are the result here too).
      Result: passed (owner, 2026-11-21)
- [x] **NET-19** (6E, optional) A second browser as guest: Firefox on the PC (or on the
      phone) joins a world hosted in Chrome. Does it join, build and see the figures like
      Chrome? A failure to join with "This browser generates the world differently…" is a
      finding worth noting. Result: passed (owner, 2026-11-21)

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
- [ ] **PERF-3** (1) PC only: 60 FPS at render distance 8 on a mid-range laptop? Try 16 as
      well (render distance 16 is not part of the performance test; use the debug overlay,
      F3). Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **MOVE-1** (1) Feel of movement: walking and sprint speed, jump height, air control,
      swimming and climbing out of water, fly speed. Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **LOOK-1** (1) Look of the textures, and of the sky at sunrise and sunset. Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **LOOK-2** (3A) Rocky hills: is the change from grass to rock natural? Are the black
      nuggets of coal ore easy to spot from some blocks away? Is the blue-grey clay in a
      lake recognisable? Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **MOUSE-1** (1, 3A) "Click to play" captures the mouse, Esc opens the pause menu,
      "Click to continue" resumes. The mouse sensitivity slider works. Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **MOUSE-2** (2A) `?touch=1` on the computer shows the touch controls; they react to
      real touches only, not to the mouse. Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **TOUCH-1** (2A) Start: tapping the play button shows the controls. No button is cut
      off or hidden behind the system bars or a camera notch. Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **TOUCH-2** (2A) Feel of the stick: does the thumb find it, is the dead zone right,
      is the travel right, does sprinting at full push happen when intended? Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **TOUCH-3** (2A) Look sensitivity: is a comfortable drag enough to turn around? Which
      "Touch sensitivity" feels right (it can become the default)? Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **TOUCH-4** (2A) Reachability: break, place, up and down with the right thumb while
      the left thumb is on the stick; fly and menu at the top. Too small, too close, wrong
      place? Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **TOUCH-5** (2A) Three fingers: walk with the stick, turn with one finger and break
      with another. Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **TOUCH-6** (2A) Holding break or place repeats four times a second (Creative).
      Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **TOUCH-7** (2A) Block bar: tapping a slot selects it; no block is broken by the
      tap. Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **TOUCH-8** (2A, 3A) Fullscreen: a tap on a play button hides the address bar. After
      "Exit fullscreen" in the menu, "Tap to continue" does not enter fullscreen again; the
      "Fullscreen" button still does. Does the rotate overlay flash when fullscreen starts
      (it should not)? Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **TOUCH-9** (2A) Rotate overlay: turning the device upright shows "Please rotate
      your device to landscape."; turning back shows the menu. Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **TOUCH-10** (2A) Gestures that must do nothing during play: pinch (no zoom), pull
      down from the top edge (no reload), swipes from the edges, a long press on the view
      or a button (no menu, no text selection). Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **TOUCH-11** (2A, 4A) The menu by touch: sliders can be dragged (Brightness too),
      the debug switch toggles, "Copy link to this world" works. Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **SAVE-1** (3A) Worlds survive: build something, pause, wait for "Saved", close the
      browser completely, reopen: the world is in the list and the building is there.
      Repeat after a restart of the device. _PC, Phone, Tablet._ Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **SAVE-2** (3A) Closing without pausing: build, close the tab right away, reopen: at
      most the last few seconds are missing. Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **SAVE-3** (3A) The "New world" form with the on-screen keyboard: the name field
      stays visible, typing works, "Create and play" can be reached. Does the rotate
      overlay appear while the keyboard is open? _Phone, Tablet._ Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **SAVE-4** (3A) The world list: the world played last is on top and selected. On the
      phone the list scrolls with a finger; a tap selects a row. Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **SAVE-5** (3A) "Delete" asks "Delete this world for ever?"; "Keep" keeps it. Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **SAVE-6** (3A) Two tabs: the world that is open in the first tab cannot be played
      in the second ("This world is open in another tab."). Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **SAVE-7** (3A) "Copy link to this world": the link opens the form with the seed;
      the new world has the same terrain, without the buildings. Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **SAVE-8** (3A) A private window: the game either saves until the window is closed
      or says "Worlds cannot be saved in this browser window." Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **SAVE-9** (3B, 3C) A Gathering world keeps its inventory, tools, workbench and
      furnace after "back to worlds" and a restart of the browser. Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **SAVE-10** (3B, 3C) Worlds from earlier versions open with what was built and
      gathered. Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **GATH-1** (3B) The mode choice in the "New world" form: is it clear what Gathering
      and Creative mean? The list names the mode of each world. Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **GATH-2** (3B, 3C) Break times with the mouse: leaves 0.25 s, sand and dirt 0.6 s,
      a log 2 s, stone 3 s by hand; 1.5 s, 0.75 s and under 0.4 s with a wooden, stone and
      iron pickaxe. Fun or tedious? Does the first pickaxe feel like a reward? Is a log by
      hand too long? Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **GATH-3** (3B) Break times by finger: is it comfortable to hold the break button
      for three seconds while the other thumb looks around? A short tap breaks nothing.
      _Phone, Tablet._ Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **GATH-4** (3B) Cracks and progress bar: are the cracks visible on dark blocks and
      in the evening? Is the small bar under the crosshair noticed? Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **GATH-5** (3B) Pickup notice ("+1 Dirt"): readable on the phone, gone soon enough?
      Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **GATH-6** (3B) "Inventory full": is it understood why the block no longer breaks?
      Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **GATH-7** (3B) The inventory with the mouse: `E` opens it; click a stack, then
      another slot: move, merge, swap; the bin throws away. Closing returns to the game
      with the mouse captured. `Esc` closes too but usually shows the pause menu: is that
      acceptable? Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **GATH-8** (3B) The inventory on the phone: are the slots large enough for a finger,
      is everything on screen, are the counts readable? Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **GATH-9** (3B) The bag button: is the symbol recognised, is its place good? Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **GATH-10** (3B) Creative as before: flying, instant breaking, unlimited blocks; the
      inventory key shows all blocks and they can be put into the bar. Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **CRAFT-2** (3C) Is the recipe list understood without reading: icons, "2 / 3" in
      red, the greyed rows, "Needs a workbench nearby", that the list scrolls? Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **CRAFT-4** (3C) "Needs a pickaxe": is the hint noticed before the three seconds are
      spent? Should stone without a pickaxe not break at all instead? Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **CRAFT-5** (3C) Is coal findable (dark specks in bare rock on hills)? If not: is it
      discovered that the furnace turns two logs into coal? Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **CRAFT-6** (3C) Is iron findable? It lies deep and needs a stone pickaxe: is
      digging the shaft fun or tedious, and does one get out again? (With light the shaft
      is dark at the sides; torches come with Phase 4 part B.) Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **CRAFT-7** (3C) The furnace's two seconds: does the bar feel like "it is cooking"?
      Is it understood that closing the bag cancels it and that holding goes on? Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **CRAFT-9** (3C) The recipe list on the phone: are tabs, rows and buttons easy to
      hit, does scrolling work without crafting something, is the text readable? Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **CRAFT-10** (3C) The icons: are pickaxe, axe and shovel told apart in the bar on
      the phone, and wood, stone and iron by colour? Do workbench and furnace look like
      what they are once placed? Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **CRAFT-11** (3C) Building blocks: are stone bricks, glass, bricks and the iron
      block worth their recipes? Result:
      Reason: Dropped by the owner, 2026-11-22.
- [ ] **PROG-3** (8A1) The controller reaches the Tasks tab with RB (from Crafting) and
      scrolls it with the right stick; B closes the inventory. Is it clear that nothing in
      the tab can be selected? _PC or Phone, controller._ Result:
      Reason: Polish 2 makes the open task rows selectable (the tracked task); PROG-9
      replaces it.
- [ ] **PROG-5** (8A1) A locked recipe row ("Level 3" or "Task: Mine 32 coal" instead of
      "Craft"): is it clear why it cannot be made and what to do about it? _PC._ Result:
      Reason: Fix Adventure 1 moved the torch's unlock to "Make 16 coal", so the example
      "Task: Mine 32 coal" no longer exists; PROG-12 asks the same question.
- [ ] **RADAR-3** (8B1) The circle: are coal and iron told apart at a glance, are the hints
      readable, is it in the way anywhere (PC top right; phone below the bag)? _PC, Phone._
      Result:
      Reason: Phase 8 part B2b made the circle larger (setting "Radar circle size",
      default Medium) and added places; PLACE-1 and PLACE-5 replace it.
- [ ] **RADAR-5** (8B1) The Map tab with mouse, touch and controller: readable on the
      phone, the terrain recognisable (lake, hills), the legend clear? _PC, Phone,
      controller._ Result:
      Reason: Phase 8 part B2b makes the Map tab fill the screen (on the phone the tabs
      move beside the map); PLACE-6 replaces it.
