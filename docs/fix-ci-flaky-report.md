# Fix: flaky browser tests after CI 1

A round of work on tests, not a game phase. Since CI 1 (`docs/ci-1-report.md`) the browser
tests run in shards, and three timing-dependent tests failed now and then (CI 1 report,
section 6). Goal: a red run means a real defect again. Pull request: #36.

## 1. The back guard: B and a browser Back held up by a slow frame (main task)

**Seen:** `gamepadMenus.spec.ts` "Phase 5 AC3.7: B and a browser Back held up by a slow
frame act once" timed out at `waitForFunction(() => !paused)` in 3 of the 8 full runs of
PR #35 (#168 in shard game 2, #180 and #185 in game 4). The game stayed paused: B continued
it, and the Back that came with B paused it again before the test could look.

### Cause

`BackGuard` (`src/game/backGuard.ts`) pairs a browser Back with the controller's B press
so one press does not act twice. Since `docs/fix-pad-flaky-report.md` (section 2) the
rule was: paired if the `popstate` comes within `BACK_PAIR_MS` (150 ms) of the poll that saw
B, **or** before the end of the frame after the B frame. The test busy-waits 600 ms in the
frame after the poll and then calls `history.back()`; when the `popstate` came after one
more ordinary frame, it was neither within 150 ms nor before the end of the next frame, so
it counted as a second Back. The suspected cause of the CI 1 report was right in its
effect; the measurements below change where the fix belongs.

### Measurements (probes in this container, not committed)

| Probe                                                                                                                                           | Result                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| On a plain page, `history.back()` → `popstate`                                                                                                  | 1 ms                                                                                            |
| In the game, `history.back()` after the 600 ms frame → `popstate` (960 × 540, 64 × 48 view)                                                     | 8–66 ms, no game frame in between (16 of 16; frames 17 ms at 64 × 48)                           |
| `history.back()` called **before** the 600 ms wait (the order a real browser would use)                                                         | the `popstate` still came 8–52 ms **after** the slow frame ended, no frame in between (8 of 8)  |
| A browser-side Back (DevTools `Page.navigateToHistoryEntry`, like the phone's back gesture) sent 0–6 ms after the B poll, during the slow frame | `popstate` 7–78 ms after the slow frame ended (10 of 10); no frame in between in this container |
| One ordinary game frame forced between the slow frame and `history.back()` (old build)                                                          | the game ends **paused** 6 of 6 times: exactly the CI failure                                   |
| The same with the fixed guard                                                                                                                   | ends unpaused 6 of 6 times, also with two frames in between                                     |

The race itself (an ordinary frame running first) did not show in this container on its
own, also not under three busy CPU cores; it needs a runner whose scheduler starts the next
frame before the traversal's tasks, as a lightly loaded shard runner evidently did.

### Where the fix belongs, and why

In `backGuard.ts`. The task offered the spec if only the test's order of events were
unrealistic ("a real browser queues the Back during the slow frame"). The measurements say
otherwise: even a Back that the browser starts **during** the slow frame reaches the page
only 7–78 ms **after** it, because a same-document traversal needs several tasks on the
page's main thread (the navigation is confirmed with the page before `popstate` fires), and
each of them waits behind the slow frame. Whether a frame runs between those tasks is the
browser scheduler's choice, on a device as on a runner; on a phone at 90 or 120 Hz an
ordinary frame fits into that gap easily. So a real device can see the same thing: B after
a big edit continues the game, and the paired Back pauses it again. Moving `history.back()`
in the test would not have changed the timing either (row 3 of the table).

### Fix

`BACK_PAIR_FRAME_MS` (25, `src/game/config.ts`): the pairing window of `BACK_PAIR_MS` is no
longer wall-clock time but the time of the frames since B, each frame (and the wait since
the last one) counted at most 25 ms. The guard keeps `padBackElapsed` and a mark;
`update()` (once per frame) adds the capped time, `notePadBack()` starts again at 0.

- At 60 fps a frame is 17 ms, below the cap: the window is 150 ms of wall-clock time, as
  before.
- With slow frames the window is `150 / 25` = **6 frames**, however long they take; the
  old frame rule (up to the end of the frame after the B frame) is contained in it.
- A wait without any frame (the page frozen) counts at most 25 ms, so a Back that waited
  for it is paired.
- A Back after the window acts: 150 ms of 60 fps frames, or six slow frames.

Why 25: with software WebGL (CI, this container) frames take 40–70 ms; at a cap of 50 the
window would be three frames, and the CI failure was B frame + slow frame + one ordinary
frame + the traversal's own wait, which three could just miss. Six frames leave room, and
a deliberate second Back on a device at 10 fps still acts after 0.6 s.

What it costs: on a device below 40 fps a separate Back pressed less than six frames after
B (e.g. 0.3 s at 20 fps) is taken as the same press and ignored. A person cannot press B
and then deliberately use the back gesture that quickly; PAD-16 checks it on the phone.

### Tests

- `src/game/backGuard.test.ts`: the two old cases (fast device, slow frames up to the end
  of the next frame) kept; the old "two frames and 150 ms later acts" became "150 ms of
  60 fps frames acts" (two frames without any time in between are, under the new rule, a
  frozen page, which pairs). New: the CI order (B frame, a 600 ms frame, a 40 ms frame, the
  Back 20 ms later) is paired; five slow frames pair, six act; a later B starts the window
  again. The CI-order and the slow-frame-limit tests fail on the old guard.
