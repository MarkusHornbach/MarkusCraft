// Screens of the performance test: the start page, the progress line of a run, the
// result with its GitHub issue link, and "Interrupted".
import {
  type BenchResult,
  TABLE_HEADER,
  envLines,
  issueText,
  issueUrl,
  readyText,
  tableRow,
} from '../bench/benchReport';
import { THROTTLED_TEXT, scenarioLight, workersText } from '../bench/verdict';
import { type InputMode, button, element, onActivate } from './activate';

export interface BenchScreenOptions {
  /** "Start", "Start again" or "Run again": begins a run inside the click or tap. */
  onStart: (via: InputMode | null) => void;
  /** Back to the world menu. */
  onBack: () => void;
  /** "Cancel" during a run. */
  onCancel: () => void;
  onShowLast: () => void;
}

export const BENCH_HINTS: readonly string[] = [
  'Takes about 4 minutes',
  'Plug in the charger',
  'Close other apps and tabs',
  'Switch battery saver off',
  'Do not touch the screen during the test',
  'The result can be sent as a public GitHub issue',
];

type View = 'start' | 'running' | 'result' | 'interrupted';

export class BenchScreen {
  readonly element: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly views: Record<View, HTMLElement>;
  private readonly lastButton: HTMLButtonElement;
  private readonly startTitle: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly reason: HTMLElement;
  private readonly workers: HTMLElement;
  private readonly notes: HTMLElement;
  private readonly tableWrap: HTMLElement;
  private readonly tableBody: HTMLElement;
  private readonly text: HTMLTextAreaElement;
  private readonly issueLink: HTMLAnchorElement;
  private readonly textButton: HTMLButtonElement;
  private readonly status: HTMLElement;
  /** The text of the result on screen: what "Copy result" copies. */
  private resultText = '';

  constructor(parent: HTMLElement, options: BenchScreenOptions) {
    this.element = element('div', 'bench-screen hidden');
    this.panel = element('div', 'bench-panel');
    this.element.appendChild(this.panel);

    // --- start page ---
    const start = element('div', 'bench-view bench-start');
    this.startTitle = element('h1', 'pause-title bench-title', 'Performance test');
    start.appendChild(this.startTitle);
    const hints = element('ul', 'bench-hints');
    for (const hint of BENCH_HINTS) hints.appendChild(element('li', 'bench-hint', hint));
    start.appendChild(hints);
    const startRow = element('div', 'world-buttons');
    const startButton = button('play-button bench-start-button', 'Start');
    onActivate(startButton, (via) => options.onStart(via));
    this.lastButton = button('menu-button bench-last-button', 'Show last result');
    this.lastButton.addEventListener('click', () => options.onShowLast());
    startRow.append(startButton, this.lastButton, this.backButton(options, 'bench-back-button'));
    start.appendChild(startRow);

    // --- during a run: one line at the top, the game stays visible ---
    const running = element('div', 'bench-view bench-running');
    this.progress = element('div', 'bench-progress');
    this.progress.setAttribute('role', 'status');
    const cancel = button('menu-button bench-cancel-button', 'Cancel');
    cancel.addEventListener('click', () => options.onCancel());
    running.append(this.progress, cancel);

    // --- result ---
    const result = element('div', 'bench-view bench-result');
    result.appendChild(element('h1', 'pause-heading bench-result-title', 'Performance test'));
    this.workers = element('div', 'bench-workers');
    this.notes = element('div', 'bench-notes');
    result.append(this.workers, this.notes);
    this.tableWrap = element('div', 'bench-table-wrap');
    const table = element('table', 'bench-table');
    const head = element('tr', 'bench-head');
    for (const title of TABLE_HEADER) head.appendChild(element('th', '', title));
    const thead = document.createElement('thead');
    thead.appendChild(head);
    this.tableBody = document.createElement('tbody');
    table.append(thead, this.tableBody);
    this.tableWrap.appendChild(table);
    this.text = element('textarea', 'bench-text');
    this.text.readOnly = true;
    this.text.hidden = true;
    this.text.setAttribute('aria-label', 'Result text');
    result.append(this.tableWrap, this.text);
    this.status = element('div', 'bench-status');
    this.status.setAttribute('role', 'status');
    result.appendChild(this.status);
    const resultRow = element('div', 'world-buttons bench-result-buttons');
    // A real link: the browser opens the pre-filled issue in a new tab by the click itself.
    this.issueLink = element('a', 'play-button bench-issue-link', 'Open GitHub issue');
    this.issueLink.target = '_blank';
    this.issueLink.rel = 'noopener';
    const copy = button('menu-button bench-copy-button', 'Copy result');
    copy.addEventListener('click', () => this.copy());
    this.textButton = button('menu-button bench-text-button', 'Show text');
    this.textButton.addEventListener('click', () => this.showText(this.text.hidden !== false));
    const again = button('menu-button bench-again-button', 'Run again');
    onActivate(again, (via) => options.onStart(via));
    resultRow.append(
      this.issueLink,
      copy,
      this.textButton,
      again,
      this.backButton(options, 'bench-result-back'),
    );
    result.appendChild(resultRow);

    // --- interrupted ---
    const interrupted = element('div', 'bench-view bench-interrupted');
    interrupted.appendChild(
      element('h1', 'pause-heading bench-interrupted-title', 'Interrupted – nothing was recorded'),
    );
    this.reason = element('div', 'bench-reason');
    interrupted.appendChild(this.reason);
    const interruptedRow = element('div', 'world-buttons');
    const retry = button('play-button bench-retry-button', 'Start again');
    onActivate(retry, (via) => options.onStart(via));
    interruptedRow.append(retry, this.backButton(options, 'bench-interrupted-back'));
    interrupted.appendChild(interruptedRow);

    this.views = { start, running, result, interrupted };
    this.panel.append(start, running, result, interrupted);
    parent.appendChild(this.element);
  }

