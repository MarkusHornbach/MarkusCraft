// HUD: crosshair and the item bar, as DOM elements over the canvas.
import type { ItemStack } from '../actions/playerRecord';
import { HOTBAR_SLOTS } from '../game/config';
import { getItemDef, itemLabel } from '../items/items';
import { createItemIcon } from './itemIcon';

/** How long the selected block's name stays visible after a change. */
const LABEL_VISIBLE_MS = 1600;

export class Hud {
  readonly element: HTMLElement;
  private readonly slots: HTMLElement[] = [];
  private readonly label: HTMLElement;
  private labelTimer: number | undefined;
  private readonly waterTint: HTMLElement;
  private readonly breakBar: HTMLElement;
  private readonly breakFill: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly message: HTMLElement;
  /** What each bar slot shows now, so that only changed slots are redrawn. */
  private readonly shown: (ItemStack | null)[] = [];
  private selected = 1;

  /**
   * `keepLabel`: the block name stays until the next change instead of hiding after a
   * while. Test mode uses it, so that no test depends on real time.
   */
  constructor(
    parent: HTMLElement,
    private readonly tiles: Uint8ClampedArray[],
    private readonly keepLabel = false,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'hud';

    // Full-screen blue tint while the camera is under water; below the other HUD parts.
    this.waterTint = document.createElement('div');
    this.waterTint.className = 'water-tint';
    parent.appendChild(this.waterTint);

    const crosshair = document.createElement('div');
    crosshair.className = 'crosshair';
    this.element.appendChild(crosshair);

    // Progress of a timed break, right under the crosshair.
    this.breakBar = document.createElement('div');
    this.breakBar.className = 'break-bar';
    this.breakFill = document.createElement('div');
    this.breakFill.className = 'break-fill';
    this.breakBar.appendChild(this.breakFill);
    this.element.appendChild(this.breakBar);

    // A short hint under the crosshair ("Inventory full").
    this.message = document.createElement('div');
    this.message.className = 'hud-message';
    this.message.setAttribute('role', 'status');
    this.element.appendChild(this.message);

    // What was just picked up ("+1 Stone"), above the bar.
    this.notice = document.createElement('div');
    this.notice.className = 'pickup-notice';
    this.element.appendChild(this.notice);

    this.label = document.createElement('div');
    this.label.className = 'hotbar-label';
    this.element.appendChild(this.label);

    const bar = document.createElement('div');
    bar.className = 'hotbar';
    for (let index = 0; index < HOTBAR_SLOTS; index++) {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot';
      slot.dataset.slot = String(index + 1);
      slot.dataset.item = '';
      const key = document.createElement('span');
      key.className = 'hotbar-key';
      key.textContent = String(index + 1);
      slot.appendChild(key);
      bar.appendChild(slot);
      this.slots.push(slot);
      this.shown.push(null);
    }
    this.element.appendChild(bar);
    parent.appendChild(this.element);
  }

  /**
   * Shows the items of the bar (the first nine slots of the player's record): an icon and,
   * for more than one item, the count. An empty slot is empty.
   */
  setSlots(slots: readonly (ItemStack | null)[]): void {
    this.slots.forEach((element, index) => {
      const stack = slots[index] ?? null;
      const before = this.shown[index];
      if (before?.item === stack?.item && before?.count === stack?.count) return;
      this.shown[index] = stack ? { ...stack } : null;
      element.querySelector('canvas')?.remove();
      element.querySelector('.slot-count')?.remove();
      element.dataset.item = stack ? (getItemDef(stack.item)?.name ?? 'unknown') : '';
      element.title = stack ? itemLabel(stack.item) : '';
      if (!stack) return;
      element.insertBefore(createItemIcon(stack.item, this.tiles), element.firstChild);
      if (stack.count > 1) {
        const count = document.createElement('span');
        count.className = 'slot-count';
        count.textContent = String(stack.count);
        element.appendChild(count);
      }
    });
  }

  /** Highlights a slot (1-based). `announce` briefly shows the name of the item in it. */
  setSelected(slot: number, announce: boolean): void {
    this.selected = slot;
    this.slots.forEach((element, index) => {
      element.classList.toggle('selected', index === slot - 1);
    });
    if (!announce) return;
    const stack = this.shown[this.selected - 1];
    window.clearTimeout(this.labelTimer);
    if (!stack) {
      // An empty slot has no name to show.
      this.label.textContent = '';
      this.label.classList.remove('visible');
      return;
    }
    this.label.textContent = itemLabel(stack.item);
    this.label.classList.add('visible');
    if (this.keepLabel) return;
    this.labelTimer = window.setTimeout(
      () => this.label.classList.remove('visible'),
      LABEL_VISIBLE_MS,
    );
  }

  /** Shows how far a timed break has come (0..1), or hides the bar with null. */
  setBreakProgress(progress: number | null): void {
    this.breakBar.classList.toggle('visible', progress !== null);
    if (progress === null) return;
    const percent = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
    if (this.breakFill.style.width !== percent) this.breakFill.style.width = percent;
  }

  /** The pickup notice above the bar; null hides it. */
  setNotice(text: string | null): void {
    this.setText(this.notice, text);
  }

  /** The hint under the crosshair; null hides it. */
  setMessage(text: string | null): void {
    this.setText(this.message, text);
  }

  private setText(node: HTMLElement, text: string | null): void {
    node.classList.toggle('visible', text !== null);
    if (text !== null && node.textContent !== text) node.textContent = text;
  }

  setUnderwater(underwater: boolean): void {
    this.waterTint.classList.toggle('visible', underwater);
  }

  setVisible(visible: boolean): void {
    this.element.classList.toggle('hidden', !visible);
  }
}
