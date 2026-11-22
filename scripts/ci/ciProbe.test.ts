// Throwaway probe of CI 1 scenario S4: a unit test that fails.
import { expect, it } from 'vitest';

it('CI 1 S4: fails on purpose', () => {
  expect(1 + 1).toBe(3);
});
