// The "Tasks" tab of the inventory screen (Adventure, Phase 8): level, XP bar, next unlocks
// and the task book. Read-only: nothing in it takes the focus; the panel scrolls.
import type { BookView } from '../progress/view';
import { element } from './activate';

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

  constructor(parent: HTMLElement) {
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
    this.rows.setAttribute('role', 'list');
    this.footer = element('div', 'tasks-footer', '');
    this.element.append(head, this.next, this.finished, this.chapter, this.rows, this.footer);
    parent.appendChild(this.element);
  }

  /** Shows the book; only a change touches the document. */
  update(view: BookView): void {
    const key = JSON.stringify(view);
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
    this.rows.replaceChildren(
      ...view.tasks.map((task) => {
        const row = element('div', 'task-row');
        row.setAttribute('role', 'listitem');
        row.dataset.task = String(task.id);
        row.classList.toggle('done', task.done);
        row.append(
          element('span', 'task-label', task.label),
          element('span', 'task-status', task.status),
        );
        return row;
      }),
    );
    this.footer.textContent = view.footer ?? '';
    this.footer.hidden = view.footer === null;
  }

  /** Back to the top, as when a world is loaded. */
  scrollToTop(): void {
    this.element.scrollTop = 0;
  }
}
