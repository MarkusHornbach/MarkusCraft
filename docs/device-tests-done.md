# Tests on real devices: done

Tests from `docs/device-tests.md` that the owner has ticked ("Passed") or that no longer
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
