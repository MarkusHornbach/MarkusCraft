// The progress notice ("Task done: Mine 4 logs · +10 XP"): one line in the top centre,
// above the HUD and the open inventory screen. It takes no pointer and no focus.
export class ProgressNotice {
  readonly element: HTMLElement;

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'progress-notice';
    this.element.setAttribute('role', 'status');
    this.element.hidden = true;
    parent.appendChild(this.element);
  }

  /** The line to show; null hides the notice. */
  show(text: string | null): void {
    if (text === null) {
      if (!this.element.hidden) this.element.hidden = true;
      return;
    }
    if (this.element.textContent !== text) this.element.textContent = text;
    if (this.element.hidden) this.element.hidden = false;
  }
}
