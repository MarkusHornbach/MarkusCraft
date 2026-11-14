// TouchHud: the on-screen touch controls (stick display and buttons) and the rotate hint.
import type { StickView, TouchButton } from '../input/TouchTracker';

/** Buttons in document order. Positions come from the style sheet. */
const BUTTONS: readonly { button: TouchButton; label: string }[] = [
  { button: 'menu', label: 'Menu' },
  { button: 'bag', label: 'Inventory' },
  { button: 'fly', label: 'Fly' },
  { button: 'up', label: 'Up' },
  { button: 'down', label: 'Down' },
  { button: 'break', label: 'Break' },
  { button: 'place', label: 'Place' },
];

/** Drawing size of a symbol in canvas pixels; the style sheet scales it to the button. */
const SYMBOL_PIXELS = 96;

/** Draws a button's symbol with plain shapes into a unit square. */
function drawSymbol(ctx: CanvasRenderingContext2D, button: TouchButton): void {
  ctx.lineWidth = 0.09;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  switch (button) {
    case 'menu':
      // Three bars.
      for (const y of [0.27, 0.5, 0.73]) {
        ctx.moveTo(0.2, y);
        ctx.lineTo(0.8, y);
      }
      ctx.stroke();
      break;
    case 'up':
    case 'down': {
      // A triangle pointing up or down.
      const tip = button === 'up' ? 0.2 : 0.8;
      const base = button === 'up' ? 0.74 : 0.26;
      ctx.moveTo(0.5, tip);
      ctx.lineTo(0.86, base);
      ctx.lineTo(0.14, base);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'bag':
      // A bag: a body with a flap and a handle on top.
      ctx.moveTo(0.36, 0.3);
      ctx.quadraticCurveTo(0.5, 0.04, 0.64, 0.3);
      ctx.stroke();
      ctx.strokeRect(0.2, 0.3, 0.6, 0.52);
      ctx.beginPath();
      ctx.moveTo(0.2, 0.5);
      ctx.lineTo(0.8, 0.5);
      ctx.moveTo(0.5, 0.5);
      ctx.lineTo(0.5, 0.62);
      ctx.stroke();
      break;
    case 'fly':
      // A pair of wings seen from the front.
      ctx.moveTo(0.06, 0.62);
      ctx.quadraticCurveTo(0.27, 0.16, 0.5, 0.6);
      ctx.quadraticCurveTo(0.73, 0.16, 0.94, 0.62);
      ctx.stroke();
      break;
    case 'break':
      // A pick: a handle and a curved head.
      ctx.moveTo(0.2, 0.84);
      ctx.lineTo(0.64, 0.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.lineWidth = 0.12;
      ctx.moveTo(0.3, 0.2);
      ctx.quadraticCurveTo(0.74, 0.22, 0.82, 0.7);
      ctx.stroke();
      break;
    case 'place':
      // A block outline with a plus.
      ctx.strokeRect(0.17, 0.17, 0.66, 0.66);
      ctx.beginPath();
      ctx.moveTo(0.5, 0.34);
      ctx.lineTo(0.5, 0.66);
      ctx.moveTo(0.34, 0.5);
      ctx.lineTo(0.66, 0.5);
      ctx.stroke();
      break;
  }
}

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
      const symbol = document.createElement('canvas');
      symbol.className = 'touch-symbol';
      symbol.width = SYMBOL_PIXELS;
      symbol.height = SYMBOL_PIXELS;
      const ctx = symbol.getContext('2d');
      if (ctx) {
        ctx.scale(SYMBOL_PIXELS, SYMBOL_PIXELS);
        drawSymbol(ctx, button);
      }
      node.appendChild(symbol);
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

  /** The fly button exists only where flying does (not in Gathering worlds). */
  setFlyAvailable(available: boolean): void {
    const fly = this.buttons.get('fly');
    if (!fly) return;
    this.element.classList.toggle('no-fly', !available);
    if (!available) fly.remove();
    else if (!fly.isConnected) this.element.insertBefore(fly, this.buttons.get('up') ?? null);
  }

  /** Marks the fly button while fly mode is on. */
  setFlying(flying: boolean): void {
    this.buttons.get('fly')?.classList.toggle('active', flying);
  }

  setVisible(visible: boolean): void {
    this.element.classList.toggle('hidden', !visible);
  }

  /**
   * The inventory lies over the controls: they are not drawn and take no touches, but
   * stay in the layout, so a finger that rests on a button keeps reporting until it lifts.
   */
  setCovered(covered: boolean): void {
    this.element.classList.toggle('covered', covered);
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
