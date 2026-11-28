// Chest screen (Phase 8 part B3a2): the chest's 27 slots, the player's 27 inventory slots
// (Adventure) and the bar. It only reports what was activated; the game turns that into
// chest actions.
import type { GameMode, ItemStack } from '../actions/playerRecord';
import { CHEST_SLOTS, HOTBAR_SLOTS, INVENTORY_SLOTS, QUICK_MOVE_MS } from '../game/config';
import { getItemDef, itemLabel } from '../items/items';
import { type InputMode, button, element, onActivate } from './activate';
import { createItemIcon } from './itemIcon';

/** A slot of the screen: one of the chest's, or one of the player's (both 0-based). */
export interface ChestSlotRef {
  chest: boolean;
  slot: number;
}

export interface ChestScreenOptions {
  /** The painted tile images, for the block icons. */
  tiles: Uint8ClampedArray[];
  /** The picked slot onto another one; `item` is what the screen showed in `from`. */
  onMove: (from: ChestSlotRef, to: ChestSlotRef, item: number) => void;
  /** A stack to the other side (a double activation, or the controller's X). */
  onQuickMove: (from: ChestSlotRef, item: number) => void;
  onTakeAll: () => void;
  onClose: (via: InputMode | null) => void;
  /** The clock a double activation is measured on (simulation time, ms). */
  nowMs: () => number;
}

const HINT =
  'Choose a slot, then another slot to move its items there. Choose a slot twice quickly to move its items to the other side.';

type Shown = ItemStack | null;

function sameStack(a: Shown | undefined, b: Shown | undefined): boolean {
  return (a?.item ?? 0) === (b?.item ?? 0) && (a?.count ?? 0) === (b?.count ?? 0);
}

export class ChestScreen {
  readonly element: HTMLElement;
  private readonly options: ChestScreenOptions;
  private readonly viewers: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly chestNodes: HTMLButtonElement[] = [];
  private readonly playerNodes: HTMLButtonElement[] = [];
  private readonly chestShown: Shown[] = new Array<Shown>(CHEST_SLOTS).fill(null);
  private readonly playerShown: Shown[] = new Array<Shown>(INVENTORY_SLOTS).fill(null);
  private picked: ChestSlotRef | null = null;
  /** The last activation that picked a slot, for the double activation (quick move). */
  private lastPick: { ref: ChestSlotRef; atMs: number } | null = null;
  private gameMode: GameMode = 'gathering';
  private viewerList: string[] = [];
  private visible = false;
  /** Whether a click may act: false from opening until the next press on the screen. */
  private armed = true;

  constructor(parent: HTMLElement, options: ChestScreenOptions) {
    this.options = options;
    this.element = element('div', 'chest-screen hidden');
    // As on the inventory: the press that opened the screen must not click what lies under
    // the finger now. A click counts only after a press that began on the open screen.
    for (const type of ['pointerdown', 'keydown', 'padpress']) {
      this.element.addEventListener(
        type,
        () => {
          this.armed = true;
        },
        true,
      );
    }
    this.element.addEventListener(
      'click',
      (e) => {
        if (this.armed) return;
        e.stopPropagation();
        e.preventDefault();
      },
      true,
    );
    const panel = element('div', 'chest-panel');
    this.element.appendChild(panel);

    const header = element('div', 'chest-header');
    const title = element('h2', 'chest-title', 'Chest');
    this.viewers = element('span', 'chest-viewers', '');
    this.viewers.hidden = true;
    const takeAll = button('menu-button chest-take-all', 'Take all');
    onActivate(takeAll, () => options.onTakeAll());
    const close = button('menu-button chest-close', 'Close');
    // The controller's B clicks it when no slot is picked.
    close.dataset.padBack = '';
    onActivate(close, (via) => options.onClose(via));
    const buttons = element('div', 'chest-buttons');
    buttons.append(takeAll, close);
    header.append(title, this.viewers, buttons);
    panel.appendChild(header);

    const chestGrid = element('div', 'chest-grid chest-contents');
    for (let index = 0; index < CHEST_SLOTS; index++) {
      const node = this.slotNode({ chest: true, slot: index });
      // The controller's focus starts on the chest's first slot.
      if (index === 0) node.dataset.padDefault = '';
      this.chestNodes.push(node);
      chestGrid.appendChild(node);
    }
    panel.appendChild(chestGrid);

    for (let index = 0; index < INVENTORY_SLOTS; index++) {
      this.playerNodes.push(this.slotNode({ chest: false, slot: index }));
    }
    this.grid = element('div', 'chest-grid chest-inventory');
    this.grid.append(...this.playerNodes.slice(HOTBAR_SLOTS));
    panel.appendChild(this.grid);
    const bar = element('div', 'chest-grid chest-bar');
    bar.append(...this.playerNodes.slice(0, HOTBAR_SLOTS));
    panel.appendChild(bar);

    panel.appendChild(element('div', 'chest-hint', HINT));
    parent.appendChild(this.element);
    this.setGameMode(this.gameMode);
  }

  private slotNode(ref: ChestSlotRef): HTMLButtonElement {
    const node = button('chest-slot', '');
    node.dataset.side = ref.chest ? 'chest' : 'player';
    node.dataset.index = String(ref.slot);
    node.dataset.item = '';
    node.setAttribute('aria-label', this.labelOf(ref, null));
    node.addEventListener('click', () => this.activate(ref));
    return node;
  }

