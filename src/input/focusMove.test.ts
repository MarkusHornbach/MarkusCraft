import { describe, expect, it } from 'vitest';
import { type FocusRect, NavRepeat, nearestFocus, nextFocus } from './focusMove';

function rect(left: number, top: number, width: number, height: number): FocusRect {
  return { left, top, right: left + width, bottom: top + height };
}

/** A grid of 40 × 40 cells with a gap of 4, row by row; `skip` leaves cells out. */
function grid(columns: number, rows: number, skip: number[] = []): FocusRect[] {
  const rects: FocusRect[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      if (!skip.includes(r * columns + c)) rects.push(rect(c * 44, r * 44, 40, 40));
    }
  }
  return rects;
}

describe('nextFocus (Phase 5 AC1.7)', () => {
  it('moves to the direct neighbour on a grid', () => {
    const cells = grid(3, 3);
    expect(nextFocus(cells, 4, 'up')).toBe(1);
    expect(nextFocus(cells, 4, 'down')).toBe(7);
    expect(nextFocus(cells, 4, 'left')).toBe(3);
    expect(nextFocus(cells, 4, 'right')).toBe(5);
    expect(nextFocus(cells, 0, 'right')).toBe(1);
    expect(nextFocus(cells, 2, 'down')).toBe(5);
  });

  it('returns −1 at the edges: no wrap-around', () => {
    const cells = grid(3, 3);
    expect(nextFocus(cells, 0, 'up')).toBe(-1);
    expect(nextFocus(cells, 0, 'left')).toBe(-1);
    expect(nextFocus(cells, 8, 'down')).toBe(-1);
    expect(nextFocus(cells, 8, 'right')).toBe(-1);
    expect(nextFocus([rect(0, 0, 10, 10)], 0, 'down')).toBe(-1);
    expect(nextFocus([], 0, 'down')).toBe(-1);
  });

  it('walks a single column', () => {
    const column = [rect(0, 0, 200, 30), rect(0, 40, 200, 30), rect(0, 80, 200, 30)];
    expect(nextFocus(column, 0, 'down')).toBe(1);
    expect(nextFocus(column, 1, 'down')).toBe(2);
    expect(nextFocus(column, 2, 'up')).toBe(1);
    expect(nextFocus(column, 1, 'left')).toBe(-1);
    expect(nextFocus(column, 1, 'right')).toBe(-1);
  });

  it('chooses sensibly between rows of different widths', () => {
    // A wide button above a row of four small ones, and a wide one below them.
    const rects = [
      rect(100, 0, 300, 40),
      rect(0, 60, 100, 30),
      rect(120, 60, 100, 30),
      rect(240, 60, 100, 30),
      rect(360, 60, 100, 30),
      rect(0, 110, 460, 40),
    ];
    // Down from the wide button: the small one nearest its centre.
    expect(nextFocus(rects, 0, 'down')).toBe(3);
    // Up from each small one: the wide button if it lies above, also for the outer ones.
    expect(nextFocus(rects, 3, 'up')).toBe(0);
    expect(nextFocus(rects, 1, 'up')).toBe(0);
    expect(nextFocus(rects, 4, 'down')).toBe(5);
    // Up from the wide one at the bottom: of the four, one of the two nearest its centre.
    expect(nextFocus(rects, 5, 'up')).toBe(2);
    expect(nextFocus(rects, 2, 'right')).toBe(3);
  });

  it('jumps over a gap in a row rather than leaving the row', () => {
    // A 3 × 3 grid without its centre.
    const cells = grid(3, 3, [4]);
    // Index 3 is the middle row's left cell, 4 its right cell.
    expect(nextFocus(cells, 3, 'right')).toBe(4);
    expect(nextFocus(cells, 4, 'left')).toBe(3);
    // Down from the top middle: the bottom middle.
    expect(nextFocus(cells, 1, 'down')).toBe(6);
  });

  it('ignores elements that only lie partly beyond the edge', () => {
    // A tall element next to the current one, its centre level with it.
    const rects = [rect(0, 0, 50, 50), rect(60, -100, 50, 300), rect(0, 60, 50, 50)];
    expect(nextFocus(rects, 0, 'down')).toBe(2);
    expect(nextFocus(rects, 0, 'right')).toBe(1);
  });
});

describe('nearestFocus (Phase 5 AC1.7)', () => {
  it('returns the closest rectangle by its centre', () => {
    const cells = grid(3, 3);
    expect(nearestFocus(cells, { x: 20, y: 20 })).toBe(0);
    expect(nearestFocus(cells, { x: 110, y: 60 })).toBe(5);
    expect(nearestFocus(cells, { x: 1000, y: 1000 })).toBe(8);
    expect(nearestFocus([], { x: 0, y: 0 })).toBe(-1);
  });
});

describe('NavRepeat (Phase 5 AC1.7)', () => {
  it('first move at once, then after 400 ms, then every 120 ms', () => {
    const repeat = new NavRepeat();
    const moves: number[] = [];
    for (let t = 0; t <= 1000; t += 20) {
      if (repeat.update('down', t === 0 ? 0 : 20) !== null) moves.push(t);
    }
    expect(moves).toEqual([0, 400, 520, 640, 760, 880, 1000]);
  });

  it('a change of direction or a release restarts it', () => {
    const repeat = new NavRepeat();
    expect(repeat.update('down', 16)).toBe('down');
    expect(repeat.update('down', 300)).toBeNull();
    expect(repeat.update('right', 16)).toBe('right');
    expect(repeat.update('right', 300)).toBeNull();
    expect(repeat.update('right', 100)).toBe('right');
    expect(repeat.update(null, 16)).toBeNull();
    expect(repeat.update('right', 16)).toBe('right');
    repeat.reset();
    expect(repeat.update('right', 16)).toBe('right');
  });

  it('a long frame does not make up for the moves it skipped', () => {
    const repeat = new NavRepeat();
    repeat.update('up', 0);
    expect(repeat.update('up', 1000)).toBe('up');
    expect(repeat.update('up', 16)).toBeNull();
    expect(repeat.update('up', 110)).toBe('up');
  });
});
