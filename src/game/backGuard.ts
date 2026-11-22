// Back guard: while anything but the world list is shown, the page holds one history entry,
// so the browser's Back (or a phone's back gesture, or a controller whose B the browser
// sends as Back) acts in the game instead of leaving the page. Knows nothing of screens.
import { BACK_PAIR_FRAME_MS, BACK_PAIR_MS } from './config';

export class BackGuard {
  /** Whether our entry is on the history stack. */
  private pushed = false;
  /** Whether a B press may still be paired with a Back. */
  private padBackPending = false;
  /** Time counted since the last B press (each frame at most `BACK_PAIR_FRAME_MS`). */
  private padBackElapsed = 0;
  /** When the B press or the last frame since it was counted. */
  private padBackMark = 0;

  /**
   * `armed` says whether Back should act in the game right now; it is asked at the moment
   * of each Back, so a screen that changed since the last frame counts.
   */
  constructor(
    private readonly onBack: () => void,
    private readonly armed: () => boolean,
    private readonly now: () => number = () => performance.now(),
  ) {
    window.addEventListener('popstate', () => this.onPop());
  }

  /**
   * Called once per frame: while armed the guard holds its entry. Disarmed it leaves the
   * entry where it is: taking it back would be a navigation of its own that could collide
   * with a reload or a link.
   */
  update(): void {
    if (this.padBackPending) {
      this.padBackElapsed += this.sinceMark();
      this.padBackMark = this.now();
      if (this.padBackElapsed >= BACK_PAIR_MS) this.padBackPending = false;
    }
    if (this.armed() && !this.pushed) this.push();
  }

  /** The controller's B was pressed: a "Back" right after it is the same press. */
  notePadBack(): void {
    this.padBackPending = true;
    this.padBackElapsed = 0;
    this.padBackMark = this.now();
  }

  /** Time since the last mark, as much of it as one frame may count. */
  private sinceMark(): number {
    return Math.min(this.now() - this.padBackMark, BACK_PAIR_FRAME_MS);
  }

  /**
   * Whether a "Back" now is the one that came with the last B press. The browser starts
   * that Back with the press, but its `popstate` needs several tasks on the page's main
   * thread, which wait behind a slow frame, and frames may run between them. So the window
   * is not wall-clock time: each frame since B (and the wait since the last one) counts at
   * most `BACK_PAIR_FRAME_MS`. At 60 fps that is wall-clock time, as before; with slow
   * frames a Back is paired within `BACK_PAIR_MS / BACK_PAIR_FRAME_MS` (6) frames, however
   * long they took.
   */
  private pairedWithPadBack(): boolean {
    return this.padBackPending && this.padBackElapsed + this.sinceMark() < BACK_PAIR_MS;
  }

  private push(): void {
    try {
      // The same address: only the history gets one more entry.
      history.pushState({ markuscraft: 'guard' }, '', window.location.href);
      this.pushed = true;
    } catch {
      // A browser may limit history calls; Back then leaves the page as before.
    }
  }

  private onPop(): void {
    // The player went back: our entry is gone.
    this.pushed = false;
    if (!this.armed()) {
      // The world list: Back means leaving. Our entry was in the way; go on past it, after
      // the traversal that fired this event (one started inside it is dropped).
      window.setTimeout(() => {
        try {
          history.back();
        } catch {
          // Then the next Back leaves.
        }
      }, 0);
      return;
    }
    this.push();
    if (this.pairedWithPadBack()) return;
    this.onBack();
  }
}
