import { describe, expect, it } from 'vitest';
import { clamp, floorDiv, lerp, mod, smoothstep } from './math';

describe('math helpers', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
  it('lerps', () => {
    expect(lerp(2, 4, 0.5)).toBe(3);
  });
  it('smoothsteps', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
  });
  it('handles negative modulo and floor division', () => {
    expect(mod(-1, 16)).toBe(15);
    expect(mod(17, 16)).toBe(1);
    expect(floorDiv(-1, 16)).toBe(-1);
    expect(floorDiv(16, 16)).toBe(1);
  });
});
