// Step-1 proof: the built page renders a non-blank WebGL frame headlessly.
import { test, expect } from './fixtures';
import { capture, isNotBlank } from './helpers';

test('renders a non-blank frame', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => {
    const mc = (window as unknown as { __mc?: { isReady(): boolean } }).__mc;
    return mc !== undefined && mc.isReady();
  });
  expect(isNotBlank(await capture(page))).toBe(true);
});
