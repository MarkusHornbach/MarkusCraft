// Back guard: while anything but the world list is shown, the page holds one history entry,
// so the browser's Back (or a phone's back gesture, or a controller whose B the browser
// sends as Back) acts in the game instead of leaving the page. Knows nothing of screens.
import { BACK_PAIR_MS } from './config';

export class BackGuard {
  /** Whether the guard should hold its entry. */
  private armed = false;
  /** Whether our entry is on the history stack. */
  private pushed = false;
  /** Our own `history.back()` is on its way; its `popstate` is not the player's. */
  private leaving = false;
  /** When the controller's B was pressed last. */
  private padBackAt = -Infinity;

  constructor(
    private readonly onBack: () => void,
    private readonly now: () => number = () => performance.now(),
  ) {
    window.addEventListener('popstate', () => this.onPop());
  }

  setArmed(armed: boolean): void {
    if (armed === this.armed) return;
    this.armed = armed;
    this.sync();
  }

  /** The controller's B was pressed: a "Back" right after it is the same press. */
  notePadBack(): void {
    this.padBackAt = this.now();
  }

  private sync(): void {
    if (this.leaving) return;
    try {
      if (this.armed && !this.pushed) {
        // The same address: only the history gets one more entry.
        history.pushState({ markuscraft: 'guard' }, '', window.location.href);
        this.pushed = true;
      } else if (!this.armed && this.pushed) {
        this.pushed = false;
        this.leaving = true;
        history.back();
      }
    } catch {
      // A browser may limit history calls; Back then leaves the page as before.
    }
  }

  private onPop(): void {
    if (this.leaving) {
      this.leaving = false;
      this.sync();
      return;
    }
    // The player went back: our entry is gone. Hold it again, then act like B.
    this.pushed = false;
    this.sync();
    if (!this.armed) return;
    if (this.now() - this.padBackAt < BACK_PAIR_MS) return;
    this.onBack();
  }
}
