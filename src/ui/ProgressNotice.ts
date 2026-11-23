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

  /**
   * The line to show; null hides the notice. Over the open inventory a short screen has no
   * room above the panel: the notice moves to the bottom edge there (CSS), off the tabs.
   */
  show(text: string | null, overInventory = false): void {
    this.element.classList.toggle('over-inventory', overInventory);
    if (text === null) {
      if (!this.element.hidden) this.element.hidden = true;
      return;
    }
    if (this.element.textContent !== text) this.element.textContent = text;
    if (this.element.hidden) this.element.hidden = false;
  }
}
