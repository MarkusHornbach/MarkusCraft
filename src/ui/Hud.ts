// HUD: crosshair and the block selector bar, as DOM elements over the canvas.
import { HOTBAR_BLOCKS, getBlockDef } from '../world/blocks';
import { createBlockIcon } from './blockIcon';

/** How long the selected block's name stays visible after a change. */
const LABEL_VISIBLE_MS = 1600;

export class Hud {
  readonly element: HTMLElement;
  private readonly slots: HTMLElement[] = [];
  private readonly label: HTMLElement;
  private labelTimer: number | undefined;

  constructor(parent: HTMLElement, tiles: Uint8ClampedArray[]) {
    this.element = document.createElement('div');
    this.element.className = 'hud';

    const crosshair = document.createElement('div');
    crosshair.className = 'crosshair';
    this.element.appendChild(crosshair);

    this.label = document.createElement('div');
    this.label.className = 'hotbar-label';
    this.element.appendChild(this.label);

    const bar = document.createElement('div');
    bar.className = 'hotbar';
    HOTBAR_BLOCKS.forEach((blockId, index) => {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot';
      slot.dataset.slot = String(index + 1);
      slot.dataset.block = getBlockDef(blockId).name;
      slot.title = getBlockDef(blockId).label;
      slot.appendChild(createBlockIcon(blockId, tiles));
      const key = document.createElement('span');
      key.className = 'hotbar-key';
      key.textContent = String(index + 1);
      slot.appendChild(key);
      bar.appendChild(slot);
      this.slots.push(slot);
    });
    this.element.appendChild(bar);
    parent.appendChild(this.element);
  }

  /** Highlights a slot (1-based). `announce` briefly shows the block's name. */
  setSelected(slot: number, announce: boolean): void {
    this.slots.forEach((element, index) => {
      element.classList.toggle('selected', index === slot - 1);
    });
    if (!announce) return;
    this.label.textContent = getBlockDef(HOTBAR_BLOCKS[slot - 1]).label;
    this.label.classList.add('visible');
    window.clearTimeout(this.labelTimer);
    this.labelTimer = window.setTimeout(
      () => this.label.classList.remove('visible'),
      LABEL_VISIBLE_MS,
    );
  }

  setVisible(visible: boolean): void {
    this.element.classList.toggle('hidden', !visible);
  }
}
