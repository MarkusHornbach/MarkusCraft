// Back guard: while anything but the world list is shown, the page holds one history entry,
// so the browser's Back (or a phone's back gesture, or a controller whose B the browser
// sends as Back) acts in the game instead of leaving the page. Knows nothing of screens.
import { BACK_PAIR_MS } from './config';

export class BackGuard {
  /** Whether our entry is on the history stack. */
  private pushed = false;
  /** When the controller's B was pressed last. */
  private padBackAt = -Infinity;

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
    if (this.armed() && !this.pushed) this.push();
  }

  /** The controller's B was pressed: a "Back" right after it is the same press. */
  notePadBack(): void {
    this.padBackAt = this.now();
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
    if (this.now() - this.padBackAt < BACK_PAIR_MS) return;
    this.onBack();
  }
}
