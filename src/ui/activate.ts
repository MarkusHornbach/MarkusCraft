// Button activation that reports how the button was pressed: by mouse, by finger or by key.

/** How the game is controlled: mouse and keyboard, or the on-screen touch controls. */
export type InputMode = 'mouse' | 'touch';

/**
 * Calls `handler` when the button is activated. `via` tells whether a mouse or a finger
 * did it; null if that is unknown (keyboard). The handler runs inside the user gesture.
 */
export function onActivate(button: HTMLElement, handler: (via: InputMode | null) => void): void {
  // Not every browser reports the pointer type on `click`; remember it from the press.
  let pressedWith = '';
  button.addEventListener('pointerdown', (e) => {
    pressedWith = e.pointerType;
  });
  button.addEventListener('click', (e) => {
    const type = (e as PointerEvent).pointerType || pressedWith;
    pressedWith = '';
    handler(type === 'touch' ? 'touch' : type === 'mouse' ? 'mouse' : null);
  });
}

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(className: string, text: string): HTMLButtonElement {
  const node = element('button', className, text);
  node.type = 'button';
  return node;
}
