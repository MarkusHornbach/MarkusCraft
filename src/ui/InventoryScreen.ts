// Inventory screen: the 27 slots (Gathering) or the block palette (Creative), the bar
// and a bin; in Gathering a second tab with the recipe list. It only reports what was
// activated; the game turns that into actions.
import type { GameMode, ItemStack } from '../actions/playerRecord';
import { HOTBAR_SLOTS, INVENTORY_SLOTS } from '../game/config';
import { BLOCK_ITEMS, getItemDef, itemLabel } from '../items/items';
import type { RecipeStatus } from '../items/recipes';
import { type InputMode, button, element, onActivate } from './activate';
import { createItemIcon } from './itemIcon';
import { RecipeList } from './RecipeList';

/** The pages of the screen in a Gathering world. Creative has the first one only. */
export type InventoryTab = 'items' | 'crafting';
const TABS: readonly { tab: InventoryTab; label: string }[] = [
  { tab: 'items', label: 'Items' },
  { tab: 'crafting', label: 'Crafting' },
];

export interface InventoryScreenOptions {
  /** The painted tile images, for the block icons. */
  tiles: Uint8ClampedArray[];
  /** Move, merge or swap: the picked slot onto another slot (both 0-based). */
  onMove: (from: number, to: number) => void;
  /** The picked slot was dropped on the bin. */
  onDiscard: (slot: number) => void;
  /** Creative: a block of the palette for a bar slot; null means the selected slot. */
  onPalette: (item: number, barSlot: number | null) => void;
  onClose: (via: InputMode | null) => void;
  /** The recipe list: a "Craft" button went down, came up, or was activated. */
  onCraftDown: (recipe: number) => void;
  onCraftUp: () => void;
  onCraftClick: (recipe: number) => void;
  /** Another tab was chosen. */
  onTab: (tab: InventoryTab) => void;
}

const HINTS: Record<GameMode, string> = {
  gathering: 'Choose a slot, then another slot to move its items there. The bin throws them away.',
  creative: 'Choose a block to put it into the selected slot of the bar.',
};
const TITLES: Record<GameMode, string> = { gathering: 'Inventory', creative: 'Blocks' };

/** Draws a bin with plain shapes: a lid with a handle and a ribbed body. */
function binSymbol(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.className = 'inv-bin-symbol';
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(12, 18);
  ctx.lineTo(52, 18);
  ctx.moveTo(26, 18);
  ctx.lineTo(26, 10);
  ctx.lineTo(38, 10);
  ctx.lineTo(38, 18);
  ctx.moveTo(17, 18);
  ctx.lineTo(20, 54);
  ctx.lineTo(44, 54);
  ctx.lineTo(47, 18);
  ctx.moveTo(27, 27);
  ctx.lineTo(28, 45);
  ctx.moveTo(37, 27);
  ctx.lineTo(36, 45);
  ctx.stroke();
  return canvas;
}

export class InventoryScreen {
  readonly element: HTMLElement;
  private readonly title: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly palette: HTMLElement;
  private readonly bin: HTMLButtonElement;
  /** The buttons of the 36 slots by slot index. */
  private readonly slots: HTMLButtonElement[] = [];
  private readonly shown: (ItemStack | null)[] = [];
  private readonly tiles: Uint8ClampedArray[];
  private readonly tabBar: HTMLElement;
  private readonly tabButtons = new Map<InventoryTab, HTMLButtonElement>();
  /** Everything of the items page: slots or palette, bar, bin and hint. */
  private readonly itemsPage: HTMLElement;
  private readonly recipes: RecipeList;
  private tab: InventoryTab = 'items';
  private gameMode: GameMode = 'creative';
  /** The slot chosen first; the next activation says where its items go. */
  private picked: number | null = null;
  private visible = false;