  private labelOf(ref: ChestSlotRef, stack: Shown): string {
    const name = `${ref.chest ? 'Chest slot' : 'Slot'} ${ref.slot + 1}`;
    return stack ? `${name}: ${itemLabel(stack.item)}` : name;
  }

  private shownAt(ref: ChestSlotRef): Shown {
    return (ref.chest ? this.chestShown : this.playerShown)[ref.slot] ?? null;
  }

  private nodeAt(ref: ChestSlotRef): HTMLButtonElement | undefined {
    return (ref.chest ? this.chestNodes : this.playerNodes)[ref.slot];
  }

  /** A slot was clicked, tapped or chosen with A: pick, put, or quick move. */
  private activate(ref: ChestSlotRef): void {
    const now = this.options.nowMs();
    const picked = this.picked;
    if (picked === null) {
      // Only a slot with something in it can be picked up.
      const stack = this.shownAt(ref);
      if (!stack) return;
      this.setPicked(ref);
      this.lastPick = { ref, atMs: now };
      return;
    }
    if (picked.chest === ref.chest && picked.slot === ref.slot) {
      const last = this.lastPick;
      const quick =
        last !== null &&
        last.ref.chest === ref.chest &&
        last.ref.slot === ref.slot &&
        now - last.atMs <= QUICK_MOVE_MS;
      const stack = this.shownAt(ref);
      this.setPicked(null);
      this.lastPick = null;
      if (quick && stack) this.options.onQuickMove(ref, stack.item);
      return;
    }
    const stack = this.shownAt(picked);
    this.setPicked(null);
    this.lastPick = null;
    if (stack) this.options.onMove(picked, ref, stack.item);
  }

  /** The controller's X on a focused slot: its stack to the other side. */
  quickMoveAt(target: Element | null): boolean {
    if (!(target instanceof HTMLElement) || !target.classList.contains('chest-slot')) return false;
    const ref = { chest: target.dataset.side === 'chest', slot: Number(target.dataset.index) };
    const stack = this.shownAt(ref);
    this.setPicked(null);
    this.lastPick = null;
    if (stack) this.options.onQuickMove(ref, stack.item);
    return true;
  }

  /** Adventure shows the 27 inventory slots and the bar, Creative the bar only. */
  setGameMode(mode: GameMode): void {
    this.gameMode = mode;
    this.element.dataset.mode = mode;
    this.grid.hidden = mode !== 'gathering';
  }

  /** The chest's slots as the session reports them; a picked chest slot that changed goes down. */
  setChest(slots: readonly Shown[]): void {
    for (let index = 0; index < CHEST_SLOTS; index++) {
      const stack = slots[index] ?? null;
      const ref = { chest: true, slot: index };
      if (sameStack(this.chestShown[index], stack)) continue;
      if (this.picked?.chest && this.picked.slot === index) this.setPicked(null);
      this.chestShown[index] = stack ? { ...stack } : null;
      this.paint(ref, stack);
    }
  }

  /** The player's confirmed slots; `selected` is the selected bar slot (0-based). */
  setSlots(slots: readonly Shown[], selected: number): void {
    for (let index = 0; index < INVENTORY_SLOTS; index++) {
      const node = this.playerNodes[index];
      node.classList.toggle('selected', index === selected);
      const stack = slots[index] ?? null;
      if (sameStack(this.playerShown[index], stack)) continue;
      if (this.picked && !this.picked.chest && this.picked.slot === index) this.setPicked(null);
      this.playerShown[index] = stack ? { ...stack } : null;
      this.paint({ chest: false, slot: index }, stack);
    }
  }

  private paint(ref: ChestSlotRef, stack: Shown): void {
    const node = this.nodeAt(ref);
    if (!node) return;
    node.replaceChildren();
    node.dataset.item = stack ? (getItemDef(stack.item)?.name ?? 'unknown') : '';
    node.title = stack ? itemLabel(stack.item) : '';
    node.setAttribute('aria-label', this.labelOf(ref, stack));
    if (!stack) return;
    node.appendChild(createItemIcon(stack.item, this.options.tiles));
    if (stack.count > 1) node.appendChild(element('span', 'slot-count', String(stack.count)));
  }

  /** The names of the "Also open" line (test API). */
  get viewerNames(): string[] {
    return [...this.viewerList];
  }

  /** "Also open: Anna, Ben" in a room; nothing when nobody else has the chest open. */
  setViewers(names: readonly string[]): void {
    this.viewerList = [...names];
    const text = names.length > 0 ? `Also open: ${names.join(', ')}` : '';
    if (this.viewers.textContent !== text) this.viewers.textContent = text;
    this.viewers.hidden = names.length === 0;
  }

  /** The controller's B: puts a picked slot down. Returns whether one was picked. */
  cancelPick(): boolean {
    if (this.picked === null) return false;
    this.setPicked(null);
    this.lastPick = null;
    return true;
  }

  private setPicked(ref: ChestSlotRef | null): void {
    if (this.picked) this.nodeAt(this.picked)?.classList.remove('picked');
    this.picked = ref;
    if (ref) this.nodeAt(ref)?.classList.add('picked');
  }

  get isVisible(): boolean {
    return this.visible;
  }

  setVisible(visible: boolean): void {
    if (visible && !this.visible) this.armed = false;
    this.visible = visible;
    this.element.classList.toggle('hidden', !visible);
    this.setPicked(null);
    this.lastPick = null;
    if (!visible) this.setViewers([]);
  }
}