- `e2e/gamepadMenus.spec.ts`: the test of the task is **unchanged** (B, a 600 ms frame,
  then the Back). New next to it: "Phase 5 AC3.7: B, a slow frame, and a Back that an
  ordinary frame delays act once", which waits for one game frame after the slow one
  before `history.back()`, the order CI hit by chance. It failed 2 of 2 times on the old
  guard (at the same line as on CI) and passes on the new one.

## 2. The network test not done within 30 s (run #168)

**Seen:** `netTest.spec.ts` "Phase 6 AC2.1, AC2.5, AC2.7" in shard game 3 of #168: the
wait for `state === 'done' && candidate !== null` on the first page ran out after 30 s.

**What the artifacts say:** the blob report of the shard (downloaded while still kept)
shows both pages listing each other within 0.3 s, the click on "Connect", then 300 polls of
the state, all false, for 29.9 s. The error and the error context carry no state: which
phase the run reached (hello, ping, data), whether the connection opened or the test
failed (`connect timeout`, `closed`) is not recorded. #168 was the run with Playwright's
built-in sharding, whose game shard 3 took 14 minutes (the heaviest specs together, CI 1
report section 4); it failed in none of the full runs after it (#172 to #188 on PR #35 and
`main`).

**Reproduction:** `netTest.spec.ts` 5 times (40 passed), and the AC2.1 test 15 more times
one after the other with three CPU cores kept busy (15 passed). Not reproduced. (A first
attempt with two workers failed at once with `EADDRINUSE`: the test owns port 9003, so it
can never run twice at the same time; in CI it never does.)