  constructor(parent: HTMLElement, options: InventoryScreenOptions) {
    this.tiles = options.tiles;
    this.element = element('div', 'inventory-screen hidden');
    const panel = element('div', 'inventory-panel');
    this.element.appendChild(panel);

    const header = element('div', 'inventory-header');
    this.title = element('h2', 'inventory-title', '');
    this.tabBar = element('div', 'inventory-tabs');
    this.tabBar.setAttribute('role', 'tablist');
    for (const { tab, label } of TABS) {
      const choice = button('menu-button inventory-tab', label);
      choice.dataset.tab = tab;
      choice.setAttribute('role', 'tab');
      choice.addEventListener('click', () => {
        if (this.tab === tab) return;
        this.setTab(tab);
        options.onTab(tab);
      });
      this.tabButtons.set(tab, choice);
      this.tabBar.appendChild(choice);
    }
    const close = button('menu-button inventory-close', 'Close');
    onActivate(close, (via) => options.onClose(via));
    header.append(this.title, this.tabBar, close);
    panel.appendChild(header);
    this.itemsPage = element('div', 'inventory-items');

    for (let index = 0; index < INVENTORY_SLOTS; index++) {
      const slot = button('inv-slot', '');
      slot.dataset.index = String(index);
      slot.dataset.item = '';
      slot.addEventListener('click', () => {
        if (this.picked === null) {
          // Only a slot with something in it can be picked up.
          if (this.shown[index]) this.setPicked(index);
        } else if (this.picked === index) {
          this.setPicked(null);
        } else {
          const from = this.picked;
          this.setPicked(null);
          options.onMove(from, index);
        }
      });
      this.slots.push(slot);
      this.shown.push(null);
    }

    // The 27 slots behind the bar, three rows of nine.
    this.grid = element('div', 'inventory-grid');
    this.grid.append(...this.slots.slice(HOTBAR_SLOTS));
    this.itemsPage.appendChild(this.grid);

    // Creative: every block that can be placed, once.
    this.palette = element('div', 'inventory-palette');
    for (const item of BLOCK_ITEMS) {
      const choice = button('inv-slot palette-slot', '');
      choice.dataset.item = getItemDef(item)?.name ?? '';
      choice.title = itemLabel(item);
      choice.setAttribute('aria-label', itemLabel(item));
      choice.appendChild(createItemIcon(item, this.tiles));
      choice.addEventListener('click', () => {
        const target = this.picked !== null && this.picked < HOTBAR_SLOTS ? this.picked : null;
        this.setPicked(null);
        options.onPalette(item, target);
      });
      this.palette.appendChild(choice);
    }
    this.itemsPage.appendChild(this.palette);

    const barRow = element('div', 'inventory-bar-row');
    const bar = element('div', 'inventory-bar');
    bar.append(...this.slots.slice(0, HOTBAR_SLOTS));
    this.bin = button('inv-slot inv-bin', '');
    this.bin.setAttribute('aria-label', 'Bin');
    this.bin.title = 'Bin';
    this.bin.appendChild(binSymbol());
    this.bin.addEventListener('click', () => {
      if (this.picked === null) return;
      const slot = this.picked;
      this.setPicked(null);
      options.onDiscard(slot);
    });
    barRow.append(bar, this.bin);
    this.itemsPage.appendChild(barRow);

    this.hint = element('div', 'inventory-hint', '');
    this.itemsPage.appendChild(this.hint);
    panel.appendChild(this.itemsPage);

    this.recipes = new RecipeList(panel, {
      tiles: this.tiles,
      onCraftDown: options.onCraftDown,
      onCraftUp: options.onCraftUp,
      onCraftClick: options.onCraftClick,
    });
    parent.appendChild(this.element);
    this.setGameMode(this.gameMode);
  }

  /** Gathering shows the 27 slots, Creative the palette of all blocks. */
  setGameMode(mode: GameMode): void {
    this.gameMode = mode;
    this.element.dataset.mode = mode;
    this.title.textContent = TITLES[mode];
    this.hint.textContent = HINTS[mode];
    this.grid.hidden = mode !== 'gathering';
    this.palette.hidden = mode !== 'creative';
    // Creative has every block already: no recipes, and so no tabs.
    this.tabBar.hidden = mode !== 'gathering';
    this.setTab('items');
  }

  /** Shows the items page or the recipe list. Creative always shows its blocks. */
  setTab(tab: InventoryTab): void {
    this.tab = this.gameMode === 'gathering' ? tab : 'items';
    this.element.dataset.tab = this.tab;
    for (const [name, choice] of this.tabButtons) {
      choice.classList.toggle('active', name === this.tab);
      choice.setAttribute('aria-selected', String(name === this.tab));
    }
    this.itemsPage.hidden = this.tab !== 'items';
    this.recipes.element.hidden = this.tab !== 'crafting';
    if (this.tab === 'crafting') this.recipes.scrollToTop();
    this.setPicked(null);
  }

  get currentTab(): InventoryTab {
    return this.tab;
  }

  /** The recipes in the order of the list, with what the player has for each. */
  setRecipes(statuses: readonly RecipeStatus[]): void {
    this.recipes.update(statuses);
  }

  /** The furnace's progress bar in the row of a recipe; null hides it. */
  setSmelting(recipe: number | null, progress: number): void {
    this.recipes.setSmelting(recipe, progress);
  }

  /** Shows the player's confirmed slots; `selected` is the selected bar slot (0-based). */
  setSlots(slots: readonly (ItemStack | null)[], selected: number): void {
    this.slots.forEach((node, index) => {
      node.classList.toggle('selected', index === selected);
      const stack = slots[index] ?? null;
      const before = this.shown[index];
      if (before?.item === stack?.item && before?.count === stack?.count) return;
      this.shown[index] = stack ? { ...stack } : null;
      node.replaceChildren();
      node.dataset.item = stack ? (getItemDef(stack.item)?.name ?? 'unknown') : '';
      node.title = stack ? itemLabel(stack.item) : '';
      if (!stack) return;
      node.appendChild(createItemIcon(stack.item, this.tiles));
      // Creative blocks are never used up: no numbers there.
      if (stack.count > 1) node.appendChild(element('span', 'slot-count', String(stack.count)));
    });
    // The picked slot may have been emptied by something else.
    if (this.picked !== null && !this.shown[this.picked]) this.setPicked(null);
  }

  private setPicked(index: number | null): void {
    this.picked = index;
    this.slots.forEach((node, i) => node.classList.toggle('picked', i === index));
    this.bin.classList.toggle('ready', index !== null);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.element.classList.toggle('hidden', !visible);
    this.setPicked(null);
  }
}
