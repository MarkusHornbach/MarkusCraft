// The task tracker (Polish 2): one line in the HUD's top-left corner, "Mine 32 logs  12 / 32".
// Part of the HUD, so it hides with it. It takes no pointer and no focus.
export class TaskTracker {
  readonly element: HTMLElement;
  private readonly label: HTMLElement;
  private readonly count: HTMLElement;

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'task-tracker';
    this.element.hidden = true;
    this.label = document.createElement('span');
    this.label.className = 'tracker-label';
    // The two spaces of the line keep their width (`white-space: pre`); only the label
    // is cut with an ellipsis, the count always shows.
    this.count = document.createElement('span');
    this.count.className = 'tracker-count';
    this.element.append(this.label, this.count);
    parent.appendChild(this.element);
  }

  /** The task to show (its id, label and count text); null hides the tracker. */
  show(task: { id: number; label: string; count: string } | null): void {
    if (task === null) {
      if (!this.element.hidden) this.element.hidden = true;
      return;
    }
    const id = String(task.id);
    if (this.element.dataset.task !== id) this.element.dataset.task = id;
    if (this.label.textContent !== task.label) this.label.textContent = task.label;
    const count = `  ${task.count}`;
    if (this.count.textContent !== count) this.count.textContent = count;
    if (this.element.hidden) this.element.hidden = false;
  }

  get visible(): boolean {
    return !this.element.hidden;
  }
}
