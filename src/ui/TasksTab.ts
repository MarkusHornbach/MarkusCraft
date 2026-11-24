// The "Tasks" tab of the inventory screen (Adventure, Phase 8): level, XP bar, next unlocks
// and the task book. The open tasks are buttons that choose the tracked task (Polish 2).
import type { BookView, TaskRowView } from '../progress/view';
import { button, element } from './activate';

/** One row of the open chapter, kept while its task and its done state stay the same. */
interface Row {
  element: HTMLElement;
  done: boolean;
  label: HTMLElement;
  mark: HTMLElement;
  status: HTMLElement;
}

export class TasksTab {
  readonly element: HTMLElement;
  private readonly level: HTMLElement;
  private readonly xpFill: HTMLElement;
  private readonly xpText: HTMLElement;
  private readonly next: HTMLElement;
  private readonly finished: HTMLElement;
  private readonly chapter: HTMLElement;
  private readonly rows: HTMLElement;
  private readonly footer: HTMLElement;
  private shown = '';
  /** Rows by task id: a row that only changes its count or mark keeps its element, so
   * the controller's focus and the pointer stay on it. */
  private rowsById = new Map<number, Row>();

  /** `onChoose`: an open task's row was activated (click, tap, the controller's A). */
  constructor(
    parent: HTMLElement,
    private readonly onChoose: (task: number) => void,
  ) {
    this.element = element('div', 'tasks-tab');
    this.element.setAttribute('role', 'region');
    this.element.setAttribute('aria-label', 'Tasks');
    const head = element('div', 'tasks-level-row');
    this.level = element('span', 'tasks-level', '');
    const bar = element('span', 'tasks-xp-bar');
    this.xpFill = element('span', 'tasks-xp-fill');
    bar.appendChild(this.xpFill);
    this.xpText = element('span', 'tasks-xp-text', '');
    head.append(this.level, bar, this.xpText);
    this.next = element('div', 'tasks-next', '');
    this.finished = element('div', 'tasks-finished');
    this.chapter = element('div', 'tasks-chapter', '');
    this.rows = element('div', 'tasks-rows');
    this.footer = element('div', 'tasks-footer', '');
    this.element.append(head, this.next, this.finished, this.chapter, this.rows, this.footer);
    parent.appendChild(this.element);
  }

  /** Shows the book and marks the task the tracker shows; only a change touches the document. */
  update(view: BookView, tracked: number | null): void {
    const key = JSON.stringify([view, tracked]);
    if (key === this.shown) return;
    this.shown = key;
    this.level.textContent = `Level ${view.level}`;
    this.xpFill.style.width = `${Math.round(view.xpFraction * 100)}%`;
    this.xpText.textContent = view.xpText;
    this.next.textContent = view.nextText ?? '';
    this.next.hidden = view.nextText === null;
    this.finished.replaceChildren(
      ...view.finished.map((title) => element('div', 'tasks-finished-chapter', `✓ ${title}`)),
    );
    this.chapter.textContent = view.chapterTitle ?? '';
    this.chapter.hidden = view.chapterTitle === null;
    const rows = new Map<number, Row>();
    for (const task of view.tasks) {
      const known = this.rowsById.get(task.id);
      const row = known && known.done === task.done ? known : this.makeRow(task);
      if (row.label.textContent !== task.label) row.label.textContent = task.label;
      if (row.status.textContent !== task.status) row.status.textContent = task.status;
      const isTracked = task.id === tracked;
      row.element.classList.toggle('tracked', isTracked);
      row.mark.textContent = isTracked ? 'Tracked' : '';
      if (!task.done) row.element.setAttribute('aria-pressed', String(isTracked));
      rows.set(task.id, row);
    }
    const elements = [...rows.values()].map((row) => row.element);
    const same =
      elements.length === this.rows.children.length &&
      elements.every((node, index) => this.rows.children[index] === node);
    if (!same) this.rows.replaceChildren(...elements);
    this.rowsById = rows;
    this.footer.textContent = view.footer ?? '';
    this.footer.hidden = view.footer === null;
  }

  /** A done row is plain text; an open one is a button that chooses its task. */
  private makeRow(task: TaskRowView): Row {
    const node = task.done ? element('div', 'task-row done') : button('task-row', '');
    node.dataset.task = String(task.id);
    if (!task.done) {
      node.setAttribute('aria-label', task.label);
      node.addEventListener('click', () => this.onChoose(task.id));
    }
    const label = element('span', 'task-label', task.label);
    const mark = element('span', 'task-mark', '');
    const status = element('span', 'task-status', task.status);
    node.append(label, mark, status);
    return { element: node, done: task.done, label, mark, status };
  }

  /** Back to the top, as when a world is loaded. */
  scrollToTop(): void {
    this.element.scrollTop = 0;
  }
}
