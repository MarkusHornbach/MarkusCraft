// Test helper: wall-clock limits are only enforced when the code runs without coverage.
import { expect } from 'vitest';

/**
 * Coverage instrumentation slows hot loops several times over, so a time limit measured
 * under it says nothing about real performance. `vite.config.ts` sets this variable for
 * coverage runs; CI checks the limits in a separate plain `npm test` run.
 */
export const TIMING_ENFORCED = process.env.MC_COVERAGE !== '1';

/** Asserts `ms < limitMs`, except in coverage runs. */
export function expectFasterThan(ms: number, limitMs: number): void {
  if (TIMING_ENFORCED) expect(ms).toBeLessThan(limitMs);
}