**Decision:** no clear cause, so no fix (the task's rule). The test's own 30 s equal the
run's timeout (`NET_TEST_RUN_TIMEOUT_MS`), so a run that got stuck and one that was only slow
look the same. What changed: `untilNetTest` (`e2e/multiplayer.ts`) now adds the state the
wait ended on to its error ("Last network test state: {…}"), so the next failure names the
phase, the connection state and the verdict. The wait and the assertion are unchanged.
Known issue (section 6).

## 3. The soak: guest 3 reconnecting (run #172)

**Seen:** `mpHarden.spec.ts` "Phase 6 AC14.3: soak" in shard mp 3 of #172: in the first
half, guest 3's actions 3 to 12 were refused on its own screen while its status was
`reconnecting`; 13 and 14 then found their cells one step behind (`unbreakable`,
`occupied`), as the Phase 6 E report describes ("The soak on a busy runner").

**Cause as far as the evidence goes:** a guest goes `reconnecting` when it has heard
nothing from the host for `HEARTBEAT_TIMEOUT_MS` (5 s); guest 3 is the last to join, and
its status changed within its first three actions, right after the join and the jump to
the columns. Four software-rendered pages on a 4-core runner can stall a page's timers
that long; that is the planned product behaviour on a silent connection, and NET-10 (a guest
reconnecting after 5 s without Wi-Fi) passed on real devices. Which side went silent (the host's timer or the guest's) is
not in the log. It did not fail again in the full runs after #172 (#174 to #188).

**Decision:** no clear cause beyond "a stalled page", so no fix; known issue (section 6).
Making the soak lighter or the heartbeat longer would change the test's content or the
product, which needs the owner.

## 4. Evidence

### Locally (this container, `MC_CONTAINER_GPU_STALL=1`)

- `npm run check` and `npm run build`: pass, no warnings.
- `e2e/gamepad.spec.ts`, `e2e/gamepadMenus.spec.ts`, `e2e/gamepadInventory.spec.ts`
  with `--repeat-each 3 --workers 2`: **117 passed, 0 failed** (7.6 min).
- The four back-guard tests with `--repeat-each 8 --workers 2`: **32 passed**.
- `e2e/netTest.spec.ts` with `--repeat-each 5`: **40 passed**; the AC2.1 test 15 times
  more under CPU load: **15 passed**.

### CI (pull request #36)

Full runs of the pull request (start → `CI result`). Runs cancelled by a newer push (#190,
#191, #192) are left out; their red `CI result` only says "cancelled".

| Run  | Head    | What ran                                                                                 | Fixed tests                                                      | Whole run | `CI result` |
| ---- | ------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------: | ----------- |
| #194 | 1f22070 | full suite plus the throwaway rounds (af1a917): the back guard's 4 tests × 10, AC2.1 × 5 | back guard 40 of 40 passed, AC2.1 5 of 5 (shard game 4, 6.8 min) |  14.8 min | green       |
| #196 | 2bf61f1 | full suite, final code (throwaway reverted in 7d22e21)                                   | passed (each test once)                                          |  16.4 min | green       |

## 5. What CI 1 left for the first session after its merge

- **The run on `main` after the merge of PR #35** is run #188 (push of the merge commit
  0021cf6): it ran the full suite (`changes` gave `full: true`; all four `game` and three
  `multiplayer` shards ran), was not cancelled, and was **green in 15.8 min**. This is what
  CI 1 plan section 7 / report section 7 asked to check.
- **S2 (a docs-only pull request skips the browser tests)** is still not shown on GitHub:
  this pull request changes code. The first docs-only pull request shows it.
- The required check (`CI result` instead of the old `check`) is the owner's setting; this
  session cannot see it.

## 6. Known issues

- `netTest.spec.ts` "Phase 6 AC2.1, AC2.5, AC2.7" (section 2): failed once (#168), cause
  unknown; the next failure prints the network test's last state.
- `mpHarden.spec.ts` "Phase 6 AC14.3: soak" (section 3): failed once (#172) with a guest
  reconnecting after a stall; cause beyond that unknown.
- A Back that the browser delivers _before_ the poll that sees the same B is still not
  paired (as in `docs/fix-pad-flaky-report.md`); no test or device report shows it.
- Under 40 fps a separate Back within six frames of B is ignored (section 1, "What it
  costs"); PAD-16 checks the feel on the phone.

## 7. Decisions and deviations

- **The fix went into the game, not the spec** (section 1). The test of the task keeps its
  content unchanged; one e2e test was added for the order CI hit.
- **The throwaway repeat ran in the spec, not the workflow**: the workflow must not change,
  so commit af1a917 put the back guard's four tests into ten rounds and the AC2.1 network
  test into five serial rounds (it owns port 9003) inside their normal shards; the next
  commit reverted it.
- **Device test PAD-16** added (`docs/device-tests.md`, section 9, origin "FIX").
- No reference screenshot, no workflow and no `deploy.yml` changed; no retries.

## 8. For the next session

- If netTest AC2.1 or the soak fails again, the error now (netTest) or already (soak) says
  enough to decide; record it in the report of that session.
- PAD-16 on the phone: if a deliberate Back right after B is ignored too often,
  `BACK_PAIR_FRAME_MS` can go down to 20; below that the CI order of events breaks again
  with software WebGL.