  private backButton(options: BenchScreenOptions, name: string): HTMLButtonElement {
    const back = button(`menu-button ${name}`, 'Back');
    back.addEventListener('click', () => options.onBack());
    return back;
  }

  private show(view: View): void {
    for (const [name, node] of Object.entries(this.views)) node.hidden = name !== view;
    this.element.dataset.view = view;
    this.element.classList.remove('hidden');
  }

  hide(): void {
    this.element.classList.add('hidden');
    delete this.element.dataset.view;
  }

  /** The start page; `hasLast` offers the stored result of an earlier run. */
  showStart(hasLast: boolean, quick: boolean): void {
    this.startTitle.textContent = quick ? 'Performance test (quick)' : 'Performance test';
    this.lastButton.hidden = !hasLast;
    this.show('start');
  }

  /** The line during a run, e.g. "Performance test – scenario 3 of 9: flying". */
  showRunning(text: string): void {
    // The line changes only between scenarios: a run must not measure its own display.
    if (this.progress.textContent !== text) this.progress.textContent = text;
    if (this.element.dataset.view !== 'running') this.show('running');
  }

  showInterrupted(reason: string): void {
    this.reason.textContent = reason;
    this.show('interrupted');
  }

  showResult(result: BenchResult): void {
    this.resultText = issueText(result);
    this.workers.textContent = workersText(result.workers);
    this.workers.dataset.verdict = result.workers;
    const notes = [readyText(result), ...envLines(result).slice(0, 1)];
    if (result.throttled) notes.unshift(THROTTLED_TEXT);
    this.notes.replaceChildren(...notes.map((note) => element('div', 'bench-note', note)));
    this.tableBody.replaceChildren();
    for (const scenario of result.scenarios) {
      const row = element('tr', 'bench-row');
      row.dataset.scenario = scenario.id;
      tableRow(scenario).forEach((cell, column) => {
        const td = element('td', '');
        if (column === 2) {
          // The light: a coloured spot with its letter, so it reads without colour.
          const light = element('span', `bench-light bench-light-${scenarioLight(scenario)}`);
          light.textContent = cell;
          td.appendChild(light);
        } else {
          td.textContent = cell;
        }
        row.appendChild(td);
      });
      this.tableBody.appendChild(row);
    }
    this.text.value = this.resultText;
    this.issueLink.href = issueUrl(result);
    this.status.textContent = '';
    this.showText(false);
    this.show('result');
  }

  /** Swaps the table for the exact text of the issue, or back. */
  private showText(visible: boolean): void {
    this.text.hidden = !visible;
    this.tableWrap.hidden = visible;
    this.textButton.textContent = visible ? 'Show table' : 'Show text';
  }

  private copy(): void {
    const refused = (): void => {
      // No clipboard here: the text can still be selected by hand.
      this.status.textContent = 'Copying is not allowed here. Select the text below.';
      this.showText(true);
      this.text.focus();
      this.text.select();
    };
    try {
      navigator.clipboard.writeText(this.resultText).then(() => {
        this.status.textContent = 'Copied';
      }, refused);
    } catch {
      refused();
    }
  }
}
