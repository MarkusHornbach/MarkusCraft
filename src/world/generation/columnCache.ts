// A small direct-mapped cache of one number per world column: bounded, allocation-free.

const EMPTY_KEY = 0x7fffffff;

/**
 * Remembers a value per column (x, z) in `size` slots (a power of two). A column whose slot
 * another column took is simply worked out again: a cache only, it never changes results.
 */
export class ColumnCache {
  private readonly xs: Int32Array;
  private readonly zs: Int32Array;
  private readonly values: Int32Array;
  private readonly mask: number;

  constructor(size: number) {
    this.xs = new Int32Array(size).fill(EMPTY_KEY);
    this.zs = new Int32Array(size);
    this.values = new Int32Array(size);
    this.mask = size - 1;
  }

  private slot(x: number, z: number): number {
    return ((Math.imul(x, 0x9e3779b1) ^ Math.imul(z, 0x85ebca77)) >>> 20) & this.mask;
  }

  /** The value of the column, or `compute(x, z)` stored for later. */
  get(x: number, z: number, compute: (x: number, z: number) => number): number {
    const i = this.slot(x, z);
    if (this.xs[i] === x && this.zs[i] === z) return this.values[i];
    const value = compute(x, z);
    this.xs[i] = x;
    this.zs[i] = z;
    this.values[i] = value;
    return value;
  }
}
