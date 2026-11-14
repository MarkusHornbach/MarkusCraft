// Item icons for the bar and the inventory: a cube for blocks, a painted icon otherwise.
import { getItemDef } from '../items/items';
import { ITEM_ICON_SIZE, paintItemIcon } from '../render/textures/itemIcons';
import { ICON_SIZE, createBlockIcon } from './blockIcon';

/**
 * A canvas showing the item. `tiles` are the painted tile images indexed by tile id. An
 * item this build does not know gives an empty canvas.
 */
export function createItemIcon(item: number, tiles: Uint8ClampedArray[]): HTMLCanvasElement {
  const block = getItemDef(item)?.block ?? null;
  if (block !== null) return createBlockIcon(block, tiles);
  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const pixels = paintItemIcon(item);
  const context = canvas.getContext('2d');
  if (!pixels || !context) return canvas;
  const source = document.createElement('canvas');
  source.width = ITEM_ICON_SIZE;
  source.height = ITEM_ICON_SIZE;
  const sourceContext = source.getContext('2d');
  if (!sourceContext) return canvas;
  const image = sourceContext.createImageData(ITEM_ICON_SIZE, ITEM_ICON_SIZE);
  image.data.set(pixels);
  sourceContext.putImageData(image, 0, 0);
  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, ICON_SIZE, ICON_SIZE);
  return canvas;
}
