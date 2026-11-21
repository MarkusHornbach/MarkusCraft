// "Your player" on the settings page (Phase 6 part D): the name, a preview of the own
// figure and the look picker (Automatic and the eight looks in a 3 × 3 grid).
import { LOOKS, LOOK_AUTOMATIC, lookById } from '../player/looks';
import { FigurePreview } from '../render/FigurePreview';
import { button, element } from './activate';
import { headIconCanvas } from './figureIcons';

/** Size of the preview in CSS pixels. */
const PREVIEW_W = 140;
const PREVIEW_H = 180;

export interface PlayerSectionOptions {
  name: string;
  /** The stored choice (0 Automatic, 1–8) and the look Automatic stands for. */
  choice: number;
  automatic: number;
  /** False: the preview gets no WebGL and shows the head icon (tests). */
  previewGl: boolean;
  /** Every change of the name field. */
  onName: (name: string) => void;
  /** The name field was left or Enter pressed. */
  onNameCommit: () => void;
  onLook: (choice: number) => void;
}

export class PlayerSection {
  readonly element: HTMLElement;
  private readonly options: PlayerSectionOptions;
  private readonly nameInput: HTMLInputElement;
  private readonly previewBox: HTMLElement;
  private readonly lookName: HTMLElement;
  private readonly buttons: HTMLButtonElement[] = [];
  private choice: number;
  private automatic: number;
  private preview: FigurePreview | null = null;
  /** The page shows the section (pause menu or settings page). */
  private shown = false;
  /** The section is scrolled into view. */
  private inView = false;
  private readonly observer: IntersectionObserver | null;

  constructor(options: PlayerSectionOptions) {
    this.options = options;
    this.choice = options.choice;
    this.automatic = options.automatic;
    this.element = element('section', 'pause-section player-section');
    this.element.appendChild(element('h2', 'pause-heading', 'Your player'));

    const nameRow = element('label', 'world-field player-name-field');
    nameRow.htmlFor = 'player-section-name';
    nameRow.appendChild(element('span', 'world-field-label', 'Name'));
    this.nameInput = element('input', 'world-input');
    this.nameInput.type = 'text';
    this.nameInput.id = 'player-section-name';
    this.nameInput.maxLength = 32;
    this.nameInput.autocomplete = 'off';
    this.nameInput.spellcheck = false;
    this.nameInput.placeholder = 'Your name';
    this.nameInput.value = options.name;
    this.nameInput.addEventListener('input', () => options.onName(this.nameInput.value));
    this.nameInput.addEventListener('change', () => options.onNameCommit());
    nameRow.appendChild(this.nameInput);
    this.element.appendChild(nameRow);

    const body = element('div', 'player-body');
    const previewColumn = element('div', 'player-preview-column');
    this.previewBox = element('div', 'player-preview');
    this.previewBox.style.width = `${PREVIEW_W}px`;
    this.previewBox.style.height = `${PREVIEW_H}px`;
    this.lookName = element('div', 'player-look-name', '');
    previewColumn.append(this.previewBox, this.lookName);
    body.appendChild(previewColumn);

    const grid = element('div', 'look-grid');
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', 'Look');
    for (const choice of [LOOK_AUTOMATIC, ...LOOKS.map((l) => l.id)]) {
      const b = button('look-button', '');
      b.dataset.look = String(choice);
      b.addEventListener('click', () => this.choose(choice));
      grid.appendChild(b);
      this.buttons.push(b);
    }
    body.appendChild(grid);
    this.element.appendChild(body);
    this.render();

    this.observer =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver((entries) => {
            this.inView = entries.some((e) => e.isIntersecting);
            this.updatePreview();
          })
        : null;
    this.observer?.observe(this.element);
  }

  /** The look the preview shows. */
  private get look(): number {
    return this.choice === LOOK_AUTOMATIC ? this.automatic : this.choice;
  }

  /** The name changed elsewhere ("Join a world"). */
  setName(name: string): void {
    if (this.nameInput.value !== name) this.nameInput.value = name;
  }

  /** The page with the section opened or closed: the preview lives only while it shows. */
  setShown(shown: boolean): void {
    if (shown === this.shown) return;
    this.shown = shown;
    if (!shown) {
      this.preview?.dispose();
      this.preview = null;
      this.render();
    }
    this.updatePreview();
  }

  /** Pictures the preview drew; null while it does not exist. */
  get previewState(): { frames: number } | null {
    return this.preview ? { frames: this.preview.frames } : null;
  }

  private choose(choice: number): void {
    if (choice === this.choice) return;
    this.choice = choice;
    this.options.onLook(choice);
    this.preview?.setLook(this.look);
    this.render();
  }

  /** Creates the preview once the section is shown and in view; runs it while in view. */
  private updatePreview(): void {
    if (this.shown && this.inView && !this.preview && this.options.previewGl) {
      this.preview = FigurePreview.create(PREVIEW_W, PREVIEW_H, this.look);
      if (this.preview) {
        this.preview.canvas.className = 'player-preview-canvas';
        this.previewBox.replaceChildren(this.preview.canvas);
      }
    }
    this.preview?.setRunning(this.shown && this.inView);
  }

  private render(): void {
    const look = lookById(this.look);
    this.lookName.textContent = look.name;
    if (!this.preview) {
      // Without WebGL (or before it starts) the preview is the head icon.
      const icon = headIconCanvas(look.id, 12);
      icon.classList.add('player-preview-icon');
      this.previewBox.replaceChildren(icon);
    }
    for (const b of this.buttons) {
      const choice = Number(b.dataset.look);
      const shows = choice === LOOK_AUTOMATIC ? this.automatic : choice;
      const name = choice === LOOK_AUTOMATIC ? 'Automatic' : lookById(choice).name;
      const label =
        choice === LOOK_AUTOMATIC ? `Look: Automatic (${lookById(shows).name})` : `Look: ${name}`;
      b.setAttribute('aria-label', label);
      b.setAttribute('aria-pressed', String(choice === this.choice));
      b.classList.toggle('chosen', choice === this.choice);
      b.replaceChildren(headIconCanvas(shows, 4), element('span', 'look-button-name', name));
    }
  }
}
