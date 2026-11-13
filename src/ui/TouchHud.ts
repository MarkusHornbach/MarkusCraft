// TouchHud: the on-screen touch controls (stick display and buttons) and the rotate hint.
import type { StickView, TouchButton } from '../input/TouchTracker';

/** Buttons in document order. Positions come from the style sheet. */
const BUTTONS: readonly { button: TouchButton; label: string }[] = [
  { button: 'menu', label: 'Menu' },
];

export class TouchHud {
  readonly element: HTMLElement;
  /** Shown instead of the game while the device is held upright. */
  readonly rotateOverlay: HTMLElement;
  private readonly stick: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly buttons = new Map<TouchButton, HTMLElement>();

  /** Inserts the controls after `after` (the HUD), so the menu stays on top of them. */
  constructor(parent: HTMLElement, after: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'touch-hud';

    this.stick = document.createElement('div');
    this.stick.className = 'touch-stick';
    this.knob = document.createElement('div');
    this.knob.className = 'touch-stick-knob';
    this.stick.appendChild(this.knob);
    this.element.appendChild(this.stick);

    for (const { button, label } of BUTTONS) {
      const node = document.createElement('div');
      node.className = `touch-button touch-${button}`;
      node.dataset.touch = button;
      node.setAttribute('role', 'button');
      node.setAttribute('aria-label', label);
      this.element.appendChild(node);
      this.buttons.set(button, node);
    }
    parent.insertBefore(this.element, after.nextSibling);

    this.rotateOverlay = document.createElement('div');
    this.rotateOverlay.className = 'rotate-overlay';
    const device = document.createElement('div');
    device.className = 'rotate-device';
    const text = document.createElement('div');
    text.textContent = 'Please rotate your device to landscape.';
    this.rotateOverlay.append(device, text);
    parent.appendChild(this.rotateOverlay);
  }

  /** Shows the stick where the thumb rests, or hides it when `stick` is null. */
  setStick(stick: StickView | null): void {
    this.stick.classList.toggle('visible', stick !== null);
    if (!stick) return;
    this.stick.style.left = `${stick.originX}px`;
    this.stick.style.top = `${stick.originY}px`;
    this.knob.style.transform = `translate(${stick.knobX}px, ${stick.knobY}px)`;
  }

  /** Marks the fly button while fly mode is on. */
  setFlying(flying: boolean): void {
    this.buttons.get('fly')?.classList.toggle('active', flying);
  }

  setVisible(visible: boolean): void {
    this.element.classList.toggle('hidden', !visible);
  }

  setRotateVisible(visible: boolean): void {
    this.rotateOverlay.classList.toggle('visible', visible);
  }

  /** Takes the controls out of the document. */
  remove(): void {
    this.element.remove();
    this.rotateOverlay.remove();
  }
}
