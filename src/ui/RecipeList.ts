// Recipe list: the "Crafting" tab of the inventory screen. One row per recipe; it only
// reports what was pressed, the game turns that into `craft` actions.
import { getItemDef, itemLabel } from '../items/items';
import { RECIPES, type Recipe, type RecipeStatus, type Station } from '../items/recipes';
import { button, element } from './activate';
import { createItemIcon } from './itemIcon';

export interface RecipeListOptions {
  /** The painted tile images, for the block icons. */
  tiles: Uint8ClampedArray[];
  /** A "Craft" button is pressed down (by mouse or finger); holding repeats. */
  onCraftDown: (recipe: number) => void;
  /** The press ended: released, or taken over by the browser for scrolling. */
  onCraftUp: () => void;
  /** A "Craft" button was activated: a click, a tap or the keyboard. */
  onCraftClick: (recipe: number) => void;
}

const STATION_TEXT: Record<Station, string> = {
  workbench: 'Needs a workbench nearby',
  furnace: 'Needs a furnace nearby',
};
const FULL_TEXT = 'Inventory full';

interface Row {
  recipe: Recipe;
  root: HTMLElement;
  /** Per ingredient: its box and the "have / need" text in it. */
  ingredients: { box: HTMLElement; text: HTMLElement }[];
  craft: HTMLButtonElement;
  note: HTMLElement;
  progress: HTMLElement;
  fill: HTMLElement;
  /** What the row shows now, so that only changes touch the document. */
  shown: string;
}

export class RecipeList {
  readonly element: HTMLElement;
  private readonly rows = new Map<number, Row>();
  private order = '';
  private smelting: number | null = null;
  private pressed = false;

  constructor(parent: HTMLElement, options: RecipeListOptions) {
    this.element = element('div', 'recipe-list');
    this.element.setAttribute('role', 'list');
    for (const recipe of RECIPES) {
      const row = this.createRow(recipe, options);
      this.rows.set(recipe.id, row);
      this.element.appendChild(row.root);
    }
    // The press may end anywhere, also after its row has moved away under the pointer.
    const release = (): void => {
      if (!this.pressed) return;
      this.pressed = false;
      options.onCraftUp();
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', release);
    parent.appendChild(this.element);
  }

  private createRow(recipe: Recipe, options: RecipeListOptions): Row {
    const root = element('div', 'recipe-row');
    root.setAttribute('role', 'listitem');
    root.dataset.recipe = recipe.name;

    const result = element('span', 'recipe-result');
    result.appendChild(createItemIcon(recipe.result.item, options.tiles));
    if (recipe.result.count > 1) {
      result.appendChild(element('span', 'slot-count', String(recipe.result.count)));
    }
    const name = element('span', 'recipe-name', itemLabel(recipe.result.item));

    const list = element('span', 'recipe-ingredients');
    const ingredients = recipe.ingredients.map((ingredient) => {
      const box = element('span', 'recipe-ingredient');
      box.dataset.item = getItemDef(ingredient.item)?.name ?? '';
      box.title = itemLabel(ingredient.item);
      box.appendChild(createItemIcon(ingredient.item, options.tiles));
      const text = element('span', 'recipe-count', '');
      box.appendChild(text);
      list.appendChild(box);
      return { box, text };
    });

    const action = element('span', 'recipe-action');
    const craft = button('menu-button recipe-craft', 'Craft');
    craft.setAttribute('aria-label', `Craft ${itemLabel(recipe.result.item)}`);
    craft.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.pressed = true;
      options.onCraftDown(recipe.id);
    });
    craft.addEventListener('click', () => options.onCraftClick(recipe.id));
    // A long press on a button must not open the browser's menu.
    craft.addEventListener('contextmenu', (e) => e.preventDefault());
    const note = element('span', 'recipe-note', '');
    const progress = element('span', 'recipe-progress');
    const fill = element('span', 'recipe-progress-fill');
    progress.appendChild(fill);
    progress.hidden = true;
    action.append(craft, note, progress);

    root.append(result, name, list, action);
    return { recipe, root, ingredients, craft, note, progress, fill, shown: '' };
  }

  /**
   * Shows the recipes in the given order (craftable ones first) with what the player has
   * of every ingredient.
   */
  update(statuses: readonly RecipeStatus[]): void {
    const order = statuses.map((s) => s.id).join(',');
    for (const status of statuses) {
      const row = this.rows.get(status.id);
      if (!row) continue;
      const shown = JSON.stringify(status);
      if (row.shown !== shown) {
        row.shown = shown;
        this.showStatus(row, status);
      }
      // Appending an element that is in the list already moves it to the end.
      if (order !== this.order) this.element.appendChild(row.root);
    }
    this.order = order;
  }

  private showStatus(row: Row, status: RecipeStatus): void {
    row.root.classList.toggle('craftable', status.craftable);
    row.root.dataset.craftable = String(status.craftable);
    status.ingredients.forEach((ingredient, index) => {
      const { box, text } = row.ingredients[index];
      box.classList.toggle('short', ingredient.have < ingredient.need);
      text.textContent = `${ingredient.have} / ${ingredient.need}`;
    });
    const station = row.recipe.station;
    const note =
      status.stationMissing && station ? STATION_TEXT[station] : status.full ? FULL_TEXT : '';
    row.note.textContent = note;
    row.note.hidden = note === '';
    row.craft.dataset.ready = String(status.craftable);
    this.showAction(row);
  }

  /** Button, or the progress bar while this row's item is in the furnace. */
  private showAction(row: Row): void {
    const smelting = this.smelting === row.recipe.id;
    row.progress.hidden = !smelting;
    row.craft.hidden = smelting || row.craft.dataset.ready !== 'true';
    row.root.classList.toggle('smelting', smelting);
  }

  /** Shows the furnace's progress (0..1) in the row of a recipe; null hides it. */
  setSmelting(recipe: number | null, progress: number): void {
    if (recipe !== this.smelting) {
      const before = this.smelting;
      this.smelting = recipe;
      for (const id of [before, recipe]) {
        const row = id === null ? undefined : this.rows.get(id);
        if (row) this.showAction(row);
      }
    }
    const row = recipe === null ? undefined : this.rows.get(recipe);
    if (!row) return;
    const percent = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
    if (row.fill.style.width !== percent) row.fill.style.width = percent;
  }

  /** Back to the top, as when the tab is opened. */
  scrollToTop(): void {
    this.element.scrollTop = 0;
  }
}
