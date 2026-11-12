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

test('the build references its assets with relative URLs', async ({ request }) => {
  const html = await (await request.get('/')).text();
  const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  const assets = urls.filter((u) => !u.startsWith('data:'));
  expect(assets.length).toBeGreaterThan(0);
  for (const url of assets) expect(url.startsWith('./')).toBe(true);
});
